// ===========================================================================
// APP THỢ (Technician) — Hệ thống kỹ thuật viên Thợ Minh Đức
//   Nhận từ hệ thống: việc được giao, địa chỉ & liên hệ khách, lịch làm việc, báo giá, thông báo
//   Gửi lên hệ thống: chẩn đoán, tiến độ, vật tư sử dụng, ảnh minh chứng, biên bản hoàn thành
// Dùng chung dữ liệu đơn hàng với app Khách hàng (src/store.js) nên hai bên cập nhật cho nhau.
// ===========================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Image, Linking, RefreshControl } from 'react-native';
import { C, R, shadow, STATUS_META, toneOf } from '../../theme';
import {
  getService, formatVND, catIcon, catLabel, categorySlugOf, TECH_ME, MATERIALS, TECH_WORK_SHIFTS, TECH_STATUS_DESC, TECH_ORDER_STEPS, techStepIndexOf, HOTLINE,
} from '../../constants/data';
import { PASSWORD_MIN_LENGTH, BASE_WARRANTY_DAYS } from '../../constants';
import {
  useApp, orderTotal, amountRemaining, formatOrderTotal, cashToCollect, bookedValue, tierPartDiscountAmount, lateDiscountAmount,
  isActiveOrder, dateKeyOf, todayKey, fmtDateTime, timeAgo,
  assessCancelAfterAccept, slotStartTs, matchJobForTech, isQRPayment, isPaid, latestNotifPerOrder, techStatusMeta,
  getPendingExternalEstimates,
} from '../../context';
import { validateVietnamesePhone, validateContactName, sanitizeVnPhoneInput } from '../../utils';
import {
  isAttendanceNotifType,
  buildAttendanceNotifSignature,
  classifyJobToWorkShift,
  identifyTechWorkShift,
  formatVnTimeHm,
  sortTechShifts,
} from '../../utils/attendance';
import { hrmssApi } from '../../services/api';
import { resubscribeOrderRoom, subscribeSocketEvent } from '../../services/socketService';
import { dobError } from '../../utils/dateTime';
import { toVnParts, vnDateKey } from '../../utils/vnTime';
import { toVietnamese } from '../../utils/viText';
import {
  Tap, Btn, IconBtn, IconBox, Card, TopBar, PageHead, Segmented, Chip, Badge, Stars, Field, Sheet, Radio, Checkbox,
  EmptyState, Progress, Media, ListRow, Stepper, HScroll, ui, AppIcon, resolveSemanticTone,
} from '../../components';
import { NotFoundView } from '../shared/actionHelpers';
import { pickImage, pickCamera } from '../../utils/media';
import { computeQuoteRangeTotals, formatRangeVND, matchReceiptsToQuoteLines } from '../../utils/externalPartsPricing';
import { TrackingCard, SymptomBreakdownView } from '../../components/order';
import { tx } from './components/techStyles';
import { useBusyRunner } from './components/useBusyRunner';
import { useNextAction } from './components/nextAction';
import {
  useQuoteDraft,
  isOnSiteQuote,
  buildSymptomsSummary,
  buildSymptomRecommendationFallback,
} from './components/useQuoteDraft';
import { QuoteEditor } from './components/QuoteEditor';
import { CompleteSheet } from './components/CompleteSheet';
import { ExternalPartsFinalizeSheet } from './components/ExternalPartsFinalizeSheet';
import { UsedAndExtraMaterialsCard } from './components/UsedAndExtraMaterialsCard';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DECLINE_REASONS = ['Bận lịch khác', 'Ngoài khu vực phục vụ', 'Không đúng chuyên môn', 'Lý do khác'];
const RELEASE_REASONS = ['Khẩn cấp gia đình', 'Xe / phương tiện hỏng', 'Ốm đột xuất', 'Lịch trùng không xử lý kịp', 'Lý do khác'];
const sameDay = (ts, key) => Boolean(ts && vnDateKey(ts) === key);
const slotHour = (slot) => parseInt(slot, 10) || 0;
const callPhone = (phone) => Linking.openURL(`tel:${String(phone || '').replace(/[^\d+]/g, '')}`).catch(() => {});
const openMap = (addr) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || '')}`).catch(() => {});
// Thu nhập / chi trả cho thợ: backend chưa có bảng ví hay rút tiền, văn phòng đối soát ngoài app (không hiển thị số tự tính).

// Mã các việc tôi đã từ chối — một nguồn dữ liệu (ưu tiên d.declinedCodes tính theo mã thợ hiện tại).
const declinedCodesOf = (s, d) => {
  const src = Array.isArray(d?.declinedCodes) ? d.declinedCodes : (Array.isArray(s?.declined) ? s.declined : []);
  return [...new Set(src.map((x) => (x && typeof x === 'object' ? x.code : x)).filter(Boolean))];
};
// Đơn bị khách/văn phòng huỷ không phản ánh quyết định nhận việc của thợ.
const cancelledNotByTech = (o) => o.status === 'cancelled' && !['tech', 'technician'].includes(String(o.cancelledBy || '').toLowerCase());

function MetaLine({ icon, text, last }) {
  return (
    <View style={[tx.metaLine, last && { marginBottom: 0 }]}>
      <View style={tx.metaIcon}><AppIcon icon={icon} size={13} color={C.primary} strokeWidth={2.2} /></View>
      <Text style={tx.info} numberOfLines={2}>{text}</Text>
    </View>
  );
}

// =========================================================== THẺ CÔNG VIỆC
function JobCard({ o, compact, onDecline }) {
  const { s, a, nav } = useApp();
  const next = useNextAction()(o);
  const { run, isBusy } = useBusyRunner();
  const acceptKey = `accept:${o.code}`;
  const accepting = isBusy(acceptKey);
  const svc0 = getService(o.items[0]?.id);
  const meta = techStatusMeta(o);
  const open = () => nav.push('tech-job', { code: o.code });
  const who = `${o.address?.gender === 'Nữ' ? 'Chị' : 'Anh'} ${o.address?.name} · ${o.address?.phone}`;
  const match = o.status === 'pending' ? matchJobForTech(o, s.techProfile || TECH_ME) : null;
  return (
    <Card style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }} onPress={open}>
      <View style={[tx.cardHead, { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={[tx.statusDot, { backgroundColor: meta.fg }]} />
          {o.kind === 'warranty' ? <AppIcon name="shield-check" size={14} color={C.primary} strokeWidth={2.2} /> : null}
          <Text style={[tx.cardCode, { color: C.ink }]} numberOfLines={1}>
            {o.code}
          </Text>
        </View>
        <Badge text={o.status === 'pending' ? 'Được phân công' : meta.label} fg={meta.fg} bg={meta.bg} />
      </View>
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Media item={svc0} height={56} width={56} radius={16} />
          <View style={{ flex: 1 }}>
            <Text style={tx.name} numberOfLines={2}>{svc0?.name || o.items[0]?.name || 'Dịch vụ kỹ thuật'}</Text>
            {o.items.length > 1 ? <Text style={[ui.meta, { marginTop: 2 }]}>+{o.items.length - 1} dịch vụ khác</Text> : null}
          </View>
          {(() => {
            const isWarranty = o.kind === 'warranty';
            const qrPay = !isWarranty && isQRPayment(o);
            const orderPaid = isPaid(o);
            if (o.status === 'cancelled') {
              const fee = Number(o.inspectionFee) || 0;
              return (
                <View style={tx.payBox}>
                  <Text style={[tx.payLabel, { color: fee > 0 ? (orderPaid ? C.greenInk : C.goldInk) : C.redInk, fontWeight: '800' }]}>
                    {fee > 0 ? (orderPaid ? 'Đã thu phí KT' : 'Phí kiểm tra') : 'Đã huỷ'}
                  </Text>
                  <Text style={[ui.price, { fontSize: 14.5, marginTop: 2, color: fee > 0 ? (orderPaid ? C.green : C.ink) : C.muted }]}>
                    {fee > 0 ? formatVND(fee) : '0đ'}
                  </Text>
                </View>
              );
            }
            if (isWarranty) {
              return (
                <View style={tx.payBox}>
                  <Text style={[tx.payLabel, { color: C.greenInk }]}>Bảo hành</Text>
                  <Text style={[ui.price, { fontSize: 15, marginTop: 2, color: C.green }]}>0đ</Text>
                </View>
              );
            }
            if (o.status === 'quoted') {
              const resolvedOrderTotal = orderTotal(o);
              const quoteLabel = o.quote?.hasEstimatedRange
                ? formatOrderTotal(o)
                : formatVND(resolvedOrderTotal != null ? resolvedOrderTotal : (o.quote?.total || 0));
              const isExtBill = Boolean(o.quote?.isExternalFinalization);
              return (
                <View style={tx.payBox}>
                  <Text style={[tx.payLabel, { color: isExtBill ? C.primary : C.goldInk, fontWeight: '800' }]}>
                    {isExtBill ? 'Hoá đơn chờ xác nhận' : 'Báo giá chờ duyệt'}
                  </Text>
                  <Text style={[ui.price, { fontSize: 14.5, marginTop: 2, color: C.ink }]}>
                    {quoteLabel}
                  </Text>
                </View>
              );
            }
            if (qrPay) {
              return (
                <View style={tx.payBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <AppIcon name={orderPaid ? 'check-circle-2' : 'qr-code'} size={11} color={orderPaid ? C.green : C.muted} strokeWidth={2.4} />
                    <Text style={[tx.payLabel, { color: orderPaid ? C.green : C.muted, fontWeight: '800' }]}>
                      {orderPaid ? 'Đã chuyển khoản QR' : 'Chuyển khoản QR · Không thu'}
                    </Text>
                  </View>
                  <Text style={[ui.price, { fontSize: 14.5, marginTop: 2, color: orderPaid ? C.green : C.ink }]}>
                    {orderPaid
                      ? formatVND(orderTotal(o))
                      : o.status === 'pending_payment'
                        ? formatVND(amountRemaining(o))
                        : formatOrderTotal(o)}
                  </Text>
                </View>
              );
            }
            return (
              <View style={tx.payBox}>
                <Text style={[tx.payLabel, { color: orderPaid ? C.green : C.muted, fontWeight: '800' }]}>
                  {orderPaid ? 'Đã thu TM' : 'Thu tiền mặt'}
                </Text>
                <Text style={[ui.price, { fontSize: 15, marginTop: 2, color: orderPaid ? C.green : C.ink }]}>
                  {orderPaid
                    ? formatVND(orderTotal(o))
                    : ((o.quote?.hasEstimatedRange || o.quote?.approvedHasEstimatedRange) && !['pending_payment', 'done'].includes(o.status)
                        ? formatOrderTotal(o)
                        : formatVND(cashToCollect(o)))}
                </Text>
              </View>
            );
          })()}
        </View>
        {match ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <Badge
              text={match.skillMatch ? '✓ Đúng chuyên môn' : '⚠ Trái chuyên môn'}
              fg={match.skillMatch ? C.greenInk : C.goldInk}
              bg={match.skillMatch ? C.greenSoft : C.goldSoft}
            />
            <Badge
              text={match.areaMatch ? 'Trong khu vực' : 'Ngoài khu vực'}
              fg={match.areaMatch ? C.primary : C.muted}
              bg={match.areaMatch ? C.primarySoft : C.surface}
            />
          </View>
        ) : null}
        <View style={tx.metaBlock}>
          <MetaLine icon="calendar" text={`${o.dateLabel} · ${o.slot}`} />
          {o.device ? (
            <MetaLine
              icon={catIcon(o.device.category)}
              text={`${catLabel(o.device.category)}${o.device.brand ? ` · ${o.device.brand}` : ''}${o.device.room ? ` (${o.device.room})` : ''}`}
            />
          ) : null}
          <MetaLine icon="user" text={who} last={compact} />
          {!compact ? <MetaLine icon="map-pin" text={o.address?.full || ''} last /> : null}
        </View>
        <View style={tx.cardFoot}>
          {!compact && o.status === 'pending' ? (
            <View style={{ width: '100%', gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {o.address?.phone && !String(o.address.phone).includes('*') ? (
                  <Btn title="Gọi khách" small variant="ghost" icon="phone-call" style={{ flex: 1 }} onPress={() => callPhone(o.address?.phone)} />
                ) : null}
                <Btn title="Chỉ đường" small variant="ghost" icon="compass" style={{ flex: 1 }} onPress={() => openMap(o.address?.full)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn title="Từ chối ca" small variant="dangerSoft" style={{ flex: 1 }} onPress={() => (onDecline ? onDecline(o) : null)} />
                <Btn title={accepting ? 'Đang nhận…' : 'Tiếp nhận ca'} icon="handshake" small style={{ flex: 1.45 }} disabled={accepting} onPress={() => run(acceptKey, () => a.acceptJob(o.code))} />
              </View>
            </View>
          ) : (
            <>
              {(o.assignmentActive || o.status === 'pending' || Boolean(o.dbAssignmentId)) ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {o.address?.phone && !String(o.address.phone).includes('*') ? (
                    <Btn title="Gọi" small variant="ghost" icon="phone-call" onPress={() => callPhone(o.address?.phone)} />
                  ) : null}
                  {!compact ? <Btn title="Chỉ đường" small variant="ghost" icon="compass" onPress={() => openMap(o.address?.full)} /> : null}
                </View>
              ) : <View />}
              <View style={{ flexDirection: 'row', gap: 8, flexShrink: 1 }}>
                {compact ? (
                  <Btn title="Chi tiết" small variant="soft" onPress={open} />
                ) : next ? (
                  <Btn title={next.label} icon={next.icon} small variant={next.variant || 'soft'} disabled={Boolean(next.disabled)} onPress={next.run} />
                ) : null}
              </View>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

// =========================================================== TAB: VIỆC LÀM
export function TechJobsScreen() {
  const { s, a, d, nav, ui: u } = useApp();
  const me = s.techProfile || TECH_ME;
  const [tab, setTab] = useState('new');
  const [newFilter, setNewFilter] = useState('all'); // 'all' | 'skill' | 'area'
  const [declineTarget, setDeclineTarget] = useState(null);
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshJobs = async () => {
    setRefreshing(true);
    try { await Promise.resolve(a.syncFromBackend?.(null, true)); } catch (_e) { /* giữ danh sách hiện tại */ } finally { setRefreshing(false); }
  };
  const done = d.myJobs.filter((o) => o.status === 'done');
  const cancelled = d.myJobs.filter((o) => o.status === 'cancelled');
  const working = [...d.workingJobs].sort((x, y) => dateKeyOf(x).localeCompare(dateKeyOf(y)) || slotHour(x.slot) - slotHour(y.slot));
  const nextJob = working[0];
  const nextAct = useNextAction()(nextJob || { status: '' });
  const { run, isBusy } = useBusyRunner();
  const declining = declineTarget ? isBusy(`decline:${declineTarget.code}`) : false;
  const filteredNewJobs = d.newJobs.filter((o) => {
    if (newFilter === 'all') return true;
    const m = matchJobForTech(o, me);
    if (newFilter === 'skill') return m.skillMatch;
    if (newFilter === 'area') return m.areaMatch;
    return true;
  });
  const list = tab === 'new' ? filteredNewJobs : tab === 'working' ? working : tab === 'cancelled' ? cancelled : done;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshJobs} tintColor={C.primary} colors={[C.primary]} />}
      >
        <View style={[tx.header, { paddingBottom: 22 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={tx.avatar}><AppIcon name="hard-hat" size={28} color={C.primary} strokeWidth={2.1} /></View>
            <View style={{ flex: 1 }}>
              <Text style={tx.hello}>Kỹ thuật viên Minh Đức</Text>
              <Text style={tx.techName} numberOfLines={1}>{me.name}</Text>
              <Text style={tx.techSub}>{me.code} · ★ {me.rating != null ? Number(me.rating).toFixed(1) : '—'} ({me.ratingCount || 0} đánh giá dịch vụ)</Text>
            </View>
            <IconBtn icon="bell" dark badge={d.techUnread} onPress={() => nav.push('tech-notifs')} label="Thông báo" />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {(() => {
            const soon = working.find((job) => {
              const start = slotStartTs(job);
              if (!start || job.status !== 'confirmed') return false;
              const left = start - Date.now();
              return left > 0 && left <= 60 * 60 * 1000;
            });
            if (!soon) return null;
            const mins = Math.max(1, Math.ceil((slotStartTs(soon) - Date.now()) / 60000));
            return (
              <View style={[tx.offline, { marginTop: 14, backgroundColor: C.primarySoft, borderColor: '#BFDBFE' }]}>
                <Text style={{ color: C.primaryDark, fontWeight: '800' }}>⏰ Còn ~{mins} phút đến giờ hẹn · {soon.code}</Text>
                <Text style={{ color: C.primaryDark, marginTop: 4, lineHeight: 18 }}>Bấm “Đang đến” đúng giờ để phục vụ khách hàng chu đáo và nhận đánh giá 5 sao.</Text>
                <Btn title="Mở việc sắp tới" small variant="primary" style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => nav.push('tech-job', { code: soon.code })} />
              </View>
            );
          })()}
          {nextJob && tab !== 'working' ? (
            <Card style={tx.nextCard} onPress={() => nav.push('tech-job', { code: nextJob.code })}>
              <View style={tx.nextAccent} />
              <View style={{ padding: 16, paddingLeft: 18 }}>
                <Text style={tx.nextEyebrow}>VIỆC TIẾP THEO</Text>
                <Text style={tx.nextTitle} numberOfLines={2}>
                  {getService(nextJob.items?.[0]?.id)?.name || nextJob.items?.[0]?.name || `Đơn ${nextJob.code}`}
                </Text>
                <Text style={tx.nextMeta} numberOfLines={1}>📅 {nextJob.dateLabel} · {nextJob.slot}</Text>
                <Text style={tx.nextMeta} numberOfLines={1}>📍 {nextJob.address?.full}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  {nextJob.address?.phone && !String(nextJob.address.phone).includes('*') ? (
                    <Btn title="Gọi khách" icon="phone" small variant="primary" style={{ flex: 1 }} onPress={() => callPhone(nextJob.address?.phone)} />
                  ) : null}
                  <Btn
                    title={nextAct?.label || 'Xem chi tiết'}
                    icon={nextAct?.icon || 'wrench'}
                    small
                    variant="soft"
                    style={{ flex: 1.15 }}
                    disabled={Boolean(nextAct?.disabled)}
                    onPress={() => (nextAct ? nextAct.run() : nav.push('tech-job', { code: nextJob.code }))}
                  />
                </View>
              </View>
            </Card>
          ) : null}

          <Segmented
            style={{ marginTop: 16 }}
            value={tab}
            onChange={setTab}
            items={[
              { id: 'new', label: 'Việc mới', count: d.newJobs.length },
              { id: 'working', label: 'Đang làm', count: working.length },
              { id: 'done', label: 'Hoàn thành', count: done.length },
              { id: 'cancelled', label: 'Đã huỷ', count: cancelled.length },
            ]}
          />
          {tab === 'new' && d.newJobs.length > 0 ? (
            <HScroll contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
              <Chip label={`Tất cả (${d.newJobs.length})`} on={newFilter === 'all'} onPress={() => setNewFilter('all')} />
              <Chip label="✓ Đúng chuyên môn" on={newFilter === 'skill'} onPress={() => setNewFilter('skill')} />
              <Chip label={`📍 Trong khu vực (${me.area?.trim() || 'Hà Nội'})`} on={newFilter === 'area'} onPress={() => setNewFilter('area')} />
            </HScroll>
          ) : null}
          <View style={{ marginTop: 14 }}>
            {list.length === 0 ? (
              <EmptyState
                icon={tab === 'new' ? 'inbox' : tab === 'working' ? 'briefcase' : tab === 'cancelled' ? 'ban' : 'clipboard-check'}
                title={tab === 'new' ? 'Chưa có việc mới' : tab === 'working' ? 'Không có việc đang làm' : tab === 'cancelled' ? 'Không có đơn đã huỷ' : 'Chưa có việc hoàn thành'}
                body={
                  tab === 'new'
                    ? 'Khi hệ thống phân công việc mới trong khu vực của bạn, đơn sẽ hiện tại đây.'
                    : tab === 'working'
                      ? 'Nhận việc ở mục “Việc mới” để bắt đầu ca làm.'
                      : tab === 'cancelled'
                        ? 'Các đơn khách hoặc hệ thống đã huỷ sẽ hiển thị tại đây để bạn đối chiếu.'
                        : 'Các việc đã hoàn thành trong ngày và trước đó sẽ hiện tại đây.'
                }
                action={tab === 'working' ? 'Xem việc mới' : null}
                onAction={() => {
                  if (tab === 'working') setTab('new');
                }}
              />
            ) : list.map((o) => (
              <JobCard
                key={o.code}
                o={o}
                onDecline={(job) => { setReason(DECLINE_REASONS[0]); setReasonNote(''); setDeclineTarget(job); }}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <Sheet
        visible={!!declineTarget}
        onClose={() => { if (!declining) setDeclineTarget(null); }}
        title="Lý do từ chối"
        footer={(
          <Btn
            title={declining ? 'Đang gửi…' : 'Xác nhận từ chối'}
            variant="danger"
            disabled={declining}
            onPress={async () => {
              if (!declineTarget) return;
              const target = declineTarget;
              const note = reason === 'Lý do khác' ? reasonNote.trim() : '';
              if (reason === 'Lý do khác' && note.length < 3) {
                u.alert('Thiếu lý do', 'Vui lòng mô tả ngắn lý do từ chối.', 'pencil');
                return;
              }
              const res = await run(`decline:${target.code}`, () => a.declineJob(target.code, note ? `${reason}: ${note}` : reason));
              if (res !== undefined && res !== false) setDeclineTarget(null);
            }}
          />
        )}
      >
        <Text style={[ui.meta, { marginBottom: 8 }]}>Điều phối sẽ giao việc {declineTarget?.code} cho thợ khác.</Text>
        {DECLINE_REASONS.map((r) => (
          <Tap key={r} style={tx.option} onPress={() => setReason(r)}>
            <Radio on={reason === r} />
            <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{r}</Text>
          </Tap>
        ))}
        {reason === 'Lý do khác' ? (
          <Field label="Mô tả ngắn" value={reasonNote} onChangeText={setReasonNote} placeholder="VD: Xe hỏng, không kịp giờ hẹn…" style={{ marginTop: 8 }} />
        ) : null}
      </Sheet>
    </View>
  );
}

// =========================================================== TAB: LỊCH LÀM VIỆC
const slotStartMinutes = (slot) => {
  const m = /(\d{1,2})[h:](\d{2})/.exec(String(slot || ''));
  if (!m) return 9999;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
const formatShiftHm = (hm) => (hm ? String(hm).replace(':', 'h') : '');
const shiftRangeLabel = (backendShift, fallbackShort) => {
  if (!backendShift) return fallbackShort;
  const s = backendShift.startTime || formatVnTimeHm(backendShift.starts_at || backendShift.startsAt);
  const e = backendShift.endTime || formatVnTimeHm(backendShift.ends_at || backendShift.endsAt);
  if (s && e) return `${formatShiftHm(s)} - ${formatShiftHm(e)}`;
  return fallbackShort;
};

export function TechScheduleScreen() {
  const { s, a, d, nav } = useApp();
  const [day, setDay] = useState(0);
  const [refreshingSched, setRefreshingSched] = useState(false);
  const [scheduleShifts, setScheduleShifts] = useState([]);
  const [scheduleError, setScheduleError] = useState('');
  const schedReqSeqRef = useRef(0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const p = toVnParts(Date.now() + i * 86400000);
    return { key: todayKey(i), label: i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : WEEKDAYS[p.weekday], dd: String(p.day).padStart(2, '0') };
  });
  // Lịch gồm việc của tôi (trừ đã huỷ) + việc mới chưa nhận (so theo mã đơn, không theo tham chiếu object)
  const myCodes = new Set(d.myJobs.map((o) => o.code));
  const all = [...d.myJobs.filter((o) => o.status !== 'cancelled'), ...d.newJobs.filter((o) => !myCodes.has(o.code))];
  const key = days[day].key;

  const fetchScheduleShifts = async (targetDate) => {
    const seq = ++schedReqSeqRef.current;
    try {
      const res = await hrmssApi.getTechnicianSchedule(targetDate);
      if (seq !== schedReqSeqRef.current) return;
      if (res?.ok) {
        const raw = Array.isArray(res.data?.shifts) ? res.data.shifts : [];
        const active = raw.filter(
          (sh) => String(sh?.shift_status || sh?.shiftStatus || 'AVAILABLE').toUpperCase() !== 'CANCELLED',
        );
        setScheduleError('');
        setScheduleShifts(sortTechShifts(active));
      } else {
        setScheduleError(res?.message || 'Không tải được ca làm việc từ máy chủ.');
      }
    } catch (_e) {
      if (seq === schedReqSeqRef.current) {
        setScheduleError('Không tải được ca làm việc. Kiểm tra mạng và thử lại.');
      }
    }
  };

  useEffect(() => {
    setScheduleShifts([]);
    setScheduleError('');
    fetchScheduleShifts(key);
  }, [key]);

  useEffect(() => {
    const off = subscribeSocketEvent('notification:new', (n) => {
      const nType = n?.notification_type || n?.type;
      if (isAttendanceNotifType(nType)) {
        fetchScheduleShifts(key);
      }
    });
    return off;
  }, [key]);

  const schedNotifSig = useMemo(
    () => buildAttendanceNotifSignature(s?.techNotifs),
    [s?.techNotifs],
  );
  const prevSchedSigRef = useRef(schedNotifSig);
  useEffect(() => {
    if (schedNotifSig !== prevSchedSigRef.current) {
      prevSchedSigRef.current = schedNotifSig;
      fetchScheduleShifts(key);
    }
  }, [schedNotifSig, key]);

  const onRefreshSched = async () => {
    setRefreshingSched(true);
    try {
      await Promise.all([
        Promise.resolve(a.syncFromBackend?.(null, true)),
        fetchScheduleShifts(key),
      ]);
    } catch (_e) { /* giữ lịch hiện tại */ } finally { setRefreshingSched(false); }
  };

  const dayJobs = all
    .filter((o) => dateKeyOf(o) === key)
    .sort((x, y) => slotStartMinutes(x.slot) - slotStartMinutes(y.slot));
  const others = dayJobs.filter((o) => !classifyJobToWorkShift(o));
  const officialShiftIds = new Set(TECH_WORK_SHIFTS.map((s) => s.id));
  const customShifts = scheduleShifts.filter((sh) => !officialShiftIds.has(identifyTechWorkShift(sh)?.id));

  return (
    <View style={{ flex: 1 }}>
      <PageHead title="Lịch làm việc" sub="Ca 1 (08h00 - 12h00) · Ca 2 (13h30 - 17h30)" />
      <View style={{ backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {days.map((dd, i) => {
            const n = all.filter((o) => dateKeyOf(o) === dd.key).length;
            const on = i === day;
            return (
              <Tap key={dd.key} onPress={() => setDay(i)} style={[tx.day, on && tx.dayOn]}>
                <Text style={[tx.dayLabel, on && { color: 'rgba(255,255,255,0.8)' }]}>{dd.label}</Text>
                <Text style={[tx.dayNum, on && { color: '#fff' }]}>{dd.dd}</Text>
                <View style={[tx.dayDot, { backgroundColor: n ? (on ? C.gold : C.primary) : 'transparent' }]} />
              </Tap>
            );
          })}
        </HScroll>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshingSched} onRefresh={onRefreshSched} tintColor={C.primary} colors={[C.primary]} />}
      >
        <View style={tx.daySummary}>
          <Text style={[tx.sec, { marginBottom: 4 }]}>{dayJobs.length} công việc · {days[day].label}</Text>
          <Text style={ui.meta}>
            {dayJobs.filter((o) => o.status === 'pending').length} chờ nhận · {dayJobs.filter((o) => isActiveOrder(o) && o.status !== 'pending').length} đang xử lý · {dayJobs.filter((o) => o.status === 'done').length} xong
          </Text>
        </View>
        {scheduleError ? (
          <Card style={{ marginTop: 10, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.red }}>
            <Text style={{ fontWeight: '800', color: C.redInk, fontSize: 13 }}>Không tải được phân ca</Text>
            <Text style={[ui.meta, { marginTop: 2 }]}>{scheduleError}</Text>
            <Btn title="Thử lại" small variant="soft" style={{ marginTop: 8, alignSelf: 'flex-start' }} onPress={() => fetchScheduleShifts(key)} />
          </Card>
        ) : null}

        {TECH_WORK_SHIFTS.map((shift) => {
          const jobs = dayJobs.filter((o) => classifyJobToWorkShift(o) === shift.id);
          const backendShift = scheduleShifts.find((sh) => identifyTechWorkShift(sh)?.id === shift.id) || null;
          const bStatus = String(backendShift?.shift_status || backendShift?.shiftStatus || '').toUpperCase();
          const bReason = backendShift?.status_reason || backendShift?.statusReason || '';
          const shiftIcon = shift.id === 'ca1' ? 'sun' : 'clock';
          const rangeText = shiftRangeLabel(backendShift, shift.shortTime);

          return (
            <View key={shift.id} style={tx.shiftSection}>
              <View style={tx.shiftHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={tx.shiftIconBox}>
                    <AppIcon name={shiftIcon} size={18} color={C.primary} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={tx.shiftTitle}>{shift.label}</Text>
                    <Text style={tx.shiftRange}>{rangeText}</Text>
                    {bStatus === 'UNAVAILABLE' && bReason ? (
                      <Text style={tx.shiftReason} numberOfLines={2}>Lý do nghỉ: {bReason}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {backendShift ? (
                    bStatus === 'UNAVAILABLE' ? (
                      <Badge text="Nghỉ" fg={C.goldInk} bg={C.goldSoft} />
                    ) : (
                      <Badge text="Đã xếp ca" fg={C.greenInk} bg={C.greenSoft} />
                    )
                  ) : null}
                  {jobs.length ? (
                    <Badge text={`${jobs.length} việc`} fg={C.primary} bg={C.primarySoft} />
                  ) : null}
                </View>
              </View>
              {jobs.length ? (
                jobs.map((o) => <JobCard key={o.code} o={o} compact />)
              ) : (
                <View style={tx.shiftEmptyBox}>
                  <Text style={{ color: C.faint, fontSize: 13 }}>Chưa có công việc trong ca này</Text>
                </View>
              )}
            </View>
          );
        })}

        {customShifts.length > 0 ? (
          <View style={tx.shiftSection}>
            <Text style={[ui.meta, { fontWeight: '700', marginBottom: 6 }]}>Ca bổ sung từ văn phòng</Text>
            {customShifts.map((sh, idx) => {
              const stCode = String(sh.shift_status || sh.shiftStatus || 'AVAILABLE').toUpperCase();
              const rText = shiftRangeLabel(sh, 'Theo lịch phân công');
              const reasonText = toVietnamese(sh.status_reason || sh.statusReason, '');
              return (
                <Card key={String(sh.shift_id || sh.id || idx)} style={{ marginBottom: 8, padding: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ fontWeight: '800', color: C.ink, fontSize: 13.5 }}>{sh.name || rText}</Text>
                    <Badge
                      text={stCode === 'UNAVAILABLE' ? 'Nghỉ' : 'Đã xếp ca'}
                      fg={stCode === 'UNAVAILABLE' ? C.goldInk : C.greenInk}
                      bg={stCode === 'UNAVAILABLE' ? C.goldSoft : C.greenSoft}
                    />
                  </View>
                  {sh.name ? <Text style={[ui.meta, { marginTop: 2 }]}>{rText}</Text> : null}
                  {reasonText ? <Text style={tx.shiftReason}>{reasonText}</Text> : null}
                </Card>
              );
            })}
          </View>
        ) : null}

        {others.length ? (
          <View style={tx.shiftSection}>
            <View style={tx.shiftHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={[tx.shiftIconBox, { backgroundColor: C.goldSoft }]}>
                  <AppIcon name="calendar" size={18} color={C.goldInk} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={tx.shiftTitle}>Ngoài khung ca</Text>
                  <Text style={[ui.meta, { marginTop: 1 }]}>Ngoài 08h00 - 12h00 & 13h30 - 17h30</Text>
                </View>
              </View>
              <Badge text={`${others.length} việc`} fg={C.goldInk} bg={C.goldSoft} />
            </View>
            {others.map((o) => <JobCard key={o.code} o={o} compact />)}
          </View>
        ) : null}

        {dayJobs.length === 0 ? (
          <Btn
            title="Xem việc mới"
            icon="briefcase"
            variant="soft"
            style={{ marginTop: 4 }}
            onPress={() => nav.go('tech-jobs')}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

// =========================================================== TAB: THÔNG BÁO
export function TechNotifsScreen() {
  const { s, a, nav, ui: u } = useApp();
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    Promise.resolve(a.syncFromBackend?.()).catch(() => {});
  }, []);
  const onRefreshNotifs = async () => {
    setRefreshing(true);
    try { await Promise.resolve(a.syncFromBackend?.(null, true)); } catch (_e) { /* giữ danh sách cũ */ } finally { setRefreshing(false); }
  };
  // Mỗi việc chỉ hiện thông báo mới nhất (các cập nhật cũ hơn của việc đó được gom lại).
  const list = latestNotifPerOrder(s.techNotifs || []);
  const hasRead = (s.techNotifs || []).some((n) => Boolean(n.read));
  const filtered = list.filter((n) => {
    if (filter === 'unread') return !n.read;
    if (filter === 'jobs') return String(n.type || '').toUpperCase().startsWith('HANDOVER_') || /việc|đơn|báo giá|hoá đơn|đến nơi|bàn giao|tiền mặt|nộp tiền|đánh giá|huỷ|hủy|lịch|khách|hoàn thành|thanh toán|phân công|bảo hành|vật tư/i.test(`${n.title} ${n.body || ''}`);
    if (filter === 'attendance') {
      return isAttendanceNotifType(n.type) || /chấm công|ca làm|vào ca|vi phạm|kỳ công/i.test(`${n.title} ${n.body || ''}`);
    }
    return true;
  });
  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Thông báo"
        sub="Việc mới, chấm công & phản hồi của khách"
        onBack={() => {
          if (nav.stack.length > 0) {
            nav.back();
          } else {
            nav.go('tech-jobs');
          }
        }}
        right={(
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {list.some((n) => !n.read) ? (
              <Tap onPress={a.readAllTech}><Text style={ui.link}>Đọc hết</Text></Tap>
            ) : null}
            {hasRead ? (
              <Tap onPress={() => u.confirm('Dọn sạch thông báo đã đọc?', 'Xoá hết các thông báo đã đọc và giữ lại các thông báo chưa đọc?', a.clearAllTechNotifs, 'Dọn sạch', true)}>
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
            { id: 'attendance', label: 'Chấm công' },
            { id: 'jobs', label: 'Việc & đơn' },
          ].map((f) => <Chip key={f.id} label={f.label} on={filter === f.id} onPress={() => setFilter(f.id)} />)}
        </HScroll>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshNotifs} tintColor={C.primary} colors={[C.primary]} />}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="bell"
            title={filter === 'unread' ? 'Đã đọc hết' : 'Chưa có thông báo'}
            body="Việc mới được giao, khách duyệt/từ chối báo giá, huỷ đơn hay đánh giá sẽ hiện ở đây."
            action="Về trang công việc"
            onAction={() => nav.go('tech-jobs')}
          />
        ) : filtered.map((n) => {
          const sem = resolveSemanticTone({ tone: n.tone, title: n.title, message: n.body, icon: n.icon, fallback: 'info' });
          return (
            <Tap
              key={n.id}
              style={[
                tx.notif,
                !n.read && { backgroundColor: sem.unreadBg, borderColor: sem.border },
                { borderLeftWidth: 4, borderLeftColor: sem.accent },
              ]}
              onPress={() => { a.readTechNotif(n.groupIds || n.id); nav.open(n.link); }}
            >
              <IconBox icon={n.icon || sem.icon} size={42} bg={sem.bg} color={sem.accent} radius={14} />
              <View style={{ flex: 1 }}>
                <Text style={[tx.notifTitle, !n.read && { color: C.ink }]}>{n.title}</Text>
                {n.body ? <Text style={tx.notifBody}>{n.body}</Text> : null}
                <Text style={[ui.meta, { marginTop: 4 }]}>
                  {timeAgo(n.at)}{n.olderCount > 0 ? ` · ${n.olderCount} cập nhật trước của việc này` : ''}
                </Text>
              </View>
              {!n.read ? <View style={[tx.dot, { backgroundColor: sem.accent }]} /> : null}
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

// =========================================================== TAB: TÀI KHOẢN THỢ
export function TechAccountScreen() {
  const { s, a, d, nav, ui: u } = useApp();
  const me = s.techProfile || TECH_ME;
  const { run: runAccount, isBusy: isAccountBusy } = useBusyRunner();
  const [showProfile, setShowProfile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [name, setName] = useState(me.name || '');
  const [phone, setPhone] = useState(me.phone || '');
  const [dob, setDob] = useState(me.dob || s.user?.dob || s.auth?.dob || '');
  const [area, setArea] = useState(me.area || 'Hà Nội');

  const done = d.myJobs.filter((o) => o.status === 'done');
  const rated = done.filter((o) => o.rating);
  const avg = me.rating != null
    ? Number(me.rating).toFixed(1)
    : (rated.length ? (rated.reduce((sum, o) => sum + o.rating.stars, 0) / rated.length).toFixed(1) : '—');
  const backendReviews = Array.isArray(me.reviews) ? me.reviews : [];
  // Tỉ lệ nhận việc = đã nhận / (đã nhận + đã từ chối). Đơn bị khách/văn phòng huỷ không tính.
  const acceptedJobs = d.myJobs.filter((o) => !cancelledNotByTech(o));
  const acceptedCodes = new Set(d.myJobs.map((o) => o.code));
  const accepted = acceptedJobs.length;
  const declined = declinedCodesOf(s, d).filter((code) => !acceptedCodes.has(code)).length;
  const rate = accepted + declined ? Math.round((accepted / (accepted + declined)) * 100) : 100;
  const completedCount = done.length;
  const refreshProfile = async () => {
    setRefreshing(true);
    try { await Promise.resolve(a.syncFromBackend()); } catch (_e) { /* giữ dữ liệu cũ */ } finally { setRefreshing(false); }
  };

  const openProfile = () => {
    setName(me.name || '');
    setPhone(me.phone || '');
    setDob(me.dob || s.user?.dob || s.auth?.dob || '');
    setArea(me.area || 'Hà Nội');
    setShowProfile(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshProfile} tintColor={C.primary} colors={[C.primary]} />}
      >
        <View style={[tx.header, { paddingBottom: 28 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={[tx.avatar, { width: 68, height: 68, borderRadius: 24 }]}><AppIcon name="hard-hat" size={34} color={C.primary} strokeWidth={2.1} /></View>
            <View style={{ flex: 1 }}>
              <Text style={tx.techName}>{me.name}</Text>
              <Text style={tx.techSub}>{me.code} · {me.phone}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Badge text="Kỹ thuật viên" fg={C.primary} bg="#fff" />
              </View>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: -18, zIndex: 2 }}>
          {(() => {
            const satisfactionRate = me.satisfactionPercent != null ? me.satisfactionPercent : null;
            return (
              <Card style={{ marginBottom: 0, borderColor: C.line, backgroundColor: C.card, ...shadow.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <AppIcon name="star" size={26} color={C.gold} fill={C.gold} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontWeight: '900', color: C.ink, fontSize: 19 }}>★ {avg} / 5.0</Text>
                      {satisfactionRate != null ? <Badge text={`${satisfactionRate}% Hài lòng`} fg={C.greenInk} bg={C.greenSoft} /> : null}
                    </View>
                    <Text style={[ui.meta, { marginTop: 2, lineHeight: 18 }]}>
                      Đánh giá dịch vụ của khách hàng ({completedCount} đơn hoàn thành)
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  {[
                    { l: '5★ Tuyệt đối', v: satisfactionRate != null ? `${satisfactionRate}%` : '—' },
                    { l: 'Tỷ lệ nhận việc', v: `${rate}%` },
                    { l: 'Lượt đánh giá', v: `${me.ratingCount || 0}` },
                  ].map((x) => (
                    <View key={x.l} style={{ flex: 1, backgroundColor: C.bg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{x.l}</Text>
                      <Text style={{ fontWeight: '900', color: C.ink, fontSize: 16, marginTop: 4 }}>{x.v}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            );
          })()}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {me.specialtiesAvailable ? (
            <Card style={{ marginTop: 14 }}>
              <Text style={[tx.h, { marginBottom: 0 }]}>Chuyên môn</Text>
              {me.specialties?.length && !me.acceptsAllCategories ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {me.specialties.map((specialty) => <Chip key={specialty} label={specialty} />)}
                </View>
              ) : (
                <Text style={[ui.meta, { marginTop: 10 }]}>Nhận mọi loại dịch vụ</Text>
              )}
              <Text style={[ui.meta, { marginTop: 10 }]}>📍 Khu vực phục vụ: {me.area?.trim() || 'Hà Nội'}</Text>
            </Card>
          ) : (
            <Card style={{ marginTop: 14 }}>
              <Text style={[ui.meta, { marginTop: 2 }]}>📍 Khu vực phục vụ: {me.area?.trim() || 'Hà Nội'}</Text>
            </Card>
          )}

          {backendReviews.length ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={tx.h}>Đánh giá gần đây</Text>
              {backendReviews.slice(0, 5).map((r) => {
                const code = r.request_code;
                const open = code && s.orders.some((o) => o.code === code) ? () => nav.push('tech-job', { code }) : undefined;
                return (
                  <Tap key={r.review_id} style={tx.reviewRow} onPress={open}>
                    <Stars value={r.rating} size={12} />
                    <Text style={{ color: C.ink2, fontSize: 13, marginTop: 4 }} numberOfLines={2}>{r.review_text || 'Không có nhận xét'}</Text>
                    <Text style={ui.meta}>{code || ''}</Text>
                  </Tap>
                );
              })}
            </Card>
          ) : (
            <Card style={{ marginTop: 12 }}>
              <Text style={tx.h}>Đánh giá gần đây</Text>
              <Text style={ui.meta}>Chưa có đánh giá. Hoàn thành việc để khách chấm điểm.</Text>
            </Card>
          )}

          <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink, marginTop: 20, marginBottom: 10, marginLeft: 2, letterSpacing: -0.2 }}>Tài khoản & Công việc</Text>
          <View style={tx.menu}>
            <ListRow icon="banknote" label="Bàn giao tiền mặt" value="Nộp & lịch sử" onPress={() => nav.push('tech-handovers')} />
            <ListRow icon="bell" label="Thông báo" value={d.techUnread ? `${d.techUnread} mới` : ''} onPress={() => nav.push('tech-notifs')} />
            <ListRow icon="circle-user-round" label="Sửa thông tin kỹ thuật viên" onPress={openProfile} />
            <ListRow icon="lock" label="Đổi mật khẩu" onPress={() => { setCurPw(''); setNewPw(''); setNewPw2(''); setShowPw(true); }} last />
          </View>

          <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink, marginTop: 20, marginBottom: 10, marginLeft: 2, letterSpacing: -0.2 }}>Hỗ trợ kỹ thuật viên</Text>
          <View style={tx.menu}>
            <ListRow icon={a.isSoundMuted?.() ? 'bell-off' : 'bell'} label="Âm thanh chuông báo" value={a.isSoundMuted?.() ? 'Tắt' : 'Bật'} onPress={() => a.toggleSound?.()} />
            <ListRow icon="headphones" label="Liên hệ điều phối" value={HOTLINE} onPress={u.call} last />
          </View>
          <Btn
            title="Đăng xuất tài khoản Thợ"
            icon="log-out"
            variant="dangerSoft"
            style={{ marginTop: 18 }}
            onPress={() => u.confirm('Thông báo', 'Bạn có muốn đăng xuất?', a.logout, 'Đồng ý', false)}
          />
        </View>
      </ScrollView>

      <Sheet
        visible={showProfile}
        onClose={() => setShowProfile(false)}
        title="Hồ sơ kỹ thuật viên"
        footer={(
          <Btn
            title={isAccountBusy('save-profile') ? 'Đang lưu…' : 'Lưu hồ sơ'}
            disabled={isAccountBusy('save-profile')}
            onPress={() => runAccount('save-profile', async () => {
              const nameErr = validateContactName(name);
              if (nameErr) { u.alert('Họ tên không hợp lệ', nameErr, '✏️'); return; }
              const phoneErr = validateVietnamesePhone(phone);
              if (phoneErr) { u.alert('SĐT không hợp lệ', phoneErr, '📞'); return; }
              const dErr = dobError(dob);
              if (dErr) { u.alert('Ngày sinh không hợp lệ', dErr, '🎂'); return; }
              const saved = await a.updateTechProfile({
                name: name.trim(),
                phone: String(phone).replace(/\D/g, ''),
                dob: dob.trim(),
                area: area.trim() || TECH_ME.area,
              });
              if (saved) setShowProfile(false);
            })}
          />
        )}
      >
        <Field label="Họ và tên" value={name} onChangeText={setName} placeholder="Tên thợ" />
        <Field
          label="Số điện thoại"
          value={phone}
          onChangeText={(t) => setPhone(sanitizeVnPhoneInput(t))}
          placeholder="10 chữ số (bắt đầu bằng số 0)"
          keyboardType="phone-pad"
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
          }}
          keyboardType="numeric"
          placeholder="Ngày/tháng/năm (VD: 15/08/1995)"
        />
        <Field label="Khu vực phục vụ" value={area} onChangeText={setArea} placeholder="Ví dụ: Hà Nội" />
        <Text style={[ui.meta, { marginTop: 12 }]}>Mã thợ: {me.code}</Text>
      </Sheet>



      <Sheet
        visible={showPw}
        onClose={() => setShowPw(false)}
        title="Đổi mật khẩu"
        footer={(
          <Btn
            title={isAccountBusy('change-pw') ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
            disabled={isAccountBusy('change-pw')}
            onPress={() => runAccount('change-pw', async () => {
              if (!curPw) { u.alert('Thiếu mật khẩu hiện tại', 'Vui lòng nhập mật khẩu hiện tại.', 'lock'); return; }
              if (String(newPw).length < PASSWORD_MIN_LENGTH) { u.alert('Mật khẩu quá ngắn', `Mật khẩu mới cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`, 'lock'); return; }
              if (newPw !== newPw2) { u.alert('Không khớp', 'Mật khẩu mới nhập lại chưa khớp.', 'lock'); return; }
              if (newPw === curPw) { u.alert('Mật khẩu trùng lặp', 'Mật khẩu mới phải khác mật khẩu hiện tại.', 'lock'); return; }
              let res = null;
              try {
                res = await Promise.resolve(a.changePassword({ currentPassword: curPw, newPassword: newPw }));
              } catch (e) {
                res = { ok: false, error: toVietnamese(e?.message, 'Vui lòng thử lại.') || 'Vui lòng thử lại.' };
              }
              if (!res?.ok) { u.alert('Không đổi được', res?.error || 'Vui lòng thử lại.', '🔐'); return; }
              setShowPw(false);
            })}
          />
        )}
      >
        <Field label="Mật khẩu hiện tại" value={curPw} onChangeText={setCurPw} secureTextEntry placeholder="••••••" style={{ marginTop: -8 }} />
        <Field label="Mật khẩu mới" value={newPw} onChangeText={setNewPw} secureTextEntry placeholder={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự`} />
        <Field label="Nhập lại mật khẩu mới" value={newPw2} onChangeText={setNewPw2} secureTextEntry placeholder="Nhập lại" />
      </Sheet>
    </View>
  );
}

