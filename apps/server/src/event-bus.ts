import type { ManagementEvent } from "@gettysburg/game";

type ManagementEventListener = (event: ManagementEvent) => void;

export class GameEventBus {
  readonly #managementListeners = new Map<
    string,
    Set<ManagementEventListener>
  >();

  publishManagement(gameId: string, event: ManagementEvent): void {
    for (const listener of [...(this.#managementListeners.get(gameId) ?? [])]) {
      try {
        listener(structuredClone(event));
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
}
