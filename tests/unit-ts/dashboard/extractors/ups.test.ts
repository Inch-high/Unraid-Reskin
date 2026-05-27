import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    status?: string;
    bcharge?: string;
    loadpct?: string;
    timeleft?: string;
    nompower?: string;
  },
): void {
  if (values.status !== undefined) {
    tbody.querySelector('.nut_status')!.textContent = values.status;
  }
  if (values.bcharge !== undefined) {
    tbody.querySelector('.nut_bcharge')!.innerHTML = values.bcharge;
  }
  if (values.loadpct !== undefined) {
    tbody.querySelector('.nut_loadpct')!.innerHTML = values.loadpct;
  }
  if (values.timeleft !== undefined) {
    tbody.querySelector('.nut_timeleft')!.innerHTML = values.timeleft;
  }
  if (values.nompower !== undefined) {
    tbody.querySelector('.nut_nompower')!.innerHTML = values.nompower;
  }
}

describe('upsExtractor', () => {
  it('matches the UPS tbody by id', () => {
    const tbody = loadFixture('tblUPSNUTDash.html');
    expect(upsExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches by title containing UPS', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody title="UPS(NUT)"><tr><td></td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(upsExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const wrapper = document.createElement('table');
    wrapper.innerHTML = '<tbody title="Parity"><tr><td><h3>PARITY</h3></td></tr></tbody>';
    const other = wrapper.querySelector('tbody')!;
    expect(upsExtractor.match({ source: other })).toBe(false);
  });

  it('returns status=unknown and all numeric fields null for the cold fixture', () => {
    const tbody = loadFixture('tblUPSNUTDash.html');
    const result = upsExtractor.extract({ source: tbody });
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

  it('parses a fully populated UPS payload', () => {
    const tbody = loadFixture('tblUPSNUTDash.html');
    populate(tbody, {
      status: 'ONLINE',
      bcharge: '100 %',
      loadpct: '20 %',
      timeleft: '00:48:55',
      nompower: '1500 W (1500 VA)',
    });
    const result = upsExtractor.extract({ source: tbody });
    expect(result?.statusText).toBe('ONLINE');
    expect(result?.status).toBe('on-line');
    expect(result?.batteryChargePct).toBe(100);
    expect(result?.loadPct).toBe(20);
    expect(result?.nominalPowerW).toBe(1500);
    expect(result?.nominalVA).toBe(1500);
    expect(result?.loadW).toBe(300); // 20% of 1500 W
    expect(result?.runtimeMinutes).toBe(49);
  });

  it('recognizes "ON LINE" with a space as on-line', () => {
    const tbody = loadFixture('tblUPSNUTDash.html');
    populate(tbody, { status: 'ON LINE' });
    expect(upsExtractor.extract({ source: tbody })?.status).toBe('on-line');
  });

  it('recognizes the on-battery status', () => {
    const tbody = loadFixture('tblUPSNUTDash.html');
    populate(tbody, { status: 'ON BATTERY' });
    expect(upsExtractor.extract({ source: tbody })?.status).toBe('on-battery');
  });

  it('recognizes low-battery and replace-battery statuses', () => {
    const lowTbody = loadFixture('tblUPSNUTDash.html');
    populate(lowTbody, { status: 'LOW BATTERY' });
    expect(upsExtractor.extract({ source: lowTbody })?.status).toBe('low-battery');

    const replaceTbody = loadFixture('tblUPSNUTDash.html');
    populate(replaceTbody, { status: 'REPLACE BATTERY' });
    expect(upsExtractor.extract({ source: replaceTbody })?.status).toBe('replace-battery');
  });

  it('parses runtime variations correctly', () => {
    const a = loadFixture('tblUPSNUTDash.html');
    populate(a, { timeleft: '00:48:55' });
    expect(upsExtractor.extract({ source: a })?.runtimeMinutes).toBe(49);

    const b = loadFixture('tblUPSNUTDash.html');
    populate(b, { timeleft: '02:00:00' });
    expect(upsExtractor.extract({ source: b })?.runtimeMinutes).toBe(120);

    const c = loadFixture('tblUPSNUTDash.html');
    populate(c, { timeleft: '30:00' });
    expect(upsExtractor.extract({ source: c })?.runtimeMinutes).toBe(30);
  });

  it('returns null loadW when only one of loadPct or nominalPowerW is present', () => {
    const tbody = loadFixture('tblUPSNUTDash.html');
    populate(tbody, { loadpct: '20 %' });
    const result = upsExtractor.extract({ source: tbody });
    expect(result?.loadPct).toBe(20);
    expect(result?.nominalPowerW).toBeNull();
    expect(result?.loadW).toBeNull();
  });

  describe('Unraid 7.3 footer override', () => {
    // The legacy UPS tbody stops receiving live updates in 7.3 — the new
    // <footer> .footer-right chrome carries the live wattage and battery
    // percentage instead. The extractor must prefer footer values when they
    // exist, so the Power hero card doesn't get stuck reporting a stale
    // load% × nominal product (e.g. "300W" forever on a 300W UPS).

    function setupFooter(text: string): HTMLElement {
      const footer = document.createElement('footer');
      footer.innerHTML = `<div class="footer-right">${text}</div>`;
      document.body.appendChild(footer);
      return footer;
    }

    function teardownFooter(footer: HTMLElement | null): void {
      footer?.remove();
    }

    it('prefers footer watts over tbody-computed loadW', () => {
      const tbody = loadFixture('tblUPSNUTDash.html');
      // Tbody says 20% × 1500W = 300W. Footer says 187W live. Footer wins.
      populate(tbody, { loadpct: '20 %', nompower: '1500 W (1500 VA)' });
      const footer = setupFooter('65°C 60°C 187 W (1500 VA) 76 %');
      try {
        const result = upsExtractor.extract({ source: tbody });
        expect(result?.loadW).toBe(187);
        expect(result?.batteryChargePct).toBe(76);
        expect(result?.nominalPowerW).toBe(1500);
      } finally {
        teardownFooter(footer);
      }
    });

    it('back-computes loadPct from footer watts when tbody loadPct is absent', () => {
      // If Unraid 7.3 stopped writing .nut_loadpct but still has .nut_nompower
      // (which is static metadata), we can recover load% from footer watts.
      const tbody = loadFixture('tblUPSNUTDash.html');
      populate(tbody, { nompower: '1000 W (1500 VA)' });
      const footer = setupFooter('250 W 90 %');
      try {
        const result = upsExtractor.extract({ source: tbody });
        expect(result?.loadW).toBe(250);
        expect(result?.loadPct).toBe(25); // 250 / 1000
      } finally {
        teardownFooter(footer);
      }
    });

    it('falls back to tbody values when no footer is present', () => {
      const tbody = loadFixture('tblUPSNUTDash.html');
      populate(tbody, { loadpct: '20 %', bcharge: '100 %', nompower: '1500 W (1500 VA)' });
      // Don't set up a footer; existing test environment has none by default.
      const result = upsExtractor.extract({ source: tbody });
      expect(result?.loadW).toBe(300); // tbody fallback: 20% × 1500
      expect(result?.batteryChargePct).toBe(100);
    });
  });
});
