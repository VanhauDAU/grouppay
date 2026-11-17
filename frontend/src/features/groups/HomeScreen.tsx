import React, { useState } from 'react';
import { Plus, Users, ArrowRight, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface RecentGroup {
  id: string;
  publicCode: string;
  name: string;
  lastVisited: string;
}

interface HomeScreenProps {
  onSelectGroup: (groupCode: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onSelectGroup }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<string[]>(['', '']);
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Lấy danh sách nhóm đã truy cập từ LocalStorage
  const getRecentGroups = (): RecentGroup[] => {
    try {
      const saved = localStorage.getItem('tinhtien_recent_groups');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  };

  const [recentGroups] = useState<RecentGroup[]>(getRecentGroups);

  const handleAddMemberInput = () => {
    setMembers([...members, '']);
  };

  const handleRemoveMemberInput = (index: number) => {
    if (members.length <= 2) {
      toast.error('Nhóm cần ít nhất 2 thành viên');
      return;
    }
    setMembers(members.filter((_, idx) => idx !== index));
  };

  const handleMemberNameChange = (index: number, value: string) => {
    const updated = [...members];
    updated[index] = value;
    setMembers(updated);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      toast.error('Vui lòng nhập tên nhóm');
      return;
    }

    const validMembers = members.map((m) => m.trim()).filter(Boolean);
    if (validMembers.length < 2) {
      toast.error('Vui lòng nhập ít nhất 2 thành viên');
      return;
    }

    setIsLoading(true);
    const res = await api.createGroup({
      name: trimmedName,
      description: description.trim() || undefined,
      initialMembers: validMembers
    });
    setIsLoading(false);

    if (res.success && res.data) {
      toast.success('Tạo nhóm thành công!');
      // Lưu vào recent groups
      const recents = getRecentGroups();
      const updated = [
        {
          id: res.data.id,
          publicCode: res.data.publicCode,
          name: res.data.name,
          lastVisited: new Date().toISOString()
        },
        ...recents.filter((r) => r.publicCode !== res.data.publicCode)
      ];
      localStorage.setItem('tinhtien_recent_groups', JSON.stringify(updated.slice(0, 10)));
      onSelectGroup(res.data.publicCode);
    } else {
      toast.error(res.error || 'Không thể tạo nhóm');
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim();
    if (!cleanCode) {
      toast.error('Vui lòng nhập mã nhóm hoặc link');
      return;
    }
    // Trích xuất mã nếu dán link
    const match = cleanCode.match(/group\/([a-zA-Z0-9_-]+)/);
    const extractedCode = match ? match[1] : cleanCode;
    onSelectGroup(extractedCode);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 max-w-lg mx-auto">
      {/* Brand Header */}
      <div className="pt-6 sm:pt-10 pb-6 text-center">
        <img
          src="/icons/icon-192.png"
          alt="Sổ Nợ Nghĩa Tình"
          className="w-20 h-20 rounded-3xl shadow-lg shadow-pink-500/20 mx-auto mb-3.5 object-cover"
        />
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Sổ Nợ Nghĩa Tình</h1>
        <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
          Quản lý chi tiêu, chia tiền lẻ công bằng và theo dõi công nợ nhóm gắn kết, minh bạch.
        </p>
      </div>

      {/* Main Action Cards */}
      <div className="space-y-4">
        {!isCreating ? (
          <>
            {/* Nút Tạo nhóm mới */}
            <button
              onClick={() => setIsCreating(true)}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white p-5 rounded-3xl shadow-xl shadow-emerald-600/20 flex items-center justify-between group transition active:scale-[0.99]"
            >
              <div className="flex items-center space-x-4 text-left">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Plus className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Tạo nhóm mới</h3>
                  <p className="text-emerald-100 text-xs mt-0.5">Ăn uống, du lịch, sinh hoạt chung</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-white/80 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Nhập mã hoặc link nhóm */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Đã có mã hoặc link nhóm?
              </h4>
              <form onSubmit={handleJoin} className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Nhập mã nhóm hoặc link..."
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-2xl text-sm font-bold transition active:scale-95"
                >
                  Vào
                </button>
              </form>
            </div>

            {/* Nhóm gần đây */}
            {recentGroups.length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                  Nhóm đã truy cập gần đây
                </h4>
                <div className="space-y-2">
                  {recentGroups.map((rg) => (
                    <button
                      key={rg.publicCode}
                      onClick={() => onSelectGroup(rg.publicCode)}
                      className="w-full bg-white hover:bg-slate-100/80 border border-slate-200/80 p-4 rounded-2xl flex items-center justify-between text-left transition"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{rg.name}</div>
                          <div className="text-xs text-slate-400">Mã: {rg.publicCode}</div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Form tạo nhóm */
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-md animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">Thiết lập nhóm mới</h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Hủy
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tên nhóm *
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Du lịch Đà Lạt, Tiền ăn trưa..."
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Mô tả (tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Ghi chú về nhóm..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Thành viên ban đầu ({members.length}) *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddMemberInput}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm tên</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar pr-1">
                  {members.map((m, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <input
                        type="text"
                        placeholder={`Tên thành viên ${idx + 1}`}
                        value={m}
                        onChange={(e) => handleMemberNameChange(idx, e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                        required
                      />
                      {members.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMemberInput(idx)}
                          className="p-2 text-slate-400 hover:text-rose-500 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-600/20 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? 'Đang tạo nhóm...' : 'Tạo nhóm và lấy link chia sẻ'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Footer Feature Badges */}
      <div className="py-6 border-t border-slate-200/60 mt-6 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
        <div className="flex flex-col items-center">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mb-1" />
          <span>Không cần tài khoản</span>
        </div>
        <div className="flex flex-col items-center">
          <Sparkles className="w-4 h-4 text-teal-600 mb-1" />
          <span>VietQR chuẩn Napas</span>
        </div>
        <div className="flex flex-col items-center">
          <Users className="w-4 h-4 text-blue-600 mb-1" />
          <span>Đồng bộ Realtime</span>
        </div>
      </div>
    </div>
  );
};
