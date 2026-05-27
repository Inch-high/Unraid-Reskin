import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLiveSubscription } from '../../../src/ts/docker/lifecycle';

// Mock the minimal NchanSubscriber surface our code needs.
class MockNchan {
  private handlers: Record<string, ((arg: unknown) => void)[]> = {};
  started = false;
  stopped = false;
  on(event: string, fn: (arg: unknown) => void): void {
    (this.handlers[event] ||= []).push(fn);
  }
  start(): void { this.started = true; }
  stop(): void { this.stopped = true; }
  emit(event: string, arg: unknown): void {
    (this.handlers[event] || []).forEach((h) => h(arg));
  }
}

describe('createLiveSubscription', () => {
  let mock: MockNchan;

  beforeEach(() => {
    mock = new MockNchan();
    (window as any).NchanSubscriber = vi.fn().mockImplementation(() => mock);
    // jsdom defaults to hidden=false
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('subscribes and processes a delta when visible', () => {
    const onDelta = vi.fn();
    createLiveSubscription({
      url: '/sub/dockerload',
      parse: () => ({ name: 'x', cpuPct: 5 }),
      onDelta,
      resync: vi.fn(),
    });
    expect(mock.started).toBe(true);
    mock.emit('message', 'whatever');
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta).toHaveBeenCalledWith({ name: 'x', cpuPct: 5 });
  });

  it('drops messages while document.hidden is true', () => {
    const onDelta = vi.fn();
    const sub = createLiveSubscription({
      url: '/sub/dockerload',
      parse: () => ({ name: 'x', cpuPct: 5 }),
      onDelta,
      resync: vi.fn(),
    });
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    mock.emit('message', 'whatever');
    mock.emit('message', 'whatever');
    mock.emit('message', 'whatever');
    expect(onDelta).toHaveBeenCalledTimes(0);
    expect(sub.processedSinceVisible).toBe(0);
  });

  it('runs resync() on visibilitychange -> visible', async () => {
    const resync = vi.fn().mockResolvedValue(undefined);
    createLiveSubscription({
      url: '/sub/dockerload',
      parse: () => null,
      onDelta: vi.fn(),
      resync,
    });
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it('does NOT call resync when going hidden', () => {
    const resync = vi.fn();
    createLiveSubscription({
      url: '/sub/dockerload',
      parse: () => null,
      onDelta: vi.fn(),
      resync,
    });
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resync).not.toHaveBeenCalled();
  });

  it('returns a no-op subscription when NchanSubscriber is missing', () => {
    delete (window as any).NchanSubscriber;
    const onDelta = vi.fn();
    const sub = createLiveSubscription({
      url: '/sub/dockerload',
      parse: () => ({ name: 'x' }),
      onDelta,
      resync: vi.fn(),
    });
    expect(typeof sub.stop).toBe('function');
    expect(sub.processedSinceVisible).toBe(0);
  });

  it('stop() unsubscribes and removes the visibility listener', () => {
    const resync = vi.fn();
    const sub = createLiveSubscription({
      url: '/sub/dockerload',
      parse: () => null,
      onDelta: vi.fn(),
      resync,
    });
    sub.stop();
    expect(mock.stopped).toBe(true);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resync).not.toHaveBeenCalled();
  });
});
