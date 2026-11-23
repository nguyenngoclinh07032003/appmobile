import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, R, shadow } from '../../theme';
import { formatVND } from '../../constants/data';
import { useApp } from '../../context';
import { hrmssApi } from '../../services/api';
import { subscribeSocketEvent } from '../../services/socketService';
import { getCheckInLocation } from '../../utils/geo';
import { toVietnamese } from '../../utils/viText';
import {
  buildAttendanceNotifSignature,
  buildCheckInPayload,
  findTodayShiftRecord,
  formatAttendanceCheckInError,
  formatVnDateDm,
  formatVnDateDmy,
  formatVnTimeHm,
  getMonthRange,
  getVnTodayInfo,
  getVnWeekdayInfo,
  identifyTechWorkShift,
  isAttendanceNotifType,
  normalizeAttendanceResponse,
  normalizeViolationsResponse,
  shiftMonth,
  sortTechShifts,
  validateCheckInNote,
} from '../../utils/attendance';
import {
  AppIcon, Badge, Btn, Card, Field, IconBtn, PageHead, Sheet, Tap, ui,
} from '../../components';

const ATT_STATUS_META = {
  pending: { label: 'Chờ duyệt', fg: C.goldInk, bg: C.goldSoft },
  approved: { label: 'Đã duyệt', fg: C.greenInk, bg: C.greenSoft },
  rejected: { label: 'Bị từ chối', fg: C.redInk, bg: C.redSoft },
};

const pad2 = (n) => String(n).padStart(2, '0');

