import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { C, R, shadow, toneOf, STATUS_META, grad } from '../../theme';
import {
  CATEGORIES, SERVICES, REPAIR_SERVICES, LIFETIME_SERVICES, SERVICE_TYPES, CAT_SHORT,
  formatVND, getService, catLabel, catIcon, tierOf, HOTLINE,
} from '../../constants/data';
import { APP_VERSION } from '../../constants';
import { useApp, warrantyInfo, fmtDate, isActiveOrder, orderTotal, formatOrderTotal, customerStatusMeta, isPaid } from '../../context';
import {
  Tap, Btn, IconBtn, IconBox, Card, PageHead, Pills, Chip, Segmented, ServiceGrid, EmptyState, Field, Badge,
  StatusChip, Progress, Media, ListRow, Sheet, ui, HScroll, AppIcon, WarrantyBookingSheet, ActivityTimeFilterSheet,
} from '../../components';
import {
  vnDateKey,
  ACTIVITY_TIME_PRESETS,
  DEFAULT_ACTIVITY_TIME_FILTER,
  describeTimeFilter,
  filterAndSortOrders,
  formatDmyFromYmd,
  formatShortDmFromYmd,
  getTimePresetBounds,
  isTimeFilterActive,
  normalizeVnPhone,
} from '../../utils';

// =========================================================== DỊCH VỤ
export function ServicesScreen() {
  const { s, d, nav, svc, setSvc } = useApp();
  const kindAll = svc.tab === 'sua-chua' ? REPAIR_SERVICES : svc.tab === 'tron-doi' ? LIFETIME_SERVICES : null;
  const kindCats = kindAll ? CATEGORIES.filter((c) => kindAll.some((x) => x.category === c.id)) : [];
  const list = useMemo(() => {
    let l = SERVICES.filter((x) => x.category === svc.category);
    if (kindAll) l = svc.kindCat === 'all' ? kindAll : kindAll.filter((x) => x.category === svc.kindCat);
    if (svc.sort === 'asc') l = [...l].sort((x, y) => x.price - y.price);
    if (svc.sort === 'desc') l = [...l].sort((x, y) => y.price - x.price);
    return l;
  }, [svc, kindAll, s.catalogVersion]);
  const type = SERVICE_TYPES.find((t) => t.id === svc.tab);

  return (
    <View style={{ flex: 1 }}>
      <PageHead
        title="Dịch vụ"
        sub="Thợ đến tận nhà · Báo giá minh bạch"
        right={(
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconBtn icon="search" onPress={() => nav.push('search')} label="Tìm kiếm" />
            <IconBtn icon="shopping-cart" badge={d.cartCount} onPress={() => nav.push('cart')} label="Giỏ hàng" />
          </View>
        )}
      />
      <View style={{ backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Pills items={SERVICE_TYPES} value={svc.tab} onChange={(id) => setSvc((p) => ({ ...p, tab: id }))} />
      </View>

      {svc.tab === 'bao-hanh' ? <WarrantyView /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          {svc.tab === 'bao-duong' ? (
            <HScroll contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, gap: 10 }}>
              {/* Chỉ danh mục có dịch vụ bảo dưỡng (danh mục backend có thể chỉ có dịch vụ sửa chữa) */}
              {CATEGORIES.filter((c) => SERVICES.some((x) => x.category === c.id)).map((c) => {
                const on = svc.category === c.id;
                const tone = toneOf(c.id);
                return (
                  <Tap key={c.id} onPress={() => setSvc((p) => ({ ...p, category: c.id }))} style={[sx.catTile, on && { borderColor: tone.fg, backgroundColor: tone.bg }]}>
                    <AppIcon icon={c.icon} size={24} color={on ? tone.fg : C.ink2} strokeWidth={2} />
                    {/* Cho phép xuống dòng sau dấu "/" (vd. "Máy nước nóng/Bồn nước") để chữ không bị cắt giữa từ */}
                    <Text style={[sx.catTileText, on && { color: tone.fg }]} numberOfLines={2}>{String(CAT_SHORT[c.id] || c.label || '').replace(/\s*\/\s*/g, '/\u200B')}</Text>
                  </Tap>
                );
              })}
            </HScroll>
          ) : (
            <View>
              <View style={sx.notice}>
                <AppIcon icon={type?.icon || 'info'} size={18} color={C.primary} strokeWidth={2.2} />
                <Text style={sx.noticeText}>Giá hiển thị là giá tham khảo. Thợ khảo sát thực tế và chỉ làm khi bạn đồng ý báo giá.</Text>
              </View>
              <Pills
                style={{ marginTop: 12 }}
                value={svc.kindCat}
                onChange={(id) => setSvc((p) => ({ ...p, kindCat: id }))}
                items={[{ id: 'all', label: 'Tất cả' }, ...kindCats.map((c) => ({ id: c.id, label: CAT_SHORT[c.id], icon: c.icon }))]}
              />
            </View>
          )}

          <View style={sx.toolbar}>
            <Text style={sx.count}>{list.length} dịch vụ{svc.tab === 'bao-duong' ? ` · ${catLabel(svc.category)}` : ` · ${type?.label}${svc.kindCat !== 'all' ? ` ${CAT_SHORT[svc.kindCat]?.toLowerCase() || ''}` : ''}`}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[{ id: 'popular', label: 'Phổ biến' }, { id: 'asc', label: 'Giá ↑' }, { id: 'desc', label: 'Giá ↓' }].map((o) => (
                <Tap key={o.id} onPress={() => setSvc((p) => ({ ...p, sort: o.id }))} style={[sx.sort, svc.sort === o.id && sx.sortOn]}>
                  <Text style={[sx.sortText, svc.sort === o.id && { color: C.primary }]}>{o.label}</Text>
                </Tap>
              ))}
            </View>
          </View>
          <ServiceGrid data={list} style={{ paddingHorizontal: 16 }} />
        </ScrollView>
      )}
    </View>
  );
}

