import React, { useState, useEffect } from 'react';
import { VIETNAM_BANKS } from '@tinhtien/shared';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  bankAccount?: any;
}

interface BankConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  member: Member | null;
  onSuccess: () => void;
}

export const BankConfigModal: React.FC<BankConfigModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  member,
  onSuccess
}) => {
  const [selectedBankBin, setSelectedBankBin] = useState(VIETNAM_BANKS[0].bin);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (member) {
      if (member.bankAccount) {
        setSelectedBankBin(member.bankAccount.bankBin || VIETNAM_BANKS[0].bin);
        setAccountNumber(member.bankAccount.accountNumber || '');
        setAccountHolder(member.bankAccount.accountHolder || member.name.toUpperCase());
      } else {
        setSelectedBankBin(VIETNAM_BANKS[0].bin);
        setAccountNumber('');
        setAccountHolder(member.name.toUpperCase());
      }
    }
  }, [member, isOpen]);

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) {
      toast.error('Vui lòng chọn thành viên trước khi cài đặt tài khoản');
      return;
    }
    if (!accountNumber.trim()) {
      toast.error('Vui lòng nhập số tài khoản ngân hàng');
      return;
    }
    if (!accountHolder.trim()) {
      toast.error('Vui lòng nhập tên chủ tài khoản');
      return;
    }

    const selectedBank = VIETNAM_BANKS.find((b) => b.bin === selectedBankBin) || VIETNAM_BANKS[0];

    setIsSubmitting(true);
    const res = await api.saveMemberBank(groupCode, member.id, {
      bankBin: selectedBank.bin,
      bankCode: selectedBank.code,
      bankName: selectedBank.shortName,
      accountNumber: accountNumber.trim(),
      accountHolder: accountHolder.trim().toUpperCase(),
      isQrEnabled: true
    });
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Đã lưu cấu hình tài khoản VietQR thành công!');
      onSuccess();
      onClose();
    } else {
      toast.error(res.error || 'Không thể lưu thông tin ngân hàng');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={member ? `Cài đặt VietQR cho ${member.name}` : 'Cài đặt tài khoản ngân hàng nhận tiền'}
    >
      <form onSubmit={handleSaveBank} className="space-y-4">
        <p className="text-xs text-slate-500">
          Thông tin ngân hàng này dùng để tự động tạo mã QR VietQR Napas khi các thành viên khác trả nợ cho bạn.
        </p>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ngân hàng thụ hưởng *
          </label>
          <select
            value={selectedBankBin}
            onChange={(e) => setSelectedBankBin(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-emerald-500"
          >
            {VIETNAM_BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>
                {b.shortName} - {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Số tài khoản *
          </label>
          <input
            type="text"
            placeholder="Ví dụ: 0123456789"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-emerald-500"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Tên chủ tài khoản (viết hoa không dấu) *
          </label>
          <input
            type="text"
            placeholder="Ví dụ: NGUYEN VAN A"
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold uppercase focus:outline-none focus:border-emerald-500"
            required
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-600/20 transition active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu tài khoản VietQR'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
