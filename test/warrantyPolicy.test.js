import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_WARRANTY_DAYS,
  WARRANTY_FINAL_DAY_CUTOFF_HOUR,
  WARRANTY_ALERT_MILESTONES,
} from '../src/constants/appPolicy.js';
import {
  analyzeWarrantyEligibility,
  checkWarrantyAlertMilestone,
  getWarrantyEndTimestamp,
  formatYmd,
  getSlotsForDate,
  isWarrantySlotBookable,
} from '../src/utils/warrantyPolicy.js';

test('warrantyPolicy: hằng số chính sách bảo hành biên', () => {
  assert.equal(BASE_WARRANTY_DAYS, 60);
  assert.equal(WARRANTY_FINAL_DAY_CUTOFF_HOUR, 18);
  assert.deepEqual(WARRANTY_ALERT_MILESTONES, [7, 3, 1]);
});

test('warrantyPolicy: ngày thứ 30 bình thường có nhiều ngày và đầy đủ slot', () => {
  const completedAt = new Date(2026, 9, 1, 9, 0, 0).getTime(); // 01/10/2026
  const serverNow = new Date(2026, 9, 31, 9, 0, 0).getTime(); // ngày thứ 30 (31/10/2026)
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays: 60, serverNow });

  assert.equal(res.eligible, true);
  assert.equal(res.isFinalDay, false);
  assert.ok(res.daysLeft > 1);
  assert.ok(res.availableDates.length > 1);
});

test('warrantyPolicy: ngày thứ 60 lúc 10h00 sáng - CHỈ ĐƯỢC CHỌN DUY NHẤT HÔM NAY', () => {
  const completedAt = new Date(2026, 8, 19, 9, 0, 0).getTime(); // 19/09/2026
  // Ngày 60: 18/11/2026 lúc 10h00
  const serverNow = new Date(2026, 10, 18, 10, 0, 0).getTime();
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays: 60, serverNow });

  assert.equal(res.eligible, true);
  assert.equal(res.isFinalDay, true);
  assert.equal(res.availableDates.length, 1);
  assert.equal(res.availableDates[0], formatYmd(serverNow));
  assert.ok(res.availableSlots.length > 0);
  // Ngày cuối: ca 18h00 - 20h00 vượt giờ làm việc của thợ → không được đặt
  assert.ok(!res.availableSlots.includes('18h00 - 20h00'));
  assert.ok(!res.availableSlots.includes('08h00 - 10h00'));
  assert.ok(res.availableSlots.includes('16h00 - 18h00'));
});

test('warrantyPolicy: ngày cuối lúc 17h00 - không còn ca trước 18h00 → từ chối', () => {
  const completedAt = new Date(2026, 8, 19, 9, 0, 0).getTime();
  const serverNow = new Date(2026, 10, 18, 17, 0, 0).getTime();
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays: 60, serverNow });
  assert.equal(res.eligible, false);
  assert.equal(res.reason, 'WARRANTY_FINAL_DAY_CUTOFF');
});

test('warrantyPolicy: đặt trước cho ngày cuối chỉ có ca bắt đầu trước 18h00', () => {
  const completedAt = new Date(2026, 8, 19, 9, 0, 0).getTime(); // hết hạn 18/11
  const now = new Date(2026, 10, 17, 10, 0, 0); // ngày 59
  assert.deepEqual(getSlotsForDate('2026-11-18', { now, endYmd: '2026-11-18' }).includes('18h00 - 20h00'), false);
  assert.equal(getSlotsForDate('2026-11-19', { now, endYmd: '2026-11-18' }).length, 0);
  assert.equal(isWarrantySlotBookable({ ymd: '2026-11-18', slot: '16h00 - 18h00', now, endYmd: '2026-11-18' }), true);
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays: 60, serverNow: now.getTime() });
  assert.deepEqual(res.availableDates, ['2026-11-17', '2026-11-18']);
});

