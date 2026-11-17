# Tính Tiền & Công Nợ Nhóm (GroupPay)

> **Website Quản lý Chi tiêu và Công nợ Nhóm** — Giải pháp hiện đại, tinh gọn, tối ưu cho điện thoại di động (mobile-first), không cần tạo tài khoản mật khẩu, chia sẻ link tức thì, tạo mã VietQR chuyển khoản tự động và đồng bộ Realtime đa thiết bị.

---

## 🌟 Điểm Nổi Bật

1. **Không bắt buộc đăng nhập:** Người tạo nhóm nhận mã truy cập bảo mật và link chia sẻ. Thành viên mở link, chọn tên của mình từ danh sách là có thể thao tác ngay.
2. **Nghiệp vụ tài chính chuẩn xác 100%:**
   - Số tiền nguyên đơn vị Đồng (`INTEGER` VND), không phát sinh sai số thập phân.
   - Phân bổ chi phí nhiều người trả, chia đều hoặc nhập số tiền riêng.
   - **Quy tắc chia tiền lẻ cố định (BR-20):** Ví dụ 100.000đ chia 3 người $\to$ 33.334đ, 33.333đ, 33.333đ (tổng khớp tuyệt đối 100.000đ).
3. **Theo dõi công nợ hai chiều & Số dư ròng:** Giữ nguyên các khoản nợ gốc, hiển thị số dư ròng đối chiếu để người dùng luôn biết rõ mình nợ ai và ai nợ mình.
4. **Tích hợp VietQR Napas 24/7:** Tự động sinh mã VietQR theo chuẩn EMVCo offline, chứa sẵn số tài khoản, số tiền và nội dung chuyển khoản.
5. **Xác nhận thanh toán 2 bước:** Người trả báo chuyển tiền (`PENDING`) $\to$ Người nhận kiểm tra tài khoản và xác nhận (`CONFIRMED`) mới giảm nợ thực tế. Người nhận có quyền từ chối kèm lý do (`REJECTED`).
6. **Đề xuất tối ưu chuyển khoản:** Thuật toán tự động tìm phương án giảm thiểu số lần chuyển tiền trong nhóm (ví dụ thu gọn 10 giao dịch nợ chéo thành 3 giao dịch thẳng).
7. **Bảo toàn lịch sử & Audit trail:** Mọi chỉnh sửa hoặc hủy hoạt động đều sinh bản ghi lịch sử trước/sau (`activity_revisions`) và điều chỉnh công nợ (`debt_adjustments`). Không xóa vật lý dữ liệu tài chính.
8. **Đồng bộ gần Realtime:** Sử dụng Cloudflare Durable Objects + WebSocket với chế độ Hibernation tiết kiệm chi phí.
9. **Xuất báo cáo:** Hỗ trợ xuất dữ liệu ra file Excel (`.xlsx`) đầy đủ các sheet và in ấn bản PDF.

---

## 🏗️ Cấu Trúc Mã Nguồn

```
tinhtien/
├── frontend/                        # Ứng dụng Giao diện Người dùng (React + Vite + Tailwind + Lucide)
├── backend/                         # Dịch vụ API Backend (Cloudflare Workers + Hono + D1 + Durable Objects)
├── shared/                          # Thư viện dùng chung (Types, Zod Schemas, Business Rules & VietQR)
├── docs/                            # Tài liệu nghiệp vụ & kỹ thuật
│   ├── database-schema.md
│   ├── business-rules.md
│   └── api-specs.md
├── package.json
└── pnpm-workspace.yaml
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Cục Bộ

### Yêu Cầu Hệ Thống
- Node.js >= 20
- pnpm >= 9

### 1. Cài đặt Dependencies
```bash
pnpm install
```

### 2. Chạy Kiểm Thử Quy Tắc Tài Chính
```bash
pnpm test
```
Toàn bộ 12 ca kiểm thử trọng yếu (chia tiền lẻ, nhiều người trả, chống vượt nợ, VietQR, tối ưu thanh toán) sẽ được thực thi qua Vitest.

### 3. Build Toàn Bộ Dự Án
```bash
pnpm build
```

### 4. Chạy Môi Trường Phát Triển Cục Bộ
- **Chạy Backend API (Cloudflare Workers):**
  ```bash
  cd backend
  pnpm dev
  ```
- **Chạy Frontend (React Vite):**
  ```bash
  cd frontend
  pnpm dev
  ```
Mở trình duyệt tại `http://localhost:3000` để bắt đầu trải nghiệm ứng dụng.

---

## 📄 Bản Quyền & Giấy Phép
Dự án được phát triển nhằm phục vụ nhu cầu quản lý chi tiêu nhóm minh bạch, tiện lợi và chính xác.
