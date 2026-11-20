import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, ftruncateSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

/**
 * Writes the one migration of the next release: from the schema every released migration
 * leaves to the one a fresh baseline of drizzle/schema.ts (with drizzle/baseline-indexes.sql
 * and drizzle/baseline-custom.sql) creates. Rerun it after every schema change; it rewrites
 * the release's migration in place.
 *
 *   pnpm db:generate --name customers_telegram   [--base origin/main]
 *
 * drizzle-kit's own SQLite migrations rebuild a table with `PRAGMA foreign_keys=OFF`, which
 * D1 ignores inside a migration, and `DROP TABLE` then deletes every row that references the
 * table, through ON DELETE CASCADE, in every table below it. This one copies a changed table
 * together with every table that references it, directly or not, drops them children first
 * with all triggers removed, recreates them and puts every row back with its rowid.
 */
const root = resolve(import.meta.dirname, '..')
const directory = 'drizzle/server-migrations'
const KEEP = 'zugoid_keep_'

/** The transformation server/utils/db.ts applies before D1 exec. */
export function statements(sql) {
  return sql.split('--> statement-breakpoint')
    .map(statement => statement.split('\n').filter(line => !line.trimStart().startsWith('--')).join(' ').replace(/\s+/gu, ' ').trim())
    .filter(Boolean).map(statement => statement.endsWith(';') ? statement : `${statement};`)
}

const quote = name => `\`${name.replaceAll('`', '``')}\``
const normalize = sql => sql.replace(/\s+/gu, ' ').replace(/\s*([(),;])\s*/gu, '$1').trim()
/** SQLite's own search index and its shadow tables are created by the virtual table. */
const isShadow = (name, virtuals) => virtuals.some(virtual => name.startsWith(`${virtual}_`))

export function schemaOf(db) {
  const rows = db.prepare(`SELECT type, name, tbl_name AS tableName, sql FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name <> 'd1_migrations' AND sql IS NOT NULL`).all()
  const virtuals = rows.filter(row => row.type === 'table' && /^CREATE VIRTUAL TABLE/iu.test(row.sql)).map(row => row.name)
  // Only tables are shadows: message_search_after_insert is an ordinary trigger.
  const pick = type => new Map(rows.filter(row => row.type === type && !(type === 'table' && isShadow(row.name, virtuals))).map(row => [row.name, row]))
  const tables = pick('table')
  const parents = new Map()
  const columns = new Map()
  const rowid = new Map()
  const selfActing = new Set()
  for (const name of tables.keys()) {
    if (virtuals.includes(name)) continue
    const keys = db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all()
    parents.set(name, new Set(keys.map(key => key.table).filter(parent => parent !== name)))
    if (keys.some(key => key.table === name && key.on_delete !== 'NO ACTION')) selfActing.add(name)
    const info = db.prepare(`PRAGMA table_xinfo(${quote(name)})`).all().filter(column => column.hidden === 0)
    columns.set(name, info)
    // Keep the rowid of an ordinary rowid table; an INTEGER PRIMARY KEY already is its rowid.
    const primary = info.filter(column => column.pk > 0)
    const aliased = primary.length === 1 && primary[0].type.toUpperCase() === 'INTEGER'
    rowid.set(name, !/WITHOUT\s+ROWID\s*;?\s*$/iu.test(tables.get(name).sql) && !aliased)
  }
  return { tables, virtuals, indexes: pick('index'), triggers: pick('trigger'), views: pick('view'), parents, columns, rowid, selfActing }
}

/** Every table that references one of `names`, directly or through others. */
function withDependents(names, ...schemas) {
  const children = new Map()
  for (const schema of schemas) {
    for (const [child, parents] of schema.parents) {
      for (const parent of parents) children.set(parent, (children.get(parent) ?? new Set()).add(child))
    }
  }
  const found = new Set(names)
  const stack = [...names]
  while (stack.length) {
    for (const child of children.get(stack.pop()) ?? []) {
      if (!found.has(child)) { found.add(child); stack.push(child) }
    }
  }
  return found
}

/** Parents before children; a cycle is broken where it is met, as deferred keys allow. */
function parentsFirst(names, schema) {
  const order = []
  const state = new Map()
  const visit = (name) => {
    if (state.get(name)) return
    state.set(name, 'visiting')
    for (const parent of schema.parents.get(name) ?? []) if (names.has(parent) && !state.get(parent)) visit(parent)
    state.set(name, 'done')
    order.push(name)
  }
  for (const name of [...names].sort()) visit(name)
  return order
}

/**
 * Children first. Dropping a table whose rows reference its own table with an ON DELETE action
 * (channels, task_attachments) looks up every parent it has, even when it is empty, so in a
 * cycle (channels and messages, tasks and task_attachments) such a table goes first.
 */