function WarrantyView() {
  const { s, a, nav, ui: u, warrantyQuery, setWarrantyQuery, warrantyNonce } = useApp();
  const [result, setResult] = useState(null);
  // Đơn còn hạn bảo hành, kể cả đơn đã gửi yêu cầu (để hiện trạng thái "đang xử lý")
  const eligible = s.orders.filter((o) => { const w = warrantyInfo(o, s.orders, s.lifetimePoints); return w.ok || w.openCode; });

  const lookup = (q = warrantyQuery) => {
    const raw = q.replace(/\s/g, '');
    const t = raw.toUpperCase();
    if (!t) { setResult({ error: 'Nhập số điện thoại hoặc mã đơn hàng.' }); return; }
    const normQueryPhone = normalizeVnPhone(raw);
    const isPhoneQuery = /^\+?\d+$/.test(raw) && normQueryPhone.length >= 9;
    // Số điện thoại của chính tài khoản (hồ sơ hoặc sổ địa chỉ) → hiện mọi đơn của tài khoản này
    const isMine = isPhoneQuery && (
      (s.user.phone && normalizeVnPhone(s.user.phone) === normQueryPhone) ||
      s.addresses.some((ad) => ad.phone && normalizeVnPhone(ad.phone) === normQueryPhone)
    );
    const found = s.orders.filter((o) => (
      o.kind !== 'warranty' &&
      (isMine || o.code === t || (isPhoneQuery && o.address?.phone && normalizeVnPhone(o.address.phone) === normQueryPhone))
    ));
    if (!found.length) { setResult({ error: 'Không tìm thấy đơn khớp. Kiểm tra lại số điện thoại hoặc mã đơn ở tab Hoạt động.' }); return; }
    setResult({ orders: found });
  };
  React.useEffect(() => {
    if (warrantyQuery) lookup(warrantyQuery); else setResult(null);
  }, [warrantyNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const [bookingOrder, setBookingOrder] = useState(null);
  const request = (o) => setBookingOrder(o);

  const OrderLine = ({ o }) => {
    const info = warrantyInfo(o, s.orders, s.lifetimePoints);
    const svc0 = getService((o.items || [])[0]?.id);
    return (
      <Card style={{ marginTop: 10 }}>
        <Tap style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => nav.push('order', { code: o.code })}>
          <Media item={svc0} height={48} width={48} radius={12} />
          <View style={{ flex: 1 }}>
            <Text style={sx.oName} numberOfLines={1}>{svc0?.name}</Text>
            <Text style={ui.meta}>{o.code} · {fmtDate(o.createdAt)}</Text>
          </View>
          <StatusChip status={o.status} />
        </Tap>
        <View style={[sx.wInfo, { backgroundColor: info.ok ? C.greenSoft : info.pending ? C.orangeSoft : '#F1F4F9', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <AppIcon name={info.ok ? 'shield-check' : 'info'} size={16} color={info.ok ? C.green : info.pending ? C.orange : C.muted} strokeWidth={2.2} />
          <Text style={{ color: info.ok ? C.green : info.pending ? C.orange : C.muted, fontWeight: '700', fontSize: 13, flex: 1 }}>
            {info.text}
          </Text>
        </View>
        {info.ok ? <Btn title="Yêu cầu bảo hành" icon="shield-check" small variant="soft" style={{ marginTop: 10 }} onPress={() => request(o)} /> : null}
        {info.openCode ? <Btn title={`Xem đơn bảo hành ${info.openCode}`} icon="eye" small variant="outline" style={{ marginTop: 10 }} onPress={() => nav.push('order', { code: info.openCode })} /> : null}
      </Card>
    );
  };

  const curTier = tierOf(s.lifetimePoints || 0).cur;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <View style={sx.wHero}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.gold, fontWeight: '800', fontSize: 12 }}>BẢO HÀNH {curTier.warrantyDays || 60} NGÀY · HẠNG {curTier.label.toUpperCase()}</Text>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 19, marginTop: 4 }}>Tra cứu & yêu cầu bảo hành điện tử</Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6, lineHeight: 18 }}>
            Áp dụng cho dịch vụ vệ sinh, nạp gas & sửa chữa đặt trên app, tính từ ngày nghiệm thu hoàn thành.
          </Text>
        </View>
        <View style={{ marginLeft: 10 }}>
          <AppIcon name="shield-check" size={44} color="#fff" strokeWidth={1.8} />
        </View>
      </View>
      <Card style={{ marginTop: 14 }}>
        <Field
          label="Số điện thoại hoặc mã đơn"
          value={warrantyQuery}
          onChangeText={setWarrantyQuery}
          placeholder="VD: 0901234567 hoặc REQ-123456"
          autoCapitalize="characters"
          onSubmitEditing={() => lookup()}
          style={{ marginTop: -8 }}
        />
        {result?.error ? <Text style={ui.fieldErr}>{result.error}</Text> : null}
        <Btn title="Tra cứu" icon="search" style={{ marginTop: 14 }} onPress={() => lookup()} />
      </Card>
      {result?.orders ? (
        <View>
          <Text style={sx.groupTitle}>Kết quả ({result.orders.length})</Text>
          {result.orders.map((o) => <OrderLine key={o.code} o={o} />)}
        </View>
      ) : null}
      {!result?.orders && eligible.length ? (
        <View>
          <Text style={sx.groupTitle}>Đơn còn bảo hành của bạn</Text>
          {eligible.map((o) => <OrderLine key={o.code} o={o} />)}
        </View>
      ) : null}
      {!result?.orders && !eligible.length ? (
        <Text style={[ui.meta, { textAlign: 'center', marginTop: 18, lineHeight: 18 }]}>
          Chưa có đơn nào đang trong thời gian bảo hành.{'\n'}Đơn hoàn thành sẽ tự động xuất hiện ở đây.
        </Text>
      ) : null}
      <WarrantyBookingSheet
        visible={!!bookingOrder}
        onClose={() => setBookingOrder(null)}
        order={bookingOrder}
        winfo={bookingOrder ? warrantyInfo(bookingOrder, s.orders, s.lifetimePoints) : null}
        onSubmit={async (payload) => {
          try {
            const newCode = await a.requestWarranty(bookingOrder.code, payload);
            if (newCode) {
              setBookingOrder(null);
              nav.push('order', { code: newCode });
            }
            return newCode;
          } catch (e) {
            u.alert('Chưa gửi được', 'Không gửi được yêu cầu bảo hành. Vui lòng thử lại.', '⚠️');
            return null;
          }
        }}
      />
    </ScrollView>
  );
}

