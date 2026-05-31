export interface SourceObserver {
  start(): void;
  stop(): void;
}

// Watches a <table.dashboard> for subtree changes and calls onChange at most once
// per debounceMs window (trailing edge).
export function createSourceObserver(
  source: Element,
  onChange: () => void,
  debounceMs = 50,
): SourceObserver {
  let timer: number | null = null;
  let observer: MutationObserver | null = null;

  const schedule = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };

  return {
    start: () => {
      if (observer) return;
      observer = new MutationObserver(schedule);
      observer.observe(source, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    },
    stop: () => {
      observer?.disconnect();
      observer = null;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    },
  };
}
