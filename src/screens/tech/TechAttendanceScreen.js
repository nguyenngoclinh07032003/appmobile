// Chấm công của thợ: vào ca có GPS, bảng công tháng, vi phạm. API: utils/attendance.js + hrmssApi (getMyShiftOptions,
// checkInShift, getMyAttendance, getMyViolations). Backend tự kiểm tra ca / trùng ca / ngày khóa; app chỉ hiển thị.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, R, shadow } from '../../theme';
import { formatVND } from '../../constants/data';
import { useApp } from '../../context/AppContext';
import { hrmssApi } from '../../services/api';
import { subscribeSocketEvent } from '../../services/socketService';
import { getCheckInLocation } from '../../utils/geo';
import { vnDateKey } from '../../utils/vnTime';
import {
  ATTENDANCE_NOTIF_TYPES, NOTE_MAX, SHIFT_STATUS_LABEL, buildCheckInBody, checkInErrorInfo, currentVnMonth, dayLabel,
  entriesOfDay, monthRange, noteError, shiftMonth, shiftTimeText, sortDaysDesc, vnClock, vnDateText,
} from '../../utils/attendance';
import {
  AppIcon, Badge, Btn, Card, EmptyState, Field, Segmented, Sheet, Tap, TopBar, ui,
} from '../../components';

const STATUS_META = {
  pending: { fg: C.goldInk, bg: C.goldSoft },
  approved: { fg: C.greenInk, bg: C.greenSoft },
  rejected: { fg: C.redInk, bg: C.redSoft },
};
const TABS = ['today', 'month', 'violations'];
const sameMonth = (a, b) => a.year === b.year && a.month === b.month;
const monthIndex = (ym) => ym.year * 12 + ym.month;

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { fg: C.ink2, bg: C.surface };
  return <Badge text={SHIFT_STATUS_LABEL[status] || status || '—'} fg={meta.fg} bg={meta.bg} />;
}

function Stat({ label, value, color = C.ink }) {
  return (
    <View style={as.stat}>
      <Text style={[as.statValue, { color }]}>{value}</Text>
      <Text style={as.statLabel}>{label}</Text>
    </View>
  );
}

