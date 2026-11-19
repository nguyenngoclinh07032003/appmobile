// Tiện ích lọc & sắp xếp đơn hàng theo thời gian (ngày hẹn, ca hẹn, thứ tự mới/cũ).
// Toàn bộ phép tính ngày sử dụng UTC trên chuỗi 'YYYY-MM-DD' để không bị lệch múi giờ thiết bị.

import { toVnParts, vnDateKey } from './vnTime.js';
import { parseSlotToMinutes } from './dateTime.js';

export const ACTIVITY_TIME_PRESETS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'upcoming', label: 'Sắp tới' },
  { id: '7d', label: '7 ngày qua' },
  { id: 'month', label: 'Tháng này' },
];

export const ACTIVITY_SLOT_PERIODS = [
  { id: 'all', label: 'Tất cả ca' },
  { id: 'morning', label: 'Sáng (08h–12h)' },
  { id: 'afternoon', label: 'Chiều (12h–18h)' },
  { id: 'evening', label: 'Tối (18h–20h)' },
];

export const ACTIVITY_SORT_OPTIONS = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'oldest', label: 'Cũ nhất' },
];

export const DEFAULT_ACTIVITY_TIME_FILTER = {
  preset: 'all',
  customFrom: null,
  customTo: null,
  slotPeriod: 'all',
  sort: 'newest',
};

const pad2 = (n) => String(n).padStart(2, '0');

const parseYmdParts = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
};

export function shiftYmd(ymd, deltaDays) {
  const p = parseYmdParts(ymd);
  if (!p) return ymd;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + deltaDays));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function monthBoundsOfYmd(ymd) {
  const p = parseYmdParts(ymd);
  if (!p) return { from: null, to: null };
  const lastDay = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  const prefix = `${p.year}-${pad2(p.month)}`;
  return { from: `${prefix}-01`, to: `${prefix}-${pad2(lastDay)}` };
}

