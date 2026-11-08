import { Platform } from 'react-native';

// Bảng màu chuẩn Thiết kế Doanh nghiệp Tối giản: 2 màu chủ đạo XANH DƯƠNG & TRẮNG (Light)
export const LIGHT_THEME = {
  mode: 'light',
  primary: '#0062E0',        // Xanh dương chủ đạo (Royal Corporate Blue)
  primaryDark: '#004CB8',    // Xanh đậm
  primarySoft: '#EBF3FF',    // Xanh nhạt tinh khiết
  navy: '#0052CC',           // Xanh đậm thanh lịch
  navy2: '#0844A4',          // Xanh đậm phụ
  gold: '#F59E0B',           // Vàng chuẩn cho Cảnh báo (Alert / Warning)
  goldSoft: '#FEF3C7',       // Nền vàng cảnh báo nhạt
  goldInk: '#B45309',        // Chữ vàng nâu đậm dễ đọc
  ink: '#0F172A',            // Chữ đen xám đậm dễ đọc (Slate 900)
  ink2: '#334155',           // Chữ phụ (Slate 700)
  muted: '#64748B',          // Chữ mờ (Slate 500)
  faint: '#94A3B8',          // Viền mờ (Slate 400)
  line: '#E2E8F0',           // Đường kẻ viền xám sáng (Slate 200)
  bg: '#F8FAFC',             // Nền trang xám trắng mát mắt (Slate 50)
  card: '#FFFFFF',           // Nền thẻ trắng tinh
  cardElevated: '#FFFFFF',   // Nền nổi cấp 2
  red: '#DC2626',            // Đỏ: thông báo nguy hiểm / lỗi / huỷ
  redSoft: '#FEF2F2',        // Nền đỏ nhạt
  green: '#059669',          // Xanh lá: hoàn thành / thành công (Success)
  greenSoft: '#ECFDF5',      // Nền xanh lá nhạt
  orange: '#D97706',         // Vàng cam: cảnh báo (Alert / Warning)
  orangeSoft: '#FFFBEB',     // Nền vàng kem cảnh báo
  purple: '#0062E0',         // Chuyển tím thành Xanh chủ đạo
  purpleSoft: '#EBF3FF',     // Nền xanh nhạt
  cyan: '#0284C7',           // Xanh Cyan
  cyanSoft: '#F0F9FF',       // Nền cyan nhạt
  surfaceSubtle: '#F8FAFC',
};

// Bảng màu Dark Mode chuẩn mực cao cấp (Top 0.1% - Deep Obsidian Slate, chống OLED smearing & nhức mắt)
export const DARK_THEME = {
  mode: 'dark',
  primary: '#38BDF8',        // Xanh Cyan Sky 400 dịu mắt, nổi bật trên nền tối mà không gây mỏi quang học
  primaryDark: '#0284C7',
  primarySoft: 'rgba(56, 189, 248, 0.16)',
  navy: '#0F172A',           // Nền Hero Slate 900 sâu thẳm
  navy2: '#020617',          // Slate 950
  gold: '#FBBF24',           // Amber 400
  goldSoft: 'rgba(251, 191, 36, 0.16)',
  goldInk: '#FDE68A',        // Amber 200
  ink: '#F8FAFC',            // Chữ trắng kem dịu (Slate 50) - tương phản chuẩn WCAG AAA
  ink2: '#CBD5E1',           // Chữ phụ (Slate 300)
  muted: '#94A3B8',          // Chữ mờ dễ đọc (Slate 400)
  faint: '#64748B',          // Đường nét mờ (Slate 500)
  line: '#334155',           // Đường phân cách sắc nét tinh tế (Slate 700)
  bg: '#0B1120',             // Nền trang Obsidian Dark (không dùng #000000 tuyệt đối để tránh chói và nhòe OLED)
  card: '#1E293B',           // Thẻ nổi cấp 1 (Slate 800)
  cardElevated: '#334155',   // Thẻ nổi cấp 2 cho Modal/Sheet (Slate 700)
  red: '#F87171',            // Đỏ nhạt cảnh báo nguy hiểm
  redSoft: 'rgba(239, 68, 68, 0.18)',
  green: '#34D399',          // Xanh ngọc bảo dịu mát cho hoàn thành / thành công
  greenSoft: 'rgba(52, 211, 153, 0.18)',
  orange: '#FBBF24',         // Cam vàng
  orangeSoft: 'rgba(251, 191, 36, 0.18)',
  purple: '#38BDF8',
  purpleSoft: 'rgba(56, 189, 248, 0.16)',
  cyan: '#38BDF8',
  cyanSoft: 'rgba(56, 189, 248, 0.16)',
  surfaceSubtle: '#131C31',
};

