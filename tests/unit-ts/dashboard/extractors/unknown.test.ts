import { describe, it, expect } from 'vitest';
import { unknownExtractor } from '../../../../src/ts/dashboard/extractors/unknown';

function parseTbody(html: string): HTMLTableSectionElement {
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('unknown extractor', () => {
  it('always matches', () => {
    const tbody = parseTbody('<tbody id="x"><tr><td>hi</td></tr></tbody>');
    expect(unknownExtractor.match({ source: tbody })).toBe(true);
  });

  it('preserves innerHTML verbatim', () => {
    const tbody = parseTbody('<tbody id="x"><tr><td>hi <b>bold</b></td></tr></tbody>');
    const result = unknownExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('unknown');
    expect(result?.innerHTML).toContain('<b>bold</b>');
    expect(result?.id).toBe('x');
  });

  it('derives hint from class when no id', () => {
    const tbody = parseTbody('<tbody class="mywidget custom"><tr><td>x</td></tr></tbody>');
    const result = unknownExtractor.extract({ source: tbody });
    expect(result?.hint).toBe('mywidget');  // first class
  });
});
