/**
 * GoFrame Framework Resolver (route metadata) — issue #747.
 *
 * GoFrame's "standard router" binds routes reflectively, so there is no literal
 * path string at a `.GET("/x", handler)` call site and no static edge from a
 * route to the controller method that serves it. The structural facts live in
 * two places, joined only at runtime by GoFrame:
 *
 *   // api/user/v1/user_sign_in.go — the route lives in a struct tag on the request type
 *   type SignInReq struct {
 *       g.Meta `path:"/user/sign-in" method:"post" tags:"UserService" summary:"…"`
 *       …
 *   }
 *   // internal/controller/user/user_v1_sign_in.go — the handler takes *that* request type
 *   func (c *ControllerV1) SignIn(ctx context.Context, req *v1.SignInReq) (res *v1.SignInRes, err error)
 *   // internal/cmd/cmd.go — reflective binding (no path, no handler name)
 *   group.Bind(user.NewV1())
 *
 * This resolver handles the FIRST half: it reads the `g.Meta` struct tag on a
 * request type into a `route` node (`POST /user/sign-in`). The route → handler
 * EDGE is the genuinely reflective part — the method name is NOT derivable from
 * the request type (`DeptSearchReq` is served by `List`, `DeptAddReq` by `Add`),
 * so the only reliable join is the request type appearing in the method's
 * parameter signature. That whole-graph join is done by the companion
 * `goframeRouteEdges` synthesizer, which reads the request type back out of the
 * route node's qualifiedName.
 *
 * Honesty note: the route node carries the `g.Meta` path verbatim. The group
 * prefix from `s.Group("/api", …)` / nested `group.Group("/v1", …)` is applied
 * by reflective `Bind` at runtime and is deliberately NOT reconstructed here —
 * the discriminating, structural part is the per-route path + method.
 */
import { FrameworkResolver } from '../types';
/** Marker embedded in a route node's qualifiedName so the synthesizer can read
 *  back the request type to join on. The value after it is the package-qualified
 *  request type (`cash.ListReq`) — the package disambiguates the many identical
 *  bare names (`ListReq`, `GetReq`) a large app defines, one per module. Falls
 *  back to the bare type when no `package` declaration is found. */
export declare const GOFRAME_ROUTE_MARKER = "::goframe-route:";
export declare const goframeResolver: FrameworkResolver;
//# sourceMappingURL=goframe.d.ts.map