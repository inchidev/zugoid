import { installerError } from './errors.js'
import type { WorkerModules } from './types.js'

/** A release's Worker as it is uploaded: Nitro's modules when the release has them, else the one bundled script. */
export type WorkerScript = { worker: ArrayBuffer, modules?: WorkerModules }

/** The bundled script's module name, kept for releases made before modules shipped. */
export const BUNDLED_WORKER_MODULE = 'zugoid-worker.mjs'

const MODULE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*\.(?:mjs|js)$/u

/**
 * Nitro's server output as separate ES modules: a new isolate compiles a route's chunk only when that route is asked
 * for, where one bundled script makes it compile everything (about 0.5 s of every cold start on Cloudflare).
 */
export function parseWorkerModules(value: unknown): WorkerModules {
  const payload = value as Partial<WorkerModules> | null
  if (!payload || typeof payload.main !== 'string' || !Array.isArray(payload.modules) || !payload.modules.length) installerError(502, 'Zugoid Worker modules are invalid')
  const names = new Set<string>()
  for (const module of payload.modules) {
    if (!module || typeof module.name !== 'string' || typeof module.content !== 'string' || !MODULE_NAME.test(module.name) || names.has(module.name)) {
      installerError(502, 'Zugoid Worker modules are invalid')
    }
    names.add(module.name)
  }
  if (!names.has(payload.main)) installerError(502, 'Zugoid Worker modules have no main module')
  return { main: payload.main, modules: payload.modules }
}

export function workerMainModule(script: WorkerScript): string {
  return script.modules?.main ?? BUNDLED_WORKER_MODULE
}

/** Adds the Worker's code to a script upload, after its metadata. */
export function appendWorkerScript(form: FormData, script: WorkerScript): void {
  if (!script.modules) {
    form.append(BUNDLED_WORKER_MODULE, new Blob([script.worker], { type: 'application/javascript+module' }), BUNDLED_WORKER_MODULE)
    return
  }
  for (const module of script.modules.modules) {
    form.append(module.name, new Blob([module.content], { type: 'application/javascript+module' }), module.name)
  }
}
