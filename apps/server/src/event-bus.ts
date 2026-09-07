import type { AuditEvent, ManagementEvent, Side } from "@gettysburg/game";

type ManagementEventListener = (
  event: ManagementEvent,
  revokedSpectatorBindingId?: string,
) => void;
export interface AuditNotification {
  readonly event: AuditEvent;
  readonly revokedSeat?: Side;
}
type AuditEventListener = (notification: AuditNotification) => void;

export class GameEventBus {
  readonly #auditListeners = new Map<string, Set<AuditEventListener>>();
  readonly #managementListeners = new Map<
    string,
    Set<ManagementEventListener>
  >();

  publishAudit(gameId: string, notification: AuditNotification): void {
    for (const listener of [...(this.#auditListeners.get(gameId) ?? [])]) {
      try {
        listener(structuredClone(notification));
      } catch (error) {
        console.error("Audit event listener failed.", { error, gameId });
      }
    }
  }

  publishManagement(
    gameId: string,
    event: ManagementEvent,
    revokedSpectatorBindingId?: string,
  ): void {
    for (const listener of [...(this.#managementListeners.get(gameId) ?? [])]) {
      try {
        if (revokedSpectatorBindingId === undefined)
          listener(structuredClone(event));
        else listener(structuredClone(event), revokedSpectatorBindingId);
      } catch (error) {
        console.error("Management event listener failed.", { error, gameId });
      }
    }
  }

  subscribeManagement(
    gameId: string,
    listener: ManagementEventListener,
  ): () => void {
    const listeners = this.#managementListeners.get(gameId) ?? new Set();
    listeners.add(listener);
    this.#managementListeners.set(gameId, listeners);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      listeners.delete(listener);
      if (
        listeners.size === 0 &&
        this.#managementListeners.get(gameId) === listeners
      ) {
        this.#managementListeners.delete(gameId);
      }
    };
  }

  subscribeAudit(gameId: string, listener: AuditEventListener): () => void {
    const listeners = this.#auditListeners.get(gameId) ?? new Set();
    listeners.add(listener);
    this.#auditListeners.set(gameId, listeners);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      listeners.delete(listener);
      if (
        listeners.size === 0 &&
        this.#auditListeners.get(gameId) === listeners
      ) {
        this.#auditListeners.delete(gameId);
      }
    };
  }
}
