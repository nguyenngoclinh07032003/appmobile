// Việt hoá chữ do backend trả về (thông báo, lỗi). Backend có thể gửi tiếng Anh hoặc mã trạng thái (IN_PROGRESS...),
// app luôn hiển thị tiếng Việt: dịch theo loại thông báo / mã lỗi, rồi theo cụm từ; còn sót tiếng Anh thì dùng câu mặc định.

const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

// Mã trạng thái đơn của backend -> nhãn tiếng Việt (khớp luồng ứng dụng).
export const REQUEST_STATUS_VI = {
  RECEIVED: 'Đã đặt lịch',
  ACCEPTED: 'Đã tiếp nhận',
  CONFIRMED: 'Đã xác nhận',
  ASSIGNED: 'Thợ đã nhận đơn',
  IN_PROGRESS: 'Đang thực hiện',
  DIAGNOSED_PENDING_QUOTATION: 'Chờ duyệt báo giá',
  READY_FOR_REPAIR: 'Đang thực hiện',
  PENDING_PAYMENT: 'Chờ thanh toán',
  PARTIALLY_PAID_RECEIVABLE: 'Chờ thanh toán',
  PENDING_REVIEW: 'Chờ thanh toán',
  READY_FOR_ACCEPTANCE: 'Hoàn thành',
  COMPLETED: 'Hoàn thành',
  DONE: 'Hoàn thành',
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
  SUBMITTED: 'Chờ duyệt',
  EXPIRED: 'Đã hết hạn',
  SUPERSEDED: 'Đã thay thế',
  SKIPPED: 'Đã bỏ qua',
  AVAILABLE: 'Khả dụng',
  UNAVAILABLE: 'Không khả dụng',
  WAITING_CUSTOMER: 'Chờ khách hàng',
  PENDING_APPROVAL: 'Chờ duyệt',
  PENDING_ACK: 'Chờ xác nhận',
  PARTIALLY_PAID: 'Đã trả một phần',
  PAID: 'Đã thanh toán',
  NOTHING_TO_PAY: 'Không cần thanh toán',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
  SENT: 'Đã gửi',
  REVISION_REQUESTED: 'Yêu cầu báo giá lại',
  INITIAL: 'Ban đầu',
  SUPPLEMENTAL: 'Bổ sung',
  REVISE: 'Yêu cầu chỉnh sửa',
  WARRANTY: 'Bảo hành',
  NORMAL: 'Thường',
  SERVICE: 'Dịch vụ',
  MATERIAL: 'Vật tư',
  PROBLEM_PHOTO: 'Ảnh sự cố',
  BEFORE_REPAIR: 'Ảnh trước sửa',
  AFTER_REPAIR: 'Ảnh sau sửa',
  DOCUMENT: 'Chứng từ',
  ACTIVE: 'Đang hoạt động',
  ENDED: 'Đã kết thúc',
  BANK_TRANSFER: 'Chuyển khoản',
  VIETQR: 'Chuyển khoản VietQR',
  VNPAY: 'Chuyển khoản VNPAY',
  CASH: 'Tiền mặt',
};

