import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Platform, Image, Linking } from 'react-native';
import { C, R, shadow, toneOf, STATUS_META, grad } from '../../theme';
import {
  ALL_SERVICES, CATEGORIES, POPULAR_SEARCHES, FAQ, REDEEM_OPTIONS, VOUCHERS, ORDER_STEPS, HOTLINE, STATUS_DESC, stepIndexOf,
  getService, formatVND, normalize, catLabel, tierOf, TIERS, TIME_SLOTS, MATERIALS, SAFETY_CHECKLIST_ITEMS,
} from '../../constants/data';
import {
  useApp, fmtDate, fmtDateTime, timeAgo, warrantyInfo, LAST_SERVICE_OPTIONS, isActiveOrder, orderTotal, lateDiscountAmount, tierPartDiscountAmount, normalizeTechRep,
} from '../../context';
import {
  Tap, Btn, IconBtn, IconBox, Card, TopBar, SectionTitle, Chip, Badge, Stars, Field, Sheet, Radio,
  EmptyState, ServiceGrid, ServiceRow, Progress, Media, ListRow, PseudoQR, HScroll, ui,
} from '../../components';
import { pickImage } from '../../utils/media';
import { TrackingCard, ChatCard } from '../../components/order';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const nextDays = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return {
    label: i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : WEEKDAYS[d.getDay()],
    ddmm: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
});
const newAttId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// =========================================================== TÌM KIẾM
export function SearchScreen() {
  const { s, a, nav } = useApp();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const t = normalize(q.trim());
    if (!t) return [];
    return ALL_SERVICES.filter((x) => normalize(`${x.name} ${catLabel(x.category)}`).includes(t));
  }, [q]);
  const pick = (text) => { setQ(text); a.addSearch(text); };

  return (
    <View style={{ flex: 1 }}>
      <View style={mx.searchBar}>
        <IconBtn icon="‹" size={38} onPress={nav.back} label="Quay lại" />
        <View style={mx.searchBox}>
          <Text>🔍</Text>
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
          {q ? <Tap onPress={() => setQ('')} hitSlop={8}><Text style={{ color: C.faint }}>✕</Text></Tap> : null}
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
                <View style={mx.chips}>{s.searches.map((t) => <Chip key={t} label={`🕘 ${t}`} onPress={() => pick(t)} />)}</View>
              </View>
            ) : null}
            <Text style={[mx.h, { marginTop: 18 }]}>Tìm kiếm phổ biến</Text>
            <View style={mx.chips}>{POPULAR_SEARCHES.map((t) => <Chip key={t} label={`🔥 ${t}`} onPress={() => pick(t)} />)}</View>
            <Text style={[mx.h, { marginTop: 18 }]}>Danh mục</Text>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {CATEGORIES.map((c, i) => (
                <ListRow key={c.id} icon={c.icon} iconBg={toneOf(c.id).bg} label={c.label} last={i === CATEGORIES.length - 1} onPress={() => nav.services('bao-duong', c.id)} />
              ))}
            </Card>
          </View>
        ) : results.length === 0 ? (
          <EmptyState icon="🔎" title="Không tìm thấy dịch vụ" body={`Không có kết quả cho "${q}". Thử từ khoá khác hoặc gọi hotline ${HOTLINE} để được tư vấn.`} />
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
  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Thông báo"
        onBack={() => {
          if (nav.stack.length > 0) nav.back();
          else nav.go('home');
        }}
        right={(
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {s.notifications.some((n) => !n.read) ? (
              <Tap onPress={a.readAll}><Text style={ui.link}>Đọc hết</Text></Tap>
            ) : null}
            <Tap onPress={() => nav.go('home')} hitSlop={6} accessibilityLabel="Về trang chủ">
              <Text style={{ fontSize: 18 }}>🏠</Text>
            </Tap>
          </View>
        )}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {s.notifications.length === 0 ? <EmptyState icon="🔔" title="Chưa có thông báo" body="Cập nhật về đơn hàng, ưu đãi và lịch bảo dưỡng sẽ hiện ở đây." /> : s.notifications.map((n) => (
          <Tap key={n.id} style={[mx.notif, !n.read && mx.notifUnread]} onPress={() => { a.readNotif(n.id); nav.open(n.link); }}>
            <IconBox icon={n.icon || '🔔'} size={44} bg={n.read ? '#F1F4F9' : C.primarySoft} radius={14} />
            <View style={{ flex: 1 }}>
              <Text style={[mx.notifTitle, !n.read && { color: C.ink }]}>{n.title}</Text>
              <Text style={mx.notifBody}>{n.body}</Text>
              <Text style={[ui.meta, { marginTop: 4 }]}>{timeAgo(n.at)}</Text>
            </View>
            {!n.read ? <View style={mx.dot} /> : null}
          </Tap>
        ))}
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
  const [editSlot, setEditSlot] = useState(TIME_SLOTS[2]);
  const [editAtts, setEditAtts] = useState([]);
  const o = s.orders.find((x) => x.code === params.code);
  if (!o) return <View style={{ flex: 1 }}><TopBar title="Không tìm thấy đơn" /></View>;
  const meta = STATUS_META[o.status];
  const curIdx = o.status === 'cancelled' ? -1 : stepIndexOf(o.status);
  const at = (k) => [...o.history].reverse().find((h) => h.status === k)?.at;
  const winfo = warrantyInfo(o, s.orders, s.lifetimePoints);
  const partDisc = tierPartDiscountAmount(o);
  const orderCats = [...new Set(o.items.map((it) => getService(it.id)?.category).filter(Boolean))];
  const refMaterials = MATERIALS.filter((m) => orderCats.includes(m.category) || m.category === 'all');
  const canCancel = ['pending', 'confirmed'].includes(o.status);
  const canEdit = o.status === 'pending';
  const active = isActiveOrder(o);
  const reorder = () => nav.push('checkout', { items: o.items.map(({ id, qty }) => ({ id, qty })) });
  const evidence = o.evidence || [];
  const editDays = nextDays(7);
  const nowH = new Date().getHours();
  const editSlotPassed = (sl) => editDayIdx === 0 && parseInt(sl, 10) <= nowH + 1;

  const openEdit = () => {
    const days = nextDays(7);
    const idx = Math.max(0, days.findIndex((d) => d.key === o.dateKey));
    setEditDayIdx(idx >= 0 ? idx : 1);
    setEditSlot(o.slot || TIME_SLOTS[2]);
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
  const saveEdit = () => {
    if (editSlotPassed(editSlot)) { u.alert('Khung giờ đã qua', 'Chọn khung giờ hoặc ngày khác.', '⏰'); return; }
    const day = editDays[editDayIdx];
    a.updatePendingRequest(o.code, {
      note: editNote,
      slot: editSlot,
      dateLabel: `${day.label} (${day.ddmm})`,
      dateKey: day.key,
      attachments: editAtts,
    });
    setShowEdit(false);
  };

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
        <ChatCard order={o} role="customer" />

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
            <Text style={mx.tlTitle}>🔄 Đang đổi thợ</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Thợ trước đã trả việc. Hệ thống đang điều phối thợ khác; kiểm tra thông báo để nhận voucher xin lỗi (nếu có).
            </Text>
          </Card>
        ) : null}
        {o.kind === 'followup' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.cyanSoft || '#E8F7FB', borderColor: '#B6E4F0' }}>
            <Text style={mx.tlTitle}>🔄 Đơn tái khám</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              Theo dõi sau đơn {o.parentCode || o.followUp?.of || '—'}.
              {o.followUp?.reason ? ` Lý do: ${o.followUp.reason}` : ''}
              {o.followUp?.remaining ? ` · Còn lại: ${o.followUp.remaining}` : ''}
            </Text>
            {(o.parentCode || o.followUp?.of) ? (
              <Tap onPress={() => nav.push('order', { code: o.parentCode || o.followUp.of })}>
                <Text style={[ui.link, { marginTop: 8 }]}>Xem đơn gốc ›</Text>
              </Tap>
            ) : null}
          </Card>
        ) : null}

        {/* ===== Báo giá chờ duyệt (khách duyệt / từ chối) ===== */}
        {o.status === 'quoted' && o.quote ? (
          <Card style={{ marginTop: 12, borderColor: '#F5D77A', backgroundColor: '#FFFBEB' }}>
            {(() => {
              const isOnSite = Boolean(o.arrivedAt || o.checkIn || o.history?.some((h) => h.status === 'diagnosing'));
              return (
                <View style={{ marginBottom: 10, padding: 10, borderRadius: R.sm, backgroundColor: C.greenSoft }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green, lineHeight: 18 }}>
                    {isOnSite
                      ? '📍 Thợ đã đến kiểm tra thực tế tại nhà bạn. Bạn có thể đồng ý để thợ sửa hoặc từ chối & huỷ đơn hoàn toàn MIỄN PHÍ (0đ).'
                      : '🚀 Báo giá trước khi thợ xuất phát. Bạn đồng ý thì thợ mới đi. Huỷ lúc này hoàn toàn MIỄN PHÍ (0đ).'}
                  </Text>
                </View>
              );
            })()}
            <Text style={mx.tlTitle}>🧾 Báo giá từ thợ {o.tech?.name}</Text>
            {o.quote.symptoms ? <Text style={[ui.meta, { fontSize: 13, color: C.ink2, marginTop: 6 }]}>Triệu chứng: {o.quote.symptoms}</Text> : null}
            <Text style={[ui.meta, { fontSize: 13, color: C.ink2, marginTop: 4 }]}>Chẩn đoán: {o.quote.diagnosis}</Text>
            {o.quote.recommendation ? <Text style={[ui.meta, { fontSize: 13, color: C.ink2, marginTop: 4 }]}>Đề xuất: {o.quote.recommendation}</Text> : null}
            <View style={{ marginTop: 10 }}>
              {o.quote.lines.map((l, i) => (
                <View key={`${l.name}-${i}`} style={{ flexDirection: 'row', paddingVertical: 4, gap: 8, alignItems: 'center' }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ color: C.ink2 }} numberOfLines={2}>
                      {l.type === 'part' ? '🔩' : '🛠'} {l.name} x{l.qty}
                    </Text>
                    {l.isCustom ? <Badge text="Phát sinh" fg={C.orange} bg={C.orangeSoft} /> : null}
                  </View>
                  <Text style={{ fontWeight: '700', color: C.ink }}>{formatVND(l.price * l.qty)}</Text>
                </View>
              ))}
            </View>
            <Bill l="Giá bạn đã đặt" v={formatVND(o.quote.booked)} />
            <Bill l="Phát sinh" v={`+${formatVND(o.quote.total - o.quote.booked)}`} />
            {partDisc ? <Bill l={`💎 Đặc quyền hạng ${o.customerTierLabel || ''} (−${o.tierPartDiscountPercent}% vật tư)`} v={`−${formatVND(partDisc)}`} green /> : null}
            {o.voucherDiscount ? <Bill l={`Voucher ${o.voucher?.code}`} v={`-${formatVND(o.voucherDiscount)}`} green /> : null}
            <View style={mx.totalRow}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink }}>Tổng sau báo giá</Text>
              <Text style={[ui.price, { fontSize: 20 }]}>{formatVND(orderTotal(o))}</Text>
            </View>
            <Tap onPress={() => setShowMatPrice(true)} style={{ marginTop: 10 }}>
              <Text style={ui.link}>📋 Đối chiếu bảng giá vật tư niêm yết HRMSS ›</Text>
            </Tap>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Btn title="Báo giá lại / Huỷ" variant="dangerSoft" style={{ flex: 1.1 }} onPress={() => { setRejectMode('revise'); setShowReject(true); }} />
              <Btn title="Đồng ý báo giá" style={{ flex: 1.9 }} onPress={() => a.respondQuote(o.code, true)} />
            </View>
          </Card>
        ) : null}

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
            <View style={mx.techAvatar}><Text style={{ fontSize: 26 }}>👷</Text></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={mx.tlTitle}>{o.tech.name}</Text>
                <Badge text="KTV chuyên trách" fg={C.primaryDark} bg={C.primarySoft} />
              </View>
              <Text style={[ui.meta, { marginTop: 2 }]}>
                {o.tech.code} · ★ {o.tech.rating || 5.0}
                {o.tech.jobs != null ? ` · ${Number(o.tech.jobs).toLocaleString('vi-VN')} đơn` : ''}
                {o.tech.reputation != null ? ` · Uy tín ${normalizeTechRep(o.tech).reputation}` : ''}
              </Text>
              {o.lateCompensation?.tier && o.lateCompensation.tier !== 'ok' ? (
                <Text style={[ui.meta, { color: C.orange, fontWeight: '700', marginTop: 2 }]}>
                  Check-in muộn {o.lateCompensation.minutesLate} phút
                </Text>
              ) : o.arrivedAt ? (
                <Text style={[ui.meta, { color: C.green, fontWeight: '700', marginTop: 2 }]}>Đã check-in đúng chính sách giờ hẹn</Text>
              ) : null}
            </View>
            <IconBtn icon="📞" onPress={() => Linking.openURL(`tel:${o.tech.phone || ''}`).catch(() => {})} style={{ backgroundColor: C.greenSoft }} label="Gọi thợ" />
          </Card>
        ) : active ? (
          <Card style={{ marginTop: 12, backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 18 }}>⚙️</Text>
              <Text style={{ fontWeight: '800', color: '#0369A1', fontSize: 14 }}>Hệ thống đang điều phối Kỹ thuật viên</Text>
            </View>
            <Text style={{ color: '#0C4A6E', marginTop: 6, fontSize: 12.5, lineHeight: 18 }}>
              Hệ thống HRMSS đang tự động điều phối Kỹ thuật viên chuyên trách gần bạn nhất để đảm bảo có mặt đúng khung giờ {o.slot}.
            </Text>
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={{ color: '#0284C7', fontSize: 12, fontWeight: '600' }}>✓ Đúng chuyên môn kỹ thuật thiết bị</Text>
              <Text style={{ color: '#0284C7', fontSize: 12, fontWeight: '600' }}>✓ Phân bổ thợ khu vực {o.address?.district || 'của bạn'}</Text>
              <Text style={{ color: '#0284C7', fontSize: 12, fontWeight: '600' }}>✓ Cam kết bảo hành 60 ngày sau dịch vụ</Text>
            </View>
          </Card>
        ) : null}

        <Card style={{ marginTop: 12 }}>
          <InfoLine icon="📅" label="Lịch hẹn" value={`${o.dateLabel} · ${o.slot}`} />
          <InfoLine icon="📍" label={`${o.address?.gender === 'Nữ' ? 'Chị' : 'Anh'} ${o.address?.name || ''} · ${o.address?.phone || ''}`} value={o.address?.full} />
          <InfoLine icon="💳" label="Thanh toán" value={o.payment} />
          {o.device ? (
            <InfoLine
              icon="📺"
              label="Thiết bị tại nhà"
              value={`${catLabel(o.device.category)}${o.device.brand ? ` · ${o.device.brand}` : ''}${o.device.room ? ` (${o.device.room})` : ''}${o.device.serial ? ` · SN: ${o.device.serial}` : ''}`}
            />
          ) : null}
          {o.siteCondition ? (
            <InfoLine icon="🏢" label="Vị trí thi công" value={o.siteCondition.label} />
          ) : null}
          {o.qrVerified ? (
            <InfoLine icon="🔳" label="Xác thực QR tại nhà" value={`Đã xác thực lúc ${fmtDateTime(o.qrVerified.at)}`} />
          ) : null}
          {o.note ? <InfoLine icon="📝" label="Ghi chú" value={o.note} /> : null}
          {(o.attachments || []).length ? (
            <View style={{ marginTop: 4, marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600', marginBottom: 6 }}>📷 Ảnh đính kèm</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {o.attachments.map((att) => (
                  <View key={att.id} style={mx.thumb}>
                    {att.uri ? <Image source={{ uri: att.uri }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 22 }}>🖼️</Text>}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {o.workerCode ? <InfoLine icon="🧑‍🔧" label="Thợ Now" value={o.workerCode} /> : null}
          {o.warrantyOf ? (
            <Tap onPress={() => nav.push('order', { code: o.warrantyOf })}><InfoLine icon="🔗" label="Bảo hành cho đơn" value={`${o.warrantyOf} ›`} link /></Tap>
          ) : null}
        </Card>

        <Text style={mx.sec}>Dịch vụ</Text>
        {o.items.map((it) => {
          const svc = getService(it.id);
          return svc ? <ServiceRow key={it.id} item={svc} right={<Text style={{ fontWeight: '800', color: C.ink2 }}>x{it.qty}</Text>} /> : null;
        })}

        {/* ===== Thông tin thợ gửi lên ===== */}
        {o.quote && o.status !== 'quoted' ? (
          <Card style={{ marginTop: 4 }}>
            <Text style={mx.tlTitle}>🔍 Chẩn đoán của thợ</Text>
            {o.quote.symptoms ? <Text style={[ui.meta, { marginTop: 6 }]}>Triệu chứng: {o.quote.symptoms}</Text> : null}
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>{o.quote.diagnosis}</Text>
            {o.quote.recommendation ? <Text style={[ui.meta, { marginTop: 6 }]}>Đề xuất: {o.quote.recommendation}</Text> : null}
            {o.quote.lines.map((l, i) => (
              <View key={`${l.name}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={[ui.meta, { fontSize: 13, color: C.ink2 }]} numberOfLines={2}>
                    {l.type === 'part' ? '🔩' : '🛠'} {l.name} x{l.qty}
                  </Text>
                  {l.isCustom ? <Badge text="Phát sinh" fg={C.orange} bg={C.orangeSoft} /> : null}
                </View>
                <Text style={[ui.meta, { fontSize: 13, fontWeight: '700', color: C.ink }]}>{formatVND(l.price * l.qty)}</Text>
              </View>
            ))}
            {o.quote.rejectReason ? (
              <Text style={[ui.meta, { color: o.quote.revisionRequested && o.status === 'diagnosing' ? C.orange : C.red, fontWeight: '700', marginTop: 4 }]}>
                {o.quote.revisionRequested && o.status === 'diagnosing'
                  ? `🔄 Bạn đã yêu cầu thợ điều chỉnh báo giá: ${o.quote.rejectReason}`
                  : `Bạn đã từ chối báo giá: ${o.quote.rejectReason}`}
              </Text>
            ) : null}
          </Card>
        ) : null}
        {(o.progress || []).length ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={mx.tlTitle}>📈 Tiến độ</Text>
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
            <Text style={mx.tlTitle}>🔩 Vật tư / linh kiện</Text>
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
            <Text style={mx.tlTitle}>📝 Nhật ký sửa chữa</Text>
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
            <Text style={mx.tlTitle}>📷 Ảnh minh chứng</Text>
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
            <Text style={mx.tlTitle}>✅ Biên bản hoàn thành</Text>
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
                <Text style={{ fontSize: 12, color: C.green, fontWeight: '800' }}>✍️ Chữ ký điện tử của khách hàng:</Text>
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
            {o.followUpCreated ? (
              <Tap onPress={() => nav.push('order', { code: o.followUpCreated })}>
                <Text style={[ui.link, { marginTop: 8 }]}>Xem lịch tái khám {o.followUpCreated} ›</Text>
              </Tap>
            ) : null}
          </Card>
        ) : null}

        {o.kind !== 'warranty' && o.kind !== 'followup' ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={[mx.tlTitle, { marginBottom: 6 }]}>💳 Chi phí & thanh toán</Text>
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
                {o.comboDiscount ? <Bill l={`🔥 Ưu đãi ${o.comboLabel || 'Combo nhiều máy'}`} v={`-${formatVND(o.comboDiscount)}`} green /> : null}
                {o.quote?.approved && o.quote.total !== o.quote.booked ? <Bill l="Phát sinh theo báo giá" v={`${o.quote.total > o.quote.booked ? '+' : ''}${formatVND(o.quote.total - o.quote.booked)}`} /> : null}
                {partDisc ? <Bill l={`💎 Đặc quyền hạng ${o.customerTierLabel || ''} (−${o.tierPartDiscountPercent}% vật tư)`} v={`−${formatVND(partDisc)}`} green /> : null}
                {o.voucherDiscount ? <Bill l={`Voucher ${o.voucher?.code}`} v={`-${formatVND(o.voucherDiscount)}`} green /> : null}
                {lateDiscountAmount(o) ? (
                  <Bill l={`Bồi thường đến muộn (−${o.lateCompensation.percent}% NC)`} v={`−${formatVND(lateDiscountAmount(o))}`} green />
                ) : null}
                <Bill l="Phí đi lại" v="Miễn phí" green />
              </>
            )}
            <Bill l="Hình thức" v={o.payment || 'Thanh toán khi nhận hàng'} />
            <Bill
              l="Trạng thái thu"
              v={o.status === 'cancelled' ? ((o.inspectionFee || 0) > 0 ? 'Cần thanh toán phí KT' : 'Đã huỷ (0đ)') : o.report?.paid ? 'Đã thanh toán' : o.status === 'done' ? 'Chờ xác nhận' : 'Chưa thanh toán'}
              green={!!o.report?.paid || (o.status === 'cancelled' && !(o.inspectionFee > 0))}
            />
            <View style={mx.totalRow}>
              <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink }}>Tổng thanh toán</Text>
              <Text style={[ui.price, { fontSize: 20 }]}>{formatVND(o.status === 'cancelled' ? (o.inspectionFee || 0) : orderTotal(o))}</Text>
            </View>
            {o.status === 'cancelled' && (o.inspectionFee || 0) > 0 ? (
              <View style={{ marginTop: 14, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#F5D77A' }}>
                <Text style={{ fontWeight: '800', color: '#92400E', marginBottom: 4 }}>Mã QR thanh toán phí kiểm tra tại nhà</Text>
                <Text style={[ui.meta, { marginBottom: 8, color: '#92400E', textAlign: 'center' }]}>
                  Thanh toán phí dịch vụ kiểm tra thiết bị tại nhà {formatVND(o.inspectionFee)} cho thợ.
                </Text>
                <PseudoQR value={`HRMSS|KT|${o.code}|${o.inspectionFee}`} size={160} />
                <Text style={[ui.meta, { marginTop: 8, textAlign: 'center', lineHeight: 18 }]}>
                  Quét mã QR qua Ngân hàng / Ví điện tử · Nội dung: {o.code} KT · {formatVND(o.inspectionFee)}
                </Text>
              </View>
            ) : null}
            {o.status === 'done' && !o.report?.paid && /vnpay|qr|chuyển khoản|atm|google pay|apple pay/i.test(o.payment || '') ? (
              <View style={{ marginTop: 14, alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 16 }}>🏦</Text>
                  <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>Tài khoản Công ty HRMSS (VietQR)</Text>
                </View>
                <Text style={[ui.meta, { marginBottom: 10, textAlign: 'center', color: C.muted }]}>
                  Chuyển khoản trực tiếp vào tài khoản Công ty để kích hoạt Bảo hành điện tử 60 ngày
                </Text>
                <PseudoQR value={`HRMSS|${o.code}|${orderTotal(o)}`} size={160} />
                <View style={{ marginTop: 10, width: '100%', backgroundColor: '#fff', padding: 10, borderRadius: R.sm, borderWidth: 1, borderColor: '#E2E8F0', gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={ui.meta}>Đơn vị thụ hưởng:</Text>
                    <Text style={{ fontWeight: '700', color: C.ink, fontSize: 12 }}>CTY CP CÔNG NGHỆ HRMSS</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={ui.meta}>Ngân hàng:</Text>
                    <Text style={{ fontWeight: '700', color: C.ink, fontSize: 12 }}>MBBank (Quân Đội)</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={ui.meta}>Số tài khoản:</Text>
                    <Text style={{ fontWeight: '800', color: C.primary, fontSize: 12 }}>0908 888 999</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={ui.meta}>Nội dung CK:</Text>
                    <Text style={{ fontWeight: '800', color: C.orange, fontSize: 12 }}>{o.code}</Text>
                  </View>
                </View>
                <Btn
                  title="⚡ Giả lập Quét QR thành công (Bank Webhook)"
                  variant="primary"
                  small
                  style={{ marginTop: 10, width: '100%' }}
                  onPress={() => a.confirmPayment(o.code, 'webhook')}
                />
              </View>
            ) : null}
            {o.status === 'done' && !o.report?.paid ? (
              <Btn
                title="Xác nhận đã thanh toán"
                icon="💳"
                style={{ marginTop: 12 }}
                onPress={() => u.confirm(
                  'Xác nhận đã thanh toán?',
                  `Hình thức: ${o.payment || 'Tại nhà'}. Tổng ${formatVND(orderTotal(o))}.`,
                  () => a.confirmPayment(o.code),
                  'Xác nhận',
                )}
              />
            ) : null}
            {o.status === 'done' && o.report?.paid ? (
              <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.greenSoft }}>
                <Text style={{ fontWeight: '800', color: C.green }}>🧾 Biên lai điện tử</Text>
                <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
                  Mã đơn {o.code} · {formatVND(orderTotal(o))} · {o.payment || 'Tại nhà'}
                  {o.report.paidAt ? `\nXác nhận lúc ${fmtDateTime(o.report.paidAt)}` : ''}
                </Text>
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <PseudoQR value={`RECEIPT|${o.code}|PAID|${orderTotal(o)}`} size={120} />
                </View>
              </View>
            ) : null}
          </Card>
        ) : null}

        {o.kind !== 'warranty' && o.status !== 'cancelled' ? (
          <Card style={{ marginTop: 12, backgroundColor: winfo.ok ? '#F3FBF7' : '#fff' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 24 }}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={mx.tlTitle}>
                  Bảo hành {winfo.totalDays || 60} ngày{o.customerTierLabel ? ` · Hạng ${o.customerTierLabel}` : ''}
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
                  onPress={() => u.confirm('Gửi yêu cầu bảo hành?', 'Thợ sẽ quay lại kiểm tra miễn phí.', () => { const c = a.requestWarranty(o.code); if (c) nav.push('order', { code: c }); }, 'Gửi')}
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

      {(canEdit || canCancel || (o.status === 'done' && o.kind !== 'warranty') || (o.status === 'cancelled' && o.kind !== 'warranty') || (o.kind === 'warranty' && !active)) ? (
        <View style={mx.dock}>
          {canEdit ? <Btn title="Sửa yêu cầu" variant="soft" style={{ flex: 1 }} onPress={openEdit} /> : null}
          {canCancel ? <Btn title="Huỷ đơn" variant="dangerSoft" style={{ flex: 1 }} onPress={() => setShowCancel(true)} /> : null}
          {o.status === 'done' && !o.report?.paid && o.kind !== 'warranty' && o.kind !== 'followup' ? (
            <Btn title="Đã thanh toán" icon="💳" variant="soft" style={{ flex: 1 }} onPress={() => a.confirmPayment(o.code)} />
          ) : null}
          {o.status === 'done' && !o.rating && o.kind !== 'warranty' ? <Btn title="Đánh giá" icon="⭐" variant="gold" style={{ flex: 1 }} onPress={() => nav.push('rate', { code: o.code })} /> : null}
          {['done', 'cancelled'].includes(o.status) && o.kind !== 'warranty' ? <Btn title="Đặt lại" style={{ flex: 1 }} onPress={reorder} /> : null}
          {o.kind === 'warranty' && !active ? <Btn title="Liên hệ hỗ trợ" variant="soft" style={{ flex: 1 }} onPress={u.call} /> : null}
        </View>
      ) : null}

      <Sheet
        visible={showMatPrice}
        onClose={() => setShowMatPrice(false)}
        title="Bảng giá vật tư niêm yết HRMSS"
        footer={<Btn title="Đã hiểu" onPress={() => setShowMatPrice(false)} />}
      >
        <Text style={[ui.meta, { marginBottom: 10, lineHeight: 18 }]}>
          Đối chiếu đơn giá vật tư chính hãng của HRMSS. Thợ không được thu cao hơn bảng giá niêm yết.
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
              u.confirm('Gửi yêu cầu bảo hành?', 'Thợ sẽ quay lại kiểm tra miễn phí.', () => { const c = a.requestWarranty(o.code); if (c) nav.push('order', { code: c }); }, 'Gửi');
            }}
          />
        ) : <Btn title="Đóng phiếu" onPress={() => setShowCertificate(false)} />}
      >
        <View style={{ backgroundColor: C.navy, borderRadius: R.lg, padding: 16, alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: C.gold, fontWeight: '900', fontSize: 12, letterSpacing: 0.8 }}>THỢ HRMSS · CHỨNG NHẬN ĐIỆN TỬ</Text>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 4 }}>
            Mã chứng nhận: {o.report?.warrantyCertificateCode || `BH-${o.code}`}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>
            Đơn gốc: {o.code} · Hoàn thành: {fmtDateTime(o.doneAt || o.createdAt)}
          </Text>
          <View style={{ backgroundColor: '#fff', padding: 10, borderRadius: 16, marginTop: 12 }}>
            <PseudoQR value={`HRMSS-WARRANTY|${o.code}|${o.address?.phone || ''}|${winfo.totalDays || 60}D`} size={130} />
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
          <Text style={ui.meta}>• Kỹ thuật viên: {o.tech?.name || o.report?.tech || 'Thợ HRMSS'} ({o.tech?.code || o.report?.techCode || 'HRMSS'})</Text>
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
        footer={<Btn title="Xác nhận huỷ" variant="danger" onPress={() => { setShowCancel(false); a.cancelOrder(o.code, reason); }} />}
      >
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
            title={rejectMode === 'revise' ? 'Gửi yêu cầu báo giá lại' : 'Xác nhận từ chối & huỷ đơn'}
            variant={rejectMode === 'revise' ? 'primary' : 'danger'}
            onPress={() => {
              setShowReject(false);
              a.respondQuote(o.code, rejectMode === 'revise' ? 'revise' : false, rejectReason);
            }}
          />
        )}
      >
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Tap
            onPress={() => setRejectMode('revise')}
            style={[
              mx.option,
              { flex: 1, borderWidth: 1.5, borderRadius: R.md, paddingHorizontal: 10, borderColor: rejectMode === 'revise' ? C.primary : C.line, backgroundColor: rejectMode === 'revise' ? C.primarySoft : '#fff' },
            ]}
          >
            <Radio on={rejectMode === 'revise'} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: rejectMode === 'revise' ? C.primary : C.ink, flex: 1 }}>🔄 Yêu cầu báo giá lại</Text>
          </Tap>
          <Tap
            onPress={() => setRejectMode('cancel')}
            style={[
              mx.option,
              { flex: 1, borderWidth: 1.5, borderRadius: R.md, paddingHorizontal: 10, borderColor: rejectMode === 'cancel' ? C.red : C.line, backgroundColor: rejectMode === 'cancel' ? C.redSoft : '#fff' },
            ]}
          >
            <Radio on={rejectMode === 'cancel'} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: rejectMode === 'cancel' ? C.red : C.ink, flex: 1 }}>✖️ Từ chối & Huỷ đơn</Text>
          </Tap>
        </View>
        <Text style={[ui.meta, { fontSize: 13, marginBottom: 8 }]}>
          {rejectMode === 'revise'
            ? 'Thợ sẽ nhận được yêu cầu và điều chỉnh lại phương án / chi phí cho bạn.'
            : 'Đơn hàng sẽ được huỷ ngay lập tức. Chính sách HRMSS miễn phí 100% kiểm tra tại nhà (0đ), bạn không phải trả bất kỳ khoản phí nào.'}
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
        footer={<Btn title="Lưu thay đổi" onPress={saveEdit} />}
      >
        <Text style={[ui.meta, { marginBottom: 8 }]}>Chỉ sửa được khi đơn còn chờ thợ nhận.</Text>
        <Text style={{ fontWeight: '800', color: C.ink, marginBottom: 8 }}>Ngày hẹn</Text>
        <HScroll contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
          {editDays.map((dd, i) => (
            <Tap key={dd.key} onPress={() => setEditDayIdx(i)} style={[mx.day, editDayIdx === i && mx.dayOn]}>
              <Text style={[mx.dayLabel, editDayIdx === i && { color: 'rgba(255,255,255,0.85)' }]}>{dd.label}</Text>
              <Text style={[mx.dayDate, editDayIdx === i && { color: '#fff' }]}>{dd.ddmm}</Text>
            </Tap>
          ))}
        </HScroll>
        <Text style={{ fontWeight: '800', color: C.ink, marginBottom: 8 }}>Khung giờ</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {TIME_SLOTS.map((sl) => {
            const off = editSlotPassed(sl);
            const on = editSlot === sl && !off;
            return (
              <Tap key={sl} disabled={off} onPress={() => setEditSlot(sl)} style={[mx.slot, on && mx.slotOn, off && { opacity: 0.35 }]}>
                <Text style={[mx.slotText, on && { color: '#fff' }]}>{sl}</Text>
              </Tap>
            );
          })}
        </View>
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
  <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 8 }}>
    <Text style={{ fontSize: 16, width: 22 }}>{icon}</Text>
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
  const { s, a, nav } = useApp();
  const o = s.orders.find((x) => x.code === params.code);
  const [stars, setStars] = useState(5);
  const [tags, setTags] = useState([]);
  const [text, setText] = useState('');
  if (!o) return null;
  const svc = getService(o.items[0]?.id);
  const LABEL = ['', 'Rất tệ', 'Chưa hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời!'];
  const submit = () => {
    const full = [tags.join(', '), text.trim()].filter(Boolean).join('. ');
    a.rateOrder(o.code, stars, full);
    nav.back();
  };
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
        <View style={mx.bonus}><Text style={{ color: C.goldInk, fontWeight: '700' }}>🎁 Nhận ngay +20 điểm thưởng khi gửi đánh giá</Text></View>
      </ScrollView>
      <View style={mx.dock}><Btn title="Gửi đánh giá" style={{ flex: 1 }} onPress={submit} /></View>
    </View>
  );
}

// =========================================================== QUYỀN LỢI
export function RewardsScreen({ params }) {
  const { s, a, nav, ui: u, setPendingVoucher } = useApp();
  const { cur, next } = tierOf(s.lifetimePoints);
  const progress = next ? (s.lifetimePoints - cur.min) / (next.min - cur.min) : 1;
  const [selectedTierId, setSelectedTierId] = useState(params?.tierId || null);
  const activeTier = TIERS.find((t) => t.id === selectedTierId) || null;
  const previewTier = activeTier || cur;

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
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Quyền lợi của tôi" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <View style={mx.pointsHero}>
          <View style={[mx.blob, { width: 180, height: 180, right: -40, top: -60 }]} />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>Điểm hiện có</Text>
          <Text style={{ color: C.gold, fontSize: 40, fontWeight: '900', marginTop: 2 }}>{s.points}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Tap onPress={() => setSelectedTierId(cur.id)}>
              <Badge text={`👑 ${cur.label} · Xem quyền lợi ›`} fg="#fff" bg={cur.color} />
            </Tap>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Tích luỹ: {s.lifetimePoints} điểm</Text>
          </View>
          <Progress value={progress} color={C.gold} style={{ marginTop: 14, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 6 }}>{next ? `Còn ${next.min - s.lifetimePoints} điểm để lên hạng ${next.label}` : 'Bạn đã đạt hạng cao nhất 🎉'}</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>Các hạng thành viên</Text>
          <Text style={{ fontSize: 11, fontWeight: '600', color: C.primary }}>Chạm vào hạng để xem quyền lợi ›</Text>
        </View>

        <View style={mx.tiers}>
          {TIERS.map((t) => {
            const isCurrent = cur.id === t.id;
            const unlocked = s.lifetimePoints >= t.min;
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
                <Text style={{ fontSize: 18 }}>{unlocked ? '👑' : '🔒'}</Text>
                <Text style={{ fontSize: 11, fontWeight: '800', color: isCurrent || isSelected ? t.color : C.muted, marginTop: 2 }}>{t.label}</Text>
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
              ) : s.lifetimePoints >= previewTier.min ? (
                <Badge text="✓ Đã mở khoá" fg={C.green} bg={C.greenSoft} />
              ) : (
                <Badge text={`Cần thêm ${previewTier.min - s.lifetimePoints} điểm`} fg={C.orange} bg={C.orangeSoft} />
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

        <SectionTitle title="Cách tích điểm" />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListRow icon="🧾" iconBg={C.primarySoft} label="Hoàn thành đơn hàng" sub="10.000đ = 1 điểm" onPress={() => nav.services()} />
          <ListRow icon="⭐" iconBg={C.goldSoft} label="Đánh giá sau khi dùng dịch vụ" sub="+20 điểm mỗi đơn" onPress={() => nav.activity('done')} last />
        </Card>

        {(() => {
          const fallbackEntries = s.orders
            .filter((o) => o.status === 'done' && o.kind !== 'warranty')
            .flatMap((o) => {
              const earned = Math.max(1, Math.floor(orderTotal(o) / 10000));
              const arr = [{ id: `ord_${o.code}`, title: `Hoàn thành đơn ${o.code}`, delta: earned, at: o.doneAt || o.createdAt, orderCode: o.code }];
              if (o.rating) {
                arr.unshift({ id: `rate_${o.code}`, title: `Đánh giá dịch vụ đơn ${o.code}`, delta: 20, at: (o.doneAt || o.createdAt) + 60000, orderCode: o.code });
              }
              return arr;
            });
          const historyList = (s.pointHistory && s.pointHistory.length) ? s.pointHistory : fallbackEntries;
          return (
            <>
              <SectionTitle title={`Lịch sử điểm thưởng (${historyList.length})`} />
              {historyList.length === 0 ? (
                <Card style={{ backgroundColor: '#F8FAFC' }}>
                  <Text style={ui.meta}>Chưa có giao dịch điểm nào. Hoàn thành đơn hoặc gửi đánh giá để tích điểm thưởng đầu tiên!</Text>
                </Card>
              ) : (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {historyList.slice(0, 10).map((h, i, arr) => (
                    <Tap
                      key={h.id || i}
                      onPress={() => (h.orderCode ? nav.push('order', { code: h.orderCode }) : null)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        padding: 13,
                        borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                        borderBottomColor: C.line,
                      }}
                    >
                      <IconBox
                        icon={h.delta > 0 ? '⬆️' : '🎁'}
                        size={38}
                        bg={h.delta > 0 ? C.greenSoft : C.goldSoft}
                        radius={12}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: C.ink, fontSize: 13.5 }}>{h.title}</Text>
                        <Text style={ui.meta}>{fmtDateTime(h.at)}</Text>
                      </View>
                      <Text style={{ fontWeight: '900', fontSize: 14, color: h.delta > 0 ? C.green : C.orange }}>
                        {h.delta > 0 ? `+${h.delta}` : h.delta} điểm
                      </Text>
                    </Tap>
                  ))}
                </Card>
              )}
            </>
          );
        })()}

        <SectionTitle title="Đổi điểm lấy voucher" />
        {REDEEM_OPTIONS.map((r) => {
          const enough = s.points >= r.cost;
          return (
            <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <IconBox icon="🎁" size={46} bg={C.goldSoft} radius={14} />
              <View style={{ flex: 1 }}>
                <Text style={mx.tlTitle}>{r.title}</Text>
                <Text style={[ui.meta, { color: C.goldInk, fontWeight: '700' }]}>{r.cost} điểm</Text>
              </View>
              <Btn title="Đổi" small variant={enough ? 'gold' : 'ghost'} onPress={() => u.confirm('Đổi voucher?', `Dùng ${r.cost} điểm để đổi ${r.title.toLowerCase()}.`, () => a.redeem(r.id), 'Đổi ngay')} />
            </Card>
          );
        })}

        <SectionTitle title={`Ví voucher (${s.myVouchers.length + VOUCHERS.length})`} />
        {[...s.myVouchers, ...VOUCHERS].map((v) => (
          <View key={v.code} style={mx.ticket}>
            <View style={[mx.ticketLeft, v.wallet && { backgroundColor: C.gold }]}>
              <Text style={{ fontSize: 22 }}>{v.wallet ? '🎁' : '🎟️'}</Text>
            </View>
            <View style={{ flex: 1, padding: 12 }}>
              <Text style={{ fontWeight: '900', color: C.ink, letterSpacing: 0.5 }}>{v.code}</Text>
              <Text style={ui.meta}>{v.label}</Text>
            </View>
            <Btn title="Dùng" small variant="soft" style={{ marginRight: 12 }} onPress={() => pickWalletVoucher(v)} />
          </View>
        ))}
        <Text style={[ui.meta, { textAlign: 'center', marginTop: 6 }]}>Chọn mã ở bước Xác nhận đặt lịch để được giảm giá.</Text>
      </ScrollView>

      <Sheet
        visible={!!activeTier}
        onClose={() => setSelectedTierId(null)}
        title={activeTier ? `Hạng ${activeTier.label} (${activeTier.min}+ điểm)` : 'Quyền lợi hạng'}
        footer={activeTier ? (
          <Btn
            title={s.lifetimePoints >= activeTier.min ? 'Đặt dịch vụ với đặc quyền của bạn' : `Đặt dịch vụ tích thêm ${activeTier.min - s.lifetimePoints} điểm`}
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
                      : s.lifetimePoints >= activeTier.min
                        ? '✓ Đã đạt hạng này'
                        : `🔒 Còn thiếu ${activeTier.min - s.lifetimePoints} điểm`
                  }
                  fg={s.lifetimePoints >= activeTier.min ? C.green : C.orange}
                  bg="#fff"
                />
              </View>
              <Text style={{ color: C.ink, fontWeight: '700', marginTop: 6, lineHeight: 19 }}>{activeTier.summary}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Badge text={`🛡️ Bảo hành ${activeTier.warrantyDays || 60} ngày`} fg={C.navy} bg="#fff" />
                <Badge text={`📊 Tích luỹ của bạn: ${s.lifetimePoints}/${activeTier.min || 0} điểm`} fg={C.ink2} bg="#fff" />
              </View>
              {activeTier.min > 0 ? (
                <Progress
                  value={Math.min(1, s.lifetimePoints / activeTier.min)}
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

// =========================================================== YÊU THÍCH
export function FavoritesScreen() {
  const { s, nav } = useApp();
  const list = s.favorites.map(getService).filter(Boolean);
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Dịch vụ yêu thích" sub={list.length ? `${list.length} dịch vụ` : null} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {list.length ? <ServiceGrid data={list} /> : (
          <EmptyState icon="♡" title="Chưa có dịch vụ yêu thích" body="Nhấn ♡ trên dịch vụ để lưu lại và đặt nhanh hơn lần sau." action="Khám phá dịch vụ" onAction={() => nav.services()} />
        )}
      </ScrollView>
    </View>
  );
}

// =========================================================== HỒ SƠ
export function ProfileScreen() {
  const { s, a, d, nav, ui: u } = useApp();
  const [name, setName] = useState(s.user.name || '');
  const [phone, setPhone] = useState(s.user.phone || '');
  const [email, setEmail] = useState(s.user.email || '');
  const [err, setErr] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpErr, setOtpErr] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [otpSending, setOtpSending] = useState(false);

  const sendOtp = async () => {
    setOtpSending(true);
    setOtpErr('');
    try {
      const res = await a.sendEmailOtp();
      if (res.ok) {
        if (res.alreadyVerified) setShowOtp(false);
        else if (res.otpCode) setOtpHint(res.otpCode);
      } else {
        setOtpErr(res.error || 'Không thể gửi mã OTP.');
      }
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    const res = await a.verifyEmailOtp(otpInput);
    if (res.ok) {
      setShowOtp(false);
      setOtpInput('');
      setOtpHint('');
    } else {
      setOtpErr(res.error || 'Mã OTP không chính xác.');
    }
  };

  const save = () => {
    const e = {};
    if (!name.trim()) e.name = 'Vui lòng nhập họ tên.';
    if (phone && !/^0\d{9}$/.test(phone)) e.phone = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.';
    if (email && !/^\S+@\S+\.\S+$/.test(email)) e.email = 'Email không hợp lệ.';
    setErr(e);
    if (Object.keys(e).length) return;
    a.updateUser({ name: name.trim(), phone, email: email.trim() });
    nav.back();
  };
  const savePw = () => {
    if (newPw !== newPw2) { u.alert('Không khớp', 'Mật khẩu mới nhập lại chưa khớp.', '🔐'); return; }
    const res = a.changePassword({ currentPassword: curPw, newPassword: newPw });
    if (!res.ok) { u.alert('Không đổi được', res.error, '🔐'); return; }
    setShowPw(false);
    setCurPw(''); setNewPw(''); setNewPw2('');
  };
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Thông tin cá nhân" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <View style={mx.bigAvatar}><Text style={{ fontSize: 38, fontWeight: '900', color: C.navy }}>{(name || 'K').trim().charAt(0).toUpperCase()}</Text></View>
        </View>
        <Card>
          <Field label="Họ và tên" value={name} onChangeText={setName} placeholder="Nguyễn Văn A" error={err.name} style={{ marginTop: -8 }} />
          <Field label="Số điện thoại" value={phone} onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 10))} keyboardType="phone-pad" placeholder="10 chữ số" error={err.phone} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="email@example.com" error={err.email} />
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
          <ListRow icon="📍" iconBg={C.redSoft} label="Sổ địa chỉ" value={`${s.addresses.length}`} onPress={() => nav.push('addresses')} />
          <ListRow icon="🔐" iconBg={C.primarySoft} label="Đổi mật khẩu" onPress={() => setShowPw(true)} last />
        </Card>
      </ScrollView>
      <View style={mx.dock}><Btn title="Lưu thay đổi" style={{ flex: 1 }} onPress={save} /></View>
      <Sheet visible={showOtp} onClose={() => setShowOtp(false)} title="📧 Xác thực Email (OTP 6 số)" footer={<Btn title="Xác nhận mã OTP" onPress={verifyOtp} />}>
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
          <Text style={{ fontSize: 20 }}>📬</Text>
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
            { i: '📞', t: 'Gọi hotline', onPress: u.call },
            { i: '🛡️', t: 'Bảo hành', onPress: () => nav.warranty() },
            { i: '📋', t: 'Đơn của tôi', onPress: () => nav.activity() },
          ].map((x) => (
            <Card key={x.t} style={{ flex: 1, alignItems: 'center', paddingVertical: 16 }} onPress={x.onPress}>
              <Text style={{ fontSize: 26 }}>{x.i}</Text>
              <Text style={{ fontWeight: '700', color: C.ink, marginTop: 6, fontSize: 13 }}>{x.t}</Text>
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
    ['1. Phạm vi áp dụng', 'Điều khoản áp dụng cho mọi khách hàng đặt dịch vụ kỹ thuật tại nhà qua ứng dụng Thợ HRMSS.'],
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

// =========================================================== QR
export function QRScreen() {
  const { s, d } = useApp();
  const name = s.user.name || d.address?.name || 'Khách';
  const phone = s.user.phone || d.address?.phone || '';
  return (
    <View style={{ flex: 1, backgroundColor: C.navy }}>
      <TopBar title="Mã QR của tôi" />
      <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
        <View style={mx.qrCard}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: C.ink }}>{name}</Text>
          <Text style={[ui.meta, { marginBottom: 16 }]}>{phone || 'Chưa có số điện thoại'}</Text>
          <PseudoQR value={`HRMSS:${phone || name}`} size={210} />
          <View style={{ marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, backgroundColor: C.primarySoft }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.primary }}>Mã xác thực: HRMSS:{phone || name}</Text>
          </View>
          <Text style={[ui.meta, { textAlign: 'center', marginTop: 12, lineHeight: 18 }]}>Đưa mã này cho thợ quét khi đến nhà để xác nhận đơn và tích điểm.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// =========================================================== THÊM THIẾT BỊ
const ROOMS = ['Phòng khách', 'Phòng ngủ', 'Bếp', 'Phòng tắm', 'Văn phòng'];
export function DeviceFormScreen({ params = {} }) {
  const { a, nav, setPendingDeviceId } = useApp();
  const [category, setCategory] = useState(params.category || 'may-lanh');
  const [brand, setBrand] = useState('');
  const [room, setRoom] = useState('');
  const [last, setLast] = useState('unknown');
  const save = () => {
    const d = a.addDevice({ category, brand, room, lastAgo: LAST_SERVICE_OPTIONS.find((x) => x.id === last)?.ago });
    if (params.selectOnSave && d?.id && setPendingDeviceId) {
      setPendingDeviceId(d.id);
    }
    nav.back();
  };
  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Thêm thiết bị" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={[mx.sec, { marginTop: 0 }]}>Loại thiết bị</Text>
        <View style={mx.devGrid}>
          {CATEGORIES.map((c) => {
            const on = category === c.id;
            const tone = toneOf(c.id);
            return (
              <Tap key={c.id} style={[mx.devType, on && { borderColor: tone.fg, backgroundColor: tone.bg }]} onPress={() => setCategory(c.id)}>
                <Text style={{ fontSize: 26 }}>{c.icon}</Text>
                <Text style={[{ fontSize: 12, fontWeight: '700', color: C.ink2, textAlign: 'center', marginTop: 4 }, on && { color: tone.fg }]} numberOfLines={2}>{c.label}</Text>
              </Tap>
            );
          })}
        </View>
        <Field label="Hãng / model" value={brand} onChangeText={setBrand} placeholder="VD: Daikin 1.5 HP Inverter" />
        <Text style={mx.fl}>Vị trí trong nhà</Text>
        <View style={mx.chips}>{ROOMS.map((r) => <Chip key={r} label={r} on={room === r} onPress={() => setRoom(room === r ? '' : r)} />)}</View>
        <Text style={mx.fl}>Lần bảo dưỡng gần nhất</Text>
        <View style={mx.chips}>{LAST_SERVICE_OPTIONS.map((o) => <Chip key={o.id} label={o.label} on={last === o.id} onPress={() => setLast(o.id)} />)}</View>
        <View style={[mx.bonus, { backgroundColor: C.primarySoft, marginTop: 20 }]}>
          <Text style={{ color: C.primary, fontWeight: '600', lineHeight: 19 }}>💡 Khi bạn hoàn thành đơn bảo dưỡng {catLabel(category).toLowerCase()} trên app, lịch nhắc sẽ tự động cập nhật.</Text>
        </View>
      </ScrollView>
      <View style={mx.dock}><Btn title="Lưu thiết bị" style={{ flex: 1 }} onPress={save} /></View>
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
  dock: { flexDirection: 'row', gap: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
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
  bigAvatar: { width: 92, height: 92, borderRadius: 32, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  qrCard: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 26, padding: 22, alignItems: 'center', ...shadow.lg },
  devGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  devType: { width: '31%', height: 92, borderRadius: R.lg, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  fl: { fontSize: 13, fontWeight: '700', color: C.ink2, marginTop: 18, marginBottom: 8 },
});
