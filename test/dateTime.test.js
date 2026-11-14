import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_DAY_MINUTE,
  MAX_DAY_MINUTE,
  LEAD_MINUTES,
  nextDays,
  minSelectableMinute,
  isDayOutOfSlots,
} from '../src/utils/dateTime.js';

test('dateTime: cấu hình khung giờ chuẩn 8h - 20h', () => {
  assert.equal(MIN_DAY_MINUTE, 480); // 8 * 60 = 8h00
  assert.equal(MAX_DAY_MINUTE, 1200); // 20 * 60 = 20h00
  assert.equal(LEAD_MINUTES, 45); // Tối thiểu 45 phút chuẩn bị
});

test('nextDays: tạo danh sách ngày hợp lệ', () => {
  const days = nextDays(7);
  assert.equal(days.length, 7);
  assert.equal(days[0].label, 'Hôm nay');
  assert.equal(days[1].label, 'Ngày mai');
  assert.match(days[0].key, /^\d{4}-\d{2}-\d{2}$/);
});

test('minSelectableMinute: ngày mai luôn chọn từ 8h00', () => {
  const tomorrowMin = minSelectableMinute(1);
  assert.equal(tomorrowMin, MIN_DAY_MINUTE);
});