// Loại thông báo backend -> tiêu đề / nội dung mặc định.
const NOTIF_TYPE_VI = {
  REQUEST_CREATED: { title: 'Đặt lịch thành công', body: 'Đơn {code} đã được tạo, hệ thống đang điều phối thợ.' },
  REQUEST_ASSIGNED: { title: 'Thợ đã nhận đơn', body: 'Đơn {code} đã có thợ nhận.' },
  JOB_ASSIGNED: { title: 'Bạn có việc mới', body: 'Đơn {code} vừa được giao cho bạn.' },
  JOB_REASSIGNED: { title: 'Điều phối thợ mới', body: 'Đơn {code} đã được điều phối sang kỹ thuật viên khác.' },
  JOB_EXPIRED: { title: 'Quá hạn tiếp nhận', body: 'Đơn {code} đã quá thời gian chờ tiếp nhận.' },
  OFFER_EXPIRED: { title: 'Quá hạn tiếp nhận', body: 'Lời mời nhận đơn {code} đã hết hạn.' },
  NEW_JOB: { title: 'Có việc mới', body: 'Đơn {code} đang chờ thợ tiếp nhận.' },
  OPEN_REQUEST: { title: 'Có việc mới', body: 'Đơn {code} đang chờ thợ tiếp nhận.' },
  TECHNICIAN_ON_THE_WAY: { title: 'Thợ đang đến', body: 'Thợ đang di chuyển tới địa chỉ của bạn (đơn {code}).' },
  TECHNICIAN_ARRIVED: { title: 'Thợ đã đến', body: 'Thợ đã có mặt tại địa chỉ của bạn (đơn {code}).' },
  QUOTATION_SENT: { title: 'Có báo giá mới', body: 'Thợ đã gửi báo giá cho đơn {code}, vui lòng xem và duyệt.' },
  QUOTATION_APPROVED: { title: 'Khách đã duyệt báo giá', body: 'Báo giá đơn {code} đã được khách đồng ý.' },
  QUOTATION_REJECTED: { title: 'Khách từ chối báo giá', body: 'Báo giá đơn {code} đã bị khách từ chối.' },
  QUOTATION_REVISION_REQUESTED: { title: 'Khách yêu cầu báo giá lại', body: 'Vui lòng gửi lại báo giá cho đơn {code}.' },
  QUOTATION_EXPIRED: { title: 'Báo giá đã hết hạn', body: 'Báo giá cho đơn {code} đã hết hiệu lực.' },
  QUOTATION_CANCELLED: { title: 'Báo giá đã huỷ', body: 'Báo giá cho đơn {code} đã bị huỷ.' },
  EXTERNAL_PRICE_SENT: { title: 'Có hoá đơn chi phí cuối', body: 'Thợ đã cập nhật chi phí vật tư cuối cho đơn {code}, vui lòng kiểm tra và xác nhận.' },
  EXTERNAL_PRICE_APPROVED: { title: 'Khách đã xác nhận hoá đơn', body: 'Khách hàng đã đồng ý tổng hoá đơn đơn {code}.' },
  EXTERNAL_PRICE_REJECTED: { title: 'Yêu cầu chỉnh lại hoá đơn', body: 'Khách yêu cầu kiểm tra lại giá vật tư cuối cho đơn {code}.' },
  HANDOVER_CONFIRMED: { title: 'Văn phòng đã xác nhận nộp tiền mặt', body: 'Đợt bàn giao tiền mặt của bạn đã được đối soát.' },
  HANDOVER_REJECTED: { title: 'Đợt nộp tiền mặt bị từ chối', body: 'Kiểm tra lý do từ chối và nộp lại khoản tiền mặt.' },
  JOB_COMPLETED: { title: 'Thợ đã hoàn thành', body: 'Đơn {code} đã xong, vui lòng kiểm tra số tiền và thanh toán.' },
  PAYMENT_REQUIRED: { title: 'Chờ thanh toán', body: 'Vui lòng thanh toán đơn {code}.' },
  PAYMENT_RECEIVED: { title: 'Đã nhận thanh toán', body: 'Thanh toán cho đơn {code} đã được ghi nhận.' },
  PAYMENT_CONFIRMED: { title: 'Thanh toán đã được xác nhận', body: 'Thanh toán cho đơn {code} đã được xác nhận.' },
  PAYMENT_SUCCESS: { title: 'Thanh toán thành công', body: 'Đơn {code} đã được thanh toán.' },
  PAYMENT_FAILED: { title: 'Thanh toán chưa thành công', body: 'Giao dịch thanh toán cho đơn {code} chưa hoàn tất, vui lòng thử lại.' },
  REQUEST_COMPLETED: { title: 'Đơn đã hoàn thành', body: 'Đơn {code} đã hoàn tất. Cảm ơn bạn!' },
  REQUEST_CANCELLED: { title: 'Đơn đã huỷ', body: 'Đơn {code} đã bị huỷ.' },
  REQUEST_STATUS_CHANGED: { title: 'Cập nhật đơn hàng', body: 'Đơn {code} có cập nhật mới.' },
  STATUS_CHANGED: { title: 'Cập nhật đơn hàng', body: 'Đơn {code} có cập nhật mới.' },
  WARRANTY_CREATED: { title: 'Tạo yêu cầu bảo hành', body: 'Đã tạo yêu cầu bảo hành cho đơn {code}.' },
  WARRANTY_REQUESTED: { title: 'Yêu cầu bảo hành', body: 'Đã ghi nhận yêu cầu bảo hành đơn {code}.' },
  WARRANTY_APPROVED: { title: 'Bảo hành được duyệt', body: 'Yêu cầu bảo hành đơn {code} đã được duyệt.' },
  WARRANTY_REJECTED: { title: 'Bảo hành bị từ chối', body: 'Yêu cầu bảo hành đơn {code} không được chấp nhận.' },
  WARRANTY_COMPLETED: { title: 'Bảo hành hoàn tất', body: 'Yêu cầu bảo hành đơn {code} đã hoàn thành.' },
  FOLLOWUP_CREATED: { title: 'Đã tạo lịch tái khám', body: 'Đơn tái khám {code} đã được ghi nhận.' },
  REVIEW_RECEIVED: { title: 'Có đánh giá mới', body: 'Khách đã đánh giá đơn {code}.' },
  VOUCHER_RECEIVED: { title: 'Bạn nhận được mã giảm giá', body: 'Một mã giảm giá mới đã được thêm vào ví của bạn.' },
  POINTS_EARNED: { title: 'Cộng điểm thưởng', body: 'Bạn vừa được cộng điểm thưởng.' },
  ACCOUNT_LOCKED: { title: 'Tài khoản bị khoá', body: 'Tài khoản của bạn đang bị tạm khoá.' },
  SHIFT_ASSIGNED: { title: 'Bạn được xếp ca làm mới', body: 'Văn phòng vừa xếp ca làm việc mới cho bạn. Mở mục Chấm công để xem chi tiết.' },
  SHIFT_UPDATED: { title: 'Ca làm việc đã được cập nhật', body: 'Văn phòng vừa điều chỉnh lịch ca của bạn. Mở mục Chấm công để xem.' },
  SHIFT_CANCELLED: { title: 'Ca làm việc đã bị huỷ', body: 'Một ca làm việc của bạn đã bị văn phòng huỷ.' },
  ATTENDANCE_APPROVED: { title: 'Chấm công đã được duyệt', body: 'Ca vào làm của bạn đã được quản lý duyệt.' },
  ATTENDANCE_REJECTED: { title: 'Chấm công bị từ chối', body: 'Ca vào làm của bạn bị quản lý từ chối. Mở mục Chấm công để xem lý do.' },
  VIOLATION_RECORDED: { title: 'Ghi nhận vi phạm mới', body: 'Bạn vừa có một ghi nhận vi phạm mới. Mở mục Chấm công để xem chi tiết.' },
  ATTENDANCE_PERIOD_LOCKED: { title: 'Đã chốt kỳ công', body: 'Văn phòng đã chốt bảng công kỳ này.' },
  SYSTEM: { title: 'Thông báo hệ thống', body: '' },
};

