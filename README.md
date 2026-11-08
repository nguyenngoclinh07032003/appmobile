# App đặt thợ tại nhà (React Native / Expo)

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
| Khách hàng | `khachhang` | `123456` | `http://localhost:8081/?role=customer` |
| Thợ | `thohrmss` | `123456` | `http://localhost:8081/?role=tech` |

Mở **2 tab** để chạy song song Khách + Thợ. Phiên đăng nhập lưu theo tab (`sessionStorage`), đơn hàng dùng chung (`localStorage`) nên cập nhật hai bên.

## Cấu trúc chuẩn React Native
Dự án được tổ chức theo chuẩn kiến trúc module hóa của React Native:

```
src/
├── components/          # Reusable UI components
│   ├── common/          # Các UI component dùng chung (Button, Card, Input, Sheet, Dialog, Toast...)
│   └── order/           # Live tracking & chat card (TrackingCard, ChatCard)
├── constants/           # Dữ liệu tĩnh, cấu hình & chính sách nghiệp vụ
│   ├── config.js        # Cấu hình API và kết nối Backend HRMSS
│   ├── data.js          # Danh mục dịch vụ, giá, voucher, FAQ, linh kiện
│   └── techPolicy.js    # Chính sách, điểm thưởng/phạt kỹ thuật viên
├── context/             # State Management (React Context)
│   └── AppContext.js    # Quản lý toàn bộ state toàn cục, giỏ hàng, đơn hàng, auth, thông báo
├── navigation/          # Quản lý điều hướng & khung ứng dụng
│   ├── AppNavigator.js  # Điều hướng stack/tab, Shell, khung điện thoại desktop
│   ├── BottomNav.js     # Thanh điều hướng dưới đáy (Bottom navigation bar)
│   └── routes.js        # Định nghĩa danh sách routes & tabs (Khách + Thợ)
├── screens/             # Màn hình ứng dụng (phân chia theo domain / chức năng)
│   ├── auth/            # Màn hình Đăng nhập / Đăng ký
│   ├── home/            # Trang chủ Khách hàng
│   ├── booking/         # Luồng đặt lịch (Chi tiết, Giỏ hàng, Thanh toán, Địa chỉ)
│   ├── customer/        # Các tab chính (Dịch vụ, Thiết bị, Hoạt động, Cá nhân)
│   ├── tech/            # App Thợ (Công việc, Lịch làm việc, Thông báo, Chi tiết việc)
│   └── misc/            # Các màn hình phụ (Tìm kiếm, Đánh giá, Điểm thưởng, QR...)
├── services/            # Giao tiếp API & đồng bộ dữ liệu
│   ├── api.js           # Client gọi API Backend
│   ├── authService.js   # Quản lý tài khoản, token & session
│   └── syncService.js   # Đồng bộ dữ liệu 2 chiều Khách ↔ Thợ ↔ Backend
├── theme/               # Bảng màu, typography, shadow, gradient
│   ├── colors.js        # Màu sắc chủ đạo & màu theo danh mục
│   └── theme.js         # Tokens, radii, shadows, gradients
└── utils/               # Tiện ích bổ trợ
    ├── geo.js           # Định vị GPS, tính khoảng cách, tiến trình thợ di chuyển
    └── media.js         # Xử lý chọn ảnh & camera
```

*(Lưu ý: Các đường dẫn cũ ở thư mục gốc `src/*.js` và `src/screens/*.js` vẫn được giữ dưới dạng re-export tương thích 100%, không làm gián đoạn code hay thay đổi bất kỳ giao diện nào).*

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

## Demo bảo vệ (Khách + Thợ)
1. Mở 2 tab: `?role=customer` và `?role=tech`, đăng nhập tài khoản demo ở bảng trên.
2. **Cá nhân** (khách) hoặc **Tài khoản** (thợ) → **Nạp kịch bản demo bảo vệ** (hoặc nút trên Trang chủ lần đầu).
3. Có 4 đơn mẫu:
   - `DMXDEMO1` — việc mới (thợ nhận)
   - `DMXDEMO2` — đang đến + **theo dõi GPS mô phỏng** + chat
   - `DMXDEMO3` — chờ khách **duyệt báo giá**
   - `DMXDEMO4` — hoàn thành + **QR thanh toán demo** / biên lai
4. Chat và vị trí thợ đồng bộ qua `localStorage` giữa hai tab.

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
