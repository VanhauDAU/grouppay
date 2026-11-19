import type { D1Database, D1Result } from '@cloudflare/workers-types';
import { SCHEMA_SQL } from './schemaString.js';

let isSchemaEnsured = false;
let schemaPromise: Promise<void> | null = null;

/**
 * Migration nhẹ: chỉ thêm index (an toàn, idempotent). Index đúng chỗ giúp D1 không phải quét toàn bảng
 * -> giảm mạnh "rows read" (đơn vị tính tiền chính của D1) cho các truy vấn theo payment_id / expense_id / source_id.
 * Marker = index cuối cùng trong danh sách; nếu đã có thì bỏ qua hoàn toàn (chỉ tốn 1 truy vấn / isolate).
 */
const MIGRATION_MARKER = 'idx_push_subscriptions_member';
const MIGRATION_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_allocations_recipient ON payment_allocations(recipient_member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expense_payers_expense ON expense_payers(expense_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_debt_obligations_source ON debt_obligations(source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_debt_obligations_pair ON debt_obligations(group_id, debtor_member_id, creditor_member_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_group_status ON payments(group_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_activities_group_occurred ON activities(group_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_group_created ON notifications(group_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_group_created ON audit_logs(group_id, created_at)`,
  // Chống ghi nhận trùng ở tầng DB (BR-24)
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_group_idem_unique ON payments(group_id, idempotency_key)`,
  // Đăng ký Web Push theo thiết bị (1 endpoint = 1 thiết bị/trình duyệt)
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
     id TEXT PRIMARY KEY,
     group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
     endpoint TEXT NOT NULL,
     p256dh TEXT NOT NULL,
     auth TEXT NOT NULL,
     user_agent TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_group_endpoint ON push_subscriptions(group_id, endpoint)`,
  // Marker: đặt cuối cùng
  `CREATE INDEX IF NOT EXISTS ${MIGRATION_MARKER} ON push_subscriptions(group_id, member_id)`
];

async function runSchema(d1: D1Database): Promise<void> {
  const rows = await d1
    .prepare(`SELECT name FROM sqlite_master WHERE name IN ('groups', ?)`)
    .bind(MIGRATION_MARKER)
    .all<{ name: string }>();
  const names = new Set((rows.results || []).map((r) => r.name));

  if (!names.has('groups')) {
    // D1 exec() chạy TỪNG DÒNG như 1 câu lệnh -> CREATE TABLE nhiều dòng sẽ lỗi.
    // Tách theo dấu ';' (bỏ comment) và chạy trong 1 batch.
    const statements = SCHEMA_SQL.split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((sql) => sql.trim())
      .filter(Boolean)
      .map((sql) => d1.prepare(sql));
    await d1.batch(statements);
    console.log('Database schema successfully initialized!');
  }
  if (!names.has(MIGRATION_MARKER)) {
    for (const sql of MIGRATION_SQL) {
      try {
        await d1.prepare(sql).run();
      } catch (err) {
        // Ví dụ: dữ liệu cũ có idempotency_key trùng -> bỏ qua unique index, vẫn chạy tiếp
        console.error('Migration statement failed:', sql, err);
      }
    }
  }
  isSchemaEnsured = true;
}

export async function ensureSchema(d1: D1Database): Promise<void> {
  if (isSchemaEnsured) return;
  if (!schemaPromise) {
    schemaPromise = runSchema(d1).catch((err) => {
      console.error('Failed to ensure schema:', err);
      schemaPromise = null;
    });
  }
  await schemaPromise;
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
    const results = await this.batchResults(statements);
    return results.every((r) => r.success);
  }

  /** D1 batch chạy tuần tự trong 1 transaction; trả về kết quả từng câu để đọc meta.changes. */
  async batchResults(statements: any[]): Promise<D1Result[]> {
    await ensureSchema(this.d1);
    if (statements.length === 0) return [];
    return (await this.d1.batch(statements)) as D1Result[];
  }

  async exec(sql: string) {
    return await this.d1.exec(sql);
  }
}

export function getDb(env: { DB: D1Database }) {
  return new DatabaseHelper(env.DB);
}
