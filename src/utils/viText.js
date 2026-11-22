// Việt hoá chữ do backend trả về (thông báo, lỗi). Backend có thể gửi tiếng Anh hoặc mã trạng thái (IN_PROGRESS...),
// app luôn hiển thị tiếng Việt: dịch theo loại thông báo / mã lỗi, rồi theo cụm từ; còn sót tiếng Anh thì dùng câu mặc định.

const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

// Mã trạng thái đơn của backend -> nhãn tiếng Việt (khớp luồng app).
export const REQUEST_STATUS_VI = {
  RECEIVED: 'Đã đặt lịch',
  ASSIGNED: 'Thợ đã nhận đơn',
  IN_PROGRESS: 'Đang thực hiện',
  DIAGNOSED_PENDING_QUOTATION: 'Chờ duyệt báo giá',
  READY_FOR_REPAIR: 'Đang thực hiện',
  PENDING_PAYMENT: 'Chờ thanh toán',
  PARTIALLY_PAID_RECEIVABLE: 'Chờ thanh toán',
  PENDING_REVIEW: 'Chờ thanh toán',
  READY_FOR_ACCEPTANCE: 'Hoàn thành',
  COMPLETED: 'Hoàn thành',
  WARRANTY_PENDING: 'Chờ thẩm định bảo hành',
  UNDER_WARRANTY: 'Đang bảo hành',
  OUT_OF_WARRANTY: 'Ngoài bảo hành',
  CANCELLED: 'Đã huỷ',
  CANCELLED_BY_CUSTOMER: 'Khách đã huỷ',
  CANCELLED_BY_ADMIN: 'Văn phòng đã huỷ',
  CANCELLED_BY_TECHNICIAN: 'Thợ đã huỷ',
  // Trạng thái khác hay gặp
  UNPAID: 'Chưa thanh toán',
  PENDING: 'Đang chờ',
  PARTIALLY_PAID: 'Đã trả một phần',
  PAID: 'Đã thanh toán',
  NOTHING_TO_PAY: 'Không cần thanh toán',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
  SENT: 'Đã gửi',
  REVISION_REQUESTED: 'Yêu cầu báo giá lại',
  ACTIVE: 'Đang hoạt động',
  ENDED: 'Đã kết thúc',
  BANK_TRANSFER: 'Chuyển khoản',
  CASH: 'Tiền mặt',
};

// Loại thông báo backend -> tiêu đề / nội dung mặc định.
const NOTIF_TYPE_VI = {
  REQUEST_CREATED: { title: 'Đặt lịch thành công', body: 'Đơn {code} đã được tạo, hệ thống đang điều phối thợ.' },
  REQUEST_ASSIGNED: { title: 'Thợ đã nhận đơn', body: 'Đơn {code} đã có thợ nhận.' },
  JOB_ASSIGNED: { title: 'Bạn có việc mới', body: 'Đơn {code} vừa được giao cho bạn.' },
  NEW_JOB: { title: 'Có việc mới', body: 'Đơn {code} đang chờ thợ tiếp nhận.' },
  OPEN_REQUEST: { title: 'Có việc mới', body: 'Đơn {code} đang chờ thợ tiếp nhận.' },
  TECHNICIAN_ON_THE_WAY: { title: 'Thợ đang đến', body: 'Thợ đang di chuyển tới địa chỉ của bạn (đơn {code}).' },
  TECHNICIAN_ARRIVED: { title: 'Thợ đã đến', body: 'Thợ đã có mặt tại địa chỉ của bạn (đơn {code}).' },
  QUOTATION_SENT: { title: 'Có báo giá mới', body: 'Thợ đã gửi báo giá cho đơn {code}, vui lòng xem và duyệt.' },
  QUOTATION_APPROVED: { title: 'Khách đã duyệt báo giá', body: 'Báo giá đơn {code} đã được khách đồng ý.' },
  QUOTATION_REJECTED: { title: 'Khách từ chối báo giá', body: 'Báo giá đơn {code} đã bị khách từ chối.' },
  QUOTATION_REVISION_REQUESTED: { title: 'Khách yêu cầu báo giá lại', body: 'Vui lòng gửi lại báo giá cho đơn {code}.' },
  HANDOVER_CONFIRMED: { title: 'Văn phòng đã xác nhận nộp tiền mặt', body: 'Đợt bàn giao tiền mặt của bạn đã được đối soát.' },
  HANDOVER_REJECTED: { title: 'Đợt nộp tiền mặt bị từ chối', body: 'Kiểm tra lý do từ chối và nộp lại khoản tiền mặt.' },
  JOB_COMPLETED: { title: 'Thợ đã hoàn thành', body: 'Đơn {code} đã xong, vui lòng kiểm tra số tiền và thanh toán.' },
  PAYMENT_REQUIRED: { title: 'Chờ thanh toán', body: 'Vui lòng thanh toán đơn {code}.' },
  PAYMENT_RECEIVED: { title: 'Đã nhận thanh toán', body: 'Thanh toán cho đơn {code} đã được ghi nhận.' },
  PAYMENT_SUCCESS: { title: 'Thanh toán thành công', body: 'Đơn {code} đã được thanh toán.' },
  REQUEST_COMPLETED: { title: 'Đơn đã hoàn thành', body: 'Đơn {code} đã hoàn tất. Cảm ơn bạn!' },
  REQUEST_CANCELLED: { title: 'Đơn đã huỷ', body: 'Đơn {code} đã bị huỷ.' },
  REQUEST_STATUS_CHANGED: { title: 'Cập nhật đơn hàng', body: 'Đơn {code} có cập nhật mới.' },
  STATUS_CHANGED: { title: 'Cập nhật đơn hàng', body: 'Đơn {code} có cập nhật mới.' },
  WARRANTY_REQUESTED: { title: 'Yêu cầu bảo hành', body: 'Đã ghi nhận yêu cầu bảo hành đơn {code}.' },
  WARRANTY_APPROVED: { title: 'Bảo hành được duyệt', body: 'Yêu cầu bảo hành đơn {code} đã được duyệt.' },
  WARRANTY_REJECTED: { title: 'Bảo hành bị từ chối', body: 'Yêu cầu bảo hành đơn {code} không được chấp nhận.' },
  REVIEW_RECEIVED: { title: 'Có đánh giá mới', body: 'Khách đã đánh giá đơn {code}.' },
  VOUCHER_RECEIVED: { title: 'Bạn nhận được voucher', body: 'Một mã giảm giá mới đã được thêm vào ví của bạn.' },
  POINTS_EARNED: { title: 'Cộng điểm thưởng', body: 'Bạn vừa được cộng điểm thưởng.' },
  ACCOUNT_LOCKED: { title: 'Tài khoản bị khoá', body: 'Tài khoản của bạn đang bị tạm khoá.' },
  SYSTEM: { title: 'Thông báo hệ thống', body: '' },
};