// Mã lỗi backend hay gặp -> câu tiếng Việt.
const ERROR_CODE_VI = {
  ERROR: 'Có lỗi xảy ra. Vui lòng thử lại.',
  VALIDATION_ERROR: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
  BAD_REQUEST: 'Yêu cầu không hợp lệ.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  UNAUTHENTICATED: 'Bạn chưa đăng nhập hoặc phiên đã hết hạn. Vui lòng đăng nhập lại.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  SESSION_CHANGED: 'Tài khoản đã đăng nhập trên phiên mới. Vui lòng kiểm tra lại.',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  INVALID_TOKEN: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  NO_REFRESH_TOKEN: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
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
  INVALID_CURRENT_PASSWORD: 'Mật khẩu hiện tại không đúng.',
  USER_NOT_FOUND: 'Tài khoản không tồn tại.',
  ACCOUNT_NOT_FOUND: 'Tài khoản không tồn tại.',
  ACCOUNT_LOCKED: 'Tài khoản đang bị khoá.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị vô hiệu hoá.',
  PHONE_EXISTS: 'Số điện thoại đã được đăng ký.',
  PHONE_ALREADY_EXISTS: 'Số điện thoại đã được đăng ký.',
  EMAIL_EXISTS: 'Thư điện tử đã được sử dụng.',
  INVALID_OTP: 'Mã xác thực không đúng.',
  OTP_EXPIRED: 'Mã xác thực đã hết hạn.',
  OTP_INVALID: 'Mã xác thực không đúng.',
  INVALID_WARD: 'Phường/xã được chọn chưa hợp lệ. Vui lòng chọn lại.',
  REQUEST_NOT_FOUND: 'Không tìm thấy đơn hàng.',
  REQUEST_DECLINED: 'Đơn hàng đã bị từ chối.',
  JOB_NOT_FOUND: 'Không tìm thấy công việc.',
  REQUEST_NOT_AVAILABLE: 'Việc đã có thợ khác nhận hoặc không còn chờ nhận.',
  REQUEST_CLOSED: 'Đơn đã đóng.',
  INVALID_REQUEST_STATE: 'Đơn không còn ở trạng thái phù hợp cho thao tác này.',
  INVALID_STATUS: 'Trạng thái đơn không phù hợp cho thao tác này.',
  INVALID_STATE: 'Trạng thái đơn không phù hợp cho thao tác này.',
  JOB_NOT_ACTIVE: 'Việc không còn được giao cho bạn.',
  ASSIGNMENT_ENDED: 'Phân công công việc này đã kết thúc.',
  ASSIGNMENT_EXPIRED: 'Phân công công việc đã quá hạn tiếp nhận.',
  ASSIGNMENT_NOT_ACTIVE: 'Công việc này không còn giao cho bạn.',
  ASSIGNMENT_NOT_FOUND: 'Không tìm thấy phân công công việc.',
  JOB_REASSIGNED: 'Công việc đã được chuyển cho kỹ thuật viên khác.',
  NOT_ASSIGNED: 'Công việc chưa được phân công cho bạn.',
  NOT_YOUR_JOB: 'Công việc này không thuộc quyền phụ trách của bạn.',
  OFFER_EXPIRED: 'Đơn hàng đã quá thời gian chờ tiếp nhận.',
  CHECK_IN_REQUIRED: 'Vui lòng xác nhận đã đến nơi tại nhà khách trước khi thực hiện thao tác này.',
  PROCEDURE_INCOMPLETE: 'Vui lòng hoàn thành đầy đủ các bước quy trình bắt buộc trước khi bàn giao.',
  RECEIPT_REQUIRED: 'Vui lòng đính kèm ảnh biên lai cho vật tư mua ngoài trước khi hoàn thành.',
  QUOTATION_NOT_FOUND: 'Không tìm thấy báo giá.',
  QUOTATION_PENDING: 'Đang có báo giá chờ khách duyệt.',
  QUOTATION_ALREADY_APPROVED: 'Báo giá đã được duyệt.',
  NOT_PAYABLE_YET: 'Đơn chưa đến bước thanh toán.',
  PAYMENT_IN_PROGRESS: 'Đang có giao dịch chuyển khoản chờ xác nhận.',
  ALREADY_PAID: 'Đơn đã được thanh toán.',
  CUSTOMER_PAYS_BY_QR: 'Khách chọn chuyển khoản VietQR, thợ không thu tiền mặt.',
  PAYMENT_ALREADY_HANDED_OVER: 'Một số khoản tiền đã nằm trong đợt bàn giao khác.',
  PAYMENT_NOT_HANDOVERABLE: 'Chỉ nộp được các khoản tiền mặt đã xác nhận của chính bạn.',
  VOUCHER_EXPIRED: 'Mã giảm giá đã hết hạn.',
  VOUCHER_NOT_FOUND: 'Mã giảm giá không tồn tại.',
  VOUCHER_INVALID: 'Mã giảm giá không hợp lệ.',
  VOUCHER_USED: 'Mã giảm giá đã được sử dụng.',
  INSUFFICIENT_POINTS: 'Bạn không đủ điểm để đổi.',
  WARRANTY_EXPIRED: 'Đơn đã hết thời hạn bảo hành.',
  WARRANTY_FINAL_DAY_CUTOFF: 'Hôm nay là ngày cuối bảo hành và đã quá giờ tiếp nhận của kỹ thuật viên.',
  WARRANTY_NOT_APPLICABLE: 'Dịch vụ này không áp dụng bảo hành.',
  WARRANTY_NOT_STARTED: 'Đơn chưa hoàn thành nên chưa bắt đầu thời hạn bảo hành.',
  NO_WARRANTY: 'Dịch vụ này không áp dụng bảo hành.',
  REVIEW_ALREADY_EXISTS: 'Bạn đã đánh giá đơn này.',
  FILE_TOO_LARGE: 'Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn.',
  INVALID_FILE_TYPE: 'Định dạng tệp không được hỗ trợ.',
  INVALID_PHOTO: 'Không đọc được ảnh. Vui lòng chọn ảnh khác.',
  SLOT_UNAVAILABLE: 'Khung giờ này đã kín. Vui lòng chọn khung giờ khác.',
  TECHNICIAN_LOCKED: 'Tài khoản thợ đang bị tạm khoá.',
  ATTENDANCE_SHIFT_DUPLICATE: 'Bạn đã vào ca này rồi.',
  TECHNICIAN_SHIFT_NOT_USABLE: 'Ca này không còn hiệu lực (đã hủy hoặc không phải ca hôm nay).',
  ATTENDANCE_SHIFT_LIMIT: 'Đã đủ 6 ca trong ngày.',
  ATTENDANCE_DAY_OFF: 'Hôm nay bạn được đánh dấu nghỉ.',
  ATTENDANCE_LOCKED: 'Ngày công đã chốt, không chấm được.',
  ATTENDANCE_NOT_APPLICABLE: 'Tài khoản chưa được phép chấm công. Liên hệ văn phòng.',
  TIMEOUT: 'Kết nối máy chủ quá hạn. Vui lòng thử lại.',
  NETWORK_ERROR: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
};

