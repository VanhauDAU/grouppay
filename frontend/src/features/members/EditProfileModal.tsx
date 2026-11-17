import React, { useState, useRef } from 'react';
import {
  Palette,
  Camera,
  Image as ImageIcon,
  Smile,
  Check,
  RotateCcw,
  Upload,
  Link2
} from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { Avatar } from '../../components/common/Avatar.js';
import {
  PRESET_COLORS,
  getThemeFromHex,
  DEFAULT_HEX,
  applyThemeToDocument
} from '../../utils/theme.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  member: { id: string; name: string; avatarUrl?: string | null } | null;
  onSuccess?: () => void;
  onThemeChanged?: (hex: string) => void;
}

const EMOJI_LIST = [
  '🦊', '🐱', '🦁', '🐼', '🚀', '💎', '👑', '⚡',
  '☕', '🍔', '🏖️', '🎮', '🚗', '✈️', '💰', '🦄'
];

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  member,
  onSuccess,
  onThemeChanged
}) => {
  const [activeTab, setActiveTab] = useState<'COLOR' | 'AVATAR'>('COLOR');

  // Extract initial hex from member.avatarUrl or default
  const getInitialHex = () => {
    if (member?.avatarUrl?.startsWith('color:#')) {
      return member.avatarUrl.replace('color:', '');
    }
    const saved = localStorage.getItem(`tinhtien_color_${member?.id}`);
    if (saved) return saved;
    return DEFAULT_HEX;
  };

  const [selectedHex, setSelectedHex] = useState<string>(getInitialHex);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(member?.avatarUrl || null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!member) return null;

  // Xử lý upload ảnh từ thiết bị với canvas resize tự động
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file hình ảnh (PNG, JPG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize về tối đa 200x200 để nhẹ database
        const canvas = document.createElement('canvas');
        const maxDim = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setAvatarPreview(dataUrl);
          toast.success('Đã tải ảnh lên thành công!');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSelectColor = (hex: string) => {
    setSelectedHex(hex);
    applyThemeToDocument(hex);
    if (onThemeChanged) onThemeChanged(hex);
  };

  const handleSelectEmoji = (emoji: string) => {
    setAvatarPreview(`emoji:${emoji}`);
  };

  const handleApplyImageUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrlInput.trim()) return;
    setAvatarPreview(imageUrlInput.trim());
    setImageUrlInput('');
    toast.success('Đã chọn ảnh từ link!');
  };

  const handleResetToInitials = () => {
    setAvatarPreview(`color:${selectedHex}`);
    toast.info('Đã chuyển về avatar chữ cái mặc định');
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    // Nếu avatarPreview là null hoặc chữ cái, lưu định dạng color:HEX
    let finalAvatar = avatarPreview;
    if (!finalAvatar || finalAvatar.startsWith('color:')) {
      finalAvatar = `color:${selectedHex}`;
    }

    try {
      const res = await api.updateMember(groupCode, member.id, { avatarUrl: finalAvatar });
      if (!res.success) {
        toast.error(res.error || 'Lỗi khi lưu ảnh đại diện');
        setIsSubmitting(false);
        return;
      }

      localStorage.setItem(`tinhtien_color_${member.id}`, selectedHex);
      localStorage.setItem('tinhtien_user_theme_hex', selectedHex);
      applyThemeToDocument(selectedHex);

      // Cập nhật ngay localStorage current member nếu là tài khoản của mình
      const savedStr = localStorage.getItem('tinhtien_current_member');
      if (savedStr) {
        try {
          const current = JSON.parse(savedStr);
          if (current.id === member.id) {
            current.avatarUrl = finalAvatar;
            localStorage.setItem('tinhtien_current_member', JSON.stringify(current));
          }
        } catch {}
      }

      toast.success('Cập nhật màu sắc & ảnh đại diện thành công!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi lưu thông tin');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tùy chỉnh màu sắc & Ảnh đại diện" maxWidth="md">
      <div className="space-y-4">
        {/* Live Preview Card */}
        <div
          className="p-4 rounded-2xl border flex items-center justify-between transition-all duration-300"
          style={{
            background: `linear-gradient(135deg, ${selectedHex}15 0%, #ffffff 80%)`,
            borderColor: `${selectedHex}40`
          }}
        >
          <div className="flex items-center space-x-3.5">
            <div className="relative">
              <Avatar
                name={member.name}
                avatarUrl={avatarPreview || `color:${selectedHex}`}
                size="lg"
                className="ring-2 ring-white shadow-sm"
              />
              <div
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center shadow-2xs"
                style={{ backgroundColor: selectedHex }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>

            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-slate-800 text-sm">{member.name}</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-2xs"
                  style={{ backgroundColor: selectedHex }}
                >
                  Xem trước
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Màu chủ đạo & ảnh đại diện hiển thị toàn app</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-bold">Mã màu</span>
            <span className="text-xs font-mono font-extrabold text-slate-700">{selectedHex.toUpperCase()}</span>
          </div>
        </div>

        {/* Tab switch: Màu chủ đạo vs Ảnh đại diện */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('COLOR')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'COLOR' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Bảng màu chủ đạo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('AVATAR')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center space-x-1.5 transition ${
              activeTab === 'AVATAR' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Đổi ảnh đại diện</span>
          </button>
        </div>

        {/* NỘI DUNG TAB 1: BẢNG MÀU CHỦ ĐẠO */}
        {activeTab === 'COLOR' && (
          <div className="space-y-3.5">
            {/* Custom Color Wheel Picker */}
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="relative">
                  <input
                    type="color"
                    value={selectedHex}
                    onChange={(e) => handleSelectColor(e.target.value)}
                    className="w-9 h-9 rounded-xl cursor-pointer border-0 bg-transparent p-0 overflow-hidden"
                  />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Bảng màu tùy chỉnh</span>
                  <span className="text-[10px] text-slate-400">Chọn bất kỳ màu nào bạn thích từ dải màu</span>
                </div>
              </div>

              <input
                type="text"
                value={selectedHex}
                onChange={(e) => {
                  if (e.target.value.startsWith('#') && e.target.value.length <= 7) {
                    setSelectedHex(e.target.value);
                    if (e.target.value.length === 7) handleSelectColor(e.target.value);
                  }
                }}
                className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-center font-mono font-bold text-slate-700"
              />
            </div>

            {/* Grid 20 màu sắc tuyển chọn */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                20 màu sắc nổi bật
              </span>
              <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                {PRESET_COLORS.map((c) => {
                  const isSelected = selectedHex.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectColor(c.hex)}
                      className={`h-11 rounded-xl flex flex-col items-center justify-center relative transition transform active:scale-90 ${
                        isSelected ? 'ring-2 ring-slate-900 ring-offset-2 scale-105 shadow-sm' : 'hover:scale-102'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white stroke-[3] drop-shadow-xs" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* NỘI DUNG TAB 2: ĐỔI ẢNH ĐẠI DIỆN */}
        {activeTab === 'AVATAR' && (
          <div className="space-y-3.5">
            {/* 1. Tải ảnh từ thiết bị */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              <span className="text-xs font-bold text-slate-800 block mb-1">Tải ảnh từ máy / điện thoại</span>
              <p className="text-[11px] text-slate-400 mb-2.5">Hỗ trợ ảnh chân dung, phong cảnh hoặc ảnh chụp từ máy ảnh.</p>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold py-2.5 px-4 rounded-xl border border-slate-200 text-xs flex items-center justify-center space-x-2 transition shadow-2xs active:scale-95"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                <span>Chọn ảnh từ thiết bị</span>
              </button>
            </div>

            {/* 2. Bộ sưu tập Emoji 3D */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Hoặc chọn biểu tượng Avatar 3D
              </span>
              <div className="grid grid-cols-8 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80">
                {EMOJI_LIST.map((emoji) => {
                  const isSelected = avatarPreview === `emoji:${emoji}`;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleSelectEmoji(emoji)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition active:scale-90 ${
                        isSelected ? 'bg-white ring-2 ring-slate-900 shadow-xs scale-110' : 'hover:bg-white/80'
                      }`}
                    >
                      <span>{emoji}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Dán link ảnh Online hoặc khôi phục mặc định */}
            <div className="flex items-center space-x-2 pt-1">
              <form onSubmit={handleApplyImageUrl} className="flex-1 flex items-center space-x-1.5">
                <input
                  type="url"
                  placeholder="Dán link ảnh (https://...)"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded-xl transition"
                >
                  Dán
                </button>
              </form>

              <button
                type="button"
                onClick={handleResetToInitials}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition"
                title="Khôi phục chữ cái tên"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Nút hành động */}
        <div className="pt-2 flex items-center space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="flex-1 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs shadow-md transition active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: selectedHex }}
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
