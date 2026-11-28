import type { PermissionGrantKey } from './permissions'
import type { ServerNavigationSection } from './server-navigation'
import type { McpScope } from './mcp'
import type { AiFunctionId } from './ai-functions'

/**
 * Pausing an area hides its Client entry points, Role grants, AI functions in Settings and agent and MCP tools.
 * Its records, HTTP APIs and existing grants stay available.
 */
export const pausedSections: ReadonlySet<ServerNavigationSection> = new Set()

export const pausedPermissionKeys: ReadonlySet<PermissionGrantKey> = new Set()

export const pausedAiFunctions: ReadonlySet<AiFunctionId> = new Set()

export const pausedMcpScopes: ReadonlySet<McpScope> = new Set()

const pausedTools = new Set<string>()

/** Agent and MCP tools of a paused area are neither discoverable nor callable. */
export function toolPaused(name: string): boolean {
  return pausedTools.has(name)
}
