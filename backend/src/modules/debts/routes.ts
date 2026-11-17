import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import {
  InitialDebtBatchSchema,
  calculatePairwiseDebts,
  calculateMemberNetBalances,
  optimizeSettlements
} from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';
import { broadcastGroupEvent, logAudit, createNotification } from '../../services/realtime.js';

export const debtsRouter = new Hono<AppEnv>();

// Tra cứu công nợ nhóm (công nợ hai chiều, số dư ròng, danh sách nghĩa vụ nợ gốc)
debtsRouter.get('/:groupCode/debts', requireGroup, async (c) => {
  const group = c.get('group');
  const db = getDb(c.env);

  const members = await db.queryAll<{ id: string; name: string }>(
    `SELECT id, name FROM members WHERE group_id = ? AND status = 'ACTIVE'`,
    [group.id]
  );

  const obligations = await db.queryAll<{
    id: string;
    group_id: string;
    source_type: 'EXPENSE' | 'INITIAL_DEBT' | 'ADJUSTMENT';
    source_id: string;
    debtor_member_id: string;
    creditor_member_id: string;
    original_amount: number;
    settled_amount: number;
    status: 'ACTIVE' | 'FULLY_SETTLED' | 'CANCELLED';
    created_at: string;
    updated_at: string;
    debtor_name: string;
    creditor_name: string;
    activity_title: string | null;
    activity_occurred_at: string | null;
  }>(
    `SELECT ob.*,
            m1.name as debtor_name,
            m2.name as creditor_name,
            a.title as activity_title,
            a.occurred_at as activity_occurred_at
     FROM debt_obligations ob
     JOIN members m1 ON m1.id = ob.debtor_member_id
     JOIN members m2 ON m2.id = ob.creditor_member_id
     LEFT JOIN activities a ON a.id = ob.source_id AND ob.source_type = 'EXPENSE'
     WHERE ob.group_id = ? AND ob.status != 'CANCELLED'
     ORDER BY ob.created_at DESC`,
    [group.id]
  );

  const mappedObligations = obligations.map((ob) => ({
    ...ob,
    debtorMemberId: ob.debtor_member_id,
    creditorMemberId: ob.creditor_member_id,
    debtorName: ob.debtor_name,
    creditorName: ob.creditor_name,
    originalAmount: ob.original_amount,
    settledAmount: ob.settled_amount,
    remainingAmount: Math.max(0, ob.original_amount - ob.settled_amount),
    sourceType: ob.source_type,
    sourceId: ob.source_id,
    activityTitle: ob.activity_title || (ob.source_type === 'INITIAL_DEBT' ? 'Công nợ ban đầu' : 'Khoản chi'),
    activityOccurredAt: ob.activity_occurred_at || ob.created_at,
    createdAt: ob.created_at,
    updatedAt: ob.updated_at
  }));

  const pairwiseDebts = calculatePairwiseDebts(members, mappedObligations);
  const netBalances = calculateMemberNetBalances(members, mappedObligations);
  const settlementProposals = optimizeSettlements(netBalances);

  return c.json({
    success: true,
    data: {
      pairwiseDebts,
      netBalances,
      settlementProposals,
      obligations: mappedObligations
    }
  });
});

// Nhập công nợ ban đầu (từng khoản hoặc hàng loạt - Section 4.8)
debtsRouter.post('/:groupCode/debts/initial', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const body = await c.req.json();
  const parsed = InitialDebtBatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { debts } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();
  const creatorId = currentMember?.id || 'anonymous';

  const statements: any[] = [];
  const initialDebtIds: string[] = [];

  for (const item of debts) {
    if (item.debtorMemberId === item.creditorMemberId) {
      return c.json({ success: false, error: 'Người nợ và người nhận không thể là cùng một người' }, 400);
    }

    const obId = nanoid();
    initialDebtIds.push(obId);

    statements.push(
      db.prepare(
        `INSERT INTO debt_obligations (id, group_id, source_type, source_id, debtor_member_id, creditor_member_id, original_amount, settled_amount, status, created_at, updated_at)
         VALUES (?, ?, 'INITIAL_DEBT', ?, ?, ?, ?, 0, 'ACTIVE', ?, ?)`,
        [obId, group.id, obId, item.debtorMemberId, item.creditorMemberId, item.amount, now, now]
      )
    );
  }

  const success = await db.batch(statements);
  if (!success) {
    return c.json({ success: false, error: 'Không thể lưu công nợ ban đầu' }, 500);
  }

  await broadcastGroupEvent(c.env, group.id, 'debt.created', initialDebtIds[0], creatorId, {
    count: debts.length
  });
  await logAudit(c.env, group.id, creatorId, 'INITIAL_DEBTS_IMPORTED', 'debt', initialDebtIds[0], {
    count: debts.length
  });
  await createNotification(
    c.env,
    group.id,
    null,
    'INITIAL_DEBTS_IMPORTED',
    'Công nợ ban đầu',
    `Đã nhập ${debts.length} khoản nợ ban đầu vào nhóm.`
  );

  return c.json({
    success: true,
    message: `Đã nhập thành công ${debts.length} khoản nợ ban đầu`,
    data: { ids: initialDebtIds }
  });
});
