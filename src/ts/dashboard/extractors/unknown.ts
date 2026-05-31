import type { UnknownWidget } from '../types';

export interface ExtractorContext {
  source: HTMLTableSectionElement;
  hint?: string;
}

export interface Extractor<T> {
  match: (ctx: ExtractorContext) => boolean;
  extract: (ctx: ExtractorContext) => T | null;
}

export const unknownExtractor: Extractor<UnknownWidget> = {
  match: () => true, // catch-all: always matches as a last-resort fallback
  extract: ({ source }) => {
    const id = source.id || '';
    const firstClass = source.classList.length > 0 ? source.classList[0] : '';
    const hint = firstClass || id;
    return {
      kind: 'unknown',
      id: id || `anon-${Math.random().toString(36).slice(2, 8)}`,
      hint,
      innerHTML: source.innerHTML,
    };
  },
};
