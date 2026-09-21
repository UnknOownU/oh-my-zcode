/**
 * Render an uncaught value for the last-resort log WITHOUT triggering stack
 * formatting. Pure and total — never throws, never touches `.stack`.
 */
export declare function describeFatal(value: unknown): string;
/** Injectable seams so the wiring is testable without registering real handlers. */
export interface FatalHandlerDeps {
    /** Event target to attach to. Defaults to `process`. */
    target?: NodeJS.EventEmitter;
    /** How to terminate. Defaults to `process.exit`. */
    exit?: (code: number) => void;
    /** How to emit the bounded line. Defaults to a synchronous fd-2 write. */
    write?: (line: string) => void;
}
/**
 * Install the uncaught-exception / unhandled-rejection handlers. Both log a
 * bounded line and then exit non-zero (Node's default fatal semantics).
 */
export declare function installFatalHandlers(deps?: FatalHandlerDeps): void;
//# sourceMappingURL=fatal-handler.d.ts.map