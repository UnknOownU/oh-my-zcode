/**
 * Per-language extraction configurations.
 *
 * Each file exports a LanguageExtractor config object.
 * This barrel builds the EXTRACTORS map consumed by TreeSitterExtractor.
 */
import { Language } from '../../types';
import type { LanguageExtractor } from '../tree-sitter-types';
export declare const EXTRACTORS: Partial<Record<Language, LanguageExtractor>>;
//# sourceMappingURL=index.d.ts.map