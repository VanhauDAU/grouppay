import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import {
  CreatePaymentSchema,
  RejectPaymentSchema,
  planPaymentAllocation,
  planConfirmedSettlement
} from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb, type DatabaseHelper } from '../../db/db.js';
import { broadcastGroupEvent } from '../../services/realtime.js';
import { listPaymentsWithRecipient } from '../../services/snapshot.js';
import { pushToMembers } from '../../services/push.js';

export const paymentsRouter = new Hono<AppEnv>();

type PaymentRow = {
  id: string;
  status: string;
  total_amount: number;
  payer_member_id: string;
  recipient_member_id: string | null;
};

/** Lấy giao dịch kèm người nhận (mỗi payment chỉ có 1 người nhận). */
async function loadPayment(db: DatabaseHelper, groupId: string, paymentId: string) {
  return db.queryFirst<PaymentRow>(
    `SELECT p.id, p.status, p.total_amount, p.payer_member_id,
            (SELECT pa.recipient_member_id FROM payment_allocations pa WHERE pa.payment_id = p.id LIMIT 1) AS recipient_member_id
     FROM payments p
     WHERE p.id = ? AND p.group_id = ?`,
    [paymentId, groupId]
  );
}

/** Tìm yêu cầu đang chờ xác nhận giữa 1 cặp người trả -> người nhận. */
async function findPendingBetween(db: DatabaseHelper, groupId: string, payerId: string, recipientId: string) {
  return db.queryFirst<{ id: string; total_amount: number; created_at: string }>(
    `SELECT p.id, p.total_amount, p.created_at
     FROM payments p
     WHERE p.group_id = ? AND p.payer_member_id = ? AND p.status = 'PENDING_CONFIRMATION'
       AND EXISTS (SELECT 1 FROM payment_allocations pa WHERE pa.payment_id = p.id AND pa.recipient_member_id = ?)
     LIMIT 1`,
    [groupId, payerId, recipientId]
  );
}

// Danh sách các giao dịch thanh toán (1 truy vấn, không N+1)
paymentsRouter.get('/:groupCode/payments', requireGroup, async (c) => {
  const group = c.get('group');
  const db = getDb(c.env);
  const payments = await listPaymentsWithRecipient(db, group.id);
  return c.json({ success: true, data: payments });
});

