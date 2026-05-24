import type { WidgetState } from '../types';
import { unknownExtractor, type Extractor, type ExtractorContext } from './unknown';
import { arrayExtractor } from './array';
import { cacheExtractor } from './cache';
import { parityExtractor } from './parity';

export type { Extractor, ExtractorContext };

// Ordered registry — earlier entries win.
// Per-widget tasks insert their entries above the 'unknown' fallback.
export const registry: Array<{ name: string; extractor: Extractor<WidgetState> }> = [
  { name: 'array', extractor: arrayExtractor as Extractor<WidgetState> },
  { name: 'cache', extractor: cacheExtractor as Extractor<WidgetState> },
  { name: 'parity', extractor: parityExtractor as Extractor<WidgetState> },
  // Subsequent widgets register above 'unknown' in their tasks
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
