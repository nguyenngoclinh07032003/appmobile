import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTENDANCE_NOTIF_TYPES,
  buildAttendanceNotifSignature,
  buildCheckInPayload,
  defaultAttendanceNotifIcon,
  findTodayShiftRecord,
  formatAttendanceCheckInError,
  formatVnDateDm,
  formatVnDateDmy,
  formatVnTimeHm,
  getMonthRange,
  getVnTodayInfo,
  getVnWeekdayInfo,
  isAttendanceNotifType,
  normalizeAttendanceResponse,
  normalizeViolationsResponse,
  shiftMonth,
  validateCheckInNote,
} from '../src/utils/attendance.js';

test('attendance: buildCheckInPayload gửi đúng camelCase, bỏ note rỗng, không gửi shiftId', () => {
  const withoutNote = buildCheckInPayload({
    technicianShiftId: 15,
    lat: 21.0285,
    lng: 105.8542,
    accuracy: 12,
    note: '   ',
  });
  assert.deepEqual(withoutNote, {
    technicianShiftId: 15,
    latitude: 21.0285,
    longitude: 105.8542,
    accuracyM: 12,
  });
  assert.equal('note' in withoutNote, false);
  assert.equal('shiftId' in withoutNote, false);

  const withNote = buildCheckInPayload({
    technicianShiftId: 15,
    lat: 21.0285,
    lng: 105.8542,
    accuracy: null,
    note: '  Vào ca tại nhà khách  ',
  });
  assert.deepEqual(withNote, {
    technicianShiftId: 15,
    latitude: 21.0285,
    longitude: 105.8542,
    note: 'Vào ca tại nhà khách',
  });
  assert.equal('accuracyM' in withNote, false);
  assert.equal('shiftId' in withNote, false);
});

test('attendance: validateCheckInNote cho phép bỏ trống hoặc 3-500 ký tự, chặn 1-2 ký tự', () => {
  assert.equal(validateCheckInNote(''), null);
  assert.equal(validateCheckInNote('   '), null);
  assert.equal(validateCheckInNote('ab'), 'Ghi chú nếu nhập phải từ 3 đến 500 ký tự.');
  assert.equal(validateCheckInNote('Vào ca'), null);
  assert.equal(validateCheckInNote('a'.repeat(501)), 'Ghi chú nếu nhập phải từ 3 đến 500 ký tự.');
});

test('attendance: formatAttendanceCheckInError ánh xạ đủ mã lỗi mục 2.2', () => {
  assert.deepEqual(formatAttendanceCheckInError({ status: 409, code: 'ATTENDANCE_SHIFT_DUPLICATE' }), {
    title: 'Đã vào ca',
    message: 'Bạn đã vào ca này rồi.',
    shouldRefetch: true,
  });
  assert.deepEqual(formatAttendanceCheckInError({ status: 422, code: 'TECHNICIAN_SHIFT_NOT_USABLE' }), {
    title: 'Ca không còn hiệu lực',
    message: 'Ca này không còn hiệu lực (đã hủy hoặc không phải ca hôm nay).',
    shouldRefetch: true,
  });
  assert.equal(formatAttendanceCheckInError({ status: 409, code: 'ATTENDANCE_SHIFT_LIMIT' }).message, 'Đã đủ 6 ca trong ngày.');
  assert.equal(formatAttendanceCheckInError({ status: 409, code: 'ATTENDANCE_DAY_OFF' }).message, 'Hôm nay bạn được đánh dấu nghỉ.');
  assert.equal(formatAttendanceCheckInError({ status: 422, code: 'ATTENDANCE_LOCKED' }).message, 'Ngày công đã chốt, không chấm được.');
  assert.equal(
    formatAttendanceCheckInError({ status: 403, code: 'ATTENDANCE_NOT_APPLICABLE' }).message,
    'Tài khoản chưa được phép chấm công. Liên hệ văn phòng.',
  );
  const valErr = formatAttendanceCheckInError({
    status: 400,
    code: 'VALIDATION_ERROR',
    errors: [{ field: 'note', message: 'note must be at least 3 characters' }],
  });
  assert.ok(valErr.message.includes('Ghi chú'));
  assert.equal(valErr.shouldRefetch, false);
});

