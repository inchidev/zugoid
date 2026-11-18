import { fileStorage } from '../../shared/file-storage'
import type { ZugoidEnv } from '../../workers/env'
import { createStorageBackup } from '../../shared/storage-backup'
export function createServerBackup(env: ZugoidEnv, createdAt: string, version: string) {
  return createStorageBackup(env.DB, fileStorage(env), createdAt, version)
}
