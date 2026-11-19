import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import {
  CreateActivitySchema,
  UpdateActivitySchema,
  CancelActivitySchema,
  buildActivityLedger,
  reconcileActivityObligations,
  type LedgerExpense,
  type ReconciledObligation
} from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb, type DatabaseHelper } from '../../db/db.js';
import { broadcastGroupEvent, auditStatement, notificationStatement } from '../../services/realtime.js';
import { pushToMembers } from '../../services/push.js';

export const activitiesRouter = new Hono<AppEnv>();

// Danh sách hoạt động
activitiesRouter.get('/:groupCode/activities', requireGroup, async (c) => {
  const group = c.get('group');
  const db = getDb(c.env);

  const activities = await db.queryAll<{
    id: string;
    group_id: string;
    title: string;
    description: string | null;
    occurred_at: string;
    status: string;
    created_by_member_id: string;
    created_at: string;
    updated_at: string;
    total_amount: number | null;
    expense_count: number;
  }>(
    `SELECT a.*,
            COALESCE(SUM(e.amount), 0) as total_amount,
            COUNT(e.id) as expense_count
     FROM activities a
     LEFT JOIN expenses e ON e.activity_id = a.id
     WHERE a.group_id = ?
     GROUP BY a.id
     ORDER BY a.occurred_at DESC`,
    [group.id]
  );

  return c.json({ success: true, data: activities });
});

// Chi tiết hoạt động
activitiesRouter.get('/:groupCode/activities/:id', requireGroup, async (c) => {
  const group = c.get('group');
  const activityId = c.req.param('id');
  const db = getDb(c.env);

  const activity = await db.queryFirst<{
    id: string;
    group_id: string;
    title: string;
    description: string | null;
    occurred_at: string;
    status: string;
    created_by_member_id: string;
    created_at: string;
    updated_at: string;
  }>(`SELECT * FROM activities WHERE id = ? AND group_id = ?`, [activityId, group.id]);

  if (!activity) {
    return c.json({ success: false, error: 'Hoạt động không tồn tại' }, 404);
  }

  const expenses = await db.queryAll<{
    id: string;
    activity_id: string;
    title: string;
    amount: number;
    split_type: string;
    created_by_member_id: string;
  }>(`SELECT * FROM expenses WHERE activity_id = ?`, [activityId]);

  const expenseDetails = await Promise.all(
    expenses.map(async (exp) => {
      const payers = await db.queryAll<{
        member_id: string;
        amount_paid: number;
        member_name: string;
      }>(
        `SELECT ep.member_id, ep.amount_paid, m.name as member_name
         FROM expense_payers ep
         JOIN members m ON m.id = ep.member_id
         WHERE ep.expense_id = ?`,
        [exp.id]
      );

      const splits = await db.queryAll<{
        member_id: string;
        amount_owed: number;
        order_index: number;
        member_name: string;
      }>(
        `SELECT es.member_id, es.amount_owed, es.order_index, m.name as member_name
         FROM expense_splits es
         JOIN members m ON m.id = es.member_id
         WHERE es.expense_id = ?
         ORDER BY es.order_index ASC`,
        [exp.id]
      );

      return {
        ...exp,
        payers,
        splits
      };
    })
  );

  const obligations = await db.queryAll<{
    id: string;
    debtor_member_id: string;
    creditor_member_id: string;
    original_amount: number;
    settled_amount: number;
    status: string;
    debtor_name: string;
    creditor_name: string;
  }>(
    `SELECT ob.*, m1.name as debtor_name, m2.name as creditor_name
     FROM debt_obligations ob
     JOIN members m1 ON m1.id = ob.debtor_member_id
     JOIN members m2 ON m2.id = ob.creditor_member_id
     WHERE ob.source_id = ? AND ob.source_type IN ('EXPENSE', 'ADJUSTMENT') AND ob.status != 'CANCELLED'`,
    [activityId]
  );

  const revisions = await db.queryAll<{
    id: string;
    modified_by_member_id: string;
    reason: string;
    created_at: string;
  }>(`SELECT id, modified_by_member_id, reason, created_at FROM activity_revisions WHERE activity_id = ? ORDER BY created_at DESC`, [
    activityId
  ]);

  return c.json({
    success: true,
    data: {
      ...activity,
      expenses: expenseDetails,
      obligations,
      revisions
    }
  });
});

// ---------- helpers dùng chung cho tạo / sửa / hủy ----------