function childrenFirst(names, schema) {
  const left = new Set(names)
  const order = []
  const childrenLeft = name => [...left].some(other => other !== name && schema.parents.get(other)?.has(name))
  while (left.size) {
    const sorted = [...left].sort()
    const next = sorted.find(name => !childrenLeft(name)) ?? sorted.find(name => schema.selfActing.has(name)) ?? sorted[0]
    order.push(next)
    left.delete(next)
  }
  return order
}

export function migrationSql(before, after) {
  const changed = (left, right) => normalize(left.sql) !== normalize(right.sql)
  for (const name of before.virtuals) {
    if (!after.tables.has(name) || changed(before.tables.get(name), after.tables.get(name))) throw new Error(`Changing the virtual table ${name} is not supported here`)
  }
  for (const name of before.tables.keys()) {
    if (!after.tables.has(name)) throw new Error(`The schema drops the table ${name}; write that migration by hand`)
  }
  if (before.views.size || after.views.size) throw new Error('Views are not supported here')

  const added = new Set([...after.tables.keys()].filter(name => !before.tables.has(name)))
  const direct = [...after.tables.keys()].filter(name => before.tables.has(name) && !before.virtuals.includes(name) && changed(before.tables.get(name), after.tables.get(name)))
  // A new table that references a rebuilt one is only created, after it.
  const rebuilt = new Set([...withDependents(direct, before, after)].filter(name => !added.has(name)))
  const out = []
  const emit = sql => out.push(sql.trim().endsWith(';') ? sql.trim() : `${sql.trim()};`)

  if (rebuilt.size) emit('PRAGMA defer_foreign_keys = on')

  // A trigger on a dropped table goes with it, and any other one could fire on a rebuilt table's
  // rows or read one that is gone: with a rebuild every trigger comes off and the new set goes on.
  const triggersOff = rebuilt.size
    ? [...before.triggers.keys()]
    : [...before.triggers.keys()].filter(name => !after.triggers.has(name) || changed(before.triggers.get(name), after.triggers.get(name)))
  for (const name of triggersOff) emit(`DROP TRIGGER IF EXISTS ${quote(name)}`)

  for (const [name, index] of before.indexes) {
    if (rebuilt.has(index.tableName)) continue
    if (!after.indexes.has(name) || changed(index, after.indexes.get(name))) emit(`DROP INDEX IF EXISTS ${quote(name)}`)
  }

  const order = parentsFirst(rebuilt, before)
  for (const name of order) {
    const rowid = before.rowid.get(name) ? `rowid AS ${quote(`${KEEP}rowid`)}, ` : ''
    emit(`CREATE TABLE ${quote(KEEP + name)} AS SELECT ${rowid}* FROM ${quote(name)}`)
  }
  // Empty them while every one still exists: with deferred keys, deleting a row looks up its
  // parent, so a table whose parent is already dropped (tasks and task_attachments reference
  // each other) cannot be dropped with rows in it. Empty tables then drop without lookups.
  const dropping = childrenFirst(rebuilt, before)
  for (const name of dropping) emit(`DELETE FROM ${quote(name)}`)
  for (const name of dropping) emit(`DROP TABLE ${quote(name)}`)

  const created = parentsFirst(new Set([...rebuilt, ...added]), after)
  for (const name of created) emit(after.tables.get(name).sql)
  for (const name of parentsFirst(rebuilt, after)) {
    const kept = new Set(before.columns.get(name).map(column => column.name))
    const target = after.columns.get(name)
    const missing = target.filter(column => !kept.has(column.name) && column.notnull && column.dflt_value === null && !column.pk)
    if (missing.length) throw new Error(`${name}.${missing[0].name} is new, NOT NULL and has no default: existing rows have no value for it`)
    const names = target.map(column => column.name).filter(column => kept.has(column))
    const rowid = before.rowid.get(name) && after.rowid.get(name)
    const into = [...(rowid ? ['rowid'] : []), ...names.map(quote)].join(', ')
    const from = [...(rowid ? [quote(`${KEEP}rowid`)] : []), ...names.map(quote)].join(', ')
    emit(`INSERT INTO ${quote(name)} (${into}) SELECT ${from} FROM ${quote(KEEP + name)}${rowid ? ` ORDER BY ${quote(`${KEEP}rowid`)}` : ''}`)
  }
  for (const name of order) emit(`DROP TABLE ${quote(KEEP + name)}`)

  for (const [name, index] of after.indexes) {
    const fresh = rebuilt.has(index.tableName) || added.has(index.tableName)
    if (fresh || !before.indexes.has(name) || changed(before.indexes.get(name), index)) emit(index.sql)
  }
  const triggersOn = rebuilt.size
    ? [...after.triggers.keys()]
    : [...after.triggers.keys()].filter(name => !before.triggers.has(name) || changed(before.triggers.get(name), after.triggers.get(name)))
  for (const name of triggersOn) emit(after.triggers.get(name).sql)

  return { sql: out, rebuilt: [...rebuilt].sort(), added: [...added].sort(), direct: direct.sort() }
}

export function databaseFrom(sqlFiles) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const sql of sqlFiles) db.exec(statements(sql).join('\n'))
  return db
}

