import React, { useRef, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';

interface DeleteGroupSectionProps {
  groupCode: string;
  groupName: string;
  ownerToken: string;
  onDeleted: () => void;
}

/** Vùng nguy hiểm: chỉ hiển thị trên thiết bị đã tạo nhóm (có mã chủ nhóm). */
export const DeleteGroupSection: React.FC<DeleteGroupSectionProps> = ({ groupCode, groupName, ownerToken, onDeleted }) => {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const lockRef = useRef(false);

  const matches = confirmName.trim() === groupName.trim();

  const handleDelete = async () => {
    if (!matches || lockRef.current) return;
    lockRef.current = true;
    setIsDeleting(true);
    try {
      const res = await api.deleteGroup(groupCode, ownerToken, confirmName.trim());
      if (res.success) {
        toast.success(`Đã xóa nhóm "${groupName}"`);
        setOpen(false);
        onDeleted();
      } else {
        toast.error(res.error || 'Không thể xóa nhóm');
      }
    } finally {
      lockRef.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="-mt-14 mb-6 rounded-3xl border border-rose-200 bg-rose-50/50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-rose-900">Vùng nguy hiểm</div>
            <div className="text-xs text-rose-800/80 leading-snug mt-0.5">
              Bạn là người tạo nhóm. Xóa nhóm sẽ xóa vĩnh viễn toàn bộ khoản chi, công nợ, lịch sử thanh toán của mọi thành viên.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setConfirmName('');
            setOpen(true);
          }}
          className="mt-3 w-full bg-white hover:bg-rose-600 hover:text-white text-rose-600 border border-rose-300 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
        >
          <Trash2 className="w-4 h-4" /> Xóa nhóm
        </button>
      </div>

      <Modal isOpen={open} onClose={() => !isDeleting && setOpen(false)} title="Xóa nhóm vĩnh viễn?" maxWidth="sm">
        <div className="space-y-3.5">
          <div className="text-[13px] text-slate-600 leading-relaxed">
            Toàn bộ dữ liệu của nhóm <b className="text-slate-900">"{groupName}"</b> sẽ bị xóa và <b>không thể khôi phục</b>:
            khoản chi, công nợ, thanh toán, thông báo, lịch sử. Mọi thành viên sẽ không vào được nhóm nữa.
          </div>
          <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            Mẹo: vào tab <b>Công nợ → Xuất ảnh</b> để lưu lại bảng công nợ trước khi xóa.
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
              Gõ đúng tên nhóm để xác nhận: <span className="text-rose-600">{groupName}</span>
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={groupName}
              autoComplete="off"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-rose-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isDeleting}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs"
            >
              Giữ lại
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!matches || isDeleting}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-2.5 rounded-xl text-xs disabled:opacity-40 active:scale-[0.98] transition"
            >
              {isDeleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