// Tạo yêu cầu thanh toán (Báo đã chuyển tiền -> PENDING_CONFIRMATION - BR-10, BR-24)
paymentsRouter.post('/:groupCode/payments', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreatePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { payerMemberId, recipientMemberId, amount, idempotencyKey, proofImageUrl } = parsed.data;
  if (currentMember && currentMember.id !== payerMemberId) {
    return c.json({ success: false, error: 'Bạn chỉ có thể báo trả tiền cho chính mình' }, 403);
  }
  if (payerMemberId === recipientMemberId) {
    return c.json({ success: false, error: 'Người trả và người nhận không thể là cùng một người' }, 400);
  }

  const db = getDb(c.env);
  const now = new Date().toISOString();

  // 1) Idempotency: bấm 2 lần / mạng gửi lại -> trả về đúng giao dịch cũ (BR-24)
  const existingPayment = await db.queryFirst<{ id: string; status: string }>(
    `SELECT id, status FROM payments WHERE idempotency_key = ? AND group_id = ?`,
    [idempotencyKey, group.id]
  );
  if (existingPayment) {
    return c.json({
      success: true,
      duplicated: true,
      message: 'Giao dịch đã được ghi nhận trước đó',
      data: { id: existingPayment.id, status: existingPayment.status }
    });
  }

  // 2) Chỉ cho phép 1 yêu cầu chờ xác nhận cho mỗi cặp người trả -> người nhận
  const pending = await findPendingBetween(db, group.id, payerMemberId, recipientMemberId);
  if (pending) {
    return c.json(
      {
        success: false,
        code: 'PENDING_EXISTS',
        error: `Bạn đã có yêu cầu ${pending.total_amount.toLocaleString('vi-VN')}đ đang chờ xác nhận. Hãy chờ người nhận xác nhận hoặc hủy yêu cầu cũ trước khi gửi yêu cầu mới.`,
        data: { id: pending.id, status: 'PENDING_CONFIRMATION' }
      },
      409
    );
  }

  // 3) Giới hạn theo nợ RÒNG giữa 2 người (đúng con số "Cần trả" hiển thị trên app - BR-10)
  const pairObligations = await db.queryAll<{
    id: string;
    debtor_member_id: string;
    creditor_member_id: string;
    original_amount: number;
    settled_amount: number;
    created_at: string;
  }>(
    `SELECT id, debtor_member_id, creditor_member_id, original_amount, settled_amount, created_at
     FROM debt_obligations
     WHERE group_id = ? AND status = 'ACTIVE'
       AND ((debtor_member_id = ? AND creditor_member_id = ?) OR (debtor_member_id = ? AND creditor_member_id = ?))
     ORDER BY created_at ASC`,
    [group.id, payerMemberId, recipientMemberId, recipientMemberId, payerMemberId]
  );

  const remainingOf = (ob: { original_amount: number; settled_amount: number }) =>
    Math.max(0, ob.original_amount - ob.settled_amount);
  const owed = pairObligations.filter((ob) => ob.debtor_member_id === payerMemberId);
  const reverse = pairObligations.filter((ob) => ob.debtor_member_id === recipientMemberId);
  const netOwed = owed.reduce((s, ob) => s + remainingOf(ob), 0) - reverse.reduce((s, ob) => s + remainingOf(ob), 0);

  if (netOwed <= 0) {
    return c.json({ success: false, error: 'Bạn hiện không còn nợ người này' }, 400);
  }
  if (amount > netOwed) {
    return c.json(
      {
        success: false,
        error: `Số tiền (${amount.toLocaleString('vi-VN')}đ) vượt quá số bạn đang nợ người này (${netOwed.toLocaleString('vi-VN')}đ)`
      },
      400
    );
  }

  const plan = planPaymentAllocation(
    amount,
    owed.map((ob) => ({
      id: ob.id,
      debtorMemberId: ob.debtor_member_id,
      creditorMemberId: ob.creditor_member_id,
      remainingAmount: remainingOf(ob),
      status: 'ACTIVE' as const,
      createdAt: ob.created_at
    }))
  );
  if (!plan.isValid) {
    return c.json({ success: false, error: plan.error }, 400);
  }

  const [payer, recipient] = await Promise.all([
    db.queryFirst<{ name: string }>(`SELECT name FROM members WHERE id = ? AND group_id = ?`, [payerMemberId, group.id]),
    db.queryFirst<{ name: string }>(`SELECT name FROM members WHERE id = ? AND group_id = ?`, [recipientMemberId, group.id])
  ]);
  if (!payer || !recipient) {
    return c.json({ success: false, error: 'Thành viên không thuộc nhóm này' }, 400);
  }

  const paymentId = nanoid();

  // 4) Ghi nguyên tử. Câu INSERT tự kiểm tra lại điều kiện ngay trong transaction nên 2 request
  //    đến cùng lúc (2 tab, bấm đúp, mạng chập chờn) chỉ có đúng 1 request tạo được giao dịch.
  const statements: any[] = [
    db.prepare(
      `INSERT INTO payments (id, group_id, payer_member_id, total_amount, status, proof_image_url, idempotency_key, created_at, updated_at)
       SELECT ?, ?, ?, ?, 'PENDING_CONFIRMATION', ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM payments WHERE group_id = ? AND idempotency_key = ?)
         AND NOT EXISTS (
           SELECT 1 FROM payments p
           JOIN payment_allocations pa ON pa.payment_id = p.id
           WHERE p.group_id = ? AND p.payer_member_id = ? AND p.status = 'PENDING_CONFIRMATION'
             AND pa.recipient_member_id = ?
         )`,
      [
        paymentId, group.id, payerMemberId, amount, proofImageUrl || null, idempotencyKey, now, now,
        group.id, idempotencyKey,
        group.id, payerMemberId, recipientMemberId
      ]
    )
  ];
  for (const alloc of plan.allocations) {
    statements.push(
      db.prepare(
        `INSERT INTO payment_allocations (id, payment_id, recipient_member_id, debt_obligation_id, amount, status)
         SELECT ?, ?, ?, ?, ?, 'PENDING_CONFIRMATION'
         WHERE EXISTS (SELECT 1 FROM payments WHERE id = ?)`,
        [nanoid(), paymentId, recipientMemberId, alloc.debtObligationId, alloc.amount, paymentId]
      )
    );
  }
  const message = `Kiểm tra tài khoản, nếu đã nhận đủ hãy bấm "Đã nhận" để trừ nợ.`;
  statements.push(
    guardExists(
      db,
      notificationStatementSql(),
      [nanoid(), group.id, recipientMemberId, 'PAYMENT_PENDING', `${payer.name} báo đã chuyển ${amount.toLocaleString('vi-VN')}đ`, message, null, now],
      paymentId
    ),
    guardExists(
      db,
      auditStatementSql(),
      [nanoid(), group.id, payerMemberId, 'PAYMENT_SUBMITTED', 'payment', paymentId, JSON.stringify({ recipientMemberId, amount }), now],
      paymentId
    )
  );

  let results;
  try {
    results = await db.batchResults(statements);
  } catch (err: any) {
    // UNIQUE(group_id, idempotency_key) chặn ở tầng DB nếu 2 request trùng key chen nhau
    const dup = await db.queryFirst<{ id: string; status: string }>(
      `SELECT id, status FROM payments WHERE idempotency_key = ? AND group_id = ?`,
      [idempotencyKey, group.id]
    );
    if (dup) {
      return c.json({ success: true, duplicated: true, data: { id: dup.id, status: dup.status } });
    }
    throw err;
  }

  if ((results[0]?.meta?.changes ?? 0) === 0) {
    const dup = await db.queryFirst<{ id: string; status: string }>(
      `SELECT id, status FROM payments WHERE idempotency_key = ? AND group_id = ?`,
      [idempotencyKey, group.id]
    );
    if (dup) {
      return c.json({ success: true, duplicated: true, data: { id: dup.id, status: dup.status } });
    }
    return c.json(
      {
        success: false,
        code: 'PENDING_EXISTS',
        error: 'Bạn đã có một yêu cầu đang chờ người này xác nhận. Vui lòng chờ hoặc hủy yêu cầu cũ.'
      },
      409
    );
  }

  await broadcastGroupEvent(c.env, group.id, 'payment.created', paymentId, payerMemberId, {
    payerName: payer.name,
    recipientName: recipient.name,
    recipientMemberId,
    amount
  });
  c.executionCtx.waitUntil(
    pushToMembers(
      c.env,
      group.id,
      { memberIds: [recipientMemberId] },
      {
        title: `💸 ${payer.name} báo đã chuyển ${amount.toLocaleString('vi-VN')}đ`,
        body: `Nhóm ${group.name} · Kiểm tra tài khoản rồi chạm để xác nhận "Đã nhận".`,
        url: `/group/${group.publicCode}`,
        tag: `payment-${paymentId}`
      },
      { urgency: 'high' }
    )
  );

  return c.json({
    success: true,
    data: {
      id: paymentId,
      status: 'PENDING_CONFIRMATION',
      amount
    }
  });
});