test('warrantyPolicy: ngày hoàn thành không hiển thị quá tổng số ngày (không có 61/60)', () => {
  const completedAt = new Date(2026, 10, 15, 8, 29).getTime();
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays: 60, serverNow: new Date(2026, 10, 15, 10, 0).getTime() });
  assert.equal(res.daysLeft, 60);
  assert.equal(res.endYmd, '2027-01-14');
});

test('warrantyPolicy: ưu tiên warranty_end_date của server', () => {
  const completedAt = new Date(2026, 10, 15, 8, 29).getTime();
  const end = getWarrantyEndTimestamp(completedAt, 60, '2027-01-10T00:00:00');
  assert.equal(formatYmd(end), '2027-01-10');
});

test('warrantyPolicy: không gửi cảnh báo D-1 sau giờ chốt 18h00', () => {
  const completedAt = new Date(2026, 8, 19, 9, 0, 0).getTime();
  assert.equal(checkWarrantyAlertMilestone(completedAt, 60, new Date(2026, 10, 18, 19, 0).getTime()), null);
});

test('warrantyPolicy: hôm nay hết ca thì không đưa hôm nay vào danh sách ngày', () => {
  const completedAt = new Date(2026, 9, 1, 9, 0, 0).getTime();
  const serverNow = new Date(2026, 9, 31, 20, 30, 0).getTime();
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays: 60, serverNow });
  assert.equal(res.availableDates[0], '2026-11-01');
});

test('warrantyPolicy: ngày thứ 60 lúc 18h30 (sau 18h00) - TỪ CHỐI TIẾP NHẬN DO HẾT CA THỢ', () => {
  const completedAt = new Date(2026, 8, 19, 9, 0, 0).getTime(); // 19/09/2026
  // Ngày 60 lúc 18h30
  const serverNow = new Date(2026, 10, 18, 18, 30, 0).getTime();
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays: 60, serverNow });

  assert.equal(res.eligible, false);
  assert.equal(res.reason, 'WARRANTY_FINAL_DAY_CUTOFF');
  assert.equal(res.isFinalDay, true);
  assert.equal(res.availableDates.length, 0);
  assert.equal(res.availableSlots.length, 0);
});

test('warrantyPolicy: ngày thứ 61 - ĐÃ QUÁ HẠN BẢO HÀNH', () => {
  const completedAt = new Date(2026, 8, 19, 9, 0, 0).getTime(); // 19/09/2026
  // Ngày 61 (19/11/2026)
  const serverNow = new Date(2026, 10, 19, 9, 0, 0).getTime();
  const res = analyzeWarrantyEligibility({ completedAt, warrantyDays: 60, serverNow });

  assert.equal(res.eligible, false);
  assert.equal(res.reason, 'WARRANTY_EXPIRED');
});

test('warrantyPolicy: nhận diện chính xác các mốc cảnh báo D-7, D-3, D-1', () => {
  const completedAt = new Date(2026, 8, 19, 9, 0, 0).getTime(); // 19/09/2026
  // Hạn cuối là 18/11/2026
  
  // D-7: 12/11/2026
  const nowD7 = new Date(2026, 10, 12, 10, 0, 0).getTime();
  assert.equal(checkWarrantyAlertMilestone(completedAt, 60, nowD7), 7);

  // D-3: 16/11/2026
  const nowD3 = new Date(2026, 10, 16, 10, 0, 0).getTime();
  assert.equal(checkWarrantyAlertMilestone(completedAt, 60, nowD3), 3);

  // D-1: 18/11/2026
  const nowD1 = new Date(2026, 10, 18, 10, 0, 0).getTime();
  assert.equal(checkWarrantyAlertMilestone(completedAt, 60, nowD1), 1);

  // Ngày không thuộc mốc: 15/11/2026 (còn 4 ngày)
  const nowD4 = new Date(2026, 10, 15, 10, 0, 0).getTime();
  assert.equal(checkWarrantyAlertMilestone(completedAt, 60, nowD4), null);
});
