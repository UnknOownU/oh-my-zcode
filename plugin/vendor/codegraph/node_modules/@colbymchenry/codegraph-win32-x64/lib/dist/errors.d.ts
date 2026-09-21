/**
 * CodeGraph Error Classes
 *
 * Custom error types for better error handling and debugging.
 *
 * @module errors
 *
 * @example
 * ```typescript
 * import { FileError, ParseError, setLogger, silentLogger } from 'codegraph';
 *
 * // Catch specific error types
 * try {
 *   await cg.indexAll();
 * } catch (error) {
 *   if (error instanceof FileError) {
 *     console.log(`File error at ${error.filePath}: ${error.message}`);
 *   } else if (error instanceof ParseError) {
 *     console.log(`Parse error at ${error.filePath}:${error.line}`);
 *   }
 * }
 *
 * // Disable logging for tests
 * setLogger(silentLogger);
 * ```
 */
/**
 * Base error class for all CodeGraph errors.
 *
 * All CodeGraph-specific errors extend this class, allowing you to catch
 * all CodeGraph errors with a single catch block.
 *
 * @example
 * ```typescript
 * try {
 *   await cg.indexAll();
 * } catch (error) {
 *   if (error instanceof CodeGraphError) {
 *     console.log(`CodeGraph error [${error.code}]: ${error.message}`);
 *   }
 * }
 * ```
 */
export declare class CodeGraphError extends Error {
    /** Error code for categorization (e.g., 'FILE_ERROR', 'PARSE_ERROR') */
    readonly code: string;
    /** Additional context about the error */
    readonly context?: Record<string, unknown>;
    constructor(message: string, code: string, context?: Record<string, unknown>);
}
/**
 * Error reading or accessing files
 */
export declare class FileError extends CodeGraphError {
    readonly filePath: string;
    constructor(message: string, filePath: string, cause?: Error);
}
/**
 * Error parsing source code
 */
export declare class ParseError extends CodeGraphError {
    readonly filePath: string;
    readonly line?: number;
    readonly column?: number;
    constructor(message: string, filePath: string, options?: {
        line?: number;
        column?: number;
        cause?: Error;
    });
}
/**
 * Error with database operations
 */
export declare class DatabaseError extends CodeGraphError {
    readonly operation: string;
    constructor(message: string, operation: string, cause?: Error);
}
/**
 * Error with search operations
 */
export declare class SearchError extends CodeGraphError {
    readonly query: string;
    constructor(message: string, query: string, cause?: Error);
}
/**
 * Error with vector/embedding operations
 */
export declare class VectorError extends CodeGraphError {
    constructor(message: string, operation: string, cause?: Error);
}
/**
 * Error with configuration
 */
export declare class ConfigError extends CodeGraphError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Simple logger for CodeGraph operations
 *
 * By default, logs to console.warn for warnings and console.error for errors.
 * Can be configured to use custom logging.
 */
export interface Logger {
    debug(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}
/**
 * Default console-based logger
 */
export declare const defaultLogger: Logger;
/**
 * Silent logger (no output) - useful for tests
 */
export declare const silentLogger: Logger;
/**
 * Set the global logger
 */
export declare function setLogger(logger: Logger): void;
/**
 * Get the current logger
 */
export declare function getLogger(): Logger;
/**
 * Log a debug message
 */
export declare function logDebug(message: string, context?: Record<string, unknown>): void;
/**
 * Log a warning message
 */
export declare function logWarn(message: string, context?: Record<string, unknown>): void;
/**
 * Log an error message
 */
export declare function logError(message: string, context?: Record<string, unknown>): void;
//# sourceMappingURL=errors.d.ts.map