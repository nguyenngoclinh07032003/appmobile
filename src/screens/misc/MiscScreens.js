import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Platform, Image, Linking } from 'react-native';
import { C, R, shadow, toneOf, STATUS_META, grad } from '../../theme';
import {
  ALL_SERVICES, SERVICES, REPAIR_SERVICES, CATEGORIES, POPULAR_SEARCHES, FAQ, ORDER_STEPS, HOTLINE, STATUS_DESC, stepIndexOf,
  getService, serviceKind, formatVND, normalize, catLabel, catIcon, tierOf, TIERS, TIME_SLOTS, MATERIALS, SAFETY_CHECKLIST_ITEMS,
} from '../../constants/data';
import {
  useApp, fmtDate, fmtDateTime, timeAgo, warrantyInfo, isActiveOrder, orderTotal, formatOrderTotal, isPaid, amountRemaining,
  customerStatusMeta, isOfferExpired, bookedValue, billExtraAmount, latestNotifPerOrder,
  lateDiscountAmount, tierPartDiscountAmount, normalizeTechRep, getCancellationWindowStatus, isQRPayment,
  getValidVouchers, getPendingExternalEstimates,
} from '../../context';
import { useScreenActive } from '../../navigation/ScreenActiveContext';
import {
  Tap, Btn, IconBtn, IconBox, Card, TopBar, SectionTitle, Chip, Badge, Stars, Field, Sheet, Radio,
  EmptyState, ServiceGrid, ServiceRow, Progress, Media, ListRow, HScroll, ui, AppIcon,
  TimeRangeSlider, minutesToSlotStr, minutesToTimeStr, resolveSemanticTone,
} from '../../components';
import {
  pickImage, validateVietnamesePhone, validateContactName, computeQuoteRangeTotals, formatRangeVND,
  parseSymptomPhotoTitle, sanitizeVnPhoneInput, matchReceiptsToQuoteLines, isReceiptEvidence,
} from '../../utils';
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
import { TrackingCard, VietQRPay, WarrantyBookingSheet, SymptomBreakdownView } from '../../components/order';
import { WarrantyCertificate } from './WarrantyCertificate';

const newAttId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
// "60 phút" → "1 tiếng" cho câu chữ chính sách huỷ.
const FREE_CANCEL_TEXT = FREE_CANCEL_MIN_BEFORE % 60 === 0 ? `${FREE_CANCEL_MIN_BEFORE / 60} tiếng` : `${FREE_CANCEL_MIN_BEFORE} phút`;
// Một số thông báo (techPolicy) còn ghi cứng số hotline cũ → thay bằng HOTLINE hiện hành.
const withHotline = (t) => (t ? String(t).replace(/1900\s?6868/g, HOTLINE) : t);

