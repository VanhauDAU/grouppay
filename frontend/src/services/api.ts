const API_BASE = '/api';

interface RequestOptions extends RequestInit {
  groupCode?: string;
  memberId?: string;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<{ success: boolean; data?: T; error?: string; message?: string }> {
  const { groupCode, memberId, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>)
  };

  if (groupCode) {
    headers['X-Group-Code'] = groupCode;
  }
  if (memberId) {
    headers['X-Member-Id'] = memberId;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers,
      ...rest
    });

    const json = await res.json();
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Mất kết nối máy chủ'
    };
  }
}

export const api = {
  // Groups
  createGroup: (data: { name: string; description?: string; initialMembers: string[] }) =>
    apiRequest('/groups', { method: 'POST', body: JSON.stringify(data) }),

  getGroup: (groupCode: string) =>
    apiRequest(`/groups/${groupCode}`, { groupCode }),

  joinGroup: (groupCode: string, memberId: string, deviceInfo?: string) =>
    apiRequest(`/groups/${groupCode}/join`, {
      method: 'POST',
      groupCode,
      body: JSON.stringify({ memberId, deviceInfo })
    }),

  updateGroupSettings: (groupCode: string, settings: any) =>
    apiRequest(`/groups/${groupCode}/settings`, {
      method: 'PATCH',
      groupCode,
      body: JSON.stringify(settings)
    }),

  // Members
  getMembers: (groupCode: string) =>
    apiRequest(`/groups/${groupCode}/members`, { groupCode }),

  addMember: (groupCode: string, name: string) =>
    apiRequest(`/groups/${groupCode}/members`, {
      method: 'POST',
      groupCode,
      body: JSON.stringify({ name })
    }),

  updateMember: (groupCode: string, memberId: string, data: { name?: string; status?: string }) =>
    apiRequest(`/groups/${groupCode}/members/${memberId}`, {
      method: 'PATCH',
      groupCode,
      body: JSON.stringify(data)
    }),

  saveMemberBank: (groupCode: string, memberId: string, bankData: any) =>
    apiRequest(`/groups/${groupCode}/members/${memberId}/bank`, {
      method: 'POST',
      groupCode,
      body: JSON.stringify(bankData)
    }),

  // Activities & Expenses
  getActivities: (groupCode: string) =>
    apiRequest(`/groups/${groupCode}/activities`, { groupCode }),

  getActivityDetail: (groupCode: string, activityId: string) =>
    apiRequest(`/groups/${groupCode}/activities/${activityId}`, { groupCode }),

  createActivity: (groupCode: string, memberId: string, data: any) =>
    apiRequest(`/groups/${groupCode}/activities`, {
      method: 'POST',
      groupCode,
      memberId,
      body: JSON.stringify(data)
    }),

  updateActivity: (groupCode: string, memberId: string, activityId: string, data: any) =>
    apiRequest(`/groups/${groupCode}/activities/${activityId}`, {
      method: 'PATCH',
      groupCode,
      memberId,
      body: JSON.stringify(data)
    }),

  cancelActivity: (groupCode: string, memberId: string, activityId: string, reason: string) =>
    apiRequest(`/groups/${groupCode}/activities/${activityId}/cancel`, {
      method: 'POST',
      groupCode,
      memberId,
      body: JSON.stringify({ reason })
    }),

  // Debts
  getDebts: (groupCode: string) =>
    apiRequest(`/groups/${groupCode}/debts`, { groupCode }),

  importInitialDebts: (groupCode: string, memberId: string, debts: any[]) =>
    apiRequest(`/groups/${groupCode}/debts/initial`, {
      method: 'POST',
      groupCode,
      memberId,
      body: JSON.stringify({ debts })
    }),

  // Payments
  getPayments: (groupCode: string) =>
    apiRequest(`/groups/${groupCode}/payments`, { groupCode }),

  createPayment: (groupCode: string, memberId: string, data: any) =>
    apiRequest(`/groups/${groupCode}/payments`, {
      method: 'POST',
      groupCode,
      memberId,
      body: JSON.stringify(data)
    }),

  confirmPayment: (groupCode: string, memberId: string, paymentId: string) =>
    apiRequest(`/groups/${groupCode}/payments/${paymentId}/confirm`, {
      method: 'POST',
      groupCode,
      memberId
    }),

  rejectPayment: (groupCode: string, memberId: string, paymentId: string, reason: string) =>
    apiRequest(`/groups/${groupCode}/payments/${paymentId}/reject`, {
      method: 'POST',
      groupCode,
      memberId,
      body: JSON.stringify({ reason })
    }),

  cancelPayment: (groupCode: string, memberId: string, paymentId: string) =>
    apiRequest(`/groups/${groupCode}/payments/${paymentId}/cancel`, {
      method: 'POST',
      groupCode,
      memberId
    }),

  // Dashboard
  getDashboard: (groupCode: string, memberId?: string) =>
    apiRequest(`/groups/${groupCode}/dashboard`, { groupCode, memberId }),

  // History
  getHistory: (groupCode: string, query?: Record<string, string>) => {
    const qStr = query ? '?' + new URLSearchParams(query).toString() : '';
    return apiRequest(`/groups/${groupCode}/history${qStr}`, { groupCode });
  },

  // Notifications
  getNotifications: (groupCode: string, memberId?: string) =>
    apiRequest(`/groups/${groupCode}/notifications`, { groupCode, memberId }),

  markAllNotificationsRead: (groupCode: string, memberId?: string) =>
    apiRequest(`/groups/${groupCode}/notifications/read-all`, {
      method: 'POST',
      groupCode,
      memberId
    }),

  // Export
  getExportData: (groupCode: string) =>
    apiRequest(`/groups/${groupCode}/export/data`, { groupCode })
};
