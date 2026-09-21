/**
 * Decode the kernel's flat buffers into an ExtractionResult — the single
 * JS-side pass over the per-file tables. See layout.ts for the byte layout
 * and codegraph-kernel/src/buffers.rs for the writer.
 */
import type { ExtractionResult, Language } from '../../types';
import type { KernelBuffers } from './loader';
export declare function decodeExtractBuffers(buffers: KernelBuffers, filePath: string, language: Language): ExtractionResult;
//# sourceMappingURL=decode.d.ts.map