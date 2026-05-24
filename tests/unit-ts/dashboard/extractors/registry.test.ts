import { describe, it, expect } from 'vitest';
import { dispatch, registry } from '../../../../src/ts/dashboard/extractors/index';

function parseTbody(html: string): HTMLTableSectionElement {
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('extractor registry', () => {
  it('includes the unknown extractor as the last entry', () => {
    const last = registry[registry.length - 1];
    expect(last.name).toBe('unknown');
  });

  it('dispatches unknown tbody to the unknown extractor', () => {
    const tbody = parseTbody('<tbody id="abc"><tr><td>?</td></tr></tbody>');
    const result = dispatch({ source: tbody });
    expect(result?.kind).toBe('unknown');
  });
});
