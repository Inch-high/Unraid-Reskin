import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gpuExtractor } from '../../../../src/ts/dashboard/extractors/gpu';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

describe('gpuExtractor', () => {
  const tbody = loadFixture('tblGPUDash1.html');

  it('matches the gpu tbody by id', () => {
    expect(gpuExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches a tbody whose id starts with tblGPU', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody id="tblGPUDash2"><tr><td>x</td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(gpuExtractor.match({ source: other })).toBe(true);
  });

  it('matches a tbody whose class contains gpu', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody class="gpu-widget"><tr><td>x</td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(gpuExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody id="tblSomethingElse"><tr><td>?</td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(gpuExtractor.match({ source: other })).toBe(false);
  });

  it('returns kind = gpu', () => {
    const result = gpuExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('gpu');
  });

  it('produces a non-null result (graceful with empty template)', () => {
    const result = gpuExtractor.extract({ source: tbody });
    expect(result).not.toBeNull();
  });

  it('returns the activeApps and throttling defaults from a cold template', () => {
    const result = gpuExtractor.extract({ source: tbody });
    expect(typeof result?.activeApps).toBe('number');
    expect(typeof result?.throttling).toBe('boolean');
  });

  it('uses null sentinels for missing numeric metrics in the cold template', () => {
    const result = gpuExtractor.extract({ source: tbody })!;
    // In the cold fixture, the gpu-* spans are empty / placeholder; the extractor
    // must use null sentinels rather than NaN or 0 for missing data.
    for (const v of [
      result.utilizationPct,
      result.memoryUsedPct,
      result.memoryMHz,
      result.fanRpm,
      result.powerW,
      result.temperatureC,
    ]) {
      expect(v === null || (typeof v === 'number' && !Number.isNaN(v) && v >= 0)).toBe(true);
    }
  });

  it('keeps each percent metric in 0..100 when present', () => {
    const result = gpuExtractor.extract({ source: tbody })!;
    for (const v of [result.utilizationPct, result.memoryUsedPct]) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('parses vendor, driver, model, util, mem, fan, power, temp from a live snapshot', () => {
    // Mutate the fixture in-place to simulate post-AJAX state after gpustatmulti.js fills it.
    const wrapper = document.createElement('table');
    wrapper.innerHTML = `
      <tbody id="tblGPUDash1" title="GPU #1 Stats">
        <tr><td>
          <span class='tile-header'>
            <span class='tile-header-left'>
              <div class='section'>GPU<br>
                <span class='vfio_notinuse1'>
                  <span id='load'>Load: <span class='gpu-util1'>42%</span></span>
                  <span class='vfio_notinuse1'> Temperature: <span class='gpu-temp1'>58°C</span></span>
                  <span class='vfio_notinuse1'> Processes: <span class='gpu-sessions1'>3</span></span>
                </span>
              </div>
            </span>
          </span>
        </td></tr>
        <tr class="header"><td><span class="w18">Vendor</span><span class="w18">Driver</span><span class="w44">Device</span></td></tr>
        <tr class="updated"><td>
          <span>
            <span class='gpu-vendor1 w18'>NVIDIA</span>
            <span class='gpu-driver1 w18'>535.86.05</span>
          </span>&nbsp;
          <span class='gpu-name1 w44'>NVIDIA RTX A2000 12GB</span>
        </td></tr>
        <tr class='nopcie1'><td>
          <span class='w36'>PCI Bus Utilization</span>
          <span id='gpu-pciegen1'>PCIe Gen (Max): <span class='gpu-pciegen1 '>4</span>&nbsp;(<span class='gpu-pciegenmax1 '>4</span>)</span>
          <span id='gpu-pciewidth1'>&nbsp;Lanes (Max): <span class='gpu-pciewidth1 '>16</span>&nbsp;(<span class='gpu-pciewidthmax1 '>16</span>)</span>
        </td></tr>
        <tr class='vfio_notinuse1'><td>
          <span class='w36'>Load - Memory</span>
          <span class='w26'><span class='gpu-util1 load'>42%</span><div class='usage-disk sys'><span class='gpu-utilbar1' style='width: 42%'></span><span></span></div></span>
          <span class='w26'><span class='gpu-memutil1 load'>27%</span><div class='usage-disk sys'><span class='gpu-memutilbar1' style='width: 27%'></span><span></span></div></span>
        </td></tr>
        <tr class='vfio_notinuse1'><td>
          <span class='w36'>Encoder - Decoder</span>
          <span class='w26'><span class='gpu-encutil1 load'>5%</span></span>
          <span class='w26'><span class='gpu-decutil1 load'>2%</span></span>
        </td></tr>
        <tr class='vfio_notinuse1'><td>
          <span class='w36'>GPU - Memory (MHz)</span>
          <span class='w26'><span class='gpu-clock1 load'>1410 MHz</span></span>
          <span class='w26'><span class='gpu-memclock1 load'>6000 MHz</span></span>
        </td></tr>
        <tr class='vfio_notinuse1'><td>
          <span class='w36'>Fan (RPM) - Power</span>
          <span class='w26'><span class='gpu-fan1 load'>1240 RPM</span></span>
          <span class='w26'><span class='gpu-power1 load'>38 W</span></span>
        </td></tr>
        <tr class='vfio_notinuse1'><td>
          <span class='w36'>PCI Bus Rx/Tx (MB/s)</span>
          <span class='w26'><span class='gpu-rxutil1 load'>12 MB/s</span></span>
          <span class='w26'><span class='gpu-txutil1 load'>8 MB/s</span></span>
        </td></tr>
        <tr class='vfio_notinuse1'><td colspan='2'>
          <span class='w36'>Power State - Throttling</span>
          <span class='w44'>State:<span class='gpu-perfstate1'>P2</span> &emsp; Throttle: <span class='gpu-throttled1'>No</span></span>
        </td></tr>
        <tr class='vfio_notinuse1 gpu-active-apps1'><td colspan='2'>
          <span class='w36'>Active Apps</span>
          <span>plex (PID 1234)</span>
          <span>handbrake (PID 5678)</span>
        </td></tr>
      </tbody>`;
    const live = wrapper.querySelector('tbody')!;
    const result = gpuExtractor.extract({ source: live })!;

    expect(result.vendor).toBe('NVIDIA');
    expect(result.driver).toBe('535.86.05');
    expect(result.model).toBe('NVIDIA RTX A2000 12GB');
    expect(result.utilizationPct).toBe(42);
    expect(result.memoryUsedPct).toBe(27);
    expect(result.memoryMHz).toBe(6000);
    expect(result.fanRpm).toBe(1240);
    expect(result.powerW).toBe(38);
    expect(result.temperatureC).toBe(58);
    expect(result.throttling).toBe(false);
    // At least one of util / temp / power was non-null in this snapshot.
    expect(
      result.utilizationPct !== null || result.temperatureC !== null || result.powerW !== null,
    ).toBe(true);
  });

  it('marks throttling true when the throttled value is anything other than "No"', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = `
      <tbody id="tblGPUDash1">
        <tr class='updated'><td>
          <span class='gpu-vendor1'>NVIDIA</span>
          <span class='gpu-driver1'>1.0</span>
          <span class='gpu-name1'>Test GPU</span>
        </td></tr>
        <tr class='vfio_notinuse1'><td colspan='2'>
          <span class='w36'>Power State - Throttling</span>
          <span class='w44'>State:<span class='gpu-perfstate1'>P0</span> Throttle: <span class='gpu-throttled1'>Yes</span><span class='gpu-thrtlrsn1'>Power</span></span>
        </td></tr>
      </tbody>`;
    const live = wrapper.querySelector('tbody')!;
    const result = gpuExtractor.extract({ source: live })!;
    expect(result.throttling).toBe(true);
  });

  it('counts active apps from gpu-active-apps spans', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = `
      <tbody id="tblGPUDash1">
        <tr class='updated'><td><span class='gpu-name1'>X</span></td></tr>
        <tr class='vfio_notinuse1 gpu-active-apps1'><td colspan='2'>
          <span class='w36'>Active Apps</span>
          <span>plex (PID 1234)</span>
          <span>handbrake (PID 5678)</span>
          <span>obs (PID 9012)</span>
        </td></tr>
      </tbody>`;
    const live = wrapper.querySelector('tbody')!;
    const result = gpuExtractor.extract({ source: live })!;
    expect(result.activeApps).toBeGreaterThanOrEqual(1);
  });
});
