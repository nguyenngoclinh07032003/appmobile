import { Platform } from 'react-native';

// Bảng màu chuẩn Thiết kế Doanh nghiệp Tối giản: 2 màu chủ đạo XANH DƯƠNG & TRẮNG (Blue & White)
export const C = {
  primary: '#0062E0',        // Xanh dương chủ đạo (Royal Corporate Blue)
  primaryDark: '#004CB8',    // Xanh đậm
  primarySoft: '#EBF3FF',    // Xanh nhạt tinh khiết
  navy: '#0052CC',           // Xanh đậm thanh lịch
  navy2: '#0844A4',          // Xanh đậm phụ
  gold: '#0062E0',           // Thay toàn bộ màu vàng chói thành Xanh chủ đạo
  goldSoft: '#F0F6FF',       // Nền xanh trắng nhạt
  goldInk: '#0844A4',        // Chữ xanh đậm
  ink: '#0F172A',            // Chữ đen xám đậm dễ đọc
  ink2: '#334155',           // Chữ phụ
  muted: '#64748B',          // Chữ mờ
  faint: '#94A3B8',          // Viền mờ
  line: '#E2E8F0',           // Đường kẻ viền xám sáng
  bg: '#F8FAFC',             // Nền trang xám trắng mát mắt
  card: '#FFFFFF',           // Nền thẻ trắng tinh
  red: '#DC2626',            // Đỏ cảnh báo / huỷ đơn
  redSoft: '#FEF2F2',        // Nền đỏ nhạt
  green: '#059669',          // Xanh ngọc cho trạng thái thành công
  greenSoft: '#ECFDF5',      // Nền xanh ngọc nhạt
  orange: '#0284C7',         // Chuyển cam thành Sky Blue
  orangeSoft: '#F0F8FF',     // Nền sky blue nhạt
  purple: '#0062E0',         // Chuyển tím thành Xanh chủ đạo
  purpleSoft: '#EBF3FF',     // Nền xanh nhạt
  cyan: '#0284C7',           // Xanh Cyan
  cyanSoft: '#F0F9FF',       // Nền cyan nhạt
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
  pending: { label: 'Chờ thợ nhận', fg: '#0062E0', bg: '#EFF6FF' },
  confirmed: { label: 'Thợ đã nhận', fg: '#0062E0', bg: '#DBEAFE' },
  onway: { label: 'Thợ đang đến', fg: '#0284C7', bg: '#E0F2FE' },
  diagnosing: { label: 'Đang kiểm tra', fg: '#0369A1', bg: '#E0F2FE' },
  quoted: { label: 'Chờ duyệt báo giá', fg: '#0B4FB8', bg: '#EFF6FF' },
  repairing: { label: 'Đang thực hiện', fg: '#0062E0', bg: '#DBEAFE' },
  done: { label: 'Hoàn thành', fg: '#059669', bg: '#ECFDF5' },
  cancelled: { label: 'Đã huỷ', fg: '#64748B', bg: '#F1F5F9' },
};