// Người được nợ tự ghi nhận "Đã nhận tiền" (trả ngoài app / quên bấm báo trả) -> có hiệu lực ngay.
// An toàn: chỉ chính người nhận mới giảm được khoản người khác đang nợ MÌNH.
const RecordReceivedSchema = z.object({
  debtorMemberId: z.string().min(1),
  amount: z.number().int('Số tiền phải là số nguyên').positive('Số tiền phải lớn hơn 0'),
  note: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().min(8).max(64)
});

paymentsRouter.post('/:groupCode/payments/record-received', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  if (!currentMember) {
    return c.json({ success: false, error: 'Vui lòng chọn tên của bạn trước' }, 400);
  }
  const parsed = RecordReceivedSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }
  const { debtorMemberId, amount, note, idempotencyKey } = parsed.data;
  const creditorId = currentMember.id;
  if (debtorMemberId === creditorId) {
    return c.json({ success: false, error: 'Không thể ghi nhận tiền từ chính mình' }, 400);
  }

  const db = getDb(c.env);
  const now = new Date().toISOString();

  const dup = await db.queryFirst<{ id: string }>(`SELECT id FROM payments WHERE idempotency_key = ? AND group_id = ?`, [
    idempotencyKey,
    group.id
  ]);
  if (dup) return c.json({ success: true, duplicated: true, data: { id: dup.id } });

  // Đã có yêu cầu "báo trả" đang chờ -> xác nhận yêu cầu đó, tránh ghi nhận 2 lần cùng 1 khoản tiền
  const pending = await findPendingBetween(db, group.id, debtorMemberId, creditorId);
  if (pending) {
    return c.json(
      {
        success: false,
        code: 'PENDING_EXISTS',
        error: `Người này đã báo trả ${pending.total_amount.toLocaleString('vi-VN')}đ và đang chờ bạn xác nhận. Hãy bấm "Đã nhận" ở yêu cầu đó.`
      },
      409
    );
  }

  const [debtor, pairObligations] = await Promise.all([
    db.queryFirst<{ name: string }>(`SELECT name FROM members WHERE id = ? AND group_id = ?`, [debtorMemberId, group.id]),
    db.queryAll<{ id: string; debtor_member_id: string; original_amount: number; settled_amount: number; created_at: string }>(
      `SELECT id, debtor_member_id, original_amount, settled_amount, created_at
       FROM debt_obligations
       WHERE group_id = ? AND status = 'ACTIVE'
         AND ((debtor_member_id = ? AND creditor_member_id = ?) OR (debtor_member_id = ? AND creditor_member_id = ?))
       ORDER BY created_at ASC`,
      [group.id, debtorMemberId, creditorId, creditorId, debtorMemberId]
    )
  ]);
  if (!debtor) return c.json({ success: false, error: 'Thành viên không thuộc nhóm này' }, 400);

  const rem = (ob: { original_amount: number; settled_amount: number }) => Math.max(0, ob.original_amount - ob.settled_amount);
  const owed = pairObligations.filter((ob) => ob.debtor_member_id === debtorMemberId);
  const netOwed =
    owed.reduce((sum, ob) => sum + rem(ob), 0) -
    pairObligations.filter((ob) => ob.debtor_member_id === creditorId).reduce((sum, ob) => sum + rem(ob), 0);
  if (netOwed <= 0) return c.json({ success: false, error: `${debtor.name} hiện không còn nợ bạn` }, 400);
  if (amount > netOwed) {
    return c.json(
      { success: false, error: `${debtor.name} chỉ đang nợ bạn ${netOwed.toLocaleString('vi-VN')}đ` },
      400
    );
  }

  const plan = planConfirmedSettlement(
    amount,
    owed.map((ob) => ({ id: ob.id, remainingAmount: rem(ob), status: 'ACTIVE' as const, createdAt: ob.created_at }))
  );
  const paymentId = nanoid();
  const exists = `EXISTS (SELECT 1 FROM payments WHERE id = ?)`;
  const statements: any[] = [
    db.prepare(
      `INSERT INTO payments (id, group_id, payer_member_id, total_amount, status, idempotency_key, created_at, updated_at)
       SELECT ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM payments WHERE group_id = ? AND idempotency_key = ?)`,
      [paymentId, group.id, debtorMemberId, amount, idempotencyKey, now, now, group.id, idempotencyKey]
    )
  ];
  for (const alloc of plan.allocations) {
    statements.push(
      db.prepare(
        `INSERT INTO payment_allocations (id, payment_id, recipient_member_id, debt_obligation_id, amount, status)
         SELECT ?, ?, ?, ?, ?, 'CONFIRMED' WHERE ${exists}`,
        [nanoid(), paymentId, creditorId, alloc.debtObligationId, alloc.amount, paymentId]
      ),
      db.prepare(
        `UPDATE debt_obligations
         SET settled_amount = MIN(original_amount, settled_amount + ?),
             status = CASE WHEN settled_amount + ? >= original_amount THEN 'FULLY_SETTLED' ELSE 'ACTIVE' END,
             updated_at = ?
         WHERE id = ? AND status = 'ACTIVE' AND ${exists}`,
        [alloc.amount, alloc.amount, now, alloc.debtObligationId, paymentId]
      )
    );
  }
  const message = `Công nợ đã được trừ${note ? ` · Ghi chú: ${note}` : ''}.`;
  statements.push(
    guardExists(db, notificationStatementSql(), [nanoid(), group.id, debtorMemberId, 'PAYMENT_RECORDED', `${currentMember.name} đã nhận ${amount.toLocaleString('vi-VN')}đ từ bạn`, message, null, now], paymentId),
    guardExists(
      db,
      auditStatementSql(),
      [nanoid(), group.id, creditorId, 'PAYMENT_RECORDED_BY_RECIPIENT', 'payment', paymentId, JSON.stringify({ debtorMemberId, amount, note: note || null }), now],
      paymentId
    )
  );

  const results = await db.batchResults(statements);
  if ((results[0]?.meta?.changes ?? 0) === 0) {
    return c.json({ success: true, duplicated: true });
  }

  await broadcastGroupEvent(c.env, group.id, 'payment.confirmed', paymentId, creditorId, {
    amount,
    payerMemberId: debtorMemberId,
    recipientMemberId: creditorId
  });
  c.executionCtx.waitUntil(
    pushToMembers(
      c.env,
      group.id,
      { memberIds: [debtorMemberId] },
      {
        title: `✅ ${currentMember.name} đã nhận ${amount.toLocaleString('vi-VN')}đ từ bạn`,
        body: `Nhóm ${group.name} · Công nợ đã được trừ${note ? ` · ${note}` : ''}.`,
        url: `/group/${group.publicCode}`,
        tag: `payment-${paymentId}`
      },
      { urgency: 'high' }
    )
  );

  return c.json({ success: true, data: { id: paymentId, amount } });
});

