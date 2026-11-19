import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_TIME_PRESETS,
  DEFAULT_ACTIVITY_TIME_FILTER,
  resolveOrderDateKey,
  resolveOrderSlotPeriod,
  getTimePresetBounds,
  matchesTimeFilter,
  sortOrdersByTime,
  filterAndSortOrders,
  isTimeFilterActive,
  describeTimeFilter,
  buildCalendarMonth,
} from '../src/utils/activityFilter.js';

test('activityFilter: resolveOrderDateKey đọc đúng từ dateKey, dateLabel và fallback createdAt', () => {
  assert.equal(resolveOrderDateKey({ dateKey: '2026-11-18', dateLabel: '18/11/2026' }), '2026-11-18');
  assert.equal(resolveOrderDateKey({ dateLabel: '16/11/2026' }), '2026-11-16');
  const createdNov = Date.UTC(2026, 10, 10, 3, 0, 0); // 10:00 GMT+7 10/11/2026
  assert.equal(resolveOrderDateKey({ dateLabel: '5/11', createdAt: createdNov }), '2026-11-05');
  assert.equal(resolveOrderDateKey({ createdAt: createdNov }), '2026-11-10');
});

test('activityFilter: các preset all, today, upcoming, 7d, month, custom (không có 30d)', () => {
  const nowYmd = '2026-11-19';
  assert.equal(ACTIVITY_TIME_PRESETS.some((p) => p.id === '30d'), false);
  assert.deepEqual(getTimePresetBounds('all', nowYmd), { from: null, to: null });
  assert.deepEqual(getTimePresetBounds('today', nowYmd), { from: '2026-11-19', to: '2026-11-19' });
  assert.deepEqual(getTimePresetBounds('upcoming', nowYmd), { from: '2026-11-20', to: null });
  assert.deepEqual(getTimePresetBounds('7d', nowYmd), { from: '2026-11-13', to: '2026-11-19' });
  assert.deepEqual(getTimePresetBounds('month', nowYmd), { from: '2026-11-01', to: '2026-11-30' });

  // Custom: 1 ngày, nhiều ngày, chọn ngược ngày tự đảo
  assert.deepEqual(getTimePresetBounds('custom', nowYmd, '2026-11-18', null), {
    from: '2026-11-18',
    to: '2026-11-18',
  });
  assert.deepEqual(getTimePresetBounds('custom', nowYmd, '2026-11-16', '2026-11-18'), {
    from: '2026-11-16',
    to: '2026-11-18',
  });
  assert.deepEqual(getTimePresetBounds('custom', nowYmd, '2026-11-22', '2026-11-16'), {
    from: '2026-11-16',
    to: '2026-11-22',
  });
});

test('activityFilter: lọc kết hợp khoảng ngày và khung giờ (morning, afternoon, evening)', () => {
  const nowYmd = '2026-11-19';
  const orders = [
    { code: 'A', dateKey: '2026-11-18', slot: '08h00 - 10h00' },
    { code: 'B', dateKey: '2026-11-18', slot: '14h00 - 16h00' },
    { code: 'C', dateKey: '2026-11-19', slot: '18h00 - 20h00' },
    { code: 'D', dateKey: '2026-11-21', slot: '10h00 - 12h00' },
    { code: 'E', dateKey: '2026-10-15', slot: '08h00 - 10h00' },
  ];

  assert.equal(resolveOrderSlotPeriod(orders[0]), 'morning');
  assert.equal(resolveOrderSlotPeriod(orders[1]), 'afternoon');
  assert.equal(resolveOrderSlotPeriod(orders[2]), 'evening');

  assert.deepEqual(
    filterAndSortOrders(orders, { ...DEFAULT_ACTIVITY_TIME_FILTER, preset: 'all' }, nowYmd).map((o) => o.code),
    ['D', 'C', 'B', 'A', 'E'],
  );
  assert.deepEqual(
    filterAndSortOrders(orders, { ...DEFAULT_ACTIVITY_TIME_FILTER, preset: 'today' }, nowYmd).map((o) => o.code),
    ['C'],
  );
  assert.deepEqual(
    filterAndSortOrders(orders, { ...DEFAULT_ACTIVITY_TIME_FILTER, preset: 'upcoming' }, nowYmd).map((o) => o.code),
    ['D'],
  );
  assert.deepEqual(
    filterAndSortOrders(orders, { ...DEFAULT_ACTIVITY_TIME_FILTER, preset: '7d', slotPeriod: 'afternoon' }, nowYmd).map((o) => o.code),
    ['B'],
  );
  assert.deepEqual(
    filterAndSortOrders(orders, {
      preset: 'custom',
      customFrom: '2026-11-18',
      customTo: '2026-11-19',
      slotPeriod: 'morning',
      sort: 'newest',
    }, nowYmd).map((o) => o.code),
    ['A'],
  );
  assert.equal(
    matchesTimeFilter(orders[2], { ...DEFAULT_ACTIVITY_TIME_FILTER, preset: 'month', slotPeriod: 'evening' }, nowYmd),
    true,
  );
});

