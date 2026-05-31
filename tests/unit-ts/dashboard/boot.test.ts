import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch } from '../../../src/ts/dashboard/extractors';
import {
  collectDashboardTables,
  collectDashboardTbodies,
} from '../../../src/ts/dashboard/dom-walk';
import { isDashboardEnabled } from '../../../src/ts/dashboard/boot';

// Unraid /Dashboard renders three sibling tables — db_box1, db_box2, db_box3.
// Each is a draggable column tile containing a subset of widget tbodies.
// boot() must use collectDashboardTbodies() (which walks every table) rather
// than querySelector('table.dashboard') (which finds only db_box1).

describe('dashboard DOM walk — multi-table', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds all three Unraid dashboard tables', () => {
    document.body.innerHTML = `
      <table id="db_box1" class="dashboard"><tbody><tr><td>a</td></tr></tbody></table>
      <table id="db_box2" class="dashboard"><tbody><tr><td>b</td></tr></tbody></table>
      <table id="db_box3" class="dashboard"><tbody><tr><td>c</td></tr></tbody></table>
    `;
    expect(collectDashboardTables().map((t) => t.id)).toEqual(['db_box1', 'db_box2', 'db_box3']);
  });

  it('collects tbodies from every table, not just the first', () => {
    document.body.innerHTML = `
      <table id="db_box1" class="dashboard">
        <tbody id="tblGPUDash1"><tr><td>gpu</td></tr></tbody>
        <tbody title="Processor Information"><tr><td>cpu</td></tr></tbody>
      </table>
      <table id="db_box2" class="dashboard">
        <tbody id="docker_view"><tr><td>docker</td></tr></tbody>
        <tbody id="tblIPMIDash"><tr><td>ipmi</td></tr></tbody>
      </table>
      <table id="db_box3" class="dashboard">
        <tbody id="array_list"><tr><td>array</td></tr></tbody>
        <tbody id="pool_list0"><tr><td>cache</td></tr></tbody>
      </table>
    `;
    const ids = collectDashboardTbodies()
      .map((t) => t.id)
      .filter(Boolean);
    expect(ids).toEqual(['tblGPUDash1', 'docker_view', 'tblIPMIDash', 'array_list', 'pool_list0']);
    expect(collectDashboardTbodies().length).toBe(6); // 5 ids + 1 title-only
  });

  it('routes each tbody to its first-class extractor', () => {
    document.body.innerHTML = `
      <table id="db_box1" class="dashboard">
        <tbody id="tblGPUDash1"><tr><td>gpu</td></tr></tbody>
      </table>
      <table id="db_box2" class="dashboard">
        <tbody id="docker_view"><tr><td>docker</td></tr></tbody>
        <tbody id="tblIPMIDash"><tr><td>ipmi</td></tr></tbody>
      </table>
      <table id="db_box3" class="dashboard">
        <tbody id="array_list"><tr><td>array</td></tr></tbody>
        <tbody id="pool_list0"><tr><td>cache</td></tr></tbody>
      </table>
    `;
    const kinds = collectDashboardTbodies().map((t) => dispatch({ source: t })?.kind);
    expect(kinds).toEqual(['gpu', 'docker', 'ipmi', 'array', 'cache']);
  });

  it('preserves single-table behavior (back-compat sanity)', () => {
    document.body.innerHTML = `
      <table class="dashboard"><tbody id="tblGPUDash1"><tr><td>gpu</td></tr></tbody></table>
    `;
    expect(collectDashboardTbodies().length).toBe(1);
  });

  it('returns empty when no dashboard tables are present', () => {
    document.body.innerHTML = '<p>no dashboard here</p>';
    expect(collectDashboardTables()).toEqual([]);
    expect(collectDashboardTbodies()).toEqual([]);
  });
});

describe('isDashboardEnabled gate', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.modernuiDashboard;
  });

  it('returns true when the attribute is absent (failure-mode default)', () => {
    expect(isDashboardEnabled(document)).toBe(true);
  });

  it('returns true when the attribute is "on"', () => {
    document.documentElement.dataset.modernuiDashboard = 'on';
    expect(isDashboardEnabled(document)).toBe(true);
  });

  it('returns false when the attribute is "off"', () => {
    document.documentElement.dataset.modernuiDashboard = 'off';
    expect(isDashboardEnabled(document)).toBe(false);
  });

  it('returns true for any other (unknown / future) value', () => {
    document.documentElement.dataset.modernuiDashboard = 'something-else';
    expect(isDashboardEnabled(document)).toBe(true);
  });
});