// Xác nhận đã nhận tiền (CONFIRMED - BR-11, BR-14)
paymentsRouter.post('/:groupCode/payments/:id/confirm', requireGroup, async (c) => {
  const group = c.get('group');
  const paymentId = c.req.param('id');
  const currentMember = c.get('currentMember');
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const payment = await loadPayment(db, group.id, paymentId);
  if (!payment) {
    return c.json({ success: false, error: 'Giao dịch không tồn tại' }, 404);
  }
  if (payment.status !== 'PENDING_CONFIRMATION') {
    return c.json({ success: false, error: statusError(payment.status) }, 409);
  }
  if (!currentMember || currentMember.id !== payment.recipient_member_id) {
    return c.json({ success: false, error: 'Chỉ người nhận tiền mới được xác nhận giao dịch này' }, 403);
  }

  const recipientId = payment.recipient_member_id!;
  const payerId = payment.payer_member_id;

  // Lập lại kế hoạch trừ nợ theo dữ liệu HIỆN TẠI (hoạt động có thể đã bị sửa/hủy sau khi báo trả)
  const obligations = await db.queryAll<{ id: string; original_amount: number; settled_amount: number; created_at: string }>(
    `SELECT id, original_amount, settled_amount, created_at
     FROM debt_obligations
     WHERE group_id = ? AND debtor_member_id = ? AND creditor_member_id = ? AND status = 'ACTIVE'
     ORDER BY created_at ASC`,
    [group.id, payerId, recipientId]
  );
  const plan = planConfirmedSettlement(
    payment.total_amount,
    obligations.map((ob) => ({
      id: ob.id,
      remainingAmount: Math.max(0, ob.original_amount - ob.settled_amount),
      status: 'ACTIVE' as const,
      createdAt: ob.created_at
    }))
  );

  // Mọi câu đều chỉ có hiệu lực khi payment VẪN đang chờ -> 2 lần bấm "Đã nhận" đồng thời
  // không thể trừ nợ 2 lần. Câu cập nhật trạng thái payment đặt CUỐI CÙNG.
  const pendingGuard = `EXISTS (SELECT 1 FROM payments WHERE id = ? AND status = 'PENDING_CONFIRMATION')`;
  const statements: any[] = [];

  for (const alloc of plan.allocations) {
    statements.push(
      db.prepare(
        `UPDATE debt_obligations
         SET settled_amount = MIN(original_amount, settled_amount + ?),
             status = CASE WHEN settled_amount + ? >= original_amount THEN 'FULLY_SETTLED' ELSE 'ACTIVE' END,
             updated_at = ?
         WHERE id = ? AND status = 'ACTIVE' AND ${pendingGuard}`,
        [alloc.amount, alloc.amount, now, alloc.debtObligationId, paymentId]
      )
    );
  }
  const allocCount = statements.length;

  if (plan.excessAmount > 0) {
    // Tiền chuyển nhiều hơn nợ hiện tại -> người nhận nợ lại người trả phần dư (không mất tiền)
    statements.push(excessObligationStatement(db, group.id, paymentId, recipientId, payerId, plan.excessAmount, now));
  }

  statements.push(
    db.prepare(`UPDATE payment_allocations SET status = 'CONFIRMED' WHERE payment_id = ? AND ${pendingGuard}`, [
      paymentId,
      paymentId
    ]),
    guardPending(
      db,
      notificationStatementSql(),
      [
        nanoid(), group.id, payerId, 'PAYMENT_CONFIRMED', `${currentMember.name} đã nhận ${payment.total_amount.toLocaleString('vi-VN')}đ`,
        `Khoản trả nợ của bạn đã được xác nhận, công nợ đã được trừ.`, null, now
      ],
      paymentId
    ),
    guardPending(
      db,
      auditStatementSql(),
      [nanoid(), group.id, currentMember.id, 'PAYMENT_CONFIRMED', 'payment', paymentId, JSON.stringify({ amount: payment.total_amount }), now],
      paymentId
    ),
    db.prepare(
      `UPDATE payments SET status = 'CONFIRMED', updated_at = ? WHERE id = ? AND status = 'PENDING_CONFIRMATION'`,
      [now, paymentId]
    )
  );

  const results = await db.batchResults(statements);
  const confirmed = (results[results.length - 1]?.meta?.changes ?? 0) === 1;
  if (!confirmed) {
    const latest = await loadPayment(db, group.id, paymentId);
    return c.json({ success: false, error: statusError(latest?.status || 'UNKNOWN') }, 409);
  }

  // Nghĩa vụ nợ bị sửa/hủy đồng thời đúng lúc xác nhận -> phần tiền chưa trừ được ghi thành nợ ngược
  let shortfall = 0;
  for (let i = 0; i < allocCount; i++) {
    if ((results[i]?.meta?.changes ?? 0) === 0) shortfall += plan.allocations[i].amount;
  }
  if (shortfall > 0) {
    await excessObligationStatement(db, group.id, paymentId, recipientId, payerId, shortfall, now, 'race').run();
  }

  await broadcastGroupEvent(c.env, group.id, 'payment.confirmed', paymentId, currentMember.id, {
    amount: payment.total_amount,
    payerMemberId: payerId,
    recipientMemberId: recipientId
  });
  c.executionCtx.waitUntil(
    pushToMembers(
      c.env,
      group.id,
      { memberIds: [payerId] },
      {
        title: `✅ ${currentMember.name} đã nhận ${payment.total_amount.toLocaleString('vi-VN')}đ`,
        body: `Nhóm ${group.name} · Khoản trả nợ của bạn đã được xác nhận, công nợ đã được trừ.`,
        url: `/group/${group.publicCode}`,
        tag: `payment-${paymentId}`
      },
      { urgency: 'high' }
    )
  );

  return c.json({ success: true, message: 'Xác nhận thanh toán thành công' });
});

