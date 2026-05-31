import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMainLive, parseBusy } from '../../../src/ts/main/lifecycle';

// Minimal fake NchanSubscriber that captures the message handler per URL so
// tests can push payloads synchronously.
class FakeNchan {
  static instances: FakeNchan[] = [];
  url: string;
  handler: ((raw: unknown) => void) | null = null;
  started = false;
  constructor(url: string) {
    this.url = url;
    FakeNchan.instances.push(this);
  }
  on(_e: string, fn: (...a: unknown[]) => void) {
    this.handler = fn as (raw: unknown) => void;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
  }
  emit(raw: unknown) {
    this.handler?.(raw);
  }
}

function setHidden(doc: Document, hidden: boolean) {
  Object.defineProperty(doc, 'hidden', { value: hidden, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeNchan.instances = [];
});

describe('parseBusy', () => {
  it('parses 0..3, rejects others', () => {
    expect(parseBusy('0')).toBe(0);
    expect(parseBusy(' 2 ')).toBe(2);
    expect(parseBusy('3')).toBe(3);
    expect(parseBusy('9')).toBeNull();
    expect(parseBusy('x')).toBeNull();
  });
});

describe('createMainLive', () => {
  it('subscribes to every channel and processes messages while visible', () => {
    vi.stubGlobal('NchanSubscriber', FakeNchan as unknown);
    setHidden(document, false);
    const seen: string[] = [];
    const sub = createMainLive({
      resync: () => {},
      channels: [
        { url: '/sub/devices', handle: () => seen.push('dev') },
        { url: '/sub/mymonitor', handle: (r) => seen.push('busy:' + r) },
      ],
    });
    expect(FakeNchan.instances.map((i) => i.url)).toEqual(['/sub/devices', '/sub/mymonitor']);
    expect(FakeNchan.instances.every((i) => i.started)).toBe(true);

    FakeNchan.instances[0].emit('x');
    FakeNchan.instances[1].emit('1');
    expect(seen).toEqual(['dev', 'busy:1']);
    expect(sub.processedSinceVisible).toBe(2);
    sub.stop();
  });

  it('drops messages while hidden', () => {
    vi.stubGlobal('NchanSubscriber', FakeNchan as unknown);
    setHidden(document, true);
    const seen: string[] = [];
    const sub = createMainLive({
      resync: () => {},
      channels: [{ url: '/sub/devices', handle: () => seen.push('x') }],
    });
    FakeNchan.instances[0].emit('msg');
    expect(seen).toEqual([]);
    expect(sub.processedSinceVisible).toBe(0);
    sub.stop();
  });

  it('resyncs once when the tab becomes visible', () => {
    vi.stubGlobal('NchanSubscriber', FakeNchan as unknown);
    setHidden(document, false);
    const resync = vi.fn();
    const sub = createMainLive({ resync, channels: [{ url: '/sub/devices', handle: () => {} }] });
    setHidden(document, false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resync).toHaveBeenCalledTimes(1);
    sub.stop();
  });

  it('no-ops safely when NchanSubscriber is absent', () => {
    vi.stubGlobal('NchanSubscriber', undefined);
    const sub = createMainLive({
      resync: () => {},
      channels: [{ url: '/sub/devices', handle: () => {} }],
    });
    expect(sub.processedSinceVisible).toBe(0);
    sub.stop();
  });
});