// Tên trường hay gặp trong lỗi kiểm tra dữ liệu.
const FIELD_VI = {
  phone: 'Số điện thoại',
  password: 'Mật khẩu',
  full_name: 'Họ tên',
  name: 'Tên',
  email: 'Thư điện tử',
  username: 'Tên đăng nhập',
  otp: 'Mã xác thực',
  address: 'Địa chỉ',
  address_text: 'Địa chỉ',
  ward_code: 'Phường/xã',
  contact_name: 'Tên liên hệ',
  contact_phone: 'Số điện thoại liên hệ',
  preferred_time: 'Thời gian hẹn',
  problem_description: 'Mô tả sự cố',
  description: 'Mô tả',
  quantity: 'Số lượng',
  reason: 'Lý do',
  rejection_reason: 'Lý do từ chối',
  rating: 'Số sao',
  review_text: 'Nội dung đánh giá',
  code: 'Mã',
  amount: 'Số tiền',
  items: 'Hạng mục',
  file: 'Tệp',
  note: 'Ghi chú',
  notes: 'Ghi chú',
  technicianShiftId: 'Ca làm việc',
  latitude: 'Vĩ độ định vị',
  longitude: 'Kinh độ định vị',
  accuracyM: 'Độ chính xác định vị',
};

const wb = (pat) => new RegExp(`(?<![a-zA-ZÀ-ỹ])${pat}(?![a-zA-ZÀ-ỹ])`, 'gi');

