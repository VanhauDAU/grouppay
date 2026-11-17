import { z } from 'zod';

export const CreateGroupSchema = z.object({
  name: z.string().trim().min(2, 'Tên nhóm phải có ít nhất 2 ký tự').max(100, 'Tên nhóm không quá 100 ký tự'),
  description: z.string().trim().max(500, 'Mô tả không quá 500 ký tự').optional(),
  initialMembers: z
    .array(z.string().trim().min(1, 'Tên thành viên không được để trống'))
    .min(2, 'Nhóm cần có ít nhất 2 thành viên')
});

export const UpdateGroupSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional()
});

export const CreateMemberSchema = z.object({
  name: z.string().trim().min(1, 'Tên thành viên không được để trống').max(50, 'Tên không quá 50 ký tự'),
  avatarUrl: z.string().max(255).optional().nullable()
});

export const UpdateMemberSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  avatarUrl: z.string().max(255).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
});

export const BankAccountSchema = z.object({
  bankBin: z.string().regex(/^\d{6}$/, 'Mã BIN ngân hàng gồm đúng 6 chữ số'),
  bankCode: z.string().min(2).max(20),
  bankName: z.string().min(2).max(100),
  accountNumber: z.string().trim().min(4, 'Số tài khoản ít nhất 4 ký tự').max(30),
  accountHolder: z.string().trim().min(2, 'Tên chủ tài khoản không hợp lệ').max(100),
  isQrEnabled: z.boolean().default(true)
});

export const ExpensePayerInputSchema = z.object({
  memberId: z.string().min(1),
  amountPaid: z.number().int('Số tiền phải là số nguyên').positive('Số tiền thanh toán phải lớn hơn 0')
});

export const ExpenseSplitInputSchema = z.object({
  memberId: z.string().min(1),
  amountOwed: z.number().int('Số tiền phải là số nguyên').nonnegative('Số tiền chịu chi phí không được âm')
});

export const CreateExpenseInputSchema = z.object({
  title: z.string().trim().min(1, 'Tên khoản chi không được để trống').max(150),
  amount: z.number().int('Số tiền phải là số nguyên').positive('Số tiền phải lớn hơn 0'),
  splitType: z.enum(['EQUAL', 'EXACT']).default('EQUAL'),
  payers: z.array(ExpensePayerInputSchema).min(1, 'Phải có ít nhất 1 người thanh toán'),
  participants: z.array(z.string().min(1)).min(1, 'Phải có ít nhất 1 người tham gia chịu chi phí'),
  customSplits: z.array(ExpenseSplitInputSchema).optional()
});

export const CreateActivitySchema = z.object({
  title: z.string().trim().min(1, 'Tiêu đề hoạt động không được để trống').max(150),
  description: z.string().trim().max(500).optional().nullable(),
  occurredAt: z.string().datetime().or(z.string().min(10)),
  expenses: z.array(CreateExpenseInputSchema).min(1, 'Hoạt động cần ít nhất 1 khoản chi')
});

export const UpdateActivitySchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  occurredAt: z.string().optional(),
  reason: z.string().trim().min(2, 'Lý do chỉnh sửa là bắt buộc').max(255),
  expenses: z.array(CreateExpenseInputSchema).min(1, 'Hoạt động cần ít nhất 1 khoản chi')
});

export const CancelActivitySchema = z.object({
  reason: z.string().trim().min(2, 'Bắt buộc nhập lý do hủy hoạt động').max(255)
});

export const CreatePaymentSchema = z.object({
  payerMemberId: z.string().min(1),
  recipientMemberId: z.string().min(1),
  amount: z.number().int('Số tiền phải là số nguyên').positive('Số tiền thanh toán phải lớn hơn 0'),
  idempotencyKey: z.string().min(8, 'Mã chống trùng không hợp lệ').max(64),
  proofImageUrl: z.string().url().optional().nullable()
});

export const ConfirmPaymentSchema = z.object({
  paymentId: z.string().min(1)
});

export const RejectPaymentSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(2, 'Bắt buộc nhập lý do từ chối').max(255)
});

export const InitialDebtItemSchema = z.object({
  debtorMemberId: z.string().min(1),
  creditorMemberId: z.string().min(1),
  amount: z.number().int('Số tiền phải là số nguyên').positive('Số tiền phải lớn hơn 0'),
  note: z.string().trim().max(255).optional()
});

export const InitialDebtBatchSchema = z.object({
  debts: z.array(InitialDebtItemSchema).min(1, 'Cần ít nhất 1 khoản nợ')
});

export const UpdateGroupSettingsSchema = z.object({
  reminderDayOfWeek: z.number().int().min(0).max(6).optional(),
  reminderHour: z.number().int().min(0).max(23).optional(),
  isReminderEnabled: z.boolean().optional()
});
