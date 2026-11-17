// Hằng số chính sách dùng chung cho toàn app (một nguồn duy nhất, tránh ghi cứng lệch nhau giữa các màn hình).
// Số ngày bảo hành thực tế theo hạng thành viên lấy từ TIERS[].warrantyDays (data.js, cập nhật theo /config/public).

export const APP_VERSION = '3.0.8';

// Mật khẩu tối thiểu (đăng ký, đặt lại, đổi mật khẩu).
export const PASSWORD_MIN_LENGTH = 8;

// Thời gian hiệu lực mã OTP email (phút) — dùng cho mọi thông báo hiển thị.
export const OTP_TTL_MINUTES = 10;

// Bảo hành cơ bản (hạng Thành viên). Hạng cao hơn được bảo hành dài hơn (xem TIERS).
export const BASE_WARRANTY_DAYS = 60;

// Giờ ngắt nhận lịch trong ngày cuối cùng của bảo hành (18h00 - ca làm việc cuối của thợ bắt đầu từ 18h00).
export const WARRANTY_FINAL_DAY_CUTOFF_HOUR = 18;

// Các mốc ngày cảnh báo chủ động trước khi hết hạn bảo hành (D-7, D-3, D-1).
export const WARRANTY_ALERT_MILESTONES = [7, 3, 1];

// Thời gian tối thiểu thợ chuẩn bị và di chuyển (phút).
export const WARRANTY_MIN_LEAD_MINUTES = 30;

// Huỷ miễn phí: đơn còn chờ nhận / đã nhận và còn trước giờ hẹn tối thiểu N phút (khớp techPolicy.assessCustomerCancel).
export const FREE_CANCEL_MIN_BEFORE = 60;
