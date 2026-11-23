import { toVietnamese } from './viText.js';

const CODE_MESSAGES = {
  INVALID_CREDENTIALS: 'Thư điện tử/tên đăng nhập hoặc mật khẩu không chính xác.',
  INVALID_LOGIN: 'Thư điện tử/tên đăng nhập hoặc mật khẩu không chính xác.',
  INVALID_PASSWORD: 'Mật khẩu không chính xác.',
  USER_NOT_FOUND: 'Không tìm thấy tài khoản. Vui lòng kiểm tra lại thông tin đăng nhập.',
  ACCOUNT_NOT_FOUND: 'Không tìm thấy tài khoản. Vui lòng kiểm tra lại thông tin đăng nhập.',
  USERNAME_EXISTS: 'Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác.',
  USERNAME_TAKEN: 'Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác.',
  EMAIL_EXISTS: 'Thư điện tử này đã được đăng ký. Vui lòng đăng nhập hoặc dùng thư điện tử khác.',
  EMAIL_ALREADY_EXISTS: 'Thư điện tử này đã được đăng ký. Vui lòng đăng nhập hoặc dùng thư điện tử khác.',
  PHONE_EXISTS: 'Số điện thoại này đã được đăng ký. Vui lòng dùng số khác.',
  DUPLICATE_EMAIL: 'Thư điện tử này đã được đăng ký. Vui lòng đăng nhập hoặc dùng thư điện tử khác.',
  DUPLICATE_USERNAME: 'Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác.',
  VALIDATION_ERROR: 'Thông tin đăng ký chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.',
  WEAK_PASSWORD: 'Mật khẩu chưa đủ an toàn. Vui lòng dùng mật khẩu từ 8 đến 64 ký tự.',
  PASSWORD_TOO_SHORT: 'Mật khẩu phải có ít nhất 8 ký tự.',
  INVALID_EMAIL: 'Địa chỉ thư điện tử chưa đúng định dạng.',
  INVALID_USERNAME: 'Tên đăng nhập chưa hợp lệ. Vui lòng kiểm tra lại.',
  ACCOUNT_DISABLED: 'Tài khoản hiện không hoạt động. Vui lòng liên hệ bộ phận hỗ trợ.',
  TOO_MANY_ATTEMPTS: 'Bạn đã thử quá nhiều lần. Vui lòng đợi rồi thử lại.',
};

const FIELD_LABELS = {
  username: 'Tên đăng nhập',
  email: 'Thư điện tử',
  password: 'Mật khẩu',
  confirm_password: 'Mật khẩu xác nhận',
  full_name: 'Họ và tên',
  name: 'Họ và tên',
  phone: 'Số điện thoại',
  address: 'Địa chỉ',
};

function translateText(value, field = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  const label = FIELD_LABELS[String(field).toLowerCase()];

  if (/email/.test(`${field} ${lower}`) && /valid|format|address/.test(lower)) return 'Địa chỉ thư điện tử chưa đúng định dạng.';
  if (/username|user_name|login/.test(`${field} ${lower}`) && /length|character|format|invalid/.test(lower)) {
    return 'Tên đăng nhập chưa hợp lệ. Vui lòng kiểm tra lại.';
  }
  if (/password/.test(`${field} ${lower}`) && /length|character|short|weak|strong/.test(lower)) {
    return 'Mật khẩu phải có từ 8 đến 64 ký tự.';
  }

  if (/already exists|already taken|already in use|duplicate|has been taken|is taken/.test(lower)) {
    if (/email/.test(`${field} ${lower}`)) return 'Thư điện tử này đã được đăng ký. Vui lòng đăng nhập hoặc dùng thư điện tử khác.';
    if (/phone|mobile|telephone/.test(`${field} ${lower}`)) return 'Số điện thoại này đã được đăng ký. Vui lòng dùng số khác.';
    if (/user|login/.test(`${field} ${lower}`)) return 'Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác.';
    return 'Thông tin này đã được sử dụng. Vui lòng kiểm tra lại.';
  }
  if (/invalid credentials|incorrect (email|username|password)|wrong password|password.*incorrect|unauthorized/.test(lower)) {
    return 'Thư điện tử/tên đăng nhập hoặc mật khẩu không chính xác.';
  }
  if (/user(name)?.*(not found|does not exist)|account.*not found|no user found/.test(lower)) {
    return 'Không tìm thấy tài khoản. Vui lòng kiểm tra lại thông tin đăng nhập.';
  }
  if (/invalid email|email.*(invalid|not valid)/.test(lower)) return 'Địa chỉ thư điện tử chưa đúng định dạng.';
  if (/password.*(at least|minimum|min|too short|length)|weak password/.test(lower)) {
    return 'Mật khẩu phải có từ 8 đến 64 ký tự.';
  }
  if (/required|is required|must not be empty|cannot be empty/.test(lower)) {
    return label ? `Vui lòng nhập ${label.toLowerCase()}.` : 'Vui lòng điền đầy đủ thông tin bắt buộc.';
  }
  if (/network|fetch failed|failed to fetch|econnrefused|timed? out|timeout/.test(lower)) {
    return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.';
  }
  if (/internal server error|something went wrong|unexpected error/.test(lower)) {
    return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
  }
  // Không để thông báo tiếng Anh hay mã trạng thái từ backend xuất hiện trực tiếp trong giao diện.
  const cleaned = toVietnamese(text, '');
  if (!cleaned) return '';
  return cleaned;
}

export function authErrorMessage(error, mode = 'login') {
  const code = String(error?.code || '').toUpperCase();
  if (CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (/INVALID_CREDENTIAL|LOGIN_FAILED|AUTH_FAILED/.test(code)) return 'Thư điện tử/tên đăng nhập hoặc mật khẩu không chính xác.';
  if (/EMAIL.*(EXIST|TAKEN|DUPLICATE|REGISTERED)/.test(code)) return CODE_MESSAGES.EMAIL_EXISTS;
  if (/USER(NAME)?.*(EXIST|TAKEN|DUPLICATE|REGISTERED)/.test(code)) return CODE_MESSAGES.USERNAME_EXISTS;
  if (/PHONE.*(EXIST|TAKEN|DUPLICATE|REGISTERED)/.test(code)) return CODE_MESSAGES.PHONE_EXISTS;

  const errors = Array.isArray(error?.errors) ? error.errors : [];
  for (const item of errors) {
    const translated = translateText(item?.message, item?.field);
    if (translated) return translated;
  }

  const message = translateText(error?.message || error?.error, error?.field);
  if (message) return message;

  if (error?.status === 0 || error?.status === 408) {
    return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.';
  }
  if (error?.status === 401 || error?.status === 403) {
    return mode === 'register'
      ? 'Bạn chưa thể tạo tài khoản với thông tin này. Vui lòng kiểm tra lại.'
      : 'Thư điện tử/tên đăng nhập hoặc mật khẩu không chính xác.';
  }
  if (error?.status === 409) {
    return 'Thông tin đăng ký đã được sử dụng. Vui lòng kiểm tra thư điện tử, tên đăng nhập hoặc số điện thoại.';
  }
  if (error?.status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
  return mode === 'register'
    ? 'Chưa thể tạo tài khoản. Vui lòng kiểm tra thông tin đã nhập và thử lại.'
    : mode === 'forgot'
      ? 'Đặt lại mật khẩu chưa thành công. Vui lòng kiểm tra thông tin và thử lại.'
      : 'Đăng nhập chưa thành công. Vui lòng kiểm tra thông tin và thử lại.';
}
