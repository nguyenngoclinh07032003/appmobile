# Thợ ĐMX — App đặt thợ tại nhà (React Native / Expo)

Bản thiết kế lại: giao diện mới, các chức năng liên kết với nhau, dữ liệu được lưu lại khi tải lại trang (web).

## Chạy
```bash
npm install
npx expo start        # bấm w để mở trên web, hoặc quét QR bằng Expo Go
```

## Đăng nhập / Phân quyền
App yêu cầu đăng nhập. Vai trò gắn với tài khoản, không chuyển chéo trong cùng phiên.

| Vai trò | Tài khoản demo | Mật khẩu | Link gợi ý |
|---|---|---|---|
| Khách hàng | `0901234567` | `123456` | `http://localhost:8081/?role=customer` |
| Thợ | `0987654321` | `123456` | `http://localhost:8081/?role=tech` |

Mở **2 tab** để chạy song song Khách + Thợ. Phiên đăng nhập lưu theo tab (`sessionStorage`), đơn hàng dùng chung (`localStorage`) nên cập nhật hai bên.

## Cấu trúc
| File | Nội dung |
|---|---|
| `App.js` | Khung app: thanh tab dưới, điều hướng dạng stack, khung điện thoại khi xem trên web desktop |
| `src/theme.js` | Màu sắc, bo góc, đổ bóng, màu theo danh mục và trạng thái đơn |
| `src/store.js` | **Trạng thái dùng chung + nghiệp vụ** (giỏ hàng, đơn, thiết bị, địa chỉ, điểm, voucher, thông báo…), điều hướng, toast/hộp thoại, lưu `localStorage` |
| `src/ui.js` | Component dùng chung: Button, Card, Sheet, Dialog, ServiceCard, Stepper… |
| `src/data.js` | Dữ liệu dịch vụ, giá, quy trình, FAQ, hạng thành viên, voucher đổi điểm |
| `src/screens/Home.js` | Trang chủ |
| `src/screens/Tabs.js` | Dịch vụ (kèm Bảo hành), Thiết bị, Hoạt động, Cá nhân |
| `src/screens/Booking.js` | Chi tiết dịch vụ, Giỏ hàng, Xác nhận đặt lịch, Đặt thành công, Sổ địa chỉ |
| `src/screens/Misc.js` | Tìm kiếm, Thông báo, Chi tiết đơn, Đánh giá, Quyền lợi, Yêu thích, Hồ sơ, Trợ giúp, Điều khoản, Mã QR, Thêm thiết bị |
| `src/screens/Tech.js` | **App Thợ (Technician)**: Công việc, Lịch làm việc, Thông báo, Tài khoản, Chi tiết công việc |

## App Thợ (Technician) — theo sơ đồ ngữ cảnh HRMSS
Mở: đăng nhập tài khoản Thợ (`0987654321 / 123456`) tại `?role=tech`. Khi đăng nhập, hệ thống tự thêm vài việc demo nếu chưa có đơn chờ. Hai app dùng chung dữ liệu đơn hàng nên cập nhật cho nhau.

| Luồng trong sơ đồ | Màn hình |
|---|---|
| Hệ thống → Thợ: *Assigned job information* | Công việc › Việc mới (Nhận việc / Từ chối kèm lý do) |
| *Service location & customer contact* | Chi tiết công việc: gọi khách, mở Google Maps chỉ đường |
| *Work schedule information* | Tab Lịch: 7 ngày tới, xếp theo khung giờ |
| *Quotation information* | Báo giá: dịch vụ đã đặt + vật tư/linh kiện; có phát sinh → khách phải duyệt |
| *Notification information* | Tab Thông báo: việc mới, khách duyệt/từ chối báo giá, huỷ đơn, đánh giá |
| Thợ → Hệ thống: *Diagnosis information* | Chẩn đoán (chọn nhanh + mô tả) khi check-in tại nhà khách |
| *Repair progress information* | Cập nhật tiến độ 25/50/75/100% kèm ghi chú |
| *Material usage information* | Ghi nhận vật tư đã dùng (đối soát kho) |
| *Repair evidence* | Ảnh trước/sau khi làm (web: chọn ảnh từ máy, nén và lưu cục bộ) |
| *Job completion report* | Biên bản hoàn thành → khách nhận thông báo, được cộng điểm, đánh giá |

Trạng thái đơn: `pending` (chờ thợ nhận) → `confirmed` → `onway` → `diagnosing` → `quoted` (chờ khách duyệt, chỉ khi có phát sinh) → `repairing` → `done` / `cancelled`.

> Chưa có backend: dữ liệu lưu trong `localStorage` của trình duyệt. Ảnh minh chứng chưa tải lên Cloudinary, email chưa gửi thật.

## Các chức năng liên kết với nhau
- **Thiết bị ↔ Dịch vụ ↔ Đơn hàng**: thêm thiết bị kèm lần bảo dưỡng gần nhất → app tính hạn bảo dưỡng, nhắc ở Trang chủ và hiện badge ở tab Thiết bị. "Đặt bảo dưỡng" mở đúng danh mục. Khi đơn cùng loại **hoàn thành**, lịch bảo dưỡng của thiết bị tự cập nhật.
- **Đặt lịch**: Chi tiết / Giỏ hàng → Xác nhận (chưa có địa chỉ thì thêm ngay, lưu xong quay lại đúng màn thanh toán) → Đặt thành công → Theo dõi đơn.
- **Theo dõi đơn**: dòng thời gian 6 bước, cập nhật trực tiếp từ app Thợ (nhận việc → đang đến → kiểm tra & báo giá → thực hiện → hoàn thành). Khách duyệt/từ chối báo giá, Huỷ đơn (chọn lý do), Đặt lại, Đánh giá.
- **Điểm & voucher**: hoàn thành đơn được cộng điểm (10.000đ = 1 điểm), đánh giá +20 điểm → lên hạng (Thành viên / Bạc / Vàng / Kim cương) → đổi điểm lấy voucher → dùng ở bước thanh toán (huỷ đơn thì hoàn voucher).
- **Bảo hành 60 ngày**: tra cứu theo SĐT/mã đơn, tự liệt kê đơn còn hạn, gửi yêu cầu bảo hành tạo đơn bảo hành liên kết với đơn gốc.
- **Thông báo**: tự sinh khi đặt đơn, đổi trạng thái, đổi điểm, thêm thiết bị; bấm vào để mở đúng màn hình.
- **Hồ sơ ↔ Địa chỉ**: tên/SĐT tự điền từ địa chỉ đầu tiên; nhiều địa chỉ, chọn mặc định.
- **Tìm kiếm** không dấu (gõ "may giat" vẫn ra "Máy giặt"), lưu lịch sử tìm kiếm. **Yêu thích** (♡) ở mọi thẻ dịch vụ.
- Toàn bộ `Alert` cũ (không hoạt động trên web) được thay bằng hộp thoại/toast trong app.

## Ghi chú
- Giá ở tab Lắp đặt / Sửa chữa / Trọn đời là giá tham khảo (demo).
- Ảnh dịch vụ dùng emoji trên nền màu theo danh mục; có thể thay bằng ảnh thật trong `Media` (`src/ui.js`).
- "Thoát tài khoản" xoá toàn bộ dữ liệu demo đã lưu.
