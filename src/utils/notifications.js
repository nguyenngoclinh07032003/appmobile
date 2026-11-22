// Tiện ích lọc & dọn sạch thông báo: chỉ xoá thông báo đã đọc, luôn giữ lại thông báo chưa đọc.

export function clearReadNotifications(list = [], now = Date.now()) {
  const items = Array.isArray(list) ? list.filter(Boolean) : [];
  const remaining = items.filter((n) => !n.read);
  const readItems = items.filter((n) => Boolean(n.read));
  const removedCount = readItems.length;
  const maxReadAt = readItems.reduce((mx, n) => Math.max(mx, Number(n.at) || 0), 0);
  const clearedAt = Math.max(now, maxReadAt);
  const keptIds = remaining.map((n) => String(n.id)).filter(Boolean);
  return { remaining, removedCount, clearedAt, keptIds };
}

export function shouldKeepNotificationAfterClear(notif, clearedAt = 0, keptIds = []) {
  if (!notif) return false;
  if (!clearedAt) return true;
  if (!notif.read) return true;
  if ((Number(notif.at) || 0) > clearedAt) return true;
  if (Array.isArray(keptIds) && keptIds.length > 0) {
    const keptSet = keptIds.map((id) => String(id));
    const nid = notif.id != null ? String(notif.id) : null;
    if (nid && keptSet.includes(nid)) return true;
    if (notif.dbNotificationId != null) {
      const dbStr = String(notif.dbNotificationId);
      if (keptSet.includes(dbStr) || keptSet.includes(`notif-db-${dbStr}`)) return true;
    }
  }
  return false;
}
