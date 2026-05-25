import registry from './plugin-registry.json';

export interface PluginEntry {
  name: string;
  selector: string;
  slot?: string;
  label?: string;
  icon?: string;
}

export interface PluginRegistry {
  bottom: PluginEntry[];
  topbar: PluginEntry[];
}

export const REGISTRY: PluginRegistry = registry as PluginRegistry;

export function matchPlugin(node: Element, entries: PluginEntry[]): PluginEntry | null {
  for (const entry of entries) {
    try {
      if (node.matches(entry.selector)) return entry;
      if (node.querySelector(entry.selector)) return entry;
    } catch {
      // Invalid selector — skip
    }
  }
  return null;
}

export interface MirrorOptions {
  source: Element | null;
  registry: PluginEntry[];
  onUpdate: (entries: Array<{ entry: PluginEntry | null; node: Element }>) => void;
  debounceMs?: number;
}

export function startMirror(opts: MirrorOptions): () => void {
  const { source, registry: entries, onUpdate, debounceMs = 50 } = opts;
  if (!source) return () => undefined;

  let pending: number | null = null;
  const schedule = (): void => {
    if (pending !== null) return;
    pending = window.setTimeout(() => {
      pending = null;
      const children = Array.from(source.children);
      const mapped = children.map((node) => ({ entry: matchPlugin(node, entries), node }));
      onUpdate(mapped);
    }, debounceMs);
  };

  schedule(); // initial sync
  const observer = new MutationObserver(schedule);
  observer.observe(source, { childList: true, subtree: true, characterData: true });

  return () => {
    observer.disconnect();
    if (pending !== null) window.clearTimeout(pending);
  };
}
