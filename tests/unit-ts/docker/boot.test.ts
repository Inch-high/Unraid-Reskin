import { describe, it, expect } from 'vitest';
import { isDockerPageEnabled } from '../../../src/ts/docker/boot';

// The transient-empty-snapshot guard that used to live here moved server-side:
// docker-state.php now returns 503 (not 200 + `containers: []`) while the stock
// update_container flow rewrites webui-info docker.json, so resync()'s catch
// keeps current state. See modernui_is_transient_empty in docker-state.php and
// docker-state.test.php. Removing the client heuristic also fixes the inverse
// bug — a genuinely empty server (all containers deleted) now renders the empty
// state instead of being suppressed as "transient".

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
