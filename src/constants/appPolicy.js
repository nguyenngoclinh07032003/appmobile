// Hằng số chính sách dùng chung cho toàn app (một nguồn duy nhất, tránh ghi cứng lệch nhau giữa các màn hình).
// Số ngày bảo hành thực tế theo hạng thành viên lấy từ TIERS[].warrantyDays (data.js, cập nhật theo /config/public).

export const APP_VERSION = '3.0.8';

// Mật khẩu tối thiểu (đăng ký, đặt lại, đổi mật khẩu).
export const PASSWORD_MIN_LENGTH = 8;

// Thời gian hiệu lực mã OTP email (phút) — dùng cho mọi thông báo hiển thị.
export const OTP_TTL_MINUTES = 10;

// Bảo hành cơ bản (hạng Thành viên). Hạng cao hơn được bảo hành dài hơn (xem TIERS).
export const BASE_WARRANTY_DAYS = 60;

// Huỷ miễn phí: đơn còn chờ nhận / đã nhận và còn trước giờ hẹn tối thiểu N phút (khớp techPolicy.assessCustomerCancel).
export const FREE_CANCEL_MIN_BEFORE = 60;