// Từ chối thanh toán (REJECTED - BR-12)
paymentsRouter.post('/:groupCode/payments/:id/reject', requireGroup, async (c) => {
  const group = c.get('group');
  const paymentId = c.req.param('id');
  const currentMember = c.get('currentMember');
  const body = await c.req.json().catch(() => ({}));
  const parsed = RejectPaymentSchema.safeParse({ ...body, paymentId });
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { reason } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const payment = await loadPayment(db, group.id, paymentId);
  if (!payment) {
    return c.json({ success: false, error: 'Giao dịch không tồn tại' }, 404);
  }
  if (payment.status !== 'PENDING_CONFIRMATION') {
    return c.json({ success: false, error: statusError(payment.status) }, 409);
  }
  if (!currentMember || currentMember.id !== payment.recipient_member_id) {
    return c.json({ success: false, error: 'Chỉ người nhận tiền mới được từ chối giao dịch này' }, 403);
  }

  const results = await db.batchResults([
    db.prepare(`UPDATE payment_allocations SET status = 'REJECTED' WHERE payment_id = ? AND EXISTS (SELECT 1 FROM payments WHERE id = ? AND status = 'PENDING_CONFIRMATION')`, [paymentId, paymentId]),
    guardPending(
      db,
      notificationStatementSql(),
      [
        nanoid(), group.id, payment.payer_member_id, 'PAYMENT_REJECTED', `${currentMember.name} chưa nhận được ${payment.total_amount.toLocaleString('vi-VN')}đ`,
        `Lý do: ${reason}. Công nợ chưa được trừ, hãy kiểm tra lại giao dịch.`, null, now
      ],
      paymentId
    ),
    guardPending(
      db,
      auditStatementSql(),
      [nanoid(), group.id, currentMember.id, 'PAYMENT_REJECTED', 'payment', paymentId, JSON.stringify({ reason }), now],
      paymentId
    ),
    db.prepare(
      `UPDATE payments SET status = 'REJECTED', rejection_reason = ?, updated_at = ? WHERE id = ? AND status = 'PENDING_CONFIRMATION'`,
      [reason, now, paymentId]
    )
  ]);
  if ((results[results.length - 1]?.meta?.changes ?? 0) !== 1) {
    const latest = await loadPayment(db, group.id, paymentId);
    return c.json({ success: false, error: statusError(latest?.status || 'UNKNOWN') }, 409);
  }

  await broadcastGroupEvent(c.env, group.id, 'payment.rejected', paymentId, currentMember.id, {
    reason,
    payerMemberId: payment.payer_member_id
  });
  c.executionCtx.waitUntil(
    pushToMembers(
      c.env,
      group.id,
      { memberIds: [payment.payer_member_id] },
      {
        title: `⚠️ ${currentMember.name} chưa nhận được ${payment.total_amount.toLocaleString('vi-VN')}đ`,
        body: `Nhóm ${group.name} · Lý do: ${reason}. Công nợ chưa được trừ.`,
        url: `/group/${group.publicCode}`,
        tag: `payment-${paymentId}`
      },
      { urgency: 'high' }
    )
  );

  return c.json({ success: true, message: 'Đã từ chối giao dịch' });
});