export function TechAttendanceScreen() {
  const { s, nav, ui: u } = useApp();
  const initialVnToday = useMemo(() => getVnTodayInfo(), []);
  const [selMonth, setSelMonth] = useState(initialVnToday.month);
  const [selYear, setSelYear] = useState(initialVnToday.year);

  const [shiftOptions, setShiftOptions] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState('');

  const [monthAttendance, setMonthAttendance] = useState(null);
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState('');

  const [violations, setViolations] = useState({ items: [], summary: { count: 0, totalFine: 0 } });
  const [violationsLoading, setViolationsLoading] = useState(true);
  const [violationsError, setViolationsError] = useState('');

  const [refreshing, setRefreshing] = useState(false);
  const [locatingShiftId, setLocatingShiftId] = useState(null);
  const [confirmShift, setConfirmShift] = useState(null);
  const [confirmLoc, setConfirmLoc] = useState(null);
  const [checkInNote, setCheckInNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submittingRef = useRef(false);
  const monthReqSeqRef = useRef(0);
  const todayReqSeqRef = useRef(0);
  const lastAutoRefreshRef = useRef(0);
  const selMonthRef = useRef(selMonth);
  const selYearRef = useRef(selYear);
  selMonthRef.current = selMonth;
  selYearRef.current = selYear;

  const todayVnNow = getVnTodayInfo();
  const isViewingCurrentMonth = selMonth === todayVnNow.month && selYear === todayVnNow.year;

  const loadMonthData = useCallback(async (month = selMonthRef.current, year = selYearRef.current, { silent = false } = {}) => {
    const seq = ++monthReqSeqRef.current;
    const todayInfo = getVnTodayInfo();
    const isCurrent = month === todayInfo.month && year === todayInfo.year;
    if (!silent) {
      setMonthLoading(true);
      setMonthError('');
      setViolationsLoading(true);
      setViolationsError('');
    }
    const { from, to } = getMonthRange(month, year);
    const [attRes, vioRes] = await Promise.all([
      hrmssApi.getMyAttendance(month, year),
      hrmssApi.getMyViolations(from, to),
    ]);
    if (seq !== monthReqSeqRef.current) return null;

    if (!attRes.ok) {
      setMonthError(attRes.message || 'Không tải được bảng công tháng. Kiểm tra mạng và thử lại.');
    } else {
      setMonthError('');
      const normalized = normalizeAttendanceResponse(attRes.data);
      setMonthAttendance(normalized);
      if (isCurrent) setTodayAttendance(normalized);
    }
    setMonthLoading(false);

    if (!vioRes.ok) {
      setViolationsError(vioRes.message || 'Không tải được danh sách vi phạm. Kiểm tra mạng và thử lại.');
    } else {
      setViolationsError('');
      setViolations(normalizeViolationsResponse(vioRes.data));
    }
    setViolationsLoading(false);

    return { attRes, vioRes };
  }, []);

  const loadTodayShifts = useCallback(async ({ silent = false, includeTodayAttendance = true } = {}) => {
    const seq = ++todayReqSeqRef.current;
    const todayInfo = getVnTodayInfo();
    if (!silent) {
      setTodayLoading(true);
      setTodayError('');
    }

    const optReq = hrmssApi.getMyShiftOptions();
    const attReq = includeTodayAttendance
      ? hrmssApi.getMyAttendance(todayInfo.month, todayInfo.year)
      : Promise.resolve(null);
    const [optRes, attRes] = await Promise.all([optReq, attReq]);
    if (seq !== todayReqSeqRef.current) return null;

    if (!optRes.ok) {
      const optCode = String(optRes.code || '').toUpperCase();
      if (optRes.status === 403 || optCode === 'FORBIDDEN' || optCode === 'ATTENDANCE_NOT_APPLICABLE') {
        setTodayError('Tài khoản chưa được phép chấm công. Liên hệ văn phòng.');
      } else {
        setTodayError(optRes.message || 'Không tải được ca làm hôm nay. Kiểm tra mạng và thử lại.');
      }
    } else {
      setTodayError('');
      setShiftOptions(optRes.data || { workDate: todayInfo.dateKey, items: [] });
    }
    if (attRes?.ok) {
      const normalized = normalizeAttendanceResponse(attRes.data);
      setTodayAttendance(normalized);
    }
    setTodayLoading(false);
    return { optRes, attRes };
  }, []);

  const loadAll = useCallback(async ({ isRefresh = false, silent = false } = {}) => {
    if (isRefresh) setRefreshing(true);
    const todayInfo = getVnTodayInfo();
    const m = selMonthRef.current;
    const y = selYearRef.current;
    const viewingCurrent = m === todayInfo.month && y === todayInfo.year;
    try {
      await Promise.all([
        loadTodayShifts({ silent, includeTodayAttendance: !viewingCurrent }),
        loadMonthData(m, y, { silent }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadTodayShifts, loadMonthData]);

  useEffect(() => {
    loadAll({ silent: false });
  }, [loadAll]);

  const triggerAutoRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoRefreshRef.current < 1500) return;
    lastAutoRefreshRef.current = now;
    loadAll({ silent: true });
  }, [loadAll]);

  useEffect(() => {
    const off = subscribeSocketEvent('notification:new', (n) => {
      const nType = n?.notification_type || n?.type;
      if (isAttendanceNotifType(nType)) {
        triggerAutoRefresh();
      }
    });
    return off;
  }, [triggerAutoRefresh]);

  // Dự phòng khi danh sách thông báo đồng bộ về từ polling (không qua socket) có thông báo chấm công/ca mới.
  const latestAttNotifStamp = useMemo(
    () => buildAttendanceNotifSignature(s.techNotifs),
    [s.techNotifs],
  );

  const seenAttNotifRef = useRef(latestAttNotifStamp);
  useEffect(() => {
    if (latestAttNotifStamp && latestAttNotifStamp !== seenAttNotifRef.current) {
      seenAttNotifRef.current = latestAttNotifStamp;
      triggerAutoRefresh();
    } else {
      seenAttNotifRef.current = latestAttNotifStamp;
    }
  }, [latestAttNotifStamp, triggerAutoRefresh]);

  const handleChangeMonth = (delta) => {
    const next = shiftMonth(selMonth, selYear, delta);
    setSelMonth(next.month);
    setSelYear(next.year);
    loadMonthData(next.month, next.year, { silent: false });
  };

  const handleJumpCurrentMonth = () => {
    const now = getVnTodayInfo();
    if (selMonth === now.month && selYear === now.year) return;
    setSelMonth(now.month);
    setSelYear(now.year);
    loadMonthData(now.month, now.year, { silent: false });
  };

  const handleStartCheckIn = async (shift) => {
    if (!shift || locatingShiftId != null || submittingRef.current) return;
    setLocatingShiftId(shift.technicianShiftId);
    try {
      const loc = await getCheckInLocation();
      if (!loc) {
        u.alert(
          'Chưa lấy được vị trí',
          'Không lấy được vị trí. Bật định vị và cấp quyền vị trí cho ứng dụng rồi thử lại.',
          'map-pin',
        );
        return;
      }
      setConfirmShift(shift);
      setConfirmLoc(loc);
      setCheckInNote('');
      setNoteError('');
    } finally {
      setLocatingShiftId(null);
    }
  };

  const handleConfirmCheckIn = async () => {
    if (submittingRef.current || !confirmShift || !confirmLoc) return;
    const errNote = validateCheckInNote(checkInNote);
    if (errNote) {
      setNoteError(errNote);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const payload = buildCheckInPayload({
        technicianShiftId: confirmShift.technicianShiftId,
        lat: confirmLoc.lat,
        lng: confirmLoc.lng,
        accuracy: confirmLoc.accuracy,
        note: checkInNote,
      });
      const res = await hrmssApi.checkInShift(payload);
      if (res.ok) {
        setConfirmShift(null);
        setConfirmLoc(null);
        setCheckInNote('');
        setNoteError('');
        u.toast('Đã vào ca, chờ quản lý duyệt', 'check');
        await loadAll({ silent: true });
        return;
      }
      const mapped = formatAttendanceCheckInError(res);
      u.alert(mapped.title, mapped.message, 'alert-triangle');
      if (mapped.shouldRefetch) {
        setConfirmShift(null);
        setConfirmLoc(null);
        setCheckInNote('');
        setNoteError('');
        await loadAll({ silent: true });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const workDate = shiftOptions?.workDate || todayVnNow.dateKey;
  const shiftItems = useMemo(
    () => sortTechShifts(Array.isArray(shiftOptions?.items) ? shiftOptions.items : []),
    [shiftOptions],
  );
  const monthDays = Array.isArray(monthAttendance?.days) ? monthAttendance.days : [];
  const summary = monthAttendance?.summary || null;

  const refreshBtn = Platform.OS === 'web' ? (
    <IconBtn
      icon="refresh-cw"
      size={36}
      onPress={() => loadAll({ isRefresh: true })}
      label="Làm mới chấm công"
      style={{ backgroundColor: C.surface }}
    />
  ) : null;
  const initialTodayLoading = todayLoading && !shiftOptions;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <PageHead title="Chấm công" sub="Ca 1: 08h00 – 12h00 · Ca 2: 13h30 – 17h30" right={refreshBtn} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAll({ isRefresh: true })}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        )}
      >
        {/* A. HÔM NAY dd/MM/yyyy */}
        <View style={st.secHead}>
          <View style={st.secTitleRow}>
            <AppIcon name="calendar-clock" size={18} color={C.primary} strokeWidth={2.2} />
            <Text style={st.secTitle}>Hôm nay {formatVnDateDmy(workDate)}</Text>
          </View>
          {shiftItems.length > 0 ? (
            <Badge text={`${shiftItems.length} ca`} fg={C.primary} bg={C.primarySoft} />
          ) : null}
        </View>

        {todayError ? (
          <Card style={st.errCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AppIcon name="alert-triangle" size={20} color={C.red} />
              <Text style={st.errText}>{todayError}</Text>
            </View>
            <Btn
              title="Thử lại"
              icon="refresh-cw"
              variant="soft"
              small
              style={{ marginTop: 12, alignSelf: 'flex-start' }}
              onPress={() => loadTodayShifts({ silent: false })}
            />
          </Card>
        ) : initialTodayLoading ? (
          <Card style={st.loadingCard}>
            <ActivityIndicator color={C.primary} />
            <Text style={ui.meta}>Đang tải danh sách ca hôm nay…</Text>
          </Card>
        ) : shiftItems.length === 0 ? (
          <Card style={st.emptyCard}>
            <View style={st.emptyIconWrap}>
              <AppIcon name="calendar" size={24} color={C.primary} />
            </View>
            <Text style={st.emptyTitle}>Hôm nay bạn chưa có ca. Liên hệ văn phòng.</Text>
            <Text style={[ui.meta, { textAlign: 'center', marginTop: 4 }]}>
              Khi văn phòng xếp Ca 1 (08h00 – 12h00) hoặc Ca 2 (13h30 – 17h30), ca sẽ hiển thị tại đây để bạn chấm công vào ca.
            </Text>
          </Card>
        ) : (
          shiftItems.map((item) => {
            const rec = item.alreadyRecorded
              ? findTodayShiftRecord(todayAttendance, workDate, item.technicianShiftId)
              : null;
            const statusKey = String(rec?.status || '').toLowerCase();
            const statusMeta = statusKey ? ATT_STATUS_META[statusKey] : null;
            const timeStr = `${item.startTime || '—'} – ${item.endTime || '—'}${item.crossesMidnight ? ' (qua đêm)' : ''}`;
            const isLocatingThis = locatingShiftId === item.technicianShiftId;
            const matchedShift = identifyTechWorkShift(item);
            const displayName = item.name || 'Ca làm việc';
            const showShiftBadge = Boolean(
              matchedShift && !new RegExp(matchedShift.label.replace(/\s+/g, '\\s*'), 'i').test(displayName),
            );

            return (
              <Card key={String(item.technicianShiftId)} style={st.shiftCard}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.shiftName}>{displayName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      <AppIcon name="clock" size={14} color={C.muted} />
                      <Text style={st.shiftTime}>{timeStr}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {showShiftBadge ? <Badge text={matchedShift.label} fg={C.primary} bg={C.primarySoft} /> : null}
                    {item.code && !new RegExp(String(item.code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(displayName)
                      ? <Badge text={item.code} fg={C.ink2} bg={C.surface} />
                      : null}
                  </View>
                </View>

                {item.alreadyRecorded ? (
                  <View style={st.recordedBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Badge text="Đã vào ca" fg={C.muted} bg={C.surface} />
                      {statusMeta ? <Badge text={statusMeta.label} fg={statusMeta.fg} bg={statusMeta.bg} /> : null}
                      {rec?.checkedInAt ? (
                        <Text style={[ui.meta, { marginTop: 0 }]}>
                          Vào ca lúc {formatVnTimeHm(rec.checkedInAt)}
                        </Text>
                      ) : null}
                    </View>
                    {statusKey === 'rejected' ? (
                      <Text style={st.rejectText}>
                        Bị từ chối: {toVietnamese(rec.rejectReason, 'Không có lý do') || 'Không có lý do'}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Btn
                    title={isLocatingThis ? 'Đang lấy vị trí định vị…' : 'Vào ca'}
                    icon="map-pin"
                    style={{ marginTop: 14 }}
                    disabled={locatingShiftId != null || submitting}
                    onPress={() => handleStartCheckIn(item)}
                  />
                )}
              </Card>
            );
          })
        )}

        {/* B. BẢNG CÔNG THÁNG */}
        <View style={[st.secHead, { marginTop: 22 }]}>
          <View style={st.secTitleRow}>
            <AppIcon name="clipboard-check" size={18} color={C.primary} strokeWidth={2.2} />
            <Text style={st.secTitle}>Bảng công tháng</Text>
          </View>
          {!isViewingCurrentMonth ? (
            <Tap onPress={handleJumpCurrentMonth} hitSlop={8}>
              <Text style={ui.link}>Tháng này</Text>
            </Tap>
          ) : null}
        </View>

        <Card style={st.monthBar}>
          <IconBtn
            icon="chevron-left"
            size={36}
            onPress={() => handleChangeMonth(-1)}
            label="Tháng trước"
            style={{ backgroundColor: C.surface }}
          />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={st.monthTitle}>Tháng {pad2(selMonth)}/{selYear}</Text>
            {monthAttendance?.user?.employeeCode ? (
              <Text style={[ui.meta, { marginTop: 1 }]}>
                {monthAttendance.user.fullName} · {monthAttendance.user.employeeCode}
              </Text>
            ) : null}
          </View>
          <IconBtn
            icon="chevron-right"
            size={36}
            onPress={() => handleChangeMonth(1)}
            label="Tháng sau"
            style={{ backgroundColor: C.surface }}
          />
        </Card>

        {monthError ? (
          <Card style={st.errCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AppIcon name="alert-triangle" size={20} color={C.red} />
              <Text style={st.errText}>{monthError}</Text>
            </View>
            <Btn
              title="Thử lại"
              icon="refresh-cw"
              variant="soft"
              small
              style={{ marginTop: 12, alignSelf: 'flex-start' }}
              onPress={() => loadMonthData(selMonth, selYear, { silent: false })}
            />
          </Card>
        ) : monthLoading && !refreshing && !initialTodayLoading ? (
          <Card style={st.loadingCard}>
            <ActivityIndicator color={C.primary} />
            <Text style={ui.meta}>Đang tải bảng công tháng {pad2(selMonth)}/{selYear}…</Text>
          </Card>
        ) : monthLoading && !refreshing && initialTodayLoading ? null : (
          <>
            {summary ? (
              <Card style={st.summaryCard}>
                <View style={st.summaryGrid}>
                  <View style={[st.summaryCell, { backgroundColor: C.primarySoft }]}>
                    <Text style={[st.summaryVal, { color: C.primary }]}>{summary.workedDays ?? 0}</Text>
                    <Text style={st.summaryLabel}>Ngày công</Text>
                  </View>
                  <View style={[st.summaryCell, { backgroundColor: C.greenSoft }]}>
                    <Text style={[st.summaryVal, { color: C.greenInk }]}>{summary.approvedShifts ?? 0}</Text>
                    <Text style={st.summaryLabel}>Ca đã duyệt</Text>
                  </View>
                  <View style={[st.summaryCell, { backgroundColor: C.goldSoft }]}>
                    <Text style={[st.summaryVal, { color: C.goldInk }]}>{summary.pendingShifts ?? 0}</Text>
                    <Text style={st.summaryLabel}>Ca chờ duyệt</Text>
                  </View>
                  <View style={[st.summaryCell, { backgroundColor: C.redSoft }]}>
                    <Text style={[st.summaryVal, { color: C.redInk }]}>{summary.rejectedShifts ?? 0}</Text>
                    <Text style={st.summaryLabel}>Ca bị từ chối</Text>
                  </View>
                  <View style={[st.summaryCell, { backgroundColor: C.surface }]}>
                    <Text style={[st.summaryVal, { color: C.ink2 }]}>{summary.dayOffCount ?? 0}</Text>
                    <Text style={st.summaryLabel}>Ngày nghỉ</Text>
                  </View>
                </View>
              </Card>
            ) : null}

            {!monthAttendance || monthDays.length === 0 ? (
              <Card style={st.emptyCard}>
                <Text style={st.emptyTitle}>Chưa có dữ liệu chấm công tháng này</Text>
              </Card>
            ) : (
              monthDays.map((day, idx) => {
                const wk = getVnWeekdayInfo(day.date, day.dayType);
                const dayShifts = sortTechShifts(Array.isArray(day.shifts) ? day.shifts : []);
                return (
                  <Card key={String(day.attendanceId || day.date || idx)} style={st.dayCard}>
                    <View style={st.dayHead}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                        <Text style={[st.dayDate, wk.isSunday && { color: C.redInk }]}>
                          {formatVnDateDm(day.date)}
                        </Text>
                        <View style={[st.wkPill, wk.isSunday && { backgroundColor: C.redSoft }]}>
                          <Text style={[st.wkText, wk.isSunday && { color: C.redInk }]}>{wk.label}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {day.isDayOff ? <Badge text="Nghỉ" fg={C.muted} bg={C.surface} /> : null}
                        {day.isLocked ? (
                          <View style={st.lockPill}>
                            <AppIcon name="lock" size={12} color={C.ink2} strokeWidth={2.2} />
                            <Text style={st.lockText}>Đã chốt</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {day.note ? <Text style={[ui.meta, { marginTop: 6 }]}>Ghi chú ngày: {toVietnamese(day.note, 'Không có ghi chú thêm')}</Text> : null}

                    {dayShifts.length === 0 ? (
                      <Text style={[ui.meta, { marginTop: 8 }]}>
                        {day.isDayOff ? 'Ngày nghỉ không phát sinh ca làm.' : 'Không có ca làm ghi nhận.'}
                      </Text>
                    ) : (
                      dayShifts.map((sh, sIdx) => {
                        const shStatusKey = String(sh.status || '').toLowerCase();
                        const sMeta = ATT_STATUS_META[shStatusKey] || { label: toVietnamese(sh.status, 'Đang cập nhật') || '—', fg: C.ink2, bg: C.surface };
                        const checkHm = formatVnTimeHm(sh.checkedInAt);
                        const isByManager = sh.source && sh.source !== 'self';
                        const matchedShift = identifyTechWorkShift(sh);
                        const shName = sh.shiftName || sh.shiftCode || 'Ca làm việc';
                        const showShiftBadge = Boolean(
                          matchedShift && !new RegExp(matchedShift.label.replace(/\s+/g, '\\s*'), 'i').test(shName),
                        );
                        return (
                          <View
                            key={String(sh.entryId || `${sh.technicianShiftId || ''}-${sIdx}`)}
                            style={[st.dayShiftRow, sIdx === 0 && { borderTopWidth: 0, paddingTop: 10 }]}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={st.dayShiftName}>{shName}</Text>
                                <Text style={[ui.meta, { marginTop: 2 }]}>
                                  {sh.startTime || '—'} – {sh.endTime || '—'}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {showShiftBadge ? <Badge text={matchedShift.label} fg={C.primary} bg={C.primarySoft} /> : null}
                                <Badge text={sMeta.label} fg={sMeta.fg} bg={sMeta.bg} />
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                              {checkHm ? (
                                <Text style={[ui.meta, { marginTop: 0 }]}>Vào ca: {checkHm}</Text>
                              ) : null}
                              {isByManager ? (
                                <Badge text="Quản lý ghi nhận" fg={C.primary} bg={C.primarySoft} />
                              ) : null}
                            </View>

                            {shStatusKey === 'rejected' && sh.rejectReason ? (
                              <Text style={st.rejectText}>Lý do từ chối: {toVietnamese(sh.rejectReason, 'Không có lý do cụ thể')}</Text>
                            ) : null}
                            {sh.checkIn?.note ? (
                              <Text style={[ui.meta, { marginTop: 4 }]}>Ghi chú: {toVietnamese(sh.checkIn.note, sh.checkIn.note)}</Text>
                            ) : null}
                          </View>
                        );
                      })
                    )}
                  </Card>
                );
              })
            )}
          </>
        )}

        {/* C. VI PHẠM */}
        <View style={[st.secHead, { marginTop: 22 }]}>
          <View style={st.secTitleRow}>
            <AppIcon name="alert-triangle" size={18} color={C.red} strokeWidth={2.2} />
            <Text style={st.secTitle}>Vi phạm (Tháng {pad2(selMonth)}/{selYear})</Text>
          </View>
        </View>

        {violationsError ? (
          <Card style={st.errCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AppIcon name="alert-triangle" size={20} color={C.red} />
              <Text style={st.errText}>{violationsError}</Text>
            </View>
            <Btn
              title="Thử lại"
              icon="refresh-cw"
              variant="soft"
              small
              style={{ marginTop: 12, alignSelf: 'flex-start' }}
              onPress={() => loadMonthData(selMonth, selYear, { silent: false })}
            />
          </Card>
        ) : violationsLoading && !refreshing && !initialTodayLoading ? (
          <Card style={st.loadingCard}>
            <ActivityIndicator color={C.primary} />
            <Text style={ui.meta}>Đang tải danh sách vi phạm…</Text>
          </Card>
        ) : violationsLoading && !refreshing && initialTodayLoading ? null : (
          <Card style={st.vioSummaryCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View>
                <Text style={[ui.meta, { marginTop: 0 }]}>Số lần vi phạm</Text>
                <Text style={st.vioCount}>{violations.summary.count} lần</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[ui.meta, { marginTop: 0 }]}>Tổng tiền phạt</Text>
                <Text style={[st.vioTotal, violations.summary.totalFine > 0 && { color: C.red }]}>
                  {formatVND(violations.summary.totalFine)}
                </Text>
              </View>
            </View>

            {violations.items.length === 0 ? (
              <Text style={[ui.meta, { marginTop: 12, textAlign: 'center' }]}>
                Không có vi phạm trong tháng này.
              </Text>
            ) : (
              violations.items.map((v, idx) => (
                <View key={String(v.id || idx)} style={st.vioRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={st.vioDate}>{formatVnDateDmy(v.date)}</Text>
                    <Text style={st.vioFine}>-{formatVND(v.fineAmount)}</Text>
                  </View>
                  <Text style={st.vioDesc}>{toVietnamese(v.description, 'Vi phạm quy định') || 'Vi phạm quy định'}</Text>
                  {v.recordedBy?.fullName ? (
                    <Text style={[ui.meta, { marginTop: 3 }]}>Người ghi: {v.recordedBy.fullName}</Text>
                  ) : null}
                </View>
              ))
            )}
          </Card>
        )}
      </ScrollView>

      {/* DIALOG XÁC NHẬN VÀO CA */}
      <Sheet
        visible={Boolean(confirmShift && confirmLoc)}
        onClose={() => {
          if (submitting) return;
          setConfirmShift(null);
          setConfirmLoc(null);
        }}
        title="Xác nhận vào ca"
        footer={(
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn
              title="Huỷ"
              variant="outline"
              style={{ flex: 1 }}
              disabled={submitting}
              onPress={() => {
                setConfirmShift(null);
                setConfirmLoc(null);
              }}
            />
            <Btn
              title={submitting ? 'Đang gửi…' : 'Xác nhận vào ca'}
              icon="check-circle-2"
              style={{ flex: 1.5 }}
              disabled={submitting}
              onPress={handleConfirmCheckIn}
            />
          </View>
        )}
      >
        {confirmShift && confirmLoc ? (
          <View>
            <View style={st.confirmBox}>
              <Text style={st.confirmName}>{confirmShift.name || 'Ca làm việc'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <AppIcon name="clock" size={15} color={C.muted} />
                <Text style={st.shiftTime}>
                  {confirmShift.startTime || '—'} – {confirmShift.endTime || '—'}
                  {confirmShift.crossesMidnight ? ' (qua đêm)' : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <AppIcon name="map-pin" size={15} color={C.primary} />
                <Text style={st.gpsLine}>Độ chính xác vị trí ±{confirmLoc.accuracy}m</Text>
              </View>
            </View>

            <Field
              label="Ghi chú (tùy chọn)"
              value={checkInNote}
              onChangeText={(txt) => {
                setCheckInNote(txt);
                if (noteError) setNoteError(validateCheckInNote(txt) || '');
              }}
              placeholder="VD: Vào ca tại nhà khách (3–500 ký tự, có thể bỏ trống)"
              multiline
              numberOfLines={3}
              maxLength={500}
              error={noteError}
              style={{ marginTop: 14 }}
            />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  secHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  secTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  secTitle: { fontSize: 16, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  loadingCard: { alignItems: 'center', paddingVertical: 22, gap: 8 },
  errCard: { borderColor: C.redBorder, backgroundColor: C.redSoft },
  errText: { flex: 1, fontSize: 13.5, color: C.redInk, fontWeight: '600', lineHeight: 19 },
  emptyCard: { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 18 },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 14.5, fontWeight: '700', color: C.ink, textAlign: 'center' },
  shiftCard: { marginBottom: 10, ...shadow.sm },
  shiftName: { fontSize: 15.5, fontWeight: '800', color: C.ink, lineHeight: 21 },
  shiftTime: { fontSize: 13.5, fontWeight: '600', color: C.ink2 },
  recordedBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    gap: 6,
  },
  rejectText: { fontSize: 12.5, color: C.redInk, fontWeight: '600', marginTop: 4, lineHeight: 18 },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  monthTitle: { fontSize: 15.5, fontWeight: '800', color: C.ink },
  summaryCard: { marginBottom: 10, padding: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCell: {
    minWidth: '30%',
    flexGrow: 1,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  summaryVal: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  summaryLabel: { fontSize: 11, color: C.muted, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  dayCard: { marginBottom: 10 },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayDate: { fontSize: 15, fontWeight: '900', color: C.ink },
  wkPill: { backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  wkText: { fontSize: 11.5, fontWeight: '700', color: C.ink2 },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surface,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: C.line,
  },
  lockText: { fontSize: 11.5, fontWeight: '700', color: C.ink2 },
  dayShiftRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
  },
  dayShiftName: { fontSize: 14, fontWeight: '800', color: C.ink },
  vioSummaryCard: { marginBottom: 10 },
  vioCount: { fontSize: 17, fontWeight: '900', color: C.ink, marginTop: 2 },
  vioTotal: { fontSize: 17, fontWeight: '900', color: C.ink, marginTop: 2 },
  vioRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
  },
  vioDate: { fontSize: 13, fontWeight: '700', color: C.muted },
  vioFine: { fontSize: 14, fontWeight: '800', color: C.red },
  vioDesc: { fontSize: 14, color: C.ink, fontWeight: '600', marginTop: 4, lineHeight: 19 },
  confirmBox: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  confirmName: { fontSize: 16, fontWeight: '800', color: C.ink },
  gpsLine: { fontSize: 13.5, fontWeight: '700', color: C.primary },
});

export default TechAttendanceScreen;
