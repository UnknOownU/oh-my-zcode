/**
 * Hermes Agent target.
 *
 * Hermes reads MCP servers from `$HERMES_HOME/config.yaml` under the
 * top-level `mcp_servers` key, and exposes discovered MCP tools through
 * dynamic toolsets named `mcp-<server>`. We add:
 *
 *   mcp_servers.codegraph -> `codegraph serve --mcp`
 *   platform_toolsets.cli -> `mcp-codegraph`
 *
 * The second entry matters because Hermes CLI profiles often enable an
 * explicit `platform_toolsets.cli` list. Without `mcp-codegraph` in that
 * list, the MCP server can be configured and connected but its tools may
 * still be filtered out of normal CLI sessions.
 */
import { AgentTarget } from './types';
export declare const hermesTarget: AgentTarget;
//# sourceMappingURL=hermes.d.ts.map