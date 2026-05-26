import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apcupsdExtractor } from '../../../../src/ts/dashboard/extractors/apcupsd';
import { upsExtractor } from '../../../../src/ts/dashboard/extractors/ups';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): HTMLTableSectionElement {
  const path = join(__dir, '../../../../src/ts/dashboard/extractors/__fixtures__', name);
  const html = readFileSync(path, 'utf8');
  const wrapper = document.createElement('table');
  wrapper.innerHTML = html;
  return wrapper.querySelector('tbody')!;
}

function populate(
  tbody: HTMLTableSectionElement,
  values: {
    model?: string;
    status?: string;
    bcharge?: string;
    loadpct?: string;
    timeleft?: string;
    nompower?: string;
    outputv?: string;
  },
): void {
  if (values.model !== undefined) tbody.querySelector('#ups_model')!.textContent = values.model;
  if (values.status !== undefined) tbody.querySelector('#ups_status')!.textContent = values.status;
  if (values.bcharge !== undefined) tbody.querySelector('#ups_bcharge')!.textContent = values.bcharge;
  if (values.loadpct !== undefined) tbody.querySelector('#ups_loadpct')!.textContent = values.loadpct;
  if (values.timeleft !== undefined) tbody.querySelector('#ups_timeleft')!.textContent = values.timeleft;
  if (values.nompower !== undefined) tbody.querySelector('#ups_nompower')!.textContent = values.nompower;
  if (values.outputv !== undefined) tbody.querySelector('#ups_outputv')!.textContent = values.outputv;
}

describe('apcupsdExtractor', () => {
  it('matches the apcupsd dashboard tile by its ups_status + ups_model span pair', () => {
    const tbody = loadFixture('tbody-apcupsd-dashboard.html');
    expect(apcupsdExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches by title="Power Status" when span ids are absent', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody title="Power Status"><tr><td></td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(apcupsdExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody title="Parity"><tr><td><h3>PARITY</h3></td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(apcupsdExtractor.match({ source: other })).toBe(false);
  });

  it('does not match the NUT UPS tile (so dispatch is unambiguous)', () => {
    const nutTbody = loadFixture('tblUPSNUTDash.html');
    expect(apcupsdExtractor.match({ source: nutTbody })).toBe(false);
  });

  it('and the NUT extractor likewise does not claim the apcupsd tile', () => {
    const apcTbody = loadFixture('tbody-apcupsd-dashboard.html');
    expect(upsExtractor.match({ source: apcTbody })).toBe(false);
  });

  it('returns status=unknown and all numeric fields null for the cold fixture', () => {
    const tbody = loadFixture('tbody-apcupsd-dashboard.html');
    const result = apcupsdExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('ups');
    expect(result?.status).toBe('unknown');
    expect(result?.statusText).toBe('');
    expect(result?.batteryChargePct).toBeNull();
    expect(result?.loadPct).toBeNull();
    expect(result?.loadW).toBeNull();
    expect(result?.runtimeMinutes).toBeNull();
    expect(result?.nominalPowerW).toBeNull();
    expect(result?.nominalVA).toBeNull();
  });

  it('parses a fully populated payload from UPSstatus.php', () => {
    const tbody = loadFixture('tbody-apcupsd-dashboard.html');
    // Cell formats verbatim from emhttp/plugins/dynamix.apcupsd/include/UPSstatus.php
    populate(tbody, {
      model: 'BX1500M',
      status: 'Online',
      bcharge: '100 %',
      loadpct: '54 W (6 %)',
      timeleft: '45 minutes',
      nompower: '900 W',
      outputv: '120 V ~ 60 Hz',
    });
    const result = apcupsdExtractor.extract({ source: tbody });
    expect(result?.statusText).toBe('Online');
    expect(result?.status).toBe('on-line');
    expect(result?.batteryChargePct).toBe(100);
    expect(result?.loadPct).toBe(6);
    expect(result?.loadW).toBe(54);
    expect(result?.runtimeMinutes).toBe(45);
    expect(result?.nominalPowerW).toBe(900);
    expect(result?.nominalVA).toBeNull();
  });

  it('falls back to "X %" load form when nominal power is unset, then synthesizes watts', () => {
    const tbody = loadFixture('tbody-apcupsd-dashboard.html');
    populate(tbody, {
      loadpct: '20 %',
      nompower: '900 W',
    });
    const result = apcupsdExtractor.extract({ source: tbody });
    expect(result?.loadPct).toBe(20);
    expect(result?.nominalPowerW).toBe(900);
    expect(result?.loadW).toBe(180); // 20% of 900 W
  });

  it('returns null loadW when both load % and nominal power are missing', () => {
    const tbody = loadFixture('tbody-apcupsd-dashboard.html');
    const result = apcupsdExtractor.extract({ source: tbody });
    expect(result?.loadPct).toBeNull();
    expect(result?.loadW).toBeNull();
  });

  it('maps apcupsd status texts (post-translation) to the canonical enum', () => {
    const a = loadFixture('tbody-apcupsd-dashboard.html');
    populate(a, { status: 'On battery' });
    expect(apcupsdExtractor.extract({ source: a })?.status).toBe('on-battery');

    const b = loadFixture('tbody-apcupsd-dashboard.html');
    populate(b, { status: 'Low on battery' });
    expect(apcupsdExtractor.extract({ source: b })?.status).toBe('low-battery');

    const c = loadFixture('tbody-apcupsd-dashboard.html');
    populate(c, { status: 'Lost communication' });
    expect(apcupsdExtractor.extract({ source: c })?.status).toBe('unknown');

    const d = loadFixture('tbody-apcupsd-dashboard.html');
    populate(d, { status: 'Online (trim)' });
    expect(apcupsdExtractor.extract({ source: d })?.status).toBe('on-line');
  });

  it('parses runtime "45 minutes" → 45 and tolerates "0 minutes" → 0', () => {
    const a = loadFixture('tbody-apcupsd-dashboard.html');
    populate(a, { timeleft: '45 minutes' });
    expect(apcupsdExtractor.extract({ source: a })?.runtimeMinutes).toBe(45);

    const b = loadFixture('tbody-apcupsd-dashboard.html');
    populate(b, { timeleft: '0 minutes' });
    expect(apcupsdExtractor.extract({ source: b })?.runtimeMinutes).toBe(0);
  });
});
