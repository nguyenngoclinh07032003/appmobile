// Bảng màu chuẩn Thiết kế Doanh nghiệp Tối giản (60–30–10): Nền trung tính · Xanh dương chủ đạo · 3 màu ngữ nghĩa
export const C = {
  primary: '#0062E0',        // Xanh dương chủ đạo (Royal Corporate Blue)
  primaryDark: '#004CB8',    // Xanh đậm
  primarySoft: '#EFF6FF',    // Xanh nhạt tinh khiết
  primaryBorder: '#BFDBFE',  // Viền xanh nhạt
  navy: '#0A3D8F',           // Xanh đậm thanh lịch (Hero / Header)
  navy2: '#072E6E',          // Xanh đậm phụ
  gold: '#D97706',           // Vàng hổ phách: Cảnh báo / Chờ xử lý
  goldSoft: '#FEF3C7',       // Nền vàng nhạt cho badge / nhấn nhỏ
  goldBorder: '#FDE68A',     // Viền vàng nhạt
  goldInk: '#92400E',        // Chữ vàng nâu đậm dễ đọc
  ink: '#0F172A',            // Chữ đen xám đậm & giá tiền
  ink2: '#334155',           // Chữ phụ
  muted: '#64748B',          // Chữ mờ
  faint: '#94A3B8',          // Chữ / icon gợi ý
  line: '#E2E8F0',           // Đường kẻ viền xám sáng
  surface: '#F1F5F9',        // Nền khối phụ / ô nhập / thẻ nhạt trung tính
  bg: '#F8FAFC',             // Nền trang xám trắng mát mắt
  card: '#FFFFFF',           // Nền thẻ trắng tinh
  red: '#DC2626',            // Đỏ: nguy hiểm / lỗi / huỷ
  redSoft: '#FEF2F2',        // Nền đỏ nhạt cho badge
  redBorder: '#FECACA',      // Viền đỏ nhạt
  redInk: '#991B1B',         // Chữ đỏ đậm dễ đọc
  green: '#059669',          // Xanh lá: hoàn thành / thành công
  greenSoft: '#ECFDF5',      // Nền xanh lá nhạt cho badge
  greenBorder: '#A7F3D0',    // Viền xanh lá nhạt
  greenInk: '#065F46',       // Chữ xanh lá đậm dễ đọc
  orange: '#D97706',         // Alias hợp nhất về Vàng hổ phách cảnh báo
  orangeSoft: '#FFFBEB',     // Nền vàng kem nhạt
  purple: '#0062E0',         // Hợp nhất về Xanh chủ đạo
  purpleSoft: '#EFF6FF',     // Hợp nhất về Xanh nhạt
  cyan: '#0062E0',           // Hợp nhất về Xanh chủ đạo
  cyanSoft: '#EFF6FF',       // Hợp nhất về Xanh nhạt
};

export const CAT_TONE = {
  'may-lanh': { bg: '#EFF6FF', fg: '#0062E0', grad: null },
  'may-giat': { bg: '#EFF6FF', fg: '#0062E0', grad: null },
  'tu-lanh': { bg: '#EFF6FF', fg: '#0062E0', grad: null },
  'nuoc-nong': { bg: '#EFF6FF', fg: '#0062E0', grad: null },
  'hut-mui': { bg: '#EFF6FF', fg: '#0062E0', grad: null },
  quat: { bg: '#EFF6FF', fg: '#0062E0', grad: null },
  'loc-khong-khi': { bg: '#EFF6FF', fg: '#0062E0', grad: null },
};

export const toneOf = (cat) => {
  if (CAT_TONE[cat]) return CAT_TONE[cat];
  const tones = Object.values(CAT_TONE);
  const n = Number(String(cat || '').replace(/\D/g, '')) || 0;
  return tones[n % tones.length];
};

// Chuẩn hoá 4 nhóm màu trạng thái + xám trung tính:
// - Amber: chờ xử lý / báo giá / thanh toán / thẩm định BH
// - Brand Blue: đang thực hiện (đã nhận / đang đến / đang sửa)
// - Green: hoàn thành
// - Red: đã huỷ
// - Neutral Slate: ngoài bảo hành
export const STATUS_META = {
  pending: { label: 'Chờ nhận việc', fg: '#92400E', bg: '#FEF3C7' },
  confirmed: { label: 'Thợ đã nhận', fg: '#0062E0', bg: '#EFF6FF' },
  onway: { label: 'Thợ đang đến', fg: '#0062E0', bg: '#EFF6FF' },
  diagnosing: { label: 'Đang kiểm tra', fg: '#92400E', bg: '#FEF3C7' },
  quoted: { label: 'Chờ duyệt báo giá', fg: '#92400E', bg: '#FEF3C7' },
  repairing: { label: 'Đang thực hiện', fg: '#0062E0', bg: '#EFF6FF' },
  pending_payment: { label: 'Chờ thanh toán', fg: '#92400E', bg: '#FEF3C7' },
  // Giữ để đơn cũ trong bộ nhớ local không lỗi hiển thị; luồng mới không dùng trạng thái này.
  partially_paid: { label: 'Chờ thanh toán', fg: '#92400E', bg: '#FEF3C7' },
  pending_review: { label: 'Hoàn thành', fg: '#065F46', bg: '#ECFDF5' },
  warranty_pending: { label: 'Chờ VP duyệt BH', fg: '#92400E', bg: '#FEF3C7' },
  out_of_warranty: { label: 'Ngoài bảo hành', fg: '#475569', bg: '#F1F5F9' },
  done: { label: 'Hoàn thành', fg: '#065F46', bg: '#ECFDF5' },
  cancelled: { label: 'Đã huỷ', fg: '#991B1B', bg: '#FEF2F2' },
};
