import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, R, shadow } from '../../theme';
import { formatVND } from '../../constants/data';
import { toVnParts } from '../../utils/vnTime';
import { useApp } from '../../context/AppContext';
import { hrmssApi } from '../../services/api';
import { subscribeSocketEvent } from '../../services/socketService';
import { toVietnamese } from '../../utils/viText';
import {
  AppIcon, Badge, Btn, Card, EmptyState, Field, Segmented, Tap, TopBar, ui,
} from '../../components';

const HANDOVER_STATUS_META = {
  SUBMITTED: { label: 'Chờ văn phòng duyệt', fg: C.goldInk, bg: C.goldSoft },
  CONFIRMED: { label: 'Đã xác nhận nhận tiền', fg: C.greenInk, bg: C.greenSoft },
  REJECTED: { label: 'Bị từ chối', fg: C.redInk, bg: C.redSoft },
};

const HISTORY_FILTERS = [
  { id: '', label: 'Tất cả' },
  { id: 'SUBMITTED', label: 'Chờ duyệt' },
  { id: 'CONFIRMED', label: 'Đã nhận' },
  { id: 'REJECTED', label: 'Từ chối' },
];

const fmtDt = (iso) => {
  if (!iso) return '—';
  const p = toVnParts(iso);
  if (!p) return String(iso);
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  const mo = String(p.month).padStart(2, '0');
  return `${hh}:${mm} · ${dd}/${mo}/${p.year}`;
};

