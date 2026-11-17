import { Hono } from 'hono';
import { calculateMemberNetBalances, optimizeSettlements } from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';

export const exportsRouter = new Hono<AppEnv>();

exportsRouter.get('/:groupCode/export/data', requireGroup, async (c) => {
  const group = c.get('group');
  const db = getDb(c.env);

  const members = await db.queryAll<{ id: string; name: string }>(
    `SELECT id, name FROM members WHERE group_id = ?`,
    [group.id]
  );

  const activities = await db.queryAll<{
    id: string;
    title: string;
    description: string | null;
    occurred_at: string;
    status: string;
  }>(`SELECT id, title, description, occurred_at, status FROM activities WHERE group_id = ? ORDER BY occurred_at DESC`, [
    group.id
  ]);

  const expenses = await db.queryAll<{
    id: string;
    activity_id: string;
    title: string;
    amount: number;
    split_type: string;
  }>(`SELECT id, activity_id, title, amount, split_type FROM expenses WHERE group_id = ?`, [group.id]);

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
     WHERE ob.group_id = ? AND ob.status != 'CANCELLED'`,
    [group.id]
  );

  const payments = await db.queryAll<{
    id: string;
    total_amount: number;
    status: string;
    payer_name: string;
    created_at: string;
  }>(
    `SELECT p.id, p.total_amount, p.status, p.created_at, m.name as payer_name
     FROM payments p
     JOIN members m ON m.id = p.payer_member_id
     WHERE p.group_id = ?
     ORDER BY p.created_at DESC`,
    [group.id]
  );

  const mappedObs = obligations.map((ob) => ({
    ...ob,
    debtorMemberId: ob.debtor_member_id,
    creditorMemberId: ob.creditor_member_id,
    remainingAmount: Math.max(0, ob.original_amount - ob.settled_amount)
  }));

  const netBalances = calculateMemberNetBalances(members, mappedObs as any);
  const settlementProposals = optimizeSettlements(netBalances);

  return c.json({
    success: true,
    data: {
      group: {
        id: group.id,
        name: group.name,
        currency: group.currency,
        exportedAt: new Date().toISOString()
      },
      members,
      netBalances,
      settlementProposals,
      activities,
      expenses,
      obligations,
      payments
    }
  });
});