// =========================================================== CHI TIẾT CÔNG VIỆC
// Biên lai linh kiện mua ngoài (báo giá đã duyệt): backend bắt gắn ảnh biên lai cho từng dòng trước khi nộp hoàn thành.
function ReceiptCard({ o, editable, onPreviewPhoto }) {
  const { a, ui: u } = useApp();
  const [busyId, setBusyId] = useState(null);
  const attachBusyRef = useRef(false);
  const reconciledSigRef = useRef('');
  const parts = o.externalParts || [];
  const missingSig = parts.filter((p) => !p.receiptId).map((p) => p.itemId).join(',');
  const evidenceCount = (o.evidence || []).length;

  useEffect(() => {
    if (!editable || !missingSig) return;
    const key = `${o.code}:${missingSig}:${evidenceCount}`;
    if (reconciledSigRef.current === key) return;
    reconciledSigRef.current = key;
    a.reconcilePartReceipts?.(o.code);
  }, [editable, missingSig, evidenceCount, o.code]);

  if (!parts.length) return null;
  const attach = async (part, useCamera = true) => {
    if (busyId || attachBusyRef.current) return;
    attachBusyRef.current = true;
    try {
      let uri = useCamera ? await pickCamera() : await pickImage();
      if (useCamera && uri === null) uri = await pickImage();
      if (uri === null) {
        u.alert('Chưa hỗ trợ máy ảnh', 'Cho phép máy ảnh hoặc chọn ảnh từ thư viện.', '📷');
        return;
      }
      if (!uri) return;
      setBusyId(part.itemId);
      await Promise.resolve(a.uploadPartReceipt(o.code, part.itemId, uri));
    } catch (e) {
      u.alert('Không tải được biên lai', toVietnamese(e?.message, 'Vui lòng thử lại.') || 'Vui lòng thử lại.', '📷');
    } finally {
      attachBusyRef.current = false;
      setBusyId(null);
    }
  };
  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={tx.h}>Biên lai linh kiện mua ngoài</Text>
      <Text style={[ui.meta, { marginBottom: 8 }]}>Chụp hoặc tải ảnh hoá đơn mua cho từng linh kiện. Thiếu biên lai thì chưa nộp hoàn thành được.</Text>
      {parts.map((p) => {
        // Ảnh biên lai đã gắn (ảnh DOCUMENT của việc) — hiện ngay tại dòng linh kiện, không nằm trong ảnh minh chứng.
        const receiptUri =
          p.receiptUrl ||
          (p.receiptId ? (o.evidence || []).find((e) => String(e.dbAttachmentId) === String(p.receiptId))?.uri : null);
        return (
          <View key={p.itemId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
            {receiptUri ? (
              <Tap
                style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface }}
                scaleTo={0.96}
                onPress={() => onPreviewPhoto?.({ uri: receiptUri, title: `Biên lai · ${p.name}` })}
              >
                <Image source={{ uri: receiptUri }} style={{ width: '100%', height: '100%' }} />
              </Tap>
            ) : (
              <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: p.receiptId ? C.greenSoft : C.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
                <AppIcon name="receipt-text" size={20} color={p.receiptId ? C.green : C.goldInk} strokeWidth={2.1} />
              </View>
            )}
            <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }} numberOfLines={2}>{p.name}</Text>
            {p.receiptId ? (
              <Badge text="Đã có biên lai" fg={C.greenInk} bg={C.greenSoft} />
            ) : editable ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Btn title={busyId === p.itemId ? 'Đang tải…' : 'Chụp ảnh'} small variant="soft" disabled={Boolean(busyId)} onPress={() => attach(p, true)} />
                <Btn title="Tải ảnh" small variant="ghost" disabled={Boolean(busyId)} onPress={() => attach(p, false)} />
              </View>
            ) : (
              <Badge text="Thiếu biên lai" fg={C.goldInk} bg={C.goldSoft} />
            )}
          </View>
        );
      })}
    </Card>
  );
}

