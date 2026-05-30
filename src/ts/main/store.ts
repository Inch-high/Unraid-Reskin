import type { MainPageState } from './types';

// Reactive store for the /Main page. Single source of truth; components
// subscribe and re-render on change. Same shape/idiom as the docker store
// (src/ts/docker/store.ts) but much simpler — one page state, a loading flag,
// and a `busy` field fed live from /sub/mymonitor (Task 10).

type Listener = () => void;

export interface MainStore {
  getState(): MainPageState | null;
  /** True until the first setState() resolves — lets the page show a skeleton. */
  isLoading(): boolean;
  /** Live array-busy signal from /sub/mymonitor: 0 idle, 1 parity, 2 mover, 3 btrfs. */
  getBusy(): 0 | 1 | 2 | 3;

  setState(state: MainPageState): void;
  /** Live update of operation.busy without replacing the whole snapshot. */
  setBusy(busy: 0 | 1 | 2 | 3): void;

  subscribe(fn: Listener): () => void;
}

export function createMainStore(): MainStore {
  let state: MainPageState | null = null;
  let loading = true;
  let busy: 0 | 1 | 2 | 3 = 0;
  const listeners = new Set<Listener>();

  const notify = (): void => {
    for (const l of listeners) l();
  };

  return {
    getState: () => state,
    isLoading: () => loading,
    getBusy: () => busy,

    setState(next) {
      state = next;
      loading = false;
      // Keep the live busy signal authoritative over the snapshot's default 0.
      if (state.operation) state.operation.busy = busy;
      notify();
    },

    setBusy(next) {
      if (busy === next) return;
      busy = next;
      if (state?.operation) {
        state = { ...state, operation: { ...state.operation, busy } };
      }
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn) as unknown as void;
    },
  };
}
