/**
 * Fills every table of a Server database with a few rows whose foreign keys all resolve and
 * which satisfy every CHECK of `checksFrom` (the schema the rows must still fit after a
 * migration). Values mean nothing: the rows exist to prove a migration keeps them.
 */
const ROWS = 3

const quote = name => `"${name.replaceAll('"', '""')}"`

export function dataTables(db) {
  return db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name <> 'd1_migrations'
    AND sql NOT LIKE 'CREATE VIRTUAL%' AND name NOT LIKE 'message_search_%'`).all().map(row => row.name).sort()
}

/** Values a CHECK names for a column, as in `status in ('pending', 'active')` or `version = 'server-v2'`. */
function namedValues(sql) {
  const values = new Map()
  for (const match of sql.matchAll(/[`"]?(\w+)[`"]?\s+in\s*\(\s*((?:'[^']*'|-?\d+)(?:\s*,\s*(?:'[^']*'|-?\d+))*)\s*\)/giu)) {
    values.set(match[1], [...match[2].matchAll(/'([^']*)'|(-?\d+)/gu)].map(value => value[1] ?? Number(value[2])))
  }
  for (const match of sql.matchAll(/[`"]?(\w+)[`"]?\s*=\s*'([^']*)'/gu)) if (!values.has(match[1])) values.set(match[1], [match[2]])
  return values
}

function valueFor(table, column, row, named) {
  const choices = named.get(column.name)
  if (choices?.length) return choices[row % choices.length]
  const type = column.type.toUpperCase()
  if (/_json$/u.test(column.name)) return '{}'
  if (type.includes('INT')) return row + 1
  if (type.includes('REAL') || type.includes('NUM')) return row + 0.5
  if (type.includes('BLOB')) return new Uint8Array([row])
  return `${table}.${column.name}.${row}`
}

/** The expressions of every CHECK in a CREATE TABLE statement. */
export function checksOf(sql) {
  const checks = []
  const pattern = /\bCHECK\s*\(/giu
  let match
  while ((match = pattern.exec(sql))) {
    let depth = 1
    let index = match.index + match[0].length
    const start = index
    for (; index < sql.length && depth; index++) {
      if (sql[index] === '(') depth++
      else if (sql[index] === ')') depth--
    }
    checks.push(sql.slice(start, index - 1))
  }
  return checks
}

/** Point row i of every child at row i of its parent, so every key resolves and stays unique. */
function linkRows(db, tables) {
  for (const table of tables) {
    for (const key of db.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all()) {
      const parents = db.prepare(`SELECT ${quote(key.to ?? 'rowid')} AS value FROM ${quote(key.table)} ORDER BY rowid`).all().map(row => row.value)
      const children = db.prepare(`SELECT rowid AS id FROM ${quote(table)} ORDER BY rowid`).all().map(row => row.id)
      const update = db.prepare(`UPDATE ${quote(table)} SET ${quote(key.from)} = ? WHERE rowid = ?`)
      children.forEach((id, index) => update.run(parents.length ? parents[index % parents.length] : null, id))
    }
  }
}

export function fillDatabase(db, checksFrom = db) {
  // Seeding is not what is tested: triggers come off while rows go in and come back after.
  const triggers = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger'`).all()
  for (const trigger of triggers) db.exec(`DROP TRIGGER ${quote(trigger.name)}`)
  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('PRAGMA ignore_check_constraints = ON')
  const tables = dataTables(db)
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_xinfo(${quote(table)})`).all().filter(column => column.hidden === 0)
    const named = namedValues(db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(table).sql)
    const insert = db.prepare(`INSERT OR IGNORE INTO ${quote(table)} (${columns.map(column => quote(column.name)).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    for (let row = 0; row < ROWS; row++) insert.run(...columns.map(column => valueFor(table, column, row, named)))
  }
  // A key that is itself a reference moves with its own parent: repeat until all resolve.
  for (let pass = 0; pass < 10 && db.prepare('PRAGMA foreign_key_check').all().length; pass++) linkRows(db, tables)

  // Drop the rows no CHECK of either schema allows, then the rows left pointing at them.
  const schemas = [db, checksFrom]
  for (let pass = 0; pass < 10; pass++) {
    let removed = 0
    for (const schema of schemas) {
      for (const { name, sql } of schema.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table'`).all()) {
        if (!tables.includes(name)) continue
        for (const check of checksOf(sql)) {
          try { removed += Number(db.prepare(`DELETE FROM ${quote(name)} WHERE NOT (${check})`).run().changes) }
          catch { /* A CHECK on a column this schema does not have yet. */ }
        }
      }
    }
    for (const orphan of db.prepare('PRAGMA foreign_key_check').all()) {
      removed += Number(db.prepare(`DELETE FROM ${quote(orphan.table)} WHERE rowid = ?`).run(orphan.rowid).changes)
    }
    if (!removed) break
  }
  db.exec('PRAGMA ignore_check_constraints = OFF')
  for (const trigger of triggers) db.exec(trigger.sql)
  db.exec("INSERT INTO message_search (message_id, content) VALUES ('messages.id.0', 'kept search words')")
  db.exec('PRAGMA foreign_keys = ON')
}

export function contents(db) {
  return Object.fromEntries(dataTables(db).map(table => [table,
    db.prepare(`SELECT rowid AS _rowid, * FROM ${quote(table)} ORDER BY rowid`).all()]))
}
