# Thiết Kế Cơ Sở Dữ Liệu Cloudflare D1 (SQLite)

Hệ thống sử dụng cơ sở dữ liệu quan hệ **Cloudflare D1 (SQLite)** được tối ưu hóa cho môi trường Serverless Edge, bảo đảm tính toàn vẹn dữ liệu tài chính (ACID transactions) và bảo toàn lịch sử giao dịch.

## 1. Nguyên Tắc Cốt Lõi Về Dữ Liệu Tài Chính
- **Đơn vị tiền tệ:** Toàn bộ số tiền được lưu bằng số nguyên (`INTEGER`) theo đơn vị đồng Việt Nam (VND). Tuyệt đối không dùng `FLOAT` hay `REAL` để tránh sai số dấu phẩy động.
- **Không xóa vật lý (Financial Invariance):** Các bản ghi tài chính đã xác nhận (`CONFIRMED`) không bị xóa vật lý khỏi cơ sở dữ liệu. Mọi thay đổi, điều chỉnh hoặc hủy hoạt động đều sinh ra bản ghi kiểm toán (`audit_logs`) và điều chỉnh công nợ (`debt_adjustments`).
- **Phân vùng dữ liệu:** Mọi bảng tài chính đều chứa `group_id` để kiểm tra phân quyền và phân vùng dữ liệu giữa các nhóm.

---

## 2. Danh Sách Các Bảng

### 2.1. `groups`
Lưu trữ thông tin cơ bản của nhóm:
- `id` (TEXT PRIMARY KEY): Định danh nội bộ (nanoid).
- `public_code` (TEXT UNIQUE NOT NULL): Mã công khai ngẫu nhiên (10 ký tự) dùng trong URL chia sẻ.
- `access_token` (TEXT NOT NULL): Token truy cập bí mật của nhóm.
- `name` (TEXT NOT NULL): Tên nhóm.
- `description` (TEXT): Mô tả nhóm.
- `currency` (TEXT DEFAULT 'VND'): Đơn vị tiền tệ.
- `created_at`, `updated_at` (TEXT): Thời gian ISO-8601.

### 2.2. `members`
Danh sách thành viên trong nhóm:
- `id` (TEXT PRIMARY KEY): Định danh thành viên.
- `group_id` (TEXT NOT NULL): Khóa ngoại tham chiếu `groups(id)`.
- `name` (TEXT NOT NULL): Tên thành viên.
- `avatar_url` (TEXT): Đường dẫn ảnh đại diện.
- `status` (TEXT DEFAULT 'ACTIVE'): 'ACTIVE' hoặc 'INACTIVE' (BR-03, BR-04).
- `created_at`, `updated_at` (TEXT).

### 2.3. `member_sessions`
Lưu phiên truy cập và thiết bị để phục vụ xác thực không cần mật khẩu:
- `id` (TEXT PRIMARY KEY).
- `group_id` (TEXT NOT NULL).
- `member_id` (TEXT NOT NULL).
- `token` (TEXT UNIQUE NOT NULL): Session token lưu tại client.
- `device_info` (TEXT): Thông tin thiết bị / User-Agent.
- `last_active_at`, `created_at` (TEXT).

### 2.4. `bank_accounts`
Thông tin tài khoản ngân hàng để tạo mã VietQR:
- `id` (TEXT PRIMARY KEY).
- `member_id` (TEXT UNIQUE NOT NULL REFERENCES `members(id)`).
- `bank_bin` (TEXT NOT NULL): Mã 6 chữ số BIN Napas (ví dụ: 970436 cho VCB).
- `bank_code` (TEXT NOT NULL): Tên viết tắt (ví dụ: VCB, MB, TCB).
- `bank_name` (TEXT NOT NULL): Tên ngân hàng.
- `account_number` (TEXT NOT NULL): Số tài khoản thụ hưởng.
- `account_holder` (TEXT NOT NULL): Tên chủ tài khoản (viết hoa không dấu).
- `is_qr_enabled` (INTEGER DEFAULT 1): Trạng thái bật/tắt nhận VietQR.

### 2.5. `activities` & `expenses`
Hoạt động và các khoản chi con:
- Một `activity` có thể có nhiều `expense`.
- Bảng `expense_payers`: Lưu ai đã bỏ ra bao nhiêu tiền cho khoản chi đó.
- Bảng `expense_splits`: Lưu ai chịu chi phí bao nhiêu tiền (chia đều hoặc nhập riêng).

### 2.6. `debt_obligations`
Bản ghi nợ gốc minh bạch:
- `source_type`: 'EXPENSE', 'INITIAL_DEBT', 'ADJUSTMENT'.
- `source_id`: ID của khoản chi hoặc khoản nợ ban đầu.
- `debtor_member_id`: Người nợ.
- `creditor_member_id`: Người cho nợ / được nhận.
- `original_amount`: Số tiền nợ ban đầu.
- `settled_amount`: Số tiền đã được thanh toán xác nhận (`CONFIRMED`).
- `status`: 'ACTIVE', 'FULLY_SETTLED', 'CANCELLED'.

### 2.7. `payments` & `payment_allocations`
Ghi nhận dòng tiền thanh toán:
- `payments.status`: 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'REVERSED'.
- `idempotency_key`: Mã chống gửi yêu cầu thanh toán trùng lặp.
- `payment_allocations`: Phân bổ khoản tiền trả vào các `debt_obligations` theo thứ tự FIFO.

### 2.8. `activity_revisions` & `debt_adjustments`
Kiểm toán thay đổi và điều chỉnh sau thanh toán:
- `before_state` và `after_state` lưu lại toàn bộ ảnh chụp dữ liệu JSON trước và sau khi sửa hoạt động.
- `debt_adjustments` lưu rõ lý do điều chỉnh tài chính.
