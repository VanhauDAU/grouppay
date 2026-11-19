/**
 * Diễn giải từng lượt chuyển tiền trong ảnh công nợ: số tiền đó đến từ những khoản nào.
 * Chỉ dùng để HIỂN THỊ — làm tròn ở đây không đổi số liệu công nợ thật trong app.
 */

export type RoundingUnit = 0 | 1000 | 5000 | 10000;

export const ROUNDING_OPTIONS: { value: RoundingUnit; label: string }[] = [
  { value: 0, label: 'Không' },
  { value: 1000, label: '1.000đ' },
  { value: 5000, label: '5.000đ' },
  { value: 10000, label: '10.000đ' }
];

/** Làm tròn đến bội số gần nhất của `unit` (unit = 0 -> giữ nguyên). */
export function roundAmount(amount: number, unit: RoundingUnit): number {
  if (!unit) return amount;
  return Math.round(amount / unit) * unit;
}

export interface BreakdownItem {
  id: string;
  title: string;
  date?: string;
  /** Người đã trả tiền cho khoản này (người được nợ) */
  payerName: string;
  /** +1: người chuyển nợ thêm; -1: được trừ bớt vì người nhận cũng nợ lại */
  sign: 1 | -1;
  /** Số còn nợ của khoản này (sau khi trừ phần đã trả) */
  remaining: number;
  original: number;
  settled: number;
  /** Tổng tiền cả hoạt động (nếu biết) */
  activityTotal?: number;
  sourceType: string;
}

export interface TransferLine {
  fromId: string;
  toId: string;
  from: string;
  to: string;
  /** Số chính xác */
  exact: number;
  /** Số hiển thị sau làm tròn */
  amount: number;
  items: BreakdownItem[];
}

export interface DebtorGroup {
  id: string;
  name: string;
  total: number;
  exactTotal: number;
  items: TransferLine[];
}

const byDateAsc = (x: BreakdownItem, y: BreakdownItem) =>
  new Date(x.date || 0).getTime() - new Date(y.date || 0).getTime();

export function buildTransferBreakdown(
  pairwiseDebts: any[],
  obligations: any[],
  activities: any[],
  unit: RoundingUnit
): { groups: DebtorGroup[]; lines: TransferLine[]; droppedCount: number } {
  const activityTotal = new Map<string, number>(
    (activities || []).map((a: any) => [a.id, Number(a.total_amount ?? a.totalAmount ?? 0)])
  );

  const toItem = (ob: any, sign: 1 | -1): BreakdownItem => ({
    id: ob.id,
    title: ob.activityTitle || 'Khoản chi',
    date: ob.activityOccurredAt || ob.createdAt,
    payerName: ob.creditorName,
    sign,
    remaining: ob.remainingAmount,
    original: ob.originalAmount,
    settled: ob.settledAmount,
    activityTotal: ob.sourceType === 'EXPENSE' ? activityTotal.get(ob.sourceId) || undefined : undefined,
    sourceType: ob.sourceType
  });

  let droppedCount = 0;
  const lines: TransferLine[] = [];

  for (const d of pairwiseDebts || []) {
    if (!(d.netAmount > 0)) continue;
    const fromId = d.netDebtorId;
    const toId = d.netCreditorId;
    const exact = d.netAmount;
    const amount = roundAmount(exact, unit);
    if (amount <= 0) {
      droppedCount++;
      continue;
    }

    const open = (obligations || []).filter((ob: any) => ob.remainingAmount > 0 && ob.status !== 'CANCELLED');
    const items = [
      ...open.filter((ob: any) => ob.debtorMemberId === fromId && ob.creditorMemberId === toId).map((ob: any) => toItem(ob, 1)),
      ...open.filter((ob: any) => ob.debtorMemberId === toId && ob.creditorMemberId === fromId).map((ob: any) => toItem(ob, -1))
    ].sort(byDateAsc);

    lines.push({
      fromId,
      toId,
      from: fromId === d.memberAId ? d.memberAName : d.memberBName,
      to: toId === d.memberAId ? d.memberAName : d.memberBName,
      exact,
      amount,
      items
    });
  }

  lines.sort((x, y) => x.from.localeCompare(y.from, 'vi') || y.amount - x.amount);

  const groups: DebtorGroup[] = [];
  for (const t of lines) {
    let g = groups.find((x) => x.id === t.fromId);
    if (!g) {
      g = { id: t.fromId, name: t.from, total: 0, exactTotal: 0, items: [] };
      groups.push(g);
    }
    g.total += t.amount;
    g.exactTotal += t.exact;
    g.items.push(t);
  }
  groups.sort((a, b) => b.total - a.total);

  return { groups, lines, droppedCount };
}
