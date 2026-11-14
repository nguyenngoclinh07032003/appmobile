# Thợ Minh Đức — App đặt thợ tại nhà (React Native / Expo)

**Thợ Minh Đức** là ứng dụng di động/web (Expo, chạy Android · iOS · Web) của hệ thống **HRMSS**
(CTY CP CÔNG NGHỆ & DỊCH VỤ HRMSS). Một app phục vụ hai vai trò: **Khách hàng** (đặt lịch, duyệt báo giá,
thanh toán, đánh giá, bảo hành) và **Kỹ thuật viên/Thợ** (nhận việc, check-in, chẩn đoán, báo giá, cập nhật tiến độ,
hoàn thành, thu tiền).

App **đã kết nối backend thật (HRMSS API)** — mặc định `https://server.hrmss.cyou/api/v1`. Đơn hàng, tài khoản,
thanh toán, hoá đơn… đều đọc/ghi qua API. Bộ nhớ cục bộ (localStorage/sessionStorage trên web, SecureStore trên điện thoại)
chỉ dùng để giữ phiên đăng nhập/token và cache hiển thị, không còn là nơi lưu dữ liệu nghiệp vụ.

Phiên bản: **3.0.8** (`app.json` · `package.json` · `src/constants/appPolicy.js`).

---

## 1. Chạy ở máy phát triển

```bash
npm install
# (tuỳ chọn) trỏ tới backend khác server thật:
cp .env.example .env.local     # rồi sửa EXPO_PUBLIC_API_URL trong .env.local
npx expo start -c              # -c xoá cache để nhận biến môi trường mới; bấm w để mở web, hoặc quét QR bằng Expo Go
```

`.env.local` (không đưa lên git):

```env
# Bỏ trống / không đặt -> server thật https://server.hrmss.cyou/api/v1
EXPO_PUBLIC_API_URL=http://localhost:5000/api/v1
# Điện thoại thật cùng mạng LAN: dùng IP máy chạy backend, ví dụ http://192.168.1.10:5000/api/v1
```

> Khi chạy `expo start` mà không đặt `EXPO_PUBLIC_API_URL`, app gọi **server thật** và in cảnh báo trên console
> (xem `src/constants/config.js`). Hãy dùng backend trên máy khi thử nghiệm để không ghi dữ liệu thử lên server thật.

Đăng nhập bằng tài khoản đã đăng ký trên hệ thống HRMSS (đăng ký Khách ngay trong app; tài khoản Thợ do văn phòng cấp).
Vai trò gắn với tài khoản, không chuyển chéo trong cùng phiên. Trên web, mỗi tab một phiên (`sessionStorage`) nên có thể
mở song song một tab Khách và một tab Thợ.

## 2. Build bản Web bằng Docker (VPS)

```bash
cp .env.vps.example .env       # sửa INFRA_NETWORK, EXPO_PUBLIC_API_URL (để trống = server thật)
docker network ls              # network của Caddy (external) PHẢI tồn tại trước; nếu chưa: docker network create web
docker compose up -d --build
```

