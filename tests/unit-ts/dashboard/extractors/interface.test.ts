import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { interfaceExtractor } from '../../../../src/ts/dashboard/extractors/interface';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

function parseTbody(html: string): HTMLTableSectionElement {
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('interfaceExtractor', () => {
  const tbody = loadFixture('Interface_Information.html');

  it('matches the live fixture via title attribute', () => {
    expect(interfaceExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches a synthetic tbody that only has select[name=port_select]', () => {
    const other = parseTbody(
      '<tbody><tr><td><select name="port_select"><option value="eth0">eth0</option></select></td></tr></tbody>',
    );
    expect(interfaceExtractor.match({ source: other })).toBe(true);
  });

  it('matches a tbody whose h3 contains "Interface"', () => {
    const other = parseTbody('<tbody><tr><td><h3>Network Interface</h3></td></tr></tbody>');
    expect(interfaceExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const other = parseTbody('<tbody id="tblSomethingElse"><tr><td>?</td></tr></tbody>');
    expect(interfaceExtractor.match({ source: other })).toBe(false);
  });

  it('returns kind = interface', () => {
    const result = interfaceExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('interface');
  });

  it('extracts the four interfaces from the live capture', () => {
    const result = interfaceExtractor.extract({ source: tbody })!;
    expect(result.interfaces.map((i) => i.name)).toEqual(['bond0', 'eth0', 'eth1', 'lo']);
  });

  it('returns empty mainText for cold-state #mainN spans', () => {
    // The captured fixture is pre-JS so every span.w72 is empty.
    const result = interfaceExtractor.extract({ source: tbody })!;
    for (const iface of result.interfaces) {
      expect(iface.mainText).toBe('');
    }
  });

  it('falls back to first option value when no option is selected', () => {
    // The fixture has no <option selected>, so we take the first option's value.
    const result = interfaceExtractor.extract({ source: tbody })!;
    expect(result.selectedName).toBe('bond0');
  });

  it('honours an explicit selected option', () => {
    const other = parseTbody(`
      <tbody title="Interface Information">
        <tr><td>
          <select name="port_select">
            <option value="bond0">bond0</option>
            <option value="eth0" selected>eth0</option>
            <option value="eth1">eth1</option>
          </select>
        </td></tr>
      </tbody>`);
    const result = interfaceExtractor.extract({ source: other })!;
    expect(result.selectedName).toBe('eth0');
  });

  it('reads inbound/outbound placeholder text "---" from the cold fixture', () => {
    const result = interfaceExtractor.extract({ source: tbody })!;
    expect(result.inboundText).toBe('---');
    expect(result.outboundText).toBe('---');
  });

  it('reads injected #inbound and #outbound text after JS fills the spans', () => {
    const inbound = tbody.querySelector('#inbound')!;
    const outbound = tbody.querySelector('#outbound')!;
    inbound.textContent = '237.1 Kbps';
    outbound.textContent = '12.4 Mbps';
    const result = interfaceExtractor.extract({ source: tbody })!;
    expect(result.inboundText).toBe('237.1 Kbps');
    expect(result.outboundText).toBe('12.4 Mbps');
    // Reset for downstream tests.
    inbound.textContent = '---';
    outbound.textContent = '---';
  });

  it('returns empty selectedName when no select is present', () => {
    const other = parseTbody('<tbody title="Interface Information"><tr><td>x</td></tr></tbody>');
    const result = interfaceExtractor.extract({ source: other })!;
    expect(result.selectedName).toBe('');
    expect(result.interfaces).toEqual([]);
  });
});
