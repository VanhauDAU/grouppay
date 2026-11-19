export type MemberStatus = 'ACTIVE' | 'INACTIVE';

export interface Group {
  id: string;
  publicCode: string;
  name: string;
  description?: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupAccessToken {
  id: string;
  groupId: string;
  token: string;
  isActive: boolean;
  createdAt: string;
}

export interface Member {
  id: string;
  groupId: string;
  name: string;
  avatarUrl?: string | null;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MemberSession {
  id: string;
  groupId: string;
  memberId: string;
  token: string;
  deviceInfo?: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface BankAccount {
  id: string;
  memberId: string;
  bankBin: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isQrEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ActivityStatus = 'ACTIVE' | 'CANCELLED';

export interface Activity {
  id: string;
  groupId: string;
  title: string;
  description?: string | null;
  occurredAt: string;
  status: ActivityStatus;
  createdByMemberId: string;
  createdAt: string;
  updatedAt: string;
}

export type SplitType = 'EQUAL' | 'EXACT';

export interface Expense {
  id: string;
  activityId: string;
  groupId: string;
  title: string;
  amount: number; // in integer VND
  splitType: SplitType;
  createdByMemberId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpensePayer {
  id: string;
  expenseId: string;
  memberId: string;
  amountPaid: number; // in integer VND
}

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  memberId: string;
  amountOwed: number; // in integer VND
  orderIndex: number;
}

export type DebtSourceType = 'EXPENSE' | 'INITIAL_DEBT' | 'ADJUSTMENT';
export type DebtObligationStatus = 'ACTIVE' | 'FULLY_SETTLED' | 'CANCELLED';

export interface DebtObligation {
  id: string;
  groupId: string;
  sourceType: DebtSourceType;
  sourceId: string;
  debtorMemberId: string; // người nợ
  creditorMemberId: string; // người cho nợ / được nhận
  originalAmount: number; // integer VND
  settledAmount: number; // integer VND đã được thanh toán xác nhận
  remainingAmount: number; // originalAmount - settledAmount
  status: DebtObligationStatus;
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'REVERSED';

export interface Payment {
  id: string;
  groupId: string;
  payerMemberId: string;
  totalAmount: number;
  status: PaymentStatus;
  rejectionReason?: string | null;
  proofImageUrl?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  recipientMemberId: string;
  debtObligationId?: string | null;
  amount: number;
  status: PaymentStatus;
}

export interface DebtAdjustment {
  id: string;
  groupId: string;
  activityId?: string | null;
  reason: string;
  adjustedByMemberId: string;
  createdAt: string;
}

export interface ActivityRevision {
  id: string;
  activityId: string;
  groupId: string;
  modifiedByMemberId: string;
  reason: string;
  beforeState: string; // JSON
  afterState: string; // JSON
  createdAt: string;
}

export interface AuditLog {
  id: string;
  groupId: string;
  actorMemberId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: string | null; // JSON
  createdAt: string;
}

export interface Notification {
  id: string;
  groupId: string;
  targetMemberId?: string | null;
  type: string;
  title: string;
  message: string;
  data?: string | null; // JSON
  isRead: boolean;
  createdAt: string;
}

export interface GroupSettings {
  groupId: string;
  reminderDayOfWeek: number; // 0 = Sunday, 1 = Monday, ...
  reminderHour: number; // 0 - 23
  isReminderEnabled: boolean;
}

// Financial Aggregations & Dashboard Models
export interface MemberNetBalance {
  memberId: string;
  memberName: string;
  totalPaid: number; // tổng số tiền đã bỏ ra ứng trước
  totalExpenseShare: number; // tổng số chi phí phải chịu
  totalOwedToOthers: number; // tổng tiền đang nợ người khác (unsettled)
  totalOwedByOthers: number; // tổng tiền người khác đang nợ mình (unsettled)
  netBalance: number; // totalOwedByOthers - totalOwedToOthers
}

export interface PairwiseDebt {
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  aOwesB: number;
  bOwesA: number;
  netDebtorId: string | null; // ID của người đang thực nợ
  netCreditorId: string | null; // ID của người đang được nhận
  netAmount: number; // Số tiền nợ ròng đối chiếu
}

export interface SettlementProposal {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amount: number;
}

export type RealtimeEventType =
  | 'member.created'
  | 'member.updated'
  | 'activity.created'
  | 'activity.updated'
  | 'activity.cancelled'
  | 'debt.created'
  | 'debt.adjusted'
  | 'payment.created'
  | 'payment.confirmed'
  | 'payment.rejected'
  | 'payment.cancelled'
  | 'notification.created'
  | 'group.deleted';

export interface RealtimeMessage {
  eventId: string;
  groupId: string;
  eventType: RealtimeEventType;
  entityId: string;
  actorMemberId?: string | null;
  timestamp: string;
  payload?: any;
}
