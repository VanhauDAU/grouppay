import React, { useState } from 'react';
import { UserCheck, Plus, Check } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { getInitials } from '../../utils/format.js';
import { getMemberTheme } from '../../utils/theme.js';
import { Avatar } from '../../components/common/Avatar.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  status: string;
  avatarUrl?: string | null;
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
          Chọn tên của bạn để xem chi tiết tiền bạn cần trả, tiền người khác nợ bạn và tạo QR nhận tiền.
        </p>

        {/* Danh sách thành viên */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {members
            .filter((m) => m.status === 'ACTIVE')
            .map((m) => {
              const isSelected = currentMemberId === m.id;
              const theme = getMemberTheme(m);
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onSelectMember(m);
                    onClose();
                  }}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition ${
                    isSelected
                      ? 'border-slate-800 bg-slate-50 shadow-xs ring-1 ring-slate-800'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Avatar name={m.name} avatarUrl={m.avatarUrl} size="sm" />
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{m.name}</div>
                      {isSelected && <span className="text-[11px] font-semibold text-slate-500">Đang chọn</span>}
                    </div>
                  </div>

                  {isSelected ? (
                    <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center shadow-xs">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-600">Chọn</span>
                  )}
                </button>
              );
            })}
        </div>

        {/* Thêm thành viên mới */}
        <form onSubmit={handleAddAndSelect} className="pt-3 border-t border-slate-100 flex items-center space-x-2">
          <input
            type="text"
            placeholder="Hoặc nhập tên của bạn..."
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:ring-1 focus:ring-slate-800 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isAdding || !newMemberName.trim()}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center space-x-1 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm</span>
          </button>
        </form>
      </div>
    </Modal>
  );
};