async function loadGroupMemberIds(db: DatabaseHelper, groupId: string) {
  const rows = await db.queryAll<{ id: string }>(`SELECT id FROM members WHERE group_id = ?`, [groupId]);
  return new Set(rows.map((r) => r.id));
}

/** Câu lệnh ghi khoản chi + người trả + phân bổ. */
function expenseStatements(
  db: DatabaseHelper,
  groupId: string,
  activityId: string,
  creatorId: string,
  expenses: LedgerExpense[],
  now: string
) {
  const statements: any[] = [];
  for (const exp of expenses) {
    const expenseId = nanoid();
    statements.push(
      db.prepare(
        `INSERT INTO expenses (id, activity_id, group_id, title, amount, split_type, created_by_member_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [expenseId, activityId, groupId, exp.title, exp.amount, exp.splitType, creatorId, now, now]
      )
    );
    for (const p of exp.payers) {
      statements.push(
        db.prepare(`INSERT INTO expense_payers (id, expense_id, member_id, amount_paid) VALUES (?, ?, ?, ?)`, [
          nanoid(),
          expenseId,
          p.memberId,
          p.amountPaid
        ])
      );
    }
    for (const sp of exp.splits) {
      statements.push(
        db.prepare(
          `INSERT INTO expense_splits (id, expense_id, member_id, amount_owed, order_index) VALUES (?, ?, ?, ?, ?)`,
          [nanoid(), expenseId, sp.memberId, sp.amountOwed, sp.orderIndex]
        )
      );
    }
  }
  return statements;
}

/** Câu lệnh ghi nghĩa vụ nợ đã đối soát (EXPENSE + ADJUSTMENT hoàn tiền) của 1 hoạt động. */
function obligationStatements(
  db: DatabaseHelper,
  groupId: string,
  activityId: string,
  obligations: ReconciledObligation[],
  now: string
) {
  return obligations.map((ob) =>
    db.prepare(
      `INSERT INTO debt_obligations (id, group_id, source_type, source_id, debtor_member_id, creditor_member_id, original_amount, settled_amount, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nanoid(),
        groupId,
        ob.sourceType,
        activityId,
        ob.debtorMemberId,
        ob.creditorMemberId,
        ob.originalAmount,
        ob.settledAmount,
        ob.settledAmount >= ob.originalAmount ? 'FULLY_SETTLED' : 'ACTIVE',
        now,
        now
      ]
    )
  );
}

/** Nghĩa vụ hiện hành (chưa hủy) của hoạt động, dùng để đối soát tiền đã trả. */
async function loadLiveActivityObligations(db: DatabaseHelper, activityId: string) {
  const rows = await db.queryAll<{
    debtor_member_id: string;
    creditor_member_id: string;
    original_amount: number;
    settled_amount: number;
    source_type: string;
  }>(
    `SELECT debtor_member_id, creditor_member_id, original_amount, settled_amount, source_type
     FROM debt_obligations
     WHERE source_id = ? AND source_type IN ('EXPENSE', 'ADJUSTMENT') AND status != 'CANCELLED'`,
    [activityId]
  );
  return rows.map((r) => ({
    debtorMemberId: r.debtor_member_id,
    creditorMemberId: r.creditor_member_id,
    originalAmount: r.original_amount,
    settledAmount: r.settled_amount,
    sourceType: r.source_type
  }));
}

function cancelLiveObligationsStatement(db: DatabaseHelper, activityId: string, now: string) {
  return db.prepare(
    `UPDATE debt_obligations SET status = 'CANCELLED', updated_at = ?
     WHERE source_id = ? AND source_type IN ('EXPENSE', 'ADJUSTMENT') AND status != 'CANCELLED'`,
    [now, activityId]
  );
}

// Tạo hoạt động mới (kèm nhiều khoản chi, nhiều người trả, phân bổ chi phí)
activitiesRouter.post('/:groupCode/activities', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateActivitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { title, description, occurredAt, expenses } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const ledger = buildActivityLedger(expenses, await loadGroupMemberIds(db, group.id));
  if (!ledger.ok) {
    return c.json({ success: false, error: ledger.error }, 400);
  }

  const activityId = nanoid();
  const creatorId = currentMember?.id || ledger.expenses[0].payers[0].memberId;
  const total = ledger.totalAmount;

  const statements: any[] = [
    db.prepare(
      `INSERT INTO activities (id, group_id, title, description, occurred_at, status, created_by_member_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [activityId, group.id, title, description || null, occurredAt, creatorId, now, now]
    ),
    ...expenseStatements(db, group.id, activityId, creatorId, ledger.expenses, now),
    ...obligationStatements(db, group.id, activityId, reconcileActivityObligations(ledger.obligations, []), now),
    auditStatement(db, group.id, creatorId, 'ACTIVITY_CREATED', 'activity', activityId, { title, totalAmount: total }),
    notificationStatement(
      db,
      group.id,
      null,
      'ACTIVITY_CREATED',
      `${currentMember?.name || 'Một thành viên'} thêm "${title}"`,
      `Tổng ${total.toLocaleString('vi-VN')}đ · chia cho ${new Set(ledger.expenses.flatMap((e) => e.splits.map((sp) => sp.memberId))).size} người.`
    )
  ];

  const success = await db.batch(statements);
  if (!success) {
    return c.json({ success: false, error: 'Không thể lưu hoạt động, vui lòng thử lại' }, 500);
  }

  await broadcastGroupEvent(c.env, group.id, 'activity.created', activityId, creatorId, { title, totalAmount: total });
  // Chỉ báo cho những người có liên quan (người trả / người được chia), trừ người vừa tạo
  const involved = new Set<string>();
  for (const e of ledger.expenses) {
    e.payers.forEach((p) => involved.add(p.memberId));
    e.splits.forEach((sp) => involved.add(sp.memberId));
  }
  involved.delete(creatorId);
  const creatorName = currentMember?.name || 'Một thành viên';
  c.executionCtx.waitUntil(
    pushToMembers(
      c.env,
      group.id,
      { memberIds: [...involved] },
      {
        title: `🧾 ${creatorName} thêm "${title}" ${total.toLocaleString('vi-VN')}đ`,
        body: `Nhóm ${group.name} · Bạn có phần trong khoản chi này. Chạm để xem bạn cần trả bao nhiêu.`,
        url: `/group/${group.publicCode}`,
        tag: `activity-${activityId}`
      },
      { urgency: 'normal' }
    )
  );

  return c.json({ success: true, data: { id: activityId, title, totalAmount: total } });
});

// Chỉnh sửa hoạt động (BR-16, BR-18): đối soát tiền đã trả, không tính nợ 2 lần
activitiesRouter.patch('/:groupCode/activities/:id', requireGroup, async (c) => {
  const group = c.get('group');
  const activityId = c.req.param('id');
  const currentMember = c.get('currentMember');
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateActivitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { title, description, occurredAt, reason, expenses } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const oldActivity = await db.queryFirst<{ id: string; title: string; status: string; created_by_member_id: string }>(
    `SELECT * FROM activities WHERE id = ? AND group_id = ?`,
    [activityId, group.id]
  );
  if (!oldActivity) {
    return c.json({ success: false, error: 'Hoạt động không tồn tại' }, 404);
  }
  if (oldActivity.status === 'CANCELLED') {
    return c.json({ success: false, error: 'Không thể chỉnh sửa hoạt động đã bị hủy' }, 400);
  }

  const ledger = buildActivityLedger(expenses, await loadGroupMemberIds(db, group.id));
  if (!ledger.ok) {
    return c.json({ success: false, error: ledger.error }, 400);
  }

  const modifierId = currentMember?.id || oldActivity.created_by_member_id;
  const [oldExpenses, liveObligations] = await Promise.all([
    db.queryAll(`SELECT * FROM expenses WHERE activity_id = ?`, [activityId]),
    loadLiveActivityObligations(db, activityId)
  ]);
  const reconciled = reconcileActivityObligations(ledger.obligations, liveObligations);
  const hadSettlement = liveObligations.some((o) => o.settledAmount > 0);

  const statements: any[] = [
    db.prepare(
      `INSERT INTO activity_revisions (id, activity_id, group_id, modified_by_member_id, reason, before_state, after_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nanoid(),
        activityId,
        group.id,
        modifierId,
        reason,
        JSON.stringify({ activity: oldActivity, expenses: oldExpenses, obligations: liveObligations }),
        JSON.stringify({ title, expenses: ledger.expenses, obligations: reconciled }),
        now
      ]
    ),
    db.prepare(
      `UPDATE activities SET title = COALESCE(?, title), description = ?, occurred_at = COALESCE(?, occurred_at), updated_at = ? WHERE id = ?`,
      [title || null, description === undefined ? (oldActivity as any).description ?? null : description, occurredAt || null, now, activityId]
    ),
    // Toàn bộ nghĩa vụ cũ được thay thế; tiền đã trả được chuyển sang nghĩa vụ mới qua reconcile
    cancelLiveObligationsStatement(db, activityId, now),
    db.prepare(`DELETE FROM expenses WHERE activity_id = ?`, [activityId]),
    ...expenseStatements(db, group.id, activityId, modifierId, ledger.expenses, now),
    ...obligationStatements(db, group.id, activityId, reconciled, now),
    auditStatement(db, group.id, modifierId, 'ACTIVITY_UPDATED', 'activity', activityId, { reason, totalAmount: ledger.totalAmount })
  ];

  if (hadSettlement) {
    statements.push(
      db.prepare(
        `INSERT INTO debt_adjustments (id, group_id, activity_id, reason, adjusted_by_member_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nanoid(), group.id, activityId, `Chỉnh sửa sau thanh toán: ${reason}`, modifierId, now]
      )
    );
  }

  const success = await db.batch(statements);
  if (!success) {
    return c.json({ success: false, error: 'Không thể cập nhật hoạt động' }, 500);
  }

  await broadcastGroupEvent(c.env, group.id, 'activity.updated', activityId, modifierId, { reason });

  return c.json({ success: true, message: 'Cập nhật hoạt động thành công' });
});

// Hủy hoạt động (BR-17): xóa nợ chưa trả, phần đã trả được ghi thành khoản hoàn tiền
activitiesRouter.post('/:groupCode/activities/:id/cancel', requireGroup, async (c) => {
  const group = c.get('group');
  const activityId = c.req.param('id');
  const currentMember = c.get('currentMember');
  const body = await c.req.json().catch(() => ({}));
  const parsed = CancelActivitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { reason } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const activity = await db.queryFirst<{ id: string; title: string; status: string; created_by_member_id: string }>(
    `SELECT * FROM activities WHERE id = ? AND group_id = ?`,
    [activityId, group.id]
  );
  if (!activity) {
    return c.json({ success: false, error: 'Hoạt động không tồn tại' }, 404);
  }
  if (activity.status === 'CANCELLED') {
    return c.json({ success: false, error: 'Hoạt động này đã bị hủy trước đó' }, 400);
  }

  const cancellerId = currentMember?.id || activity.created_by_member_id;
  const liveObligations = await loadLiveActivityObligations(db, activityId);
  const refunds = reconcileActivityObligations([], liveObligations);

  const results = await db.batchResults([
    db.prepare(`UPDATE activities SET status = 'CANCELLED', updated_at = ? WHERE id = ? AND status != 'CANCELLED'`, [
      now,
      activityId
    ]),
    cancelLiveObligationsStatement(db, activityId, now),
    ...obligationStatements(db, group.id, activityId, refunds, now),
    db.prepare(
      `INSERT INTO debt_adjustments (id, group_id, activity_id, reason, adjusted_by_member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nanoid(), group.id, activityId, `Hủy hoạt động: ${reason}`, cancellerId, now]
    ),
    auditStatement(db, group.id, cancellerId, 'ACTIVITY_CANCELLED', 'activity', activityId, { reason }),
    notificationStatement(
      db,
      group.id,
      null,
      'ACTIVITY_CANCELLED',
      `Đã hủy "${activity.title}"`,
      `Lý do: ${reason}. Công nợ liên quan đã được tính lại.`
    )
  ]);
  if (!results.every((r) => r.success)) {
    return c.json({ success: false, error: 'Không thể hủy hoạt động' }, 500);
  }

  await broadcastGroupEvent(c.env, group.id, 'activity.cancelled', activityId, cancellerId, { reason });
  c.executionCtx.waitUntil(
    pushToMembers(
      c.env,
      group.id,
      { excludeMemberId: cancellerId },
      {
        title: `🗑️ Đã hủy "${activity.title}"`,
        body: `Nhóm ${group.name} · Lý do: ${reason}. Công nợ đã được tính lại.`,
        url: `/group/${group.publicCode}`,
        tag: `activity-${activityId}`
      },
      { urgency: 'normal' }
    )
  );

  return c.json({ success: true, message: 'Hoạt động đã được hủy thành công' });
});