const CODE_TOKEN = '(?:\\uE000\\d+\\uE001|[A-Z]{2,5}[-\\d]+)';

// Cụm từ tiếng Anh -> tiếng Việt (sắp xếp từ cụm dài đến ngắn, dùng ranh giới từ chính xác).
const PHRASES = [
  [new RegExp(`your (service )?request\\s+(${CODE_TOKEN})?\\s*has been created`, 'gi'), 'Đơn $2 đã được tạo'],
  [new RegExp(`request\\s+(${CODE_TOKEN})\\s+status (changed|updated) to\\s+([A-Z_]+)`, 'gi'), (_m, c, _x, st) => `Đơn ${c} chuyển sang: ${REQUEST_STATUS_VI[String(st).toUpperCase()] || 'trạng thái mới'}`],
  [/status (changed|updated) to\s+([A-Z_]+)/gi, (_m, _x, st) => `Trạng thái chuyển sang: ${REQUEST_STATUS_VI[String(st).toUpperCase()] || 'trạng thái mới'}`],
  [/network request failed|failed to fetch|network error|connection refused|econnrefused/gi, 'Không kết nối được máy chủ'],
  [/request timed? out|connection timed? out|timed? out/gi, 'Kết nối quá thời gian chờ'],
  [/something went wrong|unexpected error|internal server error/gi, 'Máy chủ đang gặp sự cố'],
  [/new job( available)?/gi, 'Có việc mới'],
  [/new (service )?request/gi, 'Có đơn mới'],
  [/new quotation|quotation (has been )?sent|quote sent/gi, 'Có báo giá mới'],
  [/quotation (has been )?approved/gi, 'Báo giá đã được duyệt'],
  [/quotation (has been )?rejected/gi, 'Báo giá bị từ chối'],
  [/revision requested/gi, 'Yêu cầu báo giá lại'],
  [/technician (is )?on the way/gi, 'Thợ đang đến'],
  [/technician (has )?arrived/gi, 'Thợ đã đến'],
  [/technician assigned|assigned to (a )?technician/gi, 'Đã có thợ nhận đơn'],
  [/job assigned( to you)?/gi, 'Bạn được giao việc mới'],
  [/job completed|work completed/gi, 'Thợ đã hoàn thành công việc'],
  [/payment (has been )?received/gi, 'Đã nhận thanh toán'],
  [/payment (was )?successful|payment success/gi, 'Thanh toán thành công'],
  [/payment (is )?required|awaiting payment|pending payment/gi, 'Chờ thanh toán'],
  [/request (has been )?completed|order completed/gi, 'Đơn đã hoàn thành'],
  [/request (has been )?cancel+ed|order cancel+ed/gi, 'Đơn đã huỷ'],
  [/warranty expired/gi, 'Đơn đã hết hạn bảo hành'],
  [/warranty request/gi, 'Yêu cầu bảo hành'],
  [/new review|review received/gi, 'Có đánh giá mới'],
  [/voucher received|you (have )?received a voucher/gi, 'Bạn nhận được mã giảm giá'],
  [/points? earned/gi, 'Được cộng điểm thưởng'],
  [/already handed over/gi, 'đã được bàn giao'],
  [/receipt required/gi, 'cần đính kèm ảnh biên lai'],
  [/procedure incomplete/gi, 'chưa hoàn thành đủ các bước thực hiện'],
  [/slot unavailable|no slots? available/gi, 'khung giờ không còn trống'],
  [/invalid credentials|incorrect (phone|password)/gi, 'Số điện thoại hoặc mật khẩu không đúng'],
  [/unauthori[sz]ed|unauthenticated/gi, 'Phiên đăng nhập đã hết hạn'],
  [/forbidden|permission denied|access denied/gi, 'Bạn không có quyền thực hiện thao tác này'],
  [/not found/gi, 'Không tìm thấy dữ liệu'],
  [/too many requests/gi, 'Bạn thao tác quá nhanh, vui lòng thử lại sau'],
  [/validation (failed|error)/gi, 'Thông tin chưa hợp lệ'],
  [wb('is required'), 'là bắt buộc'],
  [wb('must be a valid'), 'không hợp lệ'],
  [wb('is invalid|invalid'), 'không hợp lệ'],
  [wb('already exists|already taken'), 'đã tồn tại'],
  [/^success(fully)?$|^ok$/gi, 'Thành công'],
  // Thuật ngữ đơn lẻ hay lọt từ server / thông báo kỹ thuật
  [wb('check[\\s-]?in(?:\\s+gps)?'), 'xác nhận đến nơi'],
  [wb('timeout'), 'quá hạn'],
  [wb('mã\\s+voucher'), 'mã giảm giá'],
  [wb('voucher'), 'mã giảm giá'],
  [wb('bill'), 'hoá đơn'],
  [wb('email'), 'thư điện tử'],
  [wb('mã\\s+otp'), 'mã xác thực'],
  [wb('otp'), 'mã xác thực'],
  [wb('gps'), 'định vị'],
  [wb('hotline'), 'tổng đài'],
  [wb('realtime|real-time'), 'trực tiếp'],
  [wb('checklist'), 'danh mục kiểm tra'],
  [wb('camera'), 'máy ảnh'],
  [wb('username'), 'tên đăng nhập'],
  [wb('server'), 'máy chủ'],
  // Chuỗi 1 từ trạng thái/lỗi phổ biến
  [/^pending$/i, 'Đang chờ'],
  [/^approved$/i, 'Đã duyệt'],
  [/^rejected$/i, 'Bị từ chối'],
  [/^completed$/i, 'Hoàn thành'],
  [/^cancel+ed$/i, 'Đã huỷ'],
  [/^expired$/i, 'Đã hết hạn'],
  [/^failed$/i, 'Thất bại'],
  [/^error$/i, 'Có lỗi xảy ra'],
  [/^unknown$/i, 'Không xác định'],
  [/^submitted$/i, 'Chờ duyệt'],
  [/^confirmed$/i, 'Đã xác nhận'],
  [/^accepted$/i, 'Đã tiếp nhận'],
  [/^assigned$/i, 'Đã phân công'],
  [/^done$/i, 'Hoàn thành'],
];

