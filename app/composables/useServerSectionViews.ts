import { useQuery } from '@tanstack/vue-query'
import { pausedSections } from '~~/shared/features'
import { BOARD_ROUTE, mailPath } from '~~/shared/paths'
import { Permission } from '~~/shared/permissions'
import { chatNavigationTarget, serverNavigationSection } from '~~/shared/server-navigation'
import type { ChannelCategoryDTO, ChannelDTO, MailboxDTO, MemberDTO } from '~~/shared/types'

export type ServerSectionLink = {
  label: string
  icon: string
  to: string
  path: string
  count: number
  dot: boolean
}

export function sectionLinkLabel(item: ServerSectionLink) {
  if (item.count) return `${item.label}, ${item.count} unread conversations`
  return item.dot ? `${item.label}, unread` : item.label
}

export function useServerSectionViews(serverId: MaybeRefOrGetter<string>) {
  const { api } = useApi()
  const ui = useUiStore()
  const enabled = computed(() => Boolean(toValue(serverId)))
  const membersQ = useQuery({
    queryKey: computed(() => ['members', toValue(serverId)]),
    queryFn: () => api<{ members: MemberDTO[] }>(`/api/servers/${toValue(serverId)}/members`),
    enabled,
  })
  const { can, canAnyProject } = usePermissions(computed(() => membersQ.data.value?.members))
  const { attention } = useInbox(computed(() => toValue(serverId)))
  const channelsQ = useQuery({
    queryKey: computed(() => ['channels', toValue(serverId)]),
    enabled,
    queryFn: () => api<{ categories: ChannelCategoryDTO[]; channels: ChannelDTO[] }>(`/api/servers/${toValue(serverId)}/channels`),
  })
  const dmsQ = useQuery({
    queryKey: ['dms'],
    enabled,
    queryFn: () => api<{ channels: ChannelDTO[] }>('/api/dms'),
  })
  const mailboxesQ = useQuery({
    queryKey: ['mailboxes'],
    enabled,
    queryFn: () => api<{ mailboxes: MailboxDTO[] }>('/api/mail/mailboxes'),
    refetchInterval: 15_000,
  })

  const channels = computed(() => channelsQ.data.value?.channels ?? [])
  const categories = computed(() => channelsQ.data.value?.categories ?? [])
  const mailboxes = computed(() => mailboxesQ.data.value?.mailboxes ?? [])
  const chatUnread = computed(() => [...channels.value, ...(dmsQ.data.value?.channels ?? [])].some(channel => channel.unread))
  const chatTarget = computed(() => {
    const last = ui.last()
    return chatNavigationTarget([...channels.value, ...(dmsQ.data.value?.channels ?? [])], last?.serverId === toValue(serverId) ? last.channelId : undefined)
  })
  const mailUnread = computed(() => mailboxes.value.some(mailbox => mailbox.unreadCount > 0))
  const customersTarget = computed(() => {
    const first = mailboxes.value[0]
    return first ? mailPath(first.channelId) : '/customers'
  })
  const hiddenSections = useHiddenSections()
  const showsTasks = computed(() => canAnyProject(Permission.readTasks))
  const showsFactory = computed(() => canAnyProject(Permission.readProjects))
  const views = computed<ServerSectionLink[]>(() => [
    { label: 'Inbox', icon: 'i-ph-tray', to: '/inbox', path: '/inbox', count: attention.value, dot: false },
    ...(can(Permission.manageSchedules) ? [{ label: 'Scheduled', icon: 'i-ph-clock', to: '/schedules', path: '/schedules', count: 0, dot: false }] : []),
    { label: 'Chat', icon: 'i-ph-chat-circle', to: chatTarget.value, path: '/channels', count: 0, dot: chatUnread.value },
    ...(showsTasks.value ? [{ label: 'Tasks', icon: 'i-ph-kanban', to: BOARD_ROUTE, path: BOARD_ROUTE, count: 0, dot: false }] : []),
    ...(showsFactory.value ? [{ label: 'Factory', icon: 'i-ph-git-branch', to: '/projects', path: '/projects', count: 0, dot: false }] : []),
    { label: 'Customers', icon: 'i-ph-address-book', to: customersTarget.value, path: '/customers', count: 0, dot: mailUnread.value },
    ...(can(Permission.useAgents) || can(Permission.manageAgents) ? [{ label: 'Agents', icon: 'i-ph-robot', to: '/agents', path: '/agents', count: 0, dot: false }] : []),
    ...(can(Permission.readData) ? [{ label: 'Data', icon: 'i-ph-stack', to: '/data', path: '/data', count: 0, dot: false }] : []),
    { label: 'Media', icon: 'i-ph-images', to: '/media', path: '/media', count: 0, dot: false },
    ...(can(Permission.useGadgets) || can(Permission.manageGadgets) ? [{ label: 'Apps', icon: 'i-ph-squares-four', to: '/gadgets', path: '/gadgets', count: 0, dot: false }] : []),
  ].filter((view) => {
    const section = serverNavigationSection(view.path)!
    return !pausedSections.has(section) && !hiddenSections.value.has(section)
  }))
  return { membersQ, channels, categories, dmsQ, views, can, showsTasks, showsFactory }
}
