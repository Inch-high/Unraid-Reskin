import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../../../src/ts/dashboard/store';

describe('dashboard store', () => {
  it('stores widget state under a key', () => {
    const store = createStore();
    store.set('tbody1', { kind: 'unknown', id: 'tbody1', hint: '', innerHTML: '' });
    expect(store.get('tbody1')?.kind).toBe('unknown');
  });

  it('notifies subscribers when state changes', () => {
    const store = createStore();
    const cb = vi.fn();
    store.subscribe(cb);
    store.set('tbody1', { kind: 'unknown', id: 'tbody1', hint: '', innerHTML: '' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('skips notify when set with identical value (cheap dedupe)', () => {
    const store = createStore();
    const cb = vi.fn();
    store.subscribe(cb);
    const v = { kind: 'unknown' as const, id: 'tbody1', hint: '', innerHTML: '<p>x</p>' };
    store.set('tbody1', v);
    store.set('tbody1', { ...v }); // same shape, different reference
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('removes widget on delete and notifies', () => {
    const store = createStore();
    store.set('tbody1', { kind: 'unknown', id: 'tbody1', hint: '', innerHTML: '' });
    const cb = vi.fn();
    store.subscribe(cb);
    store.delete('tbody1');
    expect(store.get('tbody1')).toBeUndefined();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', () => {
    const store = createStore();
    const cb = vi.fn();
    const unsub = store.subscribe(cb);
    unsub();
    store.set('tbody1', { kind: 'unknown', id: 'tbody1', hint: '', innerHTML: '' });
    expect(cb).not.toHaveBeenCalled();
  });
});
