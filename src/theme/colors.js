import { Platform } from 'react-native';

// Bảng màu + token dùng chung — Thợ HRMSS (navy / gold / xanh dịch vụ)
export const C = {
  primary: '#1A5FFF',
  primaryDark: '#0A3FD4',
  primarySoft: '#EAF1FF',
  navy: '#071A3A',
  navy2: '#102A5C',
  gold: '#FFC83D',
  goldSoft: '#FFF7E0',
  goldInk: '#8A5A00',
  ink: '#0B1220',
  ink2: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  bg: '#EFF3F9',
  card: '#FFFFFF',
  red: '#E5372B',
  redSoft: '#FDECEA',
  green: '#0E9F6E',
  greenSoft: '#E6F7EF',
  orange: '#D97706',
  orangeSoft: '#FFF4E0',
  purple: '#6D28D9',
  purpleSoft: '#F1EAFE',
  cyan: '#0891B2',
  cyanSoft: '#E2F6FB',
};

export const CAT_TONE = {
  'may-lanh': { bg: '#E6F0FF', fg: '#1A5FFF', grad: 'linear-gradient(135deg, #E8F1FF 0%, #D3E4FF 100%)' },
  'may-giat': { bg: '#F1EAFE', fg: '#6D28D9', grad: 'linear-gradient(135deg, #F3ECFF 0%, #E4D4FF 100%)' },
  'tu-lanh': { bg: '#E3F7F1', fg: '#0E9F6E', grad: 'linear-gradient(135deg, #E6F9F3 0%, #CCF0E3 100%)' },
  'nuoc-nong': { bg: '#FFF0E3', fg: '#D97706', grad: 'linear-gradient(135deg, #FFF3E6 0%, #FFE2C6 100%)' },
  'hut-mui': { bg: '#FDEBEC', fg: '#E5372B', grad: 'linear-gradient(135deg, #FEECEE 0%, #FAD6D9 100%)' },
  quat: { bg: '#E2F6FB', fg: '#0891B2', grad: 'linear-gradient(135deg, #E5F7FC 0%, #C9EEF8 100%)' },
  'loc-khong-khi': { bg: '#EEF6E2', fg: '#65A30D', grad: 'linear-gradient(135deg, #F1F8E6 0%, #DCEFC4 100%)' },
};

export const toneOf = (cat) => CAT_TONE[cat] || CAT_TONE['may-lanh'];

export const STATUS_META = {
  pending: { label: 'Chờ thợ nhận', fg: C.orange, bg: C.orangeSoft },
  confirmed: { label: 'Thợ đã nhận', fg: C.primary, bg: C.primarySoft },
  onway: { label: 'Thợ đang đến', fg: C.cyan, bg: C.cyanSoft },
  diagnosing: { label: 'Đang kiểm tra', fg: '#0369A1', bg: '#E0F2FE' },
  quoted: { label: 'Chờ duyệt báo giá', fg: C.goldInk, bg: C.goldSoft },
  repairing: { label: 'Đang thực hiện', fg: C.purple, bg: C.purpleSoft },
  done: { label: 'Hoàn thành', fg: C.green, bg: C.greenSoft },
  cancelled: { label: 'Đã huỷ', fg: C.muted, bg: '#EEF2F6' },
};

