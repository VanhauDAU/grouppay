import React, { useState } from 'react';
import {
  UserPlus,
  CreditCard,
  Edit2,
  UserX,
  UserCheck,
  Building2
} from 'lucide-react';
import { getInitials, getAvatarColor } from '../../utils/format.js';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  status: string;
  bankAccount?: any;
}

interface MembersViewProps {
  groupCode: string;
  currentMemberId?: string | null;
  members: Member[];
  onRefresh: () => void;
  isOpenAddModal: boolean;
  onCloseAddModal: () => void;
  onOpenBankConfig: (member: Member) => void;
}

export const MembersView: React.FC<MembersViewProps> = ({
  groupCode,
  currentMemberId,
  members,
  onRefresh,
  isOpenAddModal,
  onCloseAddModal,
  onOpenBankConfig
}) => {
  // Thêm thành viên
  const [newMemberName, setNewMemberName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Đổi tên
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    setIsAdding(true);
    const res = await api.addMember(groupCode, newMemberName.trim());
    setIsAdding(false);

    if (res.success) {
      toast.success('Đã thêm thành viên mới');
      setNewMemberName('');
      onCloseAddModal();
      onRefresh();
    } else {
      toast.error(res.error || 'Không thể thêm thành viên');
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !editName.trim()) return;

    setIsSubmitting(true);
    const res = await api.updateMember(groupCode, editingMember.id, { name: editName.trim() });
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Đã đổi tên thành viên');
      setEditingMember(null);
      onRefresh();
    } else {
      toast.error(res.error || 'Không thể cập nhật tên');
    }
  };

  const handleToggleStatus = async (member: Member) => {
    const nextStatus = member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmMsg =
      nextStatus === 'INACTIVE'
        ? `Ngừng hoạt động thành viên "${member.name}"? Dữ liệu công nợ vẫn được giữ nguyên.`
        : `Kích hoạt lại thành viên "${member.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    const res = await api.updateMember(groupCode, member.id, { status: nextStatus });
    if (res.success) {
      toast.success(`Đã ${nextStatus === 'INACTIVE' ? 'ngừng hoạt động' : 'kích hoạt lại'} thành viên`);
      onRefresh();
    } else {
      toast.error(res.error || 'Lỗi khi cập nhật trạng thái');
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
          Danh sách thành viên ({members.length})
        </h3>
        <button
          onClick={onCloseAddModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition active:scale-95"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Thêm người</span>
        </button>
      </div>

      <div className="space-y-2.5">
        {members.map((m) => {
          const isMe = currentMemberId === m.id;
          const isInactive = m.status === 'INACTIVE';
          const bank = m.bankAccount;

          return (
            <div
              key={m.id}
              className={`p-4 rounded-3xl border transition shadow-sm bg-white ${
                isInactive ? 'opacity-50 border-slate-200' : 'border-slate-200/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm ${getAvatarColor(
                      m.name
                    )}`}
                  >
                    {getInitials(m.name)}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 text-sm">{m.name}</span>
                      {isMe && (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Bạn
                        </span>
                      )}
                      {isInactive && (
                        <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                          Ngừng hoạt động
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 mt-0.5">
                      {bank ? (
                        <span className="text-emerald-700 font-semibold flex items-center space-x-1">
                          <Building2 className="w-3 h-3" />
                          <span>
                            {bank.bankCode} • {bank.accountNumber}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Chưa cài VietQR</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => onOpenBankConfig(m)}
                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition"
                    title="Cài đặt tài khoản ngân hàng / VietQR"
                  >
                    <CreditCard className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      setEditingMember(m);
                      setEditName(m.name);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
                    title="Đổi tên"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleToggleStatus(m)}
                    className={`p-2 rounded-xl transition ${
                      isInactive
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                    }`}
                    title={isInactive ? 'Kích hoạt lại' : 'Ngừng hoạt động'}
                  >
                    {isInactive ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Thêm thành viên */}
      <Modal isOpen={isOpenAddModal} onClose={onCloseAddModal} title="Thêm thành viên mới vào nhóm">
        <form onSubmit={handleAddMember} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Tên thành viên *
            </label>
            <input
              type="text"
              placeholder="Nhập tên thành viên..."
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isAdding || !newMemberName.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl transition disabled:opacity-50"
            >
              {isAdding ? 'Đang thêm...' : 'Xác nhận thêm'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Đổi tên thành viên (BR-02: đổi tên không đổi ID) */}
      <Modal isOpen={Boolean(editingMember)} onClose={() => setEditingMember(null)} title="Đổi tên thành viên">
        <form onSubmit={handleUpdateName} className="space-y-4">
          <p className="text-xs text-slate-500">
            Đổi tên sẽ cập nhật hiển thị ở tất cả hoạt động và công nợ cũ mà không làm thay đổi ID thành viên.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Tên mới *
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !editName.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl transition disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu tên mới'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
