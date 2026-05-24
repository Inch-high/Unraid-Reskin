import type { WidgetState } from '../types';
import { unknownExtractor, type Extractor, type ExtractorContext } from './unknown';

export type { Extractor, ExtractorContext };

// Ordered registry — earlier entries win.
// Per-widget tasks insert their entries above the 'unknown' fallback.
export const registry: Array<{ name: string; extractor: Extractor<WidgetState> }> = [
  // Future entries land here (above unknown):
  // { name: 'array', extractor: arrayExtractor },
  // { name: 'cache', extractor: cacheExtractor },
  // ...
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
