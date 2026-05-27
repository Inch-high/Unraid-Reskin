import type { DockerState, DockerFolder, DockerContainer } from '../types';
import type { Extractor } from './unknown';

type CtState = DockerContainer['state'];

// The dynamix.docker.manager plugin renders each dashboard tile container as
//   <span class='outer solid apps {state}'>
//     <span id='{id}' class='hand'><img class='img' src='...'></span>
//     <span class='inner'>
//       <span class='{updateColor?}'>{containerName}</span><br>
//       <i class='fa fa-{shape} {state} {color}'></i>
//       <span class='state'>{state}</span>
//     </span>
//   </span>
// We resolve container state preferring the span.state text (always correct),
// falling back to the outer's class token if that text is missing.
function containerStateFromOuter(outer: Element): CtState {
  const stateText = (outer.querySelector('span.state')?.textContent ?? '').trim().toLowerCase();
  if (stateText === 'started') return 'started';
  if (stateText === 'stopped') return 'stopped';
  if (stateText === 'paused')  return 'paused';
  // Fall back to the class list — outer carries the state as a token.
  const cls = outer.className || '';
  if (/\bstarted\b/.test(cls)) return 'started';
  if (/\bstopped\b/.test(cls)) return 'stopped';
  if (/\bpaused\b/.test(cls))  return 'paused';
  return 'unknown';
}

// Container name is the first <span> child inside `.inner`. The dashboard PHP
// emits `<span class=''>{name}</span>` for vanilla containers and
// `<span class='blue-text'>{name}</span>` when an update is available, so we
// can't rely on class — we just take the first span in document order.
function containerName(outer: Element): string {
  const inner = outer.querySelector(':scope > span.inner');
  if (!inner) return '';
  const firstSpan = inner.querySelector(':scope > span');
  return (firstSpan?.textContent ?? '').trim();
}

function containerImg(outer: Element): string | null {
  const img = outer.querySelector(':scope > span.hand > img.img');
  const src = img?.getAttribute('src');
  return src ? src : null;
}

// Build a DockerContainer from a `.outer.solid.apps` span. The optional
// folderName tags ungrouped vs in-folder containers downstream.
function readContainer(outer: Element, folderName: string | null): DockerContainer {
  return {
    name: containerName(outer),
    state: containerStateFromOuter(outer),
    imgUrl: containerImg(outer),
    folderName,
  };
}

// folder.view2's dashboard.js renders each folder as
//   <div class='folder-showcase-outer-{id} folder-showcase-outer'>
//     <span class='outer solid apps {state} folder-docker'>
//       <span id='folder-id-{id}'>...</span>
//       <span class='inner folder-inner-docker'>
//         <span class='folder-appname-docker'>{name}</span>
//         <i class='fa ... folder-load-status-docker'></i>
//         <span class='state folder-state-docker'>{state}</span>
//       </span>
//       <div class='folder-storage'>...collapsed children...</div>
//     </span>
//     <div class='folder-showcase-{id} folder-showcase'>...expanded children...</div>
//   </div>
// Children can sit in `.folder-storage` (collapsed) or `.folder-showcase`
// (expanded) depending on whether the folder is open. We read both.
function readFolder(showcaseOuter: Element): DockerFolder | null {
  const folderOuter = showcaseOuter.querySelector(':scope > span.outer.folder-docker');
  if (!folderOuter) return null;

  const nameEl = folderOuter.querySelector('.folder-appname-docker');
  const name = (nameEl?.textContent ?? '').trim();

  // Gather child containers — anywhere inside either the collapsed `.folder-storage`
  // or the expanded `.folder-showcase` slot. We exclude the folder's own
  // outer span (which itself carries `.folder-docker`) to avoid recursion.
  const folderStorage = folderOuter.querySelector(':scope > div.folder-storage');
  const folderShowcase = showcaseOuter.querySelector(':scope > div.folder-showcase');
  const childOuters: Element[] = [];
  for (const slot of [folderStorage, folderShowcase]) {
    if (!slot) continue;
    for (const c of Array.from(slot.querySelectorAll(':scope > span.outer.apps'))) {
      if (c.classList.contains('folder-docker')) continue;
      childOuters.push(c);
    }
  }

  const containers = childOuters.map((c) => readContainer(c, name));
  const runningCount = containers.filter((c) => c.state === 'started').length;
  const totalCount = containers.length;

  // Folder aggregate state. The folder.view2 rendering sets the folder's own
  // class+span based on the collective state of children but we can't trust
  // its initial template (always rendered as "stopped"), so we recompute:
  //   all started → 'started'
  //   all stopped → 'stopped'
  //   any paused with no others mixed → 'paused'
  //   anything else → 'mixed'
  let state: DockerFolder['state'];
  if (totalCount === 0) {
    state = 'stopped';
  } else {
    const allStarted = containers.every((c) => c.state === 'started');
    const allStopped = containers.every((c) => c.state === 'stopped');
    const allPaused  = containers.every((c) => c.state === 'paused');
    state = allStarted ? 'started'
          : allStopped ? 'stopped'
          : allPaused  ? 'paused'
          : 'mixed';
  }

  return { name, state, containers, totalCount, runningCount };
}

export const dockerExtractor: Extractor<DockerState> = {
  match: ({ source }) => {
    if (source.id === 'docker_view') return true;
    if (/docker/i.test(source.id || '')) return true;
    if (/docker/i.test(source.className || '')) return true;
    return false;
  },
  extract: ({ source }) => {
    // folder.view2 folders first — each folder lives in a `.folder-showcase-outer`
    // div anywhere under the tbody.
    const folderNodes = Array.from(source.querySelectorAll('div.folder-showcase-outer'));
    const folders: DockerFolder[] = [];
    for (const fn of folderNodes) {
      const f = readFolder(fn);
      if (f) folders.push(f);
    }

    // Ungrouped containers — every `.outer.solid.apps` that is NOT a
    // `.folder-docker` and NOT inside one of the folder slots above.
    const ungrouped: DockerContainer[] = [];
    const allOuters = Array.from(source.querySelectorAll('span.outer.solid.apps'));
    for (const outer of allOuters) {
      if (outer.classList.contains('folder-docker')) continue;
      // Skip anything sitting inside a folder showcase/storage slot.
      const insideFolder = outer.closest('div.folder-showcase-outer');
      if (insideFolder) continue;
      ungrouped.push(readContainer(outer, null));
    }

    let totalRunning = ungrouped.filter((c) => c.state === 'started').length;
    let totalCount = ungrouped.length;
    for (const f of folders) {
      totalRunning += f.runningCount;
      totalCount += f.totalCount;
    }

    // Distinguish "still loading" from "no containers configured". The tbody
    // matches before dynamix.docker.manager has injected `.outer.solid.apps`
    // tiles, so an empty result during that window should not be treated as
    // a populated zero-container dashboard.
    const hasAnyTile = source.querySelector('span.outer.solid.apps') !== null
      || source.querySelector('div.folder-showcase-outer') !== null;
    const loading = totalCount === 0 && !hasAnyTile;

    return {
      kind: 'docker',
      folders,
      ungrouped,
      totalRunning,
      totalCount,
      loading,
    };
  },
};
