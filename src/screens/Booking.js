import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { C, R, shadow } from '../theme';
import {
  getService, formatVND, discountOf, isEstimate, isClean, durationText, featureFor, stepsFor, videoFor,
  REVIEWS_BY_ID, COMMITMENTS, ALL_SERVICES, TIME_SLOTS, VOUCHERS, PAYMENTS, AREAS, noteFor, voucherDiscount,
  catLabel, catIcon,
} from '../data';
import { useApp, cartTotal } from '../store';
import {
  Tap, Btn, IconBtn, IconBox, Card, TopBar, SectionTitle, Media, Badge, Stars, Stepper, Sheet, Radio, Field,
  SelectRow, Segmented, Checkbox, EmptyState, ServiceCard, Price, ui, HScroll,
} from '../ui';
import { pickImage } from '../media';

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
const COMMIT_ICON = ['⏰', '🏅', '🤝', '😊'];

// =========================================================== CHI TIẾT DỊCH VỤ
export function DetailScreen({ params }) {
  const { s, a, d, nav } = useApp();
  const service = getService(params.id);
  const [more, setMore] = useState(false);
  if (!service) return <View style={{ flex: 1 }}><TopBar title="Không tìm thấy" /></View>;
  const discount = discountOf(service);
  const fav = s.favorites.includes(service.id);
  const reviews = [...(s.userReviews[service.id] || []), ...(REVIEWS_BY_ID[service.id] || []).map((r) => ({ ...r, stars: 5 }))];
  const related = ALL_SERVICES.filter((x) => x.category === service.category && x.id !== service.id).slice(0, 6);
  const video = videoFor(service);
  const inCart = s.cart.find((c) => c.id === service.id)?.qty || 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View>
          <Media item={service} height={260} />
          <View style={bx.floatBar}>
            <IconBtn icon="‹" onPress={nav.back} style={bx.floatBtn} label="Quay lại" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <IconBtn icon={fav ? '♥' : '♡'} onPress={() => a.toggleFav(service.id)} style={bx.floatBtn} label="Yêu thích" />
              <IconBtn icon="🛒" badge={d.cartCount} onPress={() => nav.push('cart')} style={bx.floatBtn} label="Giỏ hàng" />
            </View>
          </View>
        </View>

        <View style={bx.sheet}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Badge text={`${catIcon(service.category)} ${catLabel(service.category)}`} />
            {isEstimate(service) ? <Badge text="Giá tham khảo" fg={C.orange} bg={C.orangeSoft} /> : null}
          </View>
          <Text style={bx.name}>{service.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Stars value={Math.round(service.rating || 5)} size={13} />
            <Text style={ui.meta}>
              {service.reviews ? `${service.rating} · ${Number(service.reviews).toLocaleString('vi-VN')} đánh giá` : service.rating ? `${service.rating}` : 'Chưa có đánh giá'}
              {service.sold ? ` · ${service.sold}` : ''}
            </Text>
          </View>
          <View style={bx.priceRow}>
            <Text style={bx.price}>{formatVND(service.price)}</Text>
            {service.oldPrice ? <Text style={bx.old}>{formatVND(service.oldPrice)}</Text> : null}
            {discount > 0 ? <View style={bx.off}><Text style={bx.offText}>-{discount}%</Text></View> : null}
          </View>

          <View style={bx.trust}>
            {[
              { i: '🛡️', t: 'Bảo hành', v: '60 ngày' },
              { i: '⏱️', t: 'Thời gian', v: isClean(service) ? durationText(service.id) : 'Theo khảo sát' },
              { i: '🛵', t: 'Phí đi lại', v: 'Miễn phí' },
            ].map((x) => (
              <View key={x.t} style={bx.trustItem}>
                <Text style={{ fontSize: 20 }}>{x.i}</Text>
                <Text style={bx.trustT}>{x.t}</Text>
                <Text style={bx.trustV}>{x.v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <Card style={{ marginTop: 12 }}>
            <Text style={bx.h}>Mô tả dịch vụ</Text>
            <Text style={bx.p} numberOfLines={more ? undefined : 4}>{featureFor(service)}</Text>
            <Tap onPress={() => setMore(!more)}><Text style={[ui.link, { marginTop: 8 }]}>{more ? 'Thu gọn ▲' : 'Xem thêm ▼'}</Text></Tap>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={bx.h}>Cam kết dịch vụ</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
              {COMMITMENTS.map((c, i) => (
                <View key={c.title} style={bx.commit}>
                  <Text style={{ fontSize: 18 }}>{COMMIT_ICON[i]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={bx.commitT}>{c.title}</Text>
                    <Text style={bx.commitS} numberOfLines={2}>{c.sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={bx.h}>Quy trình thực hiện</Text>
            {video ? (
              <View style={bx.video}>
                <View style={bx.play}><Text style={{ color: C.navy, fontSize: 18, marginLeft: 3 }}>▶</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{video.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>{video.sub}</Text>
                </View>
              </View>
            ) : null}
            {stepsFor(service).map((st, i, arr) => (
              <View key={st.title} style={{ flexDirection: 'row' }}>
                <View style={{ width: 30, alignItems: 'center' }}>
                  <View style={bx.dot}><Text style={bx.dotText}>{i + 1}</Text></View>
                  {i < arr.length - 1 ? <View style={bx.rail} /> : null}
                </View>
                <View style={{ flex: 1, paddingLeft: 8, paddingBottom: 14 }}>
                  <Text style={bx.stepT}>{st.title.replace(/^Bước\s+\d+:\s*/, '')}</Text>
                  {st.items.map((it) => <Text key={it} style={bx.stepI}>• {it}</Text>)}
                </View>
              </View>
            ))}
          </Card>

          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={bx.h}>Đánh giá khách hàng</Text>
              {service.reviews ? <Text style={[ui.meta, { fontWeight: '700' }]}>★ {service.rating}/5</Text> : null}
            </View>
            {reviews.length === 0 ? <Text style={bx.p}>Chưa có nhận xét. Hãy là người đầu tiên đánh giá sau khi dùng dịch vụ!</Text> : reviews.slice(0, 5).map((r, i) => (
              <View key={`${r.name}-${i}`} style={bx.review}>
                <View style={bx.rAvatar}><Text style={{ color: C.primary, fontWeight: '800' }}>{r.name.replace('Chị ', '').charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={bx.rName}>{r.name}</Text>
                    {r.mine ? <Badge text="Bạn" /> : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Stars value={r.stars || 5} size={11} />
                    <Text style={ui.meta}>{r.date}</Text>
                  </View>
                  {r.text ? <Text style={[bx.p, { marginTop: 4 }]}>{r.text}</Text> : null}
                </View>
              </View>
            ))}
          </Card>

          {related.length ? <SectionTitle title="Dịch vụ liên quan" /> : null}
        </View>
        {related.length ? (
          <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
            {related.map((it) => <ServiceCard key={it.id} item={it} style={{ width: 160 }} />)}
          </HScroll>
        ) : null}
      </ScrollView>

      <View style={bx.dock}>
        <Tap style={bx.dockCart} onPress={() => a.addToCart(service.id)}>
          <Text style={{ fontSize: 18 }}>🛒</Text>
          <Text style={bx.dockCartText}>{inCart ? `Trong giỏ: ${inCart}` : 'Thêm giỏ'}</Text>
        </Tap>
        <Btn title={`Đặt ngay · ${formatVND(service.price)}`} style={{ flex: 1 }} onPress={() => nav.push('checkout', { items: [{ id: service.id, qty: 1 }] })} />
      </View>
    </View>
  );
}

// =========================================================== GIỎ HÀNG
export function CartScreen() {
  const { s, a, nav, ui: u } = useApp();
  const total = cartTotal(s.cart);
  const cats = new Set(s.cart.map((c) => getService(c.id)?.category));
  const suggest = ALL_SERVICES.filter((x) => cats.has(x.category) && !s.cart.some((c) => c.id === x.id)).slice(0, 6);
  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Giỏ hàng"
        sub={s.cart.length ? `${s.cart.length} dịch vụ` : null}
        right={s.cart.length ? <Tap onPress={() => u.confirm('Xoá toàn bộ giỏ hàng?', '', a.clearCart, 'Xoá hết', true)}><Text style={{ color: C.red, fontWeight: '700' }}>Xoá hết</Text></Tap> : null}
      />
      {s.cart.length === 0 ? (
        <EmptyState icon="🛒" title="Giỏ hàng đang trống" body="Thêm dịch vụ bạn cần, chọn giờ và thợ ĐMX sẽ đến tận nhà." action="Khám phá dịch vụ" onAction={() => nav.services()} style={{ flex: 1 }} />
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            {s.cart.map((it) => {
              const svc = getService(it.id);
              if (!svc) return null;
              return (
                <Card key={it.id} style={{ flexDirection: 'row', gap: 12, marginBottom: 10, padding: 12 }}>
                  <Tap onPress={() => nav.push('detail', { id: svc.id })}><Media item={svc} height={76} width={76} radius={14} /></Tap>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Text style={bx.lineName} numberOfLines={2}>{svc.name}</Text>
                      <Tap onPress={() => a.removeFromCart(svc.id)} hitSlop={8}><Text style={{ color: C.faint, fontSize: 16 }}>✕</Text></Tap>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <Price value={svc.price * it.qty} size={15} />
                      <Stepper value={it.qty} onChange={(q) => a.setCartQty(svc.id, q)} />
                    </View>
                  </View>
                </Card>
              );
            })}
            <Tap style={bx.addMore} onPress={() => nav.services()}>
              <Text style={{ color: C.primary, fontWeight: '700' }}>＋ Thêm dịch vụ khác</Text>
            </Tap>
            {suggest.length ? (
              <View>
                <SectionTitle title="Có thể bạn cũng cần" />
                <HScroll contentContainerStyle={{ gap: 12 }}>
                  {suggest.map((x) => <ServiceCard key={x.id} item={x} style={{ width: 160 }} />)}
                </HScroll>
              </View>
            ) : null}
          </ScrollView>
          <View style={bx.dockCol}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: C.muted, fontWeight: '600' }}>Tạm tính</Text>
              <Text style={[bx.price, { fontSize: 22 }]}>{formatVND(total)}</Text>
            </View>
            <Btn title="Chọn giờ & đặt lịch" onPress={() => nav.push('checkout', { items: s.cart.map(({ id, qty }) => ({ id, qty })), fromCart: true })} />
          </View>
        </View>
      )}
    </View>
  );
}

// =========================================================== THANH TOÁN
export function CheckoutScreen({ params }) {
  const { s, a, d, nav, ui: u, pendingVoucher, setPendingVoucher } = useApp();
  const [items, setItems] = useState(params.items || []);
  const [note, setNote] = useState(() => noteFor((params.items || []).map((it) => ({ service: getService(it.id) }))));
  const [attachments, setAttachments] = useState([]);
  const [workerCode, setWorkerCode] = useState('');
  const [payment, setPayment] = useState(PAYMENTS[0]);
  const [showPay, setShowPay] = useState(false);
  const [showVoucher, setShowVoucher] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [voucher, setVoucher] = useState(null);
  const [dayIdx, setDayIdx] = useState(1);
  const [slot, setSlot] = useState('12h00 - 14h00');
  const days = nextDays(7);
  const nowH = new Date().getHours();
  const slotPassed = (sl) => dayIdx === 0 && parseInt(sl, 10) <= nowH + 1;

  const addAttachment = async () => {
    if (attachments.length >= 5) { u.alert('Giới hạn ảnh', 'Bạn chỉ đính kèm tối đa 5 ảnh cho yêu cầu.', '📷'); return; }
    const uri = await pickImage();
    if (uri === null) { u.alert('Chưa hỗ trợ', 'Chọn ảnh đang khả dụng trên bản web.', '📷'); return; }
    if (!uri) return;
    setAttachments((p) => [...p, { id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, uri, at: Date.now() }]);
  };

  const lines = items.map((it) => ({ ...it, svc: getService(it.id) })).filter((x) => x.svc);
  const goods = lines.reduce((sum, x) => sum + (x.svc.oldPrice || x.svc.price) * x.qty, 0);
  const productDiscount = lines.reduce((sum, x) => sum + ((x.svc.oldPrice || x.svc.price) - x.svc.price) * x.qty, 0);
  const subtotal = goods - productDiscount;
  const vDiscount = voucherDiscount(voucher, subtotal);
  const total = Math.max(0, subtotal - vDiscount);
  const allVouchers = [...s.myVouchers, ...VOUCHERS];

  // Tự áp dụng mã đã chọn từ màn "Quyền lợi của tôi"
  React.useEffect(() => {
    if (!pendingVoucher) return;
    const v = allVouchers.find((x) => x.code === pendingVoucher);
    setPendingVoucher(null);
    if (!v) return;
    if (v.min && subtotal < v.min) {
      u.alert('Chưa đủ điều kiện', `${v.code} áp dụng cho đơn từ ${formatVND(v.min)}. Đơn hiện tại ${formatVND(subtotal)}.`, '🎟️');
      return;
    }
    setVoucher(v);
    setVoucherInput(v.code);
    u.toast(`Đã áp dụng ${v.code}`, '🎟️');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyVoucher = (code) => {
    const v = allVouchers.find((x) => x.code === code.trim().toUpperCase());
    if (!v) { u.alert('Mã không hợp lệ', 'Thử THO20, DMX10 hoặc voucher đã đổi bằng điểm.', '🎟️'); return; }
    if (v.min && subtotal < v.min) { u.alert('Chưa đủ điều kiện', `${v.code} áp dụng cho đơn từ ${formatVND(v.min)}. Đơn hiện tại ${formatVND(subtotal)}.`, '🎟️'); return; }
    setVoucher(v); setVoucherInput(v.code); setShowVoucher(false);
    u.toast(`Đã áp dụng ${v.code}`, '🎟️');
  };

  const confirm = () => {
    if (!d.address) {
      u.dialog({
        icon: '📍', title: 'Chưa có địa chỉ', message: 'Thêm địa chỉ để thợ biết nơi đến phục vụ bạn.',
        actions: [{ label: 'Để sau', variant: 'ghost' }, { label: 'Thêm địa chỉ', onPress: () => nav.push('address-form', { useNow: true }) }],
      });
      return;
    }
    if (slotPassed(slot)) { u.alert('Khung giờ đã qua', 'Vui lòng chọn khung giờ khác hoặc ngày khác.', '⏰'); return; }
    const code = a.placeOrder({
      items: lines.map(({ id, qty }) => ({ id, qty })),
      goods, productDiscount, voucher: voucher ? { ...voucher } : null, voucherDiscount: vDiscount, total,
      dateLabel: `${days[dayIdx].label} (${days[dayIdx].ddmm})`, dateKey: days[dayIdx].key, slot, payment, note, workerCode: workerCode.trim(),
      attachments, fromCart: !!params.fromCart,
    });
    nav.replace('success', { code });
  };

  if (!lines.length) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Xác nhận đặt lịch" />
        <EmptyState icon="🧾" title="Chưa có dịch vụ" body="Hãy chọn ít nhất một dịch vụ." action="Chọn dịch vụ" onAction={() => nav.services()} style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Xác nhận đặt lịch" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* Địa chỉ */}
        {d.address ? (
          <Card style={{ flexDirection: 'row', gap: 12 }} onPress={() => nav.push('addresses', { select: true })}>
            <IconBox icon="📍" size={42} bg={C.redSoft} radius={13} />
            <View style={{ flex: 1 }}>
              <Text style={bx.addrName}>{d.address.gender === 'Nữ' ? 'Chị' : 'Anh'} {d.address.name} · {d.address.phone}</Text>
              <Text style={[bx.p, { marginTop: 2 }]} numberOfLines={2}>{d.address.full}</Text>
            </View>
            <Text style={ui.link}>Đổi</Text>
          </Card>
        ) : (
          <Tap style={bx.addAddr} onPress={() => nav.push('address-form', { useNow: true })}>
            <Text style={{ fontSize: 24 }}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.primary, fontWeight: '800', fontSize: 15 }}>Thêm địa chỉ nhận dịch vụ</Text>
              <Text style={ui.meta}>Bắt buộc để thợ đến đúng nhà</Text>
            </View>
            <Text style={ui.chevron}>›</Text>
          </Tap>
        )}

        {/* Lịch hẹn */}
        <Text style={bx.sec}>🗓️  Thời gian hẹn</Text>
        <HScroll contentContainerStyle={{ gap: 8 }}>
          {days.map((dd, i) => (
            <Tap key={dd.ddmm} onPress={() => setDayIdx(i)} style={[bx.day, dayIdx === i && bx.dayOn]}>
              <Text style={[bx.dayLabel, dayIdx === i && { color: 'rgba(255,255,255,0.8)' }]}>{dd.label}</Text>
              <Text style={[bx.dayDate, dayIdx === i && { color: '#fff' }]}>{dd.ddmm}</Text>
            </Tap>
          ))}
        </HScroll>
        <View style={bx.slots}>
          {TIME_SLOTS.map((sl) => {
            const off = slotPassed(sl);
            const on = slot === sl && !off;
            return (
              <Tap key={sl} disabled={off} onPress={() => setSlot(sl)} style={[bx.slot, on && bx.slotOn, off && { opacity: 0.35 }]}>
                <Text style={[bx.slotText, on && { color: '#fff' }]}>{sl}</Text>
              </Tap>
            );
          })}
        </View>

        {/* Dịch vụ */}
        <Text style={bx.sec}>🧰  Dịch vụ ({lines.length})</Text>
        {lines.map((x) => (
          <Card key={x.id} style={{ flexDirection: 'row', gap: 12, marginBottom: 10, padding: 12, alignItems: 'center' }}>
            <Media item={x.svc} height={56} width={56} radius={12} />
            <View style={{ flex: 1 }}>
              <Text style={bx.lineName} numberOfLines={2}>{x.svc.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={[ui.price, { fontSize: 14 }]}>{formatVND(x.svc.price * x.qty)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {lines.length > 1 ? <Tap onPress={() => setItems((p) => p.filter((it) => it.id !== x.id))} hitSlop={6}><Text style={{ color: C.faint }}>✕</Text></Tap> : null}
                  <Stepper value={x.qty} onChange={(q) => setItems((p) => p.map((it) => (it.id === x.id ? { ...it, qty: q } : it)))} />
                </View>
              </View>
              {isEstimate(x.svc) ? <Text style={ui.estimate}>Giá tham khảo · chốt sau khảo sát</Text> : null}
            </View>
          </Card>
        ))}

        <Field label="Mô tả tình trạng thiết bị" multiline value={note} onChangeText={setNote} placeholder="VD: Máy lạnh chảy nước, kém lạnh…" />
        <Text style={[bx.sec, { marginTop: 4 }]}>📷  Ảnh đính kèm (tùy chọn)</Text>
        <Text style={[ui.meta, { marginBottom: 8 }]}>Gửi ảnh lỗi/thiết bị để thợ chuẩn bị vật tư (tối đa 5 ảnh).</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {attachments.map((att) => (
            <View key={att.id} style={bx.thumb}>
              <Image source={{ uri: att.uri }} style={{ width: '100%', height: '100%' }} />
              <Tap style={bx.thumbX} onPress={() => setAttachments((p) => p.filter((x) => x.id !== att.id))} hitSlop={6}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✕</Text>
              </Tap>
            </View>
          ))}
          {attachments.length < 5 ? (
            <Tap style={bx.thumbAdd} onPress={addAttachment}>
              <Text style={{ fontSize: 22, color: C.primary }}>+</Text>
              <Text style={{ fontSize: 11, color: C.primary, fontWeight: '700' }}>Thêm</Text>
            </Tap>
          ) : null}
        </View>
        <Field label="Mã Thợ Now (nếu có)" value={workerCode} onChangeText={setWorkerCode} placeholder="VD: TDMX1024 — chỉ thợ này nhận được" autoCapitalize="characters" />
        {workerCode.trim() ? <Text style={[ui.meta, { marginTop: -4, marginBottom: 8 }]}>Việc sẽ ưu tiên / chỉ hiện cho thợ có mã khớp.</Text> : null}

        <SelectRow label="Mã giảm giá" icon="🎟️" value={voucher ? `${voucher.code} · -${formatVND(vDiscount)}` : ''} placeholder={`Chọn hoặc nhập mã (${allVouchers.length} mã)`} onPress={() => setShowVoucher(true)} />
        {voucher && !vDiscount ? <Text style={ui.fieldErr}>Mã {voucher.code} chưa đủ điều kiện với đơn hiện tại.</Text> : null}
        {voucher ? <Tap onPress={() => { setVoucher(null); setVoucherInput(''); }}><Text style={[ui.fieldErr, { fontWeight: '700' }]}>Bỏ mã {voucher.code}</Text></Tap> : null}
        <SelectRow label="Phương thức thanh toán" icon="💳" value={payment} onPress={() => setShowPay(true)} />

        <Card style={{ marginTop: 18 }}>
          <Text style={bx.h}>Chi tiết thanh toán</Text>
          <Row l="Tổng tiền dịch vụ" v={formatVND(goods)} />
          <Row l="Phí đi lại" v="Miễn phí" green />
          {productDiscount ? <Row l="Giảm giá dịch vụ" v={`-${formatVND(productDiscount)}`} green /> : null}
          {vDiscount ? <Row l={`Voucher ${voucher.code}`} v={`-${formatVND(vDiscount)}`} green /> : null}
          <View style={bx.totalRow}>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>Tổng thanh toán</Text>
            <Text style={[bx.price, { fontSize: 20 }]}>{formatVND(total)}</Text>
          </View>
          <Text style={[ui.meta, { color: C.goldInk, marginTop: 8 }]}>⭐ Nhận +{Math.max(1, Math.floor(total / 10000))} điểm khi đơn hoàn thành</Text>
        </Card>
      </ScrollView>

      <View style={bx.dockCol}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: C.muted, fontWeight: '600', flex: 1 }} numberOfLines={1}>📅 {days[dayIdx].label} · {slot}</Text>
          <Text style={[bx.price, { fontSize: 20 }]}>{formatVND(total)}</Text>
        </View>
        <Btn title="Xác nhận đặt lịch" onPress={confirm} />
      </View>

      <Sheet visible={showPay} onClose={() => setShowPay(false)} title="Phương thức thanh toán">
        {PAYMENTS.map((p) => (
          <Tap key={p} style={bx.option} onPress={() => { setPayment(p); setShowPay(false); }}>
            <Radio on={payment === p} />
            <Text style={bx.optionText}>{p}</Text>
          </Tap>
        ))}
        <Text style={[ui.meta, { marginTop: 12, lineHeight: 18 }]}>Nếu đơn chưa thanh toán online, Thợ Điện Máy XANH sẽ thu tiền mặt khi hoàn thành.</Text>
      </Sheet>
      <Sheet visible={showVoucher} onClose={() => setShowVoucher(false)} title="Mã giảm giá">
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Field value={voucherInput} onChangeText={setVoucherInput} placeholder="Nhập mã giảm giá" autoCapitalize="characters" style={{ flex: 1 }} />
          <Btn title="Áp dụng" onPress={() => applyVoucher(voucherInput)} style={{ minHeight: 50 }} />
        </View>
        <Text style={[bx.sec, { marginTop: 18 }]}>Mã có thể dùng</Text>
        {allVouchers.map((v) => {
          const ok = !v.min || subtotal >= v.min;
          return (
            <Tap key={v.code} style={[bx.voucher, !ok && { opacity: 0.5 }]} onPress={() => applyVoucher(v.code)}>
              <View style={[bx.vLeft, v.wallet && { backgroundColor: C.gold }]}><Text style={{ fontSize: 22 }}>{v.wallet ? '🎁' : '🎟️'}</Text></View>
              <View style={{ flex: 1, padding: 12 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>{v.code}</Text>
                <Text style={ui.meta}>{v.label}</Text>
                {v.wallet ? <Text style={[ui.meta, { color: C.goldInk, fontWeight: '700' }]}>Ví của bạn</Text> : null}
                {!ok ? <Text style={[ui.meta, { color: C.red }]}>Cần thêm {formatVND(v.min - subtotal)}</Text> : null}
              </View>
              <View style={{ paddingRight: 12 }}><Radio on={voucher?.code === v.code} /></View>
            </Tap>
          );
        })}
      </Sheet>
    </View>
  );
}

const Row = ({ l, v, green }) => (
  <View style={bx.billRow}>
    <Text style={{ color: C.muted, fontSize: 14 }}>{l}</Text>
    <Text style={{ color: green ? C.green : C.ink, fontWeight: '700', fontSize: 14 }}>{v}</Text>
  </View>
);

// =========================================================== ĐẶT THÀNH CÔNG
export function SuccessScreen({ params }) {
  const { s, nav } = useApp();
  const o = s.orders.find((x) => x.code === params.code);
  if (!o) return null;
  const cats = [...new Set(o.items.map((it) => getService(it.id)?.category))];
  const missing = cats.find((c) => c && !s.devices.some((dv) => dv.category === c));
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 40, paddingBottom: 32 }}>
      <View style={bx.successIcon}><Text style={{ fontSize: 48, color: '#fff' }}>✓</Text></View>
      <Text style={bx.successTitle}>Đặt lịch thành công!</Text>
      <Text style={[bx.p, { textAlign: 'center', marginTop: 6 }]}>Mã đơn <Text style={{ fontWeight: '800', color: C.ink }}>{o.code}</Text>. Thợ sẽ gọi xác nhận trước khi đến.</Text>
      <Card style={{ marginTop: 24 }}>
        <Row l="Thời gian" v={`${o.dateLabel}`} />
        <Row l="Khung giờ" v={o.slot} />
        <Row l="Thanh toán" v={o.payment.length > 24 ? `${o.payment.slice(0, 24)}…` : o.payment} />
        <View style={bx.totalRow}>
          <Text style={{ fontWeight: '800', color: C.ink }}>Tổng thanh toán</Text>
          <Text style={[bx.price, { fontSize: 20 }]}>{formatVND(o.total)}</Text>
        </View>
        <Text style={[ui.meta, { marginTop: 10 }]} numberOfLines={2}>📍 {o.address?.full}</Text>
      </Card>
      {missing ? (
        <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.goldSoft, borderColor: '#FBE7A8' }} onPress={() => nav.push('device-form', { category: missing })}>
          <Text style={{ fontSize: 28 }}>{catIcon(missing)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: C.ink }}>Lưu {catLabel(missing).toLowerCase()} vào Thiết bị</Text>
            <Text style={ui.meta}>Để được nhắc lịch bảo dưỡng lần sau</Text>
          </View>
          <Text style={ui.chevron}>›</Text>
        </Card>
      ) : null}
      <Btn title="Theo dõi đơn hàng" style={{ marginTop: 24 }} onPress={() => { nav.reset(); nav.push('order', { code: o.code }); }} />
      <Btn title="Về trang chủ" variant="outline" style={{ marginTop: 10 }} onPress={() => nav.go('home')} />
    </ScrollView>
  );
}

// =========================================================== SỔ ĐỊA CHỈ
export function AddressesScreen({ params }) {
  const { s, a, d, nav, ui: u } = useApp();
  const selectMode = !!params.select;
  return (
    <View style={{ flex: 1 }}>
      <TopBar title={selectMode ? 'Chọn địa chỉ' : 'Sổ địa chỉ'} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {s.addresses.length === 0 ? (
          <EmptyState icon="📍" title="Chưa có địa chỉ" body="Thêm địa chỉ để thợ ĐMX đến đúng nhà và phục vụ bạn." action="Thêm địa chỉ mới" onAction={() => nav.push('address-form', { useNow: selectMode })} />
        ) : s.addresses.map((ad) => {
          const on = d.address?.id === ad.id;
          return (
            <Card key={ad.id} style={[{ marginBottom: 12, flexDirection: 'row', gap: 12 }, on && { borderColor: C.primary, borderWidth: 1.5 }]} onPress={() => { a.selectAddress(ad.id); if (selectMode) nav.back(); }}>
              <View style={{ paddingTop: 2 }}><Radio on={on} /></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={bx.addrName}>{ad.gender === 'Nữ' ? 'Chị' : 'Anh'} {ad.name}</Text>
                  {ad.isDefault ? <Badge text="Mặc định" fg={C.green} bg={C.greenSoft} /> : null}
                </View>
                <Text style={[bx.p, { marginTop: 2 }]}>{ad.phone}</Text>
                <Text style={bx.p}>{ad.full}</Text>
                <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
                  <Tap onPress={() => nav.push('address-form', { id: ad.id })}><Text style={ui.link}>Sửa</Text></Tap>
                  <Tap onPress={() => u.confirm('Xoá địa chỉ?', ad.full, () => a.deleteAddress(ad.id), 'Xoá', true)}><Text style={[ui.link, { color: C.red }]}>Xoá</Text></Tap>
                </View>
              </View>
            </Card>
          );
        })}
        {s.addresses.length ? <Btn title="Thêm địa chỉ mới" icon="＋" variant="soft" onPress={() => nav.push('address-form', { useNow: selectMode })} /> : null}
      </ScrollView>
    </View>
  );
}

export function AddressFormScreen({ params }) {
  const { s, a, nav } = useApp();
  const initial = params.id ? s.addresses.find((x) => x.id === params.id) : null;
  const [name, setName] = useState(initial?.name || s.user.name || '');
  const [gender, setGender] = useState(initial?.gender || 'Nam');
  const [phone, setPhone] = useState(initial?.phone || s.user.phone || '');
  const [area, setArea] = useState(initial?.area || AREAS[0]);
  const [street, setStreet] = useState(initial?.street || '');
  const [isDefault, setIsDefault] = useState(initial ? !!initial.isDefault : s.addresses.length === 0);
  const [showArea, setShowArea] = useState(false);
  const [err, setErr] = useState({});

  const save = () => {
    const e = {};
    if (!name.trim()) e.name = 'Vui lòng nhập tên người liên hệ.';
    if (!/^0\d{9}$/.test(phone.trim())) e.phone = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.';
    if (street.trim().length < 3) e.street = 'Số nhà, tên đường phải có ít nhất 3 ký tự.';
    setErr(e);
    if (Object.keys(e).length) return;
    const id = a.saveAddress({ id: initial?.id, name: name.trim(), gender, phone: phone.trim(), area, street: street.trim(), isDefault, full: `${street.trim()}, ${area}` });
    if (params.useNow) {
      a.selectAddress(id);
      if (nav.stack.some((x) => x.name === 'checkout')) { nav.popTo('checkout'); return; }
    }
    nav.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={initial ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={bx.h}>Thông tin liên hệ</Text>
          <Segmented items={[{ id: 'Nam', label: 'Anh' }, { id: 'Nữ', label: 'Chị' }]} value={gender} onChange={setGender} style={{ marginTop: 10 }} />
          <Field label="Họ và tên" value={name} onChangeText={setName} placeholder="Tên người liên hệ" error={err.name} />
          <Field label="Số điện thoại" value={phone} onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 10))} keyboardType="phone-pad" placeholder="10 chữ số" error={err.phone} />
        </Card>
        <Card style={{ marginTop: 12 }}>
          <Text style={bx.h}>Địa chỉ</Text>
          <SelectRow label="Khu vực" icon="🗺️" value={area} onPress={() => setShowArea(true)} />
          <Field label="Số nhà, tên đường" value={street} onChangeText={setStreet} placeholder="VD: 128 Trần Duy Hưng" error={err.street} />
          <Checkbox on={isDefault} onPress={() => setIsDefault(!isDefault)} label="Đặt làm địa chỉ mặc định" />
        </Card>
      </ScrollView>
      <View style={bx.dockCol}><Btn title="Lưu địa chỉ" onPress={save} /></View>
      <Sheet visible={showArea} onClose={() => setShowArea(false)} title="Chọn khu vực">
        {AREAS.map((ar) => (
          <Tap key={ar} style={bx.option} onPress={() => { setArea(ar); setShowArea(false); }}>
            <Radio on={area === ar} />
            <Text style={bx.optionText}>{ar}</Text>
          </Tap>
        ))}
      </Sheet>
    </View>
  );
}

export const bx = StyleSheet.create({
  floatBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  floatBtn: { backgroundColor: 'rgba(255,255,255,0.95)', ...shadow.md },
  sheet: { backgroundColor: '#fff', marginTop: -24, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 18 },
  name: { fontSize: 21, fontWeight: '800', color: C.ink, lineHeight: 28, marginTop: 10, letterSpacing: -0.3 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  price: { color: C.red, fontWeight: '900', fontSize: 26, fontVariant: ['tabular-nums'] },
  old: { color: C.faint, fontSize: 15, textDecorationLine: 'line-through' },
  off: { backgroundColor: C.red, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  offText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  trust: { flexDirection: 'row', marginTop: 16, backgroundColor: '#F6F8FC', borderRadius: R.md, paddingVertical: 12 },
  trustItem: { flex: 1, alignItems: 'center' },
  trustT: { fontSize: 11, color: C.muted, marginTop: 4 },
  trustV: { fontSize: 13, color: C.ink, fontWeight: '800', marginTop: 1 },
  h: { fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 6 },
  p: { fontSize: 14, color: C.ink2, lineHeight: 21 },
  commit: { width: '50%', flexDirection: 'row', gap: 8, paddingVertical: 8, paddingRight: 8 },
  commitT: { fontSize: 13, fontWeight: '800', color: C.ink },
  commitS: { fontSize: 11, color: C.muted, lineHeight: 15, marginTop: 1 },
  video: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.navy, borderRadius: R.md, padding: 14, marginVertical: 10 },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  rail: { width: 2, flex: 1, backgroundColor: '#DCE5F5', marginVertical: 3 },
  stepT: { fontSize: 14, fontWeight: '800', color: C.ink, marginTop: 3 },
  stepI: { fontSize: 13, color: C.ink2, lineHeight: 19, marginTop: 2 },
  review: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F0F3F8' },
  rAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rName: { fontSize: 14, fontWeight: '800', color: C.ink },
  dock: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, padding: 12, paddingBottom: 14 },
  dockCart: { height: 52, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  dockCartText: { color: C.ink, fontWeight: '700', fontSize: 13 },
  dockCol: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  lineName: { flex: 1, fontSize: 14, fontWeight: '700', color: C.ink, lineHeight: 19 },
  addMore: { height: 48, borderRadius: R.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9CEF8', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  addAddr: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: R.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primary, backgroundColor: C.primarySoft },
  addrName: { fontSize: 15, fontWeight: '800', color: C.ink },
  sec: { fontSize: 15, fontWeight: '800', color: C.ink, marginTop: 22, marginBottom: 10 },
  day: { width: 76, height: 64, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.primary, borderColor: C.primary },
  dayLabel: { fontSize: 12, color: C.muted, fontWeight: '600' },
  dayDate: { fontSize: 16, color: C.ink, fontWeight: '800', marginTop: 2 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginTop: 12 },
  slot: { width: '32%', height: 40, borderRadius: 11, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  slotOn: { backgroundColor: C.navy, borderColor: C.navy },
  slotText: { fontSize: 12, color: C.ink, fontWeight: '700' },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.line, borderStyle: 'dashed', paddingTop: 12, marginTop: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F3F8' },
  optionText: { fontSize: 15, color: C.ink, fontWeight: '500', flex: 1 },
  voucher: { flexDirection: 'row', alignItems: 'center', borderRadius: R.md, borderWidth: 1, borderColor: C.line, marginBottom: 10, overflow: 'hidden', backgroundColor: '#fff' },
  vLeft: { width: 64, alignSelf: 'stretch', backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  successIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.green, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 10px 30px rgba(14,159,110,0.35)' },
  successTitle: { fontSize: 24, fontWeight: '900', color: C.ink, textAlign: 'center', marginTop: 20 },
  thumb: { width: 76, height: 76, borderRadius: 14, backgroundColor: '#EEF2F7', overflow: 'hidden', position: 'relative' },
  thumbX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center' },
  thumbAdd: { width: 76, height: 76, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primary, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', gap: 2 },
});

