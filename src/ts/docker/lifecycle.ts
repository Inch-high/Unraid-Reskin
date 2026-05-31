// Visibility-aware nchan subscription wrapper.
//
// The bug from unraid/webgui#2641 we explicitly avoid: polling kept running
// while the tab was hidden. Here, every subscription routes through
// createLiveSubscription() which:
//
//   • pauses message processing on `document.hidden` (socket stays open —
//     reconnect cost is higher than holding a websocket idle)
//   • on `visibilitychange` -> visible, runs the supplied resync() once so we
//     re-fetch any state that drifted while we were not listening, then
//     resumes processing live deltas
//   • exposes a counter (.processedSinceVisible) so tests can assert no
//     messages were processed during a hidden interval

import type { DockerDelta } from './types';

// Browsers expose nchan via the global NchanSubscriber loaded by Unraid's
// chrome (it's a small jQuery plugin). We model the minimal surface we use.
interface NchanSubscriberLike {
  on(event: 'message' | 'error' | 'connect' | 'disconnect', fn: (...args: unknown[]) => void): void;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    NchanSubscriber?: new (url: string, opts?: Record<string, unknown>) => NchanSubscriberLike;
  }
}

export interface LiveSubscription {
  stop(): void;
  /** Test hook: number of messages processed since the last visibility flip. */
  readonly processedSinceVisible: number;
}

export interface LiveSubscriptionOptions {
  url: string;
  /**
   * Parse one nchan payload into zero or more deltas. The /sub/dockerload
   * message is multi-line (one container per line), so a single payload
   * often yields N deltas — hence the array return.
   */
  parse: (raw: string) => DockerDelta[];
  onDelta: (d: DockerDelta) => void;
  /** Called once each time the tab becomes visible after being hidden. */
  resync: () => Promise<void> | void;
  /** Optional document override for tests. */
  doc?: Document;
}

export function createLiveSubscription(opts: LiveSubscriptionOptions): LiveSubscription {
  const doc = opts.doc ?? document;
  const NchanCtor = (window as Window).NchanSubscriber;

  // If nchan isn't loaded (unusual — Unraid ships it), no-op safely.
  if (!NchanCtor) {
    return { stop: () => undefined, processedSinceVisible: 0 };
  }

  const sub = new NchanCtor(opts.url, { subscriber: 'websocket' });
  let processed = 0;

  const handleMessage = (raw: unknown): void => {
    if (doc.hidden) return; // drop silently while hidden
    if (typeof raw !== 'string') return;
    const deltas = opts.parse(raw);
    if (!deltas || deltas.length === 0) return;
    for (const d of deltas) {
      processed++;
      opts.onDelta(d);
    }
  };
  sub.on('message', handleMessage as (...a: unknown[]) => void);

  const onVisibility = (): void => {
    if (doc.hidden) {
      processed = 0; // reset for next visible window
      return;
    }
    // Tab just became visible — resync to recover any state we dropped.
    Promise.resolve(opts.resync()).catch(() => undefined);
  };
  doc.addEventListener('visibilitychange', onVisibility);

  sub.start();

  return {
    stop() {
      sub.stop();
      doc.removeEventListener('visibilitychange', onVisibility);
    },
    get processedSinceVisible() {
      return processed;
    },
  };
}