- `Dockerfile`: stage 1 `node:22-alpine` chạy `npx expo export --platform web` → stage 2 `nginx:1.27-alpine` phục vụ file tĩnh.
- `nginx.conf`: cache dài cho `/_expo/` (file có hash), SPA fallback về `index.html`, security headers
  (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`).
- `docker-compose.yml`: không publish port; Caddy gọi `http://hrmss-app:80` qua network chung; `mem_limit: 256m`.
- File APK: chép vào `./downloads/` trên VPS → tải tại `https://<domain>/download/<ten-file>.apk`
  (chỉ phục vụ file trực tiếp, không liệt kê thư mục; không cần build lại).
- Đổi `EXPO_PUBLIC_API_URL` thì phải build lại (biến được nhúng vào bundle lúc build).

Build web không dùng Docker: `npm run build:web` (kết quả ở `dist/`).

## 3. Build APK Android (EAS)

```bash
npm install -g eas-cli
eas login
npm run build:apk              # = eas build -p android --profile preview  (APK cài trực tiếp)
eas build -p android --profile production   # AAB cho Google Play, versionCode tự tăng (autoIncrement)
```

- URL backend của bản build nằm trong `eas.json` → `build.<profile>.env.EXPO_PUBLIC_API_URL`
  (mặc định `https://server.hrmss.cyou/api/v1`). Muốn build trỏ tới server khác: sửa giá trị này ở profile tương ứng
  (hoặc khai báo biến môi trường trên EAS) rồi build lại.
- `appVersionSource: local`: `version` (3.0.8) và `android.versionCode` lấy từ `app.json`; profile `production`
  có `autoIncrement: true` nên EAS tự tăng `versionCode` trong `app.json` mỗi lần build.
- Quyền: camera/thư viện ảnh (ảnh thiết bị, minh chứng, biên lai) và **vị trí khi đang dùng app**
  (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` — check-in tại nhà khách, chia sẻ vị trí khi thợ đang di chuyển).
  App **không** xin vị trí nền.

## 4. Cấu trúc thư mục

```
src/
├── components/
│   ├── common/          # UI dùng chung (Button, Card, Input, Sheet, Dialog, Toast, AppIcon, PseudoQR...)
│   └── order/           # OrderLive (theo dõi thợ, chat), VietQRPay (thanh toán VietQR)
├── constants/
│   ├── appPolicy.js     # Hằng số chính sách: phiên bản, mật khẩu, OTP, bảo hành, huỷ miễn phí
│   ├── config.js        # Cấu hình API backend HRMSS (EXPO_PUBLIC_API_URL)
│   ├── data.js          # Danh mục dịch vụ, giá, hạng thành viên (TIERS), trạng thái đơn, FAQ
│   └── techPolicy.js    # Chính sách thợ: thưởng/phạt, huỷ đơn
├── context/AppContext.js  # State toàn cục: auth, đơn hàng, thông báo, giỏ hàng
├── navigation/          # AppNavigator, BottomNav, routes (Khách + Thợ)
├── screens/
│   ├── auth/            # Đăng nhập / Đăng ký / OTP / Trang khách vãng lai
│   ├── home/            # Trang chủ Khách
│   ├── booking/         # Chi tiết dịch vụ, Giỏ hàng, Xác nhận đặt lịch, Địa chỉ
│   ├── customer/        # Dịch vụ, Thiết bị, Hoạt động, Cá nhân
│   ├── tech/            # App Thợ: Công việc, Lịch, Thông báo, Chi tiết việc
│   └── misc/            # Tìm kiếm, Đánh giá, Điểm thưởng, Bảo hành...
├── services/            # api.js (client HRMSS API), authService.js (phiên), syncService.js (map dữ liệu server ↔ app)
├── theme/               # Màu, typography, shadow
└── utils/               # geo (GPS, khoảng cách), media (ảnh), validators, techProfile, authErrorMessages
```

## 5. Trạng thái đơn

```
pending → confirmed → onway → diagnosing → quoted → repairing
        → pending_payment / partially_paid → pending_review → done
```

| Trạng thái | Ý nghĩa |
|---|---|
| `pending` | Đã đặt lịch, chờ điều phối/thợ nhận |
| `confirmed` | Thợ đã nhận đơn |
| `onway` | Thợ đang di chuyển tới |
| `diagnosing` | Đã check-in, đang kiểm tra/chẩn đoán |
| `quoted` | Đã báo giá, chờ khách duyệt (khi có phát sinh) |
| `repairing` | Đang thực hiện |
| `pending_payment` / `partially_paid` | Đã hoàn thành, chờ thanh toán / mới trả một phần |
| `pending_review` | Đã thanh toán, chờ văn phòng nghiệm thu |
| `done` | Hoàn tất |
| `warranty_pending` | Yêu cầu bảo hành đang chờ xử lý |
| `out_of_warranty` | Ngoài thời hạn bảo hành |
| `cancelled` | Đã huỷ |

## 6. Chính sách thống nhất (nguồn: `src/constants/appPolicy.js`, `src/constants/data.js`)

- **Mật khẩu** tối thiểu **8 ký tự** (đăng ký, đặt lại, đổi mật khẩu).
- **OTP email** hiệu lực **10 phút**.
- **Bảo hành theo hạng thành viên**: Thành viên **60 ngày** · Bạc **75 ngày** · Vàng **90 ngày** · Kim cương **120 ngày**
  (tối thiểu 60 ngày). Điểm: 10.000đ thanh toán = 1 điểm, đánh giá đơn +20 điểm.
- **Huỷ miễn phí** khi đơn đang *chờ nhận* hoặc *đã nhận* **và** còn ≥ **60 phút** trước giờ hẹn.
- **Thanh toán**: tiền mặt hoặc **VietQR** — mã QR do backend tạo (ảnh `img.vietqr.io`, đúng số tiền còn lại và nội dung
  chuyển khoản), tiền về được **SePay webhook** báo cho backend; app kiểm tra hoá đơn mỗi 5 giây và tự chuyển trạng thái khi
  đã đủ tiền.

## 7. Cập nhật dữ liệu (realtime)

Hiện tại app **chưa dùng WebSocket**; dữ liệu được làm mới bằng:

- Đồng bộ ngay sau mỗi thao tác (đặt đơn, nhận việc, báo giá, duyệt, thanh toán...).
- Đồng bộ lại khi app quay lại foreground.
- Polling định kỳ **30 giây** cho danh sách/chi tiết đơn.
- Vị trí thợ khi đang di chuyển: **15 giây**/lần.
- Hoá đơn khi đang ở màn thanh toán VietQR: **5 giây**/lần.

WebSocket (Socket.IO) và push notification là **hướng phát triển** — xem `DANH_GIA_REALTIME_WEBSOCKET.md`.

## 8. Tài liệu liên quan

| File | Nội dung |
|---|---|
| `PHAN_TICH_API_LUONG_DICH_VU.md` | Phân tích API theo luồng dịch vụ |
| `HUONG_DAN_BACKEND_DIEU_PHOI_THO.md` · `TECH_DISPATCHING_SPECIFICATION.md` | Thuật toán điều phối thợ |
| `QUY_TRINH_BAO_GIA_VA_DONG_TIEN.md` | Báo giá, thanh toán, chia tiền |
| `DANH_GIA_REALTIME_WEBSOCKET.md` | Đánh giá phương án realtime |
| `BAO_CAO_THUYET_TRINH_DO_AN.md` | Nội dung thuyết trình đồ án |
