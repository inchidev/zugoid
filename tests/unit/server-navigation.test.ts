import { describe, expect, it } from 'vitest'
import { apiModuleSection, chatNavigationTarget, hasServerNavigationMenu, isMobilePrimarySection, serverNavigationSection } from '../../shared/server-navigation'

describe('Server rail destinations', () => {
  it('keeps channels, DMs and threads in Chat', () => {
    expect(serverNavigationSection('/channels')).toBe('chat')
    expect(serverNavigationSection('/channels/dm-id')).toBe('chat')
    expect(serverNavigationSection('/channels/channel-id/threads/thread-id')).toBe('chat')
    expect(hasServerNavigationMenu('/channels/channel-id')).toBe(true)
  })

  it('keeps Agent conversations and their threads in Agents', () => {
    expect(serverNavigationSection('/agents/dm-id')).toBe('agents')
    expect(serverNavigationSection('/agents/dm-id/threads/thread-id')).toBe('agents')
  })

  it('does not send the Chat rail back to an Agent DM saved by an older Client', () => {
    const conversations = [
      { id: 'agent-dm', type: 'dm', participants: [{ kind: 'agent' }] },
      { id: 'general', type: 'text' },
      { id: 'human-dm', type: 'dm', participants: [{ kind: 'human' }] },
    ]
    expect(chatNavigationTarget(conversations, 'agent-dm')).toBe('/channels')
    expect(chatNavigationTarget(conversations, 'human-dm')).toBe('/channels/human-dm')
    expect(chatNavigationTarget(conversations, 'removed')).toBe('/channels')
  })

  it('opens context menus and keeps boards in Tasks, and Projects and Runs in Factory', () => {
    for (const section of ['tasks', 'factory', 'customers', 'inbox', 'agents', 'media', 'apps']) {
      expect(serverNavigationSection(`/${section}`)).toBe(section)
      expect(hasServerNavigationMenu(`/${section}`)).toBe(true)
    }
    for (const path of ['/mail', '/mail/mailbox-id/inbox', '/customers/contacts/contact-id']) expect(serverNavigationSection(path)).toBe('customers')
    for (const path of ['/data', '/databases/db-id', '/items/page-id', '/items/canvas-id']) {
      expect(serverNavigationSection(path)).toBe('data')
      expect(hasServerNavigationMenu(path)).toBe(true)
    }
    for (const path of ['/projects/board', '/projects/my-tasks', '/projects/mark/task-id']) expect(serverNavigationSection(path)).toBe('tasks')
    for (const path of ['/projects', '/projects/project-id', '/runs', '/runs/run-id']) {
      expect(serverNavigationSection(path)).toBe('factory')
      expect(hasServerNavigationMenu(path)).toBe(true)
    }
  })

  it('keeps the earlier addresses in their sections while they redirect', () => {
    expect(serverNavigationSection('/tasks')).toBe('tasks')
    for (const path of ['/factory', '/factory/projects/project-id']) expect(serverNavigationSection(path)).toBe('factory')
    expect(serverNavigationSection('/gadgets')).toBe('apps')
    expect(apiModuleSection('/api/gadgets/app-id')).toBe('apps')
  })

  it('opens Scheduled directly and assigns its page and API to its own module', () => {
    expect(serverNavigationSection('/schedules')).toBe('schedules')
    expect(hasServerNavigationMenu('/schedules')).toBe(false)
    expect(apiModuleSection('/api/schedules')).toBe('schedules')
    expect(apiModuleSection('/api/schedules/id/occurrences')).toBe('schedules')
    expect(apiModuleSection('/api/agents')).toBe('agents')
  })

  it('keeps the mobile primary tabs active on their nested routes', () => {
    for (const path of ['/inbox', '/channels/c/threads/t', '/projects/board', '/items/id']) {
      expect(isMobilePrimarySection(path)).toBe(true)
    }
    for (const path of ['/schedules', '/runs/id', '/mail/mb/inbox', '/agents/id', '/media', '/settings']) {
      expect(isMobilePrimarySection(path)).toBe(false)
    }
  })

  it('leaves settings with only the compact rail', () => {
    for (const path of ['/server/server-id/settings', '/channels-other']) {
      expect(hasServerNavigationMenu(path)).toBe(false)
    }
    expect(serverNavigationSection('/channels-other')).toBeNull()
  })
})
