import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerExtractor } from '../../../../src/ts/dashboard/extractors/docker';

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

describe('dockerExtractor', () => {
  const tbody = loadFixture('docker_view.html');

  it('matches the Docker tbody by id', () => {
    expect(dockerExtractor.match({ source: tbody })).toBe(true);
  });

  it('matches when id or class contains "docker"', () => {
    const other = parseTbody('<tbody class="dockerContainers"></tbody>');
    expect(dockerExtractor.match({ source: other })).toBe(true);
  });

  it('does not match an unrelated tbody', () => {
    const other = parseTbody('<tbody id="tblSomethingElse"><tr><td>?</td></tr></tbody>');
    expect(dockerExtractor.match({ source: other })).toBe(false);
  });

  it('returns kind = docker', () => {
    const result = dockerExtractor.extract({ source: tbody });
    expect(result?.kind).toBe('docker');
  });

  it('returns folders and ungrouped arrays', () => {
    const result = dockerExtractor.extract({ source: tbody })!;
    expect(Array.isArray(result.folders)).toBe(true);
    expect(Array.isArray(result.ungrouped)).toBe(true);
  });

  it('extracts the live fixture as ungrouped containers (no folder.view2 wrapping)', () => {
    // The captured fixture has DashboardApps.php output appended in raw form,
    // i.e., before folder.view2's client-side wrapping runs. Everything sits
    // in ungrouped[].
    const result = dockerExtractor.extract({ source: tbody })!;
    expect(result.folders.length).toBe(0);
    expect(result.ungrouped.length).toBe(43);
  });

  it('totals match across folder + ungrouped containers', () => {
    const result = dockerExtractor.extract({ source: tbody })!;
    expect(result.totalCount).toBe(43);
    expect(result.totalRunning).toBe(31);
  });

  it('parses an individual container row correctly', () => {
    const result = dockerExtractor.extract({ source: tbody })!;
    const first = result.ungrouped[0];
    expect(first.name).toBe('AdGuard-Home');
    expect(first.state).toBe('started');
    expect(first.imgUrl).toMatch(/AdGuard-Home-icon\.png/);
    expect(first.folderName).toBeNull();
  });

  it('classifies stopped containers correctly', () => {
    const result = dockerExtractor.extract({ source: tbody })!;
    const stopped = result.ungrouped.filter((c) => c.state === 'stopped');
    expect(stopped.length).toBe(12);
  });

  it('handles a tbody with only the title chrome (cold state)', () => {
    const cold = parseTbody(`
      <tbody id="docker_view">
        <tr><td><span class="tile-header"><h3>Docker Containers</h3></span></td></tr>
      </tbody>`);
    const result = dockerExtractor.extract({ source: cold })!;
    expect(result.folders).toEqual([]);
    expect(result.ungrouped).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.totalRunning).toBe(0);
  });

  it('parses a folder.view2 grouped synthetic fixture', () => {
    // After folder.view2's dashboard.js runs, the tbody contains
    // div.folder-showcase-outer-<id> nodes wrapping folder + children.
    const live = parseTbody(`
      <tbody id="docker_view">
        <tr title='' class='updated'>
          <td>
            <span class='outer solid apps started'>
              <span id='ungrouped1' class='hand'>
                <img src='/icons/standalone1.png' class='img'>
              </span>
              <span class='inner'>
                <span class=''>standalone1</span><br>
                <i class='fa fa-play started green-text'></i>
                <span class='state'>started</span>
              </span>
            </span>
            <div class="folder-showcase-outer-mediaFolder folder-showcase-outer" expanded="true">
              <span class="outer solid apps started folder-docker">
                <span id="folder-id-mediaFolder" class="hand docker folder-hand-docker">
                  <img src="/icons/folder-media.png" class="img folder-img-docker">
                </span>
                <span class="inner folder-inner-docker">
                  <span class="folder-appname-docker">Media Management</span><br>
                  <i class="fa fa-play started green-text folder-load-status-docker"></i>
                  <span class="state folder-state-docker">started</span>
                </span>
                <div class="folder-storage"></div>
              </span>
              <div class="folder-showcase-mediaFolder folder-showcase">
                <span class='outer solid apps started'>
                  <span id='ct1' class='hand'>
                    <img src='/icons/sonarr.png' class='img'>
                  </span>
                  <span class='inner'>
                    <span class=''>sonarr</span><br>
                    <i class='fa fa-play started green-text'></i>
                    <span class='state'>started</span>
                  </span>
                </span>
                <span class='outer solid apps stopped'>
                  <span id='ct2' class='hand'>
                    <img src='/icons/radarr.png' class='img'>
                  </span>
                  <span class='inner'>
                    <span class=''>radarr</span><br>
                    <i class='fa fa-square stopped red-text'></i>
                    <span class='state'>stopped</span>
                  </span>
                </span>
              </div>
            </div>
            <div class="folder-showcase-outer-net folder-showcase-outer">
              <span class="outer solid apps stopped folder-docker">
                <span id="folder-id-net" class="hand docker folder-hand-docker">
                  <img src="/icons/folder-net.png" class="img folder-img-docker">
                </span>
                <span class="inner folder-inner-docker">
                  <span class="folder-appname-docker">Networking</span><br>
                  <i class="fa fa-square stopped red-text folder-load-status-docker"></i>
                  <span class="state folder-state-docker">stopped</span>
                </span>
                <div class="folder-storage">
                  <span class='outer solid apps stopped'>
                    <span id='ct3' class='hand'>
                      <img src='/icons/pihole.png' class='img'>
                    </span>
                    <span class='inner'>
                      <span class=''>pihole</span><br>
                      <i class='fa fa-square stopped red-text'></i>
                      <span class='state'>stopped</span>
                    </span>
                  </span>
                </div>
              </span>
              <div class="folder-showcase-net folder-showcase"></div>
            </div>
          </td>
        </tr>
      </tbody>`);
    const result = dockerExtractor.extract({ source: live })!;
    expect(result.folders.length).toBe(2);
    expect(result.ungrouped.length).toBe(1);
    expect(result.ungrouped[0].name).toBe('standalone1');

    const media = result.folders.find((f) => f.name === 'Media Management')!;
    expect(media).toBeDefined();
    // 1 started + 1 stopped child → aggregate is "mixed"
    expect(media.state).toBe('mixed');
    expect(media.containers.length).toBe(2);
    expect(media.totalCount).toBe(2);
    expect(media.runningCount).toBe(1);
    expect(media.containers.map((c) => c.name).sort()).toEqual(['radarr', 'sonarr']);
    // Folder children should be tagged with their folder name
    for (const c of media.containers) expect(c.folderName).toBe('Media Management');

    const net = result.folders.find((f) => f.name === 'Networking')!;
    expect(net.state).toBe('stopped');
    expect(net.containers.length).toBe(1);
    expect(net.containers[0].name).toBe('pihole');
    expect(net.runningCount).toBe(0);

    // Total: 1 standalone + 2 media + 1 net = 4
    expect(result.totalCount).toBe(4);
    expect(result.totalRunning).toBe(2);
  });

  it('classifies a folder with mixed states as mixed', () => {
    const live = parseTbody(`
      <tbody id="docker_view">
        <tr class="updated"><td>
          <div class="folder-showcase-outer-mixed folder-showcase-outer">
            <span class="outer solid apps folder-docker">
              <span id="folder-id-mixed" class="hand docker folder-hand-docker">
                <img src="/icons/folder.png" class="img folder-img-docker">
              </span>
              <span class="inner folder-inner-docker">
                <span class="folder-appname-docker">Mixed</span><br>
                <i class="fa fa-square folder-load-status-docker"></i>
                <span class="state folder-state-docker"></span>
              </span>
              <div class="folder-storage">
                <span class='outer solid apps started'>
                  <span id='ct1' class='hand'><img src='/a.png' class='img'></span>
                  <span class='inner'><span class=''>a</span><br><span class='state'>started</span></span>
                </span>
                <span class='outer solid apps stopped'>
                  <span id='ct2' class='hand'><img src='/b.png' class='img'></span>
                  <span class='inner'><span class=''>b</span><br><span class='state'>stopped</span></span>
                </span>
              </div>
            </span>
            <div class="folder-showcase-mixed folder-showcase"></div>
          </div>
        </td></tr>
      </tbody>`);
    const result = dockerExtractor.extract({ source: live })!;
    expect(result.folders.length).toBe(1);
    const mixed = result.folders[0];
    expect(mixed.state).toBe('mixed');
    expect(mixed.runningCount).toBe(1);
    expect(mixed.totalCount).toBe(2);
  });

  it('falls back to "unknown" container state if span.state text is missing', () => {
    const live = parseTbody(`
      <tbody id="docker_view">
        <tr class="updated"><td>
          <span class='outer solid apps'>
            <span id='ct1' class='hand'><img src='/x.png' class='img'></span>
            <span class='inner'><span class=''>weird</span></span>
          </span>
        </td></tr>
      </tbody>`);
    const result = dockerExtractor.extract({ source: live })!;
    expect(result.ungrouped[0].state).toBe('unknown');
  });

  it('handles containers with no image gracefully (imgUrl null)', () => {
    const live = parseTbody(`
      <tbody id="docker_view">
        <tr class="updated"><td>
          <span class='outer solid apps started'>
            <span id='ct1' class='hand'><i class='icon-default img'></i></span>
            <span class='inner'><span class=''>no-img</span><br><span class='state'>started</span></span>
          </span>
        </td></tr>
      </tbody>`);
    const result = dockerExtractor.extract({ source: live })!;
    expect(result.ungrouped[0].imgUrl).toBeNull();
  });
});
