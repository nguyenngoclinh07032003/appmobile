import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, R, shadow } from '../../theme';
import { formatVND } from '../../constants/data';
import { useApp } from '../../context/AppContext';
import { hrmssApi } from '../../services/api';
import { subscribeSocketEvent } from '../../services/socketService';
import {
  AppIcon, Badge, Btn, Card, EmptyState, Field, Segmented, Tap, TopBar, ui,
} from '../../components';

const HANDOVER_STATUS_META = {
  SUBMITTED: { label: 'Chờ văn phòng duyệt', fg: '#92400E', bg: '#FEF3C7' },
  CONFIRMED: { label: 'Đã xác nhận nhận tiền', fg: '#065F46', bg: '#D1FAE5' },
  REJECTED: { label: 'Bị từ chối', fg: '#991B1B', bg: '#FEE2E2' },
};

const HISTORY_FILTERS = [
  { id: '', label: 'Tất cả' },
  { id: 'SUBMITTED', label: 'Chờ duyệt' },
  { id: 'CONFIRMED', label: 'Đã nhận' },
  { id: 'REJECTED', label: 'Từ chối' },
];

const fmtDt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${hh}:${mm} · ${dd}/${mo}/${d.getFullYear()}`;
};

export function TechHandoversScreen({ params }) {
  const { ui: u } = useApp();
  const [tab, setTab] = useState(params?.tab === 'history' ? 'history' : 'pending');
  const [pendingItems, setPendingItems] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [notes, setNotes] = useState('');
  const [historyItems, setHistoryItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);

  const loadPending = useCallback(async () => {
    const res = await hrmssApi.getTechnicianPendingHandovers();
    if (!res.ok) {
      if (res.status === 404) setApiUnavailable(true);
      return;
    }
    setApiUnavailable(false);
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    setPendingItems(items);
    setPendingTotal(Number(res.data?.total_amount) || 0);
    // Mặc định chọn toàn bộ khoản tiền mặt chưa nộp (theo tài liệu FE_CASH_HANDOVER_RECORDS_BILL).
    setSelectedIds(new Set(items.map((it) => String(it.payment_id))));
  }, []);

  const loadHistory = useCallback(async (st = statusFilter) => {
    const res = await hrmssApi.getTechnicianHandovers({ status: st, page: 1, limit: 30 });
    if (!res.ok) {
      if (res.status === 404) setApiUnavailable(true);
      return;
    }
    setApiUnavailable(false);
    setHistoryItems(Array.isArray(res.data?.items) ? res.data.items : []);
  }, [statusFilter]);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      await Promise.all([loadPending(), loadHistory(statusFilter)]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadPending, loadHistory, statusFilter]);

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  useEffect(() => {
    if (params?.tab === 'history') setTab('history');
  }, [params?.tab]);

  // Tự tải lại khi có thông báo HANDOVER_CONFIRMED / HANDOVER_REJECTED qua socket.
  useEffect(() => {
    const off = subscribeSocketEvent('notification:new', (n) => {
      const nType = n?.notification_type || n?.type;
      if (nType === 'HANDOVER_CONFIRMED' || nType === 'HANDOVER_REJECTED') {
        loadAll(false);
      }
    });
    return off;
  }, [loadAll]);

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
    if (selectedIds.size === 0) {
      u.alert('Chưa chọn khoản nào', 'Chọn ít nhất một khoản tiền mặt để nộp cho văn phòng.', '💵');
      return;
    }
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
      u.toast(`Đã gửi đợt nộp ${formatVND(selectedAmount)}`, '✅');
      await loadAll(false);
      setTab('history');
    } finally {
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
            { id: 'history', label: `Lịch sử (${historyItems.length})` },
          ]}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor={C.primary} colors={[C.primary]} />}
      >
        {apiUnavailable ? (
          <Card style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
            <Text style={{ fontWeight: '800', color: '#92400E' }}>Máy chủ chưa cập nhật API bàn giao tiền</Text>
            <Text style={{ color: '#78350F', marginTop: 4, lineHeight: 20 }}>
              Tính năng bàn giao tiền mặt cần backend bản mới trên VPS. Kéo làm mới lại sau khi backend deploy xong.
            </Text>
          </Card>
        ) : null}

        {tab === 'pending' ? (
          <>
            <Card style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', ...shadow.sm }}>
              <Text style={{ color: C.ink2, fontSize: 12.5, fontWeight: '600' }}>Tổng tiền mặt đang giữ chưa nộp</Text>
              <Text style={{ fontSize: 26, fontWeight: '900', color: C.primary, marginTop: 4 }}>{formatVND(pendingTotal)}</Text>
              <Text style={[ui.meta, { marginTop: 4 }]}>{pendingItems.length} khoản tiền mặt đã xác nhận từ khách</Text>
            </Card>

            {pendingItems.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title={loading ? 'Đang tải…' : 'Không còn tiền mặt chờ nộp'}
                sub="Mọi khoản tiền mặt bạn thu đã được lập đợt nộp hoặc chưa có khoản mới."
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
        ) : (
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
                      loadHistory(f.id);
                    }}
                  >
                    <Text style={[hs.chipText, active && hs.chipTextActive]}>{f.label}</Text>
                  </Tap>
                );
              })}
            </ScrollView>

            {historyItems.length === 0 ? (
              <EmptyState
                icon="receipt"
                title={loading ? 'Đang tải…' : 'Chưa có đợt nộp tiền nào'}
                sub="Các đợt bàn giao tiền mặt bạn gửi về văn phòng sẽ hiển thị tại đây."
              />
            ) : (
              historyItems.map((h) => {
                const meta = HANDOVER_STATUS_META[h.handover_status] || { label: h.handover_status, fg: C.ink2, bg: '#F1F5F9' };
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
                      <View style={[hs.noteBox, h.handover_status === 'REJECTED' && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                        <Text style={{ color: h.handover_status === 'REJECTED' ? '#991B1B' : C.ink2, fontSize: 13, lineHeight: 19 }}>
                          {h.notes}
                        </Text>
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {tab === 'pending' && pendingItems.length > 0 ? (
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
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#94A3B8',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  checkboxOn: { backgroundColor: C.primary, borderColor: C.primary },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: C.ink2 },
  chipTextActive: { color: '#fff' },
  itemsBox: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  noteBox: { marginTop: 8, padding: 10, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
});
