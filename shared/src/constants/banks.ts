export interface BankInfo {
  bin: string;
  code: string;
  name: string;
  shortName: string;
}

export const VIETNAM_BANKS: BankInfo[] = [
  { bin: '970436', code: 'VCB', name: 'Ngân hàng TMCP Ngoại thương Việt Nam', shortName: 'Vietcombank' },
  { bin: '970422', code: 'MB', name: 'Ngân hàng TMCP Quân đội', shortName: 'MBBank' },
  { bin: '970407', code: 'TCB', name: 'Ngân hàng TMCP Kỹ thương Việt Nam', shortName: 'Techcombank' },
  { bin: '970415', code: 'CTG', name: 'Ngân hàng TMCP Công thương Việt Nam', shortName: 'VietinBank' },
  { bin: '970418', code: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam', shortName: 'BIDV' },
  { bin: '970405', code: 'VBA', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam', shortName: 'Agribank' },
  { bin: '970416', code: 'ACB', name: 'Ngân hàng TMCP Á Châu', shortName: 'ACB' },
  { bin: '970432', code: 'VPB', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng', shortName: 'VPBank' },
  { bin: '970423', code: 'TPB', name: 'Ngân hàng TMCP Tiên Phong', shortName: 'TPBank' },
  { bin: '970403', code: 'STB', name: 'Ngân hàng TMCP Sài Gòn Thương Tín', shortName: 'Sacombank' },
  { bin: '970448', code: 'OCB', name: 'Ngân hàng TMCP Phương Đông', shortName: 'OCB' },
  { bin: '970437', code: 'HDB', name: 'Ngân hàng TMCP Phát triển TP.HCM', shortName: 'HDBank' },
  { bin: '970441', code: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam', shortName: 'VIB' },
  { bin: '970443', code: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội', shortName: 'SHB' },
  { bin: '970425', code: 'ABB', name: 'Ngân hàng TMCP An Bình', shortName: 'AnBinhBank' },
  { bin: '970431', code: 'EIB', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam', shortName: 'Eximbank' },
  { bin: '970428', code: 'NAB', name: 'Ngân hàng TMCP Nam Á', shortName: 'NamABank' },
  { bin: '970454', code: 'VCCB', name: 'Ngân hàng TMCP Bản Việt', shortName: 'BVBank' },
  { bin: '970429', code: 'SCB', name: 'Ngân hàng TMCP Sài Gòn', shortName: 'SCB' },
  { bin: '970438', code: 'BVB', name: 'Ngân hàng TMCP Bảo Việt', shortName: 'BaoVietBank' },
  { bin: '970440', code: 'SEAB', name: 'Ngân hàng TMCP Đông Nam Á', shortName: 'SeABank' },
  { bin: '970426', code: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam', shortName: 'MSB' },
  { bin: '970427', code: 'VAB', name: 'Ngân hàng TMCP Việt Á', shortName: 'VietABank' },
  { bin: '970433', code: 'VIETBANK', name: 'Ngân hàng TMCP Việt Nam Thương Tín', shortName: 'VietBank' },
  { bin: '970452', code: 'KLB', name: 'Ngân hàng TMCP Kiên Long', shortName: 'Kienlongbank' },
  { bin: '970449', code: 'LPB', name: 'Ngân hàng TMCP Lộc Phát Việt Nam', shortName: 'LPBank' },
  { bin: '970458', code: 'UOB', name: 'Ngân hàng United Overseas Bank Việt Nam', shortName: 'UOB' },
  { bin: '970468', code: 'TIMO', name: 'Ngân hàng số Timo', shortName: 'Timo' },
  { bin: '970462', code: 'CAKE', name: 'Ngân hàng số Cake by VPBank', shortName: 'CAKE' }
];

export const findBankByBin = (bin: string): BankInfo | undefined => {
  return VIETNAM_BANKS.find((b) => b.bin === bin);
};

export const findBankByCode = (code: string): BankInfo | undefined => {
  const upper = code.toUpperCase();
  return VIETNAM_BANKS.find((b) => b.code.toUpperCase() === upper || b.shortName.toUpperCase() === upper);
};
