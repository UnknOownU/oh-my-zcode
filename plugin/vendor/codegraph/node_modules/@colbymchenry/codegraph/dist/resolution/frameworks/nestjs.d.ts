/**
 * NestJS Framework Resolver
 *
 * Handles NestJS decorator-based routing across its transport layers:
 *   - HTTP:          @Controller(prefix) + @Get/@Post/@Put/@Patch/@Delete/@Head/@Options/@All
 *   - GraphQL:       @Resolver + @Query/@Mutation/@Subscription
 *   - Microservices: @MessagePattern / @EventPattern
 *   - WebSockets:    @WebSocketGateway(namespace) + @SubscribeMessage(event)
 *
 * Like the other framework extractors this is regex-over-source (comment-
 * stripped), not AST traversal. NestJS differs from Spring/ASP.NET in two ways
 * that this resolver has to account for:
 *
 *   1. An HTTP route's path is split across TWO decorators — the class-level
 *      `@Controller` prefix and the method-level `@Get`/`@Post` path — and both
 *      are frequently empty (`@Controller()`, `@Get()`). We pair each method
 *      decorator with its enclosing class and join the two paths.
 *
 *   2. `@Query()` is overloaded: it's a GraphQL *method* decorator (from
 *      `@nestjs/graphql`) AND a REST *parameter* decorator (from
 *      `@nestjs/common`). We only treat it as GraphQL when it sits inside an
 *      `@Resolver` class, which is what disambiguates the two.
 */
import { FrameworkResolver } from '../types';
export declare const nestjsResolver: FrameworkResolver;
//# sourceMappingURL=nestjs.d.ts.map