// Mã lỗi backend hay gặp -> câu tiếng Việt.
const ERROR_CODE_VI = {
  ERROR: 'Có lỗi xảy ra. Vui lòng thử lại.',
  VALIDATION_ERROR: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
  BAD_REQUEST: 'Yêu cầu không hợp lệ.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  INVALID_TOKEN: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy dữ liệu.',
  CONFLICT: 'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.',
  TOO_MANY_REQUESTS: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  INTERNAL_ERROR: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
  INTERNAL_SERVER_ERROR: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
  SERVICE_UNAVAILABLE: 'Máy chủ tạm thời không phản hồi. Vui lòng thử lại sau.',
  INVALID_CREDENTIALS: 'Số điện thoại hoặc mật khẩu không đúng.',
  WRONG_PASSWORD: 'Mật khẩu không đúng.',
  USER_NOT_FOUND: 'Tài khoản không tồn tại.',
  ACCOUNT_NOT_FOUND: 'Tài khoản không tồn tại.',
  ACCOUNT_LOCKED: 'Tài khoản đang bị khoá.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị vô hiệu hoá.',
  PHONE_EXISTS: 'Số điện thoại đã được đăng ký.',
  PHONE_ALREADY_EXISTS: 'Số điện thoại đã được đăng ký.',
  EMAIL_EXISTS: 'Email đã được sử dụng.',
  INVALID_OTP: 'Mã OTP không đúng.',
  OTP_EXPIRED: 'Mã OTP đã hết hạn.',
  OTP_INVALID: 'Mã OTP không đúng.',
  REQUEST_NOT_FOUND: 'Không tìm thấy đơn hàng.',
  JOB_NOT_FOUND: 'Không tìm thấy công việc.',
  REQUEST_NOT_AVAILABLE: 'Việc đã có thợ khác nhận hoặc không còn chờ nhận.',
  REQUEST_CLOSED: 'Đơn đã đóng.',
  INVALID_REQUEST_STATE: 'Đơn không còn ở trạng thái phù hợp cho thao tác này.',
  INVALID_STATUS: 'Trạng thái đơn không phù hợp cho thao tác này.',
  INVALID_STATE: 'Trạng thái đơn không phù hợp cho thao tác này.',
  JOB_NOT_ACTIVE: 'Việc không còn được giao cho bạn.',
  QUOTATION_NOT_FOUND: 'Không tìm thấy báo giá.',
  QUOTATION_PENDING: 'Đang có báo giá chờ khách duyệt.',
  QUOTATION_ALREADY_APPROVED: 'Báo giá đã được duyệt.',
  PAYMENT_IN_PROGRESS: 'Đang có giao dịch chuyển khoản chờ xác nhận.',
  ALREADY_PAID: 'Đơn đã được thanh toán.',
  VOUCHER_EXPIRED: 'Mã giảm giá đã hết hạn.',
  VOUCHER_NOT_FOUND: 'Mã giảm giá không tồn tại.',
  VOUCHER_INVALID: 'Mã giảm giá không hợp lệ.',
  VOUCHER_USED: 'Mã giảm giá đã được sử dụng.',
  INSUFFICIENT_POINTS: 'Bạn không đủ điểm để đổi.',
  WARRANTY_EXPIRED: 'Đơn đã hết thời hạn bảo hành.',
  REVIEW_ALREADY_EXISTS: 'Bạn đã đánh giá đơn này.',
  FILE_TOO_LARGE: 'Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn.',
  INVALID_FILE_TYPE: 'Định dạng tệp không được hỗ trợ.',
  SLOT_UNAVAILABLE: 'Khung giờ này đã kín. Vui lòng chọn khung giờ khác.',
  TECHNICIAN_LOCKED: 'Tài khoản thợ đang bị tạm khoá.',
  TIMEOUT: 'Kết nối máy chủ quá hạn. Vui lòng thử lại.',
  NETWORK_ERROR: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
};

