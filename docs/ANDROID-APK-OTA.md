# Hướng dẫn phát hành app Thợ Minh Đức (Android)

Tài liệu này mô tả cách nhóm cập nhật app Android, khi nào cần build APK mới và BE liên quan thế nào.

## Mô hình hiện tại

- App được viết bằng Expo/React Native. APK Android được build và lưu trên Expo EAS.
- APK nội bộ dùng profile `preview`, channel `preview`; EAS tự tăng `android.versionCode` mỗi lần build.
- `runtimeVersion` dùng chính sách `fingerprint`. Một bản OTA chỉ được cài trên APK có runtime tương thích.
- App gọi API production tại `https://server.hrmss.cyou/api/v1`.
- GitHub Actions workflow [.github/workflows/publish-preview-ota.yml](../.github/workflows/publish-preview-ota.yml) xuất bản OTA lên Android channel `preview` khi có commit vào `main` thay đổi `App.js`, `src/**`, `assets/**`, `package.json` hoặc `package-lock.json`. Workflow cũng có thể chạy thủ công trong tab **Actions**.

## Cập nhật giao diện / JavaScript

1. Tạo nhánh làm việc, sửa code trong `App.js`, `src/` hoặc asset cần thiết.
2. Chạy app kiểm tra cục bộ nếu có môi trường phù hợp; không đưa `node_modules`, `.env` hoặc token vào Git.
3. Mở Pull Request để review, rồi merge vào `main`.
4. GitHub Actions tự chạy **Publish Android preview OTA**. Theo dõi trạng thái tại tab **Actions**; cần thấy dấu xanh thành công.
5. Điện thoại đã cài APK có channel `preview` sẽ tải bản tương thích từ Expo khi mở app/khi khởi động lại app. Không cần deploy FE lên VPS cho cập nhật OTA.

OTA cập nhật nội dung JavaScript và asset được đóng gói. Nó không tạo APK mới, không thay file APK đã tải, và không thay đổi mã native đã cài trên điện thoại.

## Khi nào phải build APK mới

Cần build và cài APK mới khi thay đổi có ảnh hưởng native, ví dụ:

- Thêm, gỡ hoặc đổi phiên bản thư viện có mã native.
- Thay quyền Android, `app.json`, plugin Expo, cấu hình package/bundle hoặc cấu hình native khác.
- OTA không tương thích với `runtimeVersion` của APK đang cài.

Trong thư mục gốc của repo, chạy:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Đợi build ở [Expo EAS Builds](https://expo.dev/accounts/nhattq23/projects/tho-minh-duc-app/builds) có trạng thái **Succeeded**, mở build mới nhất và bấm **Download**. Chuyển APK sang điện thoại Android để cài. Cài APK mới có thể yêu cầu cho phép cài ứng dụng từ nguồn này; giữ cùng package ID và ký bằng cùng keystore để cập nhật app hiện có.

Build trước đó không tự biến thành APK mới. Chỉ gửi link/artifact của build mới đã **Succeeded** cho người cài.

## Cập nhật BE

Thay đổi backend phải được triển khai riêng lên VPS. OTA của app không deploy BE, và build APK không thay code trên server. Quy trình BE nhóm đang dùng:

```bash
cd /opt/hrmss/server
git pull origin main
docker compose up -d --build
docker builder prune -f
docker image prune -f
```

Không chạy quy trình BE khi chỉ sửa giao diện/app. App tiếp tục gọi API tại `https://server.hrmss.cyou/api/v1`.

## Phụ thuộc Expo bị lệch phiên bản

Nếu Expo Doctor báo package không khớp SDK, trong repo chạy:

```powershell
npx expo install --fix
npx expo install --check
```

Commit cả `package.json` và `package-lock.json`. Nếu dependency có thành phần native, build APK mới trước khi mong đợi app nhận OTA tương ứng.

## Bí mật và truy cập

- GitHub Actions dùng repository secret tên `EXPO_TOKEN`; không ghi giá trị token vào file, commit, issue hoặc chat nhóm.
- Không đưa khóa EAS/keystore, mật khẩu, `.env` hay dữ liệu thật của khách hàng vào repo.
- Chỉ tài khoản được cấp quyền trong GitHub/Expo mới có thể merge, xuất bản OTA hoặc build app.

## iOS

Workflow tự động hiện tại chỉ xuất bản OTA cho Android. APK không cài được trên iPhone. Muốn phát hành app iOS native phải cấu hình build iOS và chữ ký Apple riêng; thay đổi JavaScript OTA trên iOS cũng cần một bản iOS đã cài có EAS Update và runtime/channel phù hợp.
