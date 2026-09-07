import { randomBytes, randomUUID } from "node:crypto";
import { createMandatoryInitialState } from "@gettysburg/content";
import {
  COMMAND_SCHEMA_VERSION,
  type GameplayCommandName,
  type Side,
} from "@gettysburg/game";
import { describe, expect, it } from "vitest";
import { InMemoryGameService, type StoredAction } from "./game-service.js";
import { ReplayError, replayMandatoryActions } from "./mandatory-replay.js";

function fixture() {
  const pepper = randomBytes(32);
  const original = new InMemoryGameService({ pepper });
  const created = original.createGame("union");
  const guest = original.claimInvitation({
    lookupId: created.invitation.lookup_id,
    secret: created.invitation.secret,
  });
  const snapshot = original.exportSnapshot();
  const service = new InMemoryGameService({
    pepper,
    snapshot: {
      ...snapshot,
      games: snapshot.games.map(([id, record]) => [
        id,
        { ...record, state: createMandatoryInitialState(id) },
      ]),
    },
  });
  const credentials = {
    union: created.credential,
    confederate: guest.credential,
  };
  const state = () => service.getGameState(created.gameId);
  const act = (
    side: Side,
    command_name: GameplayCommandName,
    payload: Record<string, unknown> = {},
  ) => {
    const result = service.executeCommand(
      service.authenticate(credentials[side], created.gameId),
      {
        command_id: randomUUID(),
        command_name,
        payload,
        schema: COMMAND_SCHEMA_VERSION,
        game_id: created.gameId,
        expected_version: state().version,
      },
    );
    expect(result).toMatchObject({ ok: true });
    return result;
  };
  const replay = (actions = service.getActions(created.gameId)) =>
    replayMandatoryActions(
      created.gameId,
      actions,
      service.exportSnapshot().seatBindings,
    );
  return { service, created, credentials, act, state, replay };
}

