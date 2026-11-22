// Chấm công của thợ (APP_THO_CHAM_CONG_2026-11-22): body vào ca, ghi chú, lỗi backend, tháng, link thông báo.
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-loader.mjs';

const {
  buildCheckInBody, noteError, checkInErrorInfo, monthRange, shiftMonth, currentVnMonth, dayLabel, vnDateText, vnClock,
  shiftTimeText, entriesOfDay, sortDaysDesc, ATTENDANCE_NOTIF_TYPES,
} = await import('../src/utils/attendance.js');
const { viServerMessage, viNotification, viFieldError } = await import('../src/utils/viText.js');
const { mapBackendNotification } = await import('../src/services/syncService.js');

test('Chấm công: body vào ca đúng hợp đồng backend (strict, không shiftId, không note rỗng)', () => {
  const loc = { lat: 21.0285, lng: 105.8542, accuracy: 12.4, label: 'GPS ±12m', at: 1 };
  assert.deepEqual(buildCheckInBody('15', loc, '  '), {
    technicianShiftId: 15, latitude: 21.0285, longitude: 105.8542, accuracyM: 12,
  });
  assert.deepEqual(buildCheckInBody(15, loc, '  Vào ca tại nhà khách '), {
    technicianShiftId: 15, latitude: 21.0285, longitude: 105.8542, accuracyM: 12, note: 'Vào ca tại nhà khách',
  });
  // Không có độ chính xác -> bỏ hẳn accuracyM.
  const noAcc = buildCheckInBody(7, { lat: 1, lng: 2 }, null);
  assert.equal('accuracyM' in noAcc, false);
  assert.equal('shiftId' in noAcc, false);
  assert.equal(typeof noAcc.latitude, 'number');
});

test('Chấm công: ghi chú rỗng được bỏ qua, 1–2 ký tự hoặc quá 500 ký tự bị chặn trước khi gửi', () => {
  assert.equal(noteError(''), null);
  assert.equal(noteError('   '), null);
  assert.ok(noteError('ab'));
  assert.equal(noteError('abc'), null);
  assert.equal(noteError('x'.repeat(500)), null);
  assert.ok(noteError('x'.repeat(501)));
});

test('Chấm công: lỗi backend -> câu tiếng Việt, trùng ca / ca hết hiệu lực thì tải lại', () => {
  assert.deepEqual(checkInErrorInfo({ code: 'ATTENDANCE_SHIFT_DUPLICATE' }), { text: 'Bạn đã vào ca này rồi.', reload: true });
  assert.equal(checkInErrorInfo({ code: 'TECHNICIAN_SHIFT_NOT_USABLE' }).reload, true);
  assert.equal(checkInErrorInfo({ code: 'ATTENDANCE_SHIFT_LIMIT' }).text, 'Đã đủ 6 ca trong ngày.');
  assert.equal(checkInErrorInfo({ code: 'ATTENDANCE_DAY_OFF' }).text, 'Hôm nay bạn được đánh dấu nghỉ.');
  assert.equal(checkInErrorInfo({ code: 'ATTENDANCE_LOCKED' }).text, 'Ngày công đã chốt, không chấm được.');
  for (const code of ['FORBIDDEN', 'ATTENDANCE_NOT_APPLICABLE']) {
    assert.equal(checkInErrorInfo({ code }).text, 'Tài khoản chưa được phép chấm công. Liên hệ văn phòng.');
  }
  assert.equal(checkInErrorInfo({ code: 'NETWORK_ERROR', message: 'Không kết nối được máy chủ.' }).text, 'Không kết nối được máy chủ.');
  // apiRequest Việt hoá message tiếng Anh của backend theo mã lỗi.
  assert.equal(viServerMessage('Shift already recorded.', 'ATTENDANCE_SHIFT_DUPLICATE', 409), 'Bạn đã vào ca này rồi.');
  assert.equal(viServerMessage('Attendance day is locked.', 'ATTENDANCE_LOCKED', 422), 'Ngày công đã chốt, không chấm được.');
  assert.equal(viFieldError({ field: 'note', message: 'String must contain at least 3 character(s)' }).startsWith('Ghi chú:'), true);
});

test('Chấm công: tháng, khoảng ngày, nhãn ngày / giờ theo giờ Việt Nam', () => {
  assert.deepEqual(monthRange({ year: 2026, month: 11 }), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(monthRange({ year: 2028, month: 2 }), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  // 2026-11-30 17:30 UTC = 2026-12-01 00:30 giờ VN.
  assert.deepEqual(currentVnMonth(Date.UTC(2026, 10, 30, 17, 30)), { year: 2026, month: 12 });
  assert.equal(dayLabel('2026-11-22'), 'CN, 22/11');
  assert.equal(dayLabel('2026-11-23'), 'T2, 23/11');
  assert.equal(vnDateText('2026-11-22'), '22/11/2026');
  assert.equal(vnClock('2026-11-22T01:05:00.000Z'), '08:05');
  assert.equal(vnClock(null), '');
  assert.equal(shiftTimeText({ startTime: '22:00', endTime: '06:00', crossesMidnight: true }), '22:00 – 06:00 (qua đêm)');
  assert.equal(shiftTimeText({ startTime: '08:00', endTime: '17:00', crossesMidnight: false }), '08:00 – 17:00');
});

test('Chấm công: trạng thái ca hôm nay lấy từ bảng công theo technicianShiftId, ngày mới nhất trước', () => {
  const grid = {
    days: [
      { date: '2026-11-21', shifts: [{ entryId: 1, technicianShiftId: 9, status: 'approved' }] },
      { date: '2026-11-22', shifts: [{ entryId: 2, technicianShiftId: 15, status: 'pending' }, { entryId: 3, technicianShiftId: null }] },
    ],
  };
  const today = entriesOfDay(grid, '2026-11-22');
  assert.equal(today.get('15').status, 'pending');
  assert.equal(today.has('9'), false);
  assert.equal(entriesOfDay(null, '2026-11-22').size, 0);
  assert.deepEqual(sortDaysDesc(grid.days).map((d) => d.date), ['2026-11-22', '2026-11-21']);
});

test('Chấm công: thông báo ca / chấm công mở màn Chấm công và có tiêu đề tiếng Việt', () => {
  const types = ['SHIFT_ASSIGNED', 'SHIFT_UPDATED', 'SHIFT_CANCELLED', 'ATTENDANCE_APPROVED', 'ATTENDANCE_REJECTED',
    'VIOLATION_RECORDED', 'ATTENDANCE_PERIOD_LOCKED'];
  for (const type of types) {
    assert.ok(ATTENDANCE_NOTIF_TYPES.has(type), type);
    const n = mapBackendNotification({ notification_id: 1, type, title: 'x', body: 'y', created_at: '2026-11-22T01:00:00Z' }, [], 'tech-job');
    assert.deepEqual(n.link, { name: 'tech-attendance', params: {} }, type);
    assert.ok(/[à-ỹđ]/i.test(viNotification({ type }).title), type);
  }
  // Thông báo khác không bị đổi link.
  const other = mapBackendNotification({ notification_id: 2, type: 'HANDOVER_CONFIRMED', title: 'a', body: 'b' }, [], 'tech-job');
  assert.deepEqual(other.link, { name: 'tech-handovers', params: { tab: 'history' } });
});
