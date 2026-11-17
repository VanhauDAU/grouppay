import type { D1Database } from '@cloudflare/workers-types';
import { SCHEMA_SQL } from './schemaString.js';

let isSchemaEnsured = false;

export async function ensureSchema(d1: D1Database): Promise<void> {
  if (isSchemaEnsured) return;
  try {
    const table = await d1.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'").first();
    if (!table) {
      await d1.exec(SCHEMA_SQL);
      console.log('Database schema successfully initialized!');
    }
    isSchemaEnsured = true;
  } catch (err) {
    console.error('Failed to ensure schema:', err);
  }
}

export class DatabaseHelper {
  constructor(private d1: D1Database) {}

  async queryFirst<T>(sql: string, params: any[] = []): Promise<T | null> {
    await ensureSchema(this.d1);
    const stmt = this.d1.prepare(sql).bind(...params);
    const result = await stmt.first<T>();
    return result || null;
  }

  async queryAll<T>(sql: string, params: any[] = []): Promise<T[]> {
    await ensureSchema(this.d1);
    const stmt = this.d1.prepare(sql).bind(...params);
    const result = await stmt.all<T>();
    return result.results || [];
  }

  async execute(sql: string, params: any[] = []): Promise<boolean> {
    await ensureSchema(this.d1);
    const stmt = this.d1.prepare(sql).bind(...params);
    const res = await stmt.run();
    return res.success;
  }

  prepare(sql: string, params: any[] = []) {
    return this.d1.prepare(sql).bind(...params);
  }

  async batch(statements: any[]): Promise<boolean> {
    await ensureSchema(this.d1);
    const results = await this.d1.batch(statements);
    return results.every((r) => r.success);
  }

  async exec(sql: string) {
    return await this.d1.exec(sql);
  }
}

export function getDb(env: { DB: D1Database }) {
  return new DatabaseHelper(env.DB);
}