/** Two schemas say the same when every table, index and trigger has the same SQL. */
export function schemaDifferences(left, right) {
  const differences = []
  for (const kind of ['tables', 'indexes', 'triggers']) {
    for (const name of new Set([...left[kind].keys(), ...right[kind].keys()])) {
      const a = left[kind].get(name)?.sql
      const b = right[kind].get(name)?.sql
      if (!a || !b || normalize(a) !== normalize(b)) differences.push(`${kind}: ${name}`)
    }
  }
  return differences
}

const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

/** A descriptor for writing an existing file, or null when there is none. */
function openExisting(file) {
  try { return openSync(file, 'r+') }
  catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function main() {
  const argument = (flag) => {
    const index = process.argv.indexOf(flag)
    return index >= 0 ? process.argv[index + 1] : undefined
  }
  const base = argument('--base') ?? process.env.MIGRATION_BASE_SHA ?? 'origin/main'
  const files = readdirSync(join(root, directory)).filter(name => name.endsWith('.sql')).sort()
  const frozen = new Set(git(['ls-tree', '--name-only', `${base}:${directory}`]).split('\n').filter(name => name.endsWith('.sql')))
  const released = files.filter(name => frozen.has(name))
  const pending = files.filter(name => !frozen.has(name))
  if (pending.length > 1) throw new Error(`One release adds one migration; found ${pending.join(', ')}`)
  const slug = argument('--name') ?? pending[0]?.replace(/^\d{4}_|\.sql$/gu, '')
  if (!slug || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(slug)) throw new Error('Name the migration: pnpm db:generate --name some_words')

  const before = databaseFrom(released.map(name => readFileSync(join(root, directory, name), 'utf8')))
  // Inside the checkout: drizzle-kit resolves its output relative to it.
  const work = mkdtempSync(join(root, '.migration-'))
  try {
    const fresh = join(work, 'fresh')
    execFileSync('node', [join(root, 'scripts/regenerate-baseline.mjs'), '--out', relative(root, fresh)], { cwd: root, stdio: 'pipe' })
    const after = databaseFrom([readFileSync(join(fresh, '0000_baseline.sql'), 'utf8')])
    const plan = migrationSql(schemaOf(before), schemaOf(after))
    if (!plan.sql.length) {
      console.log('No schema changes: no migration written')
      return
    }

    // Drop this release's earlier draft, so drizzle-kit writes its snapshot from the released one.
    const journalPath = join(root, directory, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
    for (const name of pending) {
      const number = name.slice(0, 4)
      rmSync(join(root, directory, name))
      rmSync(join(root, directory, `meta/${number}_snapshot.json`), { force: true })
      journal.entries = journal.entries.filter(entry => entry.tag !== name.replace(/\.sql$/u, ''))
    }
    writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}`)

    // drizzle-kit keeps its snapshot, which `pnpm db:schema:check` compares the schema with; the SQL is ours.
    const run = spawnSync('pnpm', ['exec', 'drizzle-kit', 'generate', '--name', slug], { cwd: root, encoding: 'utf8' })
    const number = String(released.length).padStart(4, '0')
    const file = join(root, directory, `${number}_${slug}.sql`)
    // Open the file drizzle-kit wrote and overwrite it through that handle, so nothing can swap it in between.
    let handle = openExisting(file)
    if (handle === null) {
      const custom = spawnSync('pnpm', ['exec', 'drizzle-kit', 'generate', '--custom', '--name', slug], { cwd: root, encoding: 'utf8' })
      handle = openExisting(file)
      if (handle === null) throw new Error(`drizzle-kit wrote no ${relative(root, file)}\n${run.stdout}${run.stderr}${custom.stdout}${custom.stderr}`)
    }
    const header = [
      `-- Written by scripts/generate-migration.mjs from drizzle/schema.ts. Rerun it; do not edit.`,
      plan.direct.length ? `-- Changed: ${plan.direct.join(', ')}` : '',
      plan.rebuilt.length > plan.direct.length ? `-- Rebuilt with them, as they reference them: ${plan.rebuilt.filter(name => !plan.direct.includes(name)).join(', ')}` : '',
      plan.added.length ? `-- New: ${plan.added.join(', ')}` : '',
    ].filter(Boolean).join('\n')
    ftruncateSync(handle, 0)
    writeSync(handle, `${header}\n${plan.sql.join('\n--> statement-breakpoint\n')}\n`, 0)
    closeSync(handle)

    // The released chain plus this file must create exactly what a fresh baseline creates.
    const migrated = databaseFrom([...released, `${number}_${slug}.sql`].map(name => readFileSync(join(root, directory, name), 'utf8')))
    const differences = schemaDifferences(schemaOf(migrated), schemaOf(after))
    if (differences.length) throw new Error(`The migration does not reach the schema:\n${differences.join('\n')}`)
    console.log(`Wrote ${relative(root, file)}: ${plan.direct.length} changed, ${plan.rebuilt.length} rebuilt, ${plan.added.length} new tables`)
  }
  finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main() }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