// Các từ kỹ thuật / tên hãng được phép xuất hiện trong chuỗi tiếng Việt mà không bị xem là lỗi tiếng Anh.
const SAFE_TECH_OR_BRAND = new Set([
  'qr', 'vietqr', 'vnpay', 'mbbank', 'payos', 'vnd', 'vnđ', 'gas', 'r32', 'r410a', 'r22',
  'inverter', 'mono', 'hp', 'btu', 'kwh', 'kw', 'ampe', 'volt', 'watt',
  'panasonic', 'daikin', 'sony', 'samsung', 'lg', 'toshiba', 'casper', 'electrolux',
  'beko', 'teka', 'nagakawa', 'comfee', 'coway', 'fuji', 'smart', 'chungho',
  'makano', 'nanomax', 'jbl', 'boss', 'hawoo', 'skyworth', 'boston', 'sumico', 'minhduc',
  'ca', 't2', 't3', 't4', 't5', 't6', 't7', 'cn', 'id',
]);

// Dấu hiệu lỗi hệ thống/JS hoặc từ tiếng Anh không nên hiển thị cho người dùng.
const SYSTEM_ERROR_SIGNATURES = /(typeerror|referenceerror|syntaxerror|rangeerror|aborterror|network\s+request\s+failed|failed\s+to\s+fetch|econnrefused|enotfound|bad\s+gateway|service\s+unavailable|cannot\s+read\s+propert|undefined\s+is\s+not|unexpected\s+token|exception\s+occurred|stack\s*trace)/i;
const OBVIOUS_ENGLISH_WORDS = /(?<![a-zA-ZÀ-ỹ])(error|failed|failure|pending|unknown|invalid|expired|unauthorized|unauthenticated|forbidden|rejected|cancelled|canceled|exception|undefined|timeout|unavailable|conflict|duplicate|missing|required|denied|refused|offline|unexpected|unhandled|glitch|warranty)(?![a-zA-ZÀ-ỹ])/i;
// Cấu trúc âm tiết tiếng Việt thanh ngang (không dấu), để phân biệt "thao", "nhanh", "sau" với từ tiếng Anh.
const IS_VIETNAMESE_SYLLABLE = /^(?:(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnpqrstvx])?(?:a|e|i|o|u|y|ai|ao|au|ay|eo|eu|ia|ie|iu|oa|oe|oi|oo|ua|ue|ui|uo|uu|uy|ye|ieu|oai|oao|oay|oeo|uai|uay|uoi|uou|uya|uye|yeu)(?:ch|ng|nh|[cimnptuy])?)$/i;

