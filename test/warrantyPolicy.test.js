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
  assert.ok(res.availableSlots.includes('18h00 - 20h00'));
  assert.ok(!res.availableSlots.includes('08h00 - 10h00'));
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
