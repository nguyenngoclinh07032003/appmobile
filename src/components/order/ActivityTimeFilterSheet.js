import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, R } from '../../theme';
import { AppIcon, Btn, Sheet, Tap } from '../common';
import {
  ACTIVITY_SLOT_PERIODS,
  ACTIVITY_TIME_PRESETS,
  DEFAULT_ACTIVITY_TIME_FILTER,
  buildCalendarMonth,
  filterAndSortOrders,
  formatDmyFromYmd,
  getTimePresetBounds,
  resolveOrderDateKey,
  shiftYearMonth,
} from '../../utils/activityFilter';
import { vnDateKey } from '../../utils/vnTime';

const WEEKDAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const parseYearMonth = (ymd, fallbackYmd) => {
  const src = /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) ? ymd : fallbackYmd;
  const parts = String(src || '').split('-');
  return {
    calYear: Number(parts[0]) || 2026,
    calMonth: Number(parts[1]) || 1,
  };
};

export function ActivityTimeFilterSheet({
  visible,
  onClose,
  value,
  onApply,
  orders = [],
  nowYmd,
}) {
  const effectiveNow = nowYmd || vnDateKey();

  const buildInitialDraft = (src) => {
    const base = { ...DEFAULT_ACTIVITY_TIME_FILTER, ...(src || {}) };
    const ym = parseYearMonth(base.customFrom || effectiveNow, effectiveNow);
    return {
      ...base,
      pickingEnd: false,
      ...ym,
    };
  };

  const [draft, setDraft] = useState(() => buildInitialDraft(value));

  useEffect(() => {
    if (!visible) return;
    setDraft(buildInitialDraft(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value]);

  const orderDateCounts = useMemo(() => {
    const map = new Map();
    (orders || []).forEach((o) => {
      const k = resolveOrderDateKey(o);
      map.set(k, (map.get(k) || 0) + 1);
    });
    return map;
  }, [orders]);

  const previewCount = useMemo(
    () => filterAndSortOrders(orders, draft, effectiveNow).length,
    [orders, draft, effectiveNow],
  );

  const weeks = useMemo(
    () => buildCalendarMonth(draft.calYear, draft.calMonth),
    [draft.calYear, draft.calMonth],
  );

  const handleSelectPreset = (presetId) => {
    const bounds = getTimePresetBounds(presetId, effectiveNow);
    const targetYmd = bounds.from || effectiveNow;
    const ym = parseYearMonth(targetYmd, effectiveNow);
    setDraft((prev) => ({
      ...prev,
      preset: presetId,
      customFrom: null,
      customTo: null,
      ...(presetId === 'all' ? { slotPeriod: 'all' } : {}),
      pickingEnd: false,
      ...ym,
    }));
  };

  const handlePressDay = (ymd) => {
    setDraft((prev) => {
      if (prev.preset !== 'custom' || !prev.pickingEnd || !prev.customFrom) {
        return {
          ...prev,
          preset: 'custom',
          customFrom: ymd,
          customTo: ymd,
          pickingEnd: true,
        };
      }
      const [from, to] = ymd < prev.customFrom
        ? [ymd, prev.customFrom]
        : [prev.customFrom, ymd];
      return {
        ...prev,
        preset: 'custom',
        customFrom: from,
        customTo: to,
        pickingEnd: false,
      };
    });
  };

  const handleClearCustomDates = () => {
    setDraft((prev) => ({
      ...prev,
      preset: 'all',
      customFrom: null,
      customTo: null,
      pickingEnd: false,
    }));
  };

  const handleShiftMonth = (delta) => {
    setDraft((prev) => {
      const next = shiftYearMonth(prev.calYear, prev.calMonth, delta);
      return { ...prev, calYear: next.year, calMonth: next.month };
    });
  };

  const handleReset = () => {
    setDraft(buildInitialDraft(DEFAULT_ACTIVITY_TIME_FILTER));
  };

  const handleApply = () => {
    onApply?.({
      preset: draft.preset,
      customFrom: draft.customFrom,
      customTo: draft.customTo,
      slotPeriod: draft.slotPeriod,
      sort: draft.sort,
    });
    onClose?.();
  };

  const rangeFrom = draft.preset === 'custom' ? draft.customFrom : null;
  const rangeTo = draft.preset === 'custom' ? (draft.customTo || draft.customFrom) : null;
  const monthLabel = `Tháng ${String(draft.calMonth).padStart(2, '0')}/${draft.calYear}`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Bộ lọc thời gian"
      footer={(
        <View style={st.footerRow}>
          <Btn
            title="Đặt lại"
            icon="rotate-ccw"
            variant="ghost"
            style={{ flex: 0.9 }}
            onPress={handleReset}
          />
          <Btn
            title={`Áp dụng (${previewCount} đơn)`}
            variant="primary"
            style={{ flex: 1.5 }}
            onPress={handleApply}
          />
        </View>
      )}
    >
      <View style={{ paddingBottom: 8 }}>
        {/* 1. KHOẢNG THỜI GIAN NHANH */}
        <Text style={st.sectionLabel}>1. KHOẢNG THỜI GIAN NHANH</Text>
        <View style={st.chipGrid}>
          {ACTIVITY_TIME_PRESETS.map((p) => {
            const active = draft.preset === p.id;
            return (
              <Tap
                key={p.id}
                style={[st.chip, active && st.chipActive]}
                onPress={() => handleSelectPreset(p.id)}
              >
                <Text style={[st.chipText, active && st.chipTextActive]}>{p.label}</Text>
              </Tap>
            );
          })}
        </View>

        {/* 2. CHỌN NGÀY / KHOẢNG NGÀY TRÊN LỊCH */}
        <View style={st.sectionHeaderRow}>
          <Text style={[st.sectionLabel, { marginBottom: 0 }]}>2. CHỌN NGÀY / KHOẢNG NGÀY</Text>
          {draft.preset === 'custom' ? (
            <Tap onPress={handleClearCustomDates} hitSlop={6}>
              <Text style={st.clearLink}>Xoá ngày</Text>
            </Tap>
          ) : null}
        </View>
        <Text style={st.hintText}>
          Chạm 1 lần chọn 1 ngày · Chạm lần 2 chọn khoảng ngày
        </Text>

        <View style={st.rangeRow}>
          <View style={[st.rangeBox, draft.preset === 'custom' && rangeFrom && st.rangeBoxActive]}>
            <Text style={st.rangeLabel}>Từ ngày</Text>
            <Text style={[st.rangeValue, draft.preset === 'custom' && rangeFrom && { color: C.primary }]}>
              {rangeFrom ? formatDmyFromYmd(rangeFrom) : 'Chưa chọn'}
            </Text>
          </View>
          <AppIcon name="chevron-right" size={16} color={C.muted} />
          <View style={[st.rangeBox, draft.preset === 'custom' && rangeTo && st.rangeBoxActive]}>
            <Text style={st.rangeLabel}>Đến ngày</Text>
            <Text style={[st.rangeValue, draft.preset === 'custom' && rangeTo && { color: C.primary }]}>
              {rangeTo ? formatDmyFromYmd(rangeTo) : 'Chưa chọn'}
            </Text>
          </View>
        </View>

        <View style={st.calCard}>
          <View style={st.calHeader}>
            <Tap style={st.calNavBtn} onPress={() => handleShiftMonth(-1)} hitSlop={6}>
              <AppIcon name="chevron-left" size={18} color={C.ink} strokeWidth={2.2} />
            </Tap>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppIcon name="calendar" size={15} color={C.primary} strokeWidth={2.2} />
              <Text style={st.calMonthTitle}>{monthLabel}</Text>
            </View>
            <Tap style={st.calNavBtn} onPress={() => handleShiftMonth(1)} hitSlop={6}>
              <AppIcon name="chevron-right" size={18} color={C.ink} strokeWidth={2.2} />
            </Tap>
          </View>

          <View style={st.weekRow}>
            {WEEKDAY_HEADERS.map((wd) => (
              <View key={wd} style={st.dayCellWrap}>
                <Text style={st.weekdayText}>{wd}</Text>
              </View>
            ))}
          </View>

          {weeks.map((week, wIdx) => (
            <View key={`w-${wIdx}`} style={st.weekRow}>
              {week.map((cell, cIdx) => {
                if (!cell) {
                  return <View key={`e-${wIdx}-${cIdx}`} style={st.dayCellWrap} />;
                }
                const { day, ymd } = cell;
                const isStart = Boolean(rangeFrom && ymd === rangeFrom);
                const isEnd = Boolean(rangeTo && ymd === rangeTo);
                const isEdge = isStart || isEnd;
                const inBetween = Boolean(rangeFrom && rangeTo && ymd > rangeFrom && ymd < rangeTo);
                const isToday = ymd === effectiveNow;
                const hasOrders = (orderDateCounts.get(ymd) || 0) > 0;

                return (
                  <View key={ymd} style={st.dayCellWrap}>
                    <Tap
                      style={[
                        st.dayBtn,
                        inBetween && st.dayBtnBetween,
                        isEdge && st.dayBtnEdge,
                        isToday && !isEdge && st.dayBtnToday,
                      ]}
                      onPress={() => handlePressDay(ymd)}
                    >
                      <Text
                        style={[
                          st.dayText,
                          inBetween && { color: C.primary, fontWeight: '700' },
                          isEdge && { color: '#fff', fontWeight: '800' },
                          isToday && !isEdge && { color: C.primary, fontWeight: '800' },
                        ]}
                      >
                        {day}
                      </Text>
                      <View
                        style={[
                          st.orderDot,
                          {
                            backgroundColor: hasOrders
                              ? (isEdge ? '#fff' : C.primary)
                              : 'transparent',
                          },
                        ]}
                      />
                    </Tap>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* 3. KHUNG GIỜ HẸN */}
        <Text style={[st.sectionLabel, { marginTop: 18 }]}>3. KHUNG GIỜ HẸN</Text>
        <View style={st.chipGrid}>
          {ACTIVITY_SLOT_PERIODS.map((sp) => {
            const active = draft.slotPeriod === sp.id;
            return (
              <Tap
                key={sp.id}
                style={[st.chip, active && st.chipActive]}
                onPress={() => setDraft((prev) => ({ ...prev, slotPeriod: sp.id }))}
              >
                <AppIcon
                  name="clock"
                  size={13}
                  color={active ? '#fff' : C.ink2}
                  strokeWidth={2.1}
                  style={{ marginRight: 5 }}
                />
                <Text style={[st.chipText, active && st.chipTextActive]}>{sp.label}</Text>
              </Tap>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: C.ink2,
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  clearLink: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.primary,
  },
  hintText: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 10,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: R.pill || 999,
    borderWidth: 1.2,
    borderColor: C.line,
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink2,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  rangeBox: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: R.md || 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#F8FAFC',
  },
  rangeBoxActive: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  rangeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
  },
  rangeValue: {
    fontSize: 13,
    fontWeight: '800',
    color: C.ink,
    marginTop: 2,
  },
  calCard: {
    borderRadius: R.lg || 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#fff',
    padding: 10,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayCellWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  weekdayText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.muted,
    paddingVertical: 4,
  },
  dayBtn: {
    width: '92%',
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnBetween: {
    backgroundColor: C.primarySoft,
  },
  dayBtnEdge: {
    backgroundColor: C.primary,
  },
  dayBtnToday: {
    borderWidth: 1.5,
    borderColor: C.primary,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  orderDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sortBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: R.md || 12,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: '#fff',
  },
  sortBtnActive: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  sortBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink2,
  },
});