// Hủy yêu cầu chuyển tiền khi chưa xác nhận (CANCELLED - BR-13)
paymentsRouter.post('/:groupCode/payments/:id/cancel', requireGroup, async (c) => {
  const group = c.get('group');
  const paymentId = c.req.param('id');
  const currentMember = c.get('currentMember');
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const payment = await loadPayment(db, group.id, paymentId);
  if (!payment) {
    return c.json({ success: false, error: 'Giao dịch không tồn tại' }, 404);
  }
  if (payment.status !== 'PENDING_CONFIRMATION') {
    return c.json({ success: false, error: 'Chỉ có thể hủy giao dịch đang chờ xác nhận' }, 409);
  }
  if (!currentMember || currentMember.id !== payment.payer_member_id) {
    return c.json({ success: false, error: 'Chỉ người báo trả mới được hủy yêu cầu này' }, 403);
  }

  const results = await db.batchResults([
    db.prepare(`UPDATE payment_allocations SET status = 'CANCELLED' WHERE payment_id = ? AND EXISTS (SELECT 1 FROM payments WHERE id = ? AND status = 'PENDING_CONFIRMATION')`, [paymentId, paymentId]),
    guardPending(
      db,
      auditStatementSql(),
      [nanoid(), group.id, currentMember.id, 'PAYMENT_CANCELLED', 'payment', paymentId, null, now],
      paymentId
    ),
    db.prepare(`UPDATE payments SET status = 'CANCELLED', updated_at = ? WHERE id = ? AND status = 'PENDING_CONFIRMATION'`, [
      now,
      paymentId
    ])
  ]);
  if ((results[results.length - 1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ success: false, error: 'Giao dịch đã được xử lý, không thể hủy' }, 409);
  }

  await broadcastGroupEvent(c.env, group.id, 'payment.cancelled', paymentId, currentMember.id, {
    recipientMemberId: payment.recipient_member_id
  });

  return c.json({ success: true, message: 'Đã hủy yêu cầu thanh toán' });
});

