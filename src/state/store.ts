// Tiny event-emitter store. Single source of truth for application state.
// Used so UI components, the scene bridge, and persistence all derive from
// one mutable surface. Avoids window.dispatchEvent spaghetti at Phase 6+.

export type Listener<T> = (state: T, previous: T) => void;
export type Updater<T> = (previous: T) => T;

export interface Store<T> {
  get: () => T;
  set: (updater: Updater<T>) => void;
  subscribe: (listener: Listener<T>) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => state,
    set(updater) {
      const previous = state;
      const next = updater(previous);
      if (Object.is(next, previous)) return; // no-op writes don't fire
      state = next;
      // Snapshot before iterating in case a listener unsubscribes mid-flight.
      for (const listener of [...listeners]) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