// Các bước thực hiện của việc: checklist, chỉ số đo, ảnh (nếu bước yêu cầu) -> "Xong bước" gửi backend.
function ProcedureCard({ o, editable }) {
  const { a, ui: u } = useApp();
  const [openId, setOpenId] = useState(null);
  const [checked, setChecked] = useState([]);
  const [measures, setMeasures] = useState({});
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editable && openId != null) setOpenId(null);
  }, [editable, openId]);
  const proc = o.procedure;
  if (!proc) return null;
  const steps = (proc.services || []).flatMap((sv) => (sv.steps || []).map((st) => ({ ...st, service_name: sv.service_name })));
  const open = (st) => {
    if (busy || !editable || st.status !== 'PENDING') return;
    setOpenId(openId === st.step_id ? null : st.step_id);
    setChecked([...(st.items || [])]);
    setMeasures(Object.fromEntries((st.measures || []).map((m) => [m.key, st.measurements?.[m.key] != null ? String(st.measurements[m.key]) : ''])));
    setPhotos([]);
  };
  const addPhoto = async () => {
    let uri = await pickCamera();
    if (uri === null) uri = await pickImage();
    if (uri == null) {
      if (uri === null) u.alert('Chưa hỗ trợ máy ảnh', 'Cho phép máy ảnh hoặc chọn ảnh từ thư viện.', '📷');
      return;
    }
    setPhotos((p) => [...p, uri]);
  };
  const finish = async (st) => {
    const missing = (st.measures || []).filter((m) => String(measures[m.key] ?? '').trim() === '' || Number.isNaN(Number(measures[m.key])));
    if (missing.length) { u.alert('Thiếu chỉ số đo', `Nhập số cho: ${missing.map((m) => m.label).join(', ')}.`, 'wrench'); return; }
    if (st.require_photo && !photos.length && !(st.photo_ids || []).length) { u.alert('Thiếu ảnh', 'Bước này cần ít nhất 1 ảnh.', '📷'); return; }
    if (busy) return;
    setBusy(true);
    let res = null;
    try {
      res = await Promise.resolve(a.completeProcedureStep(o.code, st, {
        checkedItems: checked,
        measurements: Object.fromEntries(Object.entries(measures).map(([k, v]) => [k, Number(v)])),
        photoUris: photos,
      }));
    } catch (e) {
      res = { ok: false, error: toVietnamese(e?.message, 'Vui lòng thử lại.') || 'Vui lòng thử lại.' };
    } finally {
      setBusy(false);
    }
    if (!res?.ok) { u.alert('Chưa xong bước', res?.error || 'Vui lòng thử lại.', '⚠️'); return; }
    setOpenId(null);
    u.toast(`Đã xong bước ${st.step_no}`, '✅');
  };
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[tx.h, { marginBottom: 0 }]}>Các bước thực hiện</Text>
        <Badge text={`${proc.done_steps}/${proc.total_steps} bước`} fg={proc.done_steps === proc.total_steps ? C.green : C.primary} bg={proc.done_steps === proc.total_steps ? C.greenSoft : C.primarySoft} />
      </View>
      <Text style={[ui.meta, { marginTop: 4, marginBottom: 6 }]}>Đánh dấu xong các bước bắt buộc rồi mới nộp biên bản.</Text>
      {steps.map((st) => {
        const done = st.status !== 'PENDING';
        const isOpen = openId === st.step_id;
        return (
          <View key={st.step_id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10 }}>
            <Tap onPress={() => open(st)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? C.green : C.primarySoft }}>
                <Text style={{ color: done ? '#fff' : C.primary, fontWeight: '800', fontSize: 12 }}>{done ? '✓' : st.step_no}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>{st.title}{st.is_required ? '' : ' (không bắt buộc)'}</Text>
                <Text style={ui.meta}>
                  {st.service_name}{st.require_photo ? ' · cần ảnh' : ''}{(st.measures || []).length ? ' · có chỉ số đo' : ''}
                  {done ? ` · ${st.status === 'SKIPPED' ? 'Bỏ qua' : 'Đã xong'}` : (editable ? ' · bấm để làm' : '')}
                </Text>
              </View>
            </Tap>
            {isOpen ? (
              <View style={{ marginTop: 10, gap: 6 }}>
                {(st.items || []).map((it) => (
                  <Checkbox key={it} on={checked.includes(it)} label={it}
                    onPress={() => setChecked((p) => (p.includes(it) ? p.filter((x) => x !== it) : [...p, it]))} />
                ))}
                {(st.measures || []).map((m) => (
                  <Field key={m.key} label={`${m.label}${m.unit ? ` (${m.unit})` : ''}`} value={measures[m.key] ?? ''} keyboardType="decimal-pad"
                    onChangeText={(t) => setMeasures((p) => ({ ...p, [m.key]: t.replace(',', '.').replace(/[^0-9.-]/g, '') }))} />
                ))}
                {st.require_photo ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {photos.map((uri, i) => (
                      <View key={`${i}`} style={tx.thumb}>
                        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
                        <Tap style={tx.thumbX} onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text></Tap>
                      </View>
                    ))}
                    <Tap style={[tx.thumb, tx.thumbAdd]} onPress={addPhoto}>
                      <Text style={{ fontSize: 22, color: C.primary }}>＋</Text>
                      <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700' }}>Ảnh bước</Text>
                    </Tap>
                  </View>
                ) : null}
                <Btn title={busy ? 'Đang gửi…' : `Xong bước ${st.step_no}`} disabled={busy} onPress={() => finish(st)} />
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

export function TechJobScreen({ params }) {
  const { s, a, d, nav, ui: u } = useApp();
  const o = s.orders.find((x) => x.code === params.code);
  const cats = useMemo(() => [...new Set((o?.items || []).map((it) => getService(it.id)?.category || categorySlugOf('', it.name)).filter(Boolean))], [o]);
  const draft = useQuoteDraft(o);
  const next = useNextAction({ inDetail: true })(o);
  const { run, isBusy } = useBusyRunner();
  const [matMode, setMatMode] = useState(null); // 'quote' | 'usage'
  const [showPreQuote, setShowPreQuote] = useState(false);
  const [matAll, setMatAll] = useState(false);
  const [repairNote, setRepairNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [showRelease, setShowRelease] = useState(false);
  const [reason, setReason] = useState(DECLINE_REASONS[0]);
  const [reasonNote, setReasonNote] = useState('');
  const [releaseReason, setReleaseReason] = useState(RELEASE_REASONS[0]);
  const [releaseNote, setReleaseNote] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [showFinalizeExt, setShowFinalizeExt] = useState(false);
  const [previewTechPhoto, setPreviewTechPhoto] = useState(null);
  const [summary, setSummary] = useState('');
  const [extraBillParts, setExtraBillParts] = useState([]);
  const [refreshingJob, setRefreshingJob] = useState(false);
  const onRefreshJob = async () => {
    setRefreshingJob(true);
    try { await Promise.resolve(a.syncFromBackend?.(null, true)); } catch (_e) { /* giữ dữ liệu cũ */ } finally { setRefreshingJob(false); }
  };
  const aRef = useRef(a);
  aRef.current = a;
  const jobReqId = o?.dbRequestId || null;

  const myTechCode = s.techProfile?.code || TECH_ME.code;
  const mine = Boolean(o) && (
    Boolean(o.assignmentActive)
    || (Boolean(o.dbAssignmentId) && (!o.tech?.code || !myTechCode || o.tech.code === myTechCode))
    || (Boolean(myTechCode) && o.tech?.code === myTechCode)
  );

  useEffect(() => {
    setExtraBillParts([]);
  }, [o?.code]);

  useEffect(() => {
    if (o?.status !== 'confirmed' && showPreQuote) setShowPreQuote(false);
  }, [o?.status, showPreQuote]);

  useEffect(() => {
    if (!jobReqId) return undefined;
    aRef.current?.joinOrderRoom?.(jobReqId);
    return () => {
      aRef.current?.leaveOrderRoom?.(jobReqId);
    };
  }, [jobReqId]);

  useEffect(() => {
    if (jobReqId && mine) {
      resubscribeOrderRoom(jobReqId);
    }
  }, [jobReqId, mine]);

  if (!o) {
    return (
      <NotFoundView
        title="Không tìm thấy công việc"
        body="Công việc này không tồn tại, đã chuyển cho thợ khác hoặc chưa đồng bộ."
        onBack={() => nav.back()}
      />
    );
  }
  const orderPaid = isPaid(o);
  const meta = techStatusMeta(o);
  const step = techStepIndexOf(o);
  // Việc của mình: phân công đang ACTIVE (server xác nhận). So mã thợ chỉ để dự phòng khi mã có thật (khác rỗng).
  const editable = mine || o.status === 'pending';
  const isFreeFollowUpOrder = o.kind === 'warranty' || o.kind === 'followup';
  const techSteps = isFreeFollowUpOrder
    ? TECH_ORDER_STEPS.filter((st) => st.key !== 'pending_payment')
    : TECH_ORDER_STEPS;
  const payStepPos = TECH_ORDER_STEPS.findIndex((st) => st.key === 'pending_payment');
  const techStepPos = isFreeFollowUpOrder && payStepPos >= 0 && step > payStepPos ? step - 1 : step;
  const techDesc = meta.desc || TECH_STATUS_DESC[o.status] || '';
  const canRelease = mine && ['confirmed', 'onway', 'diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(o.status);
  const releaseAssess = canRelease ? assessCancelAfterAccept(o) : null;
  const iDeclined = declinedCodesOf(s, d).includes(o.code);

  // Cờ đang xử lý (chống bấm đúp)
  const K = {
    accept: `accept:${o.code}`,
    decline: `decline:${o.code}`,
    quote: `quote:${o.code}`,
    progress: `progress:${o.code}`,
    note: `note:${o.code}`,
    cash: `cash:${o.code}`,
    release: `release:${o.code}`,
  };
  const busyAccept = isBusy(K.accept);
  const busyDecline = isBusy(K.decline);
  const busyQuote = isBusy(K.quote);
  const busyNote = isBusy(K.note);
  const busyCash = isBusy(K.cash);
  const busyRelease = isBusy(K.release);
  const succeeded = (res) => res !== undefined && res !== false && !(res && typeof res === 'object' && res.ok === false);

  // ---- báo giá ----
  const onSiteQuote = isOnSiteQuote(o);
  const prodDisc = Number(o.productDiscount) || 0;
  const comboDisc = Number(o.comboDiscount) || 0;
  const partDisc = tierPartDiscountAmount(o);
  const voucherDisc = Number(o.voucherDiscount) || 0;
  const lateDisc = lateDiscountAmount(o);
  const priorApprovedExtra = o.quote?.approved
    ? (Number(o.quote?.approvedExtrasTotal) || 0)
    : (Number(o.quote?.priorApprovedExtra) || 0);
  const draftRange = computeQuoteRangeTotals(draft.lines, {
    bookedBase: bookedValue(o),
    priorApprovedExtra,
    prodDisc,
    comboDisc,
    partDisc,
    voucherDisc,
    lateDisc,
    isOnSite: onSiteQuote,
  });
  const hasDraftRange = draftRange.hasEstimatedRange;
  const extraItems = draft.lines.filter((l) => !l.isOriginal);
  const extraTotal = draftRange.extraMax;
  const deductDraft = partDisc + voucherDisc + lateDisc;
  const diffMin = onSiteQuote ? draftRange.extraMin : Math.max(0, draftRange.grossTotalMin - bookedValue(o));
  const diffMax = onSiteQuote ? draftRange.extraMax : Math.max(diffMin, draftRange.grossTotalMax - bookedValue(o));
  const netDraftTotal = draftRange.totalMax;
  const mats = MATERIALS.filter((m) => matAll || m.category === 'all' || cats.includes(m.category));
  const addPart = (m) => {
    if (matMode === 'usage') {
      run(`mat-add:${o.code}:${m.id}`, () => a.addMaterial(o.code, m)).then((res) => {
        if (succeeded(res)) setMatMode(null);
      });
      return;
    }
    const p = Number(m.price) || 0;
    draft.setLines((prev) => (
      prev.some((l) => l.key === m.id)
        ? prev.map((l) => (l.key === m.id ? { ...l, qty: l.qty + 1 } : l))
        : [...prev, { key: m.id, type: 'part', matId: m.id, name: m.name, unit: m.unit, qty: 1, price: p, ...(p <= 0 ? { needsPriceInput: true } : {}) }]
    ));
    setMatMode(null);
  };
  const sendQuote = () => {
    const missingActionItem = (draft.symptomItems || []).find((it) => !it.action);
    if (missingActionItem) {
      u.alert('Thiếu hướng giải quyết', `Vui lòng chọn hướng giải quyết (Thay thế hoặc Sửa chữa) cho triệu chứng "${missingActionItem.title}".`, '🛠️');
      return;
    }
    const symptoms = buildSymptomsSummary(draft.tags, draft.symptomItems);
    const diag = draft.diagnosis.trim();
    const manualReco = draft.recommendation.trim();
    const autoReco = buildSymptomRecommendationFallback(draft.symptomItems);
    const reco = manualReco
      ? (autoReco && !manualReco.toLowerCase().includes(autoReco.toLowerCase()) ? `${autoReco}. ${manualReco}` : manualReco)
      : autoReco;
    if (onSiteQuote) {
      if (!symptoms && !diag) {
        u.alert('Thiếu chẩn đoán', 'Chọn triệu chứng hoặc nhập kết luận chẩn đoán trước khi gửi.', '🔍');
        return;
      }
      if (!reco) {
        u.alert('Thiếu đề xuất', 'Ghi đề xuất xử lý hoặc chọn hướng giải quyết cho triệu chứng trước khi gửi báo giá.', '🧾');
        return;
      }
    }
    const missingPriceLine = draft.lines.find((l) => !l.isOriginal && !l.isEstimatedRange && !(Number(l.price) > 0));
    if (missingPriceLine) {
      u.alert('Thiếu đơn giá vật tư', `Vui lòng nhập đơn giá lớn hơn 0đ cho "${missingPriceLine.name || 'vật tư / phát sinh'}" trước khi gửi báo giá.`, '⚠️');
      return;
    }
    const text = [symptoms, diag].filter(Boolean).join('. ');
    const hasExtra = draft.lines.some((l) => !l.isOriginal);
    if (o.kind === 'warranty' && hasExtra) {
      u.alert(
        'Đơn bảo hành miễn phí (0đ)',
        'Nếu thiết bị hư hỏng ngoài phạm vi bảo hành và cần báo giá có phí, hãy bấm «Từ chối bảo hành → Báo giá có phí» trước.',
        'shield-alert',
      );
      return;
    }
    // Tại nhà khách không có phát sinh: không gửi báo giá (nếu gửi, dịch vụ đã đặt bị tính 2 lần), chỉ ghi chẩn đoán rồi làm.
    if (onSiteQuote && !hasExtra) {
      run(K.quote, () => a.startRepairWithoutQuote(o.code, { diagnosis: text, symptoms, recommendation: reco }))
        .then((res) => { if (succeeded(res)) draft.markSaved(); });
      return;
    }
    if (!draft.lines.length) {
      u.alert('Báo giá trống', 'Thêm ít nhất một dòng công / vật tư trước khi gửi.', '🧾');
      return;
    }
    run(K.quote, () => a.submitQuote(o.code, {
      diagnosis: text,
      symptoms,
      recommendation: reco,
      lines: draft.lines.map(({ key, ...l }) => l),
    })).then((res) => {
      if (succeeded(res)) { draft.markSaved(); setShowPreQuote(false); }
    });
  };
  const submitRepairNote = () => {
    const note = repairNote.trim();
    if (!note) { u.alert('Thiếu nội dung', 'Nhập ghi chú công việc đã làm.', '📝'); return; }
    run(K.note, () => a.addRepairNote(o.code, note)).then((res) => {
      if (succeeded(res)) setRepairNote('');
    });
  };

  const evidence = o.evidence || [];
  const openComplete = () => {
    const names = (o.items || []).map((it) => getService(it.id)?.name || it.name).filter(Boolean).join(', ');
    const defaultSum = `Đã hoàn thành: ${names || 'dịch vụ kỹ thuật'}.${o.quote?.diagnosis ? ` Tình trạng: ${o.quote.diagnosis}.` : ''} Thiết bị hoạt động ổn định, đã dọn dẹp khu vực.`;
    setSummary(defaultSum);
    if (getPendingExternalEstimates(o).length > 0 || o.externalPriceState === 'revision_requested' || extraBillParts.length > 0) {
      setShowFinalizeExt(true);
      return;
    }
    const pendingSteps = (o.procedure?.services || []).flatMap((sv) => sv.steps || []).filter((st) => st.is_required && st.status === 'PENDING');
    if (pendingSteps.length) {
      u.alert('Chưa xong các bước thực hiện', `Còn ${pendingSteps.length} bước bắt buộc chưa xong:\n${pendingSteps.map((st) => `• Bước ${st.step_no}: ${st.title}`).join('\n')}`, '📋');
      return;
    }
    setShowDone(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={o.kind === 'warranty' ? 'Việc bảo hành' : 'Chi tiết công việc'} sub={o.code} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshingJob} onRefresh={onRefreshJob} tintColor={C.primary} colors={[C.primary]} />}
      >
        {/* Trạng thái */}
        <View style={[tx.hero, { backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: meta.fg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={[tx.heroLabel, { color: C.ink, flex: 1 }]}>{meta.label}</Text>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: meta.fg }} />
          </View>
          <Text style={[tx.heroDesc, { color: C.ink2 }]}>{o.status === 'cancelled' ? (o.cancelReason || TECH_STATUS_DESC.cancelled) : techDesc}</Text>
          {o.status !== 'cancelled' ? (
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
              {techSteps.map((st, i) => <View key={st.key} style={[tx.stepBar, { backgroundColor: i <= techStepPos ? meta.fg : C.line }]} />)}
            </View>
          ) : null}
          {o.status !== 'cancelled' && techStepPos >= 0 ? (
            <Text style={[ui.meta, { color: C.muted, marginTop: 6, fontWeight: '700' }]}>
              Bước {techStepPos + 1}/{techSteps.length}: {o.status === 'quoted' && o.quote?.isExternalFinalization ? 'Xác nhận hoá đơn chi phí cuối' : techSteps[techStepPos].label}
            </Text>
          ) : null}
        </View>
        {o.status === 'pending' && iDeclined ? (
          <View style={tx.offline}><Text style={{ color: C.goldInk, fontWeight: '700' }}>Bạn đã từ chối việc này. Vẫn có thể nhận lại nếu còn trống lịch.</Text></View>
        ) : null}
        {o.status === 'onway' ? <TrackingCard order={o} compact /> : null}

        {o.checkIn ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <Text style={tx.h}>Nhật ký xác nhận đến nơi</Text>
            <Text style={{ color: C.ink2, marginTop: 6, lineHeight: 20 }}>
              {o.checkIn.label || 'Đã xác thực vị trí'}
              {o.checkIn.at ? ` · ${fmtDateTime(o.checkIn.at)}` : ''}
            </Text>
            {o.checkIn.lat != null ? (
              <Text style={[ui.meta, { marginTop: 4 }]}>
                {Number(o.checkIn.lat).toFixed(5)}, {Number(o.checkIn.lng).toFixed(5)}
                {o.checkIn.accuracy != null ? ` · ±${o.checkIn.accuracy}m` : ''}
              </Text>
            ) : null}
            {o.lateCompensation ? (
              <Text style={[ui.meta, { color: C.goldInk, fontWeight: '700', marginTop: 6 }]}>
                {(o.lateCompensation.minutesLate || o.lateCompensation.minutes)
                  ? `Muộn ${o.lateCompensation.minutesLate || o.lateCompensation.minutes} phút · đã ghi nhận chính sách`
                  : 'Đến nơi muộn · đã ghi nhận chính sách'}
              </Text>
            ) : o.arrivedAt ? (
              <Text style={[ui.meta, { color: C.green, fontWeight: '700', marginTop: 6 }]}>Đúng chính sách giờ hẹn</Text>
            ) : null}
          </Card>
        ) : null}

        {o.status === 'pending_payment' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
            <Text style={{ fontWeight: '800', color: C.goldInk, fontSize: 13.5 }}>
              CHỜ KHÁCH THANH TOÁN
            </Text>
            <Text style={{ color: C.ink2, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
              Bạn đã bấm hoàn thành. Khi khách thanh toán đủ, đơn sẽ chuyển sang Hoàn thành.
            </Text>
            {/* Tiền mặt: khách bấm "đã trả" chỉ là báo; thợ xác nhận đã nhận thì đơn mới tính là đã trả. */}
            {mine && !isQRPayment(o) && !orderPaid && cashToCollect(o) > 0 ? (
              <>
                {o.bill?.cashClaimPending ? (
                  <Text style={{ color: C.goldInk, fontSize: 12.5, marginTop: 6, fontWeight: '700' }}>Khách báo đã trả tiền mặt — xác nhận nếu bạn đã nhận đủ.</Text>
                ) : null}
                <Btn
                  title={busyCash ? 'Đang xác nhận…' : `Đã nhận tiền mặt ${formatVND(cashToCollect(o))}`}
                  icon="banknote"
                  small
                  disabled={busyCash}
                  style={{ marginTop: 10 }}
                  onPress={() => u.confirm(
                    'Xác nhận đã nhận tiền mặt?',
                    `Bạn xác nhận đã nhận đủ ${formatVND(cashToCollect(o))} tiền mặt của khách cho đơn ${o.code}.`,
                    () => run(K.cash, () => a.confirmCashReceived(o.code)),
                    'Đã nhận',
                  )}
                />
              </>
            ) : null}
          </Card>
        ) : null}

        {/* ===== Đã gửi yêu cầu tái khám ===== */}
        {o.followUpRequested ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <Text style={{ fontWeight: '800', color: C.primary, fontSize: 13.5 }}>ĐÃ GỬI YÊU CẦU HẸN TÁI KHÁM</Text>
            <Text style={{ color: C.ink2, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
              Lý do: <Text style={{ fontWeight: '700' }}>{o.followUpReason || 'Chờ linh kiện phụ tùng'}</Text>. Quản lý kỹ thuật Minh Đức đang lên lịch hẹn tái khám tiếp theo.
            </Text>
          </Card>
        ) : null}

        {o.status === 'pending' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: C.primary, fontSize: 13.5 }}>CA ĐƯỢC HỆ THỐNG PHÂN CÔNG</Text>
            </View>
            {(() => {
              const m = matchJobForTech(o, s.techProfile || TECH_ME);
              const svcCat = (o.items || [])[0]?.id ? getService((o.items || [])[0].id)?.category : '';
              const resolvedCat = svcCat || (o.items || [])[0]?.category || o.device?.category || '';
              const resolvedArea = o.address?.area || o.address?.district || 'của bạn';
              return (
                <>
                  <Text style={{ color: C.ink2, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
                    {m.skillMatch && m.areaMatch
                      ? `Hệ thống đã khớp chuyên môn ${catLabel(resolvedCat)} và khu vực ${resolvedArea}. Vui lòng xác nhận tiếp nhận ca để đưa vào lịch trình làm việc.`
                      : `Ca mới thuộc nhóm ${catLabel(resolvedCat)} tại ${resolvedArea}. Kiểm tra thông tin bên dưới trước khi tiếp nhận ca.`}
                  </Text>
                  <View style={{ marginTop: 8, gap: 4 }}>
                    <Text style={{ fontSize: 12, color: m.skillMatch ? C.greenInk : C.goldInk, fontWeight: '600' }}>
                      {m.skillMatch ? '✓ Đúng chuyên môn' : '⚠ Trái chuyên môn'}: {catLabel(resolvedCat)}
                    </Text>
                    <Text style={{ fontSize: 12, color: m.areaMatch ? C.primary : C.muted, fontWeight: '600' }}>
                      {m.areaMatch ? '✓ Trong khu vực phụ trách' : '• Ngoài khu vực phụ trách'}: {o.address?.area || o.address?.district || 'Gần bạn'}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.ink2, fontWeight: '600' }}>✓ Khung giờ hẹn: {o.dateLabel} · {o.slot}</Text>
                  </View>
                </>
              );
            })()}
          </Card>
        ) : null}

        {/* Lịch sử trạng thái */}
        <Card style={{ marginTop: 12 }}>
          <Text style={tx.h}>Dòng thời gian</Text>
          {(o.history || []).map((h, i, arr) => {
            const hm = STATUS_META[h.status] || STATUS_META.pending;
            const last = i === arr.length - 1;
            return (
              <View key={`${h.status}-${h.at}-${i}`} style={tx.histRow}>
                <View style={tx.histRail}>
                  <View style={[tx.histDot, { backgroundColor: hm.fg }]} />
                  {!last ? <View style={tx.histLine} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
                  <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>{hm.label}</Text>
                  <Text style={[ui.meta, { marginTop: 2 }]}>{fmtDateTime(h.at)}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        {/* Khách hàng */}
        <Card style={{ marginTop: 12 }}>
          <Text style={tx.h}>Khách hàng</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBox icon="user" size={46} bg={C.primarySoft} radius={15} />
            <View style={{ flex: 1 }}>
              <Text style={tx.name}>{o.address?.gender === 'Nữ' ? 'Chị' : 'Anh'} {o.address?.name}</Text>
              <Text style={ui.meta}>{o.address?.phone}</Text>
            </View>
            {(mine || o.status === 'pending') && o.address?.phone && !String(o.address.phone).includes('*') ? (
              <IconBtn icon="phone-call" onPress={() => callPhone(o.address?.phone)} style={{ backgroundColor: C.greenSoft }} label="Gọi khách" />
            ) : null}
          </View>
          <Tap style={tx.addrBox} disabled={!mine && o.status !== 'pending'} onPress={() => openMap(o.address?.full)}>
            <AppIcon name="map-pin" size={16} color={C.primary} strokeWidth={2.2} />
            <Text style={{ flex: 1, color: C.ink, fontWeight: '600', lineHeight: 20 }}>{o.address?.full}</Text>
            {(mine || o.status === 'pending') ? <Text style={ui.link}>Chỉ đường</Text> : null}
          </Tap>
        </Card>

        {/* Lịch hẹn + dịch vụ */}
        <Card style={{ marginTop: 12 }}>
          <Text style={tx.h}>Lịch hẹn & yêu cầu</Text>
          {o.customerTierLabel ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <Badge text={`👑 Khách hạng ${o.customerTierLabel}${o.warrantyDays > 0 ? ` · BH ${o.warrantyDays} ngày` : ''}`} fg={C.primary} bg={C.primarySoft} />
            </View>
          ) : null}
          <Text style={tx.info}>📅 {o.dateLabel} · {o.slot}</Text>
          {o.device ? (
            <Text style={[tx.info, { marginTop: 6 }]}>
              📺 Thiết bị tại nhà: {catLabel(o.device.category)}{o.device.brand ? ` · ${o.device.brand}` : ''}{o.device.room ? ` (${o.device.room})` : ''}{o.device.serial ? ` · Số sê-ri: ${o.device.serial}` : ''}
            </Text>
          ) : null}
          {o.siteCondition ? (
            <Text style={[tx.info, { marginTop: 6 }]}>
              🏢 Vị trí thi công: {o.siteCondition.label} ({o.siteCondition.note})
            </Text>
          ) : null}
          {o.note ? <Text style={[tx.info, { marginTop: 6 }]}>📝 “{o.note}”</Text> : null}
          {(o.attachments || []).length ? (
            <View style={{ marginTop: 8 }}>
              <Text style={[ui.meta, { fontWeight: '700', marginBottom: 6 }]}>Hình ảnh triệu chứng ban đầu ({o.attachments.length})</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {o.attachments.map((att) => (
                  <Tap
                    key={att.id}
                    style={tx.thumb}
                    onPress={() => att.uri && setPreviewTechPhoto({ uri: att.uri, title: att.note || 'Hình ảnh triệu chứng ban đầu' })}
                    scaleTo={0.97}
                  >
                    {att.uri ? <Image source={{ uri: att.uri }} style={{ width: '100%', height: '100%' }} /> : <AppIcon name="image" size={22} color={C.muted} />}
                  </Tap>
                ))}
              </View>
            </View>
          ) : null}
          <Text style={[tx.info, { marginTop: 6 }]}>💳 {o.payment}</Text>
          {o.kind !== 'warranty' ? (
            isQRPayment(o) ? (
              <View
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: R.md,
                  backgroundColor: C.surface,
                  borderWidth: 1,
                  borderColor: C.line,
                  borderLeftWidth: 3.5,
                  borderLeftColor: orderPaid ? C.green : C.gold,
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <AppIcon name={orderPaid ? 'check-circle-2' : 'alert-triangle'} size={16} color={orderPaid ? C.green : C.gold} strokeWidth={2.3} />
                    <Text style={{ fontWeight: '800', color: orderPaid ? C.greenInk : C.goldInk, fontSize: 13, flex: 1 }}>
                      {orderPaid ? 'Khách đã chuyển khoản VietQR thành công' : 'Khách chuyển khoản QR · KHÔNG THU TIỀN MẶT'}
                    </Text>
                  </View>
                  <Badge
                    text={orderPaid ? 'ĐÃ CHUYỂN KHOẢN' : 'KHÔNG THU TIỀN'}
                    fg={orderPaid ? C.greenInk : C.goldInk}
                    bg={orderPaid ? C.greenSoft : C.goldSoft}
                  />
                </View>
                <Text style={{ fontSize: 12.5, color: C.ink2, lineHeight: 18 }}>
                  {orderPaid
                    ? `Khách đã chuyển khoản đủ ${formatVND(orderTotal(o))} qua VietQR.`
                    : `Khách thanh toán ${o.status === 'pending_payment' ? formatVND(amountRemaining(o)) : formatOrderTotal(o)} qua mã VietQR trên ứng dụng Khách hàng. Kỹ thuật viên tuyệt đối KHÔNG thu tiền mặt.`}
                </Text>
              </View>
            ) : (
              <View
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: R.md,
                  backgroundColor: C.surface,
                  borderWidth: 1,
                  borderColor: C.line,
                  borderLeftWidth: 3.5,
                  borderLeftColor: orderPaid ? C.green : C.primary,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: orderPaid ? C.greenInk : C.ink, fontSize: 13 }}>
                    {orderPaid
                      ? '✓ Đã thu tiền mặt tại nhà'
                      : `Đơn thu tiền mặt tại nhà: ${(o.status === 'quoted' || o.quote?.hasEstimatedRange || o.quote?.approvedHasEstimatedRange) && !['pending_payment', 'done'].includes(o.status) ? formatOrderTotal(o) : formatVND(cashToCollect(o))}`}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.ink2, marginTop: 2 }}>
                    {orderPaid ? 'Đã đối soát thanh toán hoàn tất.' : 'Kỹ thuật viên trực tiếp thu tiền mặt từ khách sau khi nghiệm thu.'}
                  </Text>
                </View>
                <Badge text={orderPaid ? 'Hoàn thành' : 'Thu trực tiếp'} fg={orderPaid ? C.greenInk : C.primary} bg={orderPaid ? C.greenSoft : C.primarySoft} />
              </View>
            )
          ) : null}
          <View style={{ marginTop: 10, gap: 8 }}>
            {o.items.map((it) => {
              const sv = getService(it.id);
              return (
                <View key={it.id} style={tx.svcRow}>
                  <AppIcon icon={sv?.icon} size={20} color={C.primary} strokeWidth={2.1} />
                  <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }} numberOfLines={2}>{sv?.name || it.name || 'Dịch vụ kỹ thuật'}</Text>
                  <Text style={{ color: C.ink2, fontWeight: '800' }}>x{it.qty}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Báo giá trước khi xuất phát (Thợ chủ động thỏa thuận trước khi đi) */}
        {o.status === 'confirmed' && mine && !o.quote && o.kind !== 'warranty' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>Báo giá trước khi xuất phát</Text>
                <Text style={[ui.meta, { marginTop: 2, lineHeight: 18 }]}>
                  Thỏa thuận chi phí trên ứng dụng trước. Khách đồng ý bạn mới di chuyển. Khách từ chối huỷ miễn phí.
                </Text>
              </View>
              <Btn
                title={showPreQuote ? 'Đóng lại' : 'Lập báo giá'}
                variant={showPreQuote ? 'ghost' : 'soft'}
                small
                onPress={() => setShowPreQuote((p) => !p)}
              />
            </View>
          </Card>
        ) : null}

        {/* ===== Chẩn đoán & báo giá ===== */}
        {(o.status === 'diagnosing' || o.status === 'out_of_warranty' || (o.status === 'confirmed' && (showPreQuote || o.quote?.revisionRequested))) && mine && !(o.quote?.isExternalFinalization && o.quote?.revisionRequested) ? (
          <QuoteEditor
            o={o}
            draft={draft}
            cats={cats}
            matsCount={mats.length}
            onOpenMaterials={() => setMatMode('quote')}
            onCancelEdit={() => setShowPreQuote(false)}
            evidence={evidence}
          />
        ) : null}

        {/* ===== Khách yêu cầu kiểm tra lại giá vật tư mua ngoài ===== */}
        {mine && o.quote?.isExternalFinalization && o.quote?.revisionRequested ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
            <Text style={[tx.h, { color: C.goldInk, marginBottom: 4 }]}>Khách yêu cầu kiểm tra lại giá vật tư mua ngoài</Text>
            <Text style={{ color: C.ink2, lineHeight: 20 }}>
              Lý do: <Text style={{ fontWeight: '800' }}>{o.quote.rejectReason || 'Cần đối chiếu lại giá / hoá đơn mua ngoài'}</Text>
            </Text>
            <View style={{ marginTop: 12 }}>
              <Btn
                title="Nhập lại giá thực tế & gửi nghiệm thu"
                icon="receipt-text"
                onPress={() => setShowFinalizeExt(true)}
              />
            </View>
          </Card>
        ) : null}

        {/* ===== Đang chờ khách xác nhận hoá đơn chi phí cuối ===== */}
        {mine && o.externalPriceState === 'awaiting_customer_approval' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <Text style={{ fontWeight: '800', color: C.primary, fontSize: 13.5 }}>Đang chờ khách xác nhận hoá đơn chi phí cuối</Text>
            <Text style={[ui.meta, { color: C.ink2, marginTop: 4, lineHeight: 18 }]}>
              Bạn đã gửi mức giá vật tư phát sinh cuối cùng. Khi khách xác nhận tổng hoá đơn, bạn chỉ cần bấm “Ký bàn giao & Mở TT” để hoàn tất.
            </Text>
          </Card>
        ) : null}

        {/* ===== Báo giá đã gửi ===== */}
        {o.quote && !(mine && ['diagnosing', 'confirmed', 'out_of_warranty'].includes(o.status) && ((o.quote.revisionRequested && !o.quote.isExternalFinalization) || showPreQuote)) ? (
          <Card style={{ marginTop: 12 }}>
            {(() => {
              // Báo giá trước khi đi (status confirmed) chưa duyệt và chưa bị từ chối = đang chờ khách.
              const waiting = !o.quote.approved && (o.status === 'quoted' || (o.status === 'confirmed' && !o.quote.rejectReason && !o.quote.revisionRequested));
              const isRevise = Boolean(o.quote.revisionRequested);
              const qRange = computeQuoteRangeTotals(o.quote.lines || [], {
                bookedBase: o.quote.booked ?? bookedValue(o),
                priorApprovedExtra: o.quote.effectivePriorExtra ?? (
                  o.quote.includesPriorApprovedLines
                    ? (Number(o.quote.initialServiceDelta) || 0)
                    : (Number(o.quote.priorApprovedExtra) || 0)
                ),
                prodDisc,
                comboDisc,
                partDisc,
                voucherDisc,
                lateDisc,
                isOnSite:
                  o.quote.quotationType === 'SUPPLEMENTAL' ||
                  Boolean(o.quote.includesPriorApprovedLines) ||
                  !(o.quote.lines || []).some((l) => l.isOriginal),
              });
              const displayQuoteTotal = o.quote.hasEstimatedRange && qRange.hasEstimatedRange
                ? formatRangeVND(qRange.totalMin, qRange.totalMax)
                : formatVND(Math.max(0, (Number(o.quote.total) || 0) - partDisc - voucherDisc - lateDisc));
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={tx.h}>{o.quote.isExternalFinalization ? 'Chốt giá vật tư ngoài' : 'Chẩn đoán & báo giá'}</Text>
                    <Badge
                      text={o.quote.approved ? 'Đã duyệt' : waiting ? (o.quote.isExternalFinalization ? 'Chờ khách xác nhận hoá đơn' : 'Chờ khách duyệt') : isRevise ? 'Yêu cầu báo giá lại' : 'Bị từ chối'}
                      fg={o.quote.approved ? C.greenInk : (waiting || isRevise) ? C.goldInk : C.redInk}
                      bg={o.quote.approved ? C.greenSoft : (waiting || isRevise) ? C.goldSoft : C.redSoft}
                    />
                  </View>
                  <View style={{ marginBottom: 8 }}>
                    <SymptomBreakdownView
                      symptoms={o.quote.symptoms}
                      diagnosis={o.quote.diagnosis}
                      recommendation={o.quote.recommendation}
                      evidence={evidence}
                      initialAttachments={o.attachments}
                    />
                  </View>
                  {(() => {
                    const { lineReceipts, unmatchedReceipts } = matchReceiptsToQuoteLines(o.quote.lines || [], evidence);
                    return (
                      <>
                        {(o.quote.lines || []).map((l, i) => {
                          const receiptEv = lineReceipts.get(i) || null;
                          return (
                            <View key={`${l.name}-${i}`}>
                              <View style={tx.qRow}>
                                <AppIcon name={l.type === 'part' ? 'settings' : 'hammer'} size={13} color={C.ink2} style={{ marginTop: 2 }} />
                                <Text style={{ flex: 1, color: C.ink2 }} numberOfLines={2}>
                                  {l.name} x{l.qty}{l.isEstimatedRange ? ' (Giá dao động)' : l.isFinalizedExternal ? ' (VT ngoài chốt giá)' : ''}
                                </Text>
                                <Text style={{ color: l.isEstimatedRange ? C.orange : C.ink, fontWeight: '700' }}>
                                  {l.isEstimatedRange
                                    ? formatRangeVND(l.minPrice * l.qty, l.maxPrice * l.qty)
                                    : formatVND((l.isFinalizedExternal && l.actualPrice != null ? l.actualPrice : l.price) * l.qty)}
                                </Text>
                              </View>
                              {receiptEv?.uri ? (
                                <Tap
                                  style={{ marginLeft: 19, marginTop: 4, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}
                                  scaleTo={0.97}
                                  onPress={() => setPreviewTechPhoto({ uri: receiptEv.uri, title: `Hoá đơn mua ngoài · ${l.name}` })}
                                >
                                  <Image source={{ uri: receiptEv.uri }} style={{ width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }} />
                                  <Text style={[ui.meta, { fontSize: 11, color: C.primary }]}>Hoá đơn đính kèm · Chạm để xem</Text>
                                </Tap>
                              ) : null}
                            </View>
                          );
                        })}
                        {unmatchedReceipts.length ? (
                          <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.line }}>
                            <Text style={[ui.meta, { fontSize: 12, fontWeight: '700', color: C.ink2, marginBottom: 6 }]}>
                              Hoá đơn / biên lai đính kèm ({unmatchedReceipts.length})
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {unmatchedReceipts.map((rEv, rIdx) => (
                                <Tap
                                  key={rEv.id || `tech_unmatched_rcpt_${rIdx}`}
                                  style={{ alignItems: 'flex-start' }}
                                  scaleTo={0.97}
                                  onPress={() => setPreviewTechPhoto({ uri: rEv.uri, title: rEv.note || 'Hoá đơn / biên lai đính kèm' })}
                                >
                                  <Image source={{ uri: rEv.uri }} style={{ width: 54, height: 54, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }} />
                                </Tap>
                              ))}
                            </View>
                          </View>
                        ) : null}
                      </>
                    );
                  })()}
                  {o.productDiscount ? (
                    <View style={tx.qRow}>
                      <AppIcon name="tag" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Giảm giá dịch vụ</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(o.productDiscount)}</Text>
                    </View>
                  ) : null}
                  {o.comboDiscount ? (
                    <View style={tx.qRow}>
                      <AppIcon name="percent" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Ưu đãi {o.comboLabel || 'gộp nhiều máy (-5%)'}</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(o.comboDiscount)}</Text>
                    </View>
                  ) : null}
                  {partDisc > 0 ? (
                    <View style={tx.qRow}>
                      <AppIcon name="award" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Ưu đãi hạng thành viên (−{o.bill?.tierPartDiscountPercent || 0}% VT)</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(partDisc)}</Text>
                    </View>
                  ) : null}
                  {voucherDisc > 0 ? (
                    <View style={tx.qRow}>
                      <AppIcon name="ticket" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Mã giảm giá {o.voucher?.code || ''}</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(voucherDisc)}</Text>
                    </View>
                  ) : null}
                  {lateDisc > 0 ? (
                    <View style={tx.qRow}>
                      <AppIcon name="clock" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Bồi thường đến muộn</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(lateDisc)}</Text>
                    </View>
                  ) : null}
                  <View style={tx.totalRow}>
                    <Text style={{ fontWeight: '800', color: C.ink }}>{o.quote.hasEstimatedRange ? 'Tổng (dự kiến)' : 'Tổng'}</Text>
                    <Text style={[ui.price, { fontSize: 17 }]}>{displayQuoteTotal}</Text>
                  </View>
                </>
              );
            })()}
            {o.quote.rejectReason ? (
              <Text style={[ui.meta, { color: o.quote.revisionRequested ? C.goldInk : C.red }]}>
                {o.quote.revisionRequested ? 'Lý do khách yêu cầu báo giá lại: ' : 'Lý do khách từ chối: '}
                {o.quote.rejectReason}
              </Text>
            ) : null}
            {mine && o.quote.revisionRequested && o.status !== 'quoted' && !o.quote.isExternalFinalization ? (
              <View style={{ marginTop: 12 }}>
                <Btn
                  title="Sửa & gửi lại báo giá cho khách"
                  icon="pencil"
                  small
                  onPress={() => {
                    setShowPreQuote(true);
                    a.reopenQuote(o.code);
                  }}
                />
              </View>
            ) : null}
            {o.status === 'quoted' && mine ? (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={ui.meta}>
                  Đã gửi {fmtDateTime(o.quote.at)}
                  {o.quote.remindedAt ? ` · Nhắc lần cuối ${fmtDateTime(o.quote.remindedAt)}` : ''}
                </Text>
                {/* Báo giá đang chờ khách duyệt (SENT): server không nhận báo giá mới (409 QUOTATION_PENDING) -> chỉ nhắc khách.
                    Sửa lại báo giá khi khách đã yêu cầu báo giá lại. */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {o.quote.revisionRequested && !o.quote.isExternalFinalization ? (
                    <Btn
                      title="Sửa báo giá theo yêu cầu khách"
                      icon="pencil"
                      variant="outline"
                      small
                      style={{ flex: 1.15 }}
                      onPress={() => a.reopenQuote(o.code)}
                    />
                  ) : null}
                  {!o.quote.revisionRequested ? (
                    <Btn
                      title={isBusy(`remind:${o.code}`) ? 'Đang gửi…' : (o.quote.isExternalFinalization ? 'Nhắc khách xác nhận hoá đơn' : 'Nhắc khách duyệt')}
                      icon="send"
                      variant="soft"
                      small
                      style={{ flex: 1 }}
                      disabled={isBusy(`remind:${o.code}`)}
                      onPress={() => run(`remind:${o.code}`, () => a.remindQuote(o.code))}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Thông báo đã chốt xong Bill chi phí cuối -> hướng dẫn ký bàn giao */}
        {o.status === 'repairing' && mine && o.externalPriceState === 'finalized' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.green }}>
            <Text style={{ fontWeight: '800', color: C.greenInk, fontSize: 13.5 }}>
              Đã chốt tổng chi phí cuối ({formatVND(orderTotal(o))})
            </Text>
            <Text style={[ui.meta, { color: C.ink2, marginTop: 3, lineHeight: 18 }]}>
              Bấm “Ký bàn giao & Mở TT” ở thanh dưới cùng để ký biên bản bàn giao thiết bị & mở thanh toán cho khách hàng.
            </Text>
          </Card>
        ) : null}

        {/* Nhật ký ghi chú sửa chữa */}
        {(o.status === 'repairing' && mine) || (o.repairNotes || []).length ? (
          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={tx.h}>Ghi chú sửa chữa</Text>
              {(o.repairNotes || []).length > 0 ? (
                <Badge text={`${(o.repairNotes || []).length} ghi chú`} fg={C.ink2} bg={C.surface} />
              ) : null}
            </View>
            {(o.repairNotes || []).map((n) => (
              <View key={n.id} style={[tx.progRow, { borderBottomWidth: 1, borderBottomColor: C.surface, paddingBottom: 10, marginBottom: 8 }]}>
                {editingNoteId === n.id ? (
                  <View style={{ marginTop: 4, padding: 10, backgroundColor: C.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.line }}>
                    <Field
                      value={editingNoteText}
                      onChangeText={setEditingNoteText}
                      multiline
                      placeholder="Nội dung ghi chú sửa chữa…"
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      <Btn title="Huỷ" variant="ghost" small onPress={() => setEditingNoteId(null)} />
                      <Btn
                        title={busyNote ? 'Đang lưu…' : 'Lưu'}
                        small
                        disabled={busyNote}
                        onPress={() => {
                          run(K.note, () => a.updateRepairNote(o.code, n.id, editingNoteText)).then((ok) => {
                            if (ok) setEditingNoteId(null);
                          });
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.ink, fontWeight: '600', lineHeight: 20 }}>{n.text}</Text>
                      <Text style={[ui.meta, { marginTop: 2 }]}>{fmtDateTime(n.at)}</Text>
                    </View>
                    {mine && n.dbProgressId && !['done', 'cancelled', 'pending_payment'].includes(o.status) ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Tap
                          style={{ padding: 6, borderRadius: 6, backgroundColor: C.surface }}
                          hitSlop={6}
                          onPress={() => {
                            setEditingNoteId(n.id);
                            setEditingNoteText(n.text);
                          }}
                        >
                          <AppIcon name="pencil" size={13} color={C.ink2} />
                        </Tap>
                        <Tap
                          style={{ padding: 6, borderRadius: 6, backgroundColor: C.redSoft }}
                          hitSlop={6}
                          onPress={() => {
                            u.dialog({
                              icon: 'trash-2',
                              title: 'Xoá ghi chú này?',
                              message: 'Bạn có chắc muốn xoá dòng ghi chú này?',
                              actions: [
                                { label: 'Huỷ', variant: 'ghost' },
                                {
                                  label: 'Xác nhận xoá',
                                  variant: 'danger',
                                  onPress: () => run(K.note, () => a.deleteRepairNote(o.code, n.id)),
                                },
                              ],
                            });
                          }}
                        >
                          <AppIcon name="trash-2" size={13} color={C.red} />
                        </Tap>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            ))}
            {o.status === 'repairing' && mine ? (
              <View style={{ marginTop: 6 }}>
                <Field value={repairNote} onChangeText={setRepairNote} placeholder="Thêm ghi chú công việc đã làm / phát hiện thêm…" multiline />
                <Btn title={busyNote ? 'Đang lưu…' : '＋ Thêm ghi chú mới'} variant="soft" small style={{ marginTop: 10 }} disabled={busyNote || !repairNote.trim()} onPress={submitRepairNote} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* ===== Vật tư sử dụng & Vật tư phát sinh ===== */}
        {(mine && (
          o.status === 'repairing' ||
          (o.quote?.isExternalFinalization && o.quote?.revisionRequested && ['diagnosing', 'quoted'].includes(o.status)) ||
          getPendingExternalEstimates(o).length > 0
        )) || (o.materials || []).length || (o.finalizedExternalParts || []).length ? (
          <UsedAndExtraMaterialsCard
            o={o}
            mine={mine}
            onOpenWarehouseUsage={() => setMatMode('usage')}
            sharedExtraParts={extraBillParts}
            onChangeSharedExtraParts={setExtraBillParts}
          />
        ) : null}

        {/* ===== Các bước thực hiện (backend: bắt buộc xong trước khi nộp biên bản) ===== */}
        {o.procedure && (mine || o.procedure.progress_percent > 0) ? <ProcedureCard o={o} editable={mine && ['diagnosing', 'repairing'].includes(o.status)} /> : null}
        {mine ? <ReceiptCard o={o} editable={['diagnosing', 'repairing'].includes(o.status)} onPreviewPhoto={setPreviewTechPhoto} /> : null}

        {/* ===== Biên bản hoàn thành ===== */}
        {o.report ? (() => {
          const completionPhotos = evidence.filter((e) => e.stage === 'after' && e.uri);
          return (
            <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.green }}>
              <Text style={tx.h}>Biên bản hoàn thành</Text>
              <Text style={{ color: C.ink2, lineHeight: 21 }}>{o.report.summary}</Text>
              {completionPhotos.length ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.greenInk, marginBottom: 6 }}>
                    Hình ảnh hoàn thành công việc ({completionPhotos.length})
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {completionPhotos.map((ph, idx) => (
                      <Tap
                        key={ph.id || `tech_done_ph_${idx}`}
                        style={{ width: 76, height: 76, borderRadius: R.md, overflow: 'hidden', borderWidth: 1.5, borderColor: C.greenBorder, backgroundColor: C.card }}
                        onPress={() => setPreviewTechPhoto({ uri: ph.uri, title: ph.note || 'Hình ảnh hoàn thành công việc' })}
                        scaleTo={0.97}
                      >
                        <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                      </Tap>
                    ))}
                  </View>
                </View>
              ) : null}
              <Text style={[ui.meta, { marginTop: 8 }]}>
                {fmtDateTime(o.report.at)} · {o.kind === 'warranty'
                  ? 'Hoàn thành bảo hành miễn phí'
                  : o.kind === 'followup'
                    ? 'Hoàn thành tái khám miễn phí'
                    : orderPaid
                      ? (isQRPayment(o)
                        ? `Khách đã chuyển khoản VietQR ${formatVND(orderTotal(o))} về hệ thống (Thợ không thu tiền mặt)`
                        : `Đã thu tiền mặt ${formatVND(orderTotal(o))}${o.report.paidBy === 'customer' ? ' (khách xác nhận)' : ''}`)
                      : (isQRPayment(o)
                        ? `Chờ khách quét mã VietQR ${formatVND(o.status === 'pending_payment' ? amountRemaining(o) : orderTotal(o))} trên ứng dụng Khách hàng (Thợ không thu tiền mặt)`
                        : 'Chưa thu tiền / chờ khách xác nhận')}
              </Text>
              {orderPaid && o.report.paidAt ? (
                <Text style={[ui.meta, { marginTop: 4, color: C.green }]}>Xác nhận lúc {fmtDateTime(o.report.paidAt)}</Text>
              ) : null}
            </Card>
          );
        })() : null}
        {o.rating ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[tx.h, { marginBottom: 0 }]}>Khách đánh giá</Text>
              <Text style={{ fontWeight: '900', fontSize: 18, color: C.goldInk }}>{o.rating.stars}/5</Text>
            </View>
            <View style={{ marginTop: 8 }}><Stars value={o.rating.stars} size={20} /></View>
            <Text style={{ color: C.ink2, marginTop: 8, lineHeight: 20, fontStyle: o.rating.text ? 'italic' : 'normal' }}>
              {o.rating.text ? `“${o.rating.text}”` : 'Khách không để lại nhận xét.'}
            </Text>
            {o.rating.at ? <Text style={[ui.meta, { marginTop: 6 }]}>{fmtDateTime(o.rating.at)}</Text> : null}
          </Card>
        ) : null}

        {o.status === 'cancelled' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: (o.inspectionFee || 0) > 0 ? (orderPaid ? C.green : C.gold) : C.muted }}>
            <Text style={[tx.h, { color: (o.inspectionFee || 0) > 0 ? (orderPaid ? C.greenInk : C.goldInk) : C.ink }]}>
              {(o.inspectionFee || 0) > 0
                ? (orderPaid ? `Đã thu phí kiểm tra: ${formatVND(o.inspectionFee)}` : `Phí kiểm tra tại nhà: ${formatVND(o.inspectionFee)}`)
                : 'Đơn huỷ không thu phí (0đ)'}
            </Text>
            <Text style={{ color: C.ink2, lineHeight: 20 }}>
              {(o.inspectionFee || 0) > 0
                ? orderPaid
                  ? `Đã thanh toán phí kiểm tra ${formatVND(o.inspectionFee)}.`
                  : isQRPayment(o)
                    ? `Khách huỷ sau khi thợ đã tới kiểm tra tại nhà. Khách chọn chuyển khoản VietQR (${formatVND(o.inspectionFee)}) — không thu tiền mặt.`
                    : `Khách huỷ sau khi thợ đã tới kiểm tra thiết bị trực tiếp tại nhà. Khách thanh toán ${formatVND(o.inspectionFee)} phí kiểm tra cho thợ.`
                : 'Chính sách Minh Đức miễn phí 100% kiểm tra tại nhà khi khách từ chối sửa chữa (0đ).'}
            </Text>
            {(o.inspectionFee || 0) > 0 && mine && !orderPaid && !isQRPayment(o) ? (
              <Btn
                title={busyCash ? 'Đang xác nhận…' : `Đã nhận tiền mặt ${formatVND(o.inspectionFee)}`}
                icon="banknote"
                small
                disabled={busyCash}
                style={{ marginTop: 10 }}
                onPress={() => u.confirm(
                  'Xác nhận đã nhận tiền mặt?',
                  `Bạn xác nhận đã nhận đủ ${formatVND(o.inspectionFee)} phí kiểm tra cho đơn ${o.code}.`,
                  () => run(K.cash, () => a.confirmCashReceived(o.code)),
                  'Đã nhận',
                )}
              />
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      {/* ===== Thanh hành động ===== */}
      {o.status === 'pending' ? (
        <View style={tx.dock}>
          <Btn title="Từ chối ca" variant="ghost" style={{ flex: 1 }} disabled={busyAccept || busyDecline} onPress={() => { setReason(DECLINE_REASONS[0]); setReasonNote(''); setShowDecline(true); }} />
          <Btn title={busyAccept ? 'Đang nhận…' : 'Tiếp nhận ca'} icon="handshake" style={{ flex: 2 }} disabled={busyAccept || busyDecline} onPress={() => run(K.accept, () => a.acceptJob(o.code))} />
        </View>
      ) : null}
      {o.status === 'quoted' && mine ? (
        <View style={tx.dock}>
          <Btn title="Trả việc" variant="dangerSoft" style={{ flex: 1 }} onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }} />
          <View style={{ flex: 1.4, alignItems: 'center' }}>
            <Text style={[ui.meta, { marginTop: 0 }]}>
              {o.quote?.revisionRequested
                ? (o.quote?.isExternalFinalization ? 'Cần nhập lại giá thực tế' : 'Khách yêu cầu báo giá lại')
                : (o.quote?.isExternalFinalization ? 'Chờ khách xác nhận hoá đơn' : 'Chờ khách duyệt')}
            </Text>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14, marginTop: 1 }}>
              {formatOrderTotal(o)}
            </Text>
          </View>
          {!o.quote?.revisionRequested ? (
            <Btn
              title={isBusy(`remind:${o.code}`) ? 'Đang gửi…' : 'Nhắc'}
              icon="send"
              variant="soft"
              style={{ flex: 1 }}
              disabled={isBusy(`remind:${o.code}`)}
              onPress={() => run(`remind:${o.code}`, () => a.remindQuote(o.code))}
            />
          ) : null}
        </View>
      ) : null}
      {mine && ['confirmed', 'onway'].includes(o.status) ? (
        <View style={tx.dock}>
          <Btn title="Trả việc" variant="dangerSoft" style={{ flex: 1 }} onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }} />
          {o.status === 'confirmed' && (showPreQuote || o.quote?.revisionRequested) ? (
            <Btn title={busyQuote ? 'Đang gửi…' : (o.quote?.revisionRequested ? 'Gửi lại báo giá' : 'Gửi báo giá trước khi đi')} icon="receipt-text" style={{ flex: 2 }} disabled={busyQuote} onPress={sendQuote} />
          ) : next ? (
            <Btn title={next.label} icon={next.icon} variant={next.variant || 'primary'} style={{ flex: 2 }} disabled={Boolean(next.disabled)} onPress={next.run} />
          ) : null}
        </View>
      ) : null}
      {mine && (o.status === 'diagnosing' || o.status === 'out_of_warranty') ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line }}>
          <Tap onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }}>
            <Text style={{ color: C.red, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>Không thể tiếp tục? Trả việc cho điều phối</Text>
          </Tap>
        </View>
      ) : null}
      {mine && (o.status === 'diagnosing' || o.status === 'out_of_warranty') ? (
        o.quote?.isExternalFinalization && o.quote?.revisionRequested ? (
          <View style={tx.dock}>
            {getPendingExternalEstimates(o).length === 0 ? (
              <Btn
                title={busyQuote ? 'Đang xử lý…' : 'Bỏ phát sinh · Sửa tiếp'}
                variant="ghost"
                style={{ flex: 1 }}
                disabled={busyQuote}
                onPress={() => run(K.quote, () => a.startRepairWithoutQuote(o.code, {
                  diagnosis: o.quote?.diagnosis || 'Không phát sinh thêm vật tư',
                  symptoms: o.quote?.symptoms || '',
                  recommendation: 'Tiếp tục hoàn thành dịch vụ đã đặt theo đơn gốc',
                }))}
              />
            ) : null}
            <Btn
              title="Nhập lại giá VT ngoài & gửi nghiệm thu"
              icon="receipt-text"
              style={{ flex: 1.5 }}
              onPress={() => setShowFinalizeExt(true)}
            />
          </View>
        ) : (
          <View style={tx.dock}>
            <View style={{ flex: 1 }}>
              <Text style={[ui.meta, { marginTop: 0 }]}>
                {hasDraftRange ? 'Tổng cộng dự kiến' : 'Tổng thanh toán'}
              </Text>
              <Text style={[ui.price, { fontSize: hasDraftRange && draftRange.totalMin !== draftRange.totalMax ? 14.5 : 17.5 }]}>
                {formatRangeVND(draftRange.totalMin, draftRange.totalMax)}
              </Text>
              {diffMax > 0 ? (
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.orange, marginTop: 1 }} numberOfLines={1}>
                  Phát sinh: {formatRangeVND(diffMin, diffMax, { prefix: '+' })}
                </Text>
              ) : null}
            </View>
            <Btn
              title={
                busyQuote
                  ? 'Đang gửi…'
                  : o.quote?.revisionRequested
                    ? (extraItems.length > 0 ? 'Gửi lại báo giá' : 'Xác nhận & bắt đầu (0đ phát sinh)')
                    : (extraItems.length > 0 ? 'Gửi báo giá phát sinh' : 'Xác nhận & bắt đầu')
              }
              style={{ flex: 2 }}
              disabled={busyQuote}
              onPress={sendQuote}
            />
          </View>
        )
      ) : null}
      {mine && o.status === 'repairing' ? (() => {
        const busyFollowUp = isBusy(`followup:${o.code}`);
        const followUpDisabled = busyFollowUp || Boolean(o.followUpRequested);
        return (
        <View style={tx.dock}>
          <Btn
            title={o.followUpRequested ? 'Đã hẹn tái khám' : (busyFollowUp ? 'Đang gửi…' : 'Hẹn tái khám')}
            variant="soft"
            style={{ flex: 1 }}
            disabled={followUpDisabled}
            onPress={() => {
              u.dialog({
                icon: 'calendar',
                title: 'Yêu cầu hẹn tái khám',
                message: 'Chưa thể hoàn thành ca trong hôm nay? Chọn lý do để Quản lý kỹ thuật Minh Đức xếp lịch quay lại.',
                actions: [
                  { label: 'Đóng', variant: 'ghost' },
                  {
                    label: 'Chờ linh kiện kho',
                    onPress: () => run(`followup:${o.code}`, () => a.requestFollowUp(o.code, 'Chờ linh kiện phụ tùng từ kho điều phối')),
                  },
                  {
                    label: 'Hết giờ toà nhà',
                    onPress: () => run(`followup:${o.code}`, () => a.requestFollowUp(o.code, 'Hết giờ làm việc của toà nhà / Hẹn ngày mai tiếp tục')),
                  },
                ],
              });
            }}
          />
          <Btn
            title={
              o.externalPriceState === 'revision_requested'
                ? 'Chỉnh lại giá vật tư'
                : getPendingExternalEstimates(o).length > 0 || extraBillParts.length > 0
                  ? 'Chốt giá & Gửi hoá đơn'
                  : o.externalPriceState === 'finalized'
                    ? 'Ký bàn giao & Mở TT'
                    : 'Hoàn thành'
            }
            icon={o.externalPriceState === 'revision_requested' || getPendingExternalEstimates(o).length > 0 || extraBillParts.length > 0 ? 'receipt-text' : 'check-circle-2'}
            style={{ flex: 1.6 }}
            onPress={openComplete}
          />
        </View>
        );
      })() : null}
      {!editable && o.status !== 'done' && o.status !== 'cancelled' ? (
        <View style={tx.dock}><Text style={[ui.meta, { flex: 1, textAlign: 'center' }]}>Việc này do thợ khác phụ trách.</Text></View>
      ) : null}

      {/* ===== Sheets ===== */}
      <Sheet visible={!!matMode} onClose={() => setMatMode(null)} title={matMode === 'usage' ? 'Ghi nhận vật tư' : 'Thêm vật tư / linh kiện'}>
        <Checkbox on={matAll} onPress={() => setMatAll(!matAll)} label="Hiện tất cả loại vật tư" />
        <View style={{ height: 8 }} />
        {mats.map((m) => (
          <Tap key={m.id} style={tx.option} onPress={() => addPart(m)}>
            <IconBox icon={m.category === 'all' ? 'package' : catIcon(m.category)} size={38} bg={m.category === 'all' ? C.surface : toneOf(m.category).bg} radius={12} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontWeight: '700' }}>{m.name}</Text>
              <Text style={ui.meta}>
                {Number(m.price) > 0 ? `${formatVND(m.price)} / ${m.unit}` : 'Chưa niêm yết giá · Nhập đơn giá khi thêm'}
              </Text>
            </View>
            <Text style={{ color: C.primary, fontSize: 20, fontWeight: '700' }}>＋</Text>
          </Tap>
        ))}
      </Sheet>
      <Sheet
        visible={showDecline}
        onClose={() => { if (!busyDecline) setShowDecline(false); }}
        title="Lý do từ chối"
        footer={(
          <Btn
            title={busyDecline ? 'Đang gửi…' : 'Xác nhận từ chối'}
            variant="danger"
            disabled={busyDecline}
            onPress={async () => {
              const note = reason === 'Lý do khác' ? reasonNote.trim() : '';
              if (reason === 'Lý do khác' && note.length < 3) {
                u.alert('Thiếu lý do', 'Vui lòng mô tả ngắn lý do từ chối.', '✏️');
                return;
              }
              const res = await run(K.decline, () => a.declineJob(o.code, note ? `${reason}: ${note}` : reason));
              if (!succeeded(res)) return;
              setShowDecline(false);
              nav.back();
            }}
          />
        )}
      >
        <Text style={[ui.meta, { marginBottom: 8 }]}>Bạn có thể từ chối ca nếu bận lịch hoặc ngoài khu vực phục vụ.</Text>
        {DECLINE_REASONS.map((r) => (
          <Tap key={r} style={tx.option} onPress={() => setReason(r)}>
            <Radio on={reason === r} />
            <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{r}</Text>
          </Tap>
        ))}
        {reason === 'Lý do khác' ? (
          <Field label="Mô tả ngắn" value={reasonNote} onChangeText={setReasonNote} placeholder="VD: Xe hỏng, ngoài giờ làm…" style={{ marginTop: 8 }} />
        ) : null}
      </Sheet>
      <Sheet
        visible={showRelease}
        onClose={() => { if (!busyRelease) setShowRelease(false); }}
        title="Trả việc sau khi nhận"
        footer={(
          <Btn
            title={busyRelease ? 'Đang gửi…' : releaseAssess?.free ? 'Trả việc (hợp lệ)' : 'Xác nhận trả việc'}
            variant="danger"
            disabled={busyRelease}
            onPress={async () => {
              const note = releaseReason === 'Lý do khác' ? releaseNote.trim() : '';
              if (releaseReason === 'Lý do khác' && note.length < 3) {
                u.alert('Thiếu lý do', 'Vui lòng mô tả ngắn lý do trả việc.', '✏️');
                return;
              }
              const res = await run(K.release, () => a.releaseJob(o.code, note ? `${releaseReason}: ${note}` : releaseReason));
              if (res?.ok) setShowRelease(false);
            }}
          />
        )}
      >
        {releaseAssess ? (
          <View style={[tx.offline, { marginBottom: 12, borderLeftColor: releaseAssess.free ? C.green : C.red }]}>
            <Text style={{ fontWeight: '800', color: releaseAssess.free ? C.greenInk : C.redInk }}>{releaseAssess.label}</Text>
            <Text style={{ marginTop: 4, lineHeight: 18, color: C.ink2 }}>
              {releaseAssess.free
                ? 'Trong 15 phút đầu sau khi nhận — trả việc hợp lệ.'
                : 'Trả việc sau thời gian quy định sẽ ảnh hưởng đến đánh giá dịch vụ. Khách được điều phối lại.'}
            </Text>
          </View>
        ) : null}
        <Text style={[ui.meta, { marginBottom: 8 }]}>Chọn lý do trả việc (bắt buộc).</Text>
        {RELEASE_REASONS.map((r) => (
          <Tap key={r} style={tx.option} onPress={() => setReleaseReason(r)}>
            <Radio on={releaseReason === r} />
            <Text style={{ fontSize: 15, color: C.ink, flex: 1 }}>{r}</Text>
          </Tap>
        ))}
        {releaseReason === 'Lý do khác' ? (
          <Field label="Mô tả ngắn" value={releaseNote} onChangeText={setReleaseNote} placeholder="VD: Tai nạn giao thông, không kịp đến…" style={{ marginTop: 8 }} />
        ) : null}
      </Sheet>
      <ExternalPartsFinalizeSheet
        o={o}
        visible={showFinalizeExt}
        onClose={() => setShowFinalizeExt(false)}
        initialSummary={summary}
        sharedExtraParts={extraBillParts}
        onChangeSharedExtraParts={setExtraBillParts}
      />
      <CompleteSheet
        o={o}
        visible={showDone}
        onClose={() => setShowDone(false)}
        initialSummary={summary}
        evidence={evidence}
      />
      <Sheet
        visible={Boolean(previewTechPhoto)}
        onClose={() => setPreviewTechPhoto(null)}
        title={previewTechPhoto?.title || 'Hình ảnh công việc'}
      >
        {previewTechPhoto?.uri ? (
          <Image source={{ uri: previewTechPhoto.uri }} style={{ width: '100%', height: 280, borderRadius: R.md, backgroundColor: C.surface }} resizeMode="contain" />
        ) : null}
      </Sheet>
    </View>
  );
}
