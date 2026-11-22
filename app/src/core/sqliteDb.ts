// The phone's database, opened through expo-sqlite, behind the small Db interface in persist.ts.
import * as SQLite from 'expo-sqlite';
import type { Db } from './persist';

export async function openPhoneDb(): Promise<Db> {
  const raw = await SQLite.openDatabaseAsync('trackbench.db');
  await raw.execAsync('pragma journal_mode = wal;');
  const bind = (p?: unknown[]) => (p ?? []) as SQLite.SQLiteBindParams;
  return {
    exec: (sql) => raw.execAsync(sql),
    all: <T,>(sql: string, params?: unknown[]) => raw.getAllAsync<T>(sql, bind(params)),
    run: async (sql, params) => { await raw.runAsync(sql, bind(params)); },
    runMany: async (sql, rows) => {
      const stmt = await raw.prepareAsync(sql);
      try {
        for (const r of rows) await stmt.executeAsync(bind(r));
      } finally {
        await stmt.finalizeAsync();
      }
    },
    transaction: (fn) => raw.withTransactionAsync(fn),
  };
}
