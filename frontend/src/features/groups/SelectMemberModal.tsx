import React, { useState } from 'react';
import { UserCheck, Plus, Check } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { getInitials, getAvatarColor } from '../../utils/format.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  status: string;
}

interface SelectMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  members: Member[];
  currentMemberId?: string | null;
  onSelectMember: (member: Member) => void;
  onMemberCreated?: () => void;
}

export const SelectMemberModal: React.FC<SelectMemberModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  members,
  currentMemberId,
  onSelectMember,
  onMemberCreated
}) => {
  const [newMemberName, setNewMemberName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddAndSelect = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMemberName.trim();
    if (!name) return;

    setIsAdding(true);
    const res = await api.addMember(groupCode, name);
    setIsAdding(false);

    if (res.success && res.data) {
      toast.success(`Đã thêm ${name} vào nhóm`);
      setNewMemberName('');
      onSelectMember(res.data);
      if (onMemberCreated) onMemberCreated();
      onClose();
    } else {
      toast.error(res.error || 'Không thể thêm thành viên');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bạn là ai trong nhóm này?">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Hãy chọn tên của bạn để hệ thống hiển thị số tiền bạn cần trả, tiền người khác nợ bạn và tạo mã QR nhận tiền chuẩn xác.
        </p>

        {/* Danh sách thành viên */}
        <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
          {members
            .filter((m) => m.status === 'ACTIVE')
            .map((m) => {
              const isSelected = currentMemberId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onSelectMember(m);
                    onClose();
                  }}
                  className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/80 shadow-sm'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${getAvatarColor(
                        m.name
                      )}`}
                    >
                      {getInitials(m.name)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{m.name}</div>
                      {isSelected && <span className="text-xs font-semibold text-emerald-600">Đang chọn</span>}
                    </div>
                  </div>

                  {isSelected ? (
                    <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                      <Check className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                      <UserCheck className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              );
            })}
        </div>

        {/* Chưa có tên -> Nhập tên mới */}
        <div className="pt-3 border-t border-slate-100">
          <form onSubmit={handleAddAndSelect} className="space-y-2">
            <span className="text-xs font-bold text-slate-600 block">Chưa có tên bạn trong danh sách?</span>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Nhập tên của bạn..."
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
              <button
                type="submit"
                disabled={isAdding || !newMemberName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
};
