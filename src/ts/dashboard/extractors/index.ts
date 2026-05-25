import type { WidgetState } from '../types';
import { unknownExtractor, type Extractor, type ExtractorContext } from './unknown';
import { arrayExtractor } from './array';
import { cacheExtractor } from './cache';
import { parityExtractor } from './parity';
import { disklocationExtractor } from './disklocation';
import { processorExtractor } from './processor';
import { systemExtractor } from './system';
import { gpuExtractor } from './gpu';
import { ipmiExtractor } from './ipmi';
import { dockerExtractor } from './docker';
import { vmsExtractor } from './vms';
import { interfaceExtractor } from './interface';
import { upsExtractor } from './ups';
import { identityExtractor } from './identity';
import { motherboardExtractor } from './motherboard';
import { sharesExtractor } from './shares';
import { usersExtractor } from './users';

export type { Extractor, ExtractorContext };

// Ordered registry — earlier entries win.
// identity must come before system (memory) because the HL15Rack tbody has
// class='system' and the memory extractor would otherwise claim it.
export const registry: Array<{ name: string; extractor: Extractor<WidgetState> }> = [
  { name: 'array', extractor: arrayExtractor as Extractor<WidgetState> },
  { name: 'cache', extractor: cacheExtractor as Extractor<WidgetState> },
  { name: 'parity', extractor: parityExtractor as Extractor<WidgetState> },
  { name: 'disklocation', extractor: disklocationExtractor as Extractor<WidgetState> },
  { name: 'processor', extractor: processorExtractor as Extractor<WidgetState> },
  { name: 'identity', extractor: identityExtractor as Extractor<WidgetState> },
  { name: 'system', extractor: systemExtractor as Extractor<WidgetState> },
  { name: 'gpu', extractor: gpuExtractor as Extractor<WidgetState> },
  { name: 'ipmi', extractor: ipmiExtractor as Extractor<WidgetState> },
  { name: 'docker', extractor: dockerExtractor as Extractor<WidgetState> },
  { name: 'vms', extractor: vmsExtractor as Extractor<WidgetState> },
  { name: 'interface', extractor: interfaceExtractor as Extractor<WidgetState> },
  { name: 'ups', extractor: upsExtractor as Extractor<WidgetState> },
  { name: 'motherboard', extractor: motherboardExtractor as Extractor<WidgetState> },
  { name: 'shares', extractor: sharesExtractor as Extractor<WidgetState> },
  { name: 'users', extractor: usersExtractor as Extractor<WidgetState> },
  { name: 'unknown', extractor: unknownExtractor as Extractor<WidgetState> },
];

// Walk registry in order; first matching extractor wins.
export function dispatch(ctx: ExtractorContext): WidgetState | null {
  for (const entry of registry) {
    if (entry.extractor.match(ctx)) {
      return entry.extractor.extract(ctx);
    }
  }
  return null;
}