test('attendance: hiển thị ngày/giờ theo giờ Việt Nam GMT+7 và khoảng ngày tháng', () => {
  assert.equal(formatVnTimeHm('2026-11-22T01:05:00.000Z'), '08:05');
  assert.equal(formatVnDateDmy('2026-11-22'), '22/11/2026');
  assert.equal(formatVnDateDm('2026-11-22'), '22/11');
  assert.deepEqual(getVnWeekdayInfo('2026-11-22', 'sunday'), { label: 'Chủ nhật', isSunday: true });
  assert.deepEqual(getVnWeekdayInfo('2026-11-23', 'weekday'), { label: 'Thứ 2', isSunday: false });
  assert.deepEqual(getMonthRange(2, 2028), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(shiftMonth(1, 2026, -1), { month: 12, year: 2025 });
  assert.deepEqual(shiftMonth(12, 2026, 1), { month: 1, year: 2027 });
  const today = getVnTodayInfo(Date.UTC(2026, 10, 22, 18, 0, 0)); // 01:00 sáng 23/11 giờ VN
  assert.equal(today.dateKey, '2026-11-23');
  assert.equal(today.dmy, '23/11/2026');
});

test('attendance: normalizeAttendanceResponse xử lý null/envelope và sắp xếp mới nhất trước', () => {
  assert.equal(normalizeAttendanceResponse(null), null);
  assert.equal(normalizeAttendanceResponse({ success: true, code: 'ATTENDANCE_ME', data: null }), null);

  const normalized = normalizeAttendanceResponse({
    user: { id: 40, fullName: 'Nguyễn Văn Thợ', employeeCode: 'TECH01' },
    days: [
      { attendanceId: 80, date: '2026-11-20', dayType: 'weekday', isDayOff: false, isLocked: true, shifts: [] },
      {
        attendanceId: 88,
        date: '2026-11-22',
        dayType: 'sunday',
        isDayOff: false,
        isLocked: false,
        shifts: [
          { entryId: 301, technicianShiftId: 15, status: 'pending', checkedInAt: '2026-11-22T01:05:00.000Z' },
        ],
      },
    ],
    summary: { approvedShifts: 10, pendingShifts: 1, rejectedShifts: 0, dayOffCount: 2, workedDays: 10 },
  });

  assert.equal(normalized.days[0].date, '2026-11-22');
  assert.equal(normalized.days[1].date, '2026-11-20');
  const rec = findTodayShiftRecord(normalized, '2026-11-22', 15);
  assert.equal(rec?.status, 'pending');
  assert.equal(findTodayShiftRecord(normalized, '2026-11-22', 99), null);
});

test('attendance: normalizeViolationsResponse giữ đúng tổng từ backend', () => {
  const res = normalizeViolationsResponse({
    items: [
      { id: 1, date: '2026-11-10', fineAmount: 50000, description: 'Đi trễ', createdAt: '2026-11-10T02:00:00Z' },
      { id: 2, date: '2026-11-15', fineAmount: 100000, description: 'Nghỉ không phép', createdAt: '2026-11-15T02:00:00Z' },
    ],
    summary: { count: 2, totalFine: 150000 },
  });
  assert.equal(res.items[0].id, 2);
  assert.equal(res.summary.count, 2);
  assert.equal(res.summary.totalFine, 150000);
});

test('attendance: nhận diện 7 notification type chấm công & icon mặc định', () => {
  const expected = [
    'SHIFT_ASSIGNED',
    'SHIFT_UPDATED',
    'SHIFT_CANCELLED',
    'ATTENDANCE_APPROVED',
    'ATTENDANCE_REJECTED',
    'VIOLATION_RECORDED',
    'ATTENDANCE_PERIOD_LOCKED',
  ];
  assert.equal(ATTENDANCE_NOTIF_TYPES.size, expected.length);
  expected.forEach((t) => {
    assert.equal(isAttendanceNotifType(t.toLowerCase()), true);
    assert.ok(defaultAttendanceNotifIcon(t));
  });
  assert.equal(isAttendanceNotifType('QUOTATION_SENT'), false);
});

test('attendance: buildAttendanceNotifSignature phân biệt được ID vượt 1->2 chữ số và bỏ qua thông báo ngoài chấm công', () => {
  const n9 = { id: 'notif-db-9', type: 'ATTENDANCE_APPROVED', at: 1700000000000 };
  const n10 = { id: 'notif-db-10', type: 'ATTENDANCE_REJECTED', at: 1700000005000 };
  const other = { id: 'notif-db-11', type: 'QUOTATION_SENT', at: 1700000010000 };

  const sig1 = buildAttendanceNotifSignature([n9]);
  const sig2 = buildAttendanceNotifSignature([n9, n10]);
  const sig2Reordered = buildAttendanceNotifSignature([n10, n9, other]);

  assert.notEqual(sig1, sig2);
  assert.equal(sig2, sig2Reordered);
  assert.equal(buildAttendanceNotifSignature([other]), '');
});
