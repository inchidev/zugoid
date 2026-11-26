import { channelPath, type ChannelRef } from './paths'

export type ServerNavigationSection = 'chat' | 'inbox' | 'schedules' | 'tasks' | 'factory' | 'customers' | 'agents' | 'data' | 'media' | 'gadgets'
type ServerNavigationModule = Exclude<ServerNavigationSection, 'schedules'>

/** The Chat rail must not reopen an Agent DM remembered by an older Client. */
export function chatNavigationTarget(conversations: readonly ChannelRef[], lastId?: string): string {
  const last = conversations.find(channel => channel.id === lastId)
  const path = last ? channelPath(last) : '/channels'
  return path.startsWith('/agents/') ? '/channels' : path
}

/**
 * Resource routes retain their section. Tasks holds boards and Tasks, and Factory holds coding work:
 * Projects with repositories, and Runs.
 */
export function serverNavigationSection(path: string): ServerNavigationSection | null {
  const segment = path.split('/')[1]
  if (segment === 'channels') return 'chat'
  const next = path.split('/')[2]
  if (segment === 'tasks' || (segment === 'projects' && ['board', 'my-tasks', 'mark'].includes(next || ''))) return 'tasks'
  if (segment === 'projects' || segment === 'factory' || segment === 'runs') return 'factory'
  if (['data', 'databases', 'items'].includes(segment || '')) return 'data'
  // Mailboxes are a view of Customers.
  if (segment === 'customers' || segment === 'mail') return 'customers'
  if (segment === 'inbox' || segment === 'schedules' || segment === 'agents' || segment === 'media' || segment === 'gadgets') return segment
  return null
}

export function hasServerNavigationMenu(path: string): boolean {
  const section = serverNavigationSection(path)
  return section !== null && section !== 'schedules'
}

/** Scheduled has its own page in the rail and shares the Agents module switch. */
export function serverNavigationModule(section: ServerNavigationSection): ServerNavigationModule {
  return section === 'schedules' ? 'agents' : section
}

/** The API paths of each section, for the Server's module switches: a section left out answers 404. */
const API_MODULE_SEGMENTS: Record<string, ServerNavigationModule> = {
  inbox: 'inbox',
  tasks: 'tasks', 'task-attachments': 'tasks', 'task-checklist': 'tasks', 'task-files': 'tasks', boards: 'tasks',
  projects: 'factory', runs: 'factory', factory: 'factory', 'code-environments': 'factory', 'git-connections': 'factory',
  'compute-nodes': 'factory', 'compute-agent': 'factory',
  customers: 'customers', mail: 'customers',
  agents: 'agents', 'agent-runs': 'agents', schedules: 'agents', 'agent-auth': 'agents',
  media: 'media',
  databases: 'data', 'database-fields': 'data', 'database-views': 'data', items: 'data',
  gadgets: 'gadgets',
}

/** The section an `/api/...` path belongs to, or null for the Server's own paths, which stay. */
export function apiModuleSection(path: string): ServerNavigationModule | null {
  if (!path.startsWith('/api/')) return null
  const segment = path.split('/')[2] ?? ''
  if (segment.startsWith('data')) return 'data'
  return API_MODULE_SEGMENTS[segment] ?? null
}
