import type { WidgetState } from './types';

export interface DashboardStore {
  get(id: string): WidgetState | undefined;
  set(id: string, value: WidgetState): void;
  delete(id: string): void;
  keys(): IterableIterator<string>;
  subscribe(callback: () => void): () => void;
}

// Shallow JSON-compare for dedupe. Widget state is small and serializable.
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createStore(): DashboardStore {
  const data = new Map<string, WidgetState>();
  const subscribers = new Set<() => void>();

  const notify = () => {
    for (const cb of subscribers) cb();
  };

  return {
    get: (id) => data.get(id),
    set: (id, value) => {
      const prev = data.get(id);
      if (prev !== undefined && shallowEqual(prev, value)) return;
      data.set(id, value);
      notify();
    },
    delete: (id) => {
      if (!data.has(id)) return;
      data.delete(id);
      notify();
    },
    keys: () => data.keys(),
    subscribe: (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb) as unknown as undefined;
    },
  };
}