function QuoteLineReceiptThumb({ receiptEv, partName, onPreview, thumbSize = 72, compactLabel = false }) {
  if (!receiptEv?.uri) return null;
  return (
    <Tap
      style={{ marginTop: 6, alignSelf: 'flex-start' }}
      scaleTo={0.97}
      onPress={() => onPreview?.({ uri: receiptEv.uri, title: `Hoá đơn mua ngoài · ${partName}` })}
    >
      <Image
        source={{ uri: receiptEv.uri }}
        style={{ width: thumbSize, height: thumbSize, borderRadius: thumbSize >= 70 ? 10 : 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}
      />
      <Text style={[ui.meta, compactLabel ? { fontSize: 11, marginTop: 2 } : { fontSize: 11, marginTop: 2, color: C.primary }]}>
        {compactLabel ? 'Hoá đơn mua ngoài đính kèm' : 'Hoá đơn mua ngoài đính kèm · Chạm để phóng to'}
      </Text>
    </Tap>
  );
}

function UnmatchedReceiptStrip({ receipts, onPreview, title }) {
  if (!Array.isArray(receipts) || !receipts.length) return null;
  return (
    <View style={{ marginTop: title ? 8 : 6 }}>
      {title ? (
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.ink2, marginBottom: 6 }}>{title}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {receipts.map((rEv, rIdx) => (
          <Tap
            key={rEv.id || `unmatched_rcpt_${rIdx}`}
            style={{ alignItems: 'flex-start' }}
            scaleTo={0.97}
            onPress={() => onPreview?.({ uri: rEv.uri, title: rEv.note || 'Hoá đơn / biên lai linh kiện đính kèm' })}
          >
            <Image
              source={{ uri: rEv.uri }}
              style={{ width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}
            />
            <Text style={[ui.meta, { fontSize: 11, marginTop: 2, color: C.primary, maxWidth: 96 }]} numberOfLines={1}>
              {rEv.note || 'Chạm để phóng to'}
            </Text>
          </Tap>
        ))}
      </View>
    </View>
  );
}

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

  const isDebouncing = q.trim() !== debouncedQ.trim();
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
              {CATEGORIES.map((c, i) => {
                const targetTab = SERVICES.some((x) => !x.hidden && x.category === c.id)
                  ? 'bao-duong'
                  : REPAIR_SERVICES.some((x) => !x.hidden && x.category === c.id)
                    ? 'sua-chua'
                    : 'tron-doi';
                return <ListRow key={c.id} icon={c.icon} iconBg={toneOf(c.id).bg} label={c.label} last={i === CATEGORIES.length - 1} onPress={() => nav.services(targetTab, c.id)} />;
              })}
            </Card>
          </View>
        ) : isDebouncing ? (
          <Text style={[ui.meta, { textAlign: 'center', marginTop: 24 }]}>Đang tìm kiếm…</Text>
        ) : results.length === 0 ? (
          <EmptyState icon="search" title="Không tìm thấy dịch vụ" body={`Không có kết quả cho "${q}". Thử từ khoá khác hoặc gọi tổng đài ${HOTLINE} để được tư vấn.`} />
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
  const { s, a, nav, ui: u } = useApp();
  const [filter, setFilter] = useState('all');
  // Mỗi đơn chỉ hiện thông báo mới nhất (các cập nhật cũ hơn của đơn đó được gom lại).
  const list = latestNotifPerOrder(s.notifications || []);
  const hasRead = (s.notifications || []).some((n) => Boolean(n.read));
  const filtered = list.filter((n) => {
    if (filter === 'unread') return !n.read;
    if (filter === 'orders') return /đơn|báo giá|hoá đơn|đến nơi|bảo hành|thợ|thanh toán|huỷ|hoàn thành/i.test(`${n.title} ${n.body || ''}`);
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
            {hasRead ? (
              <Tap onPress={() => u.confirm('Dọn sạch thông báo đã đọc?', 'Xoá hết các thông báo đã đọc và giữ lại các thông báo chưa đọc?', a.clearAllNotifs, 'Dọn sạch', true)}>
                <Text style={[ui.link, { color: C.muted }]}>Dọn sạch</Text>
              </Tap>
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
              onPress={() => { a.readNotif(n.groupIds || n.id); nav.open(n.link); }}
            >
              <IconBox icon={n.icon || sem.icon} size={42} bg={sem.bg} color={sem.accent} radius={14} />
              <View style={{ flex: 1 }}>
                <Text style={[mx.notifTitle, !n.read && { color: C.ink }]}>{n.title}</Text>
                {n.body ? <Text style={mx.notifBody}>{n.body}</Text> : null}
                <Text style={[ui.meta, { marginTop: 4 }]}>
                  {timeAgo(n.at)}{n.olderCount > 0 ? ` · ${n.olderCount} cập nhật trước của đơn này` : ''}
                </Text>
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
const FINALIZE_REVISION_REASONS = ['Giá chênh lệch so với thực tế', 'Ảnh hoá đơn chưa rõ / cần bổ sung', 'Sai số lượng hoặc tên vật tư', 'Lý do khác'];

export function OrderScreen({ params }) {
  const { s, a, nav, ui: u } = useApp();
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [reasonCustom, setReasonCustom] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [rejectMode, setRejectMode] = useState('revise');
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectCustom, setRejectCustom] = useState('');
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
  // Hook phải khai báo TRƯỚC mọi lệnh return sớm (nếu không: "Rendered fewer hooks" → crash toàn app).
  const [showWarrantyBooking, setShowWarrantyBooking] = useState(false);
  const [previewOrderPhoto, setPreviewOrderPhoto] = useState(null);
  const screenActive = useScreenActive();
  const aRef = useRef(a);
  aRef.current = a;
  const o = (s.orders || []).find((x) => x.code === params?.code);
  const orderReqId = o?.dbRequestId || null;
  const orderCode = o?.code || null;
  const orderStatus = o?.status || null;
  const orderActive = Boolean(o && isActiveOrder(o));

  // Luôn tham gia room Socket.IO của đơn khi mở màn chi tiết để nhận báo giá / đổi trạng thái tức thì.
  useEffect(() => {
    if (!orderReqId) return undefined;
    aRef.current?.joinOrderRoom?.(orderReqId);
    return () => {
      aRef.current?.leaveOrderRoom?.(orderReqId);
    };
  }, [orderReqId]);

  // Bảo đảm đơn cũ / mới mở chi tiết đều tải đủ chẩn đoán & ảnh triệu chứng ban đầu.
  useEffect(() => {
    if (!orderCode) return;
    aRef.current?.ensureOrderHydrated?.(orderCode);
  }, [orderCode]);

  // Kiểm tra quyền lợi, hạn cuối và khung giờ bảo hành thật từ server khi xem chi tiết đơn đã hoàn thành.
  useEffect(() => {
    if (!o || o.status !== 'done' || o.kind === 'warranty' || !o.dbRequestId || o.serverWarrantyEligibility) return;
    aRef.current?.checkWarrantyEligibility?.(o.code)?.catch?.(() => {});
  }, [o?.code, o?.status, o?.kind, o?.dbRequestId, o?.serverWarrantyEligibility]);

  // Đồng bộ ngay khi mở màn & mỗi 5s trong lúc đơn đang hoạt động (trường hợp mở 2 cửa sổ song song hoặc socket trễ).
  useEffect(() => {
    if (!orderCode || !orderActive || !screenActive) return undefined;
    aRef.current?.syncFromBackend?.(null, true);
    const timer = setInterval(() => {
      aRef.current?.syncFromBackend?.(null, true);
    }, 5000);
    return () => clearInterval(timer);
  }, [orderCode, orderStatus, orderActive, screenActive]);

  const editDays = nextDays(7);
  const minAvailEdit = minSelectableMinute(editDayIdx);
  const isTodayOutOfSlotsEdit = isDayOutOfSlots(editDayIdx);

  useEffect(() => {
    if (!showEdit || editDayIdx !== 0 || isTodayOutOfSlotsEdit) return;
    if (editMinutes < minAvailEdit) {
      setEditMinutes(minAvailEdit);
      setEditSlot(minutesToSlotStr(minAvailEdit));
    }
  }, [showEdit, editDayIdx, editMinutes, minAvailEdit, isTodayOutOfSlotsEdit]);

  if (!o) return <NotFoundView onBack={() => (nav.stack.length ? nav.back() : nav.activity())} />;
  const meta = customerStatusMeta(o);
  const acceptExpired = isOfferExpired(o);
  const curIdx = o.status === 'cancelled' ? -1 : stepIndexOf(o);
  // Đơn bảo hành / tái khám miễn phí: không có bước "Chờ thanh toán" trên timeline.
  const skipPayStep = o.kind === 'warranty' || o.kind === 'followup';
  const payStepIdx = ORDER_STEPS.findIndex((x) => x.key === 'pending_payment');
  const tlSteps = skipPayStep ? ORDER_STEPS.filter((x) => x.key !== 'pending_payment') : ORDER_STEPS;
  const tlCurIdx = skipPayStep && payStepIdx >= 0 && curIdx > payStepIdx ? curIdx - 1 : curIdx;
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
        message: withHotline(status.reason) || `Quý khách không thể tự huỷ đơn khi còn dưới ${FREE_CANCEL_TEXT} trước giờ hẹn với thợ. Để huỷ hoặc dời lịch gấp, vui lòng gọi tổng đài ${HOTLINE}.`,
        actions: [
          { label: 'Đóng', variant: 'ghost' },
          { label: `Gọi tổng đài ${HOTLINE}`, onPress: u.call },
        ],
      });
      return;
    }
    setShowCancel(true);
  };
  const active = isActiveOrder(o);
  const reorder = () => {
    const available = orderItems
      .filter((it) => {
        const sv = getService(it.id);
        return Boolean(sv && !sv.hidden);
      })
      .map(({ id, qty }) => ({ id, qty }));
    if (!available.length) {
      u.alert('Dịch vụ không còn khả dụng', 'Các dịch vụ trong đơn này hiện không còn phục vụ.', 'ℹ️');
      return;
    }
    nav.push('checkout', { items: available });
  };
  const evidence = o.evidence || [];

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
    if (uri === null) {
      u.alert(
        Platform.OS === 'web' ? 'Không thể chọn ảnh' : 'Cần quyền truy cập ảnh',
        Platform.OS === 'web'
          ? 'Trình duyệt không hỗ trợ chọn ảnh.'
          : 'Vui lòng cấp quyền truy cập thư viện ảnh trong Cài đặt thiết bị để đính kèm ảnh.',
        '📷',
      );
      return;
    }
    if (!uri) return;
    setEditAtts((p) => [...p, { id: newAttId(), uri, at: Date.now() }]);
  };
  const saveEdit = () => runEdit(async () => {
    const liveOut = editDayIdx === 0 && isDayOutOfSlots(0);
    const liveMin = editDayIdx === 0 ? minSelectableMinute(0) : minAvailEdit;
    if (liveOut || (editDayIdx === 0 && isTodayOutOfSlotsEdit)) {
      u.alert('Hết giờ phục vụ', 'Hôm nay thợ đã kết thúc nhận ca. Quý khách vui lòng chọn Ngày mai.', '⏰');
      return;
    }
    if (editDayIdx === 0 && editMinutes < liveMin) {
      setEditMinutes(liveMin);
      setEditSlot(minutesToSlotStr(liveMin));
      u.alert('Giờ hẹn quá gần', `Khung giờ đã được tự điều chỉnh lên ca gần nhất (${minutesToSlotStr(liveMin)}). Vui lòng kiểm tra và bấm lưu lại.`, '⏰');
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
      const ok = await callAction(a.respondQuote, o.code, decision, why);
      return isOk(ok);
    } catch (e) {
      u.alert('Chưa gửi được phản hồi', errorText(e, 'Không gửi được phản hồi báo giá. Vui lòng thử lại.'), '⚠️');
      return false;
    }
  });

  const cancelOrder = () => runCancel(async () => {
    const finalReason = reason === 'Lý do khác' ? reasonCustom.trim() : reason;
    if (reason === 'Lý do khác' && finalReason.length < 3) {
      u.alert('Thiếu lý do', 'Vui lòng nhập ngắn gọn lý do huỷ đơn (tối thiểu 3 ký tự).', '✏️');
      return;
    }
    try {
      const ok = await callAction(a.cancelOrder, o.code, finalReason);
      if (isOk(ok)) {
        setShowCancel(false);
        setReasonCustom('');
      }
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

  const requestWarranty = () => setShowWarrantyBooking(true);
  // Mở đơn liên quan (đơn gốc / đơn bảo hành): nếu đơn đó đã nằm trong stack thì quay lại, tránh chồng màn lặp vô hạn.
  const openRelatedOrder = (code) => {
    if (!code) return;
    const st = nav.stack || [];
    let idx = -1;
    for (let k = st.length - 2; k >= 0; k -= 1) {
      if (st[k]?.name === 'order' && st[k]?.params?.code === code) { idx = k; break; }
    }
    if (idx < 0) { nav.push('order', { code }); return; }
    for (let k = st.length - 1; k > idx; k -= 1) nav.back();
  };
  // Nút "Xác nhận đã trả tiền" (tiền mặt) ở dock — dock chỉ mở khi thật sự có nút để hiện.
  const showCashConfirmBtn = o.status === 'pending_payment' && !isPaid(o) && !isQRPayment(o) && !o.bill?.cashClaimPending && o.kind !== 'warranty' && o.kind !== 'followup';

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={o.kind === 'warranty' ? 'Đơn bảo hành' : 'Chi tiết đơn hàng'} sub={o.code} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <View style={[mx.statusHero, { backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: meta.fg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={[mx.statusLabel, { color: C.ink, flex: 1 }]}>{meta.label}</Text>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: meta.fg }} />
          </View>
          <Text style={[mx.statusDesc, { color: C.ink2 }]}>
            {o.status === 'cancelled'
              ? (o.cancelReason || 'Đơn đã được huỷ')
              : (o.status === 'pending' && o.dispatchNote) || meta.desc || STATUS_DESC[o.status]}
          </Text>
        </View>
        <TrackingCard order={o} paused={!screenActive} />

        {/* ===== Khối thanh toán nổi bật ngay đầu màn hình khi chờ thanh toán ===== */}
        {o.status === 'pending_payment' && !isPaid(o) && o.kind !== 'warranty' && o.kind !== 'followup' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: isQRPayment(o) ? C.primary : C.gold }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <AppIcon name={isQRPayment(o) ? 'qr-code' : 'banknote'} size={18} color={isQRPayment(o) ? C.primary : C.gold} strokeWidth={2.3} />
                <Text style={{ fontWeight: '800', fontSize: 14.5, color: isQRPayment(o) ? C.primary : C.goldInk, flex: 1 }}>
                  Hoá đơn cần thanh toán: {formatVND(amountRemaining(o))}
                </Text>
              </View>
              <Badge text={isQRPayment(o) ? 'VietQR 24/7' : 'Tiền mặt'} fg={isQRPayment(o) ? C.primary : C.goldInk} bg={isQRPayment(o) ? C.primarySoft : C.goldSoft} />
            </View>

            {isQRPayment(o) ? (
              <View style={{ alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: 12.5, color: C.ink2, marginBottom: 10, lineHeight: 18, textAlign: 'center' }}>
                  Quét mã VietQR dưới đây để chuyển khoản trực tiếp vào hệ thống Minh Đức (thợ KHÔNG thu tiền mặt). Khi nhận đủ tiền, đơn sẽ tự chuyển sang Hoàn thành & kích hoạt Bảo hành điện tử.
                </Text>
                <VietQRPay requestId={o.dbRequestId} paused={!screenActive} onPaid={() => a.confirmPayment(o.code, 'webhook')} />
                {!o.bill?.cashClaimPending ? (
                  <View style={{ width: '100%', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 12, color: C.muted }}>Không chuyển khoản được?</Text>
                    <Btn
                      title="Đổi tiền mặt"
                      small
                      variant="soft"
                      onPress={() => u.confirm(
                        'Đổi sang tiền mặt?',
                        'Thợ sẽ được mở lại quyền thu tiền mặt cho đơn này. Bạn có thể đổi lại sang VietQR bất cứ lúc nào khi chưa thanh toán.',
                        () => callAction(a.switchPaymentMethod, o.code, 'CASH'),
                      )}
                    />
                  </View>
                ) : null}
              </View>
            ) : (
              <View>
                <Text style={{ fontSize: 12.5, color: C.ink2, lineHeight: 18 }}>
                  {o.bill?.cashClaimPending
                    ? 'Bạn đã báo trả tiền mặt. Đang chờ kỹ thuật viên xác nhận đã nhận đủ tiền để hoàn tất đơn & kích hoạt Bảo hành điện tử.'
                    : `Vui lòng thanh toán trực tiếp ${formatVND(amountRemaining(o))} tiền mặt cho kỹ thuật viên tại nhà, hoặc bấm nút “Xác nhận đã trả tiền” ở thanh dưới cùng sau khi giao tiền.`}
                </Text>
                {!o.bill?.cashClaimPending ? (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 12, color: C.muted }}>Muốn quét mã QR chuyển khoản?</Text>
                    <Btn
                      title="Đổi sang VietQR"
                      small
                      variant="primary"
                      onPress={() => u.confirm(
                        'Đổi sang VietQR?',
                        'Thợ sẽ bị khoá quyền thu tiền mặt. Bạn vẫn có thể đổi lại sang tiền mặt nếu chuyển khoản gặp sự cố.',
                        () => callAction(a.switchPaymentMethod, o.code, 'BANK_TRANSFER'),
                      )}
                    />
                  </View>
                ) : null}
              </View>
            )}
          </Card>
        ) : null}

        {/* ===== Thợ đang cập nhật lại mức giá vật tư theo yêu cầu khách ===== */}
        {o.status !== 'quoted' && o.quote?.isExternalFinalization && o.quote?.revisionRequested ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
            <Text style={[mx.tlTitle, { color: C.goldInk }]}>Đang chờ thợ cập nhật lại mức giá vật tư</Text>
            <Text style={{ color: C.ink2, marginTop: 4, fontSize: 13, lineHeight: 19 }}>
              Bạn đã yêu cầu kiểm tra lại giá{o.quote.rejectReason ? `: “${o.quote.rejectReason}”` : '.'} Thợ sẽ gửi lại hoá đơn chi phí cuối để bạn xác nhận trước khi bàn giao.
            </Text>
          </Card>
        ) : null}

        {o.checkIn ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <Text style={mx.tlTitle}>Xác nhận đến nơi tại nhà bạn</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              {o.checkIn.label || 'Đã xác thực vị trí'}
              {o.checkIn.at ? ` · ${fmtDateTime(o.checkIn.at)}` : ''}
              {o.checkIn.lat != null ? ` · ${Number(o.checkIn.lat).toFixed(5)}, ${Number(o.checkIn.lng).toFixed(5)}` : ''}
            </Text>
          </Card>
        ) : null}
        {o.lateCompensation && (o.lateCompensation.tier !== 'ok' || lateDiscountAmount(o) > 0) ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
            <Text style={[mx.tlTitle, { color: C.goldInk }]}>Bồi thường đến muộn</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              {o.lateCompensation.minutesLate
                ? `Thợ đến trễ ${o.lateCompensation.minutesLate} phút.`
                : 'Thợ đến trễ so với giờ hẹn.'}
              {lateDiscountAmount(o)
                ? ` Đã trừ ${formatVND(lateDiscountAmount(o))} vào tổng thanh toán${o.lateCompensation.percent ? ` (${o.lateCompensation.percent}% phí nhân công)` : ''}.`
                : ' Hệ thống đã ghi nhận (mức cảnh báo, chưa trừ tiền).'}
              {o.lateCompensation.voucherCode ? ` Mã thêm: ${o.lateCompensation.voucherCode} (Quyền lợi).` : ''}
            </Text>
          </Card>
        ) : null}
        {acceptExpired ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.red }}>
            <Text style={[mx.tlTitle, { color: C.redInk }]}>Đơn quá hạn tiếp nhận</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Chưa có thợ nhận đơn trong khung giờ {o.slot} ngày {o.dateLabel}. Vui lòng đổi giờ hẹn để hệ thống điều phối lại, hoặc gọi tổng đài {HOTLINE} để được hỗ trợ.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {canEdit ? <Btn title="Đổi giờ hẹn" icon="calendar" small variant="primary" style={{ flex: 1 }} onPress={openEdit} /> : null}
              <Btn title="Gọi tổng đài" icon="phone" small variant="soft" style={{ flex: 1 }} onPress={u.call} />
            </View>
          </Card>
        ) : null}
        {(o.releaseLog || []).length > 0 && o.status === 'pending' && !acceptExpired ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <Text style={mx.tlTitle}>Đang điều phối lại thợ</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Thợ trước không thể tiếp tục (đã trả việc hoặc quá hạn xác nhận). Hệ thống đang điều phối thợ khác; kiểm tra thông báo để nhận mã giảm giá xin lỗi (nếu có).
            </Text>
          </Card>
        ) : null}

        {/* ===== Chờ Văn phòng thẩm định bảo hành ===== */}
        {o.status === 'warranty_pending' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[mx.tlTitle, { color: C.goldInk }]}>Văn phòng đang thẩm định bảo hành</Text>
            </View>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Yêu cầu bảo hành đã được gửi. Văn phòng Minh Đức đang đối chiếu lỗi với nhật ký sửa chữa gốc và thời hạn bảo hành theo chính sách từng dịch vụ.
            </Text>
          </Card>
        ) : null}

        {/* ===== Yêu cầu hẹn tái khám ===== */}
        {o.followUpRequested ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <Text style={[mx.tlTitle, { color: C.primary }]}>KTV đã hẹn lịch tái khám</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Lý do: <Text style={{ fontWeight: '700' }}>{o.followUpReason || 'Chờ linh kiện phụ tùng'}</Text>. Quản lý kỹ thuật đang điều phối lịch hẹn quay lại sớm nhất.
            </Text>
          </Card>
        ) : null}

        {/* ===== Báo giá chờ duyệt (khách duyệt / từ chối hoặc nghiệm thu giá thực tế VT ngoài) ===== */}
        {o.status === 'quoted' && o.quote ? (() => {
          const isOnSite = Boolean(o.arrivedAt || o.checkIn || o.history?.some((h) => h.status === 'diagnosing'));
          const isExternalFinalization = Boolean(o.quote.isExternalFinalization);
          const lines = o.quote.lines || [];
          const bookedIds = new Set((o.items || []).map((it) => String(it.id || it.service_id || it.key)));
          const bookedNames = new Set(
            (o.items || [])
              .map((it) => String(it.name || it.service_name || getService(it.id)?.name || '').trim().toLowerCase())
              .filter(Boolean)
          );
          const isBooked = (l) =>
            Boolean(l.isOriginal) ||
            (!l.matId &&
              !l.isCustom &&
              l.type !== 'part' &&
              (bookedIds.has(String(l.key)) ||
                bookedNames.has(String(l.name || '').trim().toLowerCase())));

          const laborItems = lines.filter((l) => isBooked(l));
          const extraLines = lines.filter((l) => !isBooked(l));
          const partItems = extraLines.filter((l) => (l.type === 'part' || Boolean(l.matId)) && !l.isCustom);
          const customItems = extraLines.filter((l) => l.isCustom || (l.type !== 'part' && !l.matId));
          const prodDisc = Number(o.productDiscount) || 0;
          const comboDisc = Number(o.comboDiscount) || 0;
          const bookedBase =
            o.quote.booked != null && Number(o.quote.booked) > 0
              ? Number(o.quote.booked)
              : bookedValue(o);
          const goodsBase = o.goods || (bookedBase + prodDisc + comboDisc);
          const priorApprovedExtra = Number(o.quote.priorApprovedExtra) || 0;
          const effectivePriorExtra = o.quote.effectivePriorExtra ?? (
            o.quote.includesPriorApprovedLines
              ? (Number(o.quote.initialServiceDelta) || 0)
              : priorApprovedExtra
          );
          const quoteIsOnSiteLike =
            isOnSite ||
            o.quote.quotationType === 'SUPPLEMENTAL' ||
            Boolean(o.quote.includesPriorApprovedLines) ||
            !lines.some((l) => l.isOriginal);
          const lateDisc = lateDiscountAmount(o);
          const rangeTotals = computeQuoteRangeTotals(lines, {
            bookedBase,
            priorApprovedExtra: effectivePriorExtra,
            prodDisc,
            comboDisc,
            partDisc: partDisc || 0,
            voucherDisc: o.voucherDiscount || 0,
            lateDisc,
            isOnSite: quoteIsOnSiteLike,
          });
          const isSupplementalQuote = o.quote.quotationType === 'SUPPLEMENTAL';
          const hasRange = rangeTotals.hasEstimatedRange;
          const extraMin = isSupplementalQuote
            ? rangeTotals.extraMin
            : Math.max(rangeTotals.extraMin, Math.max(0, rangeTotals.grossTotalMin - bookedBase));
          const extraMax = isSupplementalQuote
            ? rangeTotals.extraMax
            : Math.max(rangeTotals.extraMax, Math.max(0, rangeTotals.grossTotalMax - bookedBase));
          const finalAfterQuote = rangeTotals.totalMax;

          return (
            <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: isExternalFinalization ? C.primary : C.gold }}>
              <View style={{ marginBottom: 10, padding: 10, borderRadius: R.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: C.ink2, lineHeight: 18 }}>
                  {isExternalFinalization
                    ? 'Thợ đã cập nhật mức giá cuối cùng của vật tư thực tế. Vui lòng đối chiếu và bấm xác nhận để chốt tổng hoá đơn trước khi bàn giao thiết bị.'
                    : isOnSite && isSupplementalQuote
                      ? 'Thợ đã kiểm tra thực tế và gửi báo giá phát sinh. Bạn có thể đồng ý để thực hiện thêm hoặc chỉ từ chối phần phát sinh này (đơn hàng vẫn tiếp tục phần đã đặt).'
                      : isOnSite
                        ? 'Thợ đã đến kiểm tra thực tế tại nhà bạn. Bạn có thể đồng ý để thợ sửa, yêu cầu báo giá lại hoặc từ chối (huỷ sau khi kiểm tra tại nhà có thể áp dụng phí kiểm tra theo chính sách hiện hành).'
                        : 'Báo giá trước khi thợ xuất phát. Bạn đồng ý thì thợ mới đi. Huỷ lúc này hoàn toàn MIỄN PHÍ (0đ).'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={[mx.tlTitle, { flex: 1 }]}>
                  {isExternalFinalization
                    ? 'Nghiệm thu vật tư phát sinh & Chi phí cuối cùng'
                    : `Báo giá từ thợ ${o.tech?.name || 'kỹ thuật viên'}`}
                </Text>
                <Badge
                  text={
                    extraMax > 0
                      ? `${hasRange ? 'Dự kiến ' : ''}${formatRangeVND(extraMin, extraMax, { prefix: '+' })}`
                      : 'Không phát sinh (0đ)'
                  }
                  fg={extraMax > 0 ? C.goldInk : C.greenInk}
                  bg={extraMax > 0 ? C.goldSoft : C.greenSoft}
                />
              </View>

              <SymptomBreakdownView
                symptoms={o.quote.symptoms}
                diagnosis={o.quote.diagnosis}
                recommendation={o.quote.recommendation}
                evidence={evidence}
                initialAttachments={o.attachments}
                defaultExpandFirst
              />

              {/* Danh sách dịch vụ ban đầu */}
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 4 }}>
                  Dịch vụ kỹ thuật ban đầu ({laborItems.length})
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
                {o.productDiscount ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <Text style={[ui.meta, { fontSize: 13, color: C.green, flex: 1, paddingRight: 6 }]}>Giảm giá dịch vụ</Text>
                    <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.green }]}>-{formatVND(o.productDiscount)}</Text>
                  </View>
                ) : null}
                {o.comboDiscount ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <Text style={[ui.meta, { fontSize: 13, color: C.green, flex: 1, paddingRight: 6 }]}>Ưu đãi {o.comboLabel || 'gộp nhiều máy (-5%)'}</Text>
                    <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.green }]}>-{formatVND(o.comboDiscount)}</Text>
                  </View>
                ) : null}
              </View>

              {/* Danh sách vật tư / linh kiện kho (nếu có) */}
              {partItems.length ? (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 4 }}>
                    Linh kiện / Vật tư kho ({partItems.length})
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

              {/* Vật tư mua ngoài (giá dao động dự kiến hoặc giá mua thực tế nghiệm thu) */}
              {(() => {
                const { lineReceipts, unmatchedReceipts } = matchReceiptsToQuoteLines(customItems, evidence);
                if (!customItems.length && !unmatchedReceipts.length) return null;
                return (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 4 }}>
                      {customItems.length
                        ? (isExternalFinalization
                          ? `Vật tư mua ngoài thực tế (${customItems.length})`
                          : `Vật tư mua ngoài (${customItems.length})`)
                        : `Hoá đơn / biên lai linh kiện đính kèm (${unmatchedReceipts.length})`}
                    </Text>
                    {customItems.map((l, i) => {
                      const displayUnit = l.actualPrice != null ? l.actualPrice : l.price;
                      const hasOrigRange = l.minPrice != null && l.maxPrice != null && l.maxPrice > 0;
                      const inOrigRange = hasOrigRange && displayUnit >= l.minPrice && displayUnit <= l.maxPrice;
                      const receiptEv = lineReceipts.get(i) || null;

                      return (
                        <View key={`custom_${l.name}_${i}`} style={{ paddingVertical: 6 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <Text style={{ color: C.ink, fontWeight: '700', fontSize: 13.5 }} numberOfLines={2}>{l.name}</Text>
                                {l.isEstimatedRange ? (
                                  <Badge text="Giá dao động" fg={C.goldInk} bg={C.goldSoft} />
                                ) : l.isFinalizedExternal ? (
                                  <Badge
                                    text={hasOrigRange ? (inOrigRange ? 'Đúng dự kiến' : 'Ngoài khoảng dự kiến') : 'Giá chốt cuối'}
                                    fg={!hasOrigRange || inOrigRange ? C.greenInk : C.goldInk}
                                    bg={!hasOrigRange || inOrigRange ? C.greenSoft : C.goldSoft}
                                  />
                                ) : (
                                  <Badge text={l.type === 'labor' ? 'Công thêm' : 'Vật tư ngoài'} fg={C.goldInk} bg={C.goldSoft} />
                                )}
                              </View>
                              {l.isEstimatedRange ? (
                                <>
                                  <Text style={[ui.meta, { fontSize: 12, color: C.goldInk }]}>
                                    {formatRangeVND(l.minPrice, l.maxPrice)} x{l.qty}
                                  </Text>
                                  <Text style={[ui.meta, { fontSize: 11.5, marginTop: 2, lineHeight: 16 }]}>
                                    Thợ sẽ nhập lại giá mua thực tế kèm hoá đơn khi hoàn thành sửa chữa để bạn nghiệm thu.
                                  </Text>
                                </>
                              ) : (
                                <>
                                  <Text style={[ui.meta, { fontSize: 12 }]}>
                                    {formatVND(displayUnit)} x{l.qty}
                                  </Text>
                                  {l.isFinalizedExternal && hasOrigRange ? (
                                    <Text style={[ui.meta, { fontSize: 11.5, marginTop: 2 }]}>
                                      Khoảng giá dự kiến ban đầu: {formatRangeVND(l.minPrice, l.maxPrice)}
                                    </Text>
                                  ) : null}
                                </>
                              )}
                            </View>
                            <Text style={{ fontWeight: '800', color: l.isEstimatedRange ? C.goldInk : C.ink }}>
                              {l.isEstimatedRange
                                ? formatRangeVND(l.minPrice * l.qty, l.maxPrice * l.qty)
                                : `+${formatVND(displayUnit * l.qty)}`}
                            </Text>
                          </View>
                          <QuoteLineReceiptThumb
                            receiptEv={receiptEv}
                            partName={l.name}
                            onPreview={setPreviewOrderPhoto}
                            thumbSize={72}
                          />
                        </View>
                      );
                    })}
                    <UnmatchedReceiptStrip
                      receipts={unmatchedReceipts}
                      onPreview={setPreviewOrderPhoto}
                      title={customItems.length ? `Hoá đơn / biên lai linh kiện đính kèm (${unmatchedReceipts.length})` : ''}
                    />
                  </View>
                );
              })()}

              {/* Tổng kết chi tiết minh bạch */}
              {(() => {
                const custExtraSources =
                  (effectivePriorExtra > 0 ? 1 : 0) +
                  (rangeTotals.warehouseExtra > 0 ? 1 : 0) +
                  (rangeTotals.customExtraMax > 0 ? 1 : 0);
                const custSameAsSingleExtra = custExtraSources === 1 && (
                  (rangeTotals.customExtraMax > 0 && extraMin === rangeTotals.customExtraMin && extraMax === rangeTotals.customExtraMax) ||
                  (rangeTotals.warehouseExtra > 0 && extraMin === rangeTotals.warehouseExtra && extraMax === rangeTotals.warehouseExtra) ||
                  (effectivePriorExtra > 0 && extraMin === effectivePriorExtra && extraMax === effectivePriorExtra)
                );
                const grandLabelBase = isExternalFinalization
                  ? 'Tổng thanh toán cuối cùng'
                  : 'Tổng thanh toán';
                return (
                  <View style={{ marginTop: 12, padding: 12, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line }}>
                    {(prodDisc > 0 || comboDisc > 0) ? (
                      <Bill l="Tổng tiền dịch vụ" v={formatVND(goodsBase)} />
                    ) : null}
                    {prodDisc > 0 ? (
                      <Bill l="Giảm giá dịch vụ" v={`-${formatVND(prodDisc)}`} green />
                    ) : null}
                    {comboDisc > 0 ? (
                      <Bill l={`Ưu đãi ${o.comboLabel || 'gộp nhiều máy (-5%)'}`} v={`-${formatVND(comboDisc)}`} green />
                    ) : null}
                    <Bill l="Giá dịch vụ đã đặt" v={formatVND(bookedBase)} />
                    {effectivePriorExtra > 0 ? (
                      <Bill l="Đã duyệt ở bước trước" v={`+${formatVND(effectivePriorExtra)}`} />
                    ) : null}
                    {rangeTotals.warehouseExtra > 0 ? (
                      <Bill l={`Vật tư / linh kiện kho (${partItems.length})`} v={`+${formatVND(rangeTotals.warehouseExtra)}`} />
                    ) : null}
                    {rangeTotals.customExtraMax > 0 ? (
                      <Bill
                        l={isExternalFinalization ? 'Vật tư mua ngoài thực tế' : 'Vật tư mua ngoài'}
                        v={formatRangeVND(rangeTotals.customExtraMin, rangeTotals.customExtraMax, { prefix: '+' })}
                        orange
                      />
                    ) : null}
                    {!custSameAsSingleExtra ? (
                      extraMax > 0 ? (
                        <Bill
                          l={hasRange ? 'Tổng phát sinh dự kiến' : 'Tổng phát sinh thêm'}
                          v={formatRangeVND(extraMin, extraMax, { prefix: '+' })}
                          orange
                        />
                      ) : (
                        <Bill l="Chi phí phát sinh" v="0 đ (Đúng giá gốc)" green />
                      )
                    ) : null}
                    {partDisc ? <Bill l={`Ưu đãi hạng thành viên (−${o.bill?.tierPartDiscountPercent || 0}% vật tư)`} v={`−${formatVND(partDisc)}`} green /> : null}
                    {o.voucherDiscount ? <Bill l={`Mã giảm giá ${o.voucher?.code}`} v={`-${formatVND(o.voucherDiscount)}`} green /> : null}
                    {lateDisc > 0 ? <Bill l="Bồi thường thợ đến muộn" v={`−${formatVND(lateDisc)}`} green /> : null}
                    {hasRange && rangeTotals.totalMin !== rangeTotals.totalMax ? (
                      <View style={[mx.totalRow, { flexDirection: 'column', alignItems: 'stretch', gap: 4 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink, flex: 1 }}>{grandLabelBase}</Text>
                          <Badge text="Dự kiến" fg={C.goldInk} bg={C.goldSoft} />
                        </View>
                        <Text
                          style={[ui.price, { fontSize: 19, textAlign: 'right', color: C.navy, fontVariant: ['tabular-nums'] }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {formatRangeVND(rangeTotals.totalMin, rangeTotals.totalMax)}
                        </Text>
                      </View>
                    ) : (
                      <View style={mx.totalRow}>
                        <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink, flex: 1 }}>
                          {isExternalFinalization ? 'Tổng thanh toán cuối cùng' : 'Tổng thanh toán sau báo giá'}
                        </Text>
                        <Text style={[ui.price, { fontSize: 19, flexShrink: 0, textAlign: 'right', color: C.navy, fontVariant: ['tabular-nums'] }]}>
                          {formatVND(finalAfterQuote)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}

              <Tap onPress={() => setShowMatPrice(true)} style={{ marginTop: 10 }}>
                <Text style={ui.link}>Đối chiếu bảng giá vật tư niêm yết Minh Đức ›</Text>
              </Tap>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Btn
                  title={isExternalFinalization ? 'Yêu cầu chỉnh lại giá' : 'Báo giá lại / Huỷ'}
                  variant="dangerSoft"
                  style={{ flex: isExternalFinalization ? 1.15 : 1.1 }}
                  disabled={quoteBusy}
                  onPress={() => { setRejectMode('revise'); setShowReject(true); }}
                />
                <Btn
                  title={quoteBusy ? 'Đang gửi…' : (isExternalFinalization ? `Xác nhận chi phí cuối (${formatVND(finalAfterQuote)})` : 'Đồng ý báo giá')}
                  style={{ flex: isExternalFinalization ? 1.85 : 1.9 }}
                  disabled={quoteBusy}
                  onPress={() => respondQuote(true)}
                />
              </View>
            </Card>
          );
        })() : null}

        {o.status === 'repairing' && o.externalPriceState === 'finalized' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.green }}>
            <Text style={{ fontWeight: '800', color: C.greenInk, fontSize: 14 }}>
              Đã chốt tổng hoá đơn {formatVND(orderTotal(o))}
            </Text>
            <Text style={{ color: C.ink2, marginTop: 4, lineHeight: 20, fontSize: 13 }}>
              Kỹ thuật viên đang hoàn tất danh mục kiểm tra an toàn & bàn giao thiết bị để mở cổng thanh toán.
            </Text>
          </Card>
        ) : null}
        {o.status === 'repairing' && getPendingExternalEstimates(o).length > 0 ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
            <Text style={{ fontWeight: '800', color: C.goldInk, fontSize: 13.5 }}>
              Có {getPendingExternalEstimates(o).length} vật tư báo giá dao động đang chờ chốt
            </Text>
            <Text style={{ color: C.ink2, marginTop: 4, lineHeight: 19, fontSize: 12.5 }}>
              Khi lắp đặt xong, thợ sẽ cập nhật mức giá cuối cùng của vật tư để bạn xác nhận tổng hoá đơn trước khi bàn giao & thanh toán.
            </Text>
          </Card>
        ) : null}

        {o.status !== 'cancelled' ? (
          <Card style={{ marginTop: 12 }}>
            {(() => {
              const isPreQuote = o.status === 'quoted' && !o.travelStartedAt && !o.arrivedAt && !o.checkIn;
              return tlSteps.map((step, i) => {
                const quoteSkipped = step.key === 'quoted'
                  && tlCurIdx > i
                  && !(o.history || []).some((h) => h.status === 'quoted');
                const suppressedByPreQuote = isPreQuote && ['onway', 'diagnosing'].includes(step.key);
                const done = !suppressedByPreQuote && (i < tlCurIdx || (i === tlCurIdx && o.status === 'done') || quoteSkipped);
                const current = i === tlCurIdx && o.status !== 'done' && !quoteSkipped;
                const prevSuppressed = isPreQuote && ['onway', 'diagnosing'].includes(tlSteps[i + 1]?.key);
                const isConfirmFinalBillStep = current && step.key === 'repairing' && o.status === 'quoted' && o.quote?.isExternalFinalization;
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
                      {i < tlSteps.length - 1 ? <View style={[mx.tlLine, i < tlCurIdx && !prevSuppressed && { backgroundColor: C.green }]} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingLeft: 8, paddingBottom: i < tlSteps.length - 1 ? 16 : 0 }}>
                      <Text style={[mx.tlTitle, !done && !current && { color: C.faint }, current && { color: meta.fg }]}>
                        {isConfirmFinalBillStep ? 'Nghiệm thu chi phí cuối · Cần bạn xác nhận' : `${step.label}${current && step.key === 'quoted' ? ' · Cần bạn duyệt' : ''}`}
                      </Text>
                      <Text style={ui.meta}>
                        {quoteSkipped
                          ? 'Không phát sinh — bỏ qua bước duyệt'
                          : suppressedByPreQuote
                            ? 'Chờ bạn duyệt báo giá trước khi thợ di chuyển'
                            : at(step.key)
                              ? fmtDateTime(at(step.key))
                              : step.desc}
                      </Text>
                    </View>
                  </View>
                );
              });
            })()}
          </Card>
        ) : null}

        {o.tech ? (
          <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={mx.techAvatar}><AppIcon name="hard-hat" size={24} color={C.primary} strokeWidth={2.2} /></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={mx.tlTitle}>{o.tech.name}</Text>
                <Badge text="KTV chuyên trách" fg={C.primaryDark} bg={C.primarySoft} />
              </View>
              <Text style={[ui.meta, { marginTop: 2 }]}>
                {o.tech.code}{o.tech.rating != null ? ` · ★ ${o.tech.rating}` : " · Chưa có đánh giá"}
                {o.tech.rating != null && o.tech.ratingCount ? ` (${Number(o.tech.ratingCount).toLocaleString('vi-VN')} đánh giá)` : ''}
              </Text>
              {o.lateCompensation && (o.lateCompensation.minutesLate || o.lateCompensation.amount) && o.lateCompensation.tier !== 'ok' ? (
                <Text style={[ui.meta, { color: C.goldInk, fontWeight: '700', marginTop: 2 }]}>
                  {o.lateCompensation.minutesLate ? `Đến nơi muộn ${o.lateCompensation.minutesLate} phút` : 'Đến nơi muộn so với giờ hẹn'}
                </Text>
              ) : o.arrivedAt ? (
                <Text style={[ui.meta, { color: C.green, fontWeight: '700', marginTop: 2 }]}>Đã đến đúng chính sách giờ hẹn</Text>
              ) : null}
            </View>
            <IconBtn
              icon="phone-call"
              onPress={() => {
                const techPhone = String(o.tech.phone || '').replace(/[^\d+]/g, '');
                if (!techPhone) {
                  u.alert('Chưa có số điện thoại', 'Số điện thoại kỹ thuật viên chưa sẵn sàng.', '📞');
                  return;
                }
                Linking.openURL(`tel:${techPhone}`).catch(() => {});
              }}
              style={{ backgroundColor: C.greenSoft }}
              label="Gọi thợ"
            />
          </Card>
        ) : active ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="settings" size={18} color={C.primary} strokeWidth={2.2} />
              <Text style={{ fontWeight: '800', color: C.primary, fontSize: 14 }}>Hệ thống đang điều phối Kỹ thuật viên</Text>
            </View>
            <Text style={{ color: C.ink2, marginTop: 6, fontSize: 12.5, lineHeight: 18 }}>
              Hệ thống Minh Đức đang tự động điều phối Kỹ thuật viên chuyên trách gần bạn nhất để đảm bảo có mặt đúng khung giờ {o.slot}.
            </Text>
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '600' }}>✓ Đúng chuyên môn kỹ thuật thiết bị</Text>
              <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '600' }}>✓ Phân bổ thợ khu vực {o.address?.district || 'của bạn'}</Text>
              {winfo.totalDays > 0 ? (
                <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '600' }}>✓ Cam kết bảo hành {winfo.totalDays} ngày sau dịch vụ</Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        <Card style={{ marginTop: 12 }}>
          <InfoLine icon="calendar-clock" label="Lịch hẹn" value={`${o.dateLabel} · ${o.slot}`} />
          {['pending', 'confirmed'].includes(o.status) && !cancelStatus.allowed ? (
            <View style={{ marginVertical: 6, padding: 8, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}>
              <Text style={{ fontSize: 11.5, color: C.goldInk, lineHeight: 16 }}>
                Đã sát giờ hẹn (dưới {FREE_CANCEL_TEXT}): Quý khách không thể tự huỷ đơn để bảo đảm lịch trình của thợ. Vui lòng gọi {HOTLINE} nếu cần hỗ trợ.
              </Text>
            </View>
          ) : ['pending', 'confirmed'].includes(o.status) ? (
            <View style={{ marginVertical: 6, padding: 8, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}>
              <Text style={{ fontSize: 11.5, color: C.ink2, lineHeight: 16 }}>
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
              value={`${catLabel(o.device.category)}${o.device.brand ? ` · ${o.device.brand}` : ''}${o.device.room ? ` (${o.device.room})` : ''}${o.device.serial ? ` · Số sê-ri: ${o.device.serial}` : ''}`}
            />
          ) : null}
          {o.siteCondition ? (
            <InfoLine icon="building-2" label="Vị trí thi công" value={o.siteCondition.label} />
          ) : null}
          {o.note ? <InfoLine icon="file-text" label="Ghi chú" value={o.note} /> : null}
          {o.outOfWarrantyReason ? <InfoLine icon="alert-triangle" label="Lý do ngoài bảo hành" value={o.outOfWarrantyReason} /> : null}
          {(o.attachments || []).length && o.status === 'quoted' && !o.quote ? (
            <View style={{ marginTop: 4, marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600', marginBottom: 6 }}>Hình ảnh triệu chứng ban đầu</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {o.attachments.map((att) => (
                  <Tap key={att.id} style={mx.thumb} onPress={() => att.uri && setPreviewOrderPhoto({ uri: att.uri, title: att.note || 'Hình ảnh triệu chứng ban đầu' })} scaleTo={0.97}>
                    {att.uri ? <Image source={{ uri: att.uri }} style={{ width: '100%', height: '100%' }} /> : <AppIcon name="image" size={22} color={C.muted} />}
                  </Tap>
                ))}
              </View>
            </View>
          ) : null}
          {(() => {
            const parentCode = o.warrantyOf || (o.originalRequestId ? s.orders.find((x) => String(x.dbRequestId) === String(o.originalRequestId))?.code : null);
            return parentCode ? (
              <Tap onPress={() => openRelatedOrder(parentCode)}><InfoLine icon="link" label="Bảo hành cho đơn" value={`${parentCode} ›`} link /></Tap>
            ) : null;
          })()}
        </Card>

        <Text style={mx.sec}>Dịch vụ</Text>
        {orderItems.map((it) => {
          const svc = getService(it.id);
          const baseItem = svc || { id: it.id, name: it.name || 'Dịch vụ kỹ thuật', price: it.price ?? 0, icon: 'wrench' };
          const rowItem = it.price != null ? { ...baseItem, price: it.price } : baseItem;
          return <ServiceRow key={it.id} item={rowItem} right={<Text style={{ fontWeight: '800', color: C.ink2 }}>x{it.qty}</Text>} />;
        })}

        {/* ===== Thông tin thợ gửi lên & ảnh triệu chứng ban đầu ===== */}
        {(() => {
          const quoteRejected = o.quote?.status === 'REJECTED';
          const rawQuoteLines = o.quote?.lines || [];
          const activeDisplayLines = quoteRejected
            ? rawQuoteLines.filter((l) => l.isOriginal || l.isPriorApproved)
            : rawQuoteLines;
          const hasDiagData = Boolean(
            (o.quote && (!quoteRejected || activeDisplayLines.length > 0)) ||
            o.diagnosisReport,
          );
          const hasDiagPhotos = (o.attachments || []).length > 0 || evidence.some((e) => e.stage === 'diagnosis');
          if ((!hasDiagData && !hasDiagPhotos) || o.status === 'quoted') return null;
          const diagSource = (!quoteRejected ? o.quote : null) || o.diagnosisReport || o.quote || {};
          const lines = activeDisplayLines;
          const bookedIds = new Set((o.items || []).map((it) => it.id));
          const bookedNames = new Set((o.items || []).map((it) => String(it.name || '').trim().toLowerCase()));
          const isBooked = (l) => l.isOriginal || (!l.matId && !l.isCustom && l.type !== 'part' && (bookedIds.has(l.key) || bookedNames.has(String(l.name || '').trim().toLowerCase())));

          const laborItems = lines.filter((l) => isBooked(l));
          const partItems = lines.filter((l) => (l.type === 'part' || Boolean(l.matId)) && !l.isCustom && !isBooked(l));
          const customItems = lines.filter((l) => !isBooked(l) && (l.isCustom || (l.type !== 'part' && !l.matId)));
          const extraRange = computeQuoteRangeTotals([...partItems, ...customItems], { isOnSite: true });
          const hasExtraRange = extraRange.hasEstimatedRange;
          return (
            <Card style={{ marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={mx.tlTitle}>{hasDiagData ? 'Kết quả chẩn đoán kỹ thuật' : 'Triệu chứng & hiện trạng ban đầu'}</Text>
                {hasDiagData ? (
                  <Badge
                    text={
                      extraRange.extraMax > 0
                        ? `${hasExtraRange ? 'Dự kiến ' : ''}${formatRangeVND(extraRange.extraMin, extraRange.extraMax, { prefix: '+' })}`
                        : 'Không phát sinh (0đ)'
                    }
                    fg={extraRange.extraMax > 0 ? C.goldInk : C.greenInk}
                    bg={extraRange.extraMax > 0 ? C.goldSoft : C.greenSoft}
                  />
                ) : (
                  <Badge text="Đã gửi cho thợ" fg={C.primary} bg={C.primarySoft} />
                )}
              </View>
              <SymptomBreakdownView
                symptoms={diagSource.symptoms}
                diagnosis={diagSource.diagnosis}
                recommendation={diagSource.recommendation}
                evidence={evidence}
                initialAttachments={o.attachments}
                defaultExpandFirst
              />

              {/* Danh sách dịch vụ */}
              {laborItems.length ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.ink, marginBottom: 2 }}>
                    Dịch vụ kỹ thuật ({laborItems.length})
                  </Text>
                  {laborItems.map((l, i) => (
                    <View key={`labor_${l.name}_${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                      <Text style={[ui.meta, { fontSize: 13, color: C.ink2, flex: 1, paddingRight: 6 }]} numberOfLines={2}>
                        {l.name} x{l.qty} {l.unit || 'lần'}
                      </Text>
                      <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.ink }]}>{formatVND(l.price * l.qty)}</Text>
                    </View>
                  ))}
                  {o.productDiscount ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                      <Text style={[ui.meta, { fontSize: 13, color: C.green, flex: 1, paddingRight: 6 }]}>Giảm giá dịch vụ</Text>
                      <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.green }]}>-{formatVND(o.productDiscount)}</Text>
                    </View>
                  ) : null}
                  {o.comboDiscount ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                      <Text style={[ui.meta, { fontSize: 13, color: C.green, flex: 1, paddingRight: 6 }]}>Ưu đãi {o.comboLabel || 'gộp nhiều máy (-5%)'}</Text>
                      <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.green }]}>-{formatVND(o.comboDiscount)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Danh sách vật tư (nếu có) */}
              {partItems.length ? (
                <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.ink, marginBottom: 2 }}>
                    Vật tư thay thế ({partItems.length})
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

              {/* Danh sách vật tư mua ngoài (nếu có) */}
              {(() => {
                const { lineReceipts, unmatchedReceipts } = matchReceiptsToQuoteLines(customItems, evidence);
                if (!customItems.length && !unmatchedReceipts.length) return null;
                return (
                  <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.line }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.ink, marginBottom: 2 }}>
                      {customItems.length
                        ? `Vật tư mua ngoài / phát sinh (${customItems.length})`
                        : `Hoá đơn / biên lai linh kiện đính kèm (${unmatchedReceipts.length})`}
                    </Text>
                    {customItems.map((l, i) => {
                      const receiptEv = lineReceipts.get(i) || null;
                      return (
                        <View key={`d_custom_${l.name}_${i}`} style={{ marginTop: 4 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[ui.meta, { fontSize: 13, color: C.ink2, flex: 1, paddingRight: 6 }]} numberOfLines={2}>
                              {l.name} x{l.qty}{l.isEstimatedRange ? ' (Giá dao động)' : l.isFinalizedExternal ? ' (Giá chốt cuối)' : ''}
                            </Text>
                            <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: l.isEstimatedRange ? C.goldInk : C.ink }]}>
                              {l.isEstimatedRange
                                ? formatRangeVND(l.minPrice * l.qty, l.maxPrice * l.qty)
                                : `+${formatVND((l.actualPrice ?? l.price) * l.qty)}`}
                            </Text>
                          </View>
                          <QuoteLineReceiptThumb
                            receiptEv={receiptEv}
                            partName={l.name}
                            onPreview={setPreviewOrderPhoto}
                            thumbSize={64}
                            compactLabel
                          />
                        </View>
                      );
                    })}
                    <UnmatchedReceiptStrip
                      receipts={unmatchedReceipts}
                      onPreview={setPreviewOrderPhoto}
                      title={customItems.length ? `Hoá đơn / biên lai linh kiện đính kèm (${unmatchedReceipts.length})` : ''}
                    />
                  </View>
                );
              })()}

              {o.quote?.rejectReason ? (
                <Text style={[ui.meta, { color: o.quote?.revisionRequested ? C.orange : C.red, fontWeight: '700', marginTop: 8 }]}>
                  {o.quote?.revisionRequested
                    ? `Bạn đã yêu cầu thợ điều chỉnh báo giá: ${o.quote.rejectReason}`
                    : `Bạn đã từ chối báo giá: ${o.quote.rejectReason}`}
                </Text>
              ) : null}
            </Card>
          );
        })()}
        {!o.quote && (o.materials || []).length && ['diagnosing', 'quoted', 'repairing', 'done'].includes(o.status) ? (
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
        {(() => {
          const pendingQuoteShown = Boolean(o.status === 'quoted' && o.quote);
          const quoteRejected = o.quote?.status === 'REJECTED';
          const activeLines = quoteRejected
            ? (o.quote?.lines || []).filter((l) => l.isOriginal || l.isPriorApproved)
            : (o.quote?.lines || []);
          const hasPostDiagCard = o.status !== 'quoted' && Boolean(
            (o.quote && (!quoteRejected || activeLines.length > 0)) ||
            o.diagnosisReport ||
            (o.attachments || []).length > 0 ||
            evidence.some((e) => e.stage === 'diagnosis'),
          );
          const receiptPhotos = evidence.filter(isReceiptEvidence);
          if (pendingQuoteShown || hasPostDiagCard || !receiptPhotos.length) return null;
          return (
            <Card style={{ marginTop: 12 }}>
              <Text style={mx.tlTitle}>Hoá đơn / biên lai linh kiện đính kèm ({receiptPhotos.length})</Text>
              <UnmatchedReceiptStrip receipts={receiptPhotos} onPreview={setPreviewOrderPhoto} />
            </Card>
          );
        })()}
        {(() => {
          const unlinkedPhotos = evidence.filter(
            (e) =>
              e.stage !== 'receipt' &&
              e.stage !== 'diagnosis' &&
              !(o.report && e.stage === 'after') &&
              !parseSymptomPhotoTitle(e.note),
          );
          if (!unlinkedPhotos.length) return null;
          return (
            <Card style={{ marginTop: 12 }}>
              <Text style={mx.tlTitle}>Hình ảnh đính kèm đơn ({unlinkedPhotos.length})</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {unlinkedPhotos.map((e) => (
                  <Tap
                    key={e.id}
                    style={mx.thumb}
                    onPress={() => e.uri && setPreviewOrderPhoto({ uri: e.uri, title: e.note || 'Hình ảnh đính kèm đơn' })}
                    scaleTo={0.97}
                  >
                    {e.uri ? <Image source={{ uri: e.uri }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 24 }}>🖼️</Text>}
                  </Tap>
                ))}
              </View>
            </Card>
          );
        })()}
        {o.report ? (() => {
          const completionPhotos = evidence.filter((e) => e.stage === 'after' && e.uri);
          return (
            <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.green }}>
              <Text style={mx.tlTitle}>Biên bản nghiệm thu kỹ thuật</Text>
              <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>{o.report.summary}</Text>
              {(o.report.safetyChecklist || []).length ? (
                <View style={{ marginTop: 8, gap: 3 }}>
                  {o.report.safetyChecklist.map((chk, i) => (
                    <Text key={i} style={{ fontSize: 12, color: C.green, fontWeight: '700' }}>✓ {chk}</Text>
                  ))}
                </View>
              ) : null}
              {completionPhotos.length ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.greenInk, marginBottom: 6 }}>
                    Hình ảnh hoàn thành công việc ({completionPhotos.length})
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {completionPhotos.map((ph, idx) => (
                      <Tap
                        key={ph.id || `done_ph_${idx}`}
                        style={{ width: 78, height: 78, borderRadius: R.md, overflow: 'hidden', borderWidth: 1.5, borderColor: C.greenBorder, backgroundColor: C.card }}
                        onPress={() => setPreviewOrderPhoto({ uri: ph.uri, title: ph.note || 'Hình ảnh hoàn thành công việc' })}
                        scaleTo={0.97}
                      >
                        <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                      </Tap>
                    ))}
                  </View>
                </View>
              ) : null}
              {o.report.customerSignature ? (
                <View style={{ marginTop: 8, padding: 8, borderRadius: R.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}>
                  <Text style={{ fontSize: 12, color: C.greenInk, fontWeight: '800' }}>Chữ ký xác nhận của khách hàng:</Text>
                  <Text style={{ fontStyle: 'italic', fontSize: 16, fontWeight: '800', color: C.navy, marginTop: 2 }}>{o.report.customerSignature}</Text>
                </View>
              ) : null}
              {(o.materials || []).length ? <Text style={[ui.meta, { marginTop: 6 }]}>Vật tư: {o.materials.map((m) => `${m.name} (${m.qty} ${m.unit})`).join(', ')}</Text> : null}
              <Text style={[ui.meta, { marginTop: 6 }]}>{fmtDateTime(o.report.at)} · Thợ {o.report.tech}</Text>
              {o.status === 'done' && isPaid(o) && o.kind !== 'warranty' && o.kind !== 'followup' && winfo.totalDays > 0 && !winfo.noWarranty ? (
                <Btn
                  title="Xem Phiếu Nghiệm Thu & Bảo Hành Điện Tử"
                  icon="file-text"
                  variant="soft"
                  small
                  style={{ marginTop: 12 }}
                  onPress={() => setShowCertificate(true)}
                />
              ) : null}
            </Card>
          );
        })() : null}

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
              (() => {
                const hasActiveQuote =
                  o.quote &&
                  !o.quote.rejectReason &&
                  !o.quote.revisionRequested &&
                  o.quote.status !== 'REJECTED';
                const isFinalizingExact = Boolean(
                  hasActiveQuote && o.quote.isExternalFinalization && !o.quote.hasEstimatedRange,
                );
                const hasApprovedEst = Boolean(
                  !isFinalizingExact &&
                  o.quote?.approvedHasEstimatedRange &&
                  (getPendingExternalEstimates(o).length > 0 || o.quote?.revisionRequested),
                );
                const isEstQuote = Boolean(
                  (hasActiveQuote && o.quote.hasEstimatedRange) || hasApprovedEst,
                );
                const estExtraMin = hasActiveQuote && o.quote.hasEstimatedRange
                  ? (Number(o.quote.extraMin) || 0)
                  : Math.max(0, (Number(o.quote?.approvedTotalMin) || 0) - bookedValue(o));
                const estExtraMax = hasActiveQuote && o.quote.hasEstimatedRange
                  ? (Number(o.quote.extraMax) || 0)
                  : Math.max(estExtraMin, (Number(o.quote?.approvedTotalMax) || 0) - bookedValue(o));
                const billExtra = billExtraAmount(o);
                const quoteExtra = hasActiveQuote
                  ? (o.quote.approved && o.bill && (o.bill.quotationTotal != null || o.bill.supplementalTotal > 0)
                      ? billExtra
                      : (o.quote.quotationType === 'SUPPLEMENTAL'
                          ? (Number(o.quote.extraAmount) || Math.max(0, (Number(o.quote.total) || 0) - bookedValue(o)))
                          : Math.max(Number(o.quote.extraAmount) || 0, Math.max(0, (Number(o.quote.total) || 0) - bookedValue(o)))))
                  : billExtra;
                return (
                  <>
                    <Bill l="Tổng tiền dịch vụ" v={formatVND(o.goods)} />
                    {o.productDiscount ? <Bill l="Giảm giá dịch vụ" v={`-${formatVND(o.productDiscount)}`} green /> : null}
                    {o.comboDiscount ? <Bill l={`Ưu đãi ${o.comboLabel || 'gộp nhiều máy'}`} v={`-${formatVND(o.comboDiscount)}`} green /> : null}
                    {isEstQuote && estExtraMax > 0 ? (
                      <Bill
                        l="Vật tư & phát sinh (dự kiến)"
                        v={formatRangeVND(estExtraMin, estExtraMax, { prefix: '+' })}
                      />
                    ) : quoteExtra > 0 ? (
                      <Bill
                        l={o.quote?.approved ? 'Vật tư & chi phí phát sinh' : 'Vật tư & phát sinh (theo báo giá)'}
                        v={`+${formatVND(quoteExtra)}`}
                      />
                    ) : null}
                    {partDisc ? <Bill l={`Ưu đãi hạng thành viên (−${o.bill?.tierPartDiscountPercent || 0}% vật tư)`} v={`−${formatVND(partDisc)}`} green /> : null}
                    {o.voucherDiscount ? <Bill l={`Mã giảm giá ${o.voucher?.code || ''}`} v={`-${formatVND(o.voucherDiscount)}`} green /> : null}
                    {lateDiscountAmount(o) ? <Bill l="Bồi thường thợ đến muộn" v={`−${formatVND(lateDiscountAmount(o))}`} green /> : null}
                    {o.bill?.paidAmount ? <Bill l="Đã thanh toán" v={formatVND(o.bill.paidAmount)} green /> : null}
                  </>
                );
              })()
            )}
            <Bill l="Hình thức" v={o.payment || 'Chuyển khoản VietQR'} />
            <Bill
              l="Trạng thái thu"
              v={
                o.status === 'cancelled'
                  ? ((o.inspectionFee || 0) > 0 ? (isPaid(o) ? 'Đã thanh toán phí KT' : 'Cần thanh toán phí KT') : 'Đã huỷ (0đ)')
              : isPaid(o)
                    ? (isQRPayment(o) ? 'Đã chuyển khoản VietQR' : 'Đã thanh toán')
                    : o.bill?.cashClaimPending
                      ? 'Đã báo trả tiền mặt · chờ thợ xác nhận'
                    : o.status === 'pending_payment' && (o.bill?.paidAmount || 0) > 0
                      ? 'Đã trả một phần · Vui lòng thanh toán phần còn lại'
                      : o.status === 'pending_payment'
                        ? (isQRPayment(o) ? 'Chờ thanh toán VietQR' : 'Chờ khách thanh toán')
                        : isQRPayment(o) ? 'Thanh toán qua QR (Thợ không thu tiền mặt)' : 'Chưa đến bước thanh toán'
              }
              green={isPaid(o) || (o.status === 'cancelled' && !(o.inspectionFee > 0))}
            />
            {(() => {
              const totalDisplay = o.status === 'cancelled' ? formatVND(o.inspectionFee || 0) : formatOrderTotal(o);
              const isRangeTotal = totalDisplay.includes('–');
              return (
                <View style={mx.totalRow}>
                  <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink, flex: 1 }}>
                    {o.status !== 'cancelled' &&
                    ((o.quote &&
                      !o.quote.rejectReason &&
                      !o.quote.revisionRequested &&
                      o.quote.status !== 'REJECTED' &&
                      o.quote.hasEstimatedRange) ||
                      (!(o.quote && !o.quote.rejectReason && !o.quote.revisionRequested && o.quote.status !== 'REJECTED' && o.quote.isExternalFinalization && !o.quote.hasEstimatedRange) &&
                        o.quote?.approvedHasEstimatedRange &&
                        (getPendingExternalEstimates(o).length > 0 || o.quote?.revisionRequested)))
                      ? 'Tổng thanh toán (dự kiến)'
                      : 'Tổng thanh toán'}
                  </Text>
                  <Text style={[ui.price, { fontSize: isRangeTotal ? 18 : 20, flexShrink: 0, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>
                    {totalDisplay}
                  </Text>
                </View>
              );
            })()}
            {['confirmed', 'onway', 'diagnosing', 'quoted', 'repairing'].includes(o.status) && !isPaid(o) && !o.bill?.cashClaimPending && o.kind !== 'warranty' && o.kind !== 'followup' ? (
              isQRPayment(o) ? (
                <View style={{ marginTop: 14, padding: 14, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <IconBox icon="banknote" size={42} bg={C.card} color={C.ink2} radius={13} style={{ borderWidth: 1, borderColor: C.line }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>Không chuyển khoản được?</Text>
                      <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 18 }}>
                        Đổi sang tiền mặt để thanh toán trực tiếp cho kỹ thuật viên tại nhà.
                      </Text>
                    </View>
                  </View>
                  <Btn
                    title="Đổi sang thanh toán tiền mặt"
                    icon="banknote"
                    small
                    variant="outline"
                    onPress={() => u.confirm(
                      'Đổi sang tiền mặt?',
                      'Thợ sẽ được mở lại quyền thu tiền mặt cho đơn này. Bạn có thể đổi lại sang VietQR bất cứ lúc nào khi chưa thanh toán.',
                      () => callAction(a.switchPaymentMethod, o.code, 'CASH'),
                    )}
                  />
                </View>
              ) : (
                <View style={{ marginTop: 14, padding: 14, borderRadius: R.md, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primaryBorder, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <IconBox icon="qr-code" size={42} bg={C.card} color={C.primary} radius={13} style={{ borderWidth: 1, borderColor: C.primaryBorder }} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>Muốn chuyển khoản bằng mã QR?</Text>
                        <Badge text="VietQR 24/7" fg={C.primary} bg={C.card} />
                      </View>
                      <Text style={{ fontSize: 12.5, color: C.ink2, marginTop: 3, lineHeight: 18 }}>
                        Đổi sang VietQR để quét mã ngay trên ứng dụng — thợ sẽ không thu tiền mặt.
                      </Text>
                    </View>
                  </View>
                  <Btn
                    title="Đổi sang chuyển khoản VietQR"
                    icon="qr-code"
                    small
                    variant="primary"
                    onPress={() => u.confirm(
                      'Đổi sang VietQR?',
                      'Thợ sẽ bị khoá quyền thu tiền mặt. Bạn vẫn có thể đổi lại sang tiền mặt nếu chuyển khoản gặp sự cố.',
                      () => callAction(a.switchPaymentMethod, o.code, 'BANK_TRANSFER'),
                    )}
                  />
                </View>
              )
            ) : null}
            {o.status === 'cancelled' && (o.inspectionFee || 0) > 0 && !isPaid(o) ? (
              <View style={{ marginTop: 14, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
                <Text style={{ fontWeight: '800', color: C.goldInk, marginBottom: 4 }}>Mã QR thanh toán phí kiểm tra tại nhà</Text>
                <Text style={[ui.meta, { marginBottom: 8, color: C.ink2, textAlign: 'center' }]}>
                  Thanh toán phí dịch vụ kiểm tra thiết bị tại nhà {formatVND(o.inspectionFee)} cho thợ.
                </Text>
                <VietQRPay requestId={o.dbRequestId} paused={!screenActive} onPaid={() => a.confirmPayment(o.code, 'webhook')} size={180} />
              </View>
            ) : null}
            {/* Nút "Xác nhận đã trả tiền" chỉ đặt ở thanh dưới (dock) để tránh hai nút trùng chức năng. */}
            {isPaid(o) && o.status === 'done' ? (
              <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.green }}>
                <Text style={{ fontWeight: '800', color: C.greenInk }}>Đã thanh toán</Text>
                <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
                  Mã đơn {o.code} · {formatVND(o.bill?.paidAmount || orderTotal(o))} · {o.payment || 'Tại nhà'}
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {o.kind !== 'warranty' && o.status !== 'cancelled' ? (
          <Card style={[{ marginTop: 12, backgroundColor: C.card, borderColor: C.line }, winfo.ok && { borderLeftWidth: 3.5, borderLeftColor: C.green }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconBox icon="shield-check" size={40} bg={winfo.ok ? C.greenSoft : C.primarySoft} radius={13} />
              <View style={{ flex: 1 }}>
                <Text style={mx.tlTitle}>
                  {winfo.totalDays > 0
                    ? `Bảo hành ${winfo.totalDays} ngày${o.customerTierLabel ? ` · Hạng ${o.customerTierLabel}` : ''}`
                    : 'Chính sách bảo hành'}
                </Text>
                <Text style={[ui.meta, winfo.ok && { color: C.green, fontWeight: '700' }]}>{winfo.text}</Text>
              </View>
            </View>
            {(winfo.ok || winfo.isCutoff || (winfo.pending && winfo.stillValid)) ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn
                  title="Phiếu bảo hành điện tử"
                  variant="outline"
                  small
                  style={{ flex: 1 }}
                  onPress={() => setShowCertificate(true)}
                />
                {(winfo.ok || winfo.isCutoff) ? (
                  <Btn
                    title="Yêu cầu bảo hành"
                    variant="soft"
                    small
                    style={{ flex: 1 }}
                    onPress={requestWarranty}
                  />
                ) : null}
              </View>
            ) : null}
            {winfo.openCode ? (
              <Btn title={`Xem đơn bảo hành ${winfo.openCode}`} variant="outline" small style={{ marginTop: 12 }} onPress={() => openRelatedOrder(winfo.openCode)} />
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

      {(canEdit || canCancel || showCashConfirmBtn || (o.status === 'done' && o.kind !== 'warranty') || (o.status === 'cancelled' && o.kind !== 'warranty') || (o.kind === 'warranty' && !active)) ? (
        <View style={mx.dock}>
          {canEdit ? <Btn title="Sửa yêu cầu" icon="pencil" variant="soft" style={{ flex: 1 }} onPress={openEdit} /> : null}
          {canCancel ? <Btn title="Huỷ đơn" variant="dangerSoft" style={{ flex: 1 }} onPress={handlePressCancel} /> : null}
          {showCashConfirmBtn ? (
            <Btn
              title={payBusy ? 'Đang gửi…' : 'Xác nhận đã trả tiền'}
              icon="credit-card"
              variant="soft"
              style={{ flex: 1.15, paddingHorizontal: 10 }}
              disabled={payBusy}
              onPress={confirmCash}
            />
          ) : null}
          {o.status === 'done' && !o.rating && o.kind !== 'warranty' ? <Btn title="Đánh giá" icon="star" variant="soft" style={{ flex: 1, paddingHorizontal: 10 }} onPress={() => nav.push('rate', { code: o.code })} /> : null}
          {['done', 'cancelled'].includes(o.status) && o.kind !== 'warranty' ? <Btn title="Đặt lại" icon="rotate-ccw" style={{ flex: 1, paddingHorizontal: 10 }} onPress={reorder} /> : null}
          {o.kind === 'warranty' && !active ? <Btn title="Liên hệ hỗ trợ" icon="phone-call" variant="soft" style={{ flex: 1 }} onPress={u.call} /> : null}
        </View>
      ) : null}

      <Sheet
        visible={Boolean(previewOrderPhoto)}
        onClose={() => setPreviewOrderPhoto(null)}
        title={previewOrderPhoto?.title || 'Hình ảnh đơn hàng'}
      >
        {previewOrderPhoto?.uri ? (
          <Image source={{ uri: previewOrderPhoto.uri }} style={{ width: '100%', height: 280, borderRadius: R.md, backgroundColor: C.surface }} resizeMode="contain" />
        ) : null}
      </Sheet>
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
            <Text style={{ fontWeight: '800', color: C.primary }}>
              {(m.unpricedInCatalog || !(Number(m.price) > 0)) ? 'Báo giá thực tế' : `${formatVND(m.price)}/${m.unit}`}
            </Text>
          </View>
        ))}
      </Sheet>
      <Sheet
        visible={showCertificate}
        onClose={() => setShowCertificate(false)}
        title="Phiếu bảo hành điện tử"
        footer={winfo.ok ? (
          <Btn
            title="🛠️ Yêu cầu bảo hành miễn phí"
            onPress={() => {
              setShowCertificate(false);
              // Đợi Sheet phiếu đóng hẳn rồi mới mở Sheet đặt bảo hành (tránh 2 Modal chồng nhau).
              setTimeout(requestWarranty, 350);
            }}
          />
        ) : <Btn title="Đóng phiếu" onPress={() => setShowCertificate(false)} />}
      >
        <WarrantyCertificate o={o} winfo={winfo} tierWarrantyDays={tierWarrantyDays} />
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
        {reason === 'Lý do khác' ? (
          <Field
            label="Mô tả lý do huỷ"
            value={reasonCustom}
            onChangeText={setReasonCustom}
            placeholder="Nhập ngắn gọn lý do của bạn…"
            style={{ marginTop: 6 }}
          />
        ) : null}
      </Sheet>
      {(() => {
        const isRejectOnSite = Boolean(o.arrivedAt || o.checkIn || o.history?.some((h) => h.status === 'diagnosing'));
        const isRejectSupplemental = o.quote?.quotationType === 'SUPPLEMENTAL';
        const isExtFin = Boolean(o.quote?.isExternalFinalization);
        const isStrictFinalization = Boolean(
          isExtFin && (
            getPendingExternalEstimates(o).length > 0 ||
            (o.quote?.lines || []).some(
              (l) => l.isFinalizedExternal && !l.isPriorApproved && (Number(l.priorDeposit) > 0 || (l.maxPrice != null && l.maxPrice > 0)),
            )
          ),
        );
        const useFinalizeReasons = isStrictFinalization || (isExtFin && rejectMode === 'revise');
        return (
          <Sheet
            visible={showReject}
            onClose={() => { if (!quoteBusy) setShowReject(false); }}
            title={isStrictFinalization ? 'Yêu cầu kiểm tra lại giá vật tư' : (isExtFin ? 'Phản hồi hoá đơn phát sinh' : 'Phản hồi báo giá')}
            footer={(
              <Btn
                title={
                  quoteBusy
                    ? 'Đang gửi…'
                    : isStrictFinalization
                      ? 'Gửi yêu cầu nhập lại giá'
                      : rejectMode === 'revise'
                        ? (isExtFin ? 'Gửi yêu cầu chỉnh lại giá' : 'Gửi yêu cầu báo giá lại')
                        : isRejectSupplemental
                          ? 'Xác nhận từ chối phát sinh'
                          : 'Xác nhận từ chối & huỷ đơn'
                }
                variant={isStrictFinalization || rejectMode === 'revise' ? 'primary' : 'danger'}
                disabled={quoteBusy}
                onPress={async () => {
                  const reasonList = useFinalizeReasons ? FINALIZE_REVISION_REASONS : REJECT_REASONS;
                  const chosen = reasonList.includes(rejectReason) ? rejectReason : reasonList[0];
                  const finalWhy = chosen === 'Lý do khác' ? rejectCustom.trim() : chosen;
                  if (chosen === 'Lý do khác' && finalWhy.length < 3) {
                    u.alert('Thiếu lý do', 'Vui lòng nhập ngắn gọn lý do phản hồi (tối thiểu 3 ký tự).', '✏️');
                    return;
                  }
                  const sendRevise = isStrictFinalization || rejectMode === 'revise';
                  const ok = await respondQuote(sendRevise ? 'revise' : false, finalWhy);
                  if (ok) {
                    setShowReject(false);
                    setRejectCustom('');
                  }
                }}
              />
            )}
          >
            {!isStrictFinalization ? (
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
                  <Text style={{ fontSize: 13, fontWeight: '800', color: rejectMode === 'cancel' ? C.red : C.ink, flex: 1 }}>
                    {isRejectSupplemental ? 'Từ chối phát sinh' : 'Từ chối & Huỷ đơn'}
                  </Text>
                </Tap>
              </View>
            ) : null}
            <Text style={[ui.meta, { fontSize: 13, marginBottom: 8 }]}>
              {isStrictFinalization
                ? 'Thợ đã hoàn thành sửa chữa và sẽ kiểm tra lại giá / hoá đơn mua ngoài rồi gửi lại để bạn nghiệm thu.'
                : rejectMode === 'revise'
                  ? (isExtFin
                      ? 'Thợ sẽ kiểm tra lại giá / hoá đơn vật tư phát sinh và gửi lại cho bạn.'
                      : 'Thợ sẽ nhận được yêu cầu và điều chỉnh lại phương án / chi phí cho bạn.')
                  : isRejectSupplemental
                    ? 'Chỉ từ chối phần phát sinh mới, đơn hàng vẫn tiếp tục thực hiện các hạng mục đã đặt/đã duyệt.'
                    : isRejectOnSite
                      ? 'Huỷ sau khi thợ đã kiểm tra tại nhà có thể áp dụng phí kiểm tra theo chính sách hiện hành.'
                      : 'Đơn hàng sẽ được huỷ miễn phí (0đ) trước khi thợ xuất phát.'}
            </Text>
            {(useFinalizeReasons ? FINALIZE_REVISION_REASONS : REJECT_REASONS).map((r) => {
              const reasonList = useFinalizeReasons ? FINALIZE_REVISION_REASONS : REJECT_REASONS;
              const active = (reasonList.includes(rejectReason) ? rejectReason : reasonList[0]) === r;
              return (
                <Tap key={r} style={mx.option} onPress={() => setRejectReason(r)}>
                  <Radio on={active} />
                  <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{r}</Text>
                </Tap>
              );
            })}
            {rejectReason === 'Lý do khác' ? (
              <Field
                label="Nhập lý do chi tiết"
                value={rejectCustom}
                onChangeText={setRejectCustom}
                placeholder="Nhập ngắn gọn điều bạn muốn thợ kiểm tra lại…"
                style={{ marginTop: 6 }}
              />
            ) : null}
          </Sheet>
        );
      })()}
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
      <WarrantyBookingSheet
        visible={showWarrantyBooking}
        onClose={() => setShowWarrantyBooking(false)}
        order={o}
        winfo={winfo}
        onSubmit={async (payload) => {
          try {
            const newCode = await callAction(a.requestWarranty, o.code, payload);
            if (newCode) {
              nav.push('order', { code: newCode });
            }
            return newCode;
          } catch (e) {
            u.alert('Chưa gửi được', errorText(e, 'Không gửi được yêu cầu bảo hành. Vui lòng thử lại.'), '⚠️');
            return null;
          }
        }}
      />
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
const Bill = ({ l, v, green, orange }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 8 }}>
    <Text style={{ flex: 1, color: orange ? C.orange : C.muted, fontSize: 13.5, lineHeight: 20 }}>{l}</Text>
    <Text style={{ flexShrink: 0, textAlign: 'right', color: green ? C.green : orange ? C.orange : C.ink, fontWeight: '700', fontSize: 13.5, lineHeight: 20, fontVariant: ['tabular-nums'] }}>{v}</Text>
  </View>
);

// =========================================================== ĐÁNH GIÁ
const QUICK_TAGS_POS = ['Đúng giờ', 'Tay nghề tốt', 'Thân thiện', 'Sạch sẽ', 'Giá hợp lý', 'Tư vấn tận tình'];
const QUICK_TAGS_NEG = ['Thợ đến muộn', 'Thái độ chưa tốt', 'Chưa sạch sẽ', 'Giá chưa hợp lý', 'Xử lý chưa triệt để', 'Cần tư vấn rõ hơn'];
export function RateScreen({ params }) {
  const { s, a, nav, ui: u } = useApp();
  const o = (s.orders || []).find((x) => x.code === params?.code);
  const [stars, setStars] = useState(5);
  const [tags, setTags] = useState([]);
  const [text, setText] = useState('');
  const [sending, runSend] = useBusy();
  if (!o) return <NotFoundView title="Không tìm thấy đơn" body="Không tìm thấy đơn cần đánh giá. Đơn có thể đã được đánh giá hoặc chưa đồng bộ." onBack={() => nav.back()} />;
  if (o.rating || o.status !== 'done') {
    return (
      <NotFoundView
        title={o.rating ? 'Đơn đã được đánh giá' : 'Chưa thể đánh giá'}
        body={o.rating ? 'Cảm ơn bạn đã gửi đánh giá cho đơn hàng này.' : 'Bạn chỉ có thể gửi đánh giá sau khi đơn hàng đã hoàn thành.'}
        onBack={() => nav.back()}
      />
    );
  }
  const svc = getService(o.items?.[0]?.id);
  const LABEL = ['', 'Rất tệ', 'Chưa hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời!'];
  const activeTags = stars <= 3 ? QUICK_TAGS_NEG : QUICK_TAGS_POS;
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
          <Text style={[mx.tlTitle, { textAlign: 'center', marginTop: 12 }]}>{svc?.name || o.items?.[0]?.name || 'Dịch vụ kỹ thuật'}</Text>
          <Text style={ui.meta}>Thợ {o.tech?.name || 'kỹ thuật viên'}</Text>
          <View style={{ marginTop: 18 }}>
            <Stars value={stars} size={38} onChange={(v) => { setStars(v); setTags([]); }} />
          </View>
          <Text style={{ marginTop: 10, fontWeight: '800', color: C.orange, fontSize: 15 }}>{LABEL[stars]}</Text>
        </Card>
        <Text style={mx.sec}>{stars <= 3 ? 'Điểm cần cải thiện?' : 'Bạn hài lòng điều gì?'}</Text>
        <View style={mx.chips}>
          {activeTags.map((t) => <Chip key={t} label={t} on={tags.includes(t)} onPress={() => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))} />)}
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
              backgroundColor: on ? C.primary : C.surface,
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
  const iconBg = isEarn ? (isReview ? C.goldSoft : C.primarySoft) : C.surface;
  const iconFg = isEarn ? (isReview ? C.goldInk : C.primary) : C.ink2;
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
        borderBottomColor: C.line,
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
            <View style={{ backgroundColor: C.surface, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.primary }}>#{h.orderCode}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={{ fontWeight: '900', fontSize: 14, color: isEarn ? C.green : C.ink2 }}>
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
      nav.services('bao-duong');
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
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' }}>Điểm khả dụng (Đổi mã giảm giá)</Text>
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
              <AppIcon name="crown" size={14} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{cur.label}</Text>
            </Tap>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 12 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600' }}>
              Điểm tích luỹ xét hạng: <Text style={{ color: '#fff', fontWeight: '800' }}>{lp} điểm</Text>
            </Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10.5, fontWeight: '800' }}>
                Chu kỳ 12 tháng
              </Text>
            </View>
          </View>
          <Progress value={progress} color="#FFFFFF" style={{ marginTop: 8, backgroundColor: 'rgba(255,255,255,0.25)', height: 6 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: '600', flex: 1 }}>
              {next ? `Cần thêm ${next.min - lp} điểm để lên hạng ${next.label}` : 'Bạn đã đạt thứ hạng cao nhất (Kim cương)!'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
              Đổi mã giảm giá không trừ điểm hạng
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
              <Badge text={`Hạng ${previewTier.label}`} fg={previewTier.color} bg={previewTier.bg || C.primarySoft} />
              {cur.id === previewTier.id ? (
                <Badge text="Hạng của bạn" fg={C.greenInk} bg={C.greenSoft} />
              ) : lp >= previewTier.min ? (
                <Badge text="✓ Đã mở khoá" fg={C.greenInk} bg={C.greenSoft} />
              ) : (
                <Badge text={`Cần thêm ${previewTier.min - lp} điểm`} fg={C.goldInk} bg={C.goldSoft} />
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

        {/* 1. ĐỔI ĐIỂM LẤY MÃ GIẢM GIÁ (Ưu tiên đưa lên trên để khách dễ dàng sử dụng điểm) */}
        <SectionTitle title="Đổi điểm lấy mã giảm giá" />
        {(s.redeemOptions || []).length === 0 ? <Text style={ui.meta}>Hiện chưa có ưu đãi đổi điểm.</Text> : null}
        {(s.redeemOptions || []).map((r) => {
          const enough = s.points >= r.cost;
          return (
            <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <IconBox icon="gift" size={46} bg={C.primarySoft} radius={14} />
              <View style={{ flex: 1 }}>
                <Text style={mx.tlTitle}>{r.title}</Text>
                <Text style={[ui.meta, { color: C.primary, fontWeight: '700' }]}>{r.cost} điểm</Text>
              </View>
              <Btn
                title="Đổi"
                small
                variant={enough ? 'primary' : 'ghost'}
                disabled={!enough}
                onPress={() => u.confirm('Đổi mã giảm giá?', `Dùng ${r.cost} điểm để đổi ${String(r.title || '').toLowerCase()}.`, () => {
                  callAction(a.redeem, r.id).catch((e) => u.alert('Chưa đổi được', errorText(e, 'Không đổi được mã giảm giá. Vui lòng thử lại.'), '⚠️'));
                }, 'Đổi ngay')}
              />
            </Card>
          );
        })}

        {/* 2. VÍ MÃ GIẢM GIÁ */}
        {(() => {
          const validWallet = getValidVouchers(s.myVouchers, s.publicVouchers);
          return (
            <>
              <SectionTitle title={`Ví mã giảm giá (${validWallet.length})`} />
              {validWallet.map((v, idx) => (
                <View key={`${v.customerVoucherId || v.code}-${idx}`} style={mx.ticket}>
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
            </>
          );
        })()}
        <Text style={[ui.meta, { textAlign: 'center', marginTop: 4, marginBottom: 8 }]}>Chọn mã ở bước Xác nhận đặt lịch để được giảm giá.</Text>

        {/* 3. CÁCH TÍCH ĐIỂM */}
        <SectionTitle title="Cách tích điểm" />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListRow icon="receipt-text" iconBg={C.primarySoft} label="Hoàn thành đơn hàng" sub={`${formatVND(s.policy?.loyalty?.earn?.vnd_per_point || 10000)} = 1 điểm`} onPress={() => nav.services('bao-duong')} />
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
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: C.line,
                borderLeftWidth: 3.5,
                borderLeftColor: C.green,
                paddingVertical: 9,
                paddingHorizontal: 12,
                borderRadius: 12,
              }}
            >
              <IconBox icon="trending-up" size={30} bg={C.greenSoft} color={C.green} radius={8} />
              <View>
                <Text style={{ fontSize: 10.5, color: C.muted, fontWeight: '600' }}>Tổng tích luỹ</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: C.green }}>+{totalEarned} điểm</Text>
              </View>
            </View>

            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: C.line,
                borderLeftWidth: 3.5,
                borderLeftColor: C.primary,
                paddingVertical: 9,
                paddingHorizontal: 12,
                borderRadius: 12,
              }}
            >
              <IconBox icon="gift" size={30} bg={C.primarySoft} color={C.primary} radius={8} />
              <View>
                <Text style={{ fontSize: 10.5, color: C.muted, fontWeight: '600' }}>Đã đổi mã giảm giá</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: C.ink }}>-{totalSpent} điểm</Text>
              </View>
            </View>
          </View>

          {/* Bộ lọc tab mini: Tất cả | Đã nhận | Đã đổi */}
          <HistoryFilterTabs list={historyList} value={historyFilter} onChange={setHistoryFilter} style={{ marginBottom: 10 }} />

          {/* Danh sách rút gọn tối đa HISTORY_INITIAL_COUNT dòng */}
          {filteredHistory.length === 0 ? (
            <Card style={{ backgroundColor: C.bg, padding: 16, alignItems: 'center' }}>
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
                    backgroundColor: C.bg,
                    borderTopWidth: 1,
                    borderTopColor: C.line,
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
          {filteredHistory.length === 0 ? (
            <EmptyState icon="clock" title="Chưa có giao dịch điểm" body="Không có giao dịch nào trong mục đã chọn." />
          ) : (
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
          )}
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
              nav.services('bao-duong');
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
                      backgroundColor: on ? (t.bg || C.primarySoft) : C.card,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: on ? t.color : C.muted }}>{t.label}</Text>
                    <Text style={{ fontSize: 10, color: C.faint }}>{t.min}+</Text>
                  </Tap>
                );
              })}
            </View>

            {/* Banner trạng thái của khách với hạng này */}
            <View style={{ padding: 14, borderRadius: R.lg, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: activeTier.color }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: activeTier.color }}>Hạng {activeTier.label}</Text>
                <Badge
                  text={
                    cur.id === activeTier.id
                      ? 'Hạng hiện tại của bạn'
                      : lp >= activeTier.min
                        ? '✓ Đã đạt hạng này'
                        : `Còn thiếu ${activeTier.min - lp} điểm`
                  }
                  fg={lp >= activeTier.min ? C.greenInk : C.goldInk}
                  bg={lp >= activeTier.min ? C.greenSoft : C.goldSoft}
                />
              </View>
              <Text style={{ color: C.ink, fontWeight: '700', marginTop: 6, lineHeight: 19 }}>{activeTier.summary}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Badge text="Bảo hành điện tử theo từng dịch vụ" fg={C.primary} bg={C.primarySoft} />
                <Badge text={`Tích luỹ của bạn: ${lp}/${activeTier.min || 0} điểm`} fg={C.ink2} bg={C.surface} />
              </View>
              {activeTier.min > 0 ? (
                <Progress
                  value={Math.min(1, lp / activeTier.min)}
                  color={activeTier.color}
                  style={{ marginTop: 10, backgroundColor: C.surface }}
                />
              ) : null}
            </View>

            {/* 1. Điều kiện xét hạng */}
            <Text style={{ fontWeight: '800', color: C.ink, marginTop: 16, marginBottom: 6 }}>Điều kiện đạt & duy trì hạng</Text>
            <View style={{ padding: 12, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}>
              <Text style={{ color: C.ink, fontWeight: '600', lineHeight: 20 }}>{activeTier.condition}</Text>
              {activeTier.pointRule ? (
                <Text style={[ui.meta, { color: C.primary, fontWeight: '700', marginTop: 6 }]}>• {activeTier.pointRule}</Text>
              ) : null}
            </View>

            {/* 2. Đặc quyền & Quyền lợi dành cho khách hàng */}
            <Text style={{ fontWeight: '800', color: C.ink, marginTop: 16, marginBottom: 8 }}>Đặc quyền & Quyền lợi khách hàng</Text>
            {(activeTier.benefits || []).map((b, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: C.green }}>✓</Text>
                </View>
                <Text style={{ flex: 1, color: C.ink, lineHeight: 20, fontWeight: '600' }}>{b}</Text>
              </View>
            ))}

            {/* 3. Điều khoản bảo vệ có lợi cho khách hàng */}
            <Text style={{ fontWeight: '800', color: C.ink, marginTop: 14, marginBottom: 8 }}>Điều khoản bảo vệ & Cam kết</Text>
            <View style={{ padding: 12, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, gap: 8 }}>
              {(activeTier.terms || []).map((term, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Text style={{ color: C.primary, fontWeight: '900', marginTop: 1 }}>•</Text>
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
  const [showDelete, setShowDelete] = useState(false);
  const [delPwd, setDelPwd] = useState('');
  const [delErr, setDelErr] = useState('');
  const [deleting, runDel] = useBusy();

  const closeDelete = () => {
    if (deleting) return;
    setShowDelete(false);
    setDelPwd('');
    setDelErr('');
  };

  const confirmDelete = () => runDel(async () => {
    if (!delPwd.trim()) {
      setDelErr('Vui lòng nhập mật khẩu để xác nhận xoá tài khoản.');
      return;
    }
    setDelErr('');
    try {
      const ok = await callAction(a.deleteAccount, delPwd);
      if (isOk(ok)) {
        setShowDelete(false);
        setDelPwd('');
      }
    } catch (e) {
      setDelErr(errorText(e, 'Không xoá được tài khoản. Vui lòng thử lại.'));
    }
  });

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
        setOtpErr(errorText(res, 'Không thể gửi mã xác thực.'));
      }
    } catch (e) {
      setOtpErr(errorText(e, 'Không thể gửi mã xác thực. Vui lòng thử lại.'));
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = () => runVerify(async () => {
    if (otpInput.length !== 6) { setOtpErr('Vui lòng nhập đủ 6 chữ số của mã xác thực.'); return; }
    setOtpErr('');
    try {
      const res = (await callAction(a.verifyEmailOtp, otpInput)) || {};
      if (res.ok) {
        setShowOtp(false);
        setOtpInput('');
        setOtpSent(false);
      } else {
        setOtpErr(errorText(res, 'Mã xác thực không chính xác.'));
      }
    } catch (e) {
      setOtpErr(errorText(e, 'Không xác thực được mã xác thực. Vui lòng thử lại.'));
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
              const p = sanitizeVnPhoneInput(t);
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
            placeholder="Ngày/tháng/năm (VD: 15/08/1995)"
            error={err.dob}
          />
          <Field label="Thư điện tử (tài khoản đăng nhập, không sửa ở đây)" value={email} editable={false} />
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            {s.auth?.emailVerified ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Badge text="✓ Đã xác thực thư điện tử" fg={C.green} bg={C.greenSoft} />
                <Text style={ui.meta}>Đủ điều kiện đặt lịch dịch vụ</Text>
              </View>
            ) : (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: C.goldInk, fontSize: 13 }}>Thư điện tử chưa xác thực</Text>
                  <Text style={ui.meta}>Bắt buộc xác thực mã 6 số để đặt dịch vụ</Text>
                </View>
                <Tap
                  onPress={() => {
                    setShowOtp(true);
                    if (!otpSent && !otpSending) sendOtp();
                  }}
                >
                  <Badge text="Xác thực ngay" fg={C.goldInk} bg={C.goldSoft} />
                </Tap>
              </>
            )}
          </View>
        </Card>
        <Card style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
          <ListRow icon="lock" iconBg={C.primarySoft} label="Đổi mật khẩu" onPress={() => setShowPw(true)} />
          <ListRow icon="trash-2" label="Xoá tài khoản" sub="Xoá vĩnh viễn tài khoản và dữ liệu" danger onPress={() => { setDelPwd(''); setDelErr(''); setShowDelete(true); }} last />
        </Card>
      </ScrollView>
      <View style={mx.dock}><Btn title={saving ? 'Đang lưu…' : 'Lưu thay đổi'} disabled={saving} style={{ flex: 1 }} onPress={save} /></View>
      <Sheet visible={showOtp} onClose={() => setShowOtp(false)} title="Xác thực thư điện tử (6 số)" footer={<Btn title={otpVerifying ? 'Đang kiểm tra…' : 'Xác nhận mã'} disabled={otpVerifying} onPress={verifyOtp} />}>
        <Text style={{ color: C.ink2, lineHeight: 20, marginBottom: 12 }}>
          Nhập mã xác thực 6 chữ số được gửi tới địa chỉ thư điện tử:{' '}
          <Text style={{ fontWeight: '800', color: C.ink }}>{email || s.auth?.email}</Text>
        </Text>
        <View
          style={{
            padding: 12,
            borderRadius: R.md,
            backgroundColor: C.primarySoft,
            borderWidth: 1,
            borderColor: C.primaryBorder,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AppIcon name="mail-open" size={20} color={C.navy} strokeWidth={2.2} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12.5, color: C.navy, fontWeight: '700' }}>Kiểm tra hộp thư điện tử</Text>
            <Text style={{ fontSize: 12, color: C.primary, marginTop: 2 }}>
              Mã xác thực 6 chữ số đã được gửi tới {email || s.auth?.email} (hiệu lực {OTP_TTL_MINUTES} phút).
            </Text>
          </View>
        </View>
        <Field
          label="Mã xác thực (6 chữ số)"
          value={otpInput}
          onChangeText={(t) => { setOtpInput(t.replace(/\D/g, '').slice(0, 6)); setOtpErr(''); }}
          keyboardType="number-pad"
          placeholder="Nhập 6 chữ số"
          error={otpErr}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <Text style={ui.meta}>Hiệu lực trong {OTP_TTL_MINUTES} phút</Text>
          <Tap onPress={sendOtp} disabled={otpSending}>
            <Text style={ui.link}>{otpSending ? 'Đang gửi...' : 'Gửi lại mã xác thực'}</Text>
          </Tap>
        </View>
      </Sheet>
      <Sheet visible={showPw} onClose={closePw} title="Đổi mật khẩu" footer={<Btn title={pwSaving ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'} disabled={pwSaving} onPress={savePw} />}>
        <Field label="Mật khẩu hiện tại" value={curPw} onChangeText={(t) => { setCurPw(t); if (pwErr) setPwErr(''); }} secureTextEntry placeholder="••••••" style={{ marginTop: -8 }} />
        <Field label="Mật khẩu mới" value={newPw} onChangeText={(t) => { setNewPw(t); if (pwErr) setPwErr(''); }} secureTextEntry placeholder={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự`} />
        <Field label="Nhập lại mật khẩu mới" value={newPw2} onChangeText={(t) => { setNewPw2(t); if (pwErr) setPwErr(''); }} secureTextEntry placeholder="Nhập lại" />
        {pwErr ? <Text style={[ui.fieldErr, { marginTop: 10 }]}>{pwErr}</Text> : null}
      </Sheet>
      <Sheet
        visible={showDelete}
        onClose={closeDelete}
        title="Xoá tài khoản vĩnh viễn"
        footer={(
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn title="Huỷ" variant="ghost" style={{ flex: 1 }} disabled={deleting} onPress={closeDelete} />
            <Btn title={deleting ? 'Đang xoá…' : 'Xoá tài khoản'} variant="danger" style={{ flex: 1.4 }} disabled={deleting} onPress={confirmDelete} />
          </View>
        )}
      >
        <View style={{ padding: 12, borderRadius: R.md, backgroundColor: C.redSoft, borderWidth: 1, borderColor: C.redBorder, marginBottom: 12 }}>
          <Text style={{ fontWeight: '800', color: C.redInk, fontSize: 13.5 }}>Lưu ý quan trọng</Text>
          <Text style={{ color: C.redInk, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
            Tài khoản và toàn bộ lịch sử, mã giảm giá, điểm thưởng sẽ bị xoá vĩnh viễn và không thể khôi phục. Nếu còn đơn đang xử lý, vui lòng hoàn thành hoặc huỷ đơn trước.
          </Text>
        </View>
        <Field
          label="Nhập mật khẩu để xác nhận"
          value={delPwd}
          onChangeText={(t) => { setDelPwd(t); if (delErr) setDelErr(''); }}
          secureTextEntry
          placeholder="••••••"
          error={delErr}
        />
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
            { i: 'phone-call', t: 'Gọi tổng đài', onPress: u.call },
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
    ['2. Đặt lịch & huỷ lịch', `Khách hàng có thể huỷ đơn miễn phí khi thợ chưa bắt đầu di chuyển và còn tối thiểu ${FREE_CANCEL_MIN_BEFORE} phút trước giờ hẹn. Lịch hẹn được xác nhận trực tiếp trên ứng dụng.`],
    ['3. Giá & thanh toán', 'Giá hiển thị gồm nhân công. Vật tư, linh kiện phát sinh được báo giá và chỉ thực hiện khi khách đồng ý.'],
    ['4. Bảo hành', 'Thời hạn bảo hành áp dụng theo từng dịch vụ và hiển thị chi tiết trên phiếu bảo hành điện tử kể từ ngày hoàn thành.'],
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
  searchBox: { flex: 1, height: 44, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: C.ink, height: 44, ...webNoOutline },
  h: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addSq: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  notif: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: '#fff', borderRadius: R.lg, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  notifTitle: { fontSize: 14, fontWeight: '800', color: C.ink2, lineHeight: 19 },
  notifBody: { fontSize: 13, color: C.muted, lineHeight: 18, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary, marginTop: 6 },
  statusHero: { borderRadius: R.lg, padding: 18, borderWidth: 1, borderColor: C.line, ...shadow.sm },
  statusLabel: { fontSize: 20, fontWeight: '900' },
  statusDesc: { fontSize: 13, marginTop: 4, fontWeight: '500', lineHeight: 19 },
  tlDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tlLine: { width: 2, flex: 1, backgroundColor: C.line, marginVertical: 2 },
  tlTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  techAvatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sec: { fontSize: 15, fontWeight: '800', color: C.ink, marginTop: 20, marginBottom: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, marginTop: 12 },
  dock: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  bonus: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 14, marginTop: 16 },
  pointsHero: { backgroundColor: C.navy, ...grad.navyHero, borderRadius: 22, padding: 20, overflow: 'hidden', ...shadow.md },
  tiers: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tierItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  ticket: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: R.md, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.line, ...shadow.sm },
  ticketLeft: { width: 64, alignSelf: 'stretch', backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 76, height: 76, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  thumbX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center' },
  thumbAdd: { width: 76, height: 76, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primary, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  day: { width: 76, height: 64, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.primary, borderColor: C.primary },
  dayLabel: { fontSize: 12, color: C.muted, fontWeight: '600' },
  dayDate: { fontSize: 14, color: C.ink, fontWeight: '800', marginTop: 2 },
  bigAvatar: { width: 92, height: 92, borderRadius: 32, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  fl: { fontSize: 13, fontWeight: '700', color: C.ink2, marginTop: 18, marginBottom: 8 },
});
