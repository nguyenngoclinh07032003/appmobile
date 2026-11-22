import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearReadNotifications,
  shouldKeepNotificationAfterClear,
} from '../src/utils/notifications.js';

test('notifications: clearReadNotifications xoá các thông báo đã đọc và giữ lại toàn bộ chưa đọc', () => {
  const input = [
    { id: 'notif-db-1', dbNotificationId: 1, title: 'Tin đã đọc 1', read: true, at: 1000 },
    { id: 'notif-db-2', dbNotificationId: 2, title: 'Tin chưa đọc 1', read: false, at: 2000 },
    { id: 'notif-db-3', dbNotificationId: 3, title: 'Tin đã đọc 2', read: true, at: 3000 },
    { id: 'local-4', title: 'Tin chưa đọc 2', read: false, at: 2500 },
  ];
  const res = clearReadNotifications(input, 2800);

  assert.equal(res.removedCount, 2);
  assert.deepEqual(
    res.remaining.map((n) => n.id),
    ['notif-db-2', 'local-4'],
  );
  assert.deepEqual(res.keptIds, ['notif-db-2', 'local-4']);
  // maxReadAt = 3000 > now = 2800 -> clearedAt = 3000 để không bị hiện lại tin đã đọc
  assert.equal(res.clearedAt, 3000);
});

test('notifications: clearReadNotifications khi không có tin đã đọc thì giữ nguyên tất cả', () => {
  const input = [
    { id: 'notif-db-10', read: false, at: 5000 },
    { id: 'notif-db-11', read: false, at: 6000 },
  ];
  const res = clearReadNotifications(input, 7000);

  assert.equal(res.removedCount, 0);
  assert.equal(res.remaining.length, 2);
  assert.deepEqual(res.keptIds, ['notif-db-10', 'notif-db-11']);
});

test('notifications: shouldKeepNotificationAfterClear giữ tin chưa đọc qua sync, giữ tin đã giữ khi mới đọc, và bỏ sau lần dọn kế tiếp', () => {
  const unreadKept = { id: 'notif-db-2', dbNotificationId: 2, read: false, at: 2000 };
  const oldRead = { id: 'notif-db-1', dbNotificationId: 1, read: true, at: 1000 };
  const newerRead = { id: 'notif-db-9', dbNotificationId: 9, read: true, at: 5000 };

  const { clearedAt, keptIds } = clearReadNotifications([oldRead, unreadKept], 3000);

  // Sau khi dọn lần 1: tin đã đọc cũ bị ẩn, tin chưa đọc được giữ, tin mới hơn vẫn hiện
  assert.equal(shouldKeepNotificationAfterClear(oldRead, clearedAt, keptIds), false);
  assert.equal(shouldKeepNotificationAfterClear(unreadKept, clearedAt, keptIds), true);
  assert.equal(shouldKeepNotificationAfterClear(newerRead, clearedAt, keptIds), true);

  // Người dùng bấm xem tin unreadKept -> read chuyển thành true, vẫn giữ trong danh sách nhờ keptIds
  const nowReadKept = { ...unreadKept, read: true };
  assert.equal(shouldKeepNotificationAfterClear(nowReadKept, clearedAt, keptIds), true);

  // Đồng bộ từ backend trả về dạng dbNotificationId (không trùng chuỗi id) vẫn được giữ nếu khớp dbNotificationId
  const syncedByDbId = { id: '2', dbNotificationId: 2, read: true, at: 2000 };
  assert.equal(shouldKeepNotificationAfterClear(syncedByDbId, clearedAt, keptIds), true);

  // Bấm "Dọn sạch" lần 2 sau khi đã đọc -> bị xoá khỏi danh sách
  const second = clearReadNotifications([nowReadKept], 4000);
  assert.equal(second.removedCount, 1);
  assert.equal(second.remaining.length, 0);
  assert.equal(shouldKeepNotificationAfterClear(nowReadKept, second.clearedAt, second.keptIds), false);
});