const isVietnamese = (s) => VI_CHARS.test(String(s || ''));

// Tạm ẩn URL, email, mã đơn để không bị PHRASES / replaceStatusCodes làm biến dạng.
const maskProtectedTokens = (input) => {
  const saved = [];
  const push = (m) => {
    const idx = saved.length;
    saved.push(m);
    return `\uE000${idx}\uE001`;
  };
  const masked = String(input || '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, push)
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, push)
    .replace(/(?<![a-zA-ZÀ-ỹ])[A-Z]{2,5}-?\d[\d-]{2,}[A-Z0-9-]*(?![a-zA-ZÀ-ỹ])/g, push);
  return {
    masked,
    restore: (txt) => String(txt || '').replace(/\uE000(\d+)\uE001/g, (_, i) => saved[Number(i)] || ''),
  };
};

// Kiểm tra còn chữ tiếng Anh chưa dịch được.
const looksEnglish = (s, rawUnaccented = null) => {
  const { masked } = maskProtectedTokens(s);
  const stripCodes = (txt) => String(txt || '').replace(/(?<![A-ZÀ-Ỹ])[A-Z0-9_]{3,}(?![A-ZÀ-Ỹ])/g, (m) => (
    /^(ERROR|FAILED|PENDING|TIMEOUT|UNKNOWN|INVALID|CANCELLED|REJECTED|EXPIRED|UNAUTHORIZED|FORBIDDEN|NOT_FOUND)$/i.test(m) ? m : ''
  ));
  const t = stripCodes(masked);
  const extractNonSafeWords = (txt) => (
    (String(txt || '').match(/(?<![a-zA-ZÀ-ỹ])[a-zA-Z]{2,}(?![a-zA-ZÀ-ỹ])/g) || [])
      .filter((w) => !SAFE_TECH_OR_BRAND.has(w.toLowerCase()))
  );
  if (!isVietnamese(t)) {
    return extractNonSafeWords(t).length >= 1;
  }
  if (SYSTEM_ERROR_SIGNATURES.test(t) || OBVIOUS_ENGLISH_WORDS.test(t)) return true;
  if (rawUnaccented) {
    const residual = stripCodes(PHRASES.reduce((acc, [re]) => acc.replace(re, ' '), String(rawUnaccented || '')));
    return extractNonSafeWords(residual).length >= 2;
  }
  return extractNonSafeWords(t).filter((w) => !IS_VIETNAMESE_SYLLABLE.test(w)).length >= 2;
};

