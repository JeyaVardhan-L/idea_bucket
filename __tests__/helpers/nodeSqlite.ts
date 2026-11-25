/* A tiny expo-sqlite look-alike over Node's built-in SQLite, for integration tests. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');

type Params = (string | number | null)[];
const flat = (args: unknown[]): Params => (args.length === 1 && Array.isArray(args[0]) ? (args[0] as Params) : (args as Params));

export function createFakeDb() {
  const raw = new DatabaseSync(':memory:');
  const api = {
    execAsync: async (sql: string) => {
      raw.exec(sql);
    },
    runAsync: async (sql: string, ...args: unknown[]) => {
      const r = raw.prepare(sql).run(...flat(args));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getAllAsync: async (sql: string, ...args: unknown[]) => raw.prepare(sql).all(...flat(args)).map((r: object) => ({ ...r })),
    getFirstAsync: async (sql: string, ...args: unknown[]) => {
      const r = raw.prepare(sql).get(...flat(args));
      return r ? { ...r } : null;
    },
    withExclusiveTransactionAsync: async (task: (tx: unknown) => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await task(api);
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return api;
}
