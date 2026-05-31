import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processorExtractor } from '../../../../src/ts/dashboard/extractors/processor';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('processorExtractor', () => {
  const tbody = loadFixture('Processor_Information.html');

  it('matches the processor tbody by title attribute', () => {
    expect(processorExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches a tbody whose id starts with tblCpu', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody id="tblCpuDash"><tr><td>x</td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(processorExtractor.match({ source: other })).toBe(true);
  });

  it('matches when header text contains PROCESSOR', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML =
      '<tbody><tr><td><h3 class="tile-header-main">Processor</h3></td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(processorExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody id="tblSomethingElse"><tr><td>?</td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(processorExtractor.match({ source: other })).toBe(false);
  });

  it('returns kind = processor', () => {
    const result = processorExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('processor');
  });

  it('extracts a model string ending in MHz', () => {
    const result = processorExtractor.extract({ source: tbody });
    expect(result?.model.length).toBeGreaterThan(0);
    expect(result?.model).toMatch(/MHz/);
  });

  it('parses cores >= 1 from the model string', () => {
    const result = processorExtractor.extract({ source: tbody });
    expect(result?.cores).toBeGreaterThanOrEqual(1);
  });

  it('parses 16 cores from the AMD EPYC 8124P 16-Core model', () => {
    const result = processorExtractor.extract({ source: tbody });
    expect(result?.cores).toBe(16);
  });

  it('extracts at least one coreLoad entry', () => {
    const result = processorExtractor.extract({ source: tbody });
    expect(result?.coreLoads.length ?? 0).toBeGreaterThan(0);
  });

  it('emits separate CoreLoad entries for HT pairs', () => {
    const result = processorExtractor.extract({ source: tbody });
    const indices = (result?.coreLoads ?? []).map((c) => c.index);
    // The fixture is a 16-core / 32-thread CPU; should see 32 entries with both pair members.
    expect(indices).toContain(0);
    expect(indices).toContain(16);
  });

  it('parses threadLabel from the leading w26 span', () => {
    const result = processorExtractor.extract({ source: tbody });
    const labels = (result?.coreLoads ?? []).map((c) => c.threadLabel);
    expect(labels.some((l) => /CPU\s*0\b/.test(l))).toBe(true);
  });

  it('keeps overallLoadPct null or in 0..100', () => {
    const result = processorExtractor.extract({ source: tbody });
    const v = result?.overallLoadPct;
    expect(v === null || (typeof v === 'number' && v >= 0 && v <= 100)).toBe(true);
  });

  it('keeps each per-core loadPct in 0..100', () => {
    const result = processorExtractor.extract({ source: tbody });
    const loads = (result?.coreLoads ?? []).map((c) => c.loadPct);
    expect(loads.every((p) => p >= 0 && p <= 100)).toBe(true);
  });

  it('parses temperatureC when present (null in cold fixture)', () => {
    const result = processorExtractor.extract({ source: tbody });
    // Cold fixture shows "N/A" → null; live data will be a number. Either is acceptable.
    expect(result?.temperatureC === null || typeof result?.temperatureC === 'number').toBe(true);
  });

  it('parses totalPowerW when present (null in cold fixture)', () => {
    const result = processorExtractor.extract({ source: tbody });
    expect(result?.totalPowerW === null || typeof result?.totalPowerW === 'number').toBe(true);
  });

  it('extracts numeric load when fixture contains live values', () => {
    // Mutate the fixture in-place to simulate post-WS state.
    const wrapper = document.createElement('table');
    wrapper.innerHTML = `
      <tbody title="Processor Information">
        <tr><td><h3 class="tile-header-main">Processor</h3>Test CPU 4-Core @ 3000 MHz</td></tr>
        <tr><td><span id="cpu-total-power">Total Power: 42 W</span></td></tr>
        <tr><td><i class="fa fa-thermometer"></i> Temperature: <span id="cpu-temp0">55&deg;C</span></td></tr>
        <tr><td><span class="w26">Overall Load:</span><span class="cpu load resize">37%</span></td></tr>
        <tr class="cpu_open"><td>
          <span class="w26">CPU 0  - HT 4 </span>
          <span class="dashboard w36"><span class="cpu0 load resize">12%</span></span>
          <span class="dashboard w36"><span class="cpu4 load resize">8%</span></span>
        </td></tr>
        <tr class="cpu_open"><td>
          <span class="w26">CPU 1  - HT 5 </span>
          <span class="dashboard w36"><span class="cpu1 load resize">99%</span></span>
          <span class="dashboard w36"><span class="cpu5 load resize">3%</span></span>
        </td></tr>
      </tbody>`;
    const live = wrapper.querySelector('tbody')!;
    const result = processorExtractor.extract({ source: live })!;

    expect(result.cores).toBe(4);
    expect(result.totalPowerW).toBe(42);
    expect(result.temperatureC).toBe(55);
    expect(result.overallLoadPct).toBe(37);
    expect(result.coreLoads.length).toBe(4);
    expect(result.coreLoads.find((c) => c.index === 0)?.loadPct).toBe(12);
    expect(result.coreLoads.find((c) => c.index === 4)?.loadPct).toBe(8);
    expect(result.coreLoads.find((c) => c.index === 1)?.loadPct).toBe(99);
    expect(result.coreLoads.find((c) => c.index === 5)?.loadPct).toBe(3);
  });
});
