// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { INIT_SQL } from '../../server/utils/db'
import { schemaDifferences, schemaOf, statements } from '../../scripts/generate-migration.mjs'
import { contents, fillDatabase } from '../helpers/fill-database.mjs'

/**
 * The newest migration keeps every row of every table. Each table of the schema before it is
 * filled with rows whose foreign keys all resolve; the migration then runs in one transaction
 * with foreign keys and CHECKs on, as D1 runs it, and every row, rowid and search entry must
 * still be there.
 */
const directory = resolve(import.meta.dirname, '../../drizzle/server-migrations')
const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort()
const read = (name: string) => readFileSync(join(directory, name), 'utf8')

describe(`migration ${files.at(-1)}`, () => {
  it.runIf(files.length > 1)('keeps every row of every table, with its rowid, and reaches the fresh schema', () => {
    const db = new DatabaseSync(':memory:')
    const fresh = new DatabaseSync(':memory:')
    try {
      fresh.exec(INIT_SQL)
      db.exec('PRAGMA foreign_keys = ON')
      for (const name of files.slice(0, -1)) db.exec(statements(read(name)).join('\n'))
      fillDatabase(db, fresh)
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      const before = contents(db)
      if (files.at(-1) === '0003_scheduled_conversations.sql') {
        before.agent_schedules = before.agent_schedules.map(row => ({ ...row, discussion_channel_id: null }))
      }
      expect(Object.values(before).filter(rows => rows.length).length).toBeGreaterThan(100)

      db.exec('BEGIN')
      db.exec(statements(read(files.at(-1)!)).join('\n'))
      db.exec('COMMIT')

      const after = contents(db)
      expect(Object.fromEntries(Object.keys(before).map(table => [table, after[table]]))).toEqual(before)
      expect(Object.entries(after).filter(([table, rows]) => !(table in before) && rows.length)).toEqual([])
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(db.prepare("SELECT message_id FROM message_search WHERE message_search MATCH 'kept'").all()).toEqual([{ message_id: 'messages.id.0' }])
      expect(schemaDifferences(schemaOf(db), schemaOf(fresh))).toEqual([])
    }
    finally {
      db.close()
      fresh.close()
    }
  })
})