const hasOwn = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

const replaceStatusCodes = (s) => String(s || '').replace(
  /(?<![A-ZÀ-Ỹ])[A-Z][A-Z_]{2,}(?![A-ZÀ-Ỹ])/g,
  (m) => (hasOwn(REQUEST_STATUS_VI, m) ? REQUEST_STATUS_VI[m] : m),
);

const applyPhrases = (s) => PHRASES
  .reduce((acc, [re, rep]) => acc.replace(re, rep), String(s || ''))
  .replace(/\s{2,}/g, ' ')
  .trim();

const extractCode = (...texts) => {
  for (const t of texts) {
    const m = String(t || '').match(/\b[A-Z]{2,5}[-]?\d[\w-]{2,}\b/);
    if (m) return m[0];
  }
  return '';
};

const fill = (tpl, code) => String(tpl || '').replace(/\{code\}/g, code || '').replace(/\s{2,}/g, ' ').replace(/Đơn\s+đã/g, 'Đơn đã').trim();

/** Việt hoá một chuỗi bất kỳ từ server; trả fallback nếu vẫn còn tiếng Anh. */
export const toVietnamese = (text, fallback = '') => {
  if (text == null || text === '') return fallback || '';
  const raw = String(text);
  const { masked, restore } = maskProtectedTokens(raw);
  const rawHadVi = isVietnamese(masked);
  const translatedMasked = replaceStatusCodes(applyPhrases(masked));
  const out = restore(translatedMasked);
  const hasUnmappedStatus = /(?<![A-ZÀ-Ỹ])[A-Z]+_[A-Z_]{2,}(?![A-ZÀ-Ỹ])/.test(translatedMasked);
  if (!hasUnmappedStatus && !looksEnglish(translatedMasked, rawHadVi ? null : masked)) {
    return out;
  }
  return fallback || '';
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
  const codeUpper = code ? String(code).toUpperCase() : '';
  const byCode = codeUpper && hasOwn(ERROR_CODE_VI, codeUpper) ? ERROR_CODE_VI[codeUpper] : null;
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
  const raw = String(message);
  if (isVietnamese(raw)) {
    const cleaned = toVietnamese(raw, '');
    return cleaned && !looksEnglish(cleaned) ? cleaned : fallback;
  }
  if (byCode) return byCode; // có mã lỗi đã biết: dùng câu chuẩn thay vì dịch từng cụm
  const out = toVietnamese(raw, '');
  return out && !looksEnglish(out) ? out : fallback;
};

/** Việt hoá một dòng lỗi theo trường ({ field, message }). */
export const viFieldError = (e = {}) => {
  const fieldKey = e.field ? String(e.field) : '';
  const field = FIELD_VI[fieldKey] || FIELD_VI[fieldKey.toLowerCase()] || toVietnamese(fieldKey, 'Thông tin');
  const rawMsg = fieldKey
    ? String(e.message || '').replace(new RegExp(`^["']?${fieldKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*`, 'i'), '')
    : e.message;
  const msg = toVietnamese(rawMsg, 'không hợp lệ');
  return field ? `${field}: ${msg}` : msg;
};
