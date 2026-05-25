import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motherboardExtractor } from '../../../../src/ts/dashboard/extractors/motherboard';

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

describe('motherboardExtractor', () => {
  const tbody = loadFixture('Motherboard_Information.html');

  it('matches the motherboard fixture', () => {
    expect(motherboardExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches a header-only tbody with h3 text "Motherboard"', () => {
    const other = makeTbody(
      "<tbody><tr><td><h3 class='tile-header-main'>Motherboard</h3></td></tr></tbody>",
    );
    expect(motherboardExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const other = makeTbody(
      "<tbody title='Virtual Information'><tr><td><h3>VIRTUAL</h3></td></tr></tbody>",
    );
    expect(motherboardExtractor.match({ source: other })).toBe(false);
  });

  it('returns kind = motherboard', () => {
    const result = motherboardExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('motherboard');
  });

  it('extracts the three fields exactly from the live capture', () => {
    const result = motherboardExtractor.extract({ source: tbody });
    expect(result?.vendor).toBe('Giga Computing ME03-CE0-000 , Version 01000100');
    expect(result?.biosVendor).toBe('GIGABYTE, Version F12');
    expect(result?.biosDated).toBe('Sun 12 Apr 2026 12:00 AM');
  });

  it('returns empty biosVendor and biosDated when only the vendor line is present', () => {
    const synthetic = makeTbody(`
      <tbody title="Motherboard Information">
        <tr><td><h3 class='tile-header-main'>Motherboard</h3></td></tr>
        <tr><td>Acme Boards Model X</td></tr>
      </tbody>
    `);
    const result = motherboardExtractor.extract({ source: synthetic });
    expect(result?.vendor).toBe('Acme Boards Model X');
    expect(result?.biosVendor).toBe('');
    expect(result?.biosDated).toBe('');
  });

  it('returns empty biosDated when the BIOS-date line is missing', () => {
    const synthetic = makeTbody(`
      <tbody title="Motherboard Information">
        <tr><td><h3 class='tile-header-main'>Motherboard</h3></td></tr>
        <tr><td>
          Vendor One<br>
          Vendor Two
        </td></tr>
      </tbody>
    `);
    const result = motherboardExtractor.extract({ source: synthetic });
    expect(result?.vendor).toBe('Vendor One');
    expect(result?.biosVendor).toBe('Vendor Two');
    expect(result?.biosDated).toBe('');
  });

  it('collapses extra whitespace inside each line', () => {
    const synthetic = makeTbody(`
      <tbody title="Motherboard Information">
        <tr><td><h3 class='tile-header-main'>Motherboard</h3></td></tr>
        <tr><td>
          Vendor    One   Lots   Spaces<br>
          BIOS\t\tVendor   Two<br>
          BIOS dated:    Mon   01   Jan   2026
        </td></tr>
      </tbody>
    `);
    const result = motherboardExtractor.extract({ source: synthetic });
    expect(result?.vendor).toBe('Vendor One Lots Spaces');
    expect(result?.biosVendor).toBe('BIOS Vendor Two');
    expect(result?.biosDated).toBe('Mon 01 Jan 2026');
  });

  it('returns empty strings when the body row is absent', () => {
    const synthetic = makeTbody(
      "<tbody title='Motherboard Information'><tr><td><h3 class='tile-header-main'>Motherboard</h3></td></tr></tbody>",
    );
    const result = motherboardExtractor.extract({ source: synthetic });
    expect(result?.vendor).toBe('');
    expect(result?.biosVendor).toBe('');
    expect(result?.biosDated).toBe('');
  });
});