export function TechAttendanceScreen({ params }) {
  const { ui: u } = useApp();
  const [tab, setTab] = useState(TABS.includes(params?.tab) ? params.tab : 'today');
  const [ym, setYm] = useState(currentVnMonth);
  const ymRef = useRef(ym);
  ymRef.current = ym;

  const [options, setOptions] = useState(null); // GET /attendance/me/shift-options
  const [todayGrid, setTodayGrid] = useState(null); // bảng công tháng hiện tại (trạng thái ca hôm nay)
  const [grid, setGrid] = useState(null); // bảng công tháng đang xem
  const [violations, setViolations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocked, setBlocked] = useState(''); // 'API' (backend chưa có) | 'FORBIDDEN' (chưa được bật chấm công)
  const [todayError, setTodayError] = useState('');
  const [monthError, setMonthError] = useState('');
  const monthSeqRef = useRef(0);

  const [locatingId, setLocatingId] = useState(null);
  const locatingRef = useRef(false);
  const [target, setTarget] = useState(null); // { item, loc } ca đang xác nhận vào
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const loadToday = useCallback(async () => {
    const res = await hrmssApi.getMyShiftOptions();
    if (!res.ok) {
      if (res.status === 404) setBlocked('API');
      else if (res.status === 403) setBlocked('FORBIDDEN');
      else setTodayError(res.message || 'Không tải được ca hôm nay. Kiểm tra mạng và thử lại.');
      return;
    }
    setBlocked('');
    setTodayError('');
    setOptions(res.data || { items: [] });
  }, []);

  const loadTodayStatus = useCallback(async () => {
    const cur = currentVnMonth();
    const res = await hrmssApi.getMyAttendance(cur.month, cur.year);
    if (res.ok) setTodayGrid(res.data ?? null);
  }, []);

  const loadMonth = useCallback(async (target = ymRef.current) => {
    const seq = ++monthSeqRef.current;
    const { from, to } = monthRange(target);
    const [g, v] = await Promise.all([
      hrmssApi.getMyAttendance(target.month, target.year),
      hrmssApi.getMyViolations(from, to),
    ]);
    if (seq !== monthSeqRef.current) return; // đã chuyển sang tháng khác trong lúc chờ
    if (!g.ok || !v.ok) {
      const bad = !g.ok ? g : v;
      if (bad.status === 404) setBlocked('API');
      else if (bad.status === 403) setBlocked('FORBIDDEN');
      else setMonthError(bad.message || 'Không tải được bảng công. Kiểm tra mạng và thử lại.');
    } else {
      setMonthError('');
    }
    if (g.ok) {
      setGrid(g.data ?? null);
      if (sameMonth(target, currentVnMonth())) setTodayGrid(g.data ?? null);
    }
    if (v.ok) setViolations(v.data ?? null);
  }, []);

  // silent: tải lại sau thao tác / thông báo, không hiện vòng xoay toàn màn.
  const loadAll = useCallback(async (isRefresh = false, silent = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    try {
      const viewingCurrent = sameMonth(ymRef.current, currentVnMonth());
      await Promise.all([loadToday(), loadMonth(ymRef.current), viewingCurrent ? null : loadTodayStatus()]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadToday, loadMonth, loadTodayStatus]);

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  useEffect(() => {
    if (TABS.includes(params?.tab)) setTab(params.tab);
  }, [params?.tab]);

  // Văn phòng xếp / sửa / hủy ca, duyệt / từ chối, ghi vi phạm, chốt kỳ -> tải lại.
  useEffect(() => {
    const off = subscribeSocketEvent('notification:new', (n) => {
      const nType = String(n?.notification_type || n?.type || '').toUpperCase();
      if (ATTENDANCE_NOTIF_TYPES.has(nType)) loadAll(false, true);
    });
    return off;
  }, [loadAll]);

  const changeMonth = (delta) => {
    const next = shiftMonth(ymRef.current, delta);
    if (monthIndex(next) > monthIndex(currentVnMonth())) return;
    setYm(next);
    ymRef.current = next;
    setGrid(null);
    setViolations(null);
    loadMonth(next);
  };

  // Bấm "Vào ca": lấy GPS thật trước; không có vị trí thì KHÔNG gọi API (không gửi tọa độ mặc định).
  const startCheckIn = async (item) => {
    if (locatingRef.current || submittingRef.current) return;
    locatingRef.current = true;
    setLocatingId(String(item.technicianShiftId));
    try {
      const loc = await getCheckInLocation();
      if (!loc) {
        u.alert('Không lấy được vị trí', 'Bật định vị và cấp quyền vị trí cho app rồi thử lại.', '📍');
        return;
      }
      setNote('');
      setNoteErr('');
      setTarget({ item, loc });
    } finally {
      locatingRef.current = false;
      setLocatingId(null);
    }
  };

  const confirmCheckIn = async () => {
    if (!target || submittingRef.current) return;
    const err = noteError(note);
    if (err) {
      setNoteErr(err);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await hrmssApi.checkInShift(buildCheckInBody(target.item.technicianShiftId, target.loc, note));
      if (res.ok) {
        setTarget(null);
        u.toast('Đã vào ca, chờ quản lý duyệt', '✅');
        await loadAll(false, true);
        return;
      }
      if (res.code === 'VALIDATION_ERROR') {
        setNoteErr(res.message || 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.');
        return;
      }
      const info = checkInErrorInfo(res);
      setTarget(null);
      u.alert('Chưa vào ca được', info.text, '⚠️');
      if (info.reload) await loadAll(false, true);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const todayKey = options?.workDate || vnDateKey();
  const todayEntries = entriesOfDay(todayGrid, todayKey);
  const items = Array.isArray(options?.items) ? options.items : [];
  const days = sortDaysDesc(grid?.days || []);
  const summary = grid?.summary || null;
  const vItems = Array.isArray(violations?.items) ? violations.items : [];
  const atCurrentMonth = sameMonth(ym, currentVnMonth());

  const monthPicker = (
    <View style={as.monthRow}>
      <Tap style={as.monthBtn} onPress={() => changeMonth(-1)}>
        <AppIcon name="chevron-left" size={18} color={C.ink} />
      </Tap>
      <Text style={as.monthText}>Tháng {ym.month}/{ym.year}</Text>
      <Tap style={[as.monthBtn, atCurrentMonth && { opacity: 0.35 }]} disabled={atCurrentMonth} onPress={() => changeMonth(1)}>
        <AppIcon name="chevron-right" size={18} color={C.ink} />
      </Tap>
    </View>
  );

  const errorCard = (text) => (
    <Card style={as.errCard}>
      <Text style={{ fontWeight: '800', color: C.redInk }}>Không tải được dữ liệu</Text>
      <Text style={{ color: C.ink2, marginTop: 4, lineHeight: 20 }}>{text}</Text>
      <Btn title="Thử lại" small variant="soft" style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => loadAll(false)} />
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Chấm công" sub="Vào ca, bảng công & vi phạm" />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { id: 'today', label: 'Hôm nay' },
            { id: 'month', label: 'Bảng công' },
            { id: 'violations', label: `Vi phạm${vItems.length ? ` (${vItems.length})` : ''}` },
          ]}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor={C.primary} colors={[C.primary]} />}
      >
        {blocked === 'API' ? (
          <Card style={as.warnCard}>
            <Text style={{ fontWeight: '800', color: C.goldInk }}>Máy chủ chưa cập nhật API chấm công</Text>
            <Text style={{ color: C.ink2, marginTop: 4, lineHeight: 20 }}>
              Tính năng chấm công cần backend bản mới trên VPS. Kéo để làm mới sau khi backend cập nhật xong.
            </Text>
          </Card>
        ) : blocked === 'FORBIDDEN' ? (
          <Card style={as.warnCard}>
            <Text style={{ fontWeight: '800', color: C.goldInk }}>Tài khoản chưa được phép chấm công</Text>
            <Text style={{ color: C.ink2, marginTop: 4, lineHeight: 20 }}>Liên hệ văn phòng để được bật quyền chấm công.</Text>
          </Card>
        ) : null}

        {!blocked && tab === 'today' ? (
          <>
            {todayError ? errorCard(todayError) : null}
            <Text style={as.secTitle}>Hôm nay {vnDateText(todayKey)}</Text>
            {items.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={loading ? 'Đang tải…' : 'Hôm nay bạn chưa có ca'}
                body={loading ? '' : 'Liên hệ văn phòng để được xếp ca.'}
              />
            ) : (
              items.map((it) => {
                const key = String(it.technicianShiftId);
                const entry = todayEntries.get(key);
                const locating = locatingId === key;
                return (
                  <Card key={key} style={{ marginBottom: 12, ...shadow.sm }}>
                    <View style={as.shiftHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={as.shiftName}>{it.name || `Ca #${key}`}</Text>
                        <Text style={ui.meta}>{shiftTimeText(it)}</Text>
                      </View>
                      {it.alreadyRecorded ? (
                        <Badge text="Đã vào ca" fg={C.ink2} bg={C.surface} />
                      ) : (
                        <Btn
                          title={locating ? 'Đang lấy vị trí…' : 'Vào ca'}
                          icon="map-pin"
                          small
                          disabled={Boolean(locatingId) || submitting}
                          onPress={() => startCheckIn(it)}
                        />
                      )}
                    </View>
                    {it.alreadyRecorded && entry ? (
                      <View style={as.entryRow}>
                        <StatusBadge status={entry.status} />
                        {entry.checkedInAt ? <Text style={ui.meta}>Vào lúc {vnClock(entry.checkedInAt)}</Text> : null}
                      </View>
                    ) : null}
                    {entry?.status === 'rejected' && entry.rejectReason ? (
                      <Text style={as.rejectText}>Lý do từ chối: {entry.rejectReason}</Text>
                    ) : null}
                  </Card>
                );
              })
            )}
            <Text style={[ui.meta, { marginTop: 4, lineHeight: 19 }]}>
              Vào ca cần bật định vị. Ca vừa vào ở trạng thái "Chờ duyệt" cho tới khi quản lý duyệt trên web.
            </Text>
          </>
        ) : null}

        {!blocked && tab === 'month' ? (
          <>
            {monthPicker}
            {monthError ? errorCard(monthError) : null}
            {summary ? (
              <Card style={{ marginBottom: 12, borderLeftWidth: 3.5, borderLeftColor: C.primary, ...shadow.sm }}>
                <View style={as.statGrid}>
                  <Stat label="Ngày công" value={summary.workedDays ?? 0} color={C.primary} />
                  <Stat label="Ca đã duyệt" value={summary.approvedShifts ?? 0} color={C.greenInk} />
                  <Stat label="Ca chờ duyệt" value={summary.pendingShifts ?? 0} color={C.goldInk} />
                  <Stat label="Ca bị từ chối" value={summary.rejectedShifts ?? 0} color={C.redInk} />
                  <Stat label="Ngày nghỉ" value={summary.dayOffCount ?? 0} />
                </View>
              </Card>
            ) : null}
            {days.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={loading ? 'Đang tải…' : 'Chưa có dữ liệu chấm công tháng này'}
                body={loading ? '' : 'Các ca bạn vào và ca quản lý ghi nhận sẽ hiển thị tại đây.'}
              />
            ) : (
              days.map((d) => (
                <Card key={d.attendanceId || d.date} style={{ marginBottom: 10 }}>
                  <View style={as.dayHead}>
                    <Text style={[as.dayTitle, d.dayType === 'sunday' && { color: C.red }]}>{dayLabel(d.date)}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      {d.isDayOff ? <Badge text="Nghỉ" fg={C.ink2} bg={C.surface} /> : null}
                      {d.isLocked ? (
                        <View style={as.lockTag}>
                          <AppIcon name="lock" size={12} color={C.muted} />
                          <Text style={as.lockText}>Đã chốt</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {(d.shifts || []).map((s) => (
                    <View key={s.entryId} style={as.dayShift}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: C.ink }}>{s.shiftName || s.shiftCode || 'Ca'}</Text>
                        <Text style={ui.meta}>
                          {[s.startTime, s.endTime].filter(Boolean).join(' – ')}
                          {s.checkedInAt ? ` · Vào lúc ${vnClock(s.checkedInAt)}` : ''}
                          {s.source && s.source !== 'self' ? ' · Quản lý ghi nhận' : ''}
                        </Text>
                        {s.status === 'rejected' && s.rejectReason ? (
                          <Text style={as.rejectText}>Lý do: {s.rejectReason}</Text>
                        ) : null}
                      </View>
                      <StatusBadge status={s.status} />
                    </View>
                  ))}
                  {!d.shifts?.length && !d.isDayOff ? <Text style={[ui.meta, { marginTop: 6 }]}>Không có ca</Text> : null}
                </Card>
              ))
            )}
          </>
        ) : null}

        {!blocked && tab === 'violations' ? (
          <>
            {monthPicker}
            {monthError ? errorCard(monthError) : null}
            <Card style={{ marginBottom: 12, borderLeftWidth: 3.5, borderLeftColor: C.red, ...shadow.sm }}>
              <Text style={{ color: C.ink2, fontSize: 12.5, fontWeight: '600' }}>Tổng tiền phạt tháng {ym.month}/{ym.year}</Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: C.redInk, marginTop: 4 }}>
                {formatVND(violations?.summary?.totalFine ?? 0)}
              </Text>
              <Text style={[ui.meta, { marginTop: 4 }]}>{violations?.summary?.count ?? vItems.length} vi phạm</Text>
            </Card>
            {vItems.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title={loading ? 'Đang tải…' : 'Không có vi phạm'}
                body={loading ? '' : 'Tháng này bạn chưa bị ghi nhận vi phạm nào.'}
              />
            ) : (
              vItems.map((v) => (
                <Card key={v.id} style={{ marginBottom: 10 }}>
                  <View style={as.dayHead}>
                    <Text style={as.dayTitle}>{vnDateText(v.date)}</Text>
                    <Text style={{ fontWeight: '900', color: C.redInk }}>{formatVND(v.fineAmount ?? 0)}</Text>
                  </View>
                  {v.description ? <Text style={{ color: C.ink, marginTop: 6, lineHeight: 20 }}>{v.description}</Text> : null}
                  {v.recordedBy?.fullName ? <Text style={[ui.meta, { marginTop: 4 }]}>Người ghi: {v.recordedBy.fullName}</Text> : null}
                </Card>
              ))
            )}
          </>
        ) : null}
      </ScrollView>

      <Sheet
        visible={Boolean(target)}
        onClose={() => { if (!submittingRef.current) setTarget(null); }}
        title="Xác nhận vào ca"
        footer={(
          <Btn
            title={submitting ? 'Đang gửi…' : 'Vào ca'}
            icon="map-pin"
            disabled={submitting}
            onPress={confirmCheckIn}
          />
        )}
      >
        {target ? (
          <View style={{ gap: 6 }}>
            <Text style={as.shiftName}>{target.item.name || `Ca #${target.item.technicianShiftId}`}</Text>
            <Text style={ui.meta}>{shiftTimeText(target.item)}</Text>
            <View style={as.gpsRow}>
              <AppIcon name="map-pin" size={16} color={C.greenInk} />
              <Text style={{ color: C.greenInk, fontWeight: '700' }}>Vị trí GPS ±{target.loc.accuracy}m</Text>
            </View>
            <Field
              label="Ghi chú (tùy chọn)"
              value={note}
              onChangeText={(t) => { setNote(t); if (noteErr) setNoteErr(''); }}
              placeholder="VD: Vào ca tại nhà khách"
              multiline
              maxLength={NOTE_MAX}
              error={noteErr || undefined}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const as = StyleSheet.create({
  secTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 10 },
  warnCard: { backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold, marginBottom: 12 },
  errCard: { backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.red, marginBottom: 12 },
  shiftHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shiftName: { fontSize: 15.5, fontWeight: '800', color: C.ink },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  rejectText: { color: C.redInk, fontSize: 13, marginTop: 6, lineHeight: 19 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthBtn: {
    width: 38, height: 38, borderRadius: R.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  monthText: { fontSize: 16, fontWeight: '800', color: C.ink },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  stat: { width: '33.33%', alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 11.5, color: C.muted, marginTop: 2, textAlign: 'center' },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayTitle: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  dayShift: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, marginTop: 10,
    borderTopWidth: 1, borderTopColor: C.surface,
  },
  lockTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { fontSize: 12, color: C.muted, fontWeight: '600' },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
});
