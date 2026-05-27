import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vmsExtractor } from '../../../../src/ts/dashboard/extractors/vms';

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

describe('vmsExtractor', () => {
  const tbody = loadFixture('vm_view.html');

  it('matches the VMs tbody by id', () => {
    expect(vmsExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches when id or class contains "vms"', () => {
    const other = parseTbody('<tbody class="vmsContainer"></tbody>');
    expect(vmsExtractor.match({ source: other })).toBe(true);
  });

  it('matches by header text even when the body is empty', () => {
    const other = parseTbody(`
      <tbody id="anonymous">
        <tr><td><span class="tile-header"><h3>Virtual Machines</h3></span></td></tr>
      </tbody>`);
    expect(vmsExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const other = parseTbody('<tbody id="tblSomethingElse"><tr><td>?</td></tr></tbody>');
    expect(vmsExtractor.match({ source: other })).toBe(false);
  });

  it('returns an empty state for the cold fixture (no VM tiles) and marks it loading', () => {
    // The cold tbody has data="noVMs()" — libvirt.json injects tiles later.
    // Loading must be true so the hero strip renders a skeleton instead of
    // misreporting "0 VMs" for a moment.
    const result = vmsExtractor.extract({ source: tbody })!;
    expect(result).toEqual({
      kind: 'vms',
      vms: [],
      totalRunning: 0,
      totalCount: 0,
      loading: true,
    });
  });

  it('marks loading false when the tbody has no noVMs() marker (configured empty list)', () => {
    const empty = parseTbody('<tbody id="vm_view"></tbody>');
    const result = vmsExtractor.extract({ source: empty })!;
    expect(result.loading).toBe(false);
  });

  it('parses a populated tbody with mixed VM states', () => {
    const live = parseTbody(`
      <tbody id="vm_view">
        <tr><td>
          <span class='outer solid vms started'>
            <span id='vm1' class='hand'><img src='/icons/win11.png' class='img'></span>
            <span class='inner'>
              <span>Windows 11</span><br>
              <i class='fa fa-play started green-text'></i>
              <span class='state'>started</span>
            </span>
          </span>
          <span class='outer solid vms stopped'>
            <span id='vm2' class='hand'><img src='/icons/ubuntu.png' class='img'></span>
            <span class='inner'>
              <span>Ubuntu</span><br>
              <i class='fa fa-square stopped red-text'></i>
              <span class='state'>stopped</span>
            </span>
          </span>
          <span class='outer solid vms paused'>
            <span id='vm3' class='hand'><img src='/icons/macos.png' class='img'></span>
            <span class='inner'>
              <span>macOS</span><br>
              <i class='fa fa-pause paused yellow-text'></i>
              <span class='state'>paused</span>
            </span>
          </span>
          <span class='outer solid vms started'>
            <span id='vm4' class='hand'><img src='/icons/arch.png' class='img'></span>
            <span class='inner'>
              <span>Arch</span><br>
              <i class='fa fa-play started green-text'></i>
              <span class='state'>started</span>
            </span>
          </span>
          <span class='outer solid vms stopped'>
            <span id='vm5' class='hand'><img src='/icons/debian.png' class='img'></span>
            <span class='inner'>
              <span>Debian</span><br>
              <i class='fa fa-square stopped red-text'></i>
              <span class='state'>stopped</span>
            </span>
          </span>
        </td></tr>
      </tbody>`);
    const result = vmsExtractor.extract({ source: live })!;
    expect(result.kind).toBe('vms');
    expect(result.totalCount).toBe(5);
    expect(result.totalRunning).toBe(2);
    expect(result.vms.map((v) => v.name)).toEqual(['Windows 11', 'Ubuntu', 'macOS', 'Arch', 'Debian']);
    expect(result.vms.map((v) => v.state)).toEqual(['started', 'stopped', 'paused', 'started', 'stopped']);
    expect(result.vms[0].iconUrl).toBe('/icons/win11.png');
    expect(result.vms[2].iconUrl).toBe('/icons/macos.png');
  });

  it('falls back to the outer class token when span.state text is missing', () => {
    const live = parseTbody(`
      <tbody id="vm_view">
        <tr><td>
          <span class='outer solid vms paused'>
            <span id='vm1' class='hand'><img src='/x.png' class='img'></span>
            <span class='inner'><span>fallback-vm</span></span>
          </span>
        </td></tr>
      </tbody>`);
    const result = vmsExtractor.extract({ source: live })!;
    expect(result.vms[0].state).toBe('paused');
    expect(result.vms[0].name).toBe('fallback-vm');
  });

  it('returns "unknown" state when no class token or state text is present', () => {
    const live = parseTbody(`
      <tbody id="vm_view">
        <tr><td>
          <span class='outer solid vms'>
            <span id='vm1' class='hand'><img src='/x.png' class='img'></span>
            <span class='inner'><span>weird</span></span>
          </span>
        </td></tr>
      </tbody>`);
    const result = vmsExtractor.extract({ source: live })!;
    expect(result.vms[0].state).toBe('unknown');
  });

  it('handles VMs without an icon gracefully (iconUrl null)', () => {
    const live = parseTbody(`
      <tbody id="vm_view">
        <tr><td>
          <span class='outer solid vms started'>
            <span id='vm1' class='hand'><i class='icon-default img'></i></span>
            <span class='inner'><span>no-icon</span><br><span class='state'>started</span></span>
          </span>
        </td></tr>
      </tbody>`);
    const result = vmsExtractor.extract({ source: live })!;
    expect(result.vms[0].iconUrl).toBeNull();
    expect(result.vms[0].state).toBe('started');
  });
});
