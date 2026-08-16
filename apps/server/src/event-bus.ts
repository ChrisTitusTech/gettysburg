import type { ManagementEvent } from "@gettysburg/game";

type ManagementEventListener = (event: ManagementEvent) => void;

export class GameEventBus {
  readonly #managementListeners = new Map<
    string,
    Set<ManagementEventListener>
  >();

  publishManagement(gameId: string, event: ManagementEvent): void {
    for (const listener of this.#managementListeners.get(gameId) ?? []) {
      listener(structuredClone(event));
    }
  }

  subscribeManagement(
    gameId: string,
    listener: ManagementEventListener,
  ): () => void {
    const listeners = this.#managementListeners.get(gameId) ?? new Set();
    listeners.add(listener);
    this.#managementListeners.set(gameId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#managementListeners.delete(gameId);
    };
  }
}
