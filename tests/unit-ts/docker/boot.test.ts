import { describe, it, expect } from 'vitest';
import { isDockerPageEnabled, isTransientEmptySnapshot } from '../../../src/ts/docker/boot';

// Regression: refreshing /Docker while a container update is in flight rendered
// a blank page. docker-state.php returns `containers: []` (HTTP 200) during the
// window the stock update_container flow rewrites webui-info docker.json, and
// resync() overwrote the populated store + SWR cache with that empty list — so
// the page blanked and stayed blank across refreshes until the update finished.
// isTransientEmptySnapshot() is the guard that makes resync() skip that overwrite.
describe('isTransientEmptySnapshot', () => {
  it('treats an empty snapshot as transient when the store already has rows', () => {
    expect(isTransientEmptySnapshot(0, 43)).toBe(true);
  });

  it('accepts an empty snapshot on first load (store still empty)', () => {
    // A genuinely empty server must still render the empty state, not be skipped.
    expect(isTransientEmptySnapshot(0, 0)).toBe(false);
  });

  it('always accepts a non-empty snapshot', () => {
    expect(isTransientEmptySnapshot(43, 43)).toBe(false);
    expect(isTransientEmptySnapshot(1, 0)).toBe(false);
    expect(isTransientEmptySnapshot(42, 43)).toBe(false); // a real removal, not empty
  });
});

describe('isDockerPageEnabled gate', () => {
  it('defaults ON when the attribute is absent', () => {
    delete document.documentElement.dataset.modernuiDocker;
    expect(isDockerPageEnabled(document)).toBe(true);
  });

  it('returns false only when explicitly "off"', () => {
    document.documentElement.dataset.modernuiDocker = 'off';
    expect(isDockerPageEnabled(document)).toBe(false);
    document.documentElement.dataset.modernuiDocker = 'on';
    expect(isDockerPageEnabled(document)).toBe(true);
    delete document.documentElement.dataset.modernuiDocker;
  });
});
