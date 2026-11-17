-- Cloudflare D1 SQLite Schema for TinhTien (Group Expense & Debt Management)

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  public_code TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT DEFAULT 'VND',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_sessions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  device_info TEXT,
  last_active_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  member_id TEXT UNIQUE NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  bank_bin TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  is_qr_enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  created_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  split_type TEXT DEFAULT 'EQUAL',
  created_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_payers (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount_paid INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_splits (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount_owed INTEGER NOT NULL,
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS debt_obligations (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- 'EXPENSE', 'INITIAL_DEBT', 'ADJUSTMENT'
  source_id TEXT NOT NULL,
  debtor_member_id TEXT NOT NULL REFERENCES members(id),
  creditor_member_id TEXT NOT NULL REFERENCES members(id),
  original_amount INTEGER NOT NULL,
  settled_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'FULLY_SETTLED', 'CANCELLED'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  payer_member_id TEXT NOT NULL REFERENCES members(id),
  total_amount INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING_CONFIRMATION', -- 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'REVERSED'
  rejection_reason TEXT,
  proof_image_url TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  recipient_member_id TEXT NOT NULL REFERENCES members(id),
  debt_obligation_id TEXT REFERENCES debt_obligations(id),
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING_CONFIRMATION'
);

CREATE TABLE IF NOT EXISTS debt_adjustments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  activity_id TEXT REFERENCES activities(id),
  reason TEXT NOT NULL,
  adjusted_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_revisions (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  modified_by_member_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  before_state TEXT NOT NULL,
  after_state TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  actor_member_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  target_member_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_settings (
  group_id TEXT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  reminder_day_of_week INTEGER DEFAULT 0,
  reminder_hour INTEGER DEFAULT 20,
  is_reminder_enabled INTEGER DEFAULT 1
);

-- Indexes for optimal queries
CREATE INDEX IF NOT EXISTS idx_groups_public_code ON groups(public_code);
CREATE INDEX IF NOT EXISTS idx_members_group_id ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_member_sessions_token ON member_sessions(token);
CREATE INDEX IF NOT EXISTS idx_activities_group_id ON activities(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_activity_id ON expenses(activity_id);
CREATE INDEX IF NOT EXISTS idx_debt_obligations_group_id ON debt_obligations(group_id);
CREATE INDEX IF NOT EXISTS idx_debt_obligations_debtor ON debt_obligations(debtor_member_id);
CREATE INDEX IF NOT EXISTS idx_debt_obligations_creditor ON debt_obligations(creditor_member_id);
CREATE INDEX IF NOT EXISTS idx_payments_group_id ON payments(group_id);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notifications_group_target ON notifications(group_id, target_member_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_group_id ON audit_logs(group_id);