export function shiftYearMonth(year, month, deltaMonths) {
  const d = new Date(Date.UTC(year, (month - 1) + deltaMonths, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function formatDmyFromYmd(ymd) {
  const p = parseYmdParts(ymd);
  if (!p) return '';
  return `${pad2(p.day)}/${pad2(p.month)}/${p.year}`;
}

export function formatShortDmFromYmd(ymd) {
  const p = parseYmdParts(ymd);
  if (!p) return '';
  return `${pad2(p.day)}/${pad2(p.month)}`;
}

export function resolveOrderDateKey(order, fallbackNowMs = Date.now()) {
  if (order?.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(String(order.dateKey))) {
    return String(order.dateKey);
  }
  const label = String(order?.dateLabel || '');
  const fullMatch = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(label);
  if (fullMatch) {
    return `${fullMatch[3]}-${pad2(fullMatch[2])}-${pad2(fullMatch[1])}`;
  }
  const shortMatch = /(\d{1,2})\/(\d{1,2})/.exec(label);
  const refMs = order?.preferredTimeAt || order?.createdAt || fallbackNowMs;
  if (shortMatch) {
    const year = toVnParts(refMs)?.year || toVnParts(fallbackNowMs).year;
    return `${year}-${pad2(shortMatch[2])}-${pad2(shortMatch[1])}`;
  }
  return vnDateKey(refMs);
}

export function resolveOrderSlotPeriod(order) {
  const mins = parseSlotToMinutes(order?.slot, -1);
  if (mins < 0) return 'unknown';
  if (mins < 720) return 'morning';
  if (mins < 1080) return 'afternoon';
  return 'evening';
}

export function getTimePresetBounds(preset, nowYmd, customFrom = null, customTo = null) {
  switch (preset) {
    case 'today':
      return { from: nowYmd, to: nowYmd };
    case 'upcoming':
      return { from: shiftYmd(nowYmd, 1), to: null };
    case '7d':
      return { from: shiftYmd(nowYmd, -6), to: nowYmd };
    case 'month':
      return monthBoundsOfYmd(nowYmd);
    case 'custom': {
      const f = parseYmdParts(customFrom) ? customFrom : null;
      const t = parseYmdParts(customTo) ? customTo : null;
      if (f && t) {
        return f <= t ? { from: f, to: t } : { from: t, to: f };
      }
      const single = f || t;
      return single ? { from: single, to: single } : { from: null, to: null };
    }
    case 'all':
    default:
      return { from: null, to: null };
  }
}

export function matchesTimeFilter(order, filterState = DEFAULT_ACTIVITY_TIME_FILTER, nowYmd = vnDateKey()) {
  const f = filterState || DEFAULT_ACTIVITY_TIME_FILTER;
  const { from, to } = getTimePresetBounds(f.preset, nowYmd, f.customFrom, f.customTo);
  const dk = resolveOrderDateKey(order);
  if (from && dk < from) return false;
  if (to && dk > to) return false;
  if (f.slotPeriod && f.slotPeriod !== 'all') {
    if (resolveOrderSlotPeriod(order) !== f.slotPeriod) return false;
  }
  return true;
}

export function sortOrdersByTime(orders = [], sort = 'newest') {
  const dir = sort === 'oldest' ? 1 : -1;
  return [...(orders || [])].sort((a, b) => {
    const da = resolveOrderDateKey(a);
    const db = resolveOrderDateKey(b);
    if (da !== db) return (da < db ? -1 : 1) * dir;
    const sa = parseSlotToMinutes(a?.slot, 0);
    const sb = parseSlotToMinutes(b?.slot, 0);
    if (sa !== sb) return (sa - sb) * dir;
    const ca = Number(a?.createdAt) || 0;
    const cb = Number(b?.createdAt) || 0;
    if (ca !== cb) return (ca - cb) * dir;
    return 0;
  });
}

export function filterAndSortOrders(orders = [], filterState = DEFAULT_ACTIVITY_TIME_FILTER, nowYmd = vnDateKey()) {
  const f = filterState || DEFAULT_ACTIVITY_TIME_FILTER;
  const filtered = (orders || []).filter((o) => matchesTimeFilter(o, f, nowYmd));
  return sortOrdersByTime(filtered, f.sort || 'newest');
}

export function isTimeFilterActive(filterState) {
  if (!filterState) return false;
  return (
    (Boolean(filterState.preset) && filterState.preset !== 'all') ||
    (Boolean(filterState.slotPeriod) && filterState.slotPeriod !== 'all')
  );
}

const SLOT_SUMMARY_LABEL = {
  morning: 'Ca sáng',
  afternoon: 'Ca chiều',
  evening: 'Ca tối',
};

export function describeTimeFilter(filterState = DEFAULT_ACTIVITY_TIME_FILTER, nowYmd = vnDateKey()) {
  const f = filterState || DEFAULT_ACTIVITY_TIME_FILTER;
  let base = 'Tất cả thời gian';
  if (f.preset === 'today') {
    base = `Hôm nay (${formatShortDmFromYmd(nowYmd)})`;
  } else if (f.preset === 'upcoming') {
    base = 'Sắp tới';
  } else if (f.preset === '7d') {
    base = '7 ngày qua';
  } else if (f.preset === 'month') {
    const p = parseYmdParts(nowYmd);
    base = p ? `Tháng ${pad2(p.month)}/${p.year}` : 'Tháng này';
  } else if (f.preset === 'custom') {
    const { from, to } = getTimePresetBounds('custom', nowYmd, f.customFrom, f.customTo);
    if (from && to) {
      if (from === to) {
        base = `Ngày ${formatDmyFromYmd(from)}`;
      } else if (from.slice(0, 4) === to.slice(0, 4)) {
        base = `${formatShortDmFromYmd(from)} – ${formatDmyFromYmd(to)}`;
      } else {
        base = `${formatDmyFromYmd(from)} – ${formatDmyFromYmd(to)}`;
      }
    }
  } else if (f.slotPeriod && f.slotPeriod !== 'all') {
    base = 'Tất cả ngày';
  }

  const slotSuffix = f.slotPeriod && f.slotPeriod !== 'all' && SLOT_SUMMARY_LABEL[f.slotPeriod]
    ? ` · ${SLOT_SUMMARY_LABEL[f.slotPeriod]}`
    : '';
  return `${base}${slotSuffix}`;
}

export function buildCalendarMonth(year, month) {
  const leadBlank = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < leadBlank; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, ymd: `${year}-${pad2(month)}-${pad2(day)}` });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
