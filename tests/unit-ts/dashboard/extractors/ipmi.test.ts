import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ipmiExtractor } from '../../../../src/ts/dashboard/extractors/ipmi';

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

describe('ipmiExtractor', () => {
  const tbody = loadFixture('tblIPMIDash.html');

  it('matches the IPMI tbody by id', () => {
    expect(ipmiExtractor.match({ source: tbody })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const other = parseTbody('<tbody id="tblSomethingElse"><tr><td>?</td></tr></tbody>');
    expect(ipmiExtractor.match({ source: other })).toBe(false);
  });

  it('returns kind = ipmi', () => {
    const result = ipmiExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('ipmi');
  });

  it('returns a sensors array (possibly empty when IPMI is not configured)', () => {
    const result = ipmiExtractor.extract({ source: tbody })!;
    expect(Array.isArray(result.sensors)).toBe(true);
  });

  it('returns 0 sensors for the cold fixture where IPMI is not configured', () => {
    const result = ipmiExtractor.extract({ source: tbody })!;
    // The cold fixture has only the title-row and header-row chrome; no data rows.
    expect(result.sensors.length).toBe(0);
  });

  it('parses a live snapshot with temperature, fan, voltage, and other rows', () => {
    const live = parseTbody(`
      <tbody id="tblIPMIDash" title="IPMI">
        <tr>
          <td><span class='tile-header'><div class='section'>IPMI</div></span></td>
        </tr>
        <tr class="header"><td><span class="w18">Status</span><span class="w36">Sensor</span><span class="w36">Reading</span></td></tr>
        <tr>
          <td>
            <span class="w18"><i class="fa fa-circle orb green-orb"></i></span>
            <span class="w36"><span>CPU1 TEMP</span></span>
            <span class="reading"><font color="green">42 degrees C</font></span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="w18"><i class="fa fa-circle orb yellow-orb"></i></span>
            <span class="w36"><span>FAN1</span></span>
            <span class="reading"><font color="yellow">3200 RPM</font></span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="w18"><i class="fa fa-circle orb red-orb"></i></span>
            <span class="w36"><span>CPU VOLTAGE</span></span>
            <span class="reading"><font color="red">1.21 Volts</font></span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="w18"><i class="fa fa-circle orb blue-orb"></i></span>
            <span class="w36"><span>Chassis Intrusion</span></span>
            <span class="reading"><font color="blue">OK</font></span>
          </td>
        </tr>
      </tbody>`);
    const result = ipmiExtractor.extract({ source: live })!;
    expect(result.sensors.length).toBe(4);

    const temp = result.sensors[0];
    expect(temp.name).toBe('CPU1 TEMP');
    expect(temp.reading).toBe('42 degrees C');
    expect(temp.status).toBe('green');
    expect(temp.group).toBe('temperature');

    const fan = result.sensors[1];
    expect(fan.name).toBe('FAN1');
    expect(fan.reading).toBe('3200 RPM');
    expect(fan.status).toBe('yellow');
    expect(fan.group).toBe('fan');

    const volt = result.sensors[2];
    expect(volt.name).toBe('CPU VOLTAGE');
    expect(volt.reading).toBe('1.21 Volts');
    expect(volt.status).toBe('red');
    expect(volt.group).toBe('voltage');

    const other = result.sensors[3];
    expect(other.name).toBe('Chassis Intrusion');
    expect(other.status).toBe('blue');
    expect(other.group).toBe('other');
  });

  it('classifies a sensor name starting with V<digit> as voltage', () => {
    const live = parseTbody(`
      <tbody id="tblIPMIDash">
        <tr class="header"><td><span class="w18">Status</span></td></tr>
        <tr>
          <td>
            <span class="w18"><i class="fa fa-circle orb green-orb"></i></span>
            <span class="w36"><span>V3.3</span></span>
            <span class="reading"><font color="green">3.31 V</font></span>
          </td>
        </tr>
      </tbody>`);
    const result = ipmiExtractor.extract({ source: live })!;
    expect(result.sensors[0].group).toBe('voltage');
  });

  it('classifies a sensor whose reading ends in RPM as fan', () => {
    const live = parseTbody(`
      <tbody id="tblIPMIDash">
        <tr class="header"><td><span class="w18">Status</span></td></tr>
        <tr>
          <td>
            <span class="w18"><i class="fa fa-circle orb green-orb"></i></span>
            <span class="w36"><span>System Cooler</span></span>
            <span class="reading"><font color="green">1500 RPM</font></span>
          </td>
        </tr>
      </tbody>`);
    const result = ipmiExtractor.extract({ source: live })!;
    expect(result.sensors[0].group).toBe('fan');
  });

  it('falls back to grey status when no orb class is recognized', () => {
    const live = parseTbody(`
      <tbody id="tblIPMIDash">
        <tr class="header"><td><span class="w18">Status</span></td></tr>
        <tr>
          <td>
            <span class="w18"><i class="fa fa-circle orb"></i></span>
            <span class="w36"><span>Unknown Sensor</span></span>
            <span class="reading"><font>N/A</font></span>
          </td>
        </tr>
      </tbody>`);
    const result = ipmiExtractor.extract({ source: live })!;
    expect(result.sensors[0].status).toBe('grey');
  });
});
