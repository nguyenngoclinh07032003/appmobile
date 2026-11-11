import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { C, R, shadow } from '../../theme';
import {
  getService, formatVND, discountOf, isEstimate, isClean, durationText, featureFor, stepsFor, videoFor,
  COMMITMENTS, ALL_SERVICES, TIME_SLOTS, PAYMENTS, PAYMENT_METHODS, AREAS, noteFor, voucherDiscount,
  catLabel, catIcon, MATERIALS, SITE_CONDITIONS, tierOf, comboDiscountFor, CATEGORIES,
} from '../../constants/data';
import { useApp, cartTotal, fmtDate } from '../../context';
import {
  Tap, Btn, IconBtn, IconBox, Card, TopBar, SectionTitle, Media, Badge, Stars, Stepper, Sheet, Radio, Field,
  SelectRow, Segmented, Checkbox, EmptyState, ServiceCard, Price, Chip, ui, HScroll, AppIcon,
  TimeRangeSlider, minutesToSlotStr, minutesToTimeStr,
} from '../../components';
import { pickImage, validateVietnamesePhone, validateStreetAddress, validateContactName } from '../../utils';

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
const COMMIT_ICON = ['clock', 'award', 'handshake', 'smile'];

// CHI TIẾT DỊCH VỤ
export function DetailScreen({ params }) {
  const { s, a, d, nav } = useApp();
  const service = getService(params.id);
  const [more, setMore] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showMatPrice, setShowMatPrice] = useState(false);
  useEffect(() => {
    if (!service?.dbId) return;
    a.loadServiceReviews(service.dbId);
    a.loadServiceDetail(service.dbId);
  }, [service?.dbId]);
  if (!service) return <View style={{ flex: 1 }}><TopBar title="Không tìm thấy" /></View>;
  const curTier = tierOf(s.lifetimePoints || 0).cur;
  const catMaterials = MATERIALS.filter((m) => m.category === service.category || m.category === 'all');
  const discount = discountOf(service);
  const reviewData = (s.serviceReviews || {})[service.dbId] || null;
  const ratingAvg = reviewData?.summary?.rating_average ?? null;
  const ratingCount = reviewData?.summary?.rating_count || 0;
  const reviews = (reviewData?.items || []).map((r) => ({
    name: r.customer_display_name || 'Khách hàng',
    stars: r.rating,
    date: r.created_at ? fmtDate(new Date(r.created_at).getTime()) : '',
    text: r.review_text || '',
  }));
  const related = ALL_SERVICES.filter((x) => x.category === service.category && x.id !== service.id).slice(0, 6);
  const video = videoFor(service);
  // Mô tả + các bước chuẩn lấy từ backend; chưa tải được thì dùng mô tả chung theo loại dịch vụ.
  const detail = (s.serviceDetails || {})[service.dbId] || null;
  const steps = detail?.steps?.length ? detail.steps.map((x) => ({ title: x.title, items: x.items || [] })) : stepsFor(service);
  const description = detail?.description || featureFor(service);
  const inCart = s.cart.find((c) => c.id === service.id)?.qty || 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View>
          <Media item={service} height={260} />
          <View style={bx.floatBar}>
            <IconBtn icon="chevron-left" onPress={nav.back} style={bx.floatBtn} label="Quay lại" />
            <IconBtn icon="shopping-cart" badge={d.cartCount} onPress={() => nav.push('cart')} style={bx.floatBtn} label="Giỏ hàng" />
          </View>
        </View>

        <View style={bx.sheet}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primarySoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
              <AppIcon icon={catIcon(service.category)} size={13} color={C.primary} strokeWidth={2.2} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.primary }}>{catLabel(service.category)}</Text>
            </View>
            {isEstimate(service) ? <Badge text="Giá tham khảo" fg={C.orange} bg={C.orangeSoft} /> : null}
          </View>
          <Text style={bx.name}>{service.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            {ratingAvg != null ? <Stars value={Math.round(ratingAvg)} size={13} /> : null}
            <Text style={ui.meta}>
              {ratingCount ? `${ratingAvg} · ${ratingCount.toLocaleString('vi-VN')} đánh giá` : 'Chưa có đánh giá'}
            </Text>
          </View>
          <View style={bx.priceRow}>
            <Text style={bx.price}>{formatVND(service.price)}</Text>
            {discount > 0 ? <View style={bx.off}><Text style={bx.offText}>-{discount}%</Text></View> : null}
          </View>

          <View style={bx.trust}>
            {[
              { i: 'shield-check', t: 'Bảo hành', v: `${curTier.warrantyDays || 60} ngày` },
              { i: 'timer', t: 'Thời gian', v: isClean(service) ? durationText(service.id) : 'Theo khảo sát' },
              { i: 'navigation', t: 'Phí đi lại', v: 'Miễn phí' },
            ].map((x) => (
              <View key={x.t} style={bx.trustItem}>
                <AppIcon icon={x.i} size={20} color={C.primary} strokeWidth={2.1} />
                <Text style={bx.trustT}>{x.t}</Text>
                <Text style={bx.trustV}>{x.v}</Text>
              </View>
            ))}
          </View>
          {/* Ưu đãi Combo nhiều thiết bị */}
          <View style={{ marginTop: 12, padding: 12, borderRadius: R.md, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#F5D77A', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AppIcon name="flame" size={22} color="#D97706" strokeWidth={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: C.goldInk, fontSize: 13 }}>Ưu đãi Combo nhiều máy chuẩn Minh Đức</Text>
              <Text style={{ color: C.ink2, fontSize: 12, marginTop: 2 }}>Đặt 2 máy giảm thêm 5% (tối đa 50K) · Đặt từ 3 máy giảm thêm 10% (tối đa 120K)</Text>
            </View>
            <Btn title="Đặt 2 máy" small variant="gold" style={{ flexShrink: 0 }} onPress={() => nav.push('checkout', { items: [{ id: service.id, qty: 2 }] })} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <Card style={{ marginTop: 12 }} onPress={() => setShowMatPrice(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconBox icon="settings" size={42} bg={C.primarySoft} radius={13} />
              <View style={{ flex: 1 }}>
                <Text style={bx.h}>Bảng giá vật tư & linh kiện niêm yết Minh Đức</Text>
                <Text style={ui.meta}>
                  Công khai {catMaterials.length} hạng mục chính hãng · Chỉ thực hiện khi bạn duyệt
                  {curTier.partDiscountPercent ? ` · Hạng ${curTier.label} giảm thêm ${curTier.partDiscountPercent}%` : ''}
                </Text>
              </View>
              <Text style={ui.link}>Tra cứu ›</Text>
            </View>
          </Card>
          <Card style={{ marginTop: 12 }}>
            <Text style={bx.h}>Mô tả dịch vụ</Text>
            <Text style={bx.p} numberOfLines={more ? undefined : 4}>{description}</Text>
            <Tap onPress={() => setMore(!more)}><Text style={[ui.link, { marginTop: 8 }]}>{more ? 'Thu gọn ▲' : 'Xem thêm ▼'}</Text></Tap>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={bx.h}>Cam kết dịch vụ</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
              {COMMITMENTS.map((c, i) => (
                <View key={c.title} style={bx.commit}>
                  <View style={{ paddingTop: 2 }}><AppIcon icon={COMMIT_ICON[i]} size={18} color={C.primary} strokeWidth={2.1} /></View>
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
              <Tap style={bx.video} onPress={() => setShowVideo(true)}>
                <View style={bx.play}><AppIcon name="play" size={18} color={C.primary} fill={C.primary} strokeWidth={2} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{video.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>{video.sub}</Text>
                </View>
                <Badge text="Xem ›" fg="#fff" bg={C.primary} />
              </Tap>
            ) : null}
            {steps.map((st, i, arr) => (
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
              {ratingCount ? <Text style={[ui.meta, { fontWeight: '700' }]}>★ {ratingAvg}/5</Text> : null}
            </View>
            {reviews.length === 0 ? <Text style={bx.p}>Chưa có nhận xét. Hãy là người đầu tiên đánh giá sau khi dùng dịch vụ!</Text> : reviews.slice(0, 5).map((r, i) => (
              <View key={`${r.name}-${i}`} style={bx.review}>
                <View style={bx.rAvatar}><Text style={{ color: C.primary, fontWeight: '800' }}>{r.name.charAt(0)}</Text></View>
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
          <AppIcon name="shopping-cart" size={18} color={C.primary} strokeWidth={2.2} />
          <Text style={bx.dockCartText}>{inCart ? `Trong giỏ: ${inCart}` : 'Thêm giỏ'}</Text>
        </Tap>
        <Btn title={`Đặt ngay · ${formatVND(service.price)}`} style={{ flex: 1 }} onPress={() => nav.push('checkout', { items: [{ id: service.id, qty: 1 }] })} />
      </View>

      <Sheet
        visible={showVideo}
        onClose={() => setShowVideo(false)}
        title={video?.title || 'Quy trình thực hiện'}
        footer={(
          <Btn
            title={`Đặt dịch vụ này · ${formatVND(service.price)}`}
            onPress={() => { setShowVideo(false); nav.push('checkout', { items: [{ id: service.id, qty: 1 }] }); }}
          />
        )}
      >
        <View style={{ backgroundColor: C.navy, borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={bx.play}><Text style={{ color: C.primary, fontSize: 18, marginLeft: 3 }}>▶</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#93C5FD', fontWeight: '800', fontSize: 11 }}>TIÊU CHUẨN KỸ THUẬT THỢ MINH ĐỨC</Text>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, marginTop: 2 }}>{service.name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>⏱ Thời gian dự kiến: {video?.duration || '45 – 60 phút'}</Text>
            </View>
          </View>
        </View>
        {video?.tools?.length ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14, marginBottom: 8 }}>🧰 Dụng cụ & thiết bị chuyên dụng</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {video.tools.map((t) => (
                <Badge key={t} text={`✓ ${t}`} fg={C.primary} bg={C.primarySoft} />
              ))}
            </View>
          </View>
        ) : null}
        <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14, marginBottom: 10 }}>📋 Các bước thực hiện chuẩn tại nhà ({steps.length} bước)</Text>
        {steps.map((st, i) => (
          <View key={st.title} style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontWeight: '800', color: C.navy, fontSize: 13.5 }}>Bước {i + 1}: {st.title.replace(/^Bước\s+\d+:\s*/, '')}</Text>
            {st.items.map((it) => (
              <Text key={it} style={{ color: C.ink2, fontSize: 13, marginTop: 4, lineHeight: 18 }}>• {it}</Text>
            ))}
          </View>
        ))}
      </Sheet>

      <Sheet
        visible={showMatPrice}
        onClose={() => setShowMatPrice(false)}
        title={`Bảng giá vật tư · ${catLabel(service.category)}`}
        footer={<Btn title="Đã hiểu" onPress={() => setShowMatPrice(false)} />}
      >
        <View style={{ padding: 12, borderRadius: R.md, backgroundColor: C.primarySoft, marginBottom: 12 }}>
          <Text style={{ fontWeight: '800', color: C.primary, fontSize: 13 }}>🛡️ Cam kết minh bạch từ Thợ Minh Đức</Text>
          <Text style={{ color: C.ink2, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
            • Giá dịch vụ bạn đặt đã bao gồm 100% công thợ và phí đi lại.{'\n'}
            • Vật tư/linh kiện dưới đây chỉ phát sinh khi thiết bị thực sự cần thay thế và phải được bạn bấm “Đồng ý báo giá” trên ứng dụng.
          </Text>
          {curTier.partDiscountPercent ? (
            <Badge
              text={`👑 Đặc quyền hạng ${curTier.label}: Tự động giảm ${curTier.partDiscountPercent}% vật tư`}
              fg={curTier.color}
              bg="#fff"
              style={{ marginTop: 8, alignSelf: 'flex-start' }}
            />
          ) : null}
        </View>
        {catMaterials.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{m.name}</Text>
              <Text style={ui.meta}>Đơn vị tính: {m.unit} · Bảo hành chính hãng</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontWeight: '800', color: C.primary, fontSize: 14 }}>
                {formatVND(curTier.partDiscountPercent ? Math.round(m.price * (1 - curTier.partDiscountPercent / 100)) : m.price)}/{m.unit}
              </Text>
              {curTier.partDiscountPercent ? (
                <Text style={{ fontSize: 11, color: C.faint, textDecorationLine: 'line-through' }}>{formatVND(m.price)}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </Sheet>
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
        <EmptyState icon="shopping-cart" title="Giỏ hàng đang trống" body="Thêm dịch vụ bạn cần, chọn giờ và thợ Minh Đức sẽ đến tận nhà." action="Khám phá dịch vụ" onAction={() => nav.services()} style={{ flex: 1 }} />
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
  const {
    s, a, d, nav, ui: u, pendingVoucher, setPendingVoucher,
  } = useApp();
  const [items, setItems] = useState(params.items || []);
  const [note, setNote] = useState(() => noteFor((params.items || []).map((it) => ({ service: getService(it.id) }))));
  const [attachments, setAttachments] = useState([]);
  const [payment, setPayment] = useState(PAYMENTS[0]);
  const [showPay, setShowPay] = useState(false);
  const [showVoucher, setShowVoucher] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [voucher, setVoucher] = useState(null);
  const [showEmailOtp, setShowEmailOtp] = useState(false);
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailOtpErr, setEmailOtpErr] = useState('');
  const [sentOtpHint, setSentOtpHint] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  const days = nextDays(7);
  const now = new Date();
  const nowH = now.getHours();
  const nowM = now.getMinutes();
  const nowTotalM = nowH * 60 + nowM;

  const MIN_DAY_MINUTE = 8 * 60; // 08:00
  const MAX_DAY_MINUTE = 20 * 60; // 20:00

  // Đảm bảo thợ có ít nhất 45 phút chuẩn bị và di chuyển nếu đặt trong ngày hôm nay
  const getMinSelectable = (dIdx) => {
    if (dIdx > 0) return MIN_DAY_MINUTE;
    return Math.max(MIN_DAY_MINUTE, Math.ceil((nowTotalM + 45) / 15) * 15);
  };

  const [dayIdx, setDayIdx] = useState(1);
  const [timeMinutes, setTimeMinutes] = useState(() => {
    const minM = getMinSelectable(1);
    return Math.min(Math.max(14 * 60, minM), MAX_DAY_MINUTE);
  });
  const [slot, setSlot] = useState(() => minutesToSlotStr(14 * 60));

  const minAvailable = getMinSelectable(dayIdx);
  const isTodayOutOfSlots = dayIdx === 0 && minAvailable >= MAX_DAY_MINUTE;

  const handleDaySelect = (i) => {
    setDayIdx(i);
    const newMin = getMinSelectable(i);
    if (i === 0 && newMin >= MAX_DAY_MINUTE) {
      return;
    }
    const clamped = Math.min(Math.max(timeMinutes, newMin), MAX_DAY_MINUTE);
    setTimeMinutes(clamped);
    setSlot(minutesToSlotStr(clamped));
  };

  const handleTimeChange = (newMins, newSlotStr) => {
    setTimeMinutes(newMins);
    setSlot(newSlotStr);
  };

  const lines = items.map((it) => ({ ...it, svc: getService(it.id) })).filter((x) => x.svc);

  // Sheet thêm dịch vụ khác trực tiếp vào đơn đặt lịch
  const [showAddServiceSheet, setShowAddServiceSheet] = useState(false);
  const [svcSearch, setSvcSearch] = useState('');
  const [selectedSvcCat, setSelectedSvcCat] = useState('all');

  const availableServices = (ALL_SERVICES || []).filter((svc) => {
    if (selectedSvcCat !== 'all' && svc.category !== selectedSvcCat) return false;
    if (svcSearch.trim()) {
      const q = svcSearch.trim().toLowerCase();
      return (svc.name || '').toLowerCase().includes(q) || (svc.category || '').toLowerCase().includes(q);
    }
    return true;
  });

  const [siteConditionId, setSiteConditionId] = useState(SITE_CONDITIONS[0].id);
  const selectedSite = SITE_CONDITIONS.find((sc) => sc.id === siteConditionId) || SITE_CONDITIONS[0];
  const curTier = tierOf(s.lifetimePoints || 0).cur;

  const addAttachment = async () => {
    if (attachments.length >= 5) { u.alert('Giới hạn ảnh', 'Bạn chỉ đính kèm tối đa 5 ảnh cho yêu cầu.', '📷'); return; }
    const uri = await pickImage();
    if (uri === null) { u.alert('Chưa hỗ trợ', 'Chọn ảnh đang khả dụng trên bản web.', '📷'); return; }
    if (!uri) return;
    setAttachments((p) => [...p, { id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, uri, at: Date.now() }]);
  };

  const goods = lines.reduce((sum, x) => sum + (x.svc.oldPrice || x.svc.price) * x.qty, 0);
  const productDiscount = lines.reduce((sum, x) => sum + ((x.svc.oldPrice || x.svc.price) - x.svc.price) * x.qty, 0);
  const combo = comboDiscountFor(lines);
  const subtotal = Math.max(0, goods - productDiscount - combo.amount);
  const vDiscount = voucherDiscount(voucher, subtotal);
  const total = Math.max(0, subtotal - vDiscount);
  const allVouchers = [...(s.myVouchers || []), ...(s.publicVouchers || [])];

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
    if (!v) { u.alert('Mã không hợp lệ', 'Kiểm tra lại mã, hoặc chọn voucher trong ví / mã ưu đãi đang mở ở mục Quyền lợi.', '🎟️'); return; }
    if (v.min && subtotal < v.min) { u.alert('Chưa đủ điều kiện', `${v.code} áp dụng cho đơn từ ${formatVND(v.min)}. Đơn hiện tại ${formatVND(subtotal)}.`, '🎟️'); return; }
    setVoucher(v); setVoucherInput(v.code); setShowVoucher(false);
    u.toast(`Đã áp dụng ${v.code}`, '🎟️');
  };

  const handleSendEmailOtp = async () => {
    setOtpSending(true);
    setEmailOtpErr('');
    try {
      const res = await a.sendEmailOtp();
      if (res.ok) {
        if (res.alreadyVerified) {
          setShowEmailOtp(false);
        } else if (res.otpCode) {
          setSentOtpHint(res.otpCode);
        }
      } else {
        setEmailOtpErr(res.error || 'Không thể gửi mã OTP.');
      }
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    setOtpVerifying(true);
    setEmailOtpErr('');
    try {
      const res = await a.verifyEmailOtp(emailOtpInput);
      if (res.ok) {
        setShowEmailOtp(false);
        setEmailOtpInput('');
        setSentOtpHint('');
      } else {
        setEmailOtpErr(res.error || 'Mã OTP không chính xác.');
      }
    } finally {
      setOtpVerifying(false);
    }
  };

  const confirm = () => {
    if (s.auth?.role === 'customer' && !s.auth.emailVerified) {
      setShowEmailOtp(true);
      if (!sentOtpHint) handleSendEmailOtp();
      return;
    }
    if (!d.address) {
      u.dialog({
        icon: '📍', title: 'Chưa có địa chỉ', message: 'Thêm địa chỉ để thợ biết nơi đến phục vụ bạn.',
        actions: [{ label: 'Để sau', variant: 'ghost' }, { label: 'Thêm địa chỉ', onPress: () => nav.push('address-form', { useNow: true }) }],
      });
      return;
    }
    if (dayIdx === 0 && isTodayOutOfSlots) {
      u.alert('Hết giờ phục vụ', 'Hôm nay thợ đã kết thúc nhận ca. Quý khách vui lòng chuyển sang Ngày mai.', '⏰');
      return;
    }
    if (dayIdx === 0 && timeMinutes < minAvailable) {
      u.alert('Giờ hẹn quá gần', 'Vui lòng chọn khung giờ cách hiện tại ít nhất 45 phút để thợ kịp di chuyển.', '⏰');
      return;
    }

    const code = a.placeOrder({
      items: lines.map(({ id, qty }) => ({ id, qty })),
      device: { category: lines[0]?.svc?.category || null },
      siteCondition: selectedSite,
      comboDiscount: combo.amount,
      comboLabel: combo.label,
      goods, productDiscount, voucher: voucher ? { ...voucher } : null, voucherDiscount: vDiscount, total,
      dateLabel: `${days[dayIdx].label} (${days[dayIdx].ddmm})`, dateKey: days[dayIdx].key, slot, payment, note, workerCode: '',
      attachments, fromCart: !!params.fromCart,
    });
    if (code) nav.replace('success', { code });
  };

  if (!lines.length) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Xác nhận đặt lịch" />
        <EmptyState icon="receipt-text" title="Chưa có dịch vụ" body="Hãy chọn ít nhất một dịch vụ." action="Chọn dịch vụ" onAction={() => nav.services()} style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Xác nhận đặt lịch" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* Cảnh báo xác thực Email chống đơn ảo */}
        {s.auth?.role === 'customer' && !s.auth.emailVerified ? (
          <Card
            style={{
              marginBottom: 14,
              borderColor: '#F59E0B',
              borderWidth: 1.5,
              backgroundColor: '#FFFBEB',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
            onPress={() => {
              setShowEmailOtp(true);
              if (!sentOtpHint) handleSendEmailOtp();
            }}
          >
            <IconBox icon="mail" size={42} bg="#FEF3C7" radius={13} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: '#92400E', fontSize: 14 }}>
                Bắt buộc xác thực Email trước khi đặt lịch
              </Text>
              <Text style={{ color: '#B45309', fontSize: 12.5, marginTop: 2, lineHeight: 18 }}>
                Email <Text style={{ fontWeight: '800' }}>{s.user?.email || s.auth?.email}</Text> chưa xác thực OTP 6 chữ số.
              </Text>
            </View>
            <Badge text="Xác thực ›" fg="#fff" bg="#D97706" />
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 4 }}>
            <AppIcon name="check-circle-2" size={14} color={C.green} strokeWidth={2.3} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green }}>
              Email đặt lịch đã xác thực ({s.user?.email || s.auth?.email})
            </Text>
          </View>
        )}

        {/* Địa chỉ */}
        {d.address ? (
          <Card style={{ flexDirection: 'row', gap: 12 }} onPress={() => nav.push('addresses', { select: true })}>
            <IconBox icon="map-pin" size={42} bg={C.redSoft} radius={13} />
            <View style={{ flex: 1 }}>
              <Text style={bx.addrName}>{d.address.gender === 'Nữ' ? 'Chị' : 'Anh'} {d.address.name} · {d.address.phone}</Text>
              <Text style={[bx.p, { marginTop: 2 }]} numberOfLines={2}>{d.address.full}</Text>
            </View>
            <Text style={ui.link}>Đổi</Text>
          </Card>
        ) : (
          <Tap style={bx.addAddr} onPress={() => nav.push('address-form', { useNow: true })}>
            <IconBox icon="map-pin" size={40} bg={C.primarySoft} radius={12} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.primary, fontWeight: '800', fontSize: 15 }}>Thêm địa chỉ nhận dịch vụ</Text>
              <Text style={ui.meta}>Bắt buộc để thợ đến đúng nhà</Text>
            </View>
            <AppIcon name="chevron-right" size={18} color={C.faint} />
          </Tap>
        )}

        {/* Lịch hẹn */}
        <Text style={bx.sec}>Thời gian thực hiện</Text>
        <HScroll contentContainerStyle={{ gap: 8 }}>
          {days.map((dd, i) => (
            <Tap key={dd.ddmm} onPress={() => handleDaySelect(i)} style={[bx.day, dayIdx === i && bx.dayOn]}>
              <Text style={[bx.dayLabel, dayIdx === i && { color: 'rgba(255,255,255,0.8)' }]}>{dd.label}</Text>
              <Text style={[bx.dayDate, dayIdx === i && { color: '#fff' }]}>{dd.ddmm}</Text>
            </Tap>
          ))}
        </HScroll>
        <TimeRangeSlider
          value={timeMinutes}
          onChange={handleTimeChange}
          minMinutes={minAvailable}
          maxMinutes={MAX_DAY_MINUTE}
          step={15}
          isToday={dayIdx === 0}
          onSelectTomorrow={() => handleDaySelect(1)}
        />

        {/* Dịch vụ */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
          <Text style={[bx.sec, { marginTop: 0, marginBottom: 0 }]}>Dịch vụ yêu cầu ({lines.length})</Text>
          <Tap onPress={() => setShowAddServiceSheet(true)}>
            <Text style={ui.link}>＋ Thêm dịch vụ</Text>
          </Tap>
        </View>
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

        <Tap
          onPress={() => setShowAddServiceSheet(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: 10, paddingHorizontal: 14, borderRadius: R.md,
            borderWidth: 1.5, borderColor: C.primary, borderStyle: 'dashed',
            backgroundColor: C.primarySoft, marginBottom: 14,
          }}
        >
          <Text style={{ fontSize: 16, color: C.primary, fontWeight: '800' }}>＋</Text>
          <Text style={{ fontSize: 13, color: C.primary, fontWeight: '700' }}>Chọn thêm dịch vụ khác vào đơn này</Text>
        </Tap>

        <Field label="Mô tả tình trạng thiết bị" multiline value={note} onChangeText={setNote} placeholder="VD: Máy lạnh chảy nước, kém lạnh…" />

        {/* Điều kiện vị trí thi công chuẩn Minh Đức */}
        <Text style={[bx.sec, { marginTop: 16, marginBottom: 8 }]}>Vị trí & điều kiện thi công</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SITE_CONDITIONS.map((sc) => (
            <Chip
              key={sc.id}
              label={sc.label}
              on={siteConditionId === sc.id}
              onPress={() => setSiteConditionId(sc.id)}
            />
          ))}
        </View>
        <Text style={[ui.meta, { marginTop: 6 }]}>{selectedSite.note}</Text>

        <Text style={[bx.sec, { marginTop: 14 }]}>Hình ảnh hiện trạng (tùy chọn)</Text>
        <Text style={[ui.meta, { marginBottom: 8 }]}>Gửi ảnh lỗi hoặc vị trí lắp đặt để thợ chuẩn bị vật tư phù hợp (tối đa 5 ảnh).</Text>
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

        <SelectRow
          label="Mã giảm giá"
          value={voucher ? `${voucher.code} · -${formatVND(vDiscount)}` : ''}
          placeholder={`Chọn hoặc nhập mã (${allVouchers.length} mã)`}
          onPress={() => setShowVoucher(true)}
        />
        {voucher && !vDiscount ? <Text style={ui.fieldErr}>Mã {voucher.code} chưa đủ điều kiện với đơn hiện tại.</Text> : null}
        {voucher ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Badge text="MÃ ÁP DỤNG" fg="#166534" bg="#DCFCE7" />
              <Text style={{ fontSize: 13, color: '#166534', fontWeight: '700' }}>
                {voucher.code} (-{formatVND(vDiscount)})
              </Text>
            </View>
            <Tap
              onPress={() => {
                const oldCode = voucher.code;
                setVoucher(null);
                setVoucherInput('');
                u.toast(`Đã huỷ mã ${oldCode}`);
              }}
              hitSlop={8}
              style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}
            >
              <Text style={{ color: C.red, fontWeight: '700', fontSize: 12 }}>✕ Huỷ mã</Text>
            </Tap>
          </View>
        ) : null}
        <SelectRow
          label="Phương thức thanh toán"
          value={payment}
          onPress={() => setShowPay(true)}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', padding: 10, borderRadius: R.md, borderWidth: 1, borderColor: '#DCFCE7', marginTop: -4, marginBottom: 8 }}>
          <Badge text="0đ TRẢ TRƯỚC" fg="#166534" bg="#DCFCE7" />
          <Text style={{ fontSize: 11.5, color: '#166534', fontWeight: '600', flex: 1, lineHeight: 16 }}>
            Chỉ thanh toán sau khi thợ hoàn tất và kiểm tra máy chạy êm ái.
          </Text>
        </View>

        <Card style={{ marginTop: 18 }}>
          <Text style={bx.h}>Chi tiết thanh toán</Text>
          <Row l="Tổng tiền dịch vụ" v={formatVND(goods)} />
          <Row l="Phí đi lại" v="Miễn phí" green />
          {productDiscount ? <Row l="Giảm giá dịch vụ" v={`-${formatVND(productDiscount)}`} green /> : null}
          {combo.amount ? <Row l={`Ưu đãi ${combo.label}`} v={`-${formatVND(combo.amount)}`} green /> : null}
          {vDiscount ? <Row l={`Voucher ${voucher.code}`} v={`-${formatVND(vDiscount)}`} green /> : null}
          <View style={bx.totalRow}>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>Tổng thanh toán</Text>
            <Text style={[bx.price, { fontSize: 20 }]}>{formatVND(total)}</Text>
          </View>
          <View style={{ marginTop: 10, padding: 10, borderRadius: R.md, backgroundColor: curTier.bg || C.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Badge text={curTier.label} fg={curTier.color} bg="#FFFFFF" />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: curTier.color, lineHeight: 17 }}>
              Bảo hành tiêu chuẩn {curTier.warrantyDays || 60} ngày
              {curTier.partDiscountPercent ? ` · Giảm ${curTier.partDiscountPercent}% vật tư phát sinh` : ''}
            </Text>
          </View>
          <Text style={[ui.meta, { color: C.muted, marginTop: 8 }]}>Tích luỹ +{Math.max(1, Math.floor(total / 10000))} điểm khi hoàn tất</Text>
        </Card>
      </ScrollView>

      <View style={bx.dockCol}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: C.ink2, fontWeight: '700', flex: 1 }} numberOfLines={1}>{days[dayIdx].label} · {slot}</Text>
          <Text style={[bx.price, { fontSize: 20 }]}>{formatVND(total)}</Text>
        </View>
        <Btn
          title={s.auth?.role === 'customer' && !s.auth.emailVerified ? 'Xác thực Email để đặt lịch' : 'Xác nhận đặt lịch'}
          onPress={confirm}
        />
      </View>

      <Sheet
        visible={showEmailOtp}
        onClose={() => setShowEmailOtp(false)}
        title="Xác thực Email đặt dịch vụ"
        footer={(
          <Btn
            title={otpVerifying ? 'Đang kiểm tra...' : 'Xác nhận mã OTP'}
            disabled={otpVerifying}
            onPress={handleVerifyEmailOtp}
          />
        )}
      >
        <Text style={{ color: C.ink2, lineHeight: 20, marginBottom: 12 }}>
          Để ngăn chặn đơn hàng ảo và gửi hóa đơn/phiếu bảo hành điện tử chính xác, vui lòng nhập mã OTP 6 chữ số gửi tới địa chỉ Email:{' '}
          <Text style={{ fontWeight: '800', color: C.ink }}>{s.user?.email || s.auth?.email}</Text>
        </Text>
        <View
          style={{
            padding: 12,
            borderRadius: R.md,
            backgroundColor: '#EFF6FF',
            borderWidth: 1,
            borderColor: '#BFDBFE',
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 12.5, color: '#1E40AF', fontWeight: '700' }}>Kiểm tra hộp thư Email</Text>
          <Text style={{ fontSize: 12, color: '#3B82F6', marginTop: 2 }}>
            Mã xác thực 6 chữ số đã được gửi tới {s.user?.email || s.auth?.email} (hiệu lực 5 phút).
          </Text>
        </View>
        <Field
          label="Mã xác thực OTP (6 chữ số)"
          value={emailOtpInput}
          onChangeText={(t) => { setEmailOtpInput(t.replace(/\D/g, '').slice(0, 6)); setEmailOtpErr(''); }}
          keyboardType="number-pad"
          placeholder="Nhập 6 chữ số (VD: 123456)"
          error={emailOtpErr}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <Text style={ui.meta}>Mã có hiệu lực trong 5 phút</Text>
          <Tap onPress={handleSendEmailOtp} disabled={otpSending}>
            <Text style={ui.link}>{otpSending ? 'Đang gửi...' : 'Gửi lại mã OTP'}</Text>
          </Tap>
        </View>
      </Sheet>

      <Sheet visible={showPay} onClose={() => setShowPay(false)} title="Phương thức thanh toán">
        <View style={{ marginBottom: 12 }}>
          <Text style={[ui.meta, { lineHeight: 18 }]}>
            Chọn hình thức thanh toán bạn mong muốn. Tiền chỉ được thu sau khi thợ hoàn thành sửa chữa & nghiệm thu máy chạy tốt.
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          {PAYMENT_METHODS.map((pm) => {
            const on = payment === pm.label;
            return (
              <Tap
                key={pm.id}
                onPress={() => {
                  setPayment(pm.label);
                  setShowPay(false);
                  u.toast(`Đã chọn: ${pm.shortLabel || pm.label}`);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
                  borderRadius: R.md, borderWidth: 1.5, borderColor: on ? C.primary : C.line,
                  backgroundColor: on ? '#F6FAFF' : '#fff',
                }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: on ? C.primarySoft : '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                  <AppIcon icon={pm.icon} size={22} color={on ? C.primary : C.ink2} strokeWidth={2.1} />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontWeight: '800', fontSize: 13.5, color: on ? C.primary : C.ink }}>
                      {pm.label}
                    </Text>
                    {pm.badge ? (
                      <Badge text={pm.badge} fg={pm.badgeFg || '#fff'} bg={pm.badgeBg || C.primary} style={{ paddingHorizontal: 6, paddingVertical: 1 }} />
                    ) : null}
                  </View>
                  <Text style={[ui.meta, { fontSize: 11.5, marginTop: 3, lineHeight: 16 }]}>
                    {pm.desc}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.green, fontWeight: '700', marginTop: 3 }}>
                    ✓ {pm.timing}
                  </Text>
                </View>

                <Radio on={on} />
              </Tap>
            );
          })}
        </View>

        <View style={{ marginTop: 14, padding: 10, borderRadius: R.md, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16 }}>🛡️</Text>
          <Text style={{ flex: 1, fontSize: 11.5, color: '#166534', lineHeight: 16, fontWeight: '600' }}>
            Cam kết an tâm: 0đ trả trước. Khách hàng chỉ thanh toán khi đã nghiệm thu hài lòng và thợ ký biên bản hoàn tất.
          </Text>
        </View>
      </Sheet>
      <Sheet visible={showVoucher} onClose={() => setShowVoucher(false)} title="Mã giảm giá">
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Field value={voucherInput} onChangeText={setVoucherInput} placeholder="Nhập mã giảm giá" autoCapitalize="characters" style={{ flex: 1 }} />
          <Btn title="Áp dụng" onPress={() => applyVoucher(voucherInput)} style={{ minHeight: 52, paddingHorizontal: 18 }} />
        </View>
        <Text style={[bx.sec, { marginTop: 18 }]}>Mã có thể dùng</Text>
        {voucher ? (
          <Tap
            onPress={() => {
              const oldCode = voucher.code;
              setVoucher(null);
              setVoucherInput('');
              setShowVoucher(false);
              u.toast(`Đã huỷ mã ${oldCode}`);
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              padding: 12, borderRadius: R.md, borderWidth: 1.5, borderColor: '#FCA5A5',
              backgroundColor: '#FEF2F2', marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16 }}>🚫</Text>
              <Text style={{ fontWeight: '700', color: C.red, fontSize: 13 }}>
                Không sử dụng mã giảm giá (Huỷ mã {voucher.code})
              </Text>
            </View>
            <Text style={{ color: C.red, fontWeight: '800', fontSize: 12.5 }}>✕ Bỏ chọn</Text>
          </Tap>
        ) : null}
        {allVouchers.map((v) => {
          const ok = !v.min || subtotal >= v.min;
          const isSelected = voucher?.code === v.code;
          return (
            <Tap
              key={v.code}
              style={[
                bx.voucher,
                !ok && { opacity: 0.5 },
                isSelected && { borderColor: C.primary, backgroundColor: C.primarySoft, borderWidth: 1.5 },
              ]}
              onPress={() => {
                if (isSelected) {
                  setVoucher(null);
                  setVoucherInput('');
                  setShowVoucher(false);
                  u.toast(`Đã huỷ mã ${v.code}`);
                } else {
                  applyVoucher(v.code);
                }
              }}
            >
              <View style={[bx.vLeft, v.wallet && { backgroundColor: C.gold }]}>
                <AppIcon icon={v.wallet ? 'gift' : 'ticket'} size={22} color={v.wallet ? '#fff' : C.primary} strokeWidth={2.1} />
              </View>
              <View style={{ flex: 1, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontWeight: '800', color: C.ink }}>{v.code}</Text>
                  {isSelected ? <Badge text="Đang chọn" fg="#fff" bg={C.primary} style={{ paddingHorizontal: 5, paddingVertical: 1 }} /> : null}
                </View>
                <Text style={ui.meta}>{v.label}</Text>
                {v.wallet ? <Text style={[ui.meta, { color: C.goldInk, fontWeight: '700' }]}>Ví của bạn</Text> : null}
                {!ok ? <Text style={[ui.meta, { color: C.red }]}>Cần thêm {formatVND(v.min - subtotal)}</Text> : null}
              </View>
              <View style={{ paddingRight: 12 }}><Radio on={isSelected} /></View>
            </Tap>
          );
        })}
      </Sheet>

      {/* Sheet Thêm dịch vụ khác vào đơn đặt lịch */}
      <Sheet visible={showAddServiceSheet} onClose={() => setShowAddServiceSheet(false)} title="Thêm dịch vụ vào đơn">
        <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={[ui.meta, { marginBottom: 10 }]}>
            Chọn thêm các dịch vụ vệ sinh, bảo dưỡng, nạp gas để thợ xử lý trọn gói cùng lúc (áp dụng ưu đãi combo giảm tới 10%).
          </Text>

          {/* Tìm kiếm */}
          <Field
            value={svcSearch}
            onChangeText={setSvcSearch}
            placeholder="🔍 Tìm tên dịch vụ (VD: Sạc gas, Vệ sinh...)"
            style={{ marginBottom: 10 }}
          />

          {/* Phân loại danh mục */}
          <HScroll contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
            <Chip
              label="Tất cả"
              on={selectedSvcCat === 'all'}
              onPress={() => setSelectedSvcCat('all')}
            />
            {CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                icon={c.icon}
                label={c.label}
                on={selectedSvcCat === c.id}
                onPress={() => setSelectedSvcCat(c.id)}
              />
            ))}
          </HScroll>

          {/* Danh sách dịch vụ khả dụng */}
          <View style={{ gap: 10 }}>
            {availableServices.length === 0 ? (
              <Text style={[ui.meta, { textAlign: 'center', paddingVertical: 20 }]}>Không tìm thấy dịch vụ phù hợp.</Text>
            ) : (
              availableServices.map((svc) => {
                const existing = items.find((it) => it.id === svc.id);
                const curQty = existing?.qty || 0;
                return (
                  <Card
                    key={svc.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
                      borderColor: curQty > 0 ? C.primary : C.line,
                      backgroundColor: curQty > 0 ? '#F6FAFF' : '#fff',
                    }}
                  >
                    <Media item={svc} height={48} width={48} radius={10} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', fontSize: 13, color: C.ink }} numberOfLines={2}>
                        {svc.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Text style={[ui.price, { fontSize: 13 }]}>{formatVND(svc.price)}</Text>
                        {svc.warranty ? (
                          <Badge text={svc.warranty} fg={C.primary} bg={C.primarySoft} style={{ paddingHorizontal: 5, paddingVertical: 1 }} />
                        ) : null}
                      </View>
                    </View>

                    {curQty > 0 ? (
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Stepper
                          value={curQty}
                          onChange={(q) => {
                            if (q <= 0) {
                              setItems((p) => p.filter((it) => it.id !== svc.id));
                            } else {
                              setItems((p) => p.map((it) => (it.id === svc.id ? { ...it, qty: q } : it)));
                            }
                          }}
                        />
                        <Text style={{ fontSize: 10.5, color: C.green, fontWeight: '700' }}>✓ Đã chọn ({curQty})</Text>
                      </View>
                    ) : (
                      <Btn
                        title="＋ Thêm"
                        variant="soft"
                        small
                        onPress={() => {
                          setItems((p) => [...p, { id: svc.id, qty: 1 }]);
                          u.toast(`Đã thêm ${svc.name}`, '✅');
                        }}
                      />
                    )}
                  </Card>
                );
              })
            )}
          </View>

          <Btn
            title={`Xong (${lines.length} dịch vụ · ${formatVND(total)})`}
            icon="✓"
            onPress={() => setShowAddServiceSheet(false)}
            style={{ marginTop: 16, marginBottom: 12 }}
          />
        </ScrollView>
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
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 40, paddingBottom: 32 }}>
      <View style={bx.successIcon}><AppIcon name="check" size={48} color="#fff" strokeWidth={3} /></View>
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
          <EmptyState icon="map-pin" title="Chưa có địa chỉ" body="Thêm địa chỉ để thợ Minh Đức đến đúng nhà và phục vụ bạn." action="Thêm địa chỉ mới" onAction={() => nav.push('address-form', { useNow: selectMode })} />
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
    const nameErr = validateContactName(name);
    if (nameErr) e.name = nameErr;

    const phoneErr = validateVietnamesePhone(phone);
    if (phoneErr) e.phone = phoneErr;

    const streetErr = validateStreetAddress(street);
    if (streetErr) e.street = streetErr;

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
            placeholder="Tên người liên hệ (VD: Nguyễn Văn An)"
            error={err.name}
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
            placeholder="10 chữ số (bắt đầu bằng 03, 05, 07, 08, 09)"
            error={err.phone}
          />
        </Card>
        <Card style={{ marginTop: 12 }}>
          <Text style={bx.h}>Địa chỉ</Text>
          <SelectRow label="Khu vực" icon="🗺️" value={area} onPress={() => setShowArea(true)} />
          <Field
            label="Số nhà, tên đường"
            value={street}
            onChangeText={(t) => {
              setStreet(t);
              if (err.street) setErr((prev) => ({ ...prev, street: '' }));
            }}
            onBlur={() => {
              if (street.trim()) {
                const streetErr = validateStreetAddress(street);
                if (streetErr) setErr((prev) => ({ ...prev, street: streetErr }));
              }
            }}
            placeholder="VD: Số 12 ngõ 45 hoặc 128 Trần Duy Hưng"
            error={err.street}
          />
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
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  rail: { width: 2, flex: 1, backgroundColor: '#DCE5F5', marginVertical: 3 },
  stepT: { fontSize: 14, fontWeight: '800', color: C.ink, marginTop: 3 },
  stepI: { fontSize: 13, color: C.ink2, lineHeight: 19, marginTop: 2 },
  review: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F0F3F8' },
  rAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rName: { fontSize: 14, fontWeight: '800', color: C.ink },
  dock: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  dockCart: { minHeight: 48, paddingHorizontal: 14, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
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

