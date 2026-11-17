import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import {
  CreatePaymentSchema,
  RejectPaymentSchema,
  planPaymentAllocation,
  applyConfirmedPayment
} from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';
import { broadcastGroupEvent, logAudit, createNotification } from '../../services/realtime.js';

export const paymentsRouter = new Hono<AppEnv>();

// Danh sách các giao dịch thanh toán
paymentsRouter.get('/:groupCode/payments', requireGroup, async (c) => {
  const group = c.get('group');
  const db = getDb(c.env);

  const payments = await db.queryAll<{
    id: string;
    payer_member_id: string;
    total_amount: number;
    status: string;
    rejection_reason: string | null;
    proof_image_url: string | null;
    created_at: string;
    updated_at: string;
    payer_name: string;
  }>(
    `SELECT p.*, m.name as payer_name
     FROM payments p
     JOIN members m ON m.id = p.payer_member_id
     WHERE p.group_id = ?
     ORDER BY p.created_at DESC`,
    [group.id]
  );

  const paymentsWithAllocations = await Promise.all(
    payments.map(async (p) => {
      const allocations = await db.queryAll<{
        id: string;
        recipient_member_id: string;
        amount: number;
        status: string;
        recipient_name: string;
      }>(
        `SELECT pa.*, m.name as recipient_name
         FROM payment_allocations pa
         JOIN members m ON m.id = pa.recipient_member_id
         WHERE pa.payment_id = ?`,
        [p.id]
      );

      return {
        ...p,
        allocations
      };
    })
  );

  return c.json({ success: true, data: paymentsWithAllocations });
});