// Tên trường hay gặp trong lỗi kiểm tra dữ liệu.
const FIELD_VI = {
  phone: 'Số điện thoại', password: 'Mật khẩu', full_name: 'Họ tên', name: 'Tên', email: 'Email',
  otp: 'Mã OTP', address: 'Địa chỉ', address_text: 'Địa chỉ', contact_name: 'Tên liên hệ', contact_phone: 'SĐT liên hệ',
  preferred_time: 'Thời gian hẹn', problem_description: 'Mô tả sự cố', quantity: 'Số lượng', reason: 'Lý do',
  rating: 'Số sao', review_text: 'Nội dung đánh giá', code: 'Mã', amount: 'Số tiền', items: 'Hạng mục', file: 'Tệp',
};

// Cụm từ tiếng Anh -> tiếng Việt (áp dụng lần lượt, không phân biệt hoa thường).
const PHRASES = [
  [/your (service )?request\s+([A-Z]{2,5}[-\d]+)?\s*has been created/i, 'Đơn $2 đã được tạo'],
  [/request\s+([A-Z]{2,5}[-\d]+)\s+status (changed|updated) to\s+([A-Z_]+)/i, (m, c, _x, st) => `Đơn ${c} chuyển sang: ${REQUEST_STATUS_VI[st] || 'trạng thái mới'}`],
  [/status (changed|updated) to\s+([A-Z_]+)/i, (m, _x, st) => `Trạng thái chuyển sang: ${REQUEST_STATUS_VI[st] || 'trạng thái mới'}`],
  [/new job( available)?/i, 'Có việc mới'],
  [/new (service )?request/i, 'Có đơn mới'],
  [/new quotation|quotation (has been )?sent|quote sent/i, 'Có báo giá mới'],
  [/quotation (has been )?approved/i, 'Báo giá đã được duyệt'],
  [/quotation (has been )?rejected/i, 'Báo giá bị từ chối'],
  [/revision requested/i, 'Yêu cầu báo giá lại'],
  [/technician (is )?on the way/i, 'Thợ đang đến'],
  [/technician (has )?arrived/i, 'Thợ đã đến'],
  [/technician assigned|assigned to (a )?technician/i, 'Đã có thợ nhận đơn'],
  [/job assigned( to you)?/i, 'Bạn được giao việc mới'],
  [/job completed|work completed/i, 'Thợ đã hoàn thành công việc'],
  [/payment (has been )?received/i, 'Đã nhận thanh toán'],
  [/payment (was )?successful|payment success/i, 'Thanh toán thành công'],
  [/payment (is )?required|awaiting payment|pending payment/i, 'Chờ thanh toán'],
  [/request (has been )?completed|order completed/i, 'Đơn đã hoàn thành'],
  [/request (has been )?cancel+ed|order cancel+ed/i, 'Đơn đã huỷ'],
  [/warranty request/i, 'Yêu cầu bảo hành'],
  [/new review|review received/i, 'Có đánh giá mới'],
  [/voucher received|you (have )?received a voucher/i, 'Bạn nhận được voucher'],
  [/points? earned/i, 'Được cộng điểm thưởng'],
  [/invalid credentials|incorrect (phone|password)/i, 'Số điện thoại hoặc mật khẩu không đúng'],
  [/unauthori[sz]ed/i, 'Phiên đăng nhập đã hết hạn'],
  [/forbidden|permission denied|access denied/i, 'Bạn không có quyền thực hiện thao tác này'],
  [/not found/i, 'Không tìm thấy dữ liệu'],
  [/internal server error/i, 'Máy chủ đang gặp sự cố'],
  [/too many requests/i, 'Bạn thao tác quá nhanh, vui lòng thử lại sau'],
  [/validation (failed|error)/i, 'Thông tin chưa hợp lệ'],
  [/is required/i, 'là bắt buộc'],
  [/must be a valid/i, 'không hợp lệ'],
  [/is invalid|invalid/i, 'không hợp lệ'],
  [/already exists/i, 'đã tồn tại'],
  [/success(fully)?|^ok$/i, 'Thành công'],
];