// ---------- helpers ----------

function statusError(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'Giao dịch này đã được xác nhận trước đó';
    case 'REJECTED':
      return 'Giao dịch này đã bị từ chối trước đó';
    case 'CANCELLED':
      return 'Người trả đã hủy yêu cầu này';
    default:
      return 'Giao dịch không còn ở trạng thái chờ xác nhận';
  }
}

function notificationStatementSql() {
  return `INSERT INTO notifications (id, group_id, target_member_id, type, title, message, data, is_read, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, 0, ?`;
}

function auditStatementSql() {
  return `INSERT INTO audit_logs (id, group_id, actor_member_id, action, entity_type, entity_id, metadata, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?`;
}

/** INSERT ... SELECT chỉ chạy khi payment đã được tạo trong cùng batch. */
function guardExists(db: DatabaseHelper, insertSelectSql: string, params: any[], paymentId: string) {
  return db.prepare(`${insertSelectSql} WHERE EXISTS (SELECT 1 FROM payments WHERE id = ?)`, [...params, paymentId]);
}

/** INSERT ... SELECT chỉ chạy khi payment còn đang chờ xác nhận. */
function guardPending(db: DatabaseHelper, insertSelectSql: string, params: any[], paymentId: string) {
  return db.prepare(
    `${insertSelectSql} WHERE EXISTS (SELECT 1 FROM payments WHERE id = ? AND status = 'PENDING_CONFIRMATION')`,
    [...params, paymentId]
  );
}

function excessObligationStatement(
  db: DatabaseHelper,
  groupId: string,
  paymentId: string,
  debtorId: string,
  creditorId: string,
  amount: number,
  now: string,
  mode: 'guarded' | 'race' = 'guarded'
) {
  const sql = `INSERT INTO debt_obligations (id, group_id, source_type, source_id, debtor_member_id, creditor_member_id, original_amount, settled_amount, status, created_at, updated_at)
               SELECT ?, ?, 'ADJUSTMENT', ?, ?, ?, ?, 0, 'ACTIVE', ?, ?`;
  const params = [nanoid(), groupId, paymentId, debtorId, creditorId, amount, now, now];
  return mode === 'guarded'
    ? db.prepare(`${sql} WHERE EXISTS (SELECT 1 FROM payments WHERE id = ? AND status = 'PENDING_CONFIRMATION')`, [...params, paymentId])
    : db.prepare(sql, params);
}