// Tạo yêu cầu thanh toán (Báo đã chuyển tiền -> PENDING_CONFIRMATION - BR-10, BR-24)
paymentsRouter.post('/:groupCode/payments', requireGroup, async (c) => {
  const group = c.get('group');
  const body = await c.req.json();
  const parsed = CreatePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { payerMemberId, recipientMemberId, amount, idempotencyKey, proofImageUrl } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();

  // Kiểm tra Idempotency chống ghi nhận trùng (BR-24)
  const existingPayment = await db.queryFirst<{ id: string; status: string }>(
    `SELECT id, status FROM payments WHERE idempotency_key = ? AND group_id = ?`,
    [idempotencyKey, group.id]
  );
  if (existingPayment) {
    return c.json({
      success: true,
      message: 'Giao dịch đã được ghi nhận trước đó',
      data: { id: existingPayment.id, status: existingPayment.status }
    });
  }

  // Lấy các khoản nợ còn hiệu lực giữa payer và recipient
  const obligations = await db.queryAll<{
    id: string;
    debtor_member_id: string;
    creditor_member_id: string;
    original_amount: number;
    settled_amount: number;
    status: 'ACTIVE' | 'FULLY_SETTLED';
    created_at: string;
  }>(
    `SELECT id, debtor_member_id, creditor_member_id, original_amount, settled_amount, status, created_at
     FROM debt_obligations
     WHERE group_id = ? AND debtor_member_id = ? AND creditor_member_id = ? AND status = 'ACTIVE'
     ORDER BY created_at ASC`,
    [group.id, payerMemberId, recipientMemberId]
  );

  const mappedObs = obligations.map((ob) => ({
    ...ob,
    debtorMemberId: ob.debtor_member_id,
    creditorMemberId: ob.creditor_member_id,
    remainingAmount: ob.original_amount - ob.settled_amount,
    createdAt: ob.created_at
  }));

  // Phân bổ thanh toán và kiểm tra không vượt nợ (BR-10)
  const plan = planPaymentAllocation(amount, mappedObs);
  if (!plan.isValid) {
    return c.json({ success: false, error: plan.error }, 400);
  }

  const paymentId = nanoid();
  const statements: any[] = [];

  // Tạo payment record với trạng thái PENDING_CONFIRMATION
  statements.push(
    db.prepare(
      `INSERT INTO payments (id, group_id, payer_member_id, total_amount, status, proof_image_url, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PENDING_CONFIRMATION', ?, ?, ?, ?)`,
      [paymentId, group.id, payerMemberId, amount, proofImageUrl || null, idempotencyKey, now, now]
    )
  );

  // Tạo payment_allocations
  for (const alloc of plan.allocations) {
    statements.push(
      db.prepare(
        `INSERT INTO payment_allocations (id, payment_id, recipient_member_id, debt_obligation_id, amount, status)
         VALUES (?, ?, ?, ?, ?, 'PENDING_CONFIRMATION')`,
        [nanoid(), paymentId, recipientMemberId, alloc.debtObligationId, alloc.amount]
      )
    );
  }

  const success = await db.batch(statements);
  if (!success) {
    return c.json({ success: false, error: 'Không thể tạo yêu cầu thanh toán' }, 500);
  }

  // Lấy tên thành viên để tạo thông báo
  const payer = await db.queryFirst<{ name: string }>(`SELECT name FROM members WHERE id = ?`, [payerMemberId]);
  const recipient = await db.queryFirst<{ name: string }>(`SELECT name FROM members WHERE id = ?`, [
    recipientMemberId
  ]);

  await broadcastGroupEvent(c.env, group.id, 'payment.created', paymentId, payerMemberId, {
    payerName: payer?.name,
    recipientName: recipient?.name,
    amount
  });
  await logAudit(c.env, group.id, payerMemberId, 'PAYMENT_SUBMITTED', 'payment', paymentId, {
    recipientMemberId,
    amount
  });
  await createNotification(
    c.env,
    group.id,
    recipientMemberId,
    'PAYMENT_PENDING',
    'Yêu cầu xác nhận chuyển khoản',
    `${payer?.name || 'Một thành viên'} vừa báo đã chuyển ${amount.toLocaleString('vi-VN')}đ cho bạn. Vui lòng kiểm tra tài khoản và xác nhận.`
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

// Xác nhận đã nhận tiền (CONFIRMED - BR-11, BR-14)
paymentsRouter.post('/:groupCode/payments/:id/confirm', requireGroup, async (c) => {
  const group = c.get('group');
  const paymentId = c.req.param('id');
  const currentMember = c.get('currentMember');
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const payment = await db.queryFirst<{ id: string; status: string; total_amount: number; payer_member_id: string }>(
    `SELECT id, status, total_amount, payer_member_id FROM payments WHERE id = ? AND group_id = ?`,
    [paymentId, group.id]
  );

  if (!payment) {
    return c.json({ success: false, error: 'Giao dịch không tồn tại' }, 404);
  }
  if (payment.status !== 'PENDING_CONFIRMATION') {
    return c.json({ success: false, error: `Giao dịch đã ở trạng thái ${payment.status}, không thể xác nhận` }, 400);
  }

  const allocations = await db.queryAll<{
    id: string;
    debt_obligation_id: string;
    amount: number;
  }>(`SELECT id, debt_obligation_id, amount FROM payment_allocations WHERE payment_id = ?`, [paymentId]);

  const statements: any[] = [];

  // Chuyển payment sang CONFIRMED
  statements.push(
    db.prepare(`UPDATE payments SET status = 'CONFIRMED', updated_at = ? WHERE id = ?`, [now, paymentId])
  );
  statements.push(db.prepare(`UPDATE payment_allocations SET status = 'CONFIRMED' WHERE payment_id = ?`, [paymentId]));

  // Cập nhật từng nghĩa vụ nợ
  for (const alloc of allocations) {
    if (alloc.debt_obligation_id) {
      const ob = await db.queryFirst<{ id: string; original_amount: number; settled_amount: number }>(
        `SELECT id, original_amount, settled_amount FROM debt_obligations WHERE id = ?`,
        [alloc.debt_obligation_id]
      );
      if (ob) {
        const updateRes = applyConfirmedPayment(
          { id: ob.id, originalAmount: ob.original_amount, settledAmount: ob.settled_amount, status: 'ACTIVE' },
          alloc.amount
        );
        statements.push(
          db.prepare(
            `UPDATE debt_obligations SET settled_amount = ?, status = ?, updated_at = ? WHERE id = ?`,
            [updateRes.settledAmount, updateRes.status, now, ob.id]
          )
        );
      }
    }
  }

  const success = await db.batch(statements);
  if (!success) {
    return c.json({ success: false, error: 'Không thể xác nhận thanh toán' }, 500);
  }

  await broadcastGroupEvent(c.env, group.id, 'payment.confirmed', paymentId, currentMember?.id, {
    amount: payment.total_amount
  });
  await logAudit(c.env, group.id, currentMember?.id, 'PAYMENT_CONFIRMED', 'payment', paymentId, {
    amount: payment.total_amount
  });
  await createNotification(
    c.env,
    group.id,
    payment.payer_member_id,
    'PAYMENT_CONFIRMED',
    'Thanh toán đã được xác nhận',
    `Khoản thanh toán ${payment.total_amount.toLocaleString('vi-VN')}đ của bạn đã được xác nhận thành công!`
  );

  return c.json({ success: true, message: 'Xác nhận thanh toán thành công' });
});

// Từ chối thanh toán (REJECTED - BR-12)
paymentsRouter.post('/:groupCode/payments/:id/reject', requireGroup, async (c) => {
  const group = c.get('group');
  const paymentId = c.req.param('id');
  const currentMember = c.get('currentMember');
  const body = await c.req.json();
  const parsed = RejectPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { reason } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const payment = await db.queryFirst<{ id: string; status: string; total_amount: number; payer_member_id: string }>(
    `SELECT id, status, total_amount, payer_member_id FROM payments WHERE id = ? AND group_id = ?`,
    [paymentId, group.id]
  );

  if (!payment) {
    return c.json({ success: false, error: 'Giao dịch không tồn tại' }, 404);
  }
  if (payment.status !== 'PENDING_CONFIRMATION') {
    return c.json({ success: false, error: `Giao dịch đã ở trạng thái ${payment.status}, không thể từ chối` }, 400);
  }

  const statements = [
    db.prepare(`UPDATE payments SET status = 'REJECTED', rejection_reason = ?, updated_at = ? WHERE id = ?`, [
      reason,
      now,
      paymentId
    ]),
    db.prepare(`UPDATE payment_allocations SET status = 'REJECTED' WHERE payment_id = ?`, [paymentId])
  ];

  await db.batch(statements);

  await broadcastGroupEvent(c.env, group.id, 'payment.rejected', paymentId, currentMember?.id, { reason });
  await logAudit(c.env, group.id, currentMember?.id, 'PAYMENT_REJECTED', 'payment', paymentId, { reason });
  await createNotification(
    c.env,
    group.id,
    payment.payer_member_id,
    'PAYMENT_REJECTED',
    'Yêu cầu thanh toán bị từ chối',
    `Khoản thanh toán ${payment.total_amount.toLocaleString('vi-VN')}đ đã bị từ chối. Lý do: ${reason}`
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

  const payment = await db.queryFirst<{ id: string; status: string }>(
    `SELECT id, status FROM payments WHERE id = ? AND group_id = ?`,
    [paymentId, group.id]
  );

  if (!payment) {
    return c.json({ success: false, error: 'Giao dịch không tồn tại' }, 404);
  }
  if (payment.status !== 'PENDING_CONFIRMATION') {
    return c.json({ success: false, error: 'Chỉ có thể hủy giao dịch đang chờ xác nhận' }, 400);
  }

  const statements = [
    db.prepare(`UPDATE payments SET status = 'CANCELLED', updated_at = ? WHERE id = ?`, [now, paymentId]),
    db.prepare(`UPDATE payment_allocations SET status = 'CANCELLED' WHERE payment_id = ?`, [paymentId])
  ];

  await db.batch(statements);

  await broadcastGroupEvent(c.env, group.id, 'payment.cancelled', paymentId, currentMember?.id);
  await logAudit(c.env, group.id, currentMember?.id, 'PAYMENT_CANCELLED', 'payment', paymentId);

  return c.json({ success: true, message: 'Đã hủy yêu cầu thanh toán' });
});
