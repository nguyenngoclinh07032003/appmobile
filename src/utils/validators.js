// Bộ quy tắc kiểm tra tính hợp lệ dữ liệu nhập liệu (Validation) chuẩn cho ứng dụng Thợ HRMSS

/**
 * Kiểm tra số điện thoại Việt Nam hợp lệ:
 * - Đúng 10 chữ số
 * - Bắt đầu bằng 03, 05, 07, 08 hoặc 09 (các nhà mạng Viettel, Mobifone, Vinaphone, Vietnamobile, Gmobile, Wintel...)
 * - Loại trừ số rác toàn 0 (0000000000), số lặp 1 chữ số (0999999999) hoặc số thử nghiệm (0123456789)
 */
export function validateVietnamesePhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) {
    return 'Vui lòng nhập số điện thoại.';
  }
  if (clean.length !== 10) {
    return 'Số điện thoại phải có đúng 10 chữ số (bắt đầu bằng số 0).';
  }
  if (!clean.startsWith('0')) {
    return 'Số điện thoại phải bắt đầu bằng chữ số 0.';
  }
  if (!/^0[35789]\d{8}$/.test(clean)) {
    return 'Số điện thoại không hợp lệ (phải thuộc các đầu số di động: 03, 05, 07, 08, 09).';
  }
  // Chặn số rác lặp chữ số: 0000000000, 0999999999, 0888888888...
  if (/^0(\d)\1{8}$/.test(clean) || clean === '0123456789') {
    return 'Số điện thoại không có thực. Vui lòng nhập số điện thoại thật để thợ liên hệ.';
  }
  return '';
}

/**
 * Kiểm tra địa chỉ cụ thể (Số nhà, tên đường, toà nhà):
 * - Ngăn chặn nhập bừa bãi, gõ phím vô nghĩa (như jhjjhg, asdfgh, 111111)
 * - Tối thiểu 5 ký tự, có nguyên âm tiếng Việt, có ý nghĩa nhận diện vị trí
 */
export function validateStreetAddress(street) {
  const clean = String(street || '').trim();
  if (!clean) {
    return 'Vui lòng nhập số nhà, tên đường hoặc toà nhà.';
  }
  if (clean.length < 5) {
    return 'Địa chỉ quá ngắn (tối thiểu 5 ký tự). Vui lòng ghi rõ số nhà, ngõ/ngách hoặc tên đường.';
  }
  if (clean.length > 120) {
    return 'Địa chỉ không được dài quá 120 ký tự.';
  }

  // Chặn lặp 1 ký tự liên tiếp quá 3 lần: e.g. "aaaaa", "111111", "......"
  if (/(.)\1{3,}/i.test(clean)) {
    return 'Địa chỉ chứa ký tự lặp bất thường. Vui lòng nhập địa chỉ cụ thể.';
  }

  // Phải chứa ít nhất 1 nguyên âm tiếng Việt (có dấu hoặc không dấu)
  const VIET_VOWELS = /[aeiouyàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/i;
  if (!VIET_VOWELS.test(clean)) {
    return 'Địa chỉ không hợp lệ (không chứa từ có nghĩa). Vui lòng nhập số nhà và tên đường thực tế.';
  }

  // Chặn các chuỗi gõ phím rác / thử nghiệm phổ biến
  const FAKE_PATTERNS = /^(test|demo|abc|abcd|xyz|asdf|qwerty|jhjjhg| linh tinh|chua co|khong co|khong biet|ha noi|sai gon|viet nam)$/i;
  if (FAKE_PATTERNS.test(clean)) {
    return 'Vui lòng nhập địa chỉ thực tế nơi thợ đến thi công (ví dụ: Số 12 ngõ 45 hoặc Toà CT1).';
  }

  // Phải có chữ cái (tên đường/phố/toà nhà), không được chỉ toàn số hoặc ký tự đặc biệt
  const hasLetter = /[a-zA-ZÀ-ỹ]/.test(clean);
  if (!hasLetter) {
    return 'Địa chỉ phải có tên đường, ngõ hoặc toà nhà (không chỉ toàn số).';
  }

  // Nếu chỉ có 1 từ duy nhất không có dấu cách và không có số
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 2 && !/\d/.test(clean)) {
    return 'Vui lòng nhập đầy đủ số nhà và tên đường (ví dụ: 128 Trần Duy Hưng hoặc Toà Golden Park).';
  }

  return '';
}

/**
 * Kiểm tra họ và tên người liên hệ
 */
export function validateContactName(name) {
  const clean = String(name || '').trim();
  if (!clean) {
    return 'Vui lòng nhập họ và tên người liên hệ.';
  }
  if (clean.length < 2) {
    return 'Họ tên phải có ít nhất 2 ký tự.';
  }
  if (clean.length > 50) {
    return 'Họ tên không được vượt quá 50 ký tự.';
  }
  // Chỉ cho phép chữ cái tiếng Việt, dấu cách, dấu chấm (nếu viết tắt) hoặc dấu gạch nối
  if (!/^[a-zA-ZÀ-ỹ\s\.\-]+$/.test(clean)) {
    return 'Họ tên chỉ được chứa chữ cái, không được chứa số hoặc ký tự đặc biệt.';
  }
  return '';
}

