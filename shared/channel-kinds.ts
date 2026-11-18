/**
 * Channels that live under a parent and take its access, Space and section:
 * a Thread under a channel message, and a Customer Conversation under its Source.
 */
export function inheritsParentChannel(type: string): boolean {
  return type === 'thread' || type === 'conversation'
}

/** SQL list of the channel types that inherit their parent, for `type IN ${…}`. */
export const PARENTED_CHANNEL_TYPES_SQL = `('thread', 'conversation')`