// =========================================================== HOẠT ĐỘNG
export function ActivityScreen() {
  const { s, d, nav, actFilter, setActFilter } = useApp();
  const [timeFilter, setTimeFilter] = useState(DEFAULT_ACTIVITY_TIME_FILTER);
  const [showTimeSheet, setShowTimeSheet] = useState(false);

  const nowYmd = vnDateKey();
  const orders = s.orders || [];
  const baseGroups = {
    active: orders.filter(isActiveOrder),
    done: orders.filter((o) => o.status === 'done'),
    cancelled: orders.filter((o) => o.status === 'cancelled'),
  };
  const groups = {
    active: filterAndSortOrders(baseGroups.active, timeFilter, nowYmd),
    done: filterAndSortOrders(baseGroups.done, timeFilter, nowYmd),
    cancelled: filterAndSortOrders(baseGroups.cancelled, timeFilter, nowYmd),
  };
  const list = groups[actFilter] || [];
  const filterActive = isTimeFilterActive(timeFilter);
  const hasFilterOrSort = filterActive || timeFilter.sort !== 'newest';

  const customRangeLabel = (() => {
    if (timeFilter.preset !== 'custom') return 'Chọn ngày';
    const { from, to } = getTimePresetBounds('custom', nowYmd, timeFilter.customFrom, timeFilter.customTo);
    if (!from) return 'Chọn ngày';
    if (!to || from === to) return formatDmyFromYmd(from);
    return `${formatShortDmFromYmd(from)} – ${formatShortDmFromYmd(to)}`;
  })();

  const reorder = (o) => nav.push('checkout', { items: (o.items || []).map(({ id, qty }) => ({ id, qty })) });

  return (
    <View style={{ flex: 1 }}>
      <PageHead
        title="Hoạt động"
        sub="Theo dõi đơn đặt thợ của bạn"
        right={(
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconBtn
              icon="calendar"
              onPress={() => setShowTimeSheet(true)}
              label="Bộ lọc thời gian"
              iconColor={hasFilterOrSort ? C.primary : C.ink}
              style={hasFilterOrSort ? { backgroundColor: C.primarySoft } : undefined}
            />
            <IconBtn icon="bell" badge={d.unread} onPress={() => nav.push('notifications')} label="Thông báo" />
          </View>
        )}
      />
      <View style={{ backgroundColor: '#fff', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={{ paddingHorizontal: 16 }}>
          <Segmented
            value={actFilter}
            onChange={setActFilter}
            items={[
              { id: 'active', label: 'Đang xử lý', count: groups.active.length },
              { id: 'done', label: 'Hoàn thành', count: groups.done.length },
              { id: 'cancelled', label: 'Đã huỷ', count: groups.cancelled.length },
            ]}
          />
        </View>
        <HScroll style={{ marginTop: 10 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {ACTIVITY_TIME_PRESETS.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              on={timeFilter.preset === p.id}
              onPress={() => {
                if (p.id === 'all') {
                  setTimeFilter((prev) => ({
                    ...prev,
                    preset: 'all',
                    customFrom: null,
                    customTo: null,
                    slotPeriod: 'all',
                  }));
                } else {
                  setTimeFilter((prev) => ({
                    ...prev,
                    preset: p.id,
                    customFrom: null,
                    customTo: null,
                  }));
                }
              }}
            />
          ))}
          <Chip
            icon="calendar"
            label={customRangeLabel}
            on={timeFilter.preset === 'custom'}
            onPress={() => setShowTimeSheet(true)}
          />
          <Chip
            icon="clock"
            label={timeFilter.sort === 'oldest' ? 'Cũ nhất ↑' : 'Mới nhất ↓'}
            on={timeFilter.sort === 'oldest'}
            onPress={() => setTimeFilter((prev) => ({
              ...prev,
              sort: prev.sort === 'newest' ? 'oldest' : 'newest',
            }))}
          />
        </HScroll>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        {filterActive ? (
          <View style={sx.filterSummary}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <AppIcon name="calendar" size={14} color={C.primary} strokeWidth={2.2} />
              <Text style={sx.filterSummaryText} numberOfLines={1}>
                {describeTimeFilter(timeFilter, nowYmd)} · {list.length} đơn
              </Text>
            </View>
            <Tap onPress={() => setTimeFilter(DEFAULT_ACTIVITY_TIME_FILTER)} hitSlop={6}>
              <Text style={sx.filterClearText}>Xoá lọc</Text>
            </Tap>
          </View>
        ) : null}
        {list.length === 0 ? (
          filterActive ? (
            <EmptyState
              icon="calendar"
              title="Không có đơn trong thời gian này"
              body={`Không tìm thấy đơn nào khớp với "${describeTimeFilter(timeFilter, nowYmd)}". Thử chọn khoảng thời gian khác hoặc xoá bộ lọc.`}
              action="Xoá bộ lọc thời gian"
              onAction={() => setTimeFilter(DEFAULT_ACTIVITY_TIME_FILTER)}
            />
          ) : (
            <EmptyState
              icon={actFilter === 'active' ? 'calendar-clock' : actFilter === 'done' ? 'check-circle-2' : 'archive'}
              title={actFilter === 'active' ? 'Không có đơn đang xử lý' : actFilter === 'done' ? 'Chưa có đơn hoàn thành' : 'Không có đơn bị huỷ'}
              body="Đặt dịch vụ để thợ Minh Đức đến tận nhà. Đơn của bạn sẽ hiện tại đây."
              action="Đặt dịch vụ ngay"
              onAction={() => nav.services()}
            />
          )
        ) : list.map((o) => {
          const svc0 = getService((o.items || [])[0]?.id);
          const meta = customerStatusMeta(o);
          return (
            <Card key={o.code} style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }} onPress={() => nav.push('order', { code: o.code })}>
              <View style={[sx.oHead, { backgroundColor: meta.bg }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {o.kind === 'warranty' ? <AppIcon name="shield-check" size={14} color={meta.fg} strokeWidth={2.2} /> : null}
                  <Text style={[sx.oCode, { color: meta.fg }]}>{o.code}</Text>
                </View>
                <Text style={[sx.oStatus, { color: meta.fg }]}>● {meta.label}</Text>
              </View>
              <View style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Media item={svc0} height={56} width={56} radius={14} />
                  <View style={{ flex: 1 }}>
                    <Text style={sx.oName} numberOfLines={2}>{svc0?.name}</Text>
                    {(o.items || []).length > 1 ? <Text style={ui.meta}>+{(o.items || []).length - 1} dịch vụ khác</Text> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                      <AppIcon name="calendar" size={13} color={C.muted} strokeWidth={2.1} />
                      <Text style={[ui.meta, { marginTop: 0 }]}>{o.dateLabel} · {o.slot}</Text>
                    </View>
                  </View>
                </View>
                <View style={sx.oFoot}>
                  <View style={{ flexShrink: 0 }}>
                    <Text style={[ui.meta, { marginTop: 0 }]}>Tổng thanh toán</Text>
                    <Text style={[ui.price, { fontSize: 16, marginTop: 2 }]}>{o.kind === 'warranty' ? 'Miễn phí' : (o.status === 'cancelled' ? formatVND(orderTotal(o)) : formatOrderTotal(o))}</Text>
                    {o.status === 'done' && isPaid(o) ? <Text style={[ui.meta, { color: C.green, fontWeight: '700' }]}>Đã thanh toán</Text> : null}
                    {o.status === 'done' && !isPaid(o) && o.kind !== 'warranty' && o.kind !== 'followup' ? <Text style={[ui.meta, { color: C.orange, fontWeight: '700' }]}>Chờ xác nhận TT</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', flex: 1 }}>
                    {o.status === 'quoted' ? (
                      <Btn
                        title={o.quote?.isExternalFinalization ? 'Xác nhận Bill' : 'Duyệt báo giá'}
                        icon="receipt-text"
                        small
                        variant="gold"
                        onPress={() => nav.push('order', { code: o.code })}
                      />
                    ) : null}
                    {o.status === 'pending_payment' && o.kind !== 'warranty' && o.kind !== 'followup' ? (
                      <Btn title="Thanh toán" icon="credit-card" small variant="primary" onPress={() => nav.push('order', { code: o.code })} />
                    ) : null}
                    {o.status === 'done' && !o.rating && o.kind !== 'warranty' ? <Btn title="Đánh giá" icon="star" small variant="gold" onPress={() => nav.push('rate', { code: o.code })} /> : null}
                    {['done', 'cancelled'].includes(o.status) && o.kind !== 'warranty' ? <Btn title="Đặt lại" icon="rotate-ccw" small variant="soft" onPress={() => reorder(o)} /> : null}
                    {isActiveOrder(o) && !['quoted', 'pending_payment'].includes(o.status) ? <Btn title="Theo dõi" icon="eye" small variant="soft" onPress={() => nav.push('order', { code: o.code })} /> : null}
                  </View>
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <ActivityTimeFilterSheet
        visible={showTimeSheet}
        onClose={() => setShowTimeSheet(false)}
        value={timeFilter}
        onApply={setTimeFilter}
        orders={baseGroups[actFilter] || []}
        nowYmd={nowYmd}
      />
    </View>
  );
}

// =========================================================== CÁ NHÂN
export function PersonalScreen() {
  const { s, a, d, nav, ui: u } = useApp();
  const name = s.user.name || d.address?.name || 'Khách';
  const phone = s.user.phone || d.address?.phone || 'Chưa có số điện thoại';
  const { cur, next } = tierOf(s.lifetimePoints);
  const progress = next ? (s.lifetimePoints - cur.min) / (next.min - cur.min) : 1;

  const Group = ({ title, children }) => (
    <View style={{ marginTop: 22 }}>
      <Text style={sx.groupLabel}>{title}</Text>
      <View style={sx.menuCard}>{children}</View>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={sx.profile}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={sx.avatar}><Text style={sx.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={sx.pName} numberOfLines={1}>{name}</Text>
            <Text style={sx.pPhone}>{phone}</Text>
            <Tap style={[sx.tier, { backgroundColor: C.green }]} onPress={() => nav.push('rewards', { tierId: cur.id })}>
              <Text style={sx.tierText}>{cur.label} ›</Text>
            </Tap>
          </View>
          <IconBtn icon="pencil" dark onPress={() => nav.push('profile')} label="Sửa thông tin" />
        </View>
        <Tap style={sx.tierBox} onPress={() => nav.push('rewards')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{next ? `Còn ${next.min - s.lifetimePoints} điểm để lên hạng ${next.label}` : 'Bạn đang ở hạng cao nhất'}</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Quyền lợi ›</Text>
          </View>
          <Progress value={progress} color="#fff" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }} />
        </Tap>
      </View>

      <View style={sx.pStats}>
        {[
          { v: s.orders.length, l: 'Đơn hàng', onPress: () => nav.activity(d.activeOrders.length ? 'active' : s.orders.some((o) => o.status === 'done') ? 'done' : 'active') },
          { v: s.points, l: 'Điểm tích luỹ', onPress: () => nav.push('rewards') },
          { v: s.myVouchers.length, l: 'Voucher', onPress: () => nav.push('rewards') },
        ].map((x, i) => (
          <Tap key={x.l} style={[{ flex: 1, alignItems: 'center' }, i > 0 && { borderLeftWidth: 1, borderLeftColor: C.line }]} onPress={x.onPress}>
            <Text style={{ fontSize: 19, fontWeight: '900', color: C.ink }}>{x.v}</Text>
            <Text style={[ui.meta, { fontWeight: '600' }]}>{x.l}</Text>
          </Tap>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <Group title="Tài khoản">
          <ListRow icon="circle-user-round" label="Sửa thông tin cá nhân" onPress={() => nav.push('profile')} />
          <ListRow icon="map-pin" label="Sổ địa chỉ" value={s.addresses.length ? `${s.addresses.length}` : ''} onPress={() => nav.push('addresses')} />
          <ListRow icon="ticket" label="Quyền lợi của tôi" value={s.points ? `${s.points} điểm` : ''} onPress={() => nav.push('rewards')} />
          <ListRow icon="trophy" label="Hạng thành viên" value={cur.label} onPress={() => nav.push('rewards', { tierId: cur.id })} last />
        </Group>
        <Group title="Hỗ trợ khách hàng">
          <ListRow icon="shield-check" label="Tra cứu bảo hành" onPress={() => nav.warranty(s.user.phone || '')} />
          <ListRow icon={a.isSoundMuted?.() ? 'bell-off' : 'bell'} label="Âm thanh thông báo" value={a.isSoundMuted?.() ? 'Tắt' : 'Bật'} onPress={() => a.toggleSound?.()} />
          <ListRow icon="headphones" label="Trợ giúp" onPress={() => nav.push('help')} />
          <ListRow icon="message-circle-more" label="Liên hệ hỗ trợ" value={HOTLINE} onPress={u.call} last />
        </Group>
        <Group title="Khác">
          <ListRow icon="scale" label="Điều khoản ứng dụng" onPress={() => nav.push('terms')} />
          <ListRow icon="refresh-cw" label="Cập nhật ứng dụng" value={APP_VERSION} onPress={() => u.alert('Bạn đang dùng bản mới nhất', `Phiên bản ${APP_VERSION}.`, '✅')} last />
        </Group>
        <Btn
          title="Đăng xuất"
          icon="log-out"
          variant="dangerSoft"
          style={{ marginTop: 24 }}
          onPress={() => u.confirm('Thông báo', 'Bạn có muốn đăng xuất?', a.logout, 'Đồng ý', false)}
        />
      </View>


    </ScrollView>
  );
}

const sx = StyleSheet.create({
  // Ô danh mục: icon cố định phía trên, tên căn giữa tối đa 2 dòng -> các ô thẳng hàng dù tên dài ngắn khác nhau.
  catTile: { width: 100, height: 88, borderRadius: R.lg, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 14, paddingHorizontal: 5, gap: 6 },
  catTileText: { width: '100%', height: 30, fontSize: 11.5, lineHeight: 15, fontWeight: '700', color: C.ink2, textAlign: 'center' },
  ownedDot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, backgroundColor: C.orangeSoft, borderRadius: R.md, padding: 12 },
  noticeText: { flex: 1, color: '#92400E', fontSize: 13, lineHeight: 18, fontWeight: '500' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 16, marginBottom: 12 },
  count: { fontSize: 13, color: C.muted, fontWeight: '600', flex: 1 },
  sort: { paddingHorizontal: 10, height: 30, borderRadius: 9, justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  sortOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  sortText: { fontSize: 12, fontWeight: '700', color: C.ink2 },
  wHero: { backgroundColor: C.navy, ...grad.navyHero, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', ...shadow.md },
  wInfo: { borderRadius: 10, padding: 10, marginTop: 12 },
  groupTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginTop: 20 },
  devHero: { backgroundColor: C.navy, ...grad.navyHero, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', ...shadow.md },
  oHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9 },
  oCode: { fontWeight: '800', fontSize: 13 },
  oStatus: { fontWeight: '800', fontSize: 12 },
  oName: { fontSize: 15, fontWeight: '800', color: C.ink, lineHeight: 20 },
  oFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F3F8' },
  filterSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: '#D6E4FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  filterSummaryText: { fontSize: 12.5, fontWeight: '700', color: C.primary, flex: 1 },
  filterClearText: { fontSize: 12.5, fontWeight: '800', color: C.primary },
  profile: { backgroundColor: C.navy, ...grad.navyHero, padding: 16, paddingTop: 20, paddingBottom: 48, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '900', color: C.primary },
  pName: { color: '#fff', fontSize: 20, fontWeight: '800' },
  pPhone: { color: 'rgba(255,255,255,0.7)', marginTop: 2, fontSize: 13 },
  tier: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginTop: 6 },
  tierText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  tierBox: { marginTop: 18, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12 },
  pStats: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: -30, borderRadius: R.lg, paddingVertical: 14, ...shadow.md },
  groupLabel: { fontSize: 18, fontWeight: '700', color: C.ink, marginBottom: 10, marginLeft: 2, letterSpacing: -0.2 },
  menuCard: { backgroundColor: '#F8FAFC', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#EEF2F7' },
});