// C mặc định cho tương thích ngược
export const C = LIGHT_THEME;

export const getThemeColors = (isDark = false) => (isDark ? DARK_THEME : LIGHT_THEME);

export const CAT_TONE = {
  'may-lanh': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'may-giat': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'tu-lanh': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'nuoc-nong': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'hut-mui': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  quat: { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'loc-khong-khi': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
};

export const CAT_TONE_DARK = {
  'may-lanh': { bg: 'rgba(56, 189, 248, 0.16)', fg: '#38BDF8', grad: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)' },
  'may-giat': { bg: 'rgba(56, 189, 248, 0.16)', fg: '#38BDF8', grad: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)' },
  'tu-lanh': { bg: 'rgba(56, 189, 248, 0.16)', fg: '#38BDF8', grad: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)' },
  'nuoc-nong': { bg: 'rgba(56, 189, 248, 0.16)', fg: '#38BDF8', grad: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)' },
  'hut-mui': { bg: 'rgba(56, 189, 248, 0.16)', fg: '#38BDF8', grad: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)' },
  quat: { bg: 'rgba(56, 189, 248, 0.16)', fg: '#38BDF8', grad: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)' },
  'loc-khong-khi': { bg: 'rgba(56, 189, 248, 0.16)', fg: '#38BDF8', grad: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)' },
};

export const toneOf = (cat, isDark = false) => {
  const map = isDark ? CAT_TONE_DARK : CAT_TONE;
  return map[cat] || map['may-lanh'];
};

export const STATUS_META = {
  pending: { label: 'Chờ thợ nhận', fg: '#B45309', bg: '#FEF3C7' },
  confirmed: { label: 'Thợ đã nhận', fg: '#0062E0', bg: '#DBEAFE' },
  onway: { label: 'Thợ đang đến', fg: '#0284C7', bg: '#E0F2FE' },
  diagnosing: { label: 'Đang kiểm tra', fg: '#B45309', bg: '#FFFBEB' },
  quoted: { label: 'Chờ duyệt báo giá', fg: '#B45309', bg: '#FEF3C7' },
  repairing: { label: 'Đang thực hiện', fg: '#0062E0', bg: '#DBEAFE' },
  done: { label: 'Hoàn thành', fg: '#059669', bg: '#ECFDF5' },
  cancelled: { label: 'Đã huỷ', fg: '#DC2626', bg: '#FEF2F2' },
};

export const STATUS_META_DARK = {
  pending: { label: 'Chờ thợ nhận', fg: '#FDE68A', bg: 'rgba(251, 191, 36, 0.18)' },
  confirmed: { label: 'Thợ đã nhận', fg: '#93C5FD', bg: 'rgba(59, 130, 246, 0.20)' },
  onway: { label: 'Thợ đang đến', fg: '#7DD3FC', bg: 'rgba(56, 189, 248, 0.20)' },
  diagnosing: { label: 'Đang kiểm tra', fg: '#FDE68A', bg: 'rgba(251, 191, 36, 0.18)' },
  quoted: { label: 'Chờ duyệt báo giá', fg: '#FDE68A', bg: 'rgba(251, 191, 36, 0.18)' },
  repairing: { label: 'Đang thực hiện', fg: '#93C5FD', bg: 'rgba(59, 130, 246, 0.20)' },
  done: { label: 'Hoàn thành', fg: '#6EE7B7', bg: 'rgba(52, 211, 153, 0.20)' },
  cancelled: { label: 'Đã huỷ', fg: '#FCA5A5', bg: 'rgba(239, 68, 68, 0.20)' },
};

export const getStatusMeta = (status, isDark = false) => {
  const map = isDark ? STATUS_META_DARK : STATUS_META;
  return map[status] || map.pending;
};