export function TechHandoversScreen({ params }) {
  const { s, ui: u } = useApp();
  const [tab, setTab] = useState(params?.tab === 'history' ? 'history' : 'pending');
  const [pendingItems, setPendingItems] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [notes, setNotes] = useState('');
  const [historyItems, setHistoryItems] = useState([]);
  const [historyTotalCount, setHistoryTotalCount] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingApiUnavailable, setPendingApiUnavailable] = useState(false);
  const [historyApiUnavailable, setHistoryApiUnavailable] = useState(false);
  const apiUnavailable = tab === 'pending' ? pendingApiUnavailable : historyApiUnavailable;
  const [pendingError, setPendingError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const loadError = tab === 'pending' ? pendingError : historyError;
  const statusFilterRef = useRef(statusFilter);
  statusFilterRef.current = statusFilter;
  const submittingRef = useRef(false);
  const historyReqSeqRef = useRef(0);
  const hasLoadedPendingRef = useRef(false);
  const prevPendingIdsRef = useRef(new Set());
  const lastAutoRefreshRef = useRef(0);

  const loadPending = useCallback(async () => {
    const res = await hrmssApi.getTechnicianPendingHandovers();
    if (!res.ok) {
      if (res.status === 404) {
        setPendingApiUnavailable(true);
        setPendingError('');
      } else {
        setPendingError(res.message || 'Không tải được danh sách tiền mặt chờ nộp. Kiểm tra mạng và thử lại.');
      }
      return;
    }
    setPendingApiUnavailable(false);
    setPendingError('');
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    setPendingItems(items);
    setPendingTotal(Number(res.data?.total_amount) || 0);
    // Mặc định chọn toàn bộ ở lần tải đầu; các lần làm mới sau giữ nguyên lựa chọn bỏ tick của thợ và chỉ tự chọn khoản mới.
    const nextIds = items.map((it) => String(it.payment_id));
    const nextSet = new Set(nextIds);
    if (!hasLoadedPendingRef.current) {
      hasLoadedPendingRef.current = true;
      setSelectedIds(nextSet);
    } else {
      const prevKnown = prevPendingIdsRef.current;
      setSelectedIds((prevSelected) => {
        const nextSelected = new Set();
        nextIds.forEach((id) => {
          if (prevSelected.has(id) || !prevKnown.has(id)) {
            nextSelected.add(id);
          }
        });
        return nextSelected;
      });
    }
    prevPendingIdsRef.current = nextSet;
  }, []);

  const loadHistory = useCallback(async (st = statusFilterRef.current, { clearOnStart = false } = {}) => {
    const reqId = ++historyReqSeqRef.current;
    setHistoryLoading(true);
    if (clearOnStart) {
      setHistoryItems([]);
      setHistoryError('');
    }
    try {
      const res = await hrmssApi.getTechnicianHandovers({ status: st, page: 1, limit: 30 });
      if (reqId !== historyReqSeqRef.current) return;
      if (!res.ok) {
        if (clearOnStart) setHistoryItems([]);
        if (res.status === 404) {
          setHistoryApiUnavailable(true);
          setHistoryError('');
        } else {
          setHistoryError(res.message || 'Không tải được lịch sử bàn giao tiền mặt. Kiểm tra mạng và thử lại.');
        }
        return;
      }
      setHistoryApiUnavailable(false);
      setHistoryError('');
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      setHistoryItems(items);
      if (!st) {
        const totalCnt = res.data?.pagination?.total ?? res.data?.total;
        setHistoryTotalCount(totalCnt != null ? Number(totalCnt) : items.length);
      }
    } finally {
      if (reqId === historyReqSeqRef.current) setHistoryLoading(false);
    }
  }, []);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      await Promise.all([loadPending(), loadHistory(statusFilterRef.current)]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadPending, loadHistory]);

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  useEffect(() => {
    if (params?.tab === 'history') setTab('history');
  }, [params?.tab]);

  const triggerAutoRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoRefreshRef.current < 1500) return;
    lastAutoRefreshRef.current = now;
    loadAll(false);
  }, [loadAll]);

  // Tự tải lại khi có thông báo HANDOVER_CONFIRMED / HANDOVER_REJECTED qua socket hoặc đồng bộ thông báo.
  useEffect(() => {
    const off = subscribeSocketEvent('notification:new', (n) => {
      const nType = n?.notification_type || n?.type;
      if (nType === 'HANDOVER_CONFIRMED' || nType === 'HANDOVER_REJECTED') {
        triggerAutoRefresh();
      }
    });
    return off;
  }, [triggerAutoRefresh]);

  const handoverNotifSig = useMemo(
    () =>
      (s?.techNotifs || [])
        .filter((n) => ['HANDOVER_CONFIRMED', 'HANDOVER_REJECTED'].includes(String(n?.type || '').toUpperCase()))
        .map((n) => `${n.at || 0}:${n.id || ''}`)
        .join('|'),
    [s?.techNotifs],
  );
  const prevHandoverNotifSigRef = useRef(handoverNotifSig);
  useEffect(() => {
    if (handoverNotifSig !== prevHandoverNotifSigRef.current) {
      prevHandoverNotifSigRef.current = handoverNotifSig;
      triggerAutoRefresh();
    }
  }, [handoverNotifSig, triggerAutoRefresh]);

  const selectedAmount = useMemo(
    () => pendingItems
      .filter((it) => selectedIds.has(String(it.payment_id)))
      .reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
    [pendingItems, selectedIds],
  );

  const allSelected = pendingItems.length > 0 && pendingItems.every((it) => selectedIds.has(String(it.payment_id)));

  const toggleItem = (pid) => {
    const key = String(pid);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(pendingItems.map((it) => String(it.payment_id))));
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (selectedIds.size === 0) {
      u.alert('Chưa chọn khoản nào', 'Chọn ít nhất một khoản tiền mặt để nộp cho văn phòng.', '💵');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await hrmssApi.submitTechnicianHandover({
        payment_ids: [...selectedIds],
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        if (res.code === 'PAYMENT_ALREADY_HANDED_OVER') {
          u.alert('Khoản đã được nộp trước đó', 'Một số khoản đã nằm trong đợt nộp khác. Danh sách vừa được làm mới.', 'ℹ️');
          await loadPending();
          return;
        }
        if (res.code === 'PAYMENT_NOT_HANDOVERABLE') {
          u.alert('Không thể nộp khoản này', 'Chỉ nộp được các khoản tiền mặt đã xác nhận của chính bạn.', '⚠️');
          await loadPending();
          return;
        }
        u.alert('Chưa nộp được', res.message || 'Vui lòng thử lại.', '⚠️');
        return;
      }
      setNotes('');
      setStatusFilter('');
      statusFilterRef.current = '';
      u.toast(`Đã gửi đợt nộp ${formatVND(selectedAmount)}`, '✅');
      await loadAll(false);
      setTab('history');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Bàn giao tiền mặt" sub="Nộp tiền thu khách về văn phòng" />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { id: 'pending', label: `Nộp tiền (${pendingItems.length})` },
            { id: 'history', label: `Lịch sử (${historyTotalCount != null ? historyTotalCount : historyItems.length})` },
          ]}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor={C.primary} colors={[C.primary]} />}
      >
        {apiUnavailable ? (
          <Card style={{ backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
            <Text style={{ fontWeight: '800', color: C.goldInk }}>Hệ thống chưa hỗ trợ tính năng bàn giao tiền mặt</Text>
            <Text style={{ color: C.ink2, marginTop: 4, lineHeight: 20 }}>
              Tính năng bàn giao tiền mặt đang chờ máy chủ cập nhật phiên bản mới. Vui lòng kéo làm mới lại sau.
            </Text>
          </Card>
        ) : loadError ? (
          <Card style={{ backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.red, marginBottom: 12 }}>
            <Text style={{ fontWeight: '800', color: C.redInk }}>Không tải được dữ liệu bàn giao</Text>
            <Text style={{ color: C.ink2, marginTop: 4, lineHeight: 20 }}>{loadError}</Text>
            <Btn title="Thử lại" small variant="soft" style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => loadAll(false)} />
          </Card>
        ) : null}

        {tab === 'pending' ? (
          pendingApiUnavailable || (pendingError && pendingItems.length === 0) ? null : loading && pendingItems.length === 0 ? (
            <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 10 }}>
              <ActivityIndicator color={C.primary} />
              <Text style={ui.meta}>Đang tải danh sách tiền mặt chờ nộp…</Text>
            </Card>
          ) : (
          <>
            <Card style={{ backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary, ...shadow.sm }}>
              <Text style={{ color: C.ink2, fontSize: 12.5, fontWeight: '600' }}>Tổng tiền mặt đang giữ chưa nộp</Text>
              <Text style={{ fontSize: 26, fontWeight: '900', color: C.primary, marginTop: 4 }}>{formatVND(pendingTotal)}</Text>
              <Text style={[ui.meta, { marginTop: 4 }]}>{pendingItems.length} khoản tiền mặt đã xác nhận từ khách</Text>
            </Card>

            {pendingItems.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title="Không còn tiền mặt chờ nộp"
                body="Mọi khoản tiền mặt bạn thu đã được lập đợt nộp hoặc chưa có khoản mới."
              />
            ) : (
              <>
                <View style={hs.rowHead}>
                  <Text style={hs.secTitle}>Chọn khoản cần nộp</Text>
                  <Tap onPress={toggleAll}>
                    <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>
                      {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </Text>
                  </Tap>
                </View>

                <Card style={{ paddingVertical: 6 }}>
                  {pendingItems.map((it, idx) => {
                    const checked = selectedIds.has(String(it.payment_id));
                    return (
                      <Tap
                        key={it.payment_id}
                        style={[hs.payRow, idx === pendingItems.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => toggleItem(it.payment_id)}
                      >
                        <View style={[hs.checkbox, checked && hs.checkboxOn]}>
                          {checked ? <AppIcon name="check" size={14} color="#fff" strokeWidth={3} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '800', color: C.ink }}>{it.request_code || `Đơn #${it.request_id}`}</Text>
                          <Text style={ui.meta}>Thu lúc {fmtDt(it.paid_at)}</Text>
                        </View>
                        <Text style={{ fontWeight: '800', color: C.ink }}>{formatVND(it.amount)}</Text>
                      </Tap>
                    );
                  })}
                </Card>

                <Card style={{ marginTop: 12 }}>
                  <Text style={hs.secTitle}>Ghi chú đợt nộp (tùy chọn)</Text>
                  <Field
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="VD: Nộp tiền mặt ca sáng ngày 17/11…"
                    multiline
                    maxLength={1000}
                    style={{ marginTop: 8 }}
                  />
                </Card>
              </>
            )}
          </>
          )
        ) : (
          historyApiUnavailable ? null : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
              {HISTORY_FILTERS.map((f) => {
                const active = statusFilter === f.id;
                return (
                  <Tap
                    key={f.id || 'all'}
                    style={[hs.chip, active && hs.chipActive]}
                    onPress={() => {
                      setStatusFilter(f.id);
                      loadHistory(f.id, { clearOnStart: true });
                    }}
                  >
                    <Text style={[hs.chipText, active && hs.chipTextActive]}>{f.label}</Text>
                  </Tap>
                );
              })}
            </ScrollView>

            {historyError ? null : historyLoading && historyItems.length === 0 ? (
              <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 10 }}>
                <ActivityIndicator color={C.primary} />
                <Text style={ui.meta}>Đang tải lịch sử bàn giao…</Text>
              </Card>
            ) : historyItems.length === 0 ? (
              <EmptyState
                icon="receipt-text"
                title="Chưa có đợt nộp tiền nào"
                body="Các đợt bàn giao tiền mặt bạn gửi về văn phòng sẽ hiển thị tại đây."
              />
            ) : (
              historyItems.map((h) => {
                const statusUpper = String(h.handover_status || '').toUpperCase();
                const isRejected = statusUpper === 'REJECTED';
                const meta = HANDOVER_STATUS_META[statusUpper] || { label: toVietnamese(h.handover_status, 'Đang cập nhật'), fg: C.ink2, bg: C.surface };
                const items = Array.isArray(h.items) ? h.items : [];
                return (
                  <Card key={h.handover_id} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontWeight: '900', color: C.ink, fontSize: 15 }}>Đợt #{h.handover_id}</Text>
                      <Badge text={meta.label} fg={meta.fg} bg={meta.bg} />
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: C.primary, marginTop: 6 }}>{formatVND(h.total_amount)}</Text>
                    <Text style={[ui.meta, { marginTop: 2 }]}>Gửi lúc {fmtDt(h.submitted_at)}</Text>
                    {h.confirmed_at ? (
                      <Text style={ui.meta}>Xử lý lúc {fmtDt(h.confirmed_at)}</Text>
                    ) : null}

                    {items.length > 0 ? (
                      <View style={hs.itemsBox}>
                        {items.map((it) => (
                          <View key={`${h.handover_id}-${it.payment_id}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                            <Text style={{ color: C.ink2, fontSize: 13 }}>{it.request_code || `Đơn #${it.request_id}`}</Text>
                            <Text style={{ color: C.ink, fontWeight: '700', fontSize: 13 }}>{formatVND(it.amount)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {h.notes ? (
                      <View style={[hs.noteBox, isRejected && { backgroundColor: C.redSoft, borderColor: C.redBorder }]}>
                        <Text style={{ color: isRejected ? C.redInk : C.ink2, fontSize: 13, lineHeight: 19 }}>
                          {toVietnamese(h.notes, 'Ghi chú đối soát')}
                        </Text>
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </>
          )
        )}
      </ScrollView>

      {tab === 'pending' && !pendingApiUnavailable && pendingItems.length > 0 ? (
        <View style={hs.footer}>
          <Btn
            title={submitting ? 'Đang gửi…' : `Nộp ${selectedIds.size} khoản · ${formatVND(selectedAmount)}`}
            icon="send"
            disabled={submitting || selectedIds.size === 0}
            onPress={handleSubmit}
          />
        </View>
      ) : null}
    </View>
  );
}

const hs = StyleSheet.create({
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 8 },
  secTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  payRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.surface,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.faint,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.card,
  },
  checkboxOn: { backgroundColor: C.primary, borderColor: C.primary },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: C.ink2 },
  chipTextActive: { color: C.card },
  itemsBox: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.surface },
  noteBox: { marginTop: 8, padding: 10, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line,
  },
});
