import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOW_ALL_TIME_SLOTS,
  MIN_DAY_MINUTE,
  MAX_DAY_MINUTE,
  LEAD_MINUTES,
  nextDays,
  minSelectableMinute,
  defaultSelectableMinute,
  isDayOutOfSlots,
  formatMinutesToSlotStr,
} from '../src/utils/dateTime.js';
import { vnTimestamp } from '../src/utils/vnTime.js';

test('dateTime: cấu hình khung giờ (test mode mở toàn bộ 00:00 - 23:45)', () => {
  assert.equal(ALLOW_ALL_TIME_SLOTS, true);
  assert.equal(MIN_DAY_MINUTE, 0); // 00:00
  assert.equal(MAX_DAY_MINUTE, 23 * 60 + 45); // 23:45
  assert.equal(LEAD_MINUTES, 0);
});

test('nextDays: tạo danh sách ngày hợp lệ', () => {
  const days = nextDays(7);
  assert.equal(days.length, 7);
  assert.equal(days[0].label, 'Hôm nay');
  assert.equal(days[1].label, 'Ngày mai');
  assert.match(days[0].key, /^\d{4}-\d{2}-\d{2}$/);
});

test('minSelectableMinute & isDayOutOfSlots: cho phép đặt mọi khung giờ cả hôm nay và ngày mai', () => {
  const lateNight = new Date(vnTimestamp(2026, 11, 25, 22, 30));
  const almostMidnight = new Date(vnTimestamp(2026, 11, 25, 23, 55));

  assert.equal(minSelectableMinute(0, lateNight), 0);
  assert.equal(minSelectableMinute(0, almostMidnight), 0);
  assert.equal(minSelectableMinute(1, lateNight), MIN_DAY_MINUTE);

  assert.equal(isDayOutOfSlots(0, lateNight), false);
  assert.equal(isDayOutOfSlots(0, almostMidnight), false);
});

test('defaultSelectableMinute & formatMinutesToSlotStr: gợi ý mốc sắp tới và định dạng cả sáng sớm / đêm muộn', () => {
  const at2227 = new Date(vnTimestamp(2026, 11, 25, 22, 27));
  const at2350 = new Date(vnTimestamp(2026, 11, 25, 23, 50));

  assert.equal(defaultSelectableMinute(0, at2227), 22 * 60 + 30);
  assert.equal(defaultSelectableMinute(0, at2350), 23 * 60 + 45);
  assert.equal(defaultSelectableMinute(1, at2227), 14 * 60);

  assert.equal(formatMinutesToSlotStr(0), '00h00 - 02h00');
  assert.equal(formatMinutesToSlotStr(60), '01h00 - 03h00');
  assert.equal(formatMinutesToSlotStr(22 * 60 + 30), '22h30 - 24h00');
  assert.equal(formatMinutesToSlotStr(23 * 60 + 45), '23h45 - 24h00');
});
