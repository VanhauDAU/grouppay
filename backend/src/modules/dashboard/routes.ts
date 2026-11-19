import { Hono } from 'hono';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';
import {
  loadMembersWithBank,
  loadMappedObligations,
  loadTotalExpense,
  listPaymentsWithRecipient,
  computeBalances,
  buildPersonal
} from '../../services/snapshot.js';

export const dashboardRouter = new Hono<AppEnv>();

// Giữ cho tương thích; frontend hiện dùng /sync. Dùng chung công thức với /sync.
dashboardRouter.get('/:groupCode/dashboard', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const db = getDb(c.env);

  const [members, obligations, totalExpense, payments, recentActivities] = await Promise.all([
    loadMembersWithBank(db, group.id),
    loadMappedObligations(db, group.id),
    loadTotalExpense(db, group.id),
    listPaymentsWithRecipient(db, group.id),
    db.queryAll<any>(
      `SELECT a.id, a.title, a.occurred_at,
              COALESCE(SUM(e.amount), 0) as total_amount,
              COUNT(e.id) as expense_count
       FROM activities a
       LEFT JOIN expenses e ON e.activity_id = a.id
       WHERE a.group_id = ? AND a.status = 'ACTIVE'
       GROUP BY a.id
       ORDER BY a.occurred_at DESC
       LIMIT 5`,
      [group.id]
    )
  ]);

  const balances = computeBalances(members, obligations);
  const personal = currentMember ? buildPersonal(currentMember, members, balances, payments) : null;

  return c.json({
    success: true,
    data: {
      group: {
        id: group.id,
        name: group.name,
        currency: group.currency,
        totalExpense,
        memberBalances: balances.netBalances
      },
      personal,
      netBalances: balances.netBalances,
      pairwiseDebts: balances.pairwiseDebts,
      settlementProposals: balances.settlementProposals,
      pendingPayments: payments.filter((p: any) => p.status === 'PENDING_CONFIRMATION'),
      recentActivities
    }
  });
});