const isVietnamese = (s) => VI_CHARS.test(String(s || ''));
// Còn chữ tiếng Anh (có ít nhất 2 từ Latin không dấu, không phải mã đơn / mã trạng thái).
const looksEnglish = (s) => {
  const t = String(s || '').replace(/\b[A-Z]{2,5}[-\d]{3,}\b/g, '').replace(/\b[A-Z_]{3,}\b/g, '');
  if (isVietnamese(t)) return false;
  return (t.match(/[a-z]{2,}/gi) || []).length >= 2;
};

const replaceStatusCodes = (s) => String(s || '').replace(/\b[A-Z][A-Z_]{3,}\b/g, (m) => REQUEST_STATUS_VI[m] || m);

const applyPhrases = (s) => PHRASES.reduce((acc, [re, rep]) => acc.replace(re, rep), String(s || '')).replace(/\s{2,}/g, ' ').trim();

const extractCode = (...texts) => {
  for (const t of texts) {
    const m = String(t || '').match(/\b[A-Z]{2,5}[-]?\d[\w-]{3,}\b/);
    if (m) return m[0];
  }
  return '';
};

const fill = (tpl, code) => String(tpl || '').replace(/\{code\}/g, code || '').replace(/\s{2,}/g, ' ').replace(/Đơn\s+đã/g, 'Đơn đã').trim();

/** Việt hoá một chuỗi bất kỳ từ server; trả fallback nếu vẫn còn tiếng Anh. */
export const toVietnamese = (text, fallback = '') => {
  if (text == null || text === '') return fallback || '';
  const raw = String(text);
  if (isVietnamese(raw) && !/\b[A-Z][A-Z_]{3,}\b/.test(raw)) return raw;
  const out = replaceStatusCodes(applyPhrases(raw));
  if (!looksEnglish(out)) return out;
  return fallback || out;
};

/** Việt hoá thông báo backend { type, title, body, request_code }. */
export const viNotification = (n = {}) => {
  const type = String(n.type || n.notification_type || '').toUpperCase();
  const code = n.request_code || extractCode(n.title, n.body);
  const preset = NOTIF_TYPE_VI[type];
  const titleFallback = preset ? fill(preset.title, code) : 'Thông báo mới';
  const bodyFallback = preset ? fill(preset.body, code) : (code ? `Đơn ${code} có cập nhật mới.` : 'Bạn có thông báo mới, mở ứng dụng để xem chi tiết.');
  return {
    title: toVietnamese(n.title, titleFallback) || titleFallback,
    body: toVietnamese(n.body, bodyFallback),
  };
};

/** Việt hoá lỗi / thông điệp server. code: mã lỗi backend (nếu có). */
export const viServerMessage = (message, code, status) => {
  const byCode = code ? ERROR_CODE_VI[String(code).toUpperCase()] : null;
  const fallback = byCode
    || (status === 401 ? ERROR_CODE_VI.UNAUTHORIZED
      : status === 403 ? ERROR_CODE_VI.FORBIDDEN
        : status === 404 ? ERROR_CODE_VI.NOT_FOUND
          : status === 409 ? ERROR_CODE_VI.CONFLICT
            : status === 413 ? ERROR_CODE_VI.FILE_TOO_LARGE
              : status === 429 ? ERROR_CODE_VI.TOO_MANY_REQUESTS
                : status >= 500 ? ERROR_CODE_VI.INTERNAL_ERROR
                  : ERROR_CODE_VI.ERROR);
  if (!message) return fallback;
  if (isVietnamese(message)) return String(message);
  if (byCode) return byCode; // có mã lỗi đã biết: dùng câu chuẩn thay vì dịch từng cụm
  const out = toVietnamese(message, '');
  return out && !looksEnglish(out) ? out : fallback;
};

/** Việt hoá một dòng lỗi theo trường ({ field, message }). */
export const viFieldError = (e = {}) => {
  const field = FIELD_VI[e.field] || e.field || '';
  const rawMsg = e.field ? String(e.message || '').replace(new RegExp(`^["']?${String(e.field).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*`, 'i'), '') : e.message;
  const msg = isVietnamese(rawMsg) ? rawMsg : toVietnamese(rawMsg, 'không hợp lệ');
  return field ? `${field}: ${msg}` : msg;
};
