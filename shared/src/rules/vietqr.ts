/**
 * Business Rules for VietQR Generation (BR-21)
 * Sinh chuỗi mã QR theo chuẩn EMVCo Napas VietQR và đường dẫn ảnh VietQR tương thích.
 */

function formatTlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Tính mã kiểm tra CRC16-CCITT (polynomial 0x1021, init 0xFFFF).
 */
export function calculateCrc16Ccitt(str: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < str.length; i++) {
    const byte = str.charCodeAt(i);
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface VietQrOptions {
  bankBin: string; // 6 chữ số Napas BIN
  accountNumber: string; // Số tài khoản thụ hưởng
  amount?: number; // Số tiền (VND)
  memo?: string; // Nội dung chuyển khoản
  accountHolderName?: string; // Tên chủ tài khoản
}

/**
 * Sinh chuỗi EMVCo VietQR tiêu chuẩn hoàn toàn offline không phụ thuộc dịch vụ bên ngoài.
 */
export function generateVietQrEmvCo(options: VietQrOptions): string {
  const { bankBin, accountNumber, amount, memo } = options;

  // Tag 00: Payload Format Indicator
  let payload = formatTlv('00', '01');

  // Tag 01: Point of Initiation Method (12 = Dynamic có số tiền, 11 = Static)
  payload += formatTlv('01', amount && amount > 0 ? '12' : '11');

  // Tag 38: Consumer Account Information (Napas VietQR)
  const guid = formatTlv('00', 'A000000727');
  const bankBinTlv = formatTlv('00', bankBin);
  const accountNoTlv = formatTlv('01', accountNumber);
  const provider = formatTlv('01', bankBinTlv + accountNoTlv);
  const service = formatTlv('02', 'QRIBFTTA');
  const merchantInfo = guid + provider + service;
  payload += formatTlv('38', merchantInfo);

  // Tag 53: Transaction Currency (704 = VND)
  payload += formatTlv('53', '704');

  // Tag 54: Transaction Amount
  if (amount && amount > 0) {
    payload += formatTlv('54', Math.floor(amount).toString());
  }

  // Tag 58: Country Code
  payload += formatTlv('58', 'VN');

  // Tag 62: Additional Data Field Template (Nội dung chuyển khoản)
  if (memo && memo.trim().length > 0) {
    // Chuẩn hóa loại bỏ dấu tiếng Việt để tránh lỗi font trên các máy đọc QR ngân hàng cũ
    const sanitizedMemo = removeVietnameseTones(memo.trim()).slice(0, 50);
    const memoTlv = formatTlv('08', sanitizedMemo);
    payload += formatTlv('62', memoTlv);
  }

  // Tag 63: CRC16 Checksum
  const withCrcTag = payload + '6304';
  const crc = calculateCrc16Ccitt(withCrcTag);

  return withCrcTag + crc;
}

/**
 * Sinh URL ảnh VietQR nhanh thông qua dịch vụ VietQR chính thức.
 */
export function generateVietQrImageUrl(
  bankCodeOrBin: string,
  accountNumber: string,
  amount?: number,
  memo?: string,
  accountHolderName?: string
): string {
  const baseUrl = `https://img.vietqr.io/image/${bankCodeOrBin}-${accountNumber}-compact2.png`;
  const params = new URLSearchParams();

  if (amount && amount > 0) {
    params.set('amount', Math.floor(amount).toString());
  }
  if (memo && memo.trim().length > 0) {
    params.set('addInfo', removeVietnameseTones(memo.trim()).slice(0, 50));
  }
  if (accountHolderName && accountHolderName.trim().length > 0) {
    params.set('accountName', removeVietnameseTones(accountHolderName.trim().toUpperCase()));
  }

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Chuyển đổi tiếng Việt có dấu sang không dấu cho nội dung chuyển tiền ngân hàng.
 */
export function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
