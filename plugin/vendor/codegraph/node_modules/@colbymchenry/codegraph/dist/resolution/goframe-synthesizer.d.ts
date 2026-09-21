/**
 * GoFrame route → controller-method dispatch synthesis (#747).
 *
 * GoFrame binds routes reflectively (`group.Bind(user.NewV1())`), so the route
 * declared in a request type's `g.Meta` tag has no static edge to the method
 * that serves it. The `goframeResolver` extract pass turns each `g.Meta` into a
 * `route` node carrying its request type in the qualifiedName; this whole-graph
 * pass closes the loop by joining each route to its handler.
 *
 * The join key is the REQUEST TYPE, not the method name — GoFrame method names
 * are free (`DeptSearchReq` is served by `List`, `DeptAddReq` by `Add`), so the
 * only reliable link is the request type appearing in the handler's parameter
 * signature:
 *
 *   func (c *sysDeptController) Add(ctx context.Context, req *system.DeptAddReq) (…)
 *                                                              ^^^^^^^^^^^^^^^^  the join
 *
 * Go method nodes already carry that signature, so no source re-read is needed.
 * Each synthesized edge is `kind:'calls'`, `provenance:'heuristic'`,
 * `metadata.synthesizedBy:'goframe-route'` — a reflective-dispatch bridge, so
 * `codegraph_explore` surfaces it as a dynamic hop rather than a literal call,
 * and the handler's callers list the route that reaches it. A project with no
 * GoFrame routes is a no-op.
 */
import type { Edge } from '../types';
import type { ResolutionContext } from './types';
import type { MaybeYield } from './cooperative-yield';
export declare function goframeRouteEdges(ctx: ResolutionContext, onYield: MaybeYield): Promise<Edge[]>;
//# sourceMappingURL=goframe-synthesizer.d.ts.map