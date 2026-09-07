import { randomBytes, randomUUID } from "node:crypto";
import { createMandatoryInitialState } from "@gettysburg/content";
import {
  COMMAND_SCHEMA_VERSION,
  type GameplayCommandName,
  type Side,
} from "@gettysburg/game";
import { describe, expect, it } from "vitest";
import {
  canonicalHostManagementCommandHash,
  InMemoryGameService,
  type StoredAction,
} from "./game-service.js";
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
      undefined,
      {
        hosts: service.exportSnapshot().hostBindings,
        recoveries: service
          .exportSnapshot()
          .recoveryGrants.map(([, grant]) => grant),
        invitations: service
          .exportSnapshot()
          .invitations.map(([, invitation]) => invitation),
      },
    );
  return { service, created, credentials, act, state, replay, pepper };
}

describe("deterministic mandatory action replay", () => {
  it("validates complete management payloads, hashes, and accepted events", () => {
    const f = fixture();
    f.act("confederate", "surrenderSeat");
    const host = f.service.authenticateHost(
      f.created.credential,
      f.created.gameId,
    );
    const issue = f.service.executeHostCommand(host, {
      command_id: randomUUID(),
      command_name: "issueInvitation",
      payload: { seat: "confederate" },
      schema: COMMAND_SCHEMA_VERSION,
      game_id: f.created.gameId,
      expected_version: f.state().version,
    });
    if (!issue.ok || !issue.invitation) throw new Error("Missing invitation");
    expect(
      f.service.executeHostCommand(host, {
        command_id: randomUUID(),
        command_name: "revokeInvitation",
        payload: { lookup_id: issue.invitation.lookup_id },
        schema: COMMAND_SCHEMA_VERSION,
        game_id: f.created.gameId,
        expected_version: f.state().version,
      }).ok,
    ).toBe(true);
    const actions = f.service.getActions(f.created.gameId);
    expect(f.replay(actions)).toEqual(f.state());
    const wrongSide = structuredClone(actions);
    if (!wrongSide[2]!.result?.ok) throw new Error("Missing revoke result");
    Object.assign(wrongSide[2]!.result.event, {
      summary: "union invitation revoked",
    });
    expect(() => f.replay(wrongSide)).toThrow(/invalid management event/);
    const wrongIssue = structuredClone(actions);
    const reissued = {
      command_id: wrongIssue[1]!.commandId!,
      command_name: "issueInvitation",
      payload: { seat: "union" },
      schema: COMMAND_SCHEMA_VERSION,
      game_id: f.created.gameId,
      expected_version: f.state().version,
    } as const;
    if (!wrongIssue[1]!.result?.ok) throw new Error("Missing issue result");
    Object.assign(wrongIssue[1]!, {
      payload: reissued.payload,
      canonicalRequestHash: canonicalHostManagementCommandHash(reissued),
    });
    Object.assign(wrongIssue[1]!.result.event, {
      summary: "union invitation issued",
    });
    expect(() => f.replay(wrongIssue)).toThrow(/issued invitation evidence/);
    const unavailable = structuredClone(actions);
    const retargeted = {
      command_id: unavailable[2]!.commandId!,
      command_name: "revokeInvitation" as const,
      payload: { lookup_id: f.created.invitation.lookup_id },
      schema: COMMAND_SCHEMA_VERSION,
      game_id: f.created.gameId,
      expected_version: f.state().version,
    } as const;
    Object.assign(unavailable[2]!, {
      payload: retargeted.payload,
      canonicalRequestHash: canonicalHostManagementCommandHash(retargeted),
    });
    expect(() => f.replay(unavailable)).toThrow(/invitation was not available/);
    const snapshot = f.service.exportSnapshot();
    const invitations = snapshot.invitations.map(
      ([, invitation]) => invitation,
    );
    for (const patch of [
      { activeAfterSequence: 3 },
      { revokedAtSequence: 2 },
      { claimedAt: Date.now() },
      { revokedAt: null },
      { expiresAt: 0 },
    ]) {
      const evidence = invitations.map((invitation) =>
        invitation.lookupId === issue.invitation!.lookup_id
          ? { ...invitation, ...patch }
          : invitation,
      );
      expect(() =>
        replayMandatoryActions(
          f.created.gameId,
          actions,
          snapshot.seatBindings,
          undefined,
          { hosts: snapshot.hostBindings, invitations: evidence },
        ),
      ).toThrow(
        "activeAfterSequence" in patch
          ? /issued invitation evidence/
          : /invitation was not available/,
      );
    }
    for (const patch of [
      { commandName: "deleteGame" },
      { payload: null },
      { canonicalRequestHash: "bad hash" },
      { result: null },
      {
        result: {
          ok: true,
          event: { ...issue.event, summary: "Game deleted" },
        },
      },
    ]) {
      const corrupt = structuredClone(actions);
      Object.assign(corrupt[1]!, patch);
      expect(() => f.replay(corrupt)).toThrow(/management/);
    }
  });

  it("requires usable fixed-version operator audit attribution", () => {
    const f = fixture();
    const grant = f.service.issueSeatRecovery(
      f.created.gameId,
      "union",
      "test operator",
    );
    f.service.claimSeatRecovery({
      lookupId: grant.lookup_id,
      secret: grant.secret,
    });
    const action = f.service.getActions(f.created.gameId)[0]!;
    for (const patch of [
      { authorizingId: "  " },
      { authorizingVersion: 2 },
      { payload: {} },
      { result: {} },
    ])
      expect(() => f.replay([{ ...action, ...patch } as StoredAction])).toThrow(
        /invalid audit metadata/,
      );
  });

  it("requires literal gameplay success and exact result envelopes", () => {
    const f = fixture();
    f.act("union", "endPhase");
    for (const ok of ["true", {}, 1, false, null]) {
      const actions = structuredClone(f.service.getActions(f.created.gameId));
      Object.assign(actions[0]!.result!, { ok });
      expect(() => f.replay(actions)).toThrow(/missing accepted result/);
    }
    const actions = structuredClone(f.service.getActions(f.created.gameId));
    Object.assign(actions[0]!.result!, { extra: true });
    expect(() => f.replay(actions)).toThrow(/invalid accepted result/);
  });

  it("ties recovery audit records to their consumed grants and binding rotations", () => {
    const f = fixture();
    const grant = f.service.issueSeatRecovery(
      f.created.gameId,
      "union",
      "test operator",
    );
    f.service.claimSeatRecovery({
      lookupId: grant.lookup_id,
      secret: grant.secret,
    });
    const actions = f.service.getActions(f.created.gameId);
    expect(f.replay(actions)).toEqual(f.state());
    const unrelated = fixture();
    expect(() => unrelated.replay(actions)).toThrow(/recovery audit evidence/);
    const snapshot = f.service.exportSnapshot();
    const recoveries = snapshot.recoveryGrants.map(([, value]) => value);
    const invalidBoundary = snapshot.seatBindings.map((binding) =>
      binding.id === recoveries[0]!.oldBindingId
        ? { ...binding, activeAfterSequence: 99 }
        : binding,
    );
    expect(() =>
      replayMandatoryActions(
        f.created.gameId,
        actions,
        invalidBoundary,
        undefined,
        { hosts: snapshot.hostBindings, invitations: [], recoveries },
      ),
    ).toThrow(/binding chronology unavailable/);
    for (const patch of [
      { auditSequence: 2 },
      { operatorIdentity: "different operator" },
      { newBindingId: randomUUID() },
      { consumedAt: null },
      { revokedAt: 1 },
      { expiresAt: 0 },
      { oldBindingVersion: 9 },
      { targetBindingType: "host", side: null },
    ]) {
      const evidence = structuredClone(recoveries);
      Object.assign(evidence[0]!, patch);
      expect(() =>
        replayMandatoryActions(
          f.created.gameId,
          actions,
          snapshot.seatBindings,
          undefined,
          {
            hosts: snapshot.hostBindings,
            invitations: [],
            recoveries: evidence,
          },
        ),
      ).toThrow(/recovery audit/);
    }
  });

  it("resolves host actions against persisted recovery boundaries", () => {
    const f = fixture();
    f.act("confederate", "surrenderSeat");
    const issue = (credential: string) => {
      const result = f.service.executeHostCommand(
        f.service.authenticateHost(credential, f.created.gameId),
        {
          command_id: randomUUID(),
          command_name: "issueInvitation",
          payload: { seat: "confederate" },
          schema: COMMAND_SCHEMA_VERSION,
          game_id: f.created.gameId,
          expected_version: f.state().version,
        },
      );
      expect(result.ok).toBe(true);
    };
    issue(f.created.credential);
    const grant = f.service.issueHostRecovery(
      f.created.gameId,
      "test operator",
    );
    const replacement = f.service.claimHostRecovery({
      lookupId: grant.lookup_id,
      secret: grant.secret,
    });
    issue(replacement.credential);
    const actions = f.service.getActions(f.created.gameId);
    expect(f.replay(actions)).toEqual(f.state());
    const hosts = f.service.exportSnapshot().hostBindings;
    expect(
      hosts.find((host) => host.id === actions[1]!.authorizingId),
    ).toMatchObject({ activeAfterSequence: 0, inactiveFromSequence: 3 });
    expect(
      hosts.find((host) => host.id === actions[3]!.authorizingId),
    ).toMatchObject({ activeAfterSequence: 3 });
    for (const [target, source] of [
      [1, 3],
      [3, 1],
    ] as const) {
      const corrupt = structuredClone(actions);
      Object.assign(corrupt[target]!, {
        authorizingId: actions[source]!.authorizingId,
        authorizingVersion: actions[source]!.authorizingVersion,
      });
      expect(() => f.replay(corrupt)).toThrow(/binding was not active/);
    }
    const corrupt = structuredClone(actions);
    Object.assign(corrupt[1]!, { authorizingId: randomUUID() });
    expect(() => f.replay(corrupt)).toThrow(/historical host binding/);
    const snapshot = f.service.exportSnapshot();
    expect(() =>
      replayMandatoryActions(
        f.created.gameId,
        actions,
        snapshot.seatBindings,
        undefined,
        { hosts: [...hosts, hosts[0]!], invitations: [] },
      ),
    ).toThrow(/historical host binding/);
    expect(() =>
      replayMandatoryActions(
        f.created.gameId,
        actions,
        snapshot.seatBindings,
        undefined,
        {
          hosts: hosts.map((host) => {
            const unavailable = { ...host };
            Reflect.deleteProperty(unavailable, "activeAfterSequence");
            return unavailable;
          }),
          invitations: [],
        },
      ),
    ).toThrow(/binding chronology unavailable/);
  });

  it("fails closed when deletion has deliberately removed historical bindings", () => {
    const f = fixture();
    f.act("union", "endPhase");
    expect(
      f.service.executeHostCommand(
        f.service.authenticateHost(f.created.credential, f.created.gameId),
        {
          command_id: randomUUID(),
          command_name: "deleteGame",
          payload: { confirm: true },
          schema: COMMAND_SCHEMA_VERSION,
          game_id: f.created.gameId,
          expected_version: f.state().version,
        },
      ).ok,
    ).toBe(true);
    expect(f.service.exportSnapshot().seatBindings).toHaveLength(0);
    expect(() => f.replay()).toThrow(
      /missing or ambiguous historical seat binding/,
    );
  });

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

  it("requires a surrendered seat to retire at the accepted command boundary", () => {
    const f = fixture();
    f.act("union", "surrenderSeat");
    expect(f.replay()).toEqual(f.state());
    const snapshot = f.service.exportSnapshot();
    const actions = f.service.getActions(f.created.gameId);
    for (const retirement of [undefined, 3]) {
      const bindings = structuredClone(snapshot.seatBindings);
      const actor = bindings.find(
        (binding) => binding.id === actions[0]!.authorizingId,
      )!;
      if (retirement === undefined) {
        actor.revokedAt = null;
        Reflect.deleteProperty(actor, "inactiveFromSequence");
      } else actor.inactiveFromSequence = retirement;
      expect(() =>
        replayMandatoryActions(f.created.gameId, actions, bindings),
      ).toThrow(/surrender did not retire its binding/);
    }
  });

  it("retires only invitations outstanding at surrender and replays after restore", () => {
    const f = fixture();
    const issue = () => {
      const result = f.service.executeHostCommand(
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
      if (!result.ok || !result.invitation)
        throw new Error("Missing invitation");
      return result.invitation;
    };
    f.act("union", "surrenderSeat"); // Event 1.
    const claimed = issue(); // Event 2.
    const outstanding = issue(); // Event 3.
    f.credentials.union = f.service.claimInvitation({
      lookupId: claimed.lookup_id,
      secret: claimed.secret,
    }).credential;
    f.act("union", "surrenderSeat"); // Event 4.
    const future = issue(); // Event 5, must not be retired by event 4.
    expect(f.replay()).toEqual(f.state());
    // Exercise the credential-free API evidence projection, not only the helper.
    expect(
      f.service.getReplay(f.created.credential, f.created.gameId).state,
    ).toEqual(f.state());
    const snapshot = f.service.exportSnapshot();
    const invitations = snapshot.invitations.map(([, value]) => value);
    const restored = new InMemoryGameService({ pepper: f.pepper, snapshot });
    expect(
      restored.getReplay(f.created.credential, f.created.gameId).state,
    ).toEqual(f.state());
    expect(
      invitations.find((value) => value.lookupId === claimed.lookup_id),
    ).toMatchObject({ claimedAfterSequence: 3 });
    expect(
      invitations.find((value) => value.lookupId === outstanding.lookup_id),
    ).toMatchObject({ revokedAtSequence: 4 });
    expect(
      invitations.find((value) => value.lookupId === future.lookup_id),
    ).toMatchObject({ revokedAt: null });
    const actions = f.service.getActions(f.created.gameId);
    expect(
      replayMandatoryActions(
        f.created.gameId,
        actions,
        snapshot.seatBindings,
        undefined,
        {
          hosts: snapshot.hostBindings,
          invitations: invitations.map((value) =>
            value.lookupId === outstanding.lookup_id
              ? { ...value, expiresAt: 0 }
              : value,
          ),
        },
      ),
    ).toEqual(f.state());
    for (const patch of [
      { revokedAt: null, revokedAtSequence: undefined },
      { revokedAtSequence: 5 },
      { revokedAt: 0 },
      { claimedAt: Date.now(), claimedAfterSequence: 4 },
      { claimedAt: Date.now(), claimedAfterSequence: undefined },
    ]) {
      expect(() =>
        replayMandatoryActions(
          f.created.gameId,
          actions,
          snapshot.seatBindings,
          undefined,
          {
            hosts: snapshot.hostBindings,
            invitations: invitations.map((value) => {
              const copy = { ...value };
              if (copy.lookupId === outstanding.lookup_id)
                Object.assign(copy, patch);
              return copy;
            }),
          },
        ),
      ).toThrow(
        /invitation.*surrender|surrender did not retire its outstanding invitations/,
      );
    }
  });

  it("rejects mutually consistent invitation evidence for an occupied seat", () => {
    const f = fixture();
    f.act("confederate", "surrenderSeat");
    const command = {
      command_id: randomUUID(),
      command_name: "issueInvitation",
      payload: { seat: "confederate" },
      schema: COMMAND_SCHEMA_VERSION,
      game_id: f.created.gameId,
      expected_version: f.state().version,
    } as const;
    expect(
      f.service.executeHostCommand(
        f.service.authenticateHost(f.created.credential, f.created.gameId),
        command,
      ).ok,
    ).toBe(true);
    const actions = structuredClone(f.service.getActions(f.created.gameId));
    const forged = { ...command, payload: { seat: "union" as const } };
    const action = actions[1]!;
    Object.assign(action, {
      payload: forged.payload,
      canonicalRequestHash: canonicalHostManagementCommandHash(forged),
    });
    if (!action.result?.ok) throw new Error("Missing result");
    Object.assign(action.result.event, { summary: "union invitation issued" });
    const snapshot = f.service.exportSnapshot();
    expect(() =>
      replayMandatoryActions(
        f.created.gameId,
        actions,
        snapshot.seatBindings,
        undefined,
        {
          hosts: snapshot.hostBindings,
          invitations: snapshot.invitations.map(([, value]) =>
            value.activeAfterSequence === 2
              ? { ...value, allowedSeat: "union" as const }
              : value,
          ),
        },
      ),
    ).toThrow(/invitation issued to an occupied seat/);
  });

  it.each(["host", "union", "confederate"] as const)(
    "rejects overlapping %s bindings even when the selected actor is unique",
    (role) => {
      const f = fixture();
      f.act("union", "endPhase");
      const snapshot = f.service.exportSnapshot();
      const hosts = [...snapshot.hostBindings];
      const seats = [...snapshot.seatBindings];
      if (role === "host")
        hosts.push({
          ...snapshot.hostBindings[0]!,
          id: randomUUID(),
        });
      else
        seats.push({
          ...snapshot.seatBindings.find((binding) => binding.side === role)!,
          id: randomUUID(),
        });
      expect(() =>
        replayMandatoryActions(
          f.created.gameId,
          f.service.getActions(f.created.gameId),
          seats,
          undefined,
          { hosts, invitations: [] },
        ),
      ).toThrow(/overlapping .* bindings/);
    },
  );

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
    const snapshot = f.service.exportSnapshot();
    const bindings = snapshot.seatBindings;
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
      replayMandatoryActions(f.created.gameId, input, bindings, undefined, {
        hosts: snapshot.hostBindings,
        invitations: [],
      });
    expect(replay(actions).event_sequence).toBe(1);
    expect(() =>
      replay([{ ...actions[0]!, commandName: "issueInvitation" }]),
    ).toThrow(/invalid management metadata/);
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
    const actions = f.service.getActions(f.created.gameId);
    expect(f.replay(actions)).toEqual(f.state());
    expect(JSON.stringify(f.replay(actions))).not.toContain(recovery.secret);
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
