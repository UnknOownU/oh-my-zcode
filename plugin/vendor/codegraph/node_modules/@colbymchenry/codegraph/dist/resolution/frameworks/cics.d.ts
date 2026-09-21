/**
 * CICS Framework Resolver (COBOL)
 *
 * Resolves the pseudo-conversational transaction hop: a program ends with
 * `EXEC CICS RETURN TRANSID('CB00')` (or START), and CICS re-invokes the
 * program that OWNS transaction CB00 on the next attention key. The
 * transaction→program mapping lives in the CICS CSD, which is never in the
 * repo — but by near-universal convention each program declares its own
 * transaction id as a working-storage constant:
 *
 *     05 WS-TRANID    PIC X(04) VALUE 'CB00'.
 *
 * The COBOL extractor emits `cics-transid:CB00` call references for literal
 * (or same-file-dereferenced) TRANSID options; this resolver maps the id to
 * the program module whose TRAN*-named data item declares that VALUE. No
 * match (an id owned by a program outside the repo) stays unresolved.
 */
import { FrameworkResolver } from '../types';
export declare const cicsResolver: FrameworkResolver;
//# sourceMappingURL=cics.d.ts.map