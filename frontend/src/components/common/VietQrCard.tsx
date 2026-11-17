import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, QrCode } from 'lucide-react';
import { generateVietQrEmvCo } from '@tinhtien/shared';
import { formatVND } from '../../utils/format.js';
import { toast } from 'sonner';

interface VietQrCardProps {
  bankBin: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount?: number;
  memo?: string;
}

export const VietQrCard: React.FC<VietQrCardProps> = ({
  bankBin,
  bankCode,
  bankName,
  accountNumber,
  accountHolder,
  amount,
  memo
}) => {
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);

  // Sinh mã EMVCo chuẩn
  const qrEmvCo = generateVietQrEmvCo({
    bankBin,
    accountNumber,
    amount,
    memo,
    accountHolderName: accountHolder
  });

  const handleCopyAcc = () => {
    navigator.clipboard.writeText(accountNumber);
    setCopiedAcc(true);
    toast.success('Đã sao chép số tài khoản');
    setTimeout(() => setCopiedAcc(false), 2000);
  };

  const handleCopyMemo = () => {
    if (memo) {
      navigator.clipboard.writeText(memo);
      setCopiedMemo(true);
      toast.success('Đã sao chép nội dung chuyển khoản');
      setTimeout(() => setCopiedMemo(false), 2000);
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-navy-800 text-white p-5 rounded-3xl shadow-xl flex flex-col items-center">
      {/* Header ngân hàng */}
      <div className="w-full flex items-center justify-between pb-3 border-b border-slate-700/60 mb-4">
        <div>
          <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
            VietQR Napas 247
          </span>
          <h4 className="text-base font-bold text-white">{bankCode} - {bankName}</h4>
        </div>
        <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
          <QrCode className="w-5 h-5" />
        </div>
      </div>

      {/* QR Code Container */}
      <div className="bg-white p-4 rounded-2xl shadow-inner mb-4 flex items-center justify-center">
        <QRCodeSVG
          value={qrEmvCo}
          size={190}
          level="M"
          includeMargin={false}
          imageSettings={{
            src: '/vite.svg',
            x: undefined,
            y: undefined,
            height: 28,
            width: 28,
            excavate: true
          }}
        />
      </div>

      {amount ? (
        <div className="mb-3 text-center">
          <div className="text-xs text-slate-400">Số tiền cần chuyển</div>
          <div className="text-2xl font-extrabold text-emerald-400">{formatVND(amount)}</div>
        </div>
      ) : null}

      {/* Thông tin tài khoản & nút copy */}
      <div className="w-full space-y-2.5 text-sm bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/50">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">Chủ tài khoản:</span>
          <span className="font-bold text-slate-100 uppercase">{accountHolder}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">Số tài khoản:</span>
          <div className="flex items-center space-x-2">
            <span className="font-mono font-bold text-slate-100">{accountNumber}</span>
            <button
              onClick={handleCopyAcc}
              className="p-1 text-slate-300 hover:text-white bg-slate-700/70 hover:bg-slate-700 rounded-lg transition"
              title="Sao chép số tài khoản"
            >
              {copiedAcc ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {memo ? (
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs">Nội dung CK:</span>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-semibold text-emerald-300 max-w-[160px] truncate">
                {memo}
              </span>
              <button
                onClick={handleCopyMemo}
                className="p-1 text-slate-300 hover:text-white bg-slate-700/70 hover:bg-slate-700 rounded-lg transition"
                title="Sao chép nội dung"
              >
                {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
