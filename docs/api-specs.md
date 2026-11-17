# Tài Liệu Đặc Tả API (TinhTien Backend)

Toàn bộ API được xây dựng trên nền tảng **Cloudflare Workers (Hono framework)**, trả về dữ liệu chuẩn JSON và có hỗ trợ phân quyền theo mã nhóm bí mật (`groupCode`).

## 1. Headers Sử Dụng Chung
- `Content-Type`: `application/json`
- `X-Group-Code`: Mã công khai của nhóm (hoặc truyền qua path params)
- `X-Member-Id`: ID của thành viên đang thực hiện thao tác

---

## 2. Nhóm Endpoint: Quản Lý Nhóm

### `POST /api/groups`
Tạo nhóm mới kèm danh sách thành viên ban đầu.
- **Request Body:**
  ```json
  {
    "name": "Du lịch Đà Lạt",
    "description": "Nhóm đi chơi hè 2026",
    "initialMembers": ["An", "Bình", "Cường", "Dũng"]
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "id": "group_xyz...",
      "publicCode": "dalat2026",
      "accessToken": "secret_token...",
      "name": "Du lịch Đà Lạt",
      "members": [...],
      "inviteUrl": "/group/dalat2026?token=secret_token..."
    }
  }
  ```

### `GET /api/groups/:groupCode`
Lấy thông tin nhóm, danh sách thành viên và cấu hình.

### `PATCH /api/groups/:groupCode`
Cập nhật tên hoặc mô tả của nhóm.

### `POST /api/groups/:groupCode/join`
Thành viên mở link chọn tên để thiết lập phiên làm việc (`member_session`).

---

## 3. Nhóm Endpoint: Thành Viên & Ngân Hàng

### `GET /api/groups/:groupCode/members`
Lấy danh sách tất cả thành viên kèm thông tin cấu hình tài khoản VietQR.

### `POST /api/groups/:groupCode/members`
Thêm thành viên mới vào nhóm.

### `PATCH /api/groups/:groupCode/members/:memberId`
Đổi tên thành viên hoặc đổi trạng thái ('ACTIVE' / 'INACTIVE').

### `POST /api/groups/:groupCode/members/:memberId/bank`
Lưu cấu hình tài khoản ngân hàng thụ hưởng (Napas BIN, STK, Tên chủ TK).

---

## 4. Nhóm Endpoint: Hoạt Động & Khoản Chi

### `GET /api/groups/:groupCode/activities`
Lấy danh sách các hoạt động chi tiêu trong nhóm.

### `GET /api/groups/:groupCode/activities/:id`
Lấy chi tiết 1 hoạt động (khoản chi, người trả, phân bổ, nghĩa vụ nợ, lịch sử sửa đổi).

### `POST /api/groups/:groupCode/activities`
Tạo hoạt động mới với nhiều khoản chi và nhiều người cùng thanh toán:
```json
{
  "title": "Ăn tối lẩu bò",
  "occurredAt": "2026-11-18T19:30:00.000Z",
  "expenses": [
    {
      "title": "Tiền lẩu và nước",
      "amount": 600000,
      "splitType": "EQUAL",
      "payers": [
        { "memberId": "m_1", "amountPaid": 400000 },
        { "memberId": "m_2", "amountPaid": 200000 }
      ],
      "participants": ["m_1", "m_2", "m_3", "m_4"]
    }
  ]
}
```

### `PATCH /api/groups/:groupCode/activities/:id`
Sửa hoạt động, ghi nhận lý do sửa vào `activity_revisions` và tính lại nợ.

### `POST /api/groups/:groupCode/activities/:id/cancel`
Hủy hoạt động, yêu cầu nhập lý do hủy.

---

## 5. Nhóm Endpoint: Công Nợ & Thanh Toán

### `GET /api/groups/:groupCode/debts`
Tra cứu công nợ hai chiều, số dư ròng và danh sách nghĩa vụ nợ gốc.

### `POST /api/groups/:groupCode/debts/initial`
Nhập công nợ cũ trước khi nhóm sử dụng ứng dụng (từng khoản hoặc hàng loạt).

### `GET /api/groups/:groupCode/payments`
Lấy danh sách toàn bộ các lần chuyển tiền và trạng thái.

### `POST /api/groups/:groupCode/payments`
Người trả báo đã chuyển tiền (`PENDING_CONFIRMATION`):
```json
{
  "payerMemberId": "m_3",
  "recipientMemberId": "m_1",
  "amount": 100000,
  "idempotencyKey": "pay_unique_123..."
}
```

### `POST /api/groups/:groupCode/payments/:id/confirm`
Người nhận xác nhận đã nhận được tiền (`CONFIRMED`). Làm giảm trừ công nợ thực tế.

### `POST /api/groups/:groupCode/payments/:id/reject`
Người nhận từ chối xác nhận (bắt buộc nhập lý do).

### `POST /api/groups/:groupCode/payments/:id/cancel`
Người trả hủy yêu cầu khi chưa được xác nhận.

---

## 6. Nhóm Endpoint: Dashboard, Lịch Sử & Xuất File

### `GET /api/groups/:groupCode/dashboard`
Trả về toàn bộ số liệu tổng hợp cho Dashboard cá nhân & toàn nhóm, kèm đề xuất tối ưu chuyển khoản.

### `GET /api/groups/:groupCode/history`
Tra cứu nhật ký thao tác và audit logs với các bộ lọc (`fromDate`, `toDate`, `memberId`, `q`).

### `GET /api/groups/:groupCode/export/data`
Lấy bộ dữ liệu đầy đủ của nhóm để xuất file Excel (.xlsx) hoặc in PDF.

### `GET /api/groups/:groupCode/ws`
Nâng cấp kết nối WebSocket tới Cloudflare Durable Objects (`GroupRoomDO`) để đồng bộ Realtime.
