// Test setup: guarantee a working in-memory localStorage / sessionStorage.
//
// Why this exists: jsdom provides Web Storage, but on Node >= 22 the runtime
// ships its own experimental global `localStorage` that is inert unless
// `--localstorage-file` is passed. That native global occupies the slot and
// shadows jsdom's working implementation, so `localStorage.getItem` is
// undefined and storage-backed tests fail. CI runs Node 20 (no native storage),
// which is why this only bites on newer local toolchains (e.g. Homebrew Node 26).
//
// To stay portable across Node 20 (CI) and whatever a dev box happens to run, we
// install a minimal Storage polyfill whenever the live one is missing/broken.
// In-memory (not file-backed) so each run starts clean; tests still clear it in
// their own beforeEach hooks.

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function isUsable(s: unknown): s is Storage {
  return !!s && typeof (s as Storage).getItem === 'function';
}

function ensureStorage(name: 'localStorage' | 'sessionStorage'): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (isUsable(g[name])) return;
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  });
  // jsdom makes `window === globalThis`, but define on window too in case a
  // future env separates them, so `window.localStorage` resolves identically.
  if (typeof window !== 'undefined' && window !== (globalThis as unknown)) {
    Object.defineProperty(window, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');
