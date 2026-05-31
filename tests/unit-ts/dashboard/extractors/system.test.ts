import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { systemExtractor } from '../../../../src/ts/dashboard/extractors/system';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('systemExtractor', () => {
  const tbody = loadFixture('Memory_Utilization.html');

  it('matches the memory tbody via .tile-system-memory-charts', () => {
    expect(systemExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches a tbody whose id contains tblSystem', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody id="tblSystem"><tr><td>x</td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(systemExtractor.match({ source: other })).toBe(true);
  });

  it('matches when tbody contains multiple div.pie elements', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = `
      <tbody>
        <tr><td>
          <div class='pie' id='sys0'></div>
          <div class='pie' id='sys1'></div>
        </td></tr>
      </tbody>`;
    const other = wrapper.querySelector('tbody')!;
    expect(systemExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody id="tblSomethingElse"><tr><td>?</td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(systemExtractor.match({ source: other })).toBe(false);
  });

  it('returns kind = system', () => {
    const result = systemExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('system');
  });

  it('extracts at least one pie slice', () => {
    const result = systemExtractor.extract({ source: tbody });
    expect(result?.pies.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('extracts 4 pies from the standard fixture', () => {
    const result = systemExtractor.extract({ source: tbody });
    expect(result?.pies.length).toBe(4);
  });

  it('each pie slice has a non-empty label', () => {
    const result = systemExtractor.extract({ source: tbody });
    for (const p of result?.pies ?? []) {
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it('extracts the expected labels in order', () => {
    const result = systemExtractor.extract({ source: tbody });
    const labels = (result?.pies ?? []).map((p) => p.label);
    expect(labels).toEqual(['RAM usage', 'Boot device', 'Log filesystem', 'Docker vdisk']);
  });

  it('extracts tooltip detail text per slice', () => {
    const result = systemExtractor.extract({ source: tbody });
    const details = (result?.pies ?? []).map((p) => p.detail);
    expect(details[0]).toMatch(/Percent of total used memory/);
    expect(details[1]).toMatch(/boot device/i);
    expect(details[2]).toMatch(/LOG file system/i);
    expect(details[3]).toMatch(/Docker vdisk/i);
  });

  it('keeps each percentUsed in 0..100', () => {
    const result = systemExtractor.extract({ source: tbody });
    for (const p of result?.pies ?? []) {
      expect(p.percentUsed).toBeGreaterThanOrEqual(0);
      expect(p.percentUsed).toBeLessThanOrEqual(100);
    }
  });

  it('parses numeric percentUsed when fixture has live values', () => {
    // Mutate the fixture to simulate post-WS state where sysN spans get text.
    const wrapper = document.createElement('table');
    wrapper.innerHTML = `
      <tbody title="Memory Utilization">
        <tr><td>
          <div class='tile-system-memory-charts'>
            <span>
              <a class='info hand none'>RAM usage<span>Percent of total used memory (62.6 GiB)</span></a>
              <div class='pie' id='sys0'><span class='sys0'>42%</span><span class='var0'>26.3 GiB</span></div>
            </span>
            <span>
              <a class='info hand none'>Boot device<span>Percent usage of boot device (60 GiB)</span></a>
              <div class='pie' id='sys1'><span class='sys1'>7.5%</span><span class='var1'>4.5 GiB</span></div>
            </span>
            <span>
              <a class='info hand none'>Log filesystem<span>Percent usage of LOG file system (128 MiB)</span></a>
              <div class='pie' id='sys2'><span class='sys2'>3%</span><span class='var2'>3.8 MiB</span></div>
            </span>
            <span>
              <a class='info hand none'>Docker vdisk<span>Percent usage of Docker vdisk (200 GiB)</span></a>
              <div class='pie' id='sys3'><span class='sys3'>88%</span><span class='var3'>176 GiB</span></div>
            </span>
          </div>
        </td></tr>
      </tbody>`;
    const live = wrapper.querySelector('tbody')!;
    const result = systemExtractor.extract({ source: live })!;
    expect(result.pies.length).toBe(4);
    expect(result.pies[0].percentUsed).toBe(42);
    expect(result.pies[1].percentUsed).toBeCloseTo(7.5);
    expect(result.pies[2].percentUsed).toBe(3);
    expect(result.pies[3].percentUsed).toBe(88);
    expect(result.pies[0].label).toBe('RAM usage');
    expect(result.pies[0].detail).toBe('Percent of total used memory (62.6 GiB)');
  });

  it("extracts the human-readable used amount from each pie's var span", () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = `
      <tbody title="Memory Utilization">
        <tr><td><div class='tile-system-memory-charts'>
          <span>
            <a class='info'>RAM usage<span>Percent of total used memory (126 GiB)</span></a>
            <div class='pie' id='sys0'><span class='sys0'>27%</span><span class='var0'>34.1 GiB</span></div>
          </span>
          <span>
            <a class='info'>Docker vdisk<span>Percent usage of Docker vdisk (200 GiB)</span></a>
            <div class='pie' id='sys3'><span class='sys3'>24%</span><span class='var3'>45.8 GiB</span></div>
          </span>
        </div></td></tr>
      </tbody>`;
    const live = wrapper.querySelector('tbody')!;
    const result = systemExtractor.extract({ source: live })!;
    expect(result.pies[0].used).toBe('34.1 GiB');
    expect(result.pies[1].used).toBe('45.8 GiB');
  });

  it("parses the total size from each pie's tooltip detail string", () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = `
      <tbody title="Memory Utilization">
        <tr><td><div class='tile-system-memory-charts'>
          <span>
            <a class='info'>RAM usage<span>Percent of total used memory (126 GiB)</span></a>
            <div class='pie' id='sys0'><span class='sys0'>27%</span><span class='var0'>34.1 GiB</span></div>
          </span>
          <span>
            <a class='info'>Boot device<span>Percent usage of boot device (60 GiB)</span></a>
            <div class='pie' id='sys1'><span class='sys1'>5%</span><span class='var1'>2.51 GiB</span></div>
          </span>
          <span>
            <a class='info'>Log filesystem<span>Percent usage of LOG file system (128 MiB)</span></a>
            <div class='pie' id='sys2'><span class='sys2'>5%</span><span class='var2'>5.70 MiB</span></div>
          </span>
          <span>
            <a class='info'>Docker vdisk<span>Percent usage of Docker vdisk (200 GiB)</span></a>
            <div class='pie' id='sys3'><span class='sys3'>24%</span><span class='var3'>45.8 GiB</span></div>
          </span>
        </div></td></tr>
      </tbody>`;
    const live = wrapper.querySelector('tbody')!;
    const result = systemExtractor.extract({ source: live })!;
    expect(result.pies.map((p) => p.total)).toEqual(['126 GiB', '60 GiB', '128 MiB', '200 GiB']);
  });

  it('leaves used and total empty when the live values are missing (cold fixture)', () => {
    const result = systemExtractor.extract({ source: tbody })!;
    for (const p of result.pies) {
      expect(p.used).toBe('');
      // The fixture\'s tooltips still have parenthesised totals, so total stays populated.
      expect(p.total.length).toBeGreaterThan(0);
    }
  });
});
