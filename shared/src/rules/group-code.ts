/**
 * Mã tham gia nhóm dễ đọc: 8 ký tự in hoa, bỏ ký tự dễ nhầm (0 O 1 I L), hiển thị dạng "K7MQ-4XPZ".
 * 31^8 ≈ 852 tỷ khả năng -> khó đoán mò. Mã cũ (nanoid phân biệt hoa thường) vẫn được hỗ trợ.
 */
export const GROUP_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const GROUP_CODE_LENGTH = 8;

const NEW_CODE_RE = new RegExp(`^[${GROUP_CODE_ALPHABET}]{${GROUP_CODE_LENGTH}}$`);

export function isFriendlyGroupCode(code: string): boolean {
  return NEW_CODE_RE.test(code);
}

/** "K7MQ4XPZ" -> "K7MQ-4XPZ"; mã kiểu cũ giữ nguyên */
export function formatGroupCode(code: string | null | undefined): string {
  if (!code) return '';
  return isFriendlyGroupCode(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * Chuẩn hóa thứ người dùng dán/gõ: link đầy đủ, "k7mq-4xpz", "K7MQ 4XPZ"... -> mã dùng để tra cứu.
 * Với mã kiểu mới: bỏ dấu cách/gạch, in hoa. Mã kiểu cũ giữ nguyên (phân biệt hoa thường).
 */
export function normalizeGroupCodeInput(input: string): string {
  let raw = (input || '').trim();
  const fromPath = raw.match(/\/group\/([A-Za-z0-9_-]+)/);
  if (fromPath) raw = fromPath[1];
  else {
    const fromQuery = raw.match(/[?&]group=([A-Za-z0-9_-]+)/);
    if (fromQuery) raw = fromQuery[1];
  }
  const compact = raw.replace(/[\s-]/g, '').toUpperCase();
  return isFriendlyGroupCode(compact) ? compact : raw.replace(/\s/g, '');
}