describe("deterministic mandatory action replay", () => {
  it("enforces persisted activation and retirement boundaries across recovery", () => {
    const f = fixture();
    f.act("union", "moveUnit", { unit_id: "u-devin", destination: "P7" });
    const grant = f.service.issueSeatRecovery(
      f.created.gameId,
      "union",
      "test operator",
    );
    f.credentials.union = f.service.claimSeatRecovery({
      lookupId: grant.lookup_id,
      secret: grant.secret,
    }).credential;
    f.act("union", "moveUnit", { unit_id: "u-devin", destination: "O7" });
    const actions = f.service.getActions(f.created.gameId);
    const bindings = f.service.exportSnapshot().seatBindings;
    expect(f.replay(actions)).toEqual(f.state());
    expect(
      bindings.find((binding) => binding.id === actions[0]!.authorizingId),
    ).toMatchObject({ activeAfterSequence: 0, inactiveFromSequence: 2 });
    expect(
      bindings.find((binding) => binding.id === actions[2]!.authorizingId),
    ).toMatchObject({ activeAfterSequence: 2 });
    for (const [target, source] of [
      [0, 2],
      [2, 0],
    ] as const) {
      const corrupt = structuredClone(actions);
      Object.assign(corrupt[target]!, {
        authorizingId: actions[source]!.authorizingId,
        authorizingVersion: actions[source]!.authorizingVersion,
      });
      expect(() => f.replay(corrupt)).toThrow(
        /binding was not active at this sequence/,
      );
    }
    const unavailable = structuredClone(bindings);
    for (const binding of unavailable)
      Reflect.deleteProperty(binding, "activeAfterSequence");
    expect(() =>
      replayMandatoryActions(f.created.gameId, actions, unavailable),
    ).toThrow(/binding chronology unavailable/);
  });

  it("rejects operator request IDs attached to gameplay", () => {
    const f = fixture();
    f.act("union", "moveUnit", { unit_id: "u-devin", destination: "P7" });
    const actions = f.service.getActions(f.created.gameId);
    expect(() =>
      f.replay([{ ...actions[0]!, operatorRequestId: randomUUID() }]),
    ).toThrow(/gameplay actor is not a seat/);
  });

  it("rejects a replacement action attributed to the surrendered binding", () => {
    const f = fixture();
    f.act("union", "surrenderSeat");
    const issued = f.service.executeHostCommand(
      f.service.authenticateHost(f.created.credential, f.created.gameId),
      {
        command_id: randomUUID(),
        command_name: "issueInvitation",
        payload: { seat: "union" },
        schema: COMMAND_SCHEMA_VERSION,
        game_id: f.created.gameId,
        expected_version: f.state().version,
      },
    );
    if (!issued.ok || !issued.invitation) throw new Error("Missing invitation");
    f.credentials.union = f.service.claimInvitation({
      lookupId: issued.invitation.lookup_id,
      secret: issued.invitation.secret,
    }).credential;
    f.act("union", "moveUnit", { unit_id: "u-devin", destination: "P7" });
    const actions = f.service.getActions(f.created.gameId);
    expect(f.replay(actions)).toEqual(f.state());
    const corrupt = structuredClone(actions);
    Object.assign(corrupt.at(-1)!, {
      authorizingId: actions[0]!.authorizingId,
      authorizingVersion: actions[0]!.authorizingVersion,
    });
    expect(() => f.replay(corrupt)).toThrow(
      /binding was not active at this sequence/,
    );
  });

  it("rejects duplicated operator request IDs across separate recoveries", () => {
    const f = fixture();
    for (let step = 0; step < 2; step++) {
      const grant = f.service.issueSeatRecovery(
        f.created.gameId,
        "union",
        "test operator",
      );
      f.credentials.union = f.service.claimSeatRecovery({
        lookupId: grant.lookup_id,
        secret: grant.secret,
      }).credential;
    }
    const actions = f.service.getActions(f.created.gameId);
    expect(f.replay(actions)).toEqual(f.state());
    expect(() =>
      f.replay([{ ...actions[0]!, operatorRequestId: "invalid" }]),
    ).toThrow(/invalid audit metadata/);
    expect(() =>
      f.replay([
        actions[0]!,
        { ...actions[1]!, operatorRequestId: actions[0]!.operatorRequestId },
      ]),
    ).toThrow(/duplicate operator request identifier/);
  });

  it.each(["moveUnit", "surrenderSeat"] as const)(
    "rejects altered %s summaries",
    (command) => {
      const f = fixture();
      f.act(
        "union",
        command,
        command === "moveUnit" ? { unit_id: "u-devin", destination: "P7" } : {},
      );
      const actions = structuredClone(f.service.getActions(f.created.gameId));
      const result = actions[0]!.result!;
      if (!result.ok) throw new Error("Missing result");
      Object.assign(result.event, {
        summary: "An incorrect action log message",
      });
      expect(() => f.replay(actions)).toThrow(/gameplay summary mismatch/);
    },
  );

  it("validates management IDs and rejects events after terminal deletion", () => {
    const f = fixture();
    const bindings = f.service.exportSnapshot().seatBindings;
    const result = f.service.executeHostCommand(
      f.service.authenticateHost(f.created.credential, f.created.gameId),
      {
        command_id: randomUUID(),
        command_name: "deleteGame",
        payload: { confirm: true },
        schema: COMMAND_SCHEMA_VERSION,
        game_id: f.created.gameId,
        expected_version: 0,
      },
    );
    expect(result.ok).toBe(true);
    const actions = f.service.getActions(f.created.gameId);
    const replay = (input: readonly StoredAction[]) =>
      replayMandatoryActions(f.created.gameId, input, bindings);
    expect(replay(actions).event_sequence).toBe(1);
    expect(() => replay([{ ...actions[0]!, commandId: "invalid" }])).toThrow(
      /invalid management metadata/,
    );
    expect(() =>
      replay([
        { ...actions[0]!, commandId: "11111111-1111-4111-1111-111111111111" },
      ]),
    ).toThrow(/invalid management metadata/);
    expect(() => replay([{ ...actions[0]!, authorizingVersion: 0 }])).toThrow(
      /invalid authorization version/,
    );
    expect(() => replay([...actions, { ...actions[0]!, sequence: 2 }])).toThrow(
      /action after game deletion/,
    );
  });

  it("replays the complete no-contact 24-turn transition sequence", () => {
    const f = fixture();
    expect(f.replay()).toEqual(f.state());
    for (let step = 0; step < 47; step++)
      f.act(f.state().active_side!, "endPhase");
    expect(f.state()).toMatchObject({
      turn: 24,
      phase: "completed",
      version: 47,
    });
    expect(
      replayMandatoryActions(
        f.created.gameId,
        f.service.getActions(f.created.gameId),
        f.service.exportSnapshot().seatBindings,
        f.state(),
      ),
    ).toEqual(f.state());
  });

  it("replays paid movement at prefixes without mutating stored records", () => {
    const f = fixture();
    f.act("union", "moveStack", {
      unit_ids: ["u-reynolds", "u-wadsworth"],
      destination: "E4",
    });
    const first = f.state();
    f.act("union", "moveStack", {
      unit_ids: ["u-reynolds", "u-wadsworth"],
      destination: "F4",
    });
    const actions = f.service.getActions(f.created.gameId);
    const before = structuredClone(actions);
    expect(f.replay(actions.slice(0, 1))).toEqual(first);
    expect(f.replay(actions)).toEqual(f.state());
    expect(actions).toEqual(before);
    expect(() =>
      replayMandatoryActions(
        f.created.gameId,
        actions.slice(0, 1),
        f.service.exportSnapshot().seatBindings,
        f.state(),
      ),
    ).toThrow(/final snapshot mismatch/);
  });

  it("uses recorded automatic dice and verifies their resulting combat state", () => {
    const f = fixture();
    f.act("union", "moveUnit", { unit_id: "u-devin", destination: "S3" });
    f.act("union", "endPhase");
    f.act("confederate", "enterReinforcement", {
      unit_id: "c-heth",
      destination: "S1",
    });
    f.act("confederate", "moveUnit", { unit_id: "c-heth", destination: "S2" });
    f.act("confederate", "endPhase");
    expect(f.state().phase).toBe("combat");
    const actions = f.service.getActions(f.created.gameId);
    for (let run = 0; run < 3; run++)
      expect(f.replay(actions)).toEqual(f.state());
    const invalidId = structuredClone(actions);
    const idResult = invalidId.at(-1)!.result!;
    if (!idResult.ok || !("state" in idResult))
      throw new Error("Missing result");
    const combat = Object.values(idResult.state.combats)[0]!;
    Object.assign(idResult.state, {
      combats: { invalid: { ...combat, id: "invalid" } },
    });
    expect(() => f.replay(invalidId)).toThrow(
      /invalid automatic combat identifier/,
    );
    const replayed = f.replay(actions);
    Object.assign(Object.values(replayed.combats)[0]!.rolls!, { attacker: 0 });
    expect(f.replay(actions)).toEqual(f.state());
    const corrupt = structuredClone(actions);
    const result = corrupt.at(-1)!.result!;
    if (!result.ok || !("state" in result)) throw new Error("Missing result");
    Object.assign(Object.values(result.state.combats)[0]!.rolls!, {
      attacker: 0,
    });
    expect(() => f.replay(corrupt)).toThrow(/recorded command is illegal/);
  });

  it("preserves management/audit sequence gaps without exposing their private payloads", () => {
    const f = fixture();
    f.act("union", "moveStack", {
      unit_ids: ["u-reynolds", "u-wadsworth"],
      destination: "E4",
    });
    const recovery = f.service.issueSeatRecovery(
      f.created.gameId,
      "union",
      "test operator",
    );
    f.credentials.union = f.service.claimSeatRecovery({
      lookupId: recovery.lookup_id,
      secret: recovery.secret,
    }).credential;
    f.act("union", "moveStack", {
      unit_ids: ["u-reynolds", "u-wadsworth"],
      destination: "F4",
    });
    f.act("confederate", "surrenderSeat");
    // Original host binding is independent of the recovered Union seat binding.
    expect(
      f.service.executeHostCommand(
        f.service.authenticateHost(f.created.credential, f.created.gameId),
        {
          command_id: randomUUID(),
          command_name: "issueInvitation",
          payload: { seat: "confederate" },
          schema: COMMAND_SCHEMA_VERSION,
          game_id: f.created.gameId,
          expected_version: f.state().version,
        },
      ),
    ).toMatchObject({ ok: true });
    f.act("union", "endPhase");
    expect(f.state()).toMatchObject({ event_sequence: 6, version: 4 });
    const redacted = f.service
      .getActions(f.created.gameId)
      .map((action) =>
        action.kind === "gameplay"
          ? action
          : { ...action, payload: null, result: null },
      );
    expect(f.replay(redacted)).toEqual(f.state());
    expect(JSON.stringify(f.replay(redacted))).not.toContain(recovery.secret);
  });

  it("matches multiple skirmishes to dice even when jsonb reverses combat keys", () => {
    const f = fixture();
    f.act("union", "moveStack", {
      unit_ids: ["u-buford", "u-gamble"],
      destination: "P3",
    });
    f.act("union", "moveUnit", { unit_id: "u-devin", destination: "S3" });
    f.act("union", "endPhase");
    f.act("confederate", "enterReinforcement", {
      unit_id: "c-heth",
      destination: "S1",
    });
    f.act("confederate", "moveUnit", { unit_id: "c-heth", destination: "S2" });
    f.act("confederate", "enterReinforcement", {
      unit_id: "c-pegram",
      destination: "S1",
    });
    f.act("confederate", "moveUnit", {
      unit_id: "c-pegram",
      destination: "Q3",
    });
    f.act("confederate", "endPhase");
    expect(Object.keys(f.state().combats)).toHaveLength(2);
    const actions = structuredClone(f.service.getActions(f.created.gameId));
    const result = actions.at(-1)!.result!;
    if (!result.ok || !("state" in result)) throw new Error("Missing result");
    Object.assign(result.state, {
      combats: Object.fromEntries(
        Object.entries(result.state.combats).reverse(),
      ),
    });
    expect(f.replay(actions)).toEqual(f.state());
  });

  it("rejects a duplicated command ID and malformed recorded JSON", () => {
    const f = fixture();
    f.act("union", "moveUnit", { unit_id: "u-devin", destination: "P7" });
    f.act("union", "moveUnit", { unit_id: "u-devin", destination: "P8" });
    const actions = f.service.getActions(f.created.gameId);
    expect(() =>
      f.replay([
        actions[0]!,
        { ...actions[1]!, commandId: actions[0]!.commandId },
      ]),
    ).toThrow(/duplicate command identifier/);
    expect(() => f.replay([null as unknown as StoredAction])).toThrow(
      ReplayError,
    );
  });

  it.each([
    ["sequence", (a) => ({ ...a, sequence: 2 })],
    ["rules", (a) => ({ ...a, rulesetVersion: "missing-v99" })],
    ["content", (a) => ({ ...a, contentRevision: "missing-v99" })],
    ["expected version", (a) => ({ ...a, expectedVersion: 7 })],
    ["result version", (a) => ({ ...a, resultingVersion: 7 })],
    ["actor", (a) => ({ ...a, authorizingId: "missing" })],
    ["schema", (a) => ({ ...a, canonicalizationVersion: "missing-v99" })],
    [
      "payload hash",
      (a) => ({ ...a, payload: { unit_id: "u-devin", destination: "R7" } }),
    ],
    ["result", (a) => ({ ...a, result: null })],
  ] satisfies readonly [string, (action: StoredAction) => StoredAction][])(
    "rejects changed %s",
    (_, change) => {
      const f = fixture();
      f.act("union", "moveUnit", { unit_id: "u-devin", destination: "P7" });
      const actions = f.service.getActions(f.created.gameId);
      expect(() => f.replay([change(actions[0]!)])).toThrow(ReplayError);
    },
  );

  it("detects corrupted resulting state rather than using it as the next starting point", () => {
    const f = fixture();
    f.act("union", "moveUnit", { unit_id: "u-devin", destination: "P7" });
    const actions = structuredClone(f.service.getActions(f.created.gameId));
    const result = actions[0]!.result!;
    if (!result.ok || !("state" in result)) throw new Error("Missing result");
    Object.assign(result.state.units["u-devin"]!, { movement_spent: 0 });
    expect(() => f.replay(actions)).toThrow(/resulting state mismatch/);
  });
});
