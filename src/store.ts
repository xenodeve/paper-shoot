import { useSyncExternalStore } from 'react';

/** A minimal observable store. The game writes at ~15 Hz; React reads with selectors. */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      subs.forEach(f => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    }
  };
}

export type Store<T extends object> = ReturnType<typeof createStore<T>>;

export function useStore<T extends object, U>(store: Store<T>, select: (s: T) => U): U {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback) ? { ...fallback, ...v } : (v as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the game still works, it just forgets */
  }
}
