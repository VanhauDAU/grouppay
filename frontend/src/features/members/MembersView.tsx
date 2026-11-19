import React, { useState } from 'react';
import {
  UserPlus,
  CreditCard,
  Edit2,
  UserX,
  UserCheck,
  Building2,
  Palette
} from 'lucide-react';
import { getInitials } from '../../utils/format.js';
import { getMemberTheme } from '../../utils/theme.js';
import { Avatar } from '../../components/common/Avatar.js';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  status: string;
  avatarUrl?: string | null;
  bankAccount?: any;
}

interface MembersViewProps {
  groupCode: string;
  currentMemberId?: string | null;
  members: Member[];
  onRefresh: () => void;
  isOpenAddModal: boolean;
  onOpenAddModal: () => void;
  onCloseAddModal: () => void;
  onOpenBankConfig: (member: Member) => void;
  onOpenThemePicker?: (member: Member) => void;
}

export const MembersView: React.FC<MembersViewProps> = ({
  groupCode,
  currentMemberId,
  members,
  onRefresh,
  isOpenAddModal,
  onOpenAddModal,
  onCloseAddModal,
  onOpenBankConfig,
  onOpenThemePicker
}) => {
  const [newMemberName, setNewMemberName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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
    <div className="space-y-3.5 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Thành viên ({members.length})</h3>
          <p className="text-[11px] text-slate-400">Quản lý tên, màu sắc nhận diện và VietQR nhận tiền</p>
        </div>

        <button
          type="button"
          onClick={onOpenAddModal}
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 transition shadow-xs active:scale-95"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Thêm bạn</span>
        </button>
      </div>

      {/* Danh sách thành viên */}
      <div className="space-y-2">
        {members.map((m) => {
          const isMe = currentMemberId === m.id;
          const isInactive = m.status === 'INACTIVE';
          const bank = m.bankAccount;
          const theme = getMemberTheme(m);

          return (
            <div
              key={m.id}
              className={`p-3.5 rounded-2xl border transition shadow-2xs bg-white ${
                isInactive ? 'opacity-50 border-slate-200' : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => onOpenThemePicker && onOpenThemePicker(m)}
                    title="Bấm để đổi ảnh đại diện & màu chủ đạo"
                    className="relative group focus:outline-none transition active:scale-95"
                  >
                    <Avatar
                      name={m.name}
                      avatarUrl={m.avatarUrl}
                      size="md"
                      className="group-hover:scale-105 transition shadow-2xs"
                    />
                    <div
                      className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border border-white flex items-center justify-center shadow-2xs"
                      style={{ backgroundColor: theme.hex }}
                    >
                      <Palette className="w-2 h-2 text-white" />
                    </div>
                  </button>

                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-slate-900 text-xs">{m.name}</span>
                      {isMe && (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                          Bạn
                        </span>
                      )}
                      {isInactive && (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                          Đã ẩn
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {isInactive ? 'Đã ngừng hoạt động' : 'Thành viên nhóm'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-1">
                  {onOpenThemePicker && (
                    <button
                      onClick={() => onOpenThemePicker(m)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
                      title="Màu chủ đạo & Ảnh đại diện"
                    >
                      <Palette className="w-3.5 h-3.5" style={{ color: theme.hex }} />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setEditingMember(m);
                      setEditName(m.name);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
                    title="Đổi tên"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleToggleStatus(m)}
                    className={`p-1.5 rounded-xl transition ${
                      isInactive
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'
                    }`}
                    title={isInactive ? 'Kích hoạt lại' : 'Ngừng hoạt động'}
                  >
                    {isInactive ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
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
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-slate-800 transition"
              required
            />
          </div>

          <div className="pt-2 flex items-center space-x-3">
            <button
              type="button"
              onClick={onCloseAddModal}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isAdding}
              className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs transition disabled:opacity-50"
            >
              {isAdding ? 'Đang thêm...' : 'Thêm thành viên'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Đổi tên */}
      <Modal
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title={`Đổi tên thành viên: ${editingMember?.name}`}
      >
        <form onSubmit={handleUpdateName} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Tên mới *
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-slate-800 transition"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Đổi tên sẽ không ảnh hưởng đến ID, lịch sử chi tiêu hay công nợ của thành viên này.
            </p>
          </div>

          <div className="pt-2 flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setEditingMember(null)}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs transition disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu tên'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