test('activityFilter: sortOrdersByTime sắp xếp đúng theo ngày, khung giờ và createdAt', () => {
  const sample = [
    { code: 'O1', dateKey: '2026-11-18', slot: '08h00 - 10h00', createdAt: 100 },
    { code: 'O2', dateKey: '2026-11-18', slot: '08h00 - 10h00', createdAt: 200 },
    { code: 'O3', dateKey: '2026-11-18', slot: '14h00 - 16h00', createdAt: 50 },
    { code: 'O4', dateKey: '2026-11-19', slot: '08h00 - 10h00', createdAt: 10 },
  ];

  assert.deepEqual(
    sortOrdersByTime(sample, 'newest').map((o) => o.code),
    ['O4', 'O3', 'O2', 'O1'],
  );
  assert.deepEqual(
    sortOrdersByTime(sample, 'oldest').map((o) => o.code),
    ['O1', 'O2', 'O3', 'O4'],
  );
});

test('activityFilter: buildCalendarMonth tạo đúng lưới lịch tháng 11/2026 và tháng 02/2028 (năm nhuận)', () => {
  // Tháng 11/2026: ngày 01/11/2026 là Chủ nhật → 6 ô trống đầu tuần (T2..T7)
  const nov2026 = buildCalendarMonth(2026, 11);
  assert.equal(nov2026[0].slice(0, 6).every((c) => c === null), true);
  assert.deepEqual(nov2026[0][6], { day: 1, ymd: '2026-11-01' });
  const novDays = nov2026.flat().filter(Boolean);
  assert.equal(novDays.length, 30);
  assert.equal(novDays[novDays.length - 1].ymd, '2026-11-30');

  // Năm nhuận 02/2028 có 29 ngày
  const feb2028 = buildCalendarMonth(2028, 2);
  const febDays = feb2028.flat().filter(Boolean);
  assert.equal(febDays.length, 29);
  assert.equal(febDays[febDays.length - 1].ymd, '2028-02-29');
});

test('activityFilter: isTimeFilterActive và describeTimeFilter hoạt động chính xác', () => {
  const nowYmd = '2026-11-19';
  assert.equal(isTimeFilterActive(DEFAULT_ACTIVITY_TIME_FILTER), false);
  assert.equal(isTimeFilterActive({ ...DEFAULT_ACTIVITY_TIME_FILTER, sort: 'oldest' }), false);
  assert.equal(isTimeFilterActive({ ...DEFAULT_ACTIVITY_TIME_FILTER, preset: '7d' }), true);
  assert.equal(isTimeFilterActive({ ...DEFAULT_ACTIVITY_TIME_FILTER, slotPeriod: 'morning' }), true);

  assert.equal(describeTimeFilter({ ...DEFAULT_ACTIVITY_TIME_FILTER, preset: 'today' }, nowYmd), 'Hôm nay (19/11)');
  assert.equal(
    describeTimeFilter({
      preset: 'custom',
      customFrom: '2026-11-16',
      customTo: '2026-11-18',
      slotPeriod: 'afternoon',
      sort: 'newest',
    }, nowYmd),
    '16/11 – 18/11/2026 · Ca chiều',
  );
});
