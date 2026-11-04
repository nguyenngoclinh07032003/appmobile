// Bảng màu + token dùng chung — Thợ ĐMX (navy / gold / xanh dịch vụ)
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
  line: '#E4EAF3',
  bg: '#EEF2F8',
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
  'may-lanh': { bg: '#E6F0FF', fg: '#1A5FFF' },
  'may-giat': { bg: '#F1EAFE', fg: '#6D28D9' },
  'tu-lanh': { bg: '#E3F7F1', fg: '#0E9F6E' },
  'nuoc-nong': { bg: '#FFF0E3', fg: '#D97706' },
  'hut-mui': { bg: '#FDEBEC', fg: '#E5372B' },
  quat: { bg: '#E2F6FB', fg: '#0891B2' },
  'loc-khong-khi': { bg: '#EEF6E2', fg: '#65A30D' },
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

export const R = { sm: 12, md: 16, lg: 20, xl: 28 };

export const shadow = {
  sm: { boxShadow: '0px 1px 2px rgba(7, 26, 58, 0.05), 0px 2px 8px rgba(7, 26, 58, 0.04)' },
  md: { boxShadow: '0px 4px 12px rgba(7, 26, 58, 0.08), 0px 1px 3px rgba(7, 26, 58, 0.04)' },
  lg: { boxShadow: '0px 12px 32px rgba(7, 26, 58, 0.14), 0px 2px 6px rgba(7, 26, 58, 0.06)' },
  primary: { boxShadow: '0px 8px 20px rgba(26, 95, 255, 0.32)' },
  gold: { boxShadow: '0px 6px 16px rgba(255, 200, 61, 0.35)' },
};
