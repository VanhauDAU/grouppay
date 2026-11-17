# Quy Tắc Nghiệp Vụ & Thuật Toán Tài Chính

Tài liệu này chuẩn hóa 25 quy tắc nghiệp vụ (BR-01 đến BR-25) và các thuật toán toán học được cài đặt độc lập trong `@tinhtien/shared`.

## 1. Danh Sách Quy Tắc Nghiệp Vụ Cốt Lõi

| Mã | Quy tắc | Cài đặt trong hệ thống |
|---|---|---|
| **BR-01** | Mỗi thành viên có ID duy nhất trong nhóm | Sử dụng `nanoid` sinh khóa chính duy nhất. |
| **BR-02** | Đổi tên không thay đổi ID thành viên | API `PATCH /members/:id` chỉ cập nhật trường `name`. |
| **BR-03** | Thành viên ngừng hoạt động không bị xóa | Chuyển `status = 'INACTIVE'`, giữ nguyên nợ và lịch sử. |
| **BR-04** | Thành viên được kích hoạt lại | Cho phép cập nhật `status = 'ACTIVE'` bất kỳ lúc nào. |
| **BR-05** | Tất cả thành viên được thêm thành viên mới | Bất kỳ ai truy cập nhóm đều có quyền tạo thêm thành viên. |
| **BR-06** | Một hoạt động có thể có nhiều khoản chi | 1 `activity` liên kết 1-n với bảng `expenses`. |
| **BR-07** | Một khoản chi có thể có nhiều người thanh toán | Bảng `expense_payers` lưu chi tiết đóng góp của từng người. |
| **BR-08** | Phân bổ chi phí phải khớp tổng khoản chi | Bắt buộc kiểm tra `totalSplit === totalAmount`. |
| **BR-09** | Hỗ trợ chia đều và nhập số tiền riêng | `splitType = 'EQUAL'` hoặc `'EXACT'`. |
| **BR-10** | Không được thanh toán vượt công nợ còn lại | Báo lỗi nếu `paymentAmount > totalRemainingDebt`. |
| **BR-11** | Thanh toán chỉ hoàn tất khi người nhận xác nhận | Chỉ giao dịch `CONFIRMED` mới giảm `remainingAmount`. |
| **BR-12** | Người nhận từ chối phải ghi lý do | Yêu cầu trường `reason` tối thiểu 2 ký tự. |
| **BR-13** | Người trả được hủy yêu cầu khi chưa xác nhận | Chuyển trạng thái giao dịch sang `CANCELLED`. |
| **BR-14** | Giao dịch tài chính đã xác nhận không bị xóa vật lý | Bất biến (Immutable financial records). |
| **BR-15** | Số dư ròng chỉ là tổng hợp, không thay thế nợ gốc | Tính động từ `debt_obligations` và `payments`. |
| **BR-16** | Mọi điều chỉnh tài chính phải lưu lịch sử trước/sau | Bảng `activity_revisions` lưu `before_state` và `after_state`. |
| **BR-17** | Hủy hoạt động phải tạo nghiệp vụ điều chỉnh | Không xóa vật lý, lưu `debt_adjustments`. |
| **BR-18** | Chỉnh sửa hoạt động phải tính lại công nợ | Tính toán bù trừ chênh lệch nợ minh bạch. |
| **BR-19** | Kiểm tra tổng tiền phân bổ và thanh toán | Validate trên cả frontend và backend trước khi ghi DB. |
| **BR-20** | Phân bổ phần lẻ theo thứ tự cố định | Quy tắc chia tiền lẻ VND không chênh lệch 1 đồng. |
| **BR-21** | QR không được xem là bằng chứng tiền đã nhận | Quét VietQR chỉ tạo lệnh chuyển; bắt buộc xác nhận thủ công. |
| **BR-22** | Mọi thành viên được xem công nợ toàn nhóm | Minh bạch 100% trong không gian nhóm. |
| **BR-23** | Tất cả thành viên nhận thông báo theo sự kiện | Realtime WebSocket qua Durable Objects. |
| **BR-24** | Giao dịch phải có mã chống ghi nhận trùng | Bắt buộc `idempotency_key` cho thanh toán. |
| **BR-25** | Thao tác tài chính phải được xử lý nguyên tử | Sử dụng `db.batch()` của D1 để đảm bảo ACID. |

---

## 2. Giải Thuật Chia Tiền Lẻ (Deterministic Remainder Distribution - BR-20)
Khi chia đều $T$ đồng cho $N$ người:
1. Số tiền cơ sở mỗi người chịu:
   $$B = \lfloor T / N \rfloor$$
2. Phần dư lẻ còn lại:
   $$R = T \pmod N \quad (0 \le R < N)$$
3. $R$ thành viên đầu tiên theo thứ tự chỉ mục cố định (`orderIndex`) nhận thêm $1$ đồng:
   $$\text{Tiền chịu}_i = \begin{cases} B + 1 & \text{với } 0 \le i < R \\ B & \text{với } R \le i < N \end{cases}$$
4. Tổng số tiền chịu của tất cả thành viên:
   $$\sum_{i=0}^{N-1} \text{Tiền chịu}_i = R \times (B + 1) + (N - R) \times B = N \times B + R = T$$
   $\Rightarrow$ Chính xác tuyệt đối từng đồng VND.

---

## 3. Thuật Toán Tối Ưu Thanh Toán (Settlement Optimization - BR-5.2)
Mục tiêu: Đề xuất phương án giảm tối đa số lần chuyển tiền trong nhóm mà **bảo toàn 100% số dư ròng** của mỗi cá nhân.
1. Tính số dư ròng $Net_i$ của mỗi thành viên $i$.
2. Tách thành hai tập:
   - Tập Con Nợ $D = \{i \mid Net_i < 0\}$ với số tiền nợ $|Net_i|$.
   - Tập Chủ Nợ $C = \{j \mid Net_j > 0\}$ với số tiền cần nhận $Net_j$.
3. Sắp xếp $D$ và $C$ giảm dần theo số tiền.
4. Lấy con nợ lớn nhất $d$ và chủ nợ lớn nhất $c$:
   $$X = \min(\text{Nợ của } d, \text{Cần nhận của } c)$$
   - Đề xuất: $d$ chuyển khoản $X$ cho $c$.
   - Trừ $X$ khỏi nợ của $d$ và trừ $X$ khỏi số cần nhận của $c$.
   - Nếu số dư của ai về 0 thì loại người đó khỏi tập.
5. Lặp lại bước 4 cho đến khi cả hai tập đều rỗng.

---

## 4. Chuẩn Mã Hóa VietQR Napas EMVCo
Chuỗi mã QR được tạo theo chuẩn EMVCo Payment QR Code:
- Tag `00`: `01` (Phiên bản định dạng)
- Tag `01`: `12` (Dynamic QR - có chứa số tiền)
- Tag `38`: Thông tin ngân hàng thụ hưởng
  - Subtag `00`: `A000000727` (Napas GUID)
  - Subtag `01`: `00` + BIN ngân hàng (6 số) + `01` + Số tài khoản
  - Subtag `02`: `QRIBFTTA` (Mã dịch vụ Napas 24/7)
- Tag `53`: `704` (Đơn vị tiền tệ Việt Nam Đồng)
- Tag `54`: Số tiền chuyển khoản (nguyên số)
- Tag `58`: `VN` (Quốc gia Việt Nam)
- Tag `62`: Tag bổ sung `08` chứa nội dung chuyển tiền (đã chuẩn hóa không dấu)
- Tag `63`: Mã kiểm tra `CRC16-CCITT` (4 ký tự Hex)
