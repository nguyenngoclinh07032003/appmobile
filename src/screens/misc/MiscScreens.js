import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Platform, Image, Linking } from 'react-native';
import { C, R, shadow, toneOf, STATUS_META, grad } from '../../theme';
import {
  ALL_SERVICES, CATEGORIES, POPULAR_SEARCHES, FAQ, ORDER_STEPS, HOTLINE, STATUS_DESC, stepIndexOf,
  getService, formatVND, normalize, catLabel, catIcon, tierOf, TIERS, TIME_SLOTS, MATERIALS, SAFETY_CHECKLIST_ITEMS,
} from '../../constants/data';
import {
  useApp, fmtDate, fmtDateTime, timeAgo, warrantyInfo, isActiveOrder, orderTotal, isPaid, isAwaitingPayment, amountRemaining,
  lateDiscountAmount, tierPartDiscountAmount, normalizeTechRep, getCancellationWindowStatus, isQRPayment,
} from '../../context';
import {
  Tap, Btn, IconBtn, IconBox, Card, TopBar, SectionTitle, Chip, Badge, Stars, Field, Sheet, Radio,
  EmptyState, ServiceGrid, ServiceRow, Progress, Media, ListRow, PseudoQR, HScroll, ui, AppIcon,
  TimeRangeSlider, minutesToSlotStr, minutesToTimeStr, resolveSemanticTone,
} from '../../components';
import { pickImage, validateVietnamesePhone, validateContactName } from '../../utils';
import {
  nextDays, minSelectableMinute, isDayOutOfSlots, clampToDay, parseSlotToMinutes, dayIndexOfKey, dobError,
  MAX_DAY_MINUTE, LEAD_MINUTES, SLOT_STEP_MINUTES, DEFAULT_SLOT_MINUTE,
} from '../../utils/dateTime';
import {
  APP_VERSION, PASSWORD_MIN_LENGTH, OTP_TTL_MINUTES, BASE_WARRANTY_DAYS, FREE_CANCEL_MIN_BEFORE,
} from '../../constants';
import {
  callAction, errorText, isOk, useBusy, NotFoundView,
} from '../shared/actionHelpers';
import { TrackingCard, VietQRPay } from '../../components/order';

const newAttId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
// "60 phút" → "1 tiếng" cho câu chữ chính sách huỷ.
const FREE_CANCEL_TEXT = FREE_CANCEL_MIN_BEFORE % 60 === 0 ? `${FREE_CANCEL_MIN_BEFORE / 60} tiếng` : `${FREE_CANCEL_MIN_BEFORE} phút`;
// Một số thông báo (techPolicy) còn ghi cứng số hotline cũ → thay bằng HOTLINE hiện hành.
const withHotline = (t) => (t ? String(t).replace(/1900\s?6868/g, HOTLINE) : t);

