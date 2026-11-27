export const taskStatuses = ['backlog', 'ready', 'in_progress', 'review', 'done', 'failed'] as const

export type TaskStatus = typeof taskStatuses[number]

export const taskStatusLabels: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In progress',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
}
