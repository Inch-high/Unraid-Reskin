import type { VmsState, VmRow } from '../types';
import type { Extractor } from './unknown';

type VmState = VmRow['state'];

// libvirt.json injects each VM tile into the vm_view tbody as
//   <span class='outer solid vms {state}'>
//     <span class='hand'><img class='img' src='...'></span>
//     <span class='inner'>
//       <span>{name}</span><br>
//       <i class='fa fa-{shape} {state} {color}'></i>
//       <span class='state'>{state}</span>
//     </span>
//   </span>
// Prefer the explicit span.state text; fall back to the outer's class token.
function vmStateFromOuter(outer: Element): VmState {
  const stateText = (outer.querySelector('span.state')?.textContent ?? '').trim().toLowerCase();
  if (stateText === 'started') return 'started';
  if (stateText === 'stopped') return 'stopped';
  if (stateText === 'paused')  return 'paused';
  const cls = outer.className || '';
  if (/\bstarted\b/.test(cls)) return 'started';
  if (/\bstopped\b/.test(cls)) return 'stopped';
  if (/\bpaused\b/.test(cls))  return 'paused';
  return 'unknown';
}

function vmName(outer: Element): string {
  const inner = outer.querySelector(':scope > span.inner');
  if (!inner) return '';
  const firstSpan = inner.querySelector(':scope > span');
  return (firstSpan?.textContent ?? '').trim();
}

function vmIcon(outer: Element): string | null {
  const img = outer.querySelector(':scope > span.hand > img.img');
  const src = img?.getAttribute('src');
  return src ? src : null;
}

function readVm(outer: Element): VmRow {
  return {
    name: vmName(outer),
    state: vmStateFromOuter(outer),
    iconUrl: vmIcon(outer),
  };
}

export const vmsExtractor: Extractor<VmsState> = {
  match: ({ source }) => {
    if (source.id === 'vm_view') return true;
    if (/vms?/i.test(source.id || '')) return true;
    if (/vms?/i.test(source.className || '')) return true;
    // Header text fallback — claim the tbody even when empty so the dispatcher
    // picks it up before libvirt.json/nchan injects live tiles.
    const headerText = (source.querySelector('.tile-header h3')?.textContent ?? '').trim().toUpperCase();
    if (headerText === 'VIRTUAL MACHINES') return true;
    return false;
  },
  extract: ({ source }) => {
    const outers = Array.from(source.querySelectorAll('span.outer.solid.vms'));
    const vms = outers.map((o) => readVm(o));
    const totalRunning = vms.filter((v) => v.state === 'started').length;
    // The cold VMs tbody calls `data="noVMs()"` and stays empty until
    // libvirt.json injects the live tiles. Distinguish that state from "no
    // VMs configured" so the Workloads hero card can show a skeleton.
    const dataAttr = source.getAttribute('data') ?? '';
    const loading = vms.length === 0 && (dataAttr.includes('noVMs') || dataAttr.includes('VMs'));
    return {
      kind: 'vms',
      vms,
      totalRunning,
      totalCount: vms.length,
      loading,
    };
  },
};