// =========================================================== TÌM KIẾM
export function SearchScreen() {
  const { s, a, nav } = useApp();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  // Debounce 250ms để tối ưu hiệu năng lọc danh sách khi người dùng gõ phím liên tục
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const results = useMemo(() => {
    const t = normalize(debouncedQ.trim());
    if (!t) return [];
    return ALL_SERVICES.filter((x) => normalize(`${x.name} ${catLabel(x.category)}`).includes(t));
  }, [debouncedQ, s.catalogVersion]); // catalogVersion đổi khi danh mục backend nạp xong → tìm lại trên dữ liệu mới
  const pick = (text) => {
    setQ(text);
    setDebouncedQ(text);
    a.addSearch(text);
  };

  const handleClear = () => {
    setQ('');
    setDebouncedQ('');
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={mx.searchBar}>
        <IconBtn icon="chevron-left" size={38} onPress={nav.back} label="Quay lại" />
        <View style={mx.searchBox}>
          <AppIcon name="search" size={16} color={C.muted} strokeWidth={2.2} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => a.addSearch(q)}
            placeholder="Tìm dịch vụ, thiết bị…"
            placeholderTextColor={C.faint}
            style={mx.searchInput}
            returnKeyType="search"
          />
          {q ? <Tap onPress={handleClear} hitSlop={8}><AppIcon name="x" size={16} color={C.faint} /></Tap> : null}
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        {!q.trim() ? (
          <View>
            {s.searches.length ? (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={mx.h}>Tìm kiếm gần đây</Text>
                  <Tap onPress={a.clearSearches}><Text style={[ui.link, { color: C.muted }]}>Xoá</Text></Tap>
                </View>
                <View style={mx.chips}>{s.searches.map((t) => <Chip key={t} icon="clock" label={t} onPress={() => pick(t)} />)}</View>
              </View>
            ) : null}
            <Text style={[mx.h, { marginTop: 18 }]}>Tìm kiếm phổ biến</Text>
            <View style={mx.chips}>{POPULAR_SEARCHES.map((t) => <Chip key={t} icon="flame" label={t} onPress={() => pick(t)} />)}</View>
            <Text style={[mx.h, { marginTop: 18 }]}>Danh mục</Text>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {CATEGORIES.map((c, i) => (
                <ListRow key={c.id} icon={c.icon} iconBg={toneOf(c.id).bg} label={c.label} last={i === CATEGORIES.length - 1} onPress={() => nav.services('bao-duong', c.id)} />
              ))}
            </Card>
          </View>
        ) : results.length === 0 ? (
          <EmptyState icon="search" title="Không tìm thấy dịch vụ" body={`Không có kết quả cho "${q}". Thử từ khoá khác hoặc gọi hotline ${HOTLINE} để được tư vấn.`} />
        ) : (
          <View>
            <Text style={[ui.meta, { marginBottom: 10 }]}>{results.length} kết quả cho "{q}"</Text>
            {results.map((it) => (
              <ServiceRow
                key={it.id}
                item={it}
                onPress={() => { a.addSearch(q); nav.push('detail', { id: it.id }); }}
                right={(
                  <Tap style={mx.addSq} onPress={() => a.addToCart(it.id)} hitSlop={6}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>+</Text>
                  </Tap>
                )}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// =========================================================== THÔNG BÁO
export function NotificationsScreen() {
  const { s, a, nav } = useApp();
  const [filter, setFilter] = useState('all');
  const list = s.notifications || [];
  const filtered = list.filter((n) => {
    if (filter === 'unread') return !n.read;
    if (filter === 'orders') return /đơn|báo giá|bảo hành|thợ|thanh toán|huỷ|hoàn thành/i.test(`${n.title} ${n.body || ''}`);
    return true;
  });
  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Thông báo"
        sub="Đơn hàng, báo giá & bảo hành"
        onBack={() => {
          if (nav.stack.length > 0) nav.back();
          else nav.go('home');
        }}
        right={(
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {list.some((n) => !n.read) ? (
              <Tap onPress={a.readAll}><Text style={ui.link}>Đọc hết</Text></Tap>
            ) : null}
            {list.length > 0 ? (
              <Tap onPress={a.clearAllNotifs}><Text style={[ui.link, { color: C.muted }]}>Dọn sạch</Text></Tap>
            ) : null}
          </View>
        )}
      />
      <View style={{ backgroundColor: '#fff', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {[
            { id: 'all', label: `Tất cả (${list.length})` },
            { id: 'unread', label: `Chưa đọc (${list.filter((n) => !n.read).length})` },
            { id: 'orders', label: 'Đơn hàng' },
          ].map((f) => <Chip key={f.id} label={f.label} on={filter === f.id} onPress={() => setFilter(f.id)} />)}
        </HScroll>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon="bell"
            title={filter === 'unread' ? 'Đã đọc hết thông báo' : 'Chưa có thông báo'}
            body="Cập nhật về đơn hàng, báo giá, ưu đãi và lịch bảo dưỡng sẽ hiện ở đây."
          />
        ) : filtered.map((n) => {
          const sem = resolveSemanticTone({ tone: n.tone, title: n.title, message: n.body, icon: n.icon, fallback: 'warning' });
          return (
            <Tap
              key={n.id}
              style={[
                mx.notif,
                !n.read && { backgroundColor: sem.unreadBg, borderColor: sem.border },
                { borderLeftWidth: 4, borderLeftColor: sem.accent },
              ]}
              onPress={() => { a.readNotif(n.id); nav.open(n.link); }}
            >
              <IconBox icon={n.icon || sem.icon} size={42} bg={sem.bg} color={sem.accent} radius={14} />
              <View style={{ flex: 1 }}>
                <Text style={[mx.notifTitle, !n.read && { color: C.ink }]}>{n.title}</Text>
                {n.body ? <Text style={mx.notifBody}>{n.body}</Text> : null}
                <Text style={[ui.meta, { marginTop: 4 }]}>{timeAgo(n.at)}</Text>
              </View>
              {!n.read ? <View style={[mx.dot, { backgroundColor: sem.accent }]} /> : null}
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

// =========================================================== CHI TIẾT ĐƠN
const CANCEL_REASONS = ['Tôi muốn đổi lịch khác', 'Đặt nhầm dịch vụ', 'Không còn nhu cầu', 'Thợ liên hệ không phù hợp', 'Lý do khác'];
const REJECT_REASONS = ['Giá cao hơn dự kiến', 'Muốn tham khảo thêm', 'Không cần sửa nữa', 'Lý do khác'];

export function OrderScreen({ params }) {
  const { s, a, nav, ui: u } = useApp();
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [showReject, setShowReject] = useState(false);
  const [rejectMode, setRejectMode] = useState('revise');
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [showMatPrice, setShowMatPrice] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editNote, setEditNote] = useState('');

  const [editDayIdx, setEditDayIdx] = useState(1);
  const [editMinutes, setEditMinutes] = useState(DEFAULT_SLOT_MINUTE);
  const [editSlot, setEditSlot] = useState(() => minutesToSlotStr(DEFAULT_SLOT_MINUTE));
  const [editAtts, setEditAtts] = useState([]);
  // Cờ busy chống bấm đúp cho các thao tác gửi lên máy chủ.
  const [quoteBusy, runQuote] = useBusy();
  const [cancelBusy, runCancel] = useBusy();
  const [editBusy, runEdit] = useBusy();
  const [payBusy, runPay] = useBusy();
  const o = (s.orders || []).find((x) => x.code === params?.code);
  if (!o) return <NotFoundView onBack={() => (nav.stack.length ? nav.back() : nav.activity())} />;
  const meta = STATUS_META[o.status] || STATUS_META.pending;
  const curIdx = o.status === 'cancelled' ? -1 : stepIndexOf(o.status);
  const at = (k) => [...(o.history || [])].reverse().find((h) => h.status === k)?.at;
  const winfo = warrantyInfo(o, s.orders, s.lifetimePoints || 0);
  const tierWarrantyDays = tierOf(s.lifetimePoints || 0).cur?.warrantyDays || BASE_WARRANTY_DAYS;
  const partDisc = tierPartDiscountAmount(o);
  const orderItems = o.items || [];
  const orderCats = [...new Set(orderItems.map((it) => getService(it.id)?.category).filter(Boolean))];
  const refMaterials = MATERIALS.filter((m) => orderCats.includes(m.category) || m.category === 'all');
  const canCancel = ['pending', 'confirmed'].includes(o.status);
  const cancelStatus = getCancellationWindowStatus(o);
  const canEdit = o.status === 'pending';
  const quoteLines = o.quote?.lines || [];

  const handlePressCancel = () => {
    const status = getCancellationWindowStatus(o);
    if (!status.allowed) {
      u.dialog({
        icon: '⚠️',
        title: 'Không thể huỷ đơn',
        message: withHotline(status.reason) || `Quý khách không thể tự huỷ đơn khi còn dưới ${FREE_CANCEL_TEXT} trước giờ hẹn với thợ. Để huỷ hoặc dời lịch gấp, vui lòng gọi Hotline ${HOTLINE}.`,
        actions: [
          { label: 'Đóng', variant: 'ghost' },
          { label: `Gọi Hotline ${HOTLINE}`, onPress: u.call },
        ],
      });
      return;
    }
    setShowCancel(true);
  };
  const active = isActiveOrder(o);
  const reorder = () => nav.push('checkout', { items: orderItems.map(({ id, qty }) => ({ id, qty })) });
  const evidence = o.evidence || [];
  const editDays = nextDays(7);
  const minAvailEdit = minSelectableMinute(editDayIdx);
  const isTodayOutOfSlotsEdit = isDayOutOfSlots(editDayIdx);

  const handleEditDaySelect = (i) => {
    setEditDayIdx(i);
    if (isDayOutOfSlots(i)) return;
    const clamped = clampToDay(editMinutes, i);
    setEditMinutes(clamped);
    setEditSlot(minutesToSlotStr(clamped));
  };

  const handleEditTimeChange = (newMins, newSlotStr) => {
    setEditMinutes(newMins);
    setEditSlot(newSlotStr);
  };

  const openEdit = () => {
    // Ngày hẹn hiện tại nằm ngoài 7 ngày tới (hoặc hôm nay đã hết giờ) → mặc định Ngày mai.
    let dIdx = dayIndexOfKey(editDays, o.dateKey, 1);
    if (isDayOutOfSlots(dIdx)) dIdx = 1;
    setEditDayIdx(dIdx);
    const mins = parseSlotToMinutes(o.slot);
    const clamped = clampToDay(mins, dIdx);
    setEditMinutes(clamped);
    // Giờ cũ bị kẹp (đã quá gần/quá muộn) thì hiển thị đúng ca mới, không giữ nhãn ca cũ.
    setEditSlot(clamped === mins && o.slot ? o.slot : minutesToSlotStr(clamped));
    setEditNote(o.note || '');
    setEditAtts([...(o.attachments || [])]);
    setShowEdit(true);
  };
  const addEditAtt = async () => {
    if (editAtts.length >= 5) { u.alert('Giới hạn ảnh', 'Tối đa 5 ảnh đính kèm.', '📷'); return; }
    const uri = await pickImage();
    if (uri === null) { u.alert('Chưa hỗ trợ', 'Chọn ảnh đang khả dụng trên bản web.', '📷'); return; }
    if (!uri) return;
    setEditAtts((p) => [...p, { id: newAttId(), uri, at: Date.now() }]);
  };
  const saveEdit = () => runEdit(async () => {
    if (editDayIdx === 0 && isTodayOutOfSlotsEdit) {
      u.alert('Hết giờ phục vụ', 'Hôm nay thợ đã kết thúc nhận ca. Quý khách vui lòng chọn Ngày mai.', '⏰');
      return;
    }
    if (editDayIdx === 0 && editMinutes < minAvailEdit) {
      u.alert('Giờ hẹn quá gần', `Vui lòng chọn khung giờ cách hiện tại ít nhất ${LEAD_MINUTES} phút để thợ kịp di chuyển.`, '⏰');
      return;
    }
    const day = editDays[editDayIdx];
    try {
      const ok = await callAction(a.updatePendingRequest, o.code, {
        note: editNote,
        slot: editSlot,
        dateLabel: `${day.label} (${day.ddmm})`,
        dateKey: day.key,
        attachments: editAtts,
      });
      if (isOk(ok)) setShowEdit(false);
    } catch (e) {
      u.alert('Không lưu được', errorText(e, 'Không cập nhật được yêu cầu. Vui lòng thử lại.'), '⚠️');
    }
  });

  const respondQuote = (decision, why) => runQuote(async () => {
    try {
      await callAction(a.respondQuote, o.code, decision, why);
    } catch (e) {
      u.alert('Chưa gửi được phản hồi', errorText(e, 'Không gửi được phản hồi báo giá. Vui lòng thử lại.'), '⚠️');
    }
  });

  const cancelOrder = () => runCancel(async () => {
    try {
      await callAction(a.cancelOrder, o.code, reason);
      // Thành công hoặc bị từ chối (context đã báo lý do) đều đóng sheet; chỉ giữ lại khi lỗi bất ngờ để thử lại.
      setShowCancel(false);
    } catch (e) {
      u.alert('Không huỷ được', errorText(e, 'Không gửi được yêu cầu huỷ. Vui lòng thử lại.'), '⚠️');
    }
  });

  // Xác nhận đã trả tiền mặt: số tiền luôn là phần còn lại phải trả (amountRemaining), một nơi duy nhất.
  const confirmCash = () => u.confirm(
    'Xác nhận đã thanh toán?',
    `Hình thức: ${o.payment || 'Tiền mặt tại nhà'}. Số tiền ${formatVND(amountRemaining(o))}.`,
    () => runPay(async () => {
      try {
        await callAction(a.confirmPayment, o.code);
      } catch (e) {
        u.alert('Chưa xác nhận được', errorText(e, 'Không gửi được xác nhận thanh toán. Vui lòng thử lại.'), '⚠️');
      }
    }),
    'Xác nhận',
  );

  const requestWarranty = () => u.confirm('Gửi yêu cầu bảo hành?', 'Thợ sẽ quay lại kiểm tra miễn phí.', () => {
    callAction(a.requestWarranty, o.code)
      .then((c) => { if (c) nav.push('order', { code: c }); })
      .catch((e) => u.alert('Chưa gửi được', errorText(e, 'Không gửi được yêu cầu bảo hành. Vui lòng thử lại.'), '⚠️'));
  }, 'Gửi');

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={o.kind === 'warranty' ? 'Đơn bảo hành' : 'Chi tiết đơn hàng'} sub={o.code} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <View style={[mx.statusHero, { backgroundColor: meta.bg }]}>
          <Text style={[mx.statusLabel, { color: meta.fg }]}>{meta.label}</Text>
          <Text style={[mx.statusDesc, { color: meta.fg }]}>
            {o.status === 'cancelled' ? (o.cancelReason || 'Đơn đã được huỷ') : (o.status === 'pending' && o.dispatchNote) || STATUS_DESC[o.status]}
          </Text>
        </View>
        <TrackingCard order={o} />

        {o.checkIn ? (
          <Card style={{ marginTop: 12, backgroundColor: C.primarySoft, borderColor: '#D6E4FF' }}>
            <Text style={mx.tlTitle}>📍 Check-in tại nhà bạn</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              {o.checkIn.label || 'Đã xác thực vị trí GPS'}
              {o.checkIn.at ? ` · ${fmtDateTime(o.checkIn.at)}` : ''}
              {o.checkIn.lat != null ? ` · ${Number(o.checkIn.lat).toFixed(5)}, ${Number(o.checkIn.lng).toFixed(5)}` : ''}
            </Text>
          </Card>
        ) : null}
        {o.lateCompensation ? (
          <Card style={{ marginTop: 12, backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }}>
            <Text style={mx.tlTitle}>⏰ Bồi thường đến muộn</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Thợ check-in trễ {o.lateCompensation.minutesLate} phút.
              {lateDiscountAmount(o)
                ? ` Đã trừ ${formatVND(lateDiscountAmount(o))} vào tổng thanh toán (${o.lateCompensation.percent}% phí nhân công).`
                : ' Hệ thống đã ghi nhận (mức cảnh báo, chưa trừ tiền).'}
              {o.lateCompensation.voucherCode ? ` Mã thêm: ${o.lateCompensation.voucherCode} (Quyền lợi).` : ''}
            </Text>
          </Card>
        ) : null}
        {(o.releaseLog || []).length && o.status === 'pending' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.primarySoft, borderColor: '#D6E4FF' }}>
            <Text style={mx.tlTitle}>Đang điều phối lại thợ</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Thợ trước đã trả việc. Hệ thống đang điều phối thợ khác; kiểm tra thông báo để nhận voucher xin lỗi (nếu có).
            </Text>
          </Card>
        ) : null}

        {/* ===== Chờ Văn phòng nghiệm thu ===== */}
        {o.status === 'pending_review' ? (
          <Card style={{ marginTop: 12, backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[mx.tlTitle, { color: '#6D28D9' }]}>🏢 Văn phòng đang đối soát nghiệm thu</Text>
            </View>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Kỹ thuật viên đã gửi biên bản & hình ảnh sau làm việc. Bộ phận kiểm soát chất lượng (QA) của Văn phòng Minh Đức đang đối soát kiểm tra trước khi bàn giao thanh toán.
            </Text>
          </Card>
        ) : null}

        {/* ===== Chờ Văn phòng thẩm định bảo hành ===== */}
        {o.status === 'warranty_pending' ? (
          <Card style={{ marginTop: 12, backgroundColor: '#FDF4FF', borderColor: '#F5D0FE' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[mx.tlTitle, { color: '#A21CAF' }]}>🛡️ Văn phòng đang thẩm định bảo hành</Text>
            </View>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Yêu cầu bảo hành đã được gửi. Văn phòng Minh Đức đang đối chiếu lỗi với nhật ký sửa chữa gốc và thời hạn bảo hành theo hạng thành viên (từ {BASE_WARRANTY_DAYS} ngày).
            </Text>
          </Card>
        ) : null}

        {/* ===== Yêu cầu hẹn tái khám ===== */}
        {o.followUpRequested ? (
          <Card style={{ marginTop: 12, backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }}>
            <Text style={[mx.tlTitle, { color: '#1D4ED8' }]}>📅 KTV đã hẹn lịch tái khám</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Lý do: <Text style={{ fontWeight: '700' }}>{o.followUpReason || 'Chờ linh kiện phụ tùng'}</Text>. Quản lý kỹ thuật đang điều phối lịch hẹn quay lại sớm nhất.
            </Text>
          </Card>
        ) : null}

        {/* ===== Báo giá chờ duyệt (khách duyệt / từ chối) ===== */}
        {o.status === 'quoted' && o.quote ? (() => {
          const isOnSite = Boolean(o.arrivedAt || o.checkIn || o.history?.some((h) => h.status === 'diagnosing'));
          const lines = o.quote.lines || [];
          const bookedIds = new Set((o.items || []).map((it) => it.id));
          const bookedNames = new Set((o.items || []).map((it) => String(it.name || '').trim().toLowerCase()));
          const isBooked = (l) => l.isOriginal || (!l.matId && l.type !== 'part' && (bookedIds.has(l.key) || bookedNames.has(String(l.name || '').trim().toLowerCase())));

          const laborItems = lines.filter((l) => isBooked(l));
          const partItems = lines.filter((l) => (l.type === 'part' || Boolean(l.matId)) && !isBooked(l));
          const customItems = lines.filter((l) => !isBooked(l) && l.type !== 'part' && !l.matId);
          const extraAmount = [...partItems, ...customItems].reduce(
            (sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 1),
            0
          );
          const bookedBase = o.quote.booked != null ? o.quote.booked : bookedValue(o);
          const finalAfterQuote = Math.max(0, bookedBase + extraAmount - (partDisc || 0) - (o.voucherDiscount || 0));

          return (
            <Card style={{ marginTop: 12, borderColor: '#F5D77A', backgroundColor: '#FFFBEB' }}>
              <View style={{ marginBottom: 10, padding: 10, borderRadius: R.sm, backgroundColor: C.greenSoft }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green, lineHeight: 18 }}>
                  {isOnSite
                    ? 'Thợ đã đến kiểm tra thực tế tại nhà bạn. Bạn có thể đồng ý để thợ sửa hoặc từ chối & huỷ đơn hoàn toàn MIỄN PHÍ (0đ).'
                    : 'Báo giá trước khi thợ xuất phát. Bạn đồng ý thì thợ mới đi. Huỷ lúc này hoàn toàn MIỄN PHÍ (0đ).'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={mx.tlTitle}>Báo giá từ thợ {o.tech?.name}</Text>
                <Badge
                  text={extraAmount > 0 ? `+${formatVND(extraAmount)} phát sinh` : 'Không phát sinh (0đ)'}
                  fg={extraAmount > 0 ? C.orange : C.green}
                  bg={extraAmount > 0 ? C.orangeSoft : C.greenSoft}
                />
              </View>

              {o.quote.symptoms ? <Text style={[ui.meta, { fontSize: 13, color: C.ink2, marginTop: 6 }]}>Triệu chứng: {o.quote.symptoms}</Text> : null}
              <Text style={[ui.meta, { fontSize: 13, color: C.ink2, marginTop: 4 }]}>Chẩn đoán: {o.quote.diagnosis}</Text>
              {o.quote.recommendation ? <Text style={[ui.meta, { fontSize: 13, color: C.ink2, marginTop: 4 }]}>Đề xuất: {o.quote.recommendation}</Text> : null}

              {/* Danh sách dịch vụ ban đầu */}
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 4 }}>
                  🛠️ Dịch vụ kỹ thuật ban đầu ({laborItems.length})
                </Text>
                {laborItems.map((l, i) => (
                  <View key={`labor_${l.name}_${i}`} style={{ flexDirection: 'row', paddingVertical: 4, justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: C.ink, fontWeight: '600', fontSize: 13.5 }} numberOfLines={2}>
                        {l.name}
                      </Text>
                      <Text style={[ui.meta, { fontSize: 12 }]}>
                        {formatVND(l.price)} x{l.qty} {l.unit || 'lần'}
                      </Text>
                    </View>
                    <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(l.price * l.qty)}</Text>
                  </View>
                ))}
              </View>

              {/* Danh sách vật tư / linh kiện thay thế (nếu có) */}
              {partItems.length ? (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#FEF3C7' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 4 }}>
                    🔩 Linh kiện / Vật tư kho ({partItems.length})
                  </Text>
                  {partItems.map((l, i) => (
                    <View key={`part_${l.name}_${i}`} style={{ flexDirection: 'row', paddingVertical: 4, justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ color: C.ink, fontWeight: '600', fontSize: 13.5 }} numberOfLines={2}>{l.name}</Text>
                          <Badge text="Vật tư kho" fg={C.primary} bg={C.primarySoft} />
                        </View>
                        <Text style={[ui.meta, { fontSize: 12 }]}>
                          {formatVND(l.price)} x{l.qty} {l.unit || 'cái'}
                        </Text>
                      </View>
                      <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(l.price * l.qty)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Danh sách chi phí phát sinh tại chỗ (nếu có) */}
              {customItems.length ? (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#FEF3C7' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: C.orange, marginBottom: 4 }}>
                    📝 Chi phí phát sinh tại hiện trường ({customItems.length})
                  </Text>
                  {customItems.map((l, i) => (
                    <View key={`custom_${l.name}_${i}`} style={{ flexDirection: 'row', paddingVertical: 4, justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ color: C.ink, fontWeight: '600', fontSize: 13.5 }} numberOfLines={2}>{l.name}</Text>
                          <Badge text={l.type === 'labor' ? 'Công thêm' : 'Vật tư ngoài'} fg={C.orange} bg={C.orangeSoft} />
                        </View>
                        <Text style={[ui.meta, { fontSize: 12 }]}>
                          {formatVND(l.price)} x{l.qty}
                        </Text>
                      </View>
                      <Text style={{ fontWeight: '700', color: C.orange }}>+{formatVND(l.price * l.qty)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Tổng kết chi tiết minh bạch */}
              <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#FDE68A' }}>
                <Bill l="Giá dịch vụ đã đặt" v={formatVND(bookedBase)} />
                {extraAmount > 0 ? (
                  <Bill l="Chi phí phát sinh thêm" v={`+${formatVND(extraAmount)}`} />
                ) : (
                  <Bill l="Chi phí phát sinh" v="0 đ (Đúng giá gốc, không phát sinh)" green />
                )}
                {partDisc ? <Bill l={`Đặc quyền hạng ${o.customerTierLabel || ''} (−${o.tierPartDiscountPercent}% vật tư)`} v={`−${formatVND(partDisc)}`} green /> : null}
                {o.voucherDiscount ? <Bill l={`Voucher ${o.voucher?.code}`} v={`-${formatVND(o.voucherDiscount)}`} green /> : null}
                <View style={mx.totalRow}>
                  <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink }}>Tổng thanh toán sau báo giá</Text>
                  <Text style={[ui.price, { fontSize: 20 }]}>{formatVND(finalAfterQuote)}</Text>
                </View>
              </View>

              <Tap onPress={() => setShowMatPrice(true)} style={{ marginTop: 10 }}>
                <Text style={ui.link}>Đối chiếu bảng giá vật tư niêm yết Minh Đức ›</Text>
              </Tap>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Btn title="Báo giá lại / Huỷ" variant="dangerSoft" style={{ flex: 1.1 }} disabled={quoteBusy} onPress={() => { setRejectMode('revise'); setShowReject(true); }} />
                <Btn title={quoteBusy ? 'Đang gửi…' : 'Đồng ý báo giá'} style={{ flex: 1.9 }} disabled={quoteBusy} onPress={() => respondQuote(true)} />
              </View>
            </Card>
          );
        })() : null}

        {o.status !== 'cancelled' ? (
          <Card style={{ marginTop: 12 }}>
            {ORDER_STEPS.map((step, i) => {
              const quoteSkipped = step.key === 'quoted'
                && curIdx > i
                && !(o.history || []).some((h) => h.status === 'quoted');
              const done = i < curIdx || (i === curIdx && o.status === 'done') || quoteSkipped;
              const current = i === curIdx && o.status !== 'done' && !quoteSkipped;
              return (
                <View key={step.key} style={{ flexDirection: 'row' }}>
                  <View style={{ width: 28, alignItems: 'center' }}>
                    <View style={[
                      mx.tlDot,
                      done && { backgroundColor: C.green, borderColor: C.green },
                      current && { backgroundColor: meta.fg, borderColor: meta.fg },
                    ]}>
                      {done ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓</Text> : current ? <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>●</Text> : null}
                    </View>
                    {i < ORDER_STEPS.length - 1 ? <View style={[mx.tlLine, i < curIdx && { backgroundColor: C.green }]} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingLeft: 8, paddingBottom: i < ORDER_STEPS.length - 1 ? 16 : 0 }}>
                    <Text style={[mx.tlTitle, !done && !current && { color: C.faint }, current && { color: meta.fg }]}>
                      {step.label}{current && step.key === 'quoted' ? ' · Cần bạn duyệt' : ''}
                    </Text>
                    <Text style={ui.meta}>
                      {quoteSkipped
                        ? 'Không phát sinh — bỏ qua bước duyệt'
                        : at(step.key)
                          ? fmtDateTime(at(step.key))
                          : step.desc}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        ) : null}

        {o.tech ? (
          <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={mx.techAvatar}><AppIcon name="hard-hat" size={24} color={C.goldInk} strokeWidth={2.2} /></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={mx.tlTitle}>{o.tech.name}</Text>
                <Badge text="KTV chuyên trách" fg={C.primaryDark} bg={C.primarySoft} />
              </View>
              <Text style={[ui.meta, { marginTop: 2 }]}>
                {o.tech.code}{o.tech.rating != null ? ` · ★ ${o.tech.rating}` : " · Chưa có đánh giá"}
                {o.tech.rating != null && o.tech.ratingCount ? ` (${Number(o.tech.ratingCount).toLocaleString('vi-VN')} đánh giá)` : ''}
              </Text>
              {o.lateCompensation?.tier && o.lateCompensation.tier !== 'ok' ? (
                <Text style={[ui.meta, { color: C.orange, fontWeight: '700', marginTop: 2 }]}>
                  Check-in muộn {o.lateCompensation.minutesLate} phút
                </Text>
              ) : o.arrivedAt ? (
                <Text style={[ui.meta, { color: C.green, fontWeight: '700', marginTop: 2 }]}>Đã check-in đúng chính sách giờ hẹn</Text>
              ) : null}
            </View>
            <IconBtn icon="phone-call" onPress={() => Linking.openURL(`tel:${String(o.tech.phone || '').replace(/[^\d+]/g, '')}`).catch(() => {})} style={{ backgroundColor: C.greenSoft }} label="Gọi thợ" />
          </Card>
        ) : active ? (
          <Card style={{ marginTop: 12, backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="settings" size={18} color="#0369A1" strokeWidth={2.2} />
              <Text style={{ fontWeight: '800', color: '#0369A1', fontSize: 14 }}>Hệ thống đang điều phối Kỹ thuật viên</Text>
            </View>
            <Text style={{ color: '#0C4A6E', marginTop: 6, fontSize: 12.5, lineHeight: 18 }}>
              Hệ thống Minh Đức đang tự động điều phối Kỹ thuật viên chuyên trách gần bạn nhất để đảm bảo có mặt đúng khung giờ {o.slot}.
            </Text>
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={{ color: '#0284C7', fontSize: 12, fontWeight: '600' }}>✓ Đúng chuyên môn kỹ thuật thiết bị</Text>
              <Text style={{ color: '#0284C7', fontSize: 12, fontWeight: '600' }}>✓ Phân bổ thợ khu vực {o.address?.district || 'của bạn'}</Text>
              <Text style={{ color: '#0284C7', fontSize: 12, fontWeight: '600' }}>✓ Cam kết bảo hành {tierWarrantyDays} ngày sau dịch vụ</Text>
            </View>
          </Card>
        ) : null}

        <Card style={{ marginTop: 12 }}>
          <InfoLine icon="calendar-clock" label="Lịch hẹn" value={`${o.dateLabel} · ${o.slot}`} />
          {['pending', 'confirmed'].includes(o.status) && !cancelStatus.allowed ? (
            <View style={{ marginVertical: 6, padding: 8, borderRadius: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }}>
              <Text style={{ fontSize: 11.5, color: '#92400E', lineHeight: 16 }}>
                Đã sát giờ hẹn (dưới {FREE_CANCEL_TEXT}): Quý khách không thể tự huỷ đơn để bảo đảm lịch trình của thợ. Vui lòng gọi {HOTLINE} nếu cần hỗ trợ.
              </Text>
            </View>
          ) : ['pending', 'confirmed'].includes(o.status) ? (
            <View style={{ marginVertical: 6, padding: 8, borderRadius: 8, backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD' }}>
              <Text style={{ fontSize: 11.5, color: '#0369A1', lineHeight: 16 }}>
                Quý khách có thể huỷ đơn miễn phí trước giờ hẹn tối thiểu {FREE_CANCEL_TEXT}.
              </Text>
            </View>
          ) : null}
          <InfoLine icon="map-pin" label={`${o.address?.gender === 'Nữ' ? 'Chị' : 'Anh'} ${o.address?.name || ''} · ${o.address?.phone || ''}`} value={o.address?.full} />
          <InfoLine icon="credit-card" label="Thanh toán" value={o.payment} />
          {o.device ? (
            <InfoLine
              icon={catIcon(o.device.category)}
              label="Thiết bị tại nhà"
              value={`${catLabel(o.device.category)}${o.device.brand ? ` · ${o.device.brand}` : ''}${o.device.room ? ` (${o.device.room})` : ''}${o.device.serial ? ` · SN: ${o.device.serial}` : ''}`}
            />
          ) : null}
          {o.siteCondition ? (
            <InfoLine icon="building-2" label="Vị trí thi công" value={o.siteCondition.label} />
          ) : null}
          {o.note ? <InfoLine icon="file-text" label="Ghi chú" value={o.note} /> : null}
          {(o.attachments || []).length ? (
            <View style={{ marginTop: 4, marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600', marginBottom: 6 }}>📷 Ảnh đính kèm</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {o.attachments.map((att) => (
                  <View key={att.id} style={mx.thumb}>
                    {att.uri ? <Image source={{ uri: att.uri }} style={{ width: '100%', height: '100%' }} /> : <AppIcon name="image" size={22} color={C.muted} />}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {o.warrantyOf ? (
            <Tap onPress={() => nav.push('order', { code: o.warrantyOf })}><InfoLine icon="link" label="Bảo hành cho đơn" value={`${o.warrantyOf} ›`} link /></Tap>
          ) : null}
        </Card>

        <Text style={mx.sec}>Dịch vụ</Text>
        {orderItems.map((it) => {
          const svc = getService(it.id);
          return svc ? <ServiceRow key={it.id} item={svc} right={<Text style={{ fontWeight: '800', color: C.ink2 }}>x{it.qty}</Text>} /> : null;
        })}

        {/* ===== Thông tin thợ gửi lên ===== */}
        {o.quote && o.status !== 'quoted' ? (() => {
          const lines = o.quote.lines || [];
          const bookedIds = new Set((o.items || []).map((it) => it.id));
          const bookedNames = new Set((o.items || []).map((it) => String(it.name || '').trim().toLowerCase()));
          const isBooked = (l) => l.isOriginal || (!l.matId && l.type !== 'part' && (bookedIds.has(l.key) || bookedNames.has(String(l.name || '').trim().toLowerCase())));

          const laborItems = lines.filter((l) => isBooked(l));
          const partItems = lines.filter((l) => (l.type === 'part' || Boolean(l.matId)) && !isBooked(l));
          const customItems = lines.filter((l) => !isBooked(l) && l.type !== 'part' && !l.matId);
          const extraAmount = [...partItems, ...customItems].reduce(
            (sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 1),
            0
          );
          return (
            <Card style={{ marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={mx.tlTitle}>Kết quả chẩn đoán kỹ thuật</Text>
                <Badge
                  text={extraAmount > 0 ? `+${formatVND(extraAmount)} phát sinh` : 'Không phát sinh (0đ)'}
                  fg={extraAmount > 0 ? C.orange : C.green}
                  bg={extraAmount > 0 ? C.orangeSoft : C.greenSoft}
                />
              </View>
              {o.quote.symptoms ? <Text style={[ui.meta, { marginTop: 6 }]}>Triệu chứng: {o.quote.symptoms}</Text> : null}
              <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>{o.quote.diagnosis}</Text>
              {o.quote.recommendation ? <Text style={[ui.meta, { marginTop: 6 }]}>Đề xuất: {o.quote.recommendation}</Text> : null}

              {/* Danh sách dịch vụ */}
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.ink, marginBottom: 2 }}>
                  🛠️ Dịch vụ kỹ thuật ({laborItems.length})
                </Text>
                {laborItems.map((l, i) => (
                  <View key={`d_labor_${l.name}_${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                    <Text style={[ui.meta, { fontSize: 13, color: C.ink2, flex: 1, paddingRight: 6 }]} numberOfLines={2}>
                      {l.name} x{l.qty} {l.unit || 'lần'}
                    </Text>
                    <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.ink }]}>{formatVND(l.price * l.qty)}</Text>
                  </View>
                ))}
              </View>

              {/* Danh sách vật tư (nếu có) */}
              {partItems.length ? (
                <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.ink, marginBottom: 2 }}>
                    🔩 Vật tư thay thế ({partItems.length})
                  </Text>
                  {partItems.map((l, i) => (
                    <View key={`d_part_${l.name}_${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                      <Text style={[ui.meta, { fontSize: 13, color: C.ink2, flex: 1, paddingRight: 6 }]} numberOfLines={2}>
                        {l.name} x{l.qty} {l.unit || 'cái'}
                      </Text>
                      <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.ink }]}>{formatVND(l.price * l.qty)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Danh sách chi phí phát sinh (nếu có) */}
              {customItems.length ? (
                <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.orange, marginBottom: 2 }}>
                    📝 Chi phí phát sinh tại hiện trường ({customItems.length})
                  </Text>
                  {customItems.map((l, i) => (
                    <View key={`d_custom_${l.name}_${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                      <Text style={[ui.meta, { fontSize: 13, color: C.ink2, flex: 1, paddingRight: 6 }]} numberOfLines={2}>
                        {l.name} x{l.qty}
                      </Text>
                      <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.orange }]}>+{formatVND(l.price * l.qty)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {o.quote.rejectReason ? (
                <Text style={[ui.meta, { color: o.quote.revisionRequested && o.status === 'diagnosing' ? C.orange : C.red, fontWeight: '700', marginTop: 8 }]}>
                  {o.quote.revisionRequested && o.status === 'diagnosing'
                    ? `Bạn đã yêu cầu thợ điều chỉnh báo giá: ${o.quote.rejectReason}`
                    : `Bạn đã từ chối báo giá: ${o.quote.rejectReason}`}
                </Text>
              ) : null}
            </Card>
          );
        })() : null}
        {(o.progress || []).length ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={mx.tlTitle}>Tiến độ thi công</Text>
            {o.progress.map((p) => (
              <View key={p.id} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '800', color: C.purple }}>{p.percent}%</Text>
                  <Text style={ui.meta}>{fmtDateTime(p.at)}</Text>
                </View>
                <Progress value={p.percent / 100} color={C.purple} style={{ marginTop: 4 }} />
                {p.note ? <Text style={{ color: C.ink2, marginTop: 4 }}>{p.note}</Text> : null}
              </View>
            ))}
          </Card>
        ) : null}
        {(o.materials || []).length && ['diagnosing', 'quoted', 'repairing', 'done'].includes(o.status) ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={mx.tlTitle}>Vật tư & linh kiện thay thế</Text>
            {o.materials.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
                <Text style={{ flex: 1, color: C.ink2 }} numberOfLines={2}>{m.name} · {m.qty} {m.unit}</Text>
                {m.price != null ? <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(m.price * m.qty)}</Text> : null}
              </View>
            ))}
          </Card>
        ) : null}
        {(o.repairNotes || []).length ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={mx.tlTitle}>Nhật ký thi công</Text>
            {o.repairNotes.map((n) => (
              <View key={n.id} style={{ marginTop: 8 }}>
                <Text style={{ color: C.ink2, lineHeight: 20 }}>{n.text}</Text>
                <Text style={ui.meta}>{fmtDateTime(n.at)}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        {evidence.length ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={mx.tlTitle}>Hình ảnh nghiệm thu & minh chứng</Text>
            {[
              { id: 'diagnosis', label: 'Chẩn đoán' },
              { id: 'before', label: 'Trước khi làm' },
              { id: 'after', label: 'Sau khi làm' },
            ].map((stg) => (evidence.some((e) => e.stage === stg.id) ? (
              <View key={stg.id} style={{ marginTop: 10 }}>
                <Text style={[ui.meta, { fontWeight: '700', marginBottom: 6 }]}>{stg.label}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {evidence.filter((e) => e.stage === stg.id).map((e) => (
                    <View key={e.id} style={mx.thumb}>
                      {e.uri ? <Image source={{ uri: e.uri }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 24 }}>🖼️</Text>}
                    </View>
                  ))}
                </View>
              </View>
            ) : null))}
          </Card>
        ) : null}
        {o.report ? (
          <Card style={{ marginTop: 12, backgroundColor: '#F3FBF7', borderColor: '#CDEFDD' }}>
            <Text style={mx.tlTitle}>Biên bản nghiệm thu kỹ thuật</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>{o.report.summary}</Text>
            {(o.report.safetyChecklist || []).length ? (
              <View style={{ marginTop: 8, gap: 3 }}>
                {o.report.safetyChecklist.map((chk, i) => (
                  <Text key={i} style={{ fontSize: 12, color: C.green, fontWeight: '700' }}>✓ {chk}</Text>
                ))}
              </View>
            ) : null}
            {o.report.customerSignature ? (
              <View style={{ marginTop: 8, padding: 8, borderRadius: R.sm, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1FAE5' }}>
                <Text style={{ fontSize: 12, color: C.green, fontWeight: '800' }}>Chữ ký xác nhận của khách hàng:</Text>
                <Text style={{ fontStyle: 'italic', fontSize: 16, fontWeight: '800', color: C.navy, marginTop: 2 }}>{o.report.customerSignature}</Text>
              </View>
            ) : null}
            {(o.materials || []).length ? <Text style={[ui.meta, { marginTop: 6 }]}>Vật tư: {o.materials.map((m) => `${m.name} (${m.qty} ${m.unit})`).join(', ')}</Text> : null}
            <Text style={[ui.meta, { marginTop: 6 }]}>{fmtDateTime(o.report.at)} · Thợ {o.report.tech}</Text>
            <Btn
              title="📜 Xem Phiếu Nghiệm Thu & Bảo Hành Điện Tử"
              variant="soft"
              small
              style={{ marginTop: 12 }}
              onPress={() => setShowCertificate(true)}
            />
          </Card>
        ) : null}

        {o.kind !== 'warranty' && o.kind !== 'followup' ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={[mx.tlTitle, { marginBottom: 6 }]}>Chi tiết chi phí & thanh toán</Text>
            {o.status === 'cancelled' ? (
              <>
                {(o.inspectionFee || 0) > 0 ? (
                  <>
                    <Bill l="Phí kiểm tra thiết bị tại nhà" v={formatVND(o.inspectionFee)} />
                    <Bill l="Lý do thu phí" v="Thợ đã kiểm tra trực tiếp tại nhà trước khi huỷ" />
                  </>
                ) : (
                  <Bill l="Chi phí huỷ đơn" v="0 đ (Miễn phí hoàn toàn)" green />
                )}
              </>
            ) : (
              <>
                <Bill l="Tổng tiền dịch vụ" v={formatVND(o.goods)} />
                {o.productDiscount ? <Bill l="Giảm giá dịch vụ" v={`-${formatVND(o.productDiscount)}`} green /> : null}
                {o.comboDiscount ? <Bill l={`Ưu đãi ${o.comboLabel || 'Combo nhiều máy'}`} v={`-${formatVND(o.comboDiscount)}`} green /> : null}
                {/* Số tiền dưới đây lấy từ hoá đơn server (GET /customer/requests/:id/bill) */}
                {o.bill?.quotationTotal != null && o.bill.quotationTotal !== o.bill.bookedAmount ? <Bill l="Theo báo giá đã duyệt" v={formatVND(o.bill.quotationTotal)} /> : null}
                {o.bill?.supplementalTotal ? <Bill l="Trong đó phát sinh" v={`+${formatVND(o.bill.supplementalTotal)}`} /> : null}
                {partDisc ? <Bill l={`Ưu đãi hạng thành viên (−${o.bill?.tierPartDiscountPercent || 0}% vật tư)`} v={`−${formatVND(partDisc)}`} green /> : null}
                {o.voucherDiscount ? <Bill l={`Voucher ${o.voucher?.code || ''}`} v={`-${formatVND(o.voucherDiscount)}`} green /> : null}
                {lateDiscountAmount(o) ? <Bill l="Bồi thường thợ đến muộn" v={`−${formatVND(lateDiscountAmount(o))}`} green /> : null}
                {o.bill?.paidAmount ? <Bill l="Đã thanh toán" v={formatVND(o.bill.paidAmount)} green /> : null}
              </>
            )}
            <Bill l="Hình thức" v={o.payment || 'Chuyển khoản VietQR'} />
            <Bill
              l="Trạng thái thu"
              v={
                o.status === 'cancelled'
                  ? ((o.inspectionFee || 0) > 0 ? 'Cần thanh toán phí KT' : 'Đã huỷ (0đ)')
              : o.report?.paid
                    ? (isQRPayment(o) ? 'Đã chuyển khoản VietQR' : 'Đã thanh toán')
                    : o.bill?.cashClaimPending
                      ? 'Đã báo trả tiền mặt · chờ thợ xác nhận'
                    : o.status === 'partially_paid'
                      ? 'Đã trả một phần · Còn thiếu'
                      : o.status === 'pending_payment'
                        ? (isQRPayment(o) ? 'Chờ thanh toán VietQR' : 'Chờ khách thanh toán')
                        : isQRPayment(o) ? 'Thanh toán qua QR (Thợ không thu tiền mặt)' : 'Chưa đến bước thanh toán'
              }
              green={isPaid(o) || (o.status === 'cancelled' && !(o.inspectionFee > 0))}
            />
            <View style={mx.totalRow}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink }}>Tổng thanh toán</Text>
              <Text style={[ui.price, { fontSize: 20 }]}>{formatVND(o.status === 'cancelled' ? (o.inspectionFee || 0) : orderTotal(o))}</Text>
            </View>
            {o.status !== 'cancelled' && !isPaid(o) && !isQRPayment(o) ? (
              <View style={{ marginTop: 12, padding: 12, borderRadius: R.md, backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <IconBox icon="qr-code" size={38} bg="#E0F2FE" color="#0284C7" radius={12} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: '#0369A1', fontSize: 13 }}>Muốn chuyển khoản bằng mã QR?</Text>
                  <Text style={{ fontSize: 12, color: '#0C4A6E', marginTop: 2, lineHeight: 17 }}>
                    Đổi sang VietQR để quét mã trên App — khoá thu tiền mặt bên App của Thợ.
                  </Text>
                </View>
                <Btn
                  title="Đổi sang QR"
                  small
                  variant="primary"
                  onPress={() => a.switchToQRPayment(o.code)}
                />
              </View>
            ) : null}
            {o.status === 'cancelled' && (o.inspectionFee || 0) > 0 ? (
              <View style={{ marginTop: 14, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#F5D77A' }}>
                <Text style={{ fontWeight: '800', color: '#92400E', marginBottom: 4 }}>Mã QR thanh toán phí kiểm tra tại nhà</Text>
                <Text style={[ui.meta, { marginBottom: 8, color: '#92400E', textAlign: 'center' }]}>
                  Thanh toán phí dịch vụ kiểm tra thiết bị tại nhà {formatVND(o.inspectionFee)} cho thợ.
                </Text>
                <VietQRPay requestId={o.dbRequestId} onPaid={() => a.confirmPayment(o.code, 'webhook')} size={180} />
              </View>
            ) : null}
            {['pending_payment', 'partially_paid'].includes(o.status) && !o.report?.paid && isQRPayment(o) ? (
              <View style={{ marginTop: 14, alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1' }}>
                <View style={{ width: '100%', padding: 10, borderRadius: R.sm, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AppIcon name="shield-check" size={18} color={C.orange} strokeWidth={2.3} />
                  <Text style={{ flex: 1, fontSize: 12, color: C.goldInk, fontWeight: '700', lineHeight: 17 }}>
                    Đơn thanh toán qua VietQR: Kỹ thuật viên đã bị khoá quyền thu tiền mặt. Quý khách vui lòng chỉ quét mã QR dưới đây.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <AppIcon name="landmark" size={16} color={C.primary} strokeWidth={2.2} />
                  <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>Chuyển khoản nhanh VietQR 24/7</Text>
                </View>
                <Text style={[ui.meta, { marginBottom: 10, textAlign: 'center', color: C.muted }]}>
                  Quét mã VietQR để thanh toán dịch vụ. Khi thanh toán đủ, đơn sẽ chuyển chờ Văn phòng nghiệm thu.
                </Text>
                {['pending_payment', 'partially_paid'].includes(o.status) ? (
                  <VietQRPay requestId={o.dbRequestId} onPaid={() => a.confirmPayment(o.code, 'webhook')} />
                ) : (
                  <Text style={[ui.meta, { textAlign: 'center' }]}>Mã QR thanh toán hiện khi thợ hoàn thành công việc.</Text>
                )}
              </View>
            ) : null}
            {/* Nút "Xác nhận đã trả tiền" chỉ đặt ở thanh dưới (dock) để tránh hai nút trùng chức năng. */}
            {isPaid(o) && ['done', 'pending_review'].includes(o.status) ? (
              <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.greenSoft }}>
                <Text style={{ fontWeight: '800', color: C.green }}>🧾 Đã thanh toán</Text>
                <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
                  Mã đơn {o.code} · {formatVND(o.bill?.paidAmount || orderTotal(o))} · {o.payment || 'Tại nhà'}
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {o.kind !== 'warranty' && o.status !== 'cancelled' ? (
          <Card style={{ marginTop: 12, backgroundColor: winfo.ok ? '#F3FBF7' : '#fff' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconBox icon="shield-check" size={40} bg={winfo.ok ? C.greenSoft : C.primarySoft} radius={13} />
              <View style={{ flex: 1 }}>
                <Text style={mx.tlTitle}>
                  Bảo hành {winfo.totalDays || tierWarrantyDays} ngày{o.customerTierLabel ? ` · Hạng ${o.customerTierLabel}` : ''}
                </Text>
                <Text style={[ui.meta, winfo.ok && { color: C.green, fontWeight: '700' }]}>{winfo.text}</Text>
              </View>
            </View>
            {winfo.ok ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn
                  title="Phiếu bảo hành điện tử"
                  variant="outline"
                  small
                  style={{ flex: 1 }}
                  onPress={() => setShowCertificate(true)}
                />
                <Btn
                  title="Yêu cầu bảo hành"
                  variant="soft"
                  small
                  style={{ flex: 1 }}
                  onPress={requestWarranty}
                />
              </View>
            ) : null}
            {winfo.openCode ? (
              <Btn title={`Xem đơn bảo hành ${winfo.openCode}`} variant="outline" small style={{ marginTop: 12 }} onPress={() => nav.push('order', { code: winfo.openCode })} />
            ) : null}
          </Card>
        ) : null}

        {o.rating ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={mx.tlTitle}>Đánh giá của bạn</Text>
            <View style={{ marginTop: 6 }}><Stars value={o.rating.stars} size={18} /></View>
            {o.rating.text ? <Text style={[ui.meta, { fontSize: 14, color: C.ink2, marginTop: 6 }]}>{o.rating.text}</Text> : null}
          </Card>
        ) : null}

        <Text style={[ui.meta, { textAlign: 'center', marginTop: 16 }]}>Đặt lúc {fmtDateTime(o.createdAt)}</Text>
      </ScrollView>

      {(canEdit || canCancel || isAwaitingPayment(o) || (o.status === 'done' && o.kind !== 'warranty') || (o.status === 'cancelled' && o.kind !== 'warranty') || (o.kind === 'warranty' && !active)) ? (
        <View style={mx.dock}>
          {canEdit ? <Btn title="Sửa yêu cầu" icon="pencil" variant="soft" style={{ flex: 1 }} onPress={openEdit} /> : null}
          {canCancel ? <Btn title="Huỷ đơn" variant="dangerSoft" style={{ flex: 1 }} onPress={handlePressCancel} /> : null}
          {['pending_payment', 'partially_paid'].includes(o.status) && !o.report?.paid && !isQRPayment(o) && !o.bill?.cashClaimPending && o.kind !== 'warranty' && o.kind !== 'followup' ? (
            <Btn
              title={payBusy ? 'Đang gửi…' : 'Xác nhận đã trả tiền'}
              icon="credit-card"
              variant="soft"
              style={{ flex: 1.15, paddingHorizontal: 10 }}
              disabled={payBusy}
              onPress={confirmCash}
            />
          ) : null}
          {o.status === 'done' && !o.rating && o.kind !== 'warranty' ? <Btn title="Đánh giá" icon="star" variant="gold" style={{ flex: 1, paddingHorizontal: 10 }} onPress={() => nav.push('rate', { code: o.code })} /> : null}
          {['done', 'cancelled'].includes(o.status) && o.kind !== 'warranty' ? <Btn title="Đặt lại" icon="rotate-ccw" style={{ flex: 1, paddingHorizontal: 10 }} onPress={reorder} /> : null}
          {o.kind === 'warranty' && !active ? <Btn title="Liên hệ hỗ trợ" icon="phone-call" variant="soft" style={{ flex: 1 }} onPress={u.call} /> : null}
        </View>
      ) : null}

      <Sheet
        visible={showMatPrice}
        onClose={() => setShowMatPrice(false)}
        title="Bảng giá vật tư niêm yết Minh Đức"
        footer={<Btn title="Đã hiểu" onPress={() => setShowMatPrice(false)} />}
      >
        <Text style={[ui.meta, { marginBottom: 10, lineHeight: 18 }]}>
          Đối chiếu đơn giá vật tư chính hãng của Minh Đức. Thợ không được thu cao hơn bảng giá niêm yết.
        </Text>
        {refMaterials.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{m.name}</Text>
              <Text style={ui.meta}>Đơn vị: {m.unit}</Text>
            </View>
            <Text style={{ fontWeight: '800', color: C.primary }}>{formatVND(m.price)}/{m.unit}</Text>
          </View>
        ))}
      </Sheet>
      <Sheet
        visible={showCertificate}
        onClose={() => setShowCertificate(false)}
        title="Phiếu Nghiệm Thu & Bảo Hành Điện Tử"
        footer={winfo.ok ? (
          <Btn
            title="🛠️ Yêu cầu bảo hành miễn phí"
            onPress={() => {
              setShowCertificate(false);
              requestWarranty();
            }}
          />
        ) : <Btn title="Đóng phiếu" onPress={() => setShowCertificate(false)} />}
      >
        <View style={{ backgroundColor: C.navy, borderRadius: R.lg, padding: 16, alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: '#93C5FD', fontWeight: '900', fontSize: 12, letterSpacing: 0.8 }}>THỢ MINH ĐỨC · CHỨNG NHẬN ĐIỆN TỬ</Text>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 4 }}>
            Mã chứng nhận: {o.report?.warrantyCertificateCode || `BH-${o.code}`}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>
            Đơn gốc: {o.code} · Hoàn thành: {fmtDateTime(o.doneAt || o.createdAt)}
          </Text>
          <View style={{ backgroundColor: '#fff', padding: 10, borderRadius: 16, marginTop: 12 }}>
            <PseudoQR value={`MINHDUC-WARRANTY|${o.code}|${o.address?.phone || ''}|${winfo.totalDays || tierWarrantyDays}D`} size={130} />
          </View>
          <Badge
            text={winfo.ok ? `🛡️ Còn ${winfo.daysLeft}/${winfo.totalDays} ngày bảo hành (đến ${fmtDate(winfo.until)})` : winfo.text}
            fg={winfo.ok ? C.green : C.orange}
            bg="#fff"
            style={{ marginTop: 10 }}
          />
        </View>

        <View style={{ padding: 12, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.line, gap: 6 }}>
          <Text style={{ fontWeight: '800', color: C.ink }}>1. Thông tin khách hàng & Thiết bị</Text>
          <Text style={ui.meta}>• Khách hàng: {o.address?.name} · {o.address?.phone}</Text>
          <Text style={ui.meta}>• Địa chỉ: {o.address?.full}</Text>
          {o.device ? (
            <Text style={ui.meta}>
              • Thiết bị: {catLabel(o.device.category)} {o.device.brand || ''} {o.device.room ? `(${o.device.room})` : ''}{o.device.serial ? ` · SN: ${o.device.serial}` : ''}
            </Text>
          ) : null}
          <Text style={ui.meta}>• Kỹ thuật viên: {o.tech?.name || o.report?.tech || 'Thợ Minh Đức'} ({o.tech?.code || o.report?.techCode || 'MINHDUC'})</Text>
        </View>

        <View style={{ padding: 12, borderRadius: R.md, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.line, gap: 6, marginTop: 10 }}>
          <Text style={{ fontWeight: '800', color: C.ink }}>2. Hạng mục nghiệm thu & An toàn kỹ thuật</Text>
          <Text style={{ color: C.ink2, fontSize: 13, lineHeight: 19 }}>{o.report?.summary || 'Đã hoàn thành đúng quy trình kỹ thuật.'}</Text>
          {((o.report?.safetyChecklist?.length ? o.report.safetyChecklist : SAFETY_CHECKLIST_ITEMS)).map((chk, idx) => (
            <Text key={idx} style={{ fontSize: 12.5, color: C.green, fontWeight: '700' }}>✓ {chk}</Text>
          ))}
        </View>

        {o.report?.customerSignature ? (
          <View style={{ padding: 12, borderRadius: R.md, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', marginTop: 10 }}>
            <Text style={{ fontWeight: '800', color: '#166534', fontSize: 13 }}>3. Chữ ký số xác nhận của Khách hàng</Text>
            <Text style={{ fontStyle: 'italic', fontSize: 18, fontWeight: '900', color: C.navy, marginTop: 4 }}>{o.report.customerSignature}</Text>
            <Text style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>✓ Đã xác thực bàn giao thiết bị an toàn và hoạt động bình thường</Text>
          </View>
        ) : null}
      </Sheet>
      <Sheet
        visible={showCancel}
        onClose={() => setShowCancel(false)}
        title="Lý do huỷ đơn"
        footer={<Btn title={cancelBusy ? 'Đang huỷ…' : 'Xác nhận huỷ'} variant="danger" disabled={cancelBusy} onPress={cancelOrder} />}
      >
        <View style={{ backgroundColor: '#F0F4FA', borderRadius: R.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#DCE5F5' }}>
          <Text style={{ fontSize: 12.5, color: C.ink, fontWeight: '700', marginBottom: 2 }}>Chính sách huỷ đơn</Text>
          <Text style={{ fontSize: 12, color: C.ink2, lineHeight: 17 }}>
            Quý khách được huỷ đơn miễn phí trước giờ hẹn tối thiểu {FREE_CANCEL_TEXT}. Nếu còn dưới {FREE_CANCEL_TEXT} trước giờ hẹn, tính năng huỷ đơn sẽ bị khoá để bảo đảm lịch trình của thợ.
          </Text>
        </View>
        {CANCEL_REASONS.map((r) => (
          <Tap key={r} style={mx.option} onPress={() => setReason(r)}>
            <Radio on={reason === r} />
            <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{r}</Text>
          </Tap>
        ))}
      </Sheet>
      <Sheet
        visible={showReject}
        onClose={() => setShowReject(false)}
        title="Phản hồi báo giá"
        footer={(
          <Btn
            title={quoteBusy ? 'Đang gửi…' : rejectMode === 'revise' ? 'Gửi yêu cầu báo giá lại' : 'Xác nhận từ chối & huỷ đơn'}
            variant={rejectMode === 'revise' ? 'primary' : 'danger'}
            disabled={quoteBusy}
            onPress={() => {
              setShowReject(false);
              respondQuote(rejectMode === 'revise' ? 'revise' : false, rejectReason);
            }}
          />
        )}
      >
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Tap
            onPress={() => setRejectMode('revise')}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 12,
              paddingHorizontal: 10,
              borderWidth: 1.5,
              borderRadius: R.md,
              borderColor: rejectMode === 'revise' ? C.primary : C.line,
              backgroundColor: rejectMode === 'revise' ? C.primarySoft : '#fff',
            }}
          >
            <Radio on={rejectMode === 'revise'} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: rejectMode === 'revise' ? C.primary : C.ink, flex: 1 }}>Yêu cầu báo giá lại</Text>
          </Tap>
          <Tap
            onPress={() => setRejectMode('cancel')}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 12,
              paddingHorizontal: 10,
              borderWidth: 1.5,
              borderRadius: R.md,
              borderColor: rejectMode === 'cancel' ? C.red : C.line,
              backgroundColor: rejectMode === 'cancel' ? C.redSoft : '#fff',
            }}
          >
            <Radio on={rejectMode === 'cancel'} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: rejectMode === 'cancel' ? C.red : C.ink, flex: 1 }}>Từ chối & Huỷ đơn</Text>
          </Tap>
        </View>
        <Text style={[ui.meta, { fontSize: 13, marginBottom: 8 }]}>
          {rejectMode === 'revise'
            ? 'Thợ sẽ nhận được yêu cầu và điều chỉnh lại phương án / chi phí cho bạn.'
            : 'Đơn hàng sẽ được huỷ ngay lập tức. Chính sách Minh Đức miễn phí 100% kiểm tra tại nhà (0đ), bạn không phải trả bất kỳ khoản phí nào.'}
        </Text>
        {REJECT_REASONS.map((r) => (
          <Tap key={r} style={mx.option} onPress={() => setRejectReason(r)}>
            <Radio on={rejectReason === r} />
            <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{r}</Text>
          </Tap>
        ))}
      </Sheet>
      <Sheet
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        title="Sửa yêu cầu dịch vụ"
        footer={<Btn title={editBusy ? 'Đang lưu…' : 'Lưu thay đổi'} disabled={editBusy} onPress={saveEdit} />}
      >
        <Text style={[ui.meta, { marginBottom: 8 }]}>Chỉ sửa được khi đơn còn chờ thợ nhận.</Text>
        <Text style={{ fontWeight: '800', color: C.ink, marginBottom: 8 }}>Ngày hẹn</Text>
        <HScroll contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
          {editDays.map((dd, i) => (
            <Tap key={dd.key} onPress={() => handleEditDaySelect(i)} style={[mx.day, editDayIdx === i && mx.dayOn]}>
              <Text style={[mx.dayLabel, editDayIdx === i && { color: 'rgba(255,255,255,0.85)' }]}>{dd.label}</Text>
              <Text style={[mx.dayDate, editDayIdx === i && { color: '#fff' }]}>{dd.ddmm}</Text>
            </Tap>
          ))}
        </HScroll>
        <TimeRangeSlider
          value={editMinutes}
          onChange={handleEditTimeChange}
          minMinutes={minAvailEdit}
          maxMinutes={MAX_DAY_MINUTE}
          step={SLOT_STEP_MINUTES}
          isToday={editDayIdx === 0}
          onSelectTomorrow={() => handleEditDaySelect(1)}
        />
        <Field label="Mô tả tình trạng" multiline value={editNote} onChangeText={setEditNote} placeholder="Cập nhật mô tả lỗi…" style={{ marginTop: 4 }} />
        <Text style={{ fontWeight: '800', color: C.ink, marginTop: 8, marginBottom: 8 }}>Ảnh đính kèm</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {editAtts.map((att) => (
            <View key={att.id} style={mx.thumb}>
              <Image source={{ uri: att.uri }} style={{ width: '100%', height: '100%' }} />
              <Tap style={mx.thumbX} onPress={() => setEditAtts((p) => p.filter((x) => x.id !== att.id))} hitSlop={6}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✕</Text>
              </Tap>
            </View>
          ))}
          {editAtts.length < 5 ? (
            <Tap style={mx.thumbAdd} onPress={addEditAtt}>
              <Text style={{ fontSize: 20, color: C.primary }}>+</Text>
            </Tap>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

const InfoLine = ({ icon, label, value, link }) => (
  <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' }}>
    <View style={{ width: 22, paddingTop: 2 }}><AppIcon icon={icon} size={17} color={C.primary} strokeWidth={2.1} /></View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 14, color: link ? C.primary : C.ink, fontWeight: '600', marginTop: 2, lineHeight: 20 }}>{value}</Text>
    </View>
  </View>
);
const Bill = ({ l, v, green }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
    <Text style={{ color: C.muted, fontSize: 14 }}>{l}</Text>
    <Text style={{ color: green ? C.green : C.ink, fontWeight: '700', fontSize: 14 }}>{v}</Text>
  </View>
);

// =========================================================== ĐÁNH GIÁ
const QUICK_TAGS = ['Đúng giờ', 'Tay nghề tốt', 'Thân thiện', 'Sạch sẽ', 'Giá hợp lý', 'Tư vấn tận tình'];
export function RateScreen({ params }) {
  const { s, a, nav, ui: u } = useApp();
  const o = (s.orders || []).find((x) => x.code === params?.code);
  const [stars, setStars] = useState(5);
  const [tags, setTags] = useState([]);
  const [text, setText] = useState('');
  const [sending, runSend] = useBusy();
  if (!o) return <NotFoundView title="Không tìm thấy đơn" body="Không tìm thấy đơn cần đánh giá. Đơn có thể đã được đánh giá hoặc chưa đồng bộ." onBack={() => nav.back()} />;
  const svc = getService(o.items?.[0]?.id);
  const LABEL = ['', 'Rất tệ', 'Chưa hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời!'];
  const submit = () => runSend(async () => {
    const full = [tags.join(', '), text.trim()].filter(Boolean).join('. ');
    try {
      const res = await callAction(a.rateOrder, o.code, stars, full);
      // Chỉ rời màn khi gửi thành công; thất bại thì context đã báo lỗi, giữ nguyên nội dung để thử lại.
      if (isOk(res)) nav.back();
    } catch (e) {
      u.alert('Chưa gửi được đánh giá', errorText(e, 'Không gửi được đánh giá. Vui lòng thử lại.'), '⚠️');
    }
  });
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Đánh giá dịch vụ" sub={o.code} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Media item={svc} height={72} width={72} radius={20} />
          <Text style={[mx.tlTitle, { textAlign: 'center', marginTop: 12 }]}>{svc?.name}</Text>
          <Text style={ui.meta}>Thợ {o.tech?.name}</Text>
          <View style={{ marginTop: 18 }}><Stars value={stars} size={38} onChange={setStars} /></View>
          <Text style={{ marginTop: 10, fontWeight: '800', color: C.orange, fontSize: 15 }}>{LABEL[stars]}</Text>
        </Card>
        <Text style={mx.sec}>Bạn hài lòng điều gì?</Text>
        <View style={mx.chips}>
          {QUICK_TAGS.map((t) => <Chip key={t} label={t} on={tags.includes(t)} onPress={() => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))} />)}
        </View>
        <Field label="Nhận xét thêm" multiline value={text} onChangeText={setText} placeholder="Chia sẻ trải nghiệm của bạn…" />
        <View style={mx.bonus}><Text style={{ color: C.goldInk, fontWeight: '700' }}>🎁 Nhận ngay +{s.policy?.loyalty?.review_bonus_points ?? 20} điểm thưởng khi gửi đánh giá</Text></View>
      </ScrollView>
      <View style={mx.dock}><Btn title={sending ? 'Đang gửi…' : 'Gửi đánh giá'} style={{ flex: 1 }} disabled={sending} onPress={submit} /></View>
    </View>
  );
}

// =========================================================== QUYỀN LỢI
const HISTORY_INITIAL_COUNT = 3;
const HISTORY_TABS = [
  { id: 'all', label: 'Tất cả', test: () => true },
  { id: 'earn', label: '+ Đã nhận', test: (h) => h.delta > 0 },
  { id: 'redeem', label: '- Đã đổi', test: (h) => h.delta < 0 },
];
const matchHistoryFilter = (h, filter) => (HISTORY_TABS.find((t) => t.id === filter) || HISTORY_TABS[0]).test(h);

function HistoryFilterTabs({ list, value, onChange, style }) {
  return (
    <View style={[{ flexDirection: 'row', gap: 6 }, style]}>
      {HISTORY_TABS.map((tab) => {
        const on = value === tab.id;
        return (
          <Tap
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={{
              paddingVertical: 5,
              paddingHorizontal: 10,
              borderRadius: R.pill,
              backgroundColor: on ? C.primary : '#F1F5F9',
            }}
          >
            <Text style={{ fontSize: 11.5, fontWeight: on ? '800' : '600', color: on ? '#fff' : C.ink2 }}>
              {tab.label} ({list.filter(tab.test).length})
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

function PointHistoryRow({ h, last, singleLine, onPress }) {
  const isEarn = h.delta > 0;
  const title = String(h.title || '');
  const isReview = h.type === 'review' || /đánh giá/i.test(title);
  const isBonus = h.type === 'bonus' || /tân thủ|đăng ký/i.test(title);
  const iconName = isEarn ? (isReview ? 'star' : (isBonus ? 'sparkles' : 'receipt-text')) : 'gift';
  const iconBg = isEarn ? (isReview ? '#FEF9C3' : (isBonus ? '#F3E8FF' : '#E0F2FE')) : '#FFEDD5';
  const iconFg = isEarn ? (isReview ? '#CA8A04' : (isBonus ? '#9333EA' : '#0284C7')) : '#EA580C';
  return (
    <Tap
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: '#F1F5F9',
      }}
    >
      <IconBox icon={iconName} size={38} bg={iconBg} color={iconFg} radius={11} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: C.ink, fontSize: 13 }} numberOfLines={singleLine ? 1 : undefined}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Text style={{ fontSize: 11, color: C.muted }}>{fmtDateTime(h.at)}</Text>
          {h.orderCode ? (
            <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.primary }}>#{h.orderCode}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={{ fontWeight: '900', fontSize: 14, color: isEarn ? '#16A34A' : '#EA580C' }}>
        {isEarn ? `+${h.delta}` : h.delta} điểm
      </Text>
    </Tap>
  );
}

export function RewardsScreen({ params }) {
  const { s, a, nav, ui: u, setPendingVoucher } = useApp();
  const lp = s.lifetimePoints || 0;
  const { cur, next } = tierOf(lp);
  const progress = next ? (lp - cur.min) / (next.min - cur.min) : 1;
  const [selectedTierId, setSelectedTierId] = useState(params?.tierId || null);
  const activeTier = TIERS.find((t) => t.id === selectedTierId) || null;
  const previewTier = activeTier || cur;
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [showHistorySheet, setShowHistorySheet] = useState(false);

  // Ghi nhớ mã → màn Xác nhận đặt lịch sẽ tự áp dụng
  const pickWalletVoucher = (v) => {
    setPendingVoucher(v.code);
    if (s.cart.length) {
      nav.push('checkout', { items: s.cart.map(({ id, qty }) => ({ id, qty })), fromCart: true });
    } else {
      u.toast(`Chọn dịch vụ, mã ${v.code} sẽ tự áp dụng`, '🎟️');
      nav.services();
    }
  };

  // Lịch sử điểm lấy từ backend (s.pointHistory); dùng chung cho danh sách rút gọn và Sheet "Toàn bộ".
  const historyList = s.pointHistory || [];
  const totalEarned = historyList.filter((h) => h.delta > 0).reduce((sum, h) => sum + h.delta, 0);
  const totalSpent = Math.abs(historyList.filter((h) => h.delta < 0).reduce((sum, h) => sum + h.delta, 0));
  const filteredHistory = historyList.filter((h) => matchHistoryFilter(h, historyFilter));
  const displayHistory = historyExpanded ? filteredHistory : filteredHistory.slice(0, HISTORY_INITIAL_COUNT);
  const hasMoreHistory = filteredHistory.length > HISTORY_INITIAL_COUNT;
  const openHistoryOrder = (h, fromSheet) => {
    if (!h.orderCode) return;
    if (fromSheet) setShowHistorySheet(false);
    nav.push('order', { code: h.orderCode });
  };
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Quyền lợi của tôi" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <View style={mx.pointsHero}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' }}>Điểm khả dụng (Đổi voucher)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 38, fontWeight: '900' }}>{s.points}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '700' }}>điểm tiêu dùng</Text>
              </View>
            </View>
            <Tap
              onPress={() => setSelectedTierId(cur.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(255,255,255,0.18)',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: R.pill,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.3)',
              }}
            >
              <AppIcon name="crown" size={14} color="#FDE047" strokeWidth={2.4} />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{cur.label}</Text>
            </Tap>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 12 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600' }}>
              Điểm tích luỹ xét hạng: <Text style={{ color: '#fff', fontWeight: '800' }}>{lp} điểm</Text>
            </Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ color: '#BAE6FD', fontSize: 10.5, fontWeight: '800' }}>
                Chu kỳ 12 tháng
              </Text>
            </View>
          </View>
          <Progress value={progress} color="#FFFFFF" style={{ marginTop: 8, backgroundColor: 'rgba(255,255,255,0.25)', height: 6 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: '600', flex: 1 }}>
              {next ? `Cần thêm ${next.min - lp} điểm để lên hạng ${next.label}` : '👑 Bạn đã đạt thứ hạng cao nhất (Kim cương)!'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              Đổi voucher không trừ điểm hạng
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>Các hạng thành viên</Text>
          <Text style={{ fontSize: 11, fontWeight: '600', color: C.primary }}>Chạm vào hạng để xem quyền lợi ›</Text>
        </View>

        <View style={mx.tiers}>
          {TIERS.map((t) => {
            const isCurrent = cur.id === t.id;
            const unlocked = lp >= t.min;
            const isSelected = previewTier.id === t.id;
            return (
              <Tap
                key={t.id}
                onPress={() => setSelectedTierId(t.id)}
                style={[
                  mx.tierItem,
                  isCurrent && { borderColor: t.color, backgroundColor: '#fff' },
                  isSelected && { borderColor: t.color, borderWidth: 2, backgroundColor: '#fff', ...shadow.sm },
                ]}
              >
                <AppIcon name={unlocked ? 'crown' : 'lock'} size={18} color={unlocked ? t.color : C.muted} strokeWidth={2.2} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: isCurrent || isSelected ? t.color : C.muted, marginTop: 4 }}>{t.label}</Text>
                <Text style={{ fontSize: 10, color: C.faint }}>{t.min}+</Text>
                {isCurrent ? (
                  <View style={{ marginTop: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: R.pill, backgroundColor: t.bg || C.primarySoft }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: t.color }}>Hiện tại</Text>
                  </View>
                ) : null}
              </Tap>
            );
          })}
        </View>

        {/* Tóm tắt nhanh hạng đang chọn ngay dưới thanh hạng */}
        <Card
          style={{ marginTop: 12, borderColor: previewTier.color, borderWidth: 1.2, backgroundColor: '#fff' }}
          onPress={() => setSelectedTierId(previewTier.id)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Badge text={`👑 Hạng ${previewTier.label}`} fg={previewTier.color} bg={previewTier.bg || C.primarySoft} />
              {cur.id === previewTier.id ? (
                <Badge text="Hạng của bạn" fg={C.green} bg={C.greenSoft} />
              ) : lp >= previewTier.min ? (
                <Badge text="✓ Đã mở khoá" fg={C.green} bg={C.greenSoft} />
              ) : (
                <Badge text={`Cần thêm ${previewTier.min - lp} điểm`} fg={C.orange} bg={C.orangeSoft} />
              )}
            </View>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.primary }}>Chi tiết ›</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 8 }}>{previewTier.summary}</Text>
          <View style={{ marginTop: 8, gap: 4 }}>
            {(previewTier.benefits || []).slice(0, 3).map((b, i) => (
              <Text key={i} style={{ fontSize: 12, color: C.ink2, lineHeight: 18 }} numberOfLines={1}>{b}</Text>
            ))}
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary, marginTop: 8 }}>
            Xem đầy đủ điều kiện & điều khoản bảo vệ khách hàng ({previewTier.benefits?.length || 0} đặc quyền) ›
          </Text>
        </Card>

        {/* 1. ĐỔI ĐIỂM LẤY VOUCHER (Ưu tiên đưa lên trên để khách dễ dàng sử dụng điểm) */}
        <SectionTitle title="Đổi điểm lấy voucher" />
        {(s.redeemOptions || []).length === 0 ? <Text style={ui.meta}>Hiện chưa có ưu đãi đổi điểm.</Text> : null}
        {(s.redeemOptions || []).map((r) => {
          const enough = s.points >= r.cost;
          return (
            <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <IconBox icon="gift" size={46} bg={C.goldSoft} radius={14} />
              <View style={{ flex: 1 }}>
                <Text style={mx.tlTitle}>{r.title}</Text>
                <Text style={[ui.meta, { color: C.goldInk, fontWeight: '700' }]}>{r.cost} điểm</Text>
              </View>
              <Btn
                title="Đổi"
                small
                variant={enough ? 'gold' : 'ghost'}
                disabled={!enough}
                onPress={() => u.confirm('Đổi voucher?', `Dùng ${r.cost} điểm để đổi ${String(r.title || '').toLowerCase()}.`, () => {
                  callAction(a.redeem, r.id).catch((e) => u.alert('Chưa đổi được', errorText(e, 'Không đổi được voucher. Vui lòng thử lại.'), '⚠️'));
                }, 'Đổi ngay')}
              />
            </Card>
          );
        })}

        {/* 2. VÍ VOUCHER */}
        <SectionTitle title={`Ví voucher (${(s.myVouchers || []).length + (s.publicVouchers || []).length})`} />
        {[...(s.myVouchers || []), ...(s.publicVouchers || [])].map((v) => (
          <View key={v.code} style={mx.ticket}>
            <View style={[mx.ticketLeft, v.wallet && { backgroundColor: C.primary }]}>
              <AppIcon icon={v.wallet ? 'gift' : 'ticket'} size={22} color={v.wallet ? '#fff' : C.primary} strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, padding: 12 }}>
              <Text style={{ fontWeight: '900', color: C.ink, letterSpacing: 0.5 }}>{v.code}</Text>
              <Text style={ui.meta}>{v.label}</Text>
            </View>
            <Btn title="Dùng" small variant="soft" style={{ marginRight: 12 }} onPress={() => pickWalletVoucher(v)} />
          </View>
        ))}
        <Text style={[ui.meta, { textAlign: 'center', marginTop: 4, marginBottom: 8 }]}>Chọn mã ở bước Xác nhận đặt lịch để được giảm giá.</Text>

        {/* 3. CÁCH TÍCH ĐIỂM */}
        <SectionTitle title="Cách tích điểm" />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListRow icon="receipt-text" iconBg={C.primarySoft} label="Hoàn thành đơn hàng" sub={`${formatVND(s.policy?.loyalty?.earn?.vnd_per_point || 10000)} = 1 điểm`} onPress={() => nav.services()} />
          <ListRow icon="star" iconBg={C.goldSoft} label="Đánh giá sau khi dùng dịch vụ" sub={`+${s.policy?.loyalty?.review_bonus_points ?? 20} điểm mỗi đơn`} onPress={() => nav.activity('done')} last />
        </Card>

        {/* 4. LỊCH SỬ ĐIỂM THƯỞNG (THIẾT KẾ GỌN GÀNG, KHÔNG BỊ TRÀN DÀI) */}
        <View style={{ marginTop: 12 }}>
          <SectionTitle
            title="Lịch sử điểm thưởng"
            action={historyList.length > 0 ? `Toàn bộ (${historyList.length})` : null}
            onAction={() => setShowHistorySheet(true)}
          />

          {/* Thẻ thống kê 2 chỉ số: Tích luỹ & Đã dùng */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#F0FDF4',
                borderWidth: 1,
                borderColor: '#DCFCE7',
                paddingVertical: 9,
                paddingHorizontal: 12,
                borderRadius: 12,
              }}
            >
              <IconBox icon="trending-up" size={30} bg="#DCFCE7" color="#16A34A" radius={8} />
              <View>
                <Text style={{ fontSize: 10.5, color: '#15803D', fontWeight: '600' }}>Tổng tích luỹ</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#16A34A' }}>+{totalEarned} điểm</Text>
              </View>
            </View>

            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#FFF7ED',
                borderWidth: 1,
                borderColor: '#FFEDD5',
                paddingVertical: 9,
                paddingHorizontal: 12,
                borderRadius: 12,
              }}
            >
              <IconBox icon="gift" size={30} bg="#FFEDD5" color="#EA580C" radius={8} />
              <View>
                <Text style={{ fontSize: 10.5, color: '#C2410C', fontWeight: '600' }}>Đã đổi voucher</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#EA580C' }}>-{totalSpent} điểm</Text>
              </View>
            </View>
          </View>

          {/* Bộ lọc tab mini: Tất cả | Đã nhận | Đã đổi */}
          <HistoryFilterTabs list={historyList} value={historyFilter} onChange={setHistoryFilter} style={{ marginBottom: 10 }} />

          {/* Danh sách rút gọn tối đa HISTORY_INITIAL_COUNT dòng */}
          {filteredHistory.length === 0 ? (
            <Card style={{ backgroundColor: '#F8FAFC', padding: 16, alignItems: 'center' }}>
              <Text style={ui.meta}>Không có giao dịch nào trong mục này.</Text>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {displayHistory.map((h, i) => (
                <PointHistoryRow
                  key={h.id || i}
                  h={h}
                  last={i === displayHistory.length - 1}
                  singleLine
                  onPress={() => openHistoryOrder(h, false)}
                />
              ))}

              {/* Nút Xem thêm / Thu gọn trực tiếp */}
              {hasMoreHistory && (
                <Tap
                  onPress={() => setHistoryExpanded(!historyExpanded)}
                  style={{
                    paddingVertical: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: '#F8FAFC',
                    borderTopWidth: 1,
                    borderTopColor: '#F1F5F9',
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.primary }}>
                    {historyExpanded ? 'Thu gọn danh sách ▲' : `Xem thêm (${filteredHistory.length - HISTORY_INITIAL_COUNT} giao dịch khác) ▼`}
                  </Text>
                </Tap>
              )}
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Sheet xem toàn bộ lịch sử điểm thưởng */}
      <Sheet
        visible={showHistorySheet}
        onClose={() => setShowHistorySheet(false)}
        title="Lịch sử giao dịch điểm"
        footer={<Btn title="Đóng" variant="ghost" onPress={() => setShowHistorySheet(false)} />}
      >
        <View>
          {/* Bộ lọc trong Sheet */}
          <HistoryFilterTabs list={historyList} value={historyFilter} onChange={setHistoryFilter} style={{ marginBottom: 12 }} />
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {filteredHistory.map((h, i) => (
              <PointHistoryRow
                key={h.id || i}
                h={h}
                last={i === filteredHistory.length - 1}
                onPress={() => openHistoryOrder(h, true)}
              />
            ))}
          </Card>
        </View>
      </Sheet>

      <Sheet
        visible={!!activeTier}
        onClose={() => setSelectedTierId(null)}
        title={activeTier ? `Hạng ${activeTier.label} (${activeTier.min}+ điểm)` : 'Quyền lợi hạng'}
        footer={activeTier ? (
          <Btn
            title={lp >= activeTier.min ? 'Đặt dịch vụ với đặc quyền của bạn' : `Đặt dịch vụ tích thêm ${activeTier.min - lp} điểm`}
            onPress={() => {
              setSelectedTierId(null);
              nav.services();
            }}
          />
        ) : null}
      >
        {activeTier ? (
          <View>
            {/* Thanh chuyển nhanh giữa các hạng ngay trong Sheet */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              {TIERS.map((t) => {
                const on = t.id === activeTier.id;
                return (
                  <Tap
                    key={t.id}
                    onPress={() => setSelectedTierId(t.id)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: R.md,
                      alignItems: 'center',
                      borderWidth: 1.5,
                      borderColor: on ? t.color : C.line,
                      backgroundColor: on ? (t.bg || C.primarySoft) : '#F8FAFD',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: on ? t.color : C.muted }}>{t.label}</Text>
                    <Text style={{ fontSize: 10, color: C.faint }}>{t.min}+</Text>
                  </Tap>
                );
              })}
            </View>

            {/* Banner trạng thái của khách với hạng này */}
            <View style={{ padding: 14, borderRadius: R.lg, backgroundColor: activeTier.bg || C.primarySoft, borderWidth: 1, borderColor: activeTier.color }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: activeTier.color }}>👑 Hạng {activeTier.label}</Text>
                <Badge
                  text={
                    cur.id === activeTier.id
                      ? '🎯 Hạng hiện tại của bạn'
                      : lp >= activeTier.min
                        ? '✓ Đã đạt hạng này'
                        : `🔒 Còn thiếu ${activeTier.min - lp} điểm`
                  }
                  fg={lp >= activeTier.min ? C.green : C.orange}
                  bg="#fff"
                />
              </View>
              <Text style={{ color: C.ink, fontWeight: '700', marginTop: 6, lineHeight: 19 }}>{activeTier.summary}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Badge text={`🛡️ Bảo hành ${activeTier.warrantyDays || BASE_WARRANTY_DAYS} ngày`} fg={C.navy} bg="#fff" />
                <Badge text={`📊 Tích luỹ của bạn: ${lp}/${activeTier.min || 0} điểm`} fg={C.ink2} bg="#fff" />
              </View>
              {activeTier.min > 0 ? (
                <Progress
                  value={Math.min(1, lp / activeTier.min)}
                  color={activeTier.color}
                  style={{ marginTop: 10, backgroundColor: 'rgba(255,255,255,0.65)' }}
                />
              ) : null}
            </View>

            {/* 1. Điều kiện xét hạng */}
            <Text style={{ fontWeight: '800', color: C.ink, marginTop: 16, marginBottom: 6 }}>📋 Điều kiện đạt & duy trì hạng</Text>
            <View style={{ padding: 12, borderRadius: R.md, backgroundColor: '#F8FAFD', borderWidth: 1, borderColor: C.line }}>
              <Text style={{ color: C.ink, fontWeight: '600', lineHeight: 20 }}>{activeTier.condition}</Text>
              {activeTier.pointRule ? (
                <Text style={[ui.meta, { color: C.primary, fontWeight: '700', marginTop: 6 }]}>• {activeTier.pointRule}</Text>
              ) : null}
            </View>

            {/* 2. Đặc quyền & Quyền lợi dành cho khách hàng */}
            <Text style={{ fontWeight: '800', color: C.ink, marginTop: 16, marginBottom: 8 }}>🎁 Đặc quyền & Quyền lợi khách hàng</Text>
            {(activeTier.benefits || []).map((b, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: C.green }}>✓</Text>
                </View>
                <Text style={{ flex: 1, color: C.ink, lineHeight: 20, fontWeight: '600' }}>{b}</Text>
              </View>
            ))}

            {/* 3. Điều khoản bảo vệ có lợi cho khách hàng */}
            <Text style={{ fontWeight: '800', color: C.ink, marginTop: 14, marginBottom: 8 }}>🛡️ Điều khoản bảo vệ & Cam kết có lợi cho khách hàng</Text>
            <View style={{ padding: 12, borderRadius: R.md, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#F5D77A', gap: 8 }}>
              {(activeTier.terms || []).map((term, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Text style={{ color: C.goldInk, fontWeight: '900', marginTop: 1 }}>★</Text>
                  <Text style={{ flex: 1, color: C.ink2, lineHeight: 19, fontSize: 13 }}>{term}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

// =========================================================== HỒ SƠ
export function ProfileScreen() {
  const { s, a, d, nav, ui: u } = useApp();
  const [name, setName] = useState(s.user?.name || '');
  const [phone, setPhone] = useState(s.user?.phone || '');
  // Không tự điền ngày sinh giả: chưa có thì để trống cho khách tự nhập.
  const [dob, setDob] = useState(s.user?.dob || s.auth?.dob || '');
  // Email là tài khoản đăng nhập, không sửa ở màn này → chỉ hiển thị, không validate.
  const email = s.user?.email || s.auth?.email || '';
  const [err, setErr] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpErr, setOtpErr] = useState('');
  // Chỉ lưu cờ "đã gửi mã", không giữ mã OTP trả về từ API ở client.
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, runVerify] = useBusy();
  const [pwSaving, runPw] = useBusy();
  const [saving, runSave] = useBusy();

  const sendOtp = async () => {
    if (otpSending) return;
    setOtpSending(true);
    setOtpErr('');
    try {
      const res = (await callAction(a.sendEmailOtp)) || {};
      if (res.ok) {
        if (res.alreadyVerified) setShowOtp(false);
        else setOtpSent(true);
      } else {
        setOtpErr(errorText(res, 'Không thể gửi mã OTP.'));
      }
    } catch (e) {
      setOtpErr(errorText(e, 'Không thể gửi mã OTP. Vui lòng thử lại.'));
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = () => runVerify(async () => {
    if (otpInput.length !== 6) { setOtpErr('Vui lòng nhập đủ 6 chữ số của mã OTP.'); return; }
    setOtpErr('');
    try {
      const res = (await callAction(a.verifyEmailOtp, otpInput)) || {};
      if (res.ok) {
        setShowOtp(false);
        setOtpInput('');
        setOtpSent(false);
      } else {
        setOtpErr(errorText(res, 'Mã OTP không chính xác.'));
      }
    } catch (e) {
      setOtpErr(errorText(e, 'Không xác thực được mã OTP. Vui lòng thử lại.'));
    }
  });

  const save = () => runSave(async () => {
    const e = {};
    const nameErr = validateContactName(name);
    if (nameErr) e.name = nameErr;
    if (phone) {
      const phoneErr = validateVietnamesePhone(phone);
      if (phoneErr) e.phone = phoneErr;
    }
    const dErr = dobError(dob);
    if (dErr) e.dob = dErr;
    setErr(e);
    if (Object.keys(e).length) return;
    try {
      const ok = await callAction(a.updateUser, { name: name.trim(), phone, dob: dob.trim() });
      if (isOk(ok)) nav.back();
    } catch (ex) {
      u.alert('Không lưu được', errorText(ex, 'Không lưu được thông tin. Vui lòng thử lại.'), '⚠️');
    }
  });

  const closePw = () => {
    setShowPw(false);
    setCurPw(''); setNewPw(''); setNewPw2(''); setPwErr('');
  };
  const savePw = () => runPw(async () => {
    if (!curPw || !newPw || !newPw2) { setPwErr('Vui lòng nhập đủ mật khẩu hiện tại, mật khẩu mới và nhập lại.'); return; }
    if (newPw.length < PASSWORD_MIN_LENGTH) { setPwErr(`Mật khẩu mới cần tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`); return; }
    if (newPw !== newPw2) { setPwErr('Mật khẩu mới nhập lại chưa khớp.'); return; }
    if (newPw === curPw) { setPwErr('Mật khẩu mới phải khác mật khẩu hiện tại.'); return; }
    setPwErr('');
    try {
      const res = (await callAction(a.changePassword, { currentPassword: curPw, newPassword: newPw })) || {};
      if (!res.ok) { setPwErr(errorText(res, 'Không đổi được mật khẩu.')); return; }
      closePw();
    } catch (ex) {
      setPwErr(errorText(ex, 'Không đổi được mật khẩu. Vui lòng thử lại.'));
    }
  });
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Thông tin cá nhân" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <View style={mx.bigAvatar}><Text style={{ fontSize: 38, fontWeight: '900', color: C.navy }}>{(name || 'K').trim().charAt(0).toUpperCase()}</Text></View>
        </View>
        <Card>
          <Field
            label="Họ và tên"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (err.name) setErr((prev) => ({ ...prev, name: '' }));
            }}
            onBlur={() => {
              if (name.trim()) {
                const nameErr = validateContactName(name);
                if (nameErr) setErr((prev) => ({ ...prev, name: nameErr }));
              }
            }}
            placeholder="Nguyễn Văn A"
            error={err.name}
            style={{ marginTop: -8 }}
          />
          <Field
            label="Số điện thoại"
            value={phone}
            onChangeText={(t) => {
              let p = t.replace(/[^0-9]/g, '').slice(0, 10);
              if (p.length > 0 && !p.startsWith('0')) {
                p = '0' + p.slice(0, 9);
              }
              setPhone(p);
              if (p.length === 10) {
                const phoneErr = validateVietnamesePhone(p);
                setErr((prev) => ({ ...prev, phone: phoneErr }));
              } else if (err.phone) {
                setErr((prev) => ({ ...prev, phone: '' }));
              }
            }}
            onBlur={() => {
              if (phone) {
                const phoneErr = validateVietnamesePhone(phone);
                if (phoneErr) setErr((prev) => ({ ...prev, phone: phoneErr }));
              }
            }}
            keyboardType="phone-pad"
            placeholder="10 chữ số (bắt đầu bằng số 0)"
            error={err.phone}
          />
          <Field
            label="Ngày tháng năm sinh"
            value={dob}
            onChangeText={(t) => {
              const digits = t.replace(/\D/g, '').slice(0, 8);
              let formatted = digits;
              if (digits.length > 4) {
                formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
              } else if (digits.length > 2) {
                formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
              }
              setDob(formatted);
              if (err.dob) setErr((prev) => ({ ...prev, dob: '' }));
            }}
            keyboardType="numeric"
            placeholder="DD/MM/YYYY (VD: 15/08/1995)"
            error={err.dob}
          />
          <Field label="Email (tài khoản đăng nhập, không sửa ở đây)" value={email} editable={false} />
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            {s.auth?.emailVerified ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Badge text="✓ Đã xác thực Email" fg={C.green} bg={C.greenSoft} />
                <Text style={ui.meta}>Đủ điều kiện đặt lịch dịch vụ</Text>
              </View>
            ) : (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: '#B45309', fontSize: 13 }}>⚠️ Email chưa xác thực</Text>
                  <Text style={ui.meta}>Bắt buộc xác thực OTP để đặt dịch vụ</Text>
                </View>
                <Tap
                  onPress={() => {
                    setShowOtp(true);
                    if (!otpHint) sendOtp();
                  }}
                >
                  <Badge text="📧 Xác thực ngay" fg="#fff" bg="#D97706" />
                </Tap>
              </>
            )}
          </View>
        </Card>
        <Card style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
          <ListRow icon="lock" iconBg={C.primarySoft} label="Đổi mật khẩu" onPress={() => setShowPw(true)} last />
        </Card>
      </ScrollView>
      <View style={mx.dock}><Btn title="Lưu thay đổi" style={{ flex: 1 }} onPress={save} /></View>
      <Sheet visible={showOtp} onClose={() => setShowOtp(false)} title="Xác thực Email (OTP 6 số)" footer={<Btn title="Xác nhận mã OTP" onPress={verifyOtp} />}>
        <Text style={{ color: C.ink2, lineHeight: 20, marginBottom: 12 }}>
          Nhập mã xác thực 6 chữ số được gửi tới địa chỉ Email:{' '}
          <Text style={{ fontWeight: '800', color: C.ink }}>{email || s.auth?.email}</Text>
        </Text>
        <View
          style={{
            padding: 12,
            borderRadius: R.md,
            backgroundColor: '#EFF6FF',
            borderWidth: 1,
            borderColor: '#BFDBFE',
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AppIcon name="mail-open" size={20} color="#1E40AF" strokeWidth={2.2} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, color: '#1E40AF', fontWeight: '700' }}>Kiểm tra hộp thư Email</Text>
            <Text style={{ fontSize: 12, color: '#3B82F6', marginTop: 2 }}>
              Mã OTP 6 chữ số đã được gửi tới {email || s.auth?.email} (hiệu lực 5 phút).
            </Text>
          </View>
        </View>
        <Field
          label="Mã OTP (6 chữ số)"
          value={otpInput}
          onChangeText={(t) => { setOtpInput(t.replace(/\D/g, '').slice(0, 6)); setOtpErr(''); }}
          keyboardType="number-pad"
          placeholder="Nhập 6 chữ số"
          error={otpErr}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <Text style={ui.meta}>Hiệu lực trong 5 phút</Text>
          <Tap onPress={sendOtp} disabled={otpSending}>
            <Text style={ui.link}>{otpSending ? 'Đang gửi...' : '🔄 Gửi lại mã OTP'}</Text>
          </Tap>
        </View>
      </Sheet>
      <Sheet visible={showPw} onClose={() => setShowPw(false)} title="Đổi mật khẩu" footer={<Btn title="Cập nhật mật khẩu" onPress={savePw} />}>
        <Field label="Mật khẩu hiện tại" value={curPw} onChangeText={setCurPw} secureTextEntry placeholder="••••••" style={{ marginTop: -8 }} />
        <Field label="Mật khẩu mới" value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="Ít nhất 6 ký tự" />
        <Field label="Nhập lại mật khẩu mới" value={newPw2} onChangeText={setNewPw2} secureTextEntry placeholder="Nhập lại" />
      </Sheet>
    </View>
  );
}

// =========================================================== TRỢ GIÚP
export function HelpScreen() {
  const { nav, ui: u } = useApp();
  const [open, setOpen] = useState(0);
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Trợ giúp" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { i: 'phone-call', t: 'Gọi hotline', onPress: u.call },
            { i: 'shield-check', t: 'Bảo hành', onPress: () => nav.warranty() },
            { i: 'clipboard-list', t: 'Đơn của tôi', onPress: () => nav.activity() },
          ].map((x) => (
            <Card key={x.t} style={{ flex: 1, alignItems: 'center', paddingVertical: 16 }} onPress={x.onPress}>
              <IconBox icon={x.i} size={44} bg={C.primarySoft} radius={14} />
              <Text style={{ fontWeight: '700', color: C.ink, marginTop: 8, fontSize: 13 }}>{x.t}</Text>
            </Card>
          ))}
        </View>
        <SectionTitle title="Câu hỏi thường gặp" />
        {FAQ.map((f, i) => (
          <Card key={f.q} style={{ marginBottom: 10 }} onPress={() => setOpen(open === i ? -1 : i)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[mx.tlTitle, { flex: 1 }]}>{f.q}</Text>
              <Text style={{ color: C.primary, fontSize: 18, fontWeight: '700' }}>{open === i ? '−' : '+'}</Text>
            </View>
            {open === i ? <Text style={{ color: C.ink2, lineHeight: 21, marginTop: 8, fontSize: 14 }}>{f.a}</Text> : null}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

export function TermsScreen() {
  const items = [
    ['1. Phạm vi áp dụng', 'Điều khoản áp dụng cho mọi khách hàng đặt dịch vụ kỹ thuật tại nhà qua ứng dụng Thợ Minh Đức.'],
    ['2. Đặt lịch & huỷ lịch', 'Khách hàng có thể huỷ đơn miễn phí khi thợ chưa di chuyển. Lịch hẹn được xác nhận qua cuộc gọi của thợ.'],
    ['3. Giá & thanh toán', 'Giá hiển thị gồm nhân công. Vật tư, linh kiện phát sinh được báo giá và chỉ thực hiện khi khách đồng ý.'],
    ['4. Bảo hành', 'Dịch vụ vệ sinh, nạp gas được bảo hành 60 ngày kể từ ngày hoàn thành.'],
    ['5. Điểm thưởng', 'Điểm được cộng khi đơn hoàn thành, không quy đổi thành tiền mặt và không chuyển nhượng.'],
    ['6. Bảo mật', 'Thông tin cá nhân chỉ dùng để phục vụ đơn hàng và chăm sóc khách hàng.'],
  ];
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Điều khoản ứng dụng" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {items.map(([t, b]) => (
          <Card key={t} style={{ marginBottom: 10 }}>
            <Text style={mx.tlTitle}>{t}</Text>
            <Text style={{ color: C.ink2, lineHeight: 21, marginTop: 6 }}>{b}</Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const webNoOutline = Platform.select({ web: { outlineStyle: 'none' }, default: {} });

const mx = StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line },
  searchBox: { flex: 1, height: 44, borderRadius: 12, backgroundColor: '#F1F4F9', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: C.ink, height: 44, ...webNoOutline },
  h: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addSq: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  notif: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: '#fff', borderRadius: R.lg, marginBottom: 10, borderWidth: 1, borderColor: '#EEF2F7' },
  notifUnread: { backgroundColor: '#F5F9FF', borderColor: '#D6E4FF' },
  notifTitle: { fontSize: 14, fontWeight: '800', color: C.ink2, lineHeight: 19 },
  notifBody: { fontSize: 13, color: C.muted, lineHeight: 18, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary, marginTop: 6 },
  statusHero: { borderRadius: R.lg, padding: 18 },
  statusLabel: { fontSize: 20, fontWeight: '900' },
  statusDesc: { fontSize: 13, marginTop: 4, fontWeight: '600', opacity: 0.85 },
  tlDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D5DCE6', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tlLine: { width: 2, flex: 1, backgroundColor: '#E3E8EF', marginVertical: 2 },
  tlTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  techAvatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' },
  sec: { fontSize: 15, fontWeight: '800', color: C.ink, marginTop: 20, marginBottom: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, marginTop: 12 },
  dock: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F3F8' },
  bonus: { backgroundColor: C.goldSoft, borderRadius: R.md, padding: 14, marginTop: 16 },
  pointsHero: { backgroundColor: C.navy, ...grad.navyHero, borderRadius: 22, padding: 20, overflow: 'hidden', ...shadow.md },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  tiers: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tierItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#F8FAFD' },
  ticket: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: R.md, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#EEF2F7', ...shadow.sm },
  ticketLeft: { width: 64, alignSelf: 'stretch', backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 76, height: 76, borderRadius: 14, backgroundColor: '#EEF2F7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  thumbX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center' },
  thumbAdd: { width: 76, height: 76, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primary, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  day: { width: 76, height: 64, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.primary, borderColor: C.primary },
  dayLabel: { fontSize: 12, color: C.muted, fontWeight: '600' },
  dayDate: { fontSize: 14, color: C.ink, fontWeight: '800', marginTop: 2 },
  slot: { paddingHorizontal: 10, height: 36, borderRadius: 11, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  slotOn: { backgroundColor: C.navy, borderColor: C.navy },
  slotText: { fontSize: 12, color: C.ink, fontWeight: '700' },
  bigAvatar: { width: 92, height: 92, borderRadius: 32, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  qrCard: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 26, padding: 22, alignItems: 'center', ...shadow.lg },
  devGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  devType: { width: '31%', height: 92, borderRadius: R.lg, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  fl: { fontSize: 13, fontWeight: '700', color: C.ink2, marginTop: 18, marginBottom: 8 },
});
