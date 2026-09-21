/**
 * Play Framework (Scala/Java) resolver.
 *
 * Play declares HTTP routes in a dedicated `conf/routes` file (and included
 * `conf/*.routes`), Rails-style:
 *
 *   GET   /computers        controllers.Application.list(p: Int ?= 0)
 *   POST  /computers        controllers.Application.save
 *   GET   /assets/*file     controllers.Assets.versioned(path = "/public", file: Asset)
 *
 * The file is extensionless, so the file walk only indexes it because
 * `isPlayRoutesFile` (grammars.ts) opts it in; it's processed through the
 * no-grammar path and this resolver extracts the routes. Each route references
 * its handler as `Controller.method` (the package prefix is dropped), resolved
 * to the action method in the controller class.
 */
import { FrameworkResolver } from '../types';
export declare const playResolver: FrameworkResolver;
//# sourceMappingURL=play.d.ts.map