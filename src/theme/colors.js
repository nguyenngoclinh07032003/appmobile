import { Platform } from 'react-native';

// Bảng màu sáng chuẩn Thiết kế Doanh nghiệp Tối giản (Blue & White)
export const LIGHT_COLORS = {
  primary: '#0062E0',        // Xanh dương chủ đạo (Royal Corporate Blue)
  primaryDark: '#004CB8',    // Xanh đậm
  primarySoft: '#EBF3FF',    // Xanh nhạt tinh khiết
  navy: '#0052CC',           // Xanh đậm thanh lịch
  navy2: '#0844A4',          // Xanh đậm phụ
  gold: '#F59E0B',           // Vàng chuẩn cho Cảnh báo (Alert / Warning)
  goldSoft: '#FEF3C7',       // Nền vàng cảnh báo nhạt
  goldInk: '#B45309',        // Chữ vàng nâu đậm dễ đọc
  ink: '#0F172A',            // Chữ đen xám đậm dễ đọc
  ink2: '#334155',           // Chữ phụ
  muted: '#64748B',          // Chữ mờ
  faint: '#94A3B8',          // Viền mờ
  line: '#E2E8F0',           // Đường kẻ viền xám sáng
  bg: '#F8FAFC',             // Nền trang xám trắng mát mắt
  card: '#FFFFFF',           // Nền thẻ trắng tinh
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
};

// Bảng màu Dark Mode cao cấp (Midnight Obsidian / Slate Navy)
export const DARK_COLORS = {
  primary: '#3B82F6',        // Xanh sáng rõ trên nền tối
  primaryDark: '#1D4ED8',    // Xanh đậm phụ
  primarySoft: '#1E293B',    // Soft card / chip background
  navy: '#0F172A',           // Header navy deep slate
  navy2: '#0A0F1D',          // Navy siêu đậm
  gold: '#FBBF24',           // Vàng sáng
  goldSoft: '#292524',       // Nền vàng tối
  goldInk: '#FDE68A',        // Chữ vàng sáng
  ink: '#F8FAFC',            // Chữ trắng sáng (Slate 50)
  ink2: '#CBD5E1',           // Chữ phụ (Slate 300)
  muted: '#94A3B8',          // Chữ mờ (Slate 400)
  faint: '#475569',          // Viền mờ (Slate 600)
  line: '#334155',           // Đường viền (Slate 700)
  bg: '#0B1120',             // Nền app tối sâu (Midnight Navy)
  card: '#1E293B',           // Nền thẻ tối (Slate 800)
  red: '#F87171',            // Đỏ sáng
  redSoft: '#450A0A',        // Nền đỏ tối
  green: '#10B981',          // Xanh lá sáng
  greenSoft: '#064E3B',      // Nền xanh lá tối
  orange: '#F59E0B',         // Cam sáng
  orangeSoft: '#451A03',     // Nền cam tối
  purple: '#60A5FA',         // Xanh dương sáng
  purpleSoft: '#1E293B',     // Nền xanh tối
  cyan: '#38BDF8',           // Cyan sáng
  cyanSoft: '#082F49',       // Nền cyan tối
};

export const C = { ...LIGHT_COLORS };

export const applyTheme = (isDark) => {
  const target = isDark ? DARK_COLORS : LIGHT_COLORS;
  Object.assign(C, target);
  return C;
};

export const CAT_TONE = {
  'may-lanh': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'may-giat': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'tu-lanh': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'nuoc-nong': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'hut-mui': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  quat: { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
  'loc-khong-khi': { bg: '#EBF3FF', fg: '#0062E0', grad: 'linear-gradient(135deg, #F0F6FF 0%, #DDEBFF 100%)' },
};

export const toneOf = (cat) => CAT_TONE[cat] || CAT_TONE['may-lanh'];

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
