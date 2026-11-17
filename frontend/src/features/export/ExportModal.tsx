import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Printer, Download, Image as ImageIcon } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { formatVND, formatDateTime } from '../../utils/format.js';
import { toast } from 'sonner';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  onOpenExportImage?: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  onOpenExportImage
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = async () => {
    setIsExporting(true);
    const res = await api.getExportData(groupCode);
    setIsExporting(false);

    if (!res.success || !res.data) {
      toast.error('Không thể lấy dữ liệu xuất file');
      return;
    }

    const { group, netBalances, settlementProposals, activities, obligations, payments } = res.data;

    // 1. Sheet Tổng quan & Số dư
    const overviewData = [
      ['BÁO CÁO CHI TIÊU & CÔNG NỢ NHÓM'],
      ['Tên nhóm:', group.name],
      ['Mã nhóm:', group.id],
      ['Thời điểm xuất:', formatDateTime(group.exportedAt)],
      [],
      ['BẢNG SỐ DƯ RÒNG THÀNH VIÊN'],
      ['Thành viên', 'Đang nợ người khác', 'Được người khác nợ', 'Số dư ròng (+ / -)']
    ];

    netBalances.forEach((b: any) => {
      overviewData.push([
        b.memberName,
        b.totalOwedToOthers,
        b.totalOwedByOthers,
        b.netBalance
      ]);
    });

    // 2. Sheet Đề xuất thanh toán tối giản
    const settlementData = [
      ['ĐỀ XUẤT THANH TOÁN TỐI GIẢN'],
      ['Người chuyển', 'Người nhận', 'Số tiền (VND)']
    ];
    settlementProposals.forEach((p: any) => {
      settlementData.push([p.fromMemberName, p.toMemberName, p.amount]);
    });

    // 3. Sheet Hoạt động
    const activityData = [
      ['DANH SÁCH HOẠT ĐỘNG'],
      ['Tiêu đề', 'Thời gian', 'Trạng thái', 'Mô tả']
    ];
    activities.forEach((a: any) => {
      activityData.push([a.title, formatDateTime(a.occurred_at), a.status, a.description || '']);
    });

    // 4. Sheet Nghĩa vụ nợ gốc
    const obligationData = [
      ['DANH SÁCH NGHĨA VỤ NỢ GỐC'],
      ['Người nợ', 'Người được nhận', 'Số tiền gốc', 'Đã trả', 'Còn lại', 'Loại nguồn', 'Trạng thái']
    ];
    obligations.forEach((o: any) => {
      obligationData.push([
        o.debtor_name,
        o.creditor_name,
        o.original_amount,
        o.settled_amount,
        o.original_amount - o.settled_amount,
        o.source_type,
        o.status
      ]);
    });

    // 5. Sheet Thanh toán
    const paymentData = [
      ['LỊCH SỬ THANH TOÁN'],
      ['Người trả', 'Số tiền', 'Trạng thái', 'Thời gian']
    ];
    payments.forEach((p: any) => {
      paymentData.push([p.payer_name, p.total_amount, p.status, formatDateTime(p.created_at)]);
    });

    // Tạo Workbook
    const wb = XLSX.utils.book_new();
    const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
    const wsSettlement = XLSX.utils.aoa_to_sheet(settlementData);
    const wsActivities = XLSX.utils.aoa_to_sheet(activityData);
    const wsObligations = XLSX.utils.aoa_to_sheet(obligationData);
    const wsPayments = XLSX.utils.aoa_to_sheet(paymentData);

    XLSX.utils.book_append_sheet(wb, wsOverview, 'Số dư thành viên');
    XLSX.utils.book_append_sheet(wb, wsSettlement, 'Đề xuất thanh toán');
    XLSX.utils.book_append_sheet(wb, wsActivities, 'Hoạt động');
    XLSX.utils.book_append_sheet(wb, wsObligations, 'Nghĩa vụ nợ gốc');
    XLSX.utils.book_append_sheet(wb, wsPayments, 'Lịch sử thanh toán');

    // Lưu file
    const fileName = `TinhTien_${groupCode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Đã tải xuống file Excel thành công!');
    onClose();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Xuất dữ liệu & Báo cáo">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Xuất toàn bộ bảng tính công nợ, chi phí và lịch sử chuyển tiền của nhóm sang định dạng Excel hoặc in bản báo cáo PDF.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {onOpenExportImage && (
            <button
              onClick={() => {
                onClose();
                onOpenExportImage();
              }}
              className="p-4 rounded-2xl border border-sky-200 bg-sky-50/70 hover:bg-sky-50 text-left transition active:scale-95 flex items-center space-x-3 col-span-2 shadow-2xs"
            >
              <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">Xuất ảnh tóm tắt gửi Messenger / Zalo</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Tối giản, chỉ hiển thị ai chuyển cho ai bao nhiêu tiền để gửi vào chat nhóm
                </div>
              </div>
            </button>
          )}

          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-left transition active:scale-95 flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm">Xuất file Excel</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Đầy đủ các sheet (.xlsx)</div>
            </div>
          </button>

          <button
            onClick={handlePrint}
            className="p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left transition active:scale-95 flex flex-col justify-between space-y-3"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-2xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm">In / Lưu PDF</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Bản in trình duyệt</div>
            </div>
          </button>
        </div>
      </div>
    </Modal>
  );
};
