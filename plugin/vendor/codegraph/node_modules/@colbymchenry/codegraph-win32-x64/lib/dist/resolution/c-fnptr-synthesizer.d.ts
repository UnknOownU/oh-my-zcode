import type { Edge } from '../types';
import type { QueryBuilder } from '../db/queries';
import type { ResolutionContext } from './types';
import type { MaybeYield } from './cooperative-yield';
export declare function cFnPointerDispatchEdges(_queries: QueryBuilder, ctx: ResolutionContext, onYield: MaybeYield, onFraction?: (fraction: number) => void): Promise<Edge[]>;
//# sourceMappingURL=c-fnptr-synthesizer.d.ts.map