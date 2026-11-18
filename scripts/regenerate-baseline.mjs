import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Rewrites the unreleased Server baseline from drizzle/schema.ts. drizzle-kit writes
 * the tables; drizzle/baseline-indexes.sql replaces the expression indexes it cannot
 * write, and drizzle/baseline-custom.sql (search, triggers, seed rows) is appended.
 * Only for a baseline no release has published: after that, append migrations instead.
 *
 *   pnpm db:baseline            rewrite drizzle/server-migrations
 *   pnpm db:baseline --out dir  write somewhere else, e.g. to compare
 */
const root = resolve(import.meta.dirname, '..')
const outIndex = process.argv.indexOf('--out')
const out = resolve(root, outIndex >= 0 ? process.argv[outIndex + 1] : 'drizzle/server-migrations')
const config = join(root, '.baseline.config.ts')

rmSync(out, { recursive: true, force: true })
try {
  writeFileSync(config, `import { defineConfig } from 'drizzle-kit'\nexport default defineConfig({ schema: './drizzle/schema.ts', out: ${JSON.stringify(`./${relative(root, out)}`)}, dialect: 'sqlite' })\n`)
  const run = spawnSync('pnpm', ['exec', 'drizzle-kit', 'generate', '--name', 'baseline', '--config', config], { cwd: root, encoding: 'utf8' })
  if (run.status !== 0 || !run.stdout.includes('0000_baseline.sql')) throw new Error(`drizzle-kit generate failed\n${run.stdout}${run.stderr}`)
}
finally {
  rmSync(config, { force: true })
}

const file = join(out, '0000_baseline.sql')
const expressions = new Map(readFileSync(join(root, 'drizzle/baseline-indexes.sql'), 'utf8').split('\n')
  .filter(line => line.startsWith('CREATE'))
  .map(line => [/INDEX\s+`?(\w+)`?/u.exec(line)[1], line.replace(/;?\s*$/u, ';')]))
const used = new Set()
const tables = readFileSync(file, 'utf8').split('\n').map((line) => {
  const name = /^CREATE (?:UNIQUE )?INDEX `(\w+)`/u.exec(line)?.[1]
  if (!name || !expressions.has(name)) return line
  used.add(name)
  return expressions.get(name) + (line.includes('--> statement-breakpoint') ? '--> statement-breakpoint' : '')
}).join('\n').trimEnd()
for (const name of expressions.keys()) if (!used.has(name)) throw new Error(`drizzle/baseline-indexes.sql names ${name}, which the schema no longer has`)

const custom = readFileSync(join(root, 'drizzle/baseline-custom.sql'), 'utf8')
const baseline = `${tables.endsWith('--> statement-breakpoint') ? tables : `${tables}--> statement-breakpoint`}\n${custom.trimEnd()}\n`
writeFileSync(file, baseline)

// The same transformation server/utils/db.ts applies before D1 exec, run once on an empty database.
const sql = baseline.split('--> statement-breakpoint')
  .map(statement => statement.split('\n').filter(line => !line.trimStart().startsWith('--')).join(' ').replace(/\s+/gu, ' ').trim())
  .filter(Boolean).map(statement => statement.endsWith(';') ? statement : `${statement};`).join('\n')
const db = new DatabaseSync(':memory:')
db.exec(sql)
const marker = db.prepare('SELECT version FROM server_schema').get()?.version
console.log(`Wrote ${relative(root, file)} (${marker}), ${db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get().n} tables`)
