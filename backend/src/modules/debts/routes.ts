import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { InitialDebtBatchSchema } from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';
import { broadcastGroupEvent, auditStatement, notificationStatement } from '../../services/realtime.js';
import { loadMembersWithBank, loadMappedObligations, computeBalances } from '../../services/snapshot.js';

export const debtsRouter = new Hono<AppEnv>();

// Tra cứu công nợ nhóm (công nợ hai chiều, số dư ròng, danh sách nghĩa vụ nợ gốc)
// Bao gồm cả thành viên đã ngừng hoạt động: họ vẫn còn nợ / được nợ (BR-03).
debtsRouter.get('/:groupCode/debts', requireGroup, async (c) => {
  const group = c.get('group');
  const db = getDb(c.env);
  const [members, obligations] = await Promise.all([
    loadMembersWithBank(db, group.id),
    loadMappedObligations(db, group.id)
  ]);
  const { pairwiseDebts, netBalances, settlementProposals } = computeBalances(members, obligations);

  return c.json({
    success: true,
    data: { pairwiseDebts, netBalances, settlementProposals, obligations }
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
  const memberRows = await db.queryAll<{ id: string }>(`SELECT id FROM members WHERE group_id = ?`, [group.id]);
  const memberIds = new Set(memberRows.map((m) => m.id));

  for (const item of debts) {
    if (item.debtorMemberId === item.creditorMemberId) {
      return c.json({ success: false, error: 'Người nợ và người nhận không thể là cùng một người' }, 400);
    }
    if (!memberIds.has(item.debtorMemberId) || !memberIds.has(item.creditorMemberId)) {
      return c.json({ success: false, error: 'Thành viên không thuộc nhóm này' }, 400);
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

  statements.push(
    auditStatement(db, group.id, creatorId, 'INITIAL_DEBTS_IMPORTED', 'debt', initialDebtIds[0], { count: debts.length }),
    notificationStatement(db, group.id, null, 'INITIAL_DEBTS_IMPORTED', 'Công nợ ban đầu', `Đã nhập ${debts.length} khoản nợ ban đầu vào nhóm.`)
  );

  const success = await db.batch(statements);
  if (!success) {
    return c.json({ success: false, error: 'Không thể lưu công nợ ban đầu' }, 500);
  }

  await broadcastGroupEvent(c.env, group.id, 'debt.created', initialDebtIds[0], creatorId, { count: debts.length });

  return c.json({
    success: true,
    message: `Đã nhập thành công ${debts.length} khoản nợ ban đầu`,
    data: { ids: initialDebtIds }
  });
});
