/** Danh sách nhóm đã tham gia trên thiết bị này (lưu cục bộ, không tốn request) */
export interface RecentGroup {
  id?: string;
  publicCode: string;
  name: string;
  memberName?: string | null;
  memberCount?: number;
  lastVisited: string;
}

const KEY = 'tinhtien_recent_groups';
const MAX = 20;

export function getRecentGroups(): RecentGroup[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((g) => g && g.publicCode) : [];
  } catch {
    return [];
  }
}

export function upsertRecentGroup(group: Omit<RecentGroup, 'lastVisited'>) {
  try {
    const rest = getRecentGroups().filter((g) => g.publicCode !== group.publicCode);
    const prev = getRecentGroups().find((g) => g.publicCode === group.publicCode);
    const next: RecentGroup = { ...prev, ...group, lastVisited: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify([next, ...rest].slice(0, MAX)));
  } catch {
    // ignore
  }
}

export function removeRecentGroup(publicCode: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(getRecentGroups().filter((g) => g.publicCode !== publicCode)));
  } catch {
    // ignore
  }
}

/** "Tôi là ai" được nhớ RIÊNG cho từng nhóm (trước đây dùng chung -> đổi nhóm bị hỏi lại tên) */
export function getSavedMember(groupCode: string | null) {
  if (!groupCode) return null;
  try {
    const saved = localStorage.getItem(`tinhtien_member_${groupCode}`) || localStorage.getItem('tinhtien_current_member');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function saveMember(groupCode: string, member: unknown) {
  try {
    localStorage.setItem(`tinhtien_member_${groupCode}`, JSON.stringify(member));
    localStorage.setItem('tinhtien_current_member', JSON.stringify(member));
  } catch {
    // ignore
  }
}

// ---------- Mã chủ nhóm (chỉ có trên thiết bị đã tạo nhóm) ----------

export function saveOwnerToken(publicCode: string, token: string) {
  try {
    localStorage.setItem(`tinhtien_owner_${publicCode}`, token);
  } catch {
    // ignore
  }
}

export function getOwnerToken(publicCode: string | null): string | null {
  if (!publicCode) return null;
  try {
    return localStorage.getItem(`tinhtien_owner_${publicCode}`);
  } catch {
    return null;
  }
}

/** Dọn mọi dữ liệu cục bộ của 1 nhóm (khi nhóm bị xóa) */
export function forgetGroup(publicCode: string) {
  removeRecentGroup(publicCode);
  try {
    localStorage.removeItem(`tinhtien_owner_${publicCode}`);
    localStorage.removeItem(`tinhtien_member_${publicCode}`);
    localStorage.removeItem(`tinhtien_push_${publicCode}`);
  } catch {
    // ignore
  }
}
