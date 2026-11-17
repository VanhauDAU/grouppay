import type { D1Database } from '@cloudflare/workers-types';

export class DatabaseHelper {
  constructor(private d1: D1Database) {}

  async queryFirst<T>(sql: string, params: any[] = []): Promise<T | null> {
    const stmt = this.d1.prepare(sql).bind(...params);
    const result = await stmt.first<T>();
    return result || null;
  }

  async queryAll<T>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.d1.prepare(sql).bind(...params);
    const result = await stmt.all<T>();
    return result.results || [];
  }

  async execute(sql: string, params: any[] = []): Promise<boolean> {
    const stmt = this.d1.prepare(sql).bind(...params);
    const res = await stmt.run();
    return res.success;
  }

  prepare(sql: string, params: any[] = []) {
    return this.d1.prepare(sql).bind(...params);
  }

  async batch(statements: any[]): Promise<boolean> {
    const results = await this.d1.batch(statements);
    return results.every((r) => r.success);
  }
}

export function getDb(env: { DB: D1Database }) {
  return new DatabaseHelper(env.DB);
}
