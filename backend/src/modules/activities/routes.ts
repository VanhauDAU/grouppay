import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import {
  CreateActivitySchema,
  UpdateActivitySchema,
  CancelActivitySchema,
  splitEqual,
  validateExactSplit,
  validatePayers,
  generateObligationsFromExpense
} from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';
import { broadcastGroupEvent, logAudit, createNotification } from '../../services/realtime.js';

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
     WHERE ob.source_id = ? AND ob.source_type = 'EXPENSE'`,
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

// Tạo hoạt động mới (kèm nhiều khoản chi, nhiều người trả, phân bổ chi phí)
activitiesRouter.post('/:groupCode/activities', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const body = await c.req.json();
  const parsed = CreateActivitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { title, description, occurredAt, expenses } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();
  const activityId = nanoid();
  const creatorId = currentMember?.id || expenses[0].payers[0].memberId;

  const statements: any[] = [];

  // Tạo activity
  statements.push(
    db.prepare(
      `INSERT INTO activities (id, group_id, title, description, occurred_at, status, created_by_member_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [activityId, group.id, title, description || null, occurredAt, creatorId, now, now]
    )
  );

  let totalActivityAmount = 0;

  // Xử lý từng khoản chi
  for (const exp of expenses) {
    totalActivityAmount += exp.amount;
    const expenseId = nanoid();

    // 1. Kiểm tra người trả tiền
    const payerValidation = validatePayers(exp.amount, exp.payers);
    if (!payerValidation.isValid) {
      return c.json({ success: false, error: payerValidation.error }, 400);
    }

    // 2. Phân bổ chi phí cho người tham gia
    let splits: { memberId: string; amountOwed: number; orderIndex: number }[] = [];
    if (exp.splitType === 'EQUAL') {
      splits = splitEqual(exp.amount, exp.participants);
    } else {
      if (!exp.customSplits) {
        return c.json({ success: false, error: 'Thiếu dữ liệu phân bổ số tiền riêng' }, 400);
      }
      const splitValidation = validateExactSplit(exp.amount, exp.customSplits);
      if (!splitValidation.isValid) {
        return c.json({ success: false, error: splitValidation.error }, 400);
      }
      splits = exp.customSplits.map((s, idx) => ({ ...s, orderIndex: idx }));
    }

    // Insert expense
    statements.push(
      db.prepare(
        `INSERT INTO expenses (id, activity_id, group_id, title, amount, split_type, created_by_member_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [expenseId, activityId, group.id, exp.title, exp.amount, exp.splitType, creatorId, now, now]
      )
    );

    // Insert expense_payers
    for (const payer of exp.payers) {
      statements.push(
        db.prepare(
          `INSERT INTO expense_payers (id, expense_id, member_id, amount_paid)
           VALUES (?, ?, ?, ?)`,
          [nanoid(), expenseId, payer.memberId, payer.amountPaid]
        )
      );
    }

    // Insert expense_splits
    for (const split of splits) {
      statements.push(
        db.prepare(
          `INSERT INTO expense_splits (id, expense_id, member_id, amount_owed, order_index)
           VALUES (?, ?, ?, ?, ?)`,
          [nanoid(), expenseId, split.memberId, split.amountOwed, split.orderIndex]
        )
      );
    }

    // 3. Sinh các nghĩa vụ nợ gốc (debt_obligations)
    const generatedObligations = generateObligationsFromExpense(exp.payers, splits);
    for (const ob of generatedObligations) {
      statements.push(
        db.prepare(
          `INSERT INTO debt_obligations (id, group_id, source_type, source_id, debtor_member_id, creditor_member_id, original_amount, settled_amount, status, created_at, updated_at)
           VALUES (?, ?, 'EXPENSE', ?, ?, ?, ?, 0, 'ACTIVE', ?, ?)`,
          [nanoid(), group.id, activityId, ob.debtorMemberId, ob.creditorMemberId, ob.amount, now, now]
        )
      );
    }
  }

  const success = await db.batch(statements);
  if (!success) {
    return c.json({ success: false, error: 'Không thể lưu hoạt động, vui lòng thử lại' }, 500);
  }

  await broadcastGroupEvent(c.env, group.id, 'activity.created', activityId, creatorId, {
    title,
    totalAmount: totalActivityAmount
  });
  await broadcastGroupEvent(c.env, group.id, 'debt.created', activityId, creatorId);
  await logAudit(c.env, group.id, creatorId, 'ACTIVITY_CREATED', 'activity', activityId, {
    title,
    totalAmount: totalActivityAmount
  });
  await createNotification(
    c.env,
    group.id,
    null,
    'ACTIVITY_CREATED',
    'Hoạt động mới',
    `"${title}" với tổng chi phí ${totalActivityAmount.toLocaleString('vi-VN')}đ đã được tạo.`
  );

  return c.json({
    success: true,
    data: {
      id: activityId,
      title,
      totalAmount: totalActivityAmount
    }
  });
});

// Chỉnh sửa hoạt động (BR-16, BR-18)
activitiesRouter.patch('/:groupCode/activities/:id', requireGroup, async (c) => {
  const group = c.get('group');
  const activityId = c.req.param('id');
  const currentMember = c.get('currentMember');
  const body = await c.req.json();
  const parsed = UpdateActivitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { title, description, occurredAt, reason, expenses } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();
  const modifierId = currentMember?.id || 'anonymous';

  // Lấy dữ liệu cũ để lưu revision
  const oldActivity = await db.queryFirst<{ id: string; title: string; status: string }>(
    `SELECT * FROM activities WHERE id = ? AND group_id = ?`,
    [activityId, group.id]
  );
  if (!oldActivity) {
    return c.json({ success: false, error: 'Hoạt động không tồn tại' }, 404);
  }
  if (oldActivity.status === 'CANCELLED') {
    return c.json({ success: false, error: 'Không thể chỉnh sửa hoạt động đã bị hủy' }, 400);
  }

  const oldExpenses = await db.queryAll(`SELECT * FROM expenses WHERE activity_id = ?`, [activityId]);
  const beforeState = JSON.stringify({ activity: oldActivity, expenses: oldExpenses });

  // Kiểm tra các khoản nợ đã thanh toán một phần hoặc toàn bộ
  const settledObligations = await db.queryAll<{ id: string; settled_amount: number }>(
    `SELECT id, settled_amount FROM debt_obligations WHERE source_id = ? AND settled_amount > 0`,
    [activityId]
  );

  const statements: any[] = [];

  // Lưu bản ghi lịch sử revision
  const revisionId = nanoid();
  statements.push(
    db.prepare(
      `INSERT INTO activity_revisions (id, activity_id, group_id, modified_by_member_id, reason, before_state, after_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [revisionId, activityId, group.id, modifierId, reason, beforeState, JSON.stringify({ title, expenses }), now]
    )
  );

  // Cập nhật thông tin activity
  statements.push(
    db.prepare(
      `UPDATE activities SET title = COALESCE(?, title), description = COALESCE(?, description), occurred_at = COALESCE(?, occurred_at), updated_at = ? WHERE id = ?`,
      [title || null, description !== undefined ? description : null, occurredAt || null, now, activityId]
    )
  );

  // Đánh dấu các debt_obligations cũ chưa thanh toán thành CANCELLED
  statements.push(
    db.prepare(
      `UPDATE debt_obligations SET status = 'CANCELLED', updated_at = ? WHERE source_id = ? AND settled_amount = 0`,
      [now, activityId]
    )
  );

  // Xóa các khoản chi con cũ và nạp lại
  statements.push(db.prepare(`DELETE FROM expenses WHERE activity_id = ?`, [activityId]));

  let newTotal = 0;
  for (const exp of expenses) {
    newTotal += exp.amount;
    const expenseId = nanoid();

    const payerValidation = validatePayers(exp.amount, exp.payers);
    if (!payerValidation.isValid) {
      return c.json({ success: false, error: payerValidation.error }, 400);
    }

    let splits = exp.splitType === 'EQUAL' ? splitEqual(exp.amount, exp.participants) : exp.customSplits || [];

    statements.push(
      db.prepare(
        `INSERT INTO expenses (id, activity_id, group_id, title, amount, split_type, created_by_member_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [expenseId, activityId, group.id, exp.title, exp.amount, exp.splitType, modifierId, now, now]
      )
    );

    for (const p of exp.payers) {
      statements.push(
        db.prepare(
          `INSERT INTO expense_payers (id, expense_id, member_id, amount_paid)
           VALUES (?, ?, ?, ?)`,
          [nanoid(), expenseId, p.memberId, p.amountPaid]
        )
      );
    }

    for (const s of splits) {
      statements.push(
        db.prepare(
          `INSERT INTO expense_splits (id, expense_id, member_id, amount_owed, order_index)
           VALUES (?, ?, ?, ?, ?)`,
          [nanoid(), expenseId, s.memberId, s.amountOwed, (s as any).orderIndex || 0]
        )
      );
    }

    // Sinh obligations mới
    const newObs = generateObligationsFromExpense(exp.payers, splits as any);
    for (const ob of newObs) {
      statements.push(
        db.prepare(
          `INSERT INTO debt_obligations (id, group_id, source_type, source_id, debtor_member_id, creditor_member_id, original_amount, settled_amount, status, created_at, updated_at)
           VALUES (?, ?, 'EXPENSE', ?, ?, ?, ?, 0, 'ACTIVE', ?, ?)`,
          [nanoid(), group.id, activityId, ob.debtorMemberId, ob.creditorMemberId, ob.amount, now, now]
        )
      );
    }
  }

  // Nếu có giao dịch đã thanh toán, ghi nhận debt_adjustments
  if (settledObligations.length > 0) {
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
  await broadcastGroupEvent(c.env, group.id, 'debt.adjusted', activityId, modifierId);
  await logAudit(c.env, group.id, modifierId, 'ACTIVITY_UPDATED', 'activity', activityId, { reason });

  return c.json({ success: true, message: 'Cập nhật hoạt động thành công' });
});

// Hủy hoạt động (BR-17)
activitiesRouter.post('/:groupCode/activities/:id/cancel', requireGroup, async (c) => {
  const group = c.get('group');
  const activityId = c.req.param('id');
  const currentMember = c.get('currentMember');
  const body = await c.req.json();
  const parsed = CancelActivitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { reason } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();
  const cancellerId = currentMember?.id || 'anonymous';

  const activity = await db.queryFirst<{ id: string; title: string; status: string }>(
    `SELECT * FROM activities WHERE id = ? AND group_id = ?`,
    [activityId, group.id]
  );
  if (!activity) {
    return c.json({ success: false, error: 'Hoạt động không tồn tại' }, 404);
  }
  if (activity.status === 'CANCELLED') {
    return c.json({ success: false, error: 'Hoạt động này đã bị hủy trước đó' }, 400);
  }

  const statements = [
    // Chuyển trạng thái hoạt động sang CANCELLED
    db.prepare(`UPDATE activities SET status = 'CANCELLED', updated_at = ? WHERE id = ?`, [now, activityId]),
    // Hủy các khoản nợ chưa thanh toán
    db.prepare(
      `UPDATE debt_obligations SET status = 'CANCELLED', updated_at = ? WHERE source_id = ? AND settled_amount = 0`,
      [now, activityId]
    ),
    // Ghi nhận điều chỉnh
    db.prepare(
      `INSERT INTO debt_adjustments (id, group_id, activity_id, reason, adjusted_by_member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nanoid(), group.id, activityId, `Hủy hoạt động: ${reason}`, cancellerId, now]
    )
  ];

  const success = await db.batch(statements);
  if (!success) {
    return c.json({ success: false, error: 'Không thể hủy hoạt động' }, 500);
  }

  await broadcastGroupEvent(c.env, group.id, 'activity.cancelled', activityId, cancellerId, { reason });
  await broadcastGroupEvent(c.env, group.id, 'debt.adjusted', activityId, cancellerId);
  await logAudit(c.env, group.id, cancellerId, 'ACTIVITY_CANCELLED', 'activity', activityId, { reason });
  await createNotification(
    c.env,
    group.id,
    null,
    'ACTIVITY_CANCELLED',
    'Hoạt động đã bị hủy',
    `Hoạt động "${activity.title}" đã bị hủy. Lý do: ${reason}`
  );

  return c.json({ success: true, message: 'Hoạt động đã được hủy thành công' });
});
