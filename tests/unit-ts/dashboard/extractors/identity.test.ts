import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityExtractor } from '../../../../src/ts/dashboard/extractors/identity';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

function makeTbody(html: string): HTMLTableSectionElement {
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('identityExtractor', () => {
  const tbody = loadFixture('system.html');

  it('matches the identity fixture', () => {
    expect(identityExtractor.match({ source: tbody })).toBe(true);
  });

  it('does not match a generic tbody.system without .tile-select-case', () => {
    const other = makeTbody(
      "<tbody class='system'><tr><td><div class='pie' id='sys0'></div></td></tr></tbody>",
    );
    expect(identityExtractor.match({ source: other })).toBe(false);
  });

  it('does not match a tbody missing the system class', () => {
    const other = makeTbody(
      "<tbody class='other'><tr><td><div class='tile-select-case'></div></td></tr></tbody>",
    );
    expect(identityExtractor.match({ source: other })).toBe(false);
  });

  it('returns kind = identity', () => {
    const result = identityExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('identity');
  });

  it('extracts the server name from h3.tile-header-main', () => {
    const result = identityExtractor.extract({ source: tbody });
    expect(result?.serverName).toBe('HL15Rack');
  });

  it('extracts the description span', () => {
    const result = identityExtractor.extract({ source: tbody });
    expect(result?.description).toBe('Media server');
  });

  it('extracts model = "Custom"', () => {
    const result = identityExtractor.extract({ source: tbody });
    expect(result?.model).toBe('Custom');
  });

  it('extracts registration containing "Unraid OS" and "Pro"', () => {
    const result = identityExtractor.extract({ source: tbody });
    expect(result?.registration).toContain('Unraid OS');
    expect(result?.registration).toContain('Pro');
  });

  it('extracts caseClass from i#mycase', () => {
    const result = identityExtractor.extract({ source: tbody });
    expect(result?.caseClass).toBe('case-45Drives-HL15');
  });

  it('returns an empty uptimeText for the cold fixture', () => {
    const result = identityExtractor.extract({ source: tbody });
    expect(result?.uptimeText).toBe('');
  });

  it('reads injected uptime text', () => {
    const live = loadFixture('system.html');
    const span = live.querySelector('span.uptime')!;
    span.textContent = '3 days, 7 hours';
    const result = identityExtractor.extract({ source: live });
    expect(result?.uptimeText).toBe('3 days, 7 hours');
  });

  it('returns caseClass = null when i#mycase is absent', () => {
    const synthetic = makeTbody(`
      <tbody class='system'>
        <tr><td><div class='section'><h3 class='tile-header-main'>NoCase</h3><span>Test</span></div></td></tr>
        <tr><td>
          <div class='leftside'>
            <span class='header'>Model</span><br>Mini<br>
            <span class='header'>Registration</span><br>Unraid OS <b><em>Basic</em></b><br>
            <span class='header'>Uptime</span><br><span class='uptime'></span>
          </div>
          <div class='rightside'><div class='tile-select-case'></div></div>
        </td></tr>
      </tbody>
    `);
    expect(identityExtractor.match({ source: synthetic })).toBe(true);
    const result = identityExtractor.extract({ source: synthetic });
    expect(result?.caseClass).toBeNull();
    expect(result?.model).toBe('Mini');
    expect(result?.registration).toContain('Basic');
  });
});
