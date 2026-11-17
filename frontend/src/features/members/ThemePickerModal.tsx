import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { COLOR_THEMES, type ThemeColor } from '../../utils/theme.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface ThemePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  member: { id: string; name: string; avatarUrl?: string | null } | null;
  currentThemeId: string;
  onThemeSelect: (themeId: string) => void;
  onSuccess?: () => void;
}

export const ThemePickerModal: React.FC<ThemePickerModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  member,
  currentThemeId,
  onThemeSelect,
  onSuccess
}) => {
  const handleSelect = async (themeKey: string) => {
    onThemeSelect(themeKey);

    if (member && groupCode) {
      const avatarTag = `color:${themeKey}`;
      try {
        await api.updateMember(groupCode, member.id, { avatarUrl: avatarTag });
        toast.success(`Đã đổi màu chủ đạo thành ${COLOR_THEMES[themeKey].name}!`);
        if (onSuccess) onSuccess();
      } catch (err) {
        console.error('Failed to update member color on server:', err);
      }
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Chọn màu chủ đạo của bạn" maxWidth="sm">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Màu chủ đạo sẽ làm nổi bật ảnh đại diện, số dư và các nút bấm thao tác của bạn trong nhóm.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          {Object.values(COLOR_THEMES).map((th: ThemeColor) => {
            const isSelected = th.id === currentThemeId;
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => handleSelect(th.id)}
                className={`p-3 rounded-2xl border text-left transition flex items-center justify-between group ${
                  isSelected
                    ? `${th.borderLight} ${th.bgLight} ring-2 ${th.ring} font-bold`
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-xs transition group-hover:scale-105"
                    style={{ backgroundColor: th.hex }}
                  >
                    {isSelected ? <Check className="w-4 h-4 stroke-[3]" /> : null}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-800 block">{th.name}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
