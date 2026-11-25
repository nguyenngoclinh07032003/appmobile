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
  ALL_SERVICES, CATEGORIES,
} from '../../constants/data';
import { PASSWORD_MIN_LENGTH, BASE_WARRANTY_DAYS } from '../../constants';
import {
  useApp, orderTotal, amountRemaining, formatOrderTotal, cashToCollect, bookedValue, tierPartDiscountAmount, lateDiscountAmount,
  isActiveOrder, dateKeyOf, todayKey, fmtDate, fmtDateTime, timeAgo,
  assessCancelAfterAccept, slotStartTs, matchJobForTech, isQRPayment, isPaid, latestNotifPerOrder, techStatusMeta,
  getPendingExternalEstimates,
  isSupportAssignment, isSupportWaitingForLead, isStepInSupportScope, resolveCategoryNamesByIds,
  getNonWorkingDayInfo, MATERIAL_WARRANTY_STATUS_META, canShowOnsiteQuoteApproval,
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
import {
  getServiceSectionKey,
  getServiceSectionStats,
  getDefaultOpenServiceKeys,
  computeNextOpenServiceKeysAfterTick,
  getIncompleteRequiredServiceKeys,
} from '../../utils/procedureHelpers';
import { TrackingCard, SymptomBreakdownView } from '../../components/order';

const customerDisplayName = (addr) => {
  const n = addr?.name || 'Khách hàng';
  if (addr?.gender === 'Nữ') return `Chị ${n}`;
  if (addr?.gender === 'Nam') return `Anh ${n}`;
  return n;
};
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
  const who = `${customerDisplayName(o.address)} · ${o.address?.phone}`;
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
          {o.dbAssignmentId ? (
            <Badge
              text={isSupportAssignment(o) ? 'Thợ phụ' : 'Thợ chính'}
              fg={isSupportAssignment(o) ? C.primary : C.ink2}
              bg={isSupportAssignment(o) ? C.primarySoft : C.surface}
            />
          ) : null}
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
            if (isSupportAssignment(o)) {
              return (
                <View style={tx.payBox}>
                  <Text style={[tx.payLabel, { color: C.primary, fontWeight: '800' }]}>Vai trò</Text>
                  <Text style={[ui.price, { fontSize: 14, marginTop: 2, color: C.ink }]}>Thợ phụ</Text>
                </View>
              );
            }
            const isFreeJob = o.kind === 'warranty' || o.kind === 'followup';
            const qrPay = !isFreeJob && isQRPayment(o);
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
            if (isFreeJob) {
              return (
                <View style={tx.payBox}>
                  <Text style={[tx.payLabel, { color: C.greenInk }]}>{o.kind === 'followup' ? 'Tái khám' : 'Bảo hành'}</Text>
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
    try { await Promise.resolve(a.syncFromBackend?.(null, true, { refreshLocation: true })); } catch (_e) { /* giữ danh sách hiện tại */ } finally { setRefreshing(false); }
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
              if (!start || job.status !== 'confirmed' || isSupportWaitingForLead(job)) return false;
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

  const days = Array.from({ length: 14 }, (_, i) => {
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
  const holidayOpts = useMemo(
    () => ({ holidays: s?.holidays || [], sundaysClosed: s?.sundaysClosed !== false }),
    [s?.holidays, s?.sundaysClosed],
  );
  const curDayOff = getNonWorkingDayInfo(key, holidayOpts);

  return (
    <View style={{ flex: 1 }}>
      <PageHead title="Lịch làm việc" sub="Ca 1 (08h00 - 12h00) · Ca 2 (13h30 - 17h30)" />
      <View style={{ backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <HScroll contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {days.map((dd, i) => {
            const n = all.filter((o) => dateKeyOf(o) === dd.key).length;
            const on = i === day;
            const off = getNonWorkingDayInfo(dd.key, holidayOpts);
            return (
              <Tap
                key={dd.key}
                onPress={() => setDay(i)}
                style={[
                  tx.day,
                  { minHeight: 68, paddingVertical: 4 },
                  off.blocked && !on && { backgroundColor: C.surface, opacity: 0.72 },
                  on && tx.dayOn,
                ]}
              >
                <Text style={[tx.dayLabel, on && { color: 'rgba(255,255,255,0.8)' }]}>{dd.label}</Text>
                <Text style={[tx.dayNum, on && { color: '#fff' }]}>{dd.dd}</Text>
                {off.blocked ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text
                      style={{ fontSize: 9, fontWeight: '800', color: on ? '#FDE68A' : (off.reason === 'HOLIDAY' ? C.redInk : C.goldInk) }}
                      numberOfLines={1}
                    >
                      {off.shortLabel}
                    </Text>
                    {n ? <View style={[tx.dayDot, { marginTop: 0, backgroundColor: on ? C.gold : C.primary }]} /> : null}
                  </View>
                ) : (
                  <View style={[tx.dayDot, { backgroundColor: n ? (on ? C.gold : C.primary) : 'transparent' }]} />
                )}
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
        {curDayOff.blocked ? (
          <Card style={{ marginBottom: 10, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: curDayOff.reason === 'HOLIDAY' ? C.red : C.gold }}>
            <Text style={{ fontWeight: '800', color: curDayOff.reason === 'HOLIDAY' ? C.redInk : C.goldInk, fontSize: 13.5 }}>
              {curDayOff.label}
            </Text>
            <Text style={[ui.meta, { marginTop: 3 }]}>
              {dayJobs.length
                ? 'Ngày nghỉ hệ thống — vẫn hiển thị các công việc đã được sắp lịch trước đó.'
                : 'Ngày nghỉ theo lịch trung tâm, không phân bổ ca làm việc thường lệ.'}
            </Text>
          </Card>
        ) : null}
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

  const hasMissing = parts.some((p) => !p.receiptId);
  if (!parts.length || (!editable && !hasMissing)) return null;
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
            {p.receiptId && editable ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Badge text="Đã có" fg={C.greenInk} bg={C.greenSoft} />
                <Btn title={busyId === p.itemId ? 'Đang tải…' : 'Đổi ảnh'} small variant="ghost" disabled={Boolean(busyId)} onPress={() => attach(p, true)} />
              </View>
            ) : p.receiptId ? (
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

// Các bước thực hiện của việc: thu gọn theo từng dịch vụ (dropdown), mặc định mở dịch vụ đang chờ tiếp theo.
function ProcedureCard({ o, editable, evidence = [], onPreviewPhoto }) {
  const { a, ui: u } = useApp();
  const proc = o.procedure;
  const services = Array.isArray(proc?.services) ? proc.services : [];
  const [openServiceIds, setOpenServiceIds] = useState(() => getDefaultOpenServiceKeys(proc));
  const [openId, setOpenId] = useState(null);
  const [checked, setChecked] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [stepNote, setStepNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOpenServiceIds(getDefaultOpenServiceKeys(proc));
    setOpenId(null);
    setChecked([]);
    setPhotos([]);
    setStepNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.code]);

  useEffect(() => {
    if (!editable && openId != null) setOpenId(null);
  }, [editable, openId]);

  useEffect(() => {
    if (!o.procedureIncompleteAt || !services.length) return;
    const incompleteKeys = getIncompleteRequiredServiceKeys(proc, o.procedureIncompleteErrors);
    if (incompleteKeys.length > 0) {
      setOpenServiceIds((prev) => {
        const next = new Set(prev);
        incompleteKeys.forEach((k) => next.add(k));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.procedureIncompleteAt]);

  if (!proc || services.length === 0) return null;
  const allDone = proc.total_steps > 0 && proc.done_steps === proc.total_steps;
  const progressPct = Math.min(100, Math.max(0, Number(proc.progress_percent) || 0));

  const toggleService = (svKey) => {
    setOpenServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(svKey)) next.delete(svKey);
      else next.add(svKey);
      return next;
    });
  };

  const open = (st) => {
    if (busy || !editable || st.status !== 'PENDING') return;
    if (!isStepInSupportScope(st, o, ALL_SERVICES)) {
      u.toast('Bước này thuộc phạm vi thợ chính', 'info');
      return;
    }
    setOpenId(openId === st.step_id ? null : st.step_id);
    setChecked([...(st.items || [])]);
    setPhotos([]);
    setStepNote('');
  };
  const addPhoto = async (source = 'camera') => {
    if (photos.length >= 5) return;
    let uri = source === 'camera' ? await pickCamera() : await pickImage();
    if (source === 'camera' && uri === null) uri = await pickImage();
    if (!uri) {
      if (uri === null) u.alert('Chưa hỗ trợ máy ảnh', 'Cho phép máy ảnh hoặc chọn ảnh từ thư viện.', '📷');
      return;
    }
    setPhotos((p) => (p.includes(uri) ? p : [...p, uri]).slice(0, 5));
  };
  const finish = async (st) => {
    if (st.require_photo && !photos.length && !(st.photo_ids || []).length) { u.alert('Thiếu ảnh', 'Bước này cần ít nhất 1 ảnh.', '📷'); return; }
    if (busy) return;
    setBusy(true);
    let res = null;
    try {
      res = await Promise.resolve(a.completeProcedureStep(o.code, st, {
        checkedItems: checked,
        photoUris: photos,
        ...(stepNote.trim() ? { note: stepNote.trim() } : {}),
      }));
    } catch (e) {
      res = { ok: false, error: toVietnamese(e?.message, 'Vui lòng thử lại.') || 'Vui lòng thử lại.' };
    } finally {
      setBusy(false);
    }
    if (!res?.ok) { u.alert('Chưa xong bước', res?.error || 'Vui lòng thử lại.', '⚠️'); return; }
    setOpenServiceIds((prev) => computeNextOpenServiceKeysAfterTick(prev, proc, res.procedure || proc, st.step_id));
    setOpenId(null);
    setStepNote('');
    u.toast(`Đã xong bước ${st.step_no}`, '✅');
  };

  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text style={[tx.h, { marginBottom: 0, flex: 1 }]}>Quy trình kỹ thuật</Text>
        <Badge text={`${proc.done_steps}/${proc.total_steps} bước`} fg={allDone ? C.green : C.primary} bg={allDone ? C.greenSoft : C.primarySoft} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
          <View style={{ width: `${progressPct}%`, height: '100%', borderRadius: 3, backgroundColor: allDone ? C.green : C.primary }} />
        </View>
        <Text style={[ui.meta, { marginTop: 0, fontWeight: '700', color: allDone ? C.green : C.primary }]}>{progressPct}%</Text>
      </View>
      <Text style={[ui.meta, { marginTop: 6, marginBottom: 8 }]}>
        Bấm từng dịch vụ để xem và đánh dấu bước thực hiện (hoặc tự đồng bộ khi nộp biên bản).
      </Text>
      {services.map((sv, svIdx) => {
        const svKey = getServiceSectionKey(sv, svIdx);
        const isServiceOpen = openServiceIds.has(svKey);
        const stats = getServiceSectionStats(sv);
        const svSteps = Array.isArray(sv?.steps) ? sv.steps : [];
        return (
          <View key={svKey} style={{ borderTopWidth: 1, borderTopColor: C.line }}>
            <Tap
              onPress={() => toggleService(svKey)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.primary, width: 14 }}>
                {isServiceOpen ? '▾' : '▸'}
              </Text>
              <Text style={{ flex: 1, fontWeight: '800', fontSize: 13.5, color: C.ink }} numberOfLines={2}>
                {sv.service_name || 'Dịch vụ kỹ thuật'}
              </Text>
              <Text style={[ui.meta, { marginTop: 0, fontWeight: '700', color: stats.allDone ? C.green : C.muted }]}>
                {stats.done}/{stats.total} bước
              </Text>
              {stats.allDone ? (
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.green }}>✓</Text>
              ) : stats.hasRequiredPending ? (
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.gold }}>⚠</Text>
              ) : null}
            </Tap>
            {isServiceOpen ? (
              <View style={{ paddingLeft: 10, paddingBottom: 6 }}>
                {svSteps.map((rawSt) => {
                  const st = {
                    ...rawSt,
                    service_name: sv?.service_name || '',
                    service_id: rawSt?.service_id ?? sv?.service_id ?? null,
                    category_id: rawSt?.category_id ?? rawSt?.service_category_id ?? sv?.category_id ?? sv?.service_category_id ?? null,
                  };
                  const done = st.status !== 'PENDING';
                  const isOpen = openId === st.step_id;
                  const inScope = isStepInSupportScope(st, o, ALL_SERVICES);
                  const stepPhotos = (Array.isArray(evidence) ? evidence : []).filter((e) => {
                    if (!e?.uri) return false;
                    if (e.procedureStepId != null && String(e.procedureStepId) === String(st.step_id)) return true;
                    return Array.isArray(st.photo_ids) && e.dbAttachmentId != null && st.photo_ids.some((pid) => String(pid) === String(e.dbAttachmentId));
                  });
                  const checkedList = Array.isArray(st.checked_items) && st.checked_items.length
                    ? st.checked_items
                    : (done && st.status !== 'SKIPPED' && Array.isArray(st.items) ? st.items : []);
                  return (
                    <View key={st.step_id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10, opacity: inScope ? 1 : 0.5 }}>
                      <Tap onPress={() => open(st)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? C.green : C.primarySoft }}>
                          <Text style={{ color: done ? '#fff' : C.primary, fontWeight: '800', fontSize: 12 }}>{done ? '✓' : st.step_no}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '800', color: C.ink }}>{st.title}{st.is_required ? '' : ' (không bắt buộc)'}</Text>
                          <Text style={ui.meta}>
                            {st.require_photo ? 'cần ảnh' : 'không bắt buộc ảnh'}
                            {!inScope ? ' · Ngoài phạm vi phụ trách' : (done ? ` · ${st.status === 'SKIPPED' ? 'Bỏ qua' : 'Đã xong'}` : (editable ? ' · bấm để làm' : ''))}
                          </Text>
                        </View>
                      </Tap>
                      {done && !isOpen ? (
                        <>
                          {checkedList.length > 0 ? (
                            <View style={{ paddingLeft: 36, marginTop: 6, gap: 2 }}>
                              {checkedList.map((chk, ci) => (
                                <Text key={`t_chk_${st.step_id}_${ci}`} style={[ui.meta, { color: C.ink2 }]}>✓ {chk}</Text>
                              ))}
                            </View>
                          ) : null}
                          {st.note ? (
                            <Text style={[ui.meta, { paddingLeft: 36, marginTop: 4, color: C.ink2 }]}>Ghi chú: {st.note}</Text>
                          ) : null}
                        </>
                      ) : null}
                      {stepPhotos.length > 0 && !isOpen ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingLeft: 36 }}>
                          {stepPhotos.map((ph, idx) => (
                            <Tap
                              key={ph.id || `stph_${st.step_id}_${idx}`}
                              disabled={!onPreviewPhoto}
                              onPress={() => onPreviewPhoto?.({ uri: ph.uri, title: `Ảnh bước ${st.step_no}: ${st.title}` })}
                              style={{ width: 54, height: 54, borderRadius: R.sm, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }}
                            >
                              <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                            </Tap>
                          ))}
                        </View>
                      ) : null}
                      {isOpen ? (
                        <View style={{ marginTop: 10, gap: 6 }}>
                          {(st.items || []).map((it) => (
                            <Checkbox key={it} on={checked.includes(it)} label={it}
                              onPress={() => setChecked((p) => (p.includes(it) ? p.filter((x) => x !== it) : [...p, it]))} />
                          ))}
                          {(() => {
                            const isHandoverStep = Number(st.step_no) > 1 && /bàn giao|hoàn thành|nghiệm thu/i.test(String(st.title || ''));
                            const photoLabel = st.require_photo
                              ? (isHandoverStep ? 'Ảnh hoàn thành / bàn giao (bắt buộc)' : 'Ảnh bước (bắt buộc)')
                              : (isHandoverStep ? 'Ảnh hoàn thành / bàn giao' : 'Ảnh minh chứng (tuỳ chọn)');
                            return (
                              <View style={{ marginTop: 2 }}>
                                <Text style={[ui.meta, { fontWeight: '700', marginBottom: 6 }]}>{photoLabel}</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                  {photos.map((uri, i) => (
                                    <View key={`${i}`} style={tx.thumb}>
                                      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
                                      <Tap style={tx.thumbX} onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text></Tap>
                                    </View>
                                  ))}
                                  {photos.length < 5 ? (
                                    <>
                                      <Tap style={[tx.thumb, tx.thumbAdd]} onPress={() => addPhoto('camera')}>
                                        <AppIcon name="camera" size={20} color={C.primary} strokeWidth={2.1} />
                                        <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700', marginTop: 2 }}>Chụp ảnh</Text>
                                      </Tap>
                                      <Tap style={[tx.thumb, tx.thumbAdd]} onPress={() => addPhoto('gallery')}>
                                        <AppIcon name="image" size={20} color={C.primary} strokeWidth={2.1} />
                                        <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700', marginTop: 2 }}>Tải ảnh lên</Text>
                                      </Tap>
                                    </>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })()}
                          <Field
                            label="Ghi chú bước (tuỳ chọn)"
                            value={stepNote}
                            onChangeText={setStepNote}
                            placeholder="Ghi chú nhanh nếu có…"
                          />
                          <Btn title={busy ? 'Đang gửi…' : `Xong bước ${st.step_no}`} disabled={busy} onPress={() => finish(st)} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
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
  const [showDiagQuoteForm, setShowDiagQuoteForm] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showRepairNotes, setShowRepairNotes] = useState(false);
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
  const [showFinishSupport, setShowFinishSupport] = useState(false);
  const [supportPartNote, setSupportPartNote] = useState('');
  const [showOnsiteApprove, setShowOnsiteApprove] = useState(false);
  const [onsitePhotos, setOnsitePhotos] = useState([]);
  const [onsiteNote, setOnsiteNote] = useState('');
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
    setShowOnsiteApprove(false);
    setOnsitePhotos([]);
    setOnsiteNote('');
  }, [o?.code]);

  useEffect(() => {
    if (o?.status !== 'confirmed' && showPreQuote) setShowPreQuote(false);
  }, [o?.status, showPreQuote]);

  useEffect(() => {
    const mustOpen = Boolean(
      o?.status === 'out_of_warranty' ||
      o?.quote?.revisionRequested ||
      o?.quoteEditing ||
      o?.kind === 'warranty'
    );
    setShowDiagQuoteForm(mustOpen);
  }, [o?.code, o?.status, o?.quote?.revisionRequested, o?.quoteEditing, o?.kind]);

  const repairNoteCount = (o?.repairNotes || []).length;
  useEffect(() => {
    setShowTimeline(false);
    setShowRepairNotes(repairNoteCount > 0);
  }, [o?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (repairNoteCount > 0) setShowRepairNotes(true);
  }, [repairNoteCount]);

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
  const isSupport = isSupportAssignment(o);
  const waitingForLead = isSupportWaitingForLead(o);
  const supportCategoryLabels = isSupport ? resolveCategoryNamesByIds(o.supportCategoryIds, CATEGORIES) : [];
  // Việc của mình: phân công đang ACTIVE (server xác nhận). So mã thợ chỉ để dự phòng khi mã có thật (khác rỗng).
  const editable = mine || o.status === 'pending';
  const isFreeFollowUpOrder = o.kind === 'warranty' || o.kind === 'followup';
  const techSteps = isFreeFollowUpOrder
    ? TECH_ORDER_STEPS.filter((st) => st.key !== 'pending_payment')
    : TECH_ORDER_STEPS;
  const payStepPos = TECH_ORDER_STEPS.findIndex((st) => st.key === 'pending_payment');
  const techStepPos = isFreeFollowUpOrder && payStepPos >= 0 && step > payStepPos ? step - 1 : step;
  const techDesc = waitingForLead
    ? 'Bạn đã tới nơi. Đang chờ thợ chính check-in để bắt đầu công việc.'
    : (meta.desc || TECH_STATUS_DESC[o.status] || '');
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
    finishPart: `finish-part:${o.code}`,
    onsiteApprove: `onsite-approve:${o.code}`,
  };
  const busyAccept = isBusy(K.accept);
  const busyDecline = isBusy(K.decline);
  const busyQuote = isBusy(K.quote);
  const busyNote = isBusy(K.note);
  const busyCash = isBusy(K.cash);
  const busyRelease = isBusy(K.release);
  const busyFinishPart = isBusy(K.finishPart);
  const busyOnsiteApprove = isBusy(K.onsiteApprove);
  const succeeded = (res) => res !== undefined && res !== false && !(res && typeof res === 'object' && res.ok === false);

  const addOnsitePhoto = async (source = 'camera') => {
    if (onsitePhotos.length >= 5) return;
    let uri = source === 'camera' ? await pickCamera() : await pickImage();
    if (source === 'camera' && uri === null) uri = await pickImage();
    if (!uri) {
      if (uri === null) u.alert('Chưa hỗ trợ máy ảnh', 'Cho phép máy ảnh hoặc chọn ảnh từ thư viện.', '📷');
      return;
    }
    setOnsitePhotos((p) => (p.includes(uri) ? p : [...p, uri]).slice(0, 5));
  };

  // ---- báo giá ----
  const onSiteQuote = isOnSiteQuote(o);
  const prodDisc = Number(o.productDiscount) || 0;
  const comboDisc = Number(o.comboDiscount) || 0;
  const partDisc = tierPartDiscountAmount(o);
  const voucherDisc = Number(o.voucherDiscount) || 0;
  const lateDisc = lateDiscountAmount(o);
  const priorApprovedExtra = o.quote?.approvedTotal != null
    ? (Number(o.quote.approvedTotal) - bookedValue(o))
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
  const priorPendingEst = getPendingExternalEstimates(o).filter(
    (est) => !draft.lines.some((l) => l.isEstimatedRange && String(l.name || '').trim().toLowerCase() === String(est.name || '').trim().toLowerCase()),
  );
  const priorEstMin = priorPendingEst.reduce(
    (s, e) => s + Math.max(0, (Number(e.minPrice) || 0) - (Number(e.alreadyBilledUnitPrice) || 0)) * Math.max(1, Number(e.qty) || 1),
    0,
  );
  const priorEstMax = priorPendingEst.reduce(
    (s, e) => s + Math.max(0, (Number(e.maxPrice) || 0) - (Number(e.alreadyBilledUnitPrice) || 0)) * Math.max(1, Number(e.qty) || 1),
    0,
  );
  const hasDraftRange = draftRange.hasEstimatedRange || priorEstMax > 0;
  const extraItems = draft.lines.filter((l) => !l.isOriginal);
  const extraTotal = draftRange.extraMax + priorEstMax;
  const deductDraft = partDisc + voucherDisc + lateDisc;
  const grossDraftMin = draftRange.grossTotalMin + priorEstMin;
  const grossDraftMax = draftRange.grossTotalMax + priorEstMax;
  const diffMin = Math.max(0, grossDraftMin - bookedValue(o));
  const diffMax = Math.max(diffMin, grossDraftMax - bookedValue(o));
  const dockReductionMin = diffMax === 0 && grossDraftMax < bookedValue(o) ? Math.max(0, bookedValue(o) - grossDraftMax) : 0;
  const dockReductionMax = diffMax === 0 && grossDraftMin < bookedValue(o) ? Math.max(dockReductionMin, bookedValue(o) - grossDraftMin) : 0;
  const dockTotalMin = Math.max(0, grossDraftMin - deductDraft);
  const dockTotalMax = Math.max(dockTotalMin, grossDraftMax - deductDraft);
  const netDraftTotal = dockTotalMax;
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
    if (o.kind === 'followup' && hasExtra) {
      u.alert(
        'Đơn hẹn tái khám miễn phí (0đ)',
        'Đơn hẹn tái khám không tạo báo giá thu thêm phí. Vui lòng bắt đầu sửa hoặc ghi nhận vật tư không tính phí.',
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
  const quickStartRepair = () => {
    run(K.quote, () => a.startRepairWithoutQuote(o.code, {
      diagnosis: 'Thiết bị đúng tình trạng đặt lịch, không phát sinh thêm chi phí',
      symptoms: '',
      recommendation: 'Thực hiện đúng dịch vụ khách đã đặt',
    })).then((res) => { if (succeeded(res)) draft.markSaved(); });
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
    const diagText = o.quote?.diagnosis || o.diagnosisReport?.diagnosis || '';
    const defaultSum = `Đã hoàn thành: ${names || 'dịch vụ kỹ thuật'}.${diagText ? ` Tình trạng: ${diagText}.` : ''} Thiết bị hoạt động ổn định, đã dọn dẹp khu vực.`;
    setSummary(defaultSum);
    if (getPendingExternalEstimates(o).length > 0 || o.externalPriceState === 'revision_requested' || extraBillParts.length > 0) {
      setShowFinalizeExt(true);
      return;
    }
    setShowDone(true);
  };

  const isQuoteEditorOpen = Boolean(
    !isSupport &&
    ((o.status === 'out_of_warranty') || (o.status === 'diagnosing' && showDiagQuoteForm) || (o.status === 'confirmed' && (showPreQuote || o.quote?.revisionRequested))) &&
    mine &&
    !(o.quote?.isExternalFinalization && o.quote?.revisionRequested),
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={o.kind === 'warranty' ? 'Việc bảo hành' : o.kind === 'followup' ? 'Lịch hẹn tái khám' : 'Chi tiết công việc'} sub={o.code} />
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
            {o.dbAssignmentId ? (
              <Badge
                text={isSupport ? 'Thợ phụ' : 'Thợ chính'}
                fg={isSupport ? C.primary : C.ink2}
                bg={isSupport ? C.primarySoft : C.surface}
              />
            ) : null}
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: meta.fg }} />
          </View>
          <Text style={[tx.heroDesc, { color: C.ink2 }]}>{o.status === 'cancelled' ? (o.cancelReason || TECH_STATUS_DESC.cancelled) : techDesc}</Text>
          {isSupport && supportCategoryLabels.length > 0 ? (
            <Text style={[ui.meta, { color: C.primary, fontWeight: '700', marginTop: 6 }]}>
              Phụ trách nhóm: {supportCategoryLabels.join(', ')}
            </Text>
          ) : null}
          {(() => {
            const effectiveStepPos = (o.status === 'quoted' && !o.travelStartedAt && !o.arrivedAt)
              ? Math.min(techStepPos, 1)
              : techStepPos;
            return (
              <>
                {o.status !== 'cancelled' ? (
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
                    {techSteps.map((st, i) => <View key={st.key} style={[tx.stepBar, { backgroundColor: i <= effectiveStepPos ? meta.fg : C.line }]} />)}
                  </View>
                ) : null}
                {o.status !== 'cancelled' && effectiveStepPos >= 0 ? (
                  <Text style={[ui.meta, { color: C.muted, marginTop: 6, fontWeight: '700' }]}>
                    Bước {effectiveStepPos + 1}/{techSteps.length}: {o.status === 'quoted' && o.quote?.isExternalFinalization ? 'Xác nhận hoá đơn chi phí cuối' : techSteps[effectiveStepPos].label}
                  </Text>
                ) : null}
              </>
            );
          })()}
        </View>
        {o.status === 'pending' && iDeclined ? (
          <View style={tx.offline}><Text style={{ color: C.goldInk, fontWeight: '700' }}>Bạn đã từ chối việc này. Vẫn có thể nhận lại nếu còn trống lịch.</Text></View>
        ) : null}
        {o.status === 'onway' ? <TrackingCard order={o} compact /> : null}

        {mine && waitingForLead ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="clock" size={16} color={C.goldInk} strokeWidth={2.2} />
              <Text style={{ fontWeight: '800', color: C.goldInk, fontSize: 13.5, flex: 1 }}>
                Đang chờ thợ chính tới hiện trường
              </Text>
            </View>
            <Text style={{ color: C.ink2, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
              Bạn đã check-in thành công, nhưng thợ chính chưa check-in tại nhà khách. Vui lòng đợi thợ chính bắt đầu ca trước khi thao tác các bước, ghi vật tư hay thêm ghi chú.
            </Text>
          </Card>
        ) : null}

        {!isSupport && o.status === 'pending_payment' ? (
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
        {!isSupport && o.followUpRequested ? (
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

        {o.status === 'cancelled' ? (
          isSupport ? (
            <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.muted }}>
              <Text style={[tx.h, { color: C.ink }]}>Đơn đã bị huỷ</Text>
              <Text style={{ color: C.ink2, lineHeight: 20 }}>
                Đơn hàng này đã bị huỷ, bạn không cần thực hiện tiếp.
              </Text>
            </Card>
          ) : (
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
                      : o.bill?.cashClaimPending
                        ? `Khách báo đã trả tiền mặt ${formatVND(o.inspectionFee)} phí kiểm tra — xác nhận bên dưới nếu bạn đã nhận đủ.`
                        : `Khách huỷ sau khi thợ đã tới kiểm tra thiết bị trực tiếp tại nhà. Khách thanh toán ${formatVND(o.inspectionFee)} phí kiểm tra cho thợ.`
                  : (o.arrivedAt || o.checkIn)
                    ? 'Chính sách Minh Đức miễn phí 100% kiểm tra tại nhà khi khách từ chối sửa chữa (0đ).'
                    : 'Đơn đã được huỷ trước khi thợ kiểm tra tại nhà (0đ).'}
              </Text>
              {(o.inspectionFee || 0) > 0 && mine && !isSupport && !orderPaid && !isQRPayment(o) ? (
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
          )
        ) : null}

        {/* Báo giá trước khi xuất phát (Thợ chủ động thỏa thuận trước khi đi) */}
        {!isSupport && o.status === 'confirmed' && mine && !o.quote && o.kind !== 'warranty' && o.kind !== 'followup' ? (
          o.customerHasApp === false ? (
            <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.gold }}>
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 14 }}>Khách đặt qua tổng đài (không dùng app)</Text>
              <Text style={[ui.meta, { marginTop: 3, lineHeight: 18 }]}>
                Khách không dùng app: đến nơi kiểm tra rồi báo giá tại chỗ.
              </Text>
            </Card>
          ) : (
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
          )
        ) : null}

        {/* ===== Chọn nhanh tại nhà: Không phát sinh vs Có phát sinh ===== */}
        {!isSupport && mine && o.status === 'diagnosing' && !showDiagQuoteForm && !(o.quote?.isExternalFinalization && o.quote?.revisionRequested) ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <Text style={tx.h}>Kiểm tra thiết bị tại nhà</Text>
            <Text style={{ color: C.ink2, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
              {o.quote?.approved
                ? 'Khách đã duyệt báo giá trước đó. Có phát sinh thêm hạng mục nào nữa không?'
                : 'Đúng dịch vụ khách đã đặt hay có phát sinh thêm vật tư / lỗi khác?'}
            </Text>
            <View style={{ gap: 8 }}>
              <Btn
                title={busyQuote ? 'Đang bắt đầu…' : 'Không phát sinh · Bắt đầu sửa ngay'}
                icon="wrench"
                disabled={busyQuote}
                onPress={quickStartRepair}
              />
              {o.kind !== 'followup' ? (
                <Btn
                  title={o.quote?.approved ? 'Có phát sinh thêm · Lập báo giá bổ sung' : 'Có phát sinh · Chẩn đoán & Báo giá'}
                  icon="receipt-text"
                  variant="soft"
                  disabled={busyQuote}
                  onPress={() => setShowDiagQuoteForm(true)}
                />
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* ===== Chẩn đoán & báo giá ===== */}
        {isQuoteEditorOpen ? (
          <>
            {o.status === 'diagnosing' && !o.quote?.revisionRequested && o.kind !== 'warranty' && !o.quoteEditing ? (
              <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
                <Tap onPress={() => setShowDiagQuoteForm(false)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppIcon name="arrow-left" size={14} color={C.primary} strokeWidth={2.3} />
                  <Text style={ui.link}>Quay lại chọn nhanh (Không phát sinh)</Text>
                </Tap>
              </View>
            ) : null}
            <QuoteEditor
              o={o}
              draft={draft}
              cats={cats}
              matsCount={mats.length}
              onOpenMaterials={() => setMatMode('quote')}
              onCancelEdit={() => setShowPreQuote(false)}
              evidence={evidence}
            />
          </>
        ) : null}

        {/* ===== Khách yêu cầu kiểm tra lại giá vật tư mua ngoài ===== */}
        {!isSupport && mine && o.quote?.isExternalFinalization && o.quote?.revisionRequested ? (
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
        {!isSupport && mine && o.externalPriceState === 'awaiting_customer_approval' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.primary }}>
            <Text style={{ fontWeight: '800', color: C.primary, fontSize: 13.5 }}>Đang chờ khách xác nhận hoá đơn chi phí cuối</Text>
            <Text style={[ui.meta, { color: C.ink2, marginTop: 4, lineHeight: 18 }]}>
              Bạn đã gửi mức giá vật tư phát sinh cuối cùng. Khi khách xác nhận tổng hoá đơn, bạn chỉ cần bấm “Ký bàn giao & Mở TT” để hoàn tất.
            </Text>
          </Card>
        ) : null}

        {/* Thông báo đã chốt xong Bill chi phí cuối -> hướng dẫn ký bàn giao */}
        {!isSupport && o.status === 'repairing' && mine && o.externalPriceState === 'finalized' ? (
          <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.green }}>
            <Text style={{ fontWeight: '800', color: C.greenInk, fontSize: 13.5 }}>
              Đã chốt tổng chi phí cuối ({formatVND(orderTotal(o))})
            </Text>
            <Text style={[ui.meta, { color: C.ink2, marginTop: 3, lineHeight: 18 }]}>
              Bấm “Ký bàn giao & Mở TT” ở thanh dưới cùng để ký biên bản bàn giao thiết bị & mở thanh toán cho khách hàng.
            </Text>
          </Card>
        ) : null}

        {/* ===== Vật tư sử dụng & Vật tư phát sinh ===== */}
        {(mine && (
          (isSupport && Boolean(o.arrivedAt || o.checkIn) && ['diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(o.status)) ||
          (!isSupport && (
            o.status === 'repairing' ||
            (o.quote?.isExternalFinalization && o.quote?.revisionRequested && ['diagnosing', 'quoted'].includes(o.status)) ||
            getPendingExternalEstimates(o).length > 0
          ))
        )) || (o.materials || []).length || (!isSupport && (o.finalizedExternalParts || []).length) ? (
          <UsedAndExtraMaterialsCard
            o={o}
            mine={mine}
            isSupport={isSupport}
            workLocked={waitingForLead || (isSupport && !o.arrivedAt && !o.checkIn)}
            onOpenWarehouseUsage={() => setMatMode('usage')}
            sharedExtraParts={extraBillParts}
            onChangeSharedExtraParts={setExtraBillParts}
          />
        ) : null}

        {/* ===== Biên lai linh kiện mua ngoài (hỗ trợ chụp lại nếu mờ) ===== */}
        {mine && !isSupport ? <ReceiptCard o={o} editable={['diagnosing', 'repairing'].includes(o.status)} onPreviewPhoto={setPreviewTechPhoto} /> : null}

        {/* ===== Quy trình kỹ thuật (thu gọn theo từng dịch vụ) ===== */}
        {o.procedure && Array.isArray(o.procedure.services) && o.procedure.services.length > 0 && (mine || o.procedure.progress_percent > 0) ? (
          <ProcedureCard
            o={o}
            editable={Boolean(
              mine &&
              !waitingForLead &&
              (isSupport
                ? (Boolean(o.arrivedAt || o.checkIn) && ['diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(o.status))
                : ['diagnosing', 'repairing'].includes(o.status)),
            )}
            evidence={evidence}
            onPreviewPhoto={setPreviewTechPhoto}
          />
        ) : null}

        {/* ===== Báo giá đã gửi ===== */}
        {o.quote && (isSupport || !(mine && ['diagnosing', 'confirmed', 'out_of_warranty'].includes(o.status) && ((o.quote.revisionRequested && !o.quote.isExternalFinalization) || showPreQuote))) ? (
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
                          const warrantyMeta = [
                            l.serialNumber ? `Sê-ri: ${l.serialNumber}` : null,
                            l.warrantyDays > 0 ? `${l.isCustom ? 'BH hãng' : 'Bảo hành'}: ${l.warrantyDays} ngày` : null,
                            l.externalWarrantyCode ? `Mã BH: ${l.externalWarrantyCode}` : null,
                          ].filter(Boolean).join(' · ');
                          return (
                            <View key={`${l.name}-${i}`}>
                              <View style={tx.qRow}>
                                <AppIcon name={l.type === 'part' ? 'settings' : 'hammer'} size={13} color={C.ink2} style={{ marginTop: 2 }} />
                                <Text style={{ flex: 1, color: C.ink2 }} numberOfLines={2}>
                                  {l.name} x{l.qty}{l.isEstimatedRange ? ' (Giá dao động)' : l.isFinalizedExternal ? ' (VT ngoài chốt giá)' : ''}
                                </Text>
                                {!isSupport ? (
                                  <Text style={{ color: l.isEstimatedRange ? C.orange : C.ink, fontWeight: '700' }}>
                                    {l.isEstimatedRange
                                      ? formatRangeVND(l.minPrice * l.qty, l.maxPrice * l.qty)
                                      : formatVND((l.isFinalizedExternal && l.actualPrice != null ? l.actualPrice : l.price) * l.qty)}
                                  </Text>
                                ) : null}
                              </View>
                              {warrantyMeta ? (
                                <Text style={[ui.meta, { marginLeft: 19, marginTop: 2, fontSize: 11.5, color: C.primary, fontWeight: '600' }]}>
                                  {warrantyMeta}
                                </Text>
                              ) : null}
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
                  {!isSupport && o.productDiscount ? (
                    <View style={tx.qRow}>
                      <AppIcon name="tag" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Giảm giá dịch vụ</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(o.productDiscount)}</Text>
                    </View>
                  ) : null}
                  {!isSupport && o.comboDiscount ? (
                    <View style={tx.qRow}>
                      <AppIcon name="percent" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Ưu đãi {o.comboLabel || 'gộp nhiều máy (-5%)'}</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(o.comboDiscount)}</Text>
                    </View>
                  ) : null}
                  {!isSupport && partDisc > 0 ? (
                    <View style={tx.qRow}>
                      <AppIcon name="award" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Ưu đãi hạng thành viên (−{o.bill?.tierPartDiscountPercent || 0}% VT)</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(partDisc)}</Text>
                    </View>
                  ) : null}
                  {!isSupport && voucherDisc > 0 ? (
                    <View style={tx.qRow}>
                      <AppIcon name="ticket" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Mã giảm giá {o.voucher?.code || ''}</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(voucherDisc)}</Text>
                    </View>
                  ) : null}
                  {!isSupport && lateDisc > 0 ? (
                    <View style={tx.qRow}>
                      <AppIcon name="clock" size={13} color={C.green} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, color: C.green }} numberOfLines={1}>Bồi thường đến muộn</Text>
                      <Text style={{ color: C.green, fontWeight: '700' }}>-{formatVND(lateDisc)}</Text>
                    </View>
                  ) : null}
                  {!isSupport ? (
                    o.quote.hasEstimatedRange && displayQuoteTotal.includes('–') ? (
                      <View style={[tx.totalRow, { flexDirection: 'column', alignItems: 'stretch', gap: 4, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontWeight: '800', color: C.ink, flex: 1 }}>Tổng thanh toán</Text>
                          <Badge text="Dự kiến" fg={C.goldInk} bg={C.goldSoft} />
                        </View>
                        <Text style={[ui.price, { fontSize: 18, textAlign: 'right', fontVariant: ['tabular-nums'] }]} numberOfLines={1} adjustsFontSizeToFit>
                          {displayQuoteTotal}
                        </Text>
                      </View>
                    ) : (
                      <View style={[tx.totalRow, { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }]}>
                        <Text style={{ fontWeight: '800', color: C.ink, flex: 1 }}>Tổng</Text>
                        <Text style={[ui.price, { fontSize: 17, flexShrink: 0, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>{displayQuoteTotal}</Text>
                      </View>
                    )
                  ) : null}
                </>
              );
            })()}
            {o.quote.rejectReason ? (
              <Text style={[ui.meta, { color: o.quote.revisionRequested ? C.goldInk : C.red }]}>
                {o.quote.revisionRequested ? 'Lý do khách yêu cầu báo giá lại: ' : 'Lý do khách từ chối: '}
                {o.quote.rejectReason}
              </Text>
            ) : null}
            {mine && !isSupport && o.quote.revisionRequested && o.status !== 'quoted' && !o.quote.isExternalFinalization ? (
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
            {o.status === 'quoted' && mine && !isSupport ? (
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
                {canShowOnsiteQuoteApproval(o, { mine, isSupport }) ? (
                  <View style={{ marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, gap: 6 }}>
                    <Text style={[ui.meta, { marginTop: 0 }]}>
                      Khách không dùng app? Chụp ảnh báo giá có chữ ký để duyệt tại chỗ.
                    </Text>
                    <Btn
                      title="Khách đồng ý tại chỗ"
                      icon="camera"
                      small
                      onPress={() => {
                        setOnsitePhotos([]);
                        setOnsiteNote('');
                        setShowOnsiteApprove(true);
                      }}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* ===== Chẩn đoán & ảnh triệu chứng khi không có báo giá phát sinh ===== */}
        {!o.quote && !isQuoteEditorOpen && (o.diagnosisReport || evidence.some((e) => e?.stage === 'diagnosis' && e?.uri)) ? (
          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={[tx.h, { marginBottom: 0, flex: 1 }]}>Kết quả chẩn đoán kỹ thuật</Text>
              {['repairing', 'pending_payment', 'done'].includes(o.status) ? (
                <Badge text="Không phát sinh (0đ)" fg={C.greenInk} bg={C.greenSoft} />
              ) : (
                <Badge
                  text={o.diagnosisReport ? 'Đã ghi chẩn đoán' : 'Ảnh triệu chứng'}
                  fg={C.primary}
                  bg={C.primarySoft}
                />
              )}
            </View>
            <View style={{ marginTop: 8 }}>
              <SymptomBreakdownView
                symptoms={o.diagnosisReport?.symptoms}
                diagnosis={o.diagnosisReport?.diagnosis}
                recommendation={o.diagnosisReport?.recommendation}
                evidence={evidence}
                initialAttachments={o.attachments}
                defaultExpandFirst
              />
            </View>
          </Card>
        ) : null}

        {/* ===== Biên bản hoàn thành ===== */}
        {o.report && o.status !== 'cancelled' ? (() => {
          const strictAfterPhotos = evidence.filter(
            (e) => e.stage === 'after' && e.uri && (!e.procedureStepId || /hoàn thành|bàn giao/i.test(String(e.note || ''))),
          );
          const completionPhotos = strictAfterPhotos.length
            ? strictAfterPhotos
            : (['pending_payment', 'done'].includes(o.status) ? evidence.filter((e) => e.stage === 'after' && e.uri) : []);
          return (
            <Card style={{ marginTop: 12, backgroundColor: C.card, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.green }}>
              <Text style={tx.h}>Biên bản hoàn thành</Text>
              <Text style={{ color: C.ink2, lineHeight: 21 }}>{o.report.summary}</Text>
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
              {o.report.customerSignature ? (
                <View style={{ marginTop: 8, padding: 8, borderRadius: R.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}>
                  <Text style={{ fontSize: 12, color: C.greenInk, fontWeight: '800' }}>Chữ ký xác nhận của khách hàng:</Text>
                  <Text style={{ fontStyle: 'italic', fontSize: 15, fontWeight: '800', color: C.navy, marginTop: 2 }}>{o.report.customerSignature}</Text>
                </View>
              ) : null}
              <Text style={[ui.meta, { marginTop: 8 }]}>
                {fmtDateTime(o.report.at)} · {o.kind === 'warranty'
                  ? 'Hoàn thành bảo hành miễn phí'
                  : o.kind === 'followup'
                    ? 'Hoàn thành tái khám miễn phí'
                    : isSupport
                      ? 'Thợ chính hoàn tất bàn giao'
                      : orderPaid
                        ? (isQRPayment(o)
                          ? `Khách đã chuyển khoản VietQR ${formatVND(orderTotal(o))} về hệ thống (Thợ không thu tiền mặt)`
                          : `Đã thu tiền mặt ${formatVND(orderTotal(o))}${o.report.paidBy === 'customer' ? ' (khách xác nhận)' : ''}`)
                        : (isQRPayment(o)
                          ? `Chờ khách quét mã VietQR ${formatVND(o.status === 'pending_payment' ? amountRemaining(o) : orderTotal(o))} trên ứng dụng Khách hàng (Thợ không thu tiền mặt)`
                          : 'Chưa thu tiền / chờ khách xác nhận')}
              </Text>
              {orderPaid && !isSupport && o.report.paidAt ? (
                <Text style={[ui.meta, { marginTop: 4, color: C.green }]}>Xác nhận lúc {fmtDateTime(o.report.paidAt)}</Text>
              ) : null}
            </Card>
          );
        })() : null}
        {!isSupport && (o.materialWarranties || []).length > 0 ? (
          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AppIcon name="shield-check" size={18} color={C.primary} strokeWidth={2.2} />
              <Text style={[tx.h, { marginBottom: 0, flex: 1 }]}>Bảo hành linh kiện ({o.materialWarranties.length})</Text>
            </View>
            {o.materialWarranties.map((mw, idx) => {
              const stMeta = MATERIAL_WARRANTY_STATUS_META[mw.status] || { label: mw.status || 'Theo dõi', tone: 'primary' };
              const badgeColors =
                stMeta.tone === 'green' ? { fg: C.greenInk, bg: C.greenSoft }
                  : stMeta.tone === 'gold' ? { fg: C.goldInk, bg: C.goldSoft }
                    : stMeta.tone === 'red' ? { fg: C.redInk, bg: C.redSoft }
                      : stMeta.tone === 'neutral' ? { fg: C.ink2, bg: C.surface }
                        : stMeta.tone === 'muted' ? { fg: C.muted, bg: C.surface }
                          : { fg: C.primary, bg: C.primarySoft };
              const matchedLine = (o.quote?.lines || []).find(
                (l) => String(l.name || '').trim().toLowerCase() === String(mw.itemName || '').trim().toLowerCase(),
              );
              const receiptUri =
                mw.receiptUrl
                || (mw.receiptAttachmentId ? evidence.find((e) => String(e.dbAttachmentId) === String(mw.receiptAttachmentId))?.uri : null)
                || matchedLine?.receiptUrl
                || null;
              return (
                <View key={mw.id || `tech_mw_${idx}`} style={{ paddingTop: idx > 0 ? 8 : 0, marginTop: idx > 0 ? 8 : 0, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: C.line }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontWeight: '700', color: C.ink, flex: 1 }}>{mw.itemName}{mw.quantity > 1 ? ` x${mw.quantity}` : ''}</Text>
                    <Badge text={stMeta.label} fg={badgeColors.fg} bg={badgeColors.bg} />
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {mw.isExternalPurchase ? <Badge text="Bảo hành hãng / bên thứ 3" fg={C.goldInk} bg={C.goldSoft} /> : null}
                    {mw.warrantyDays > 0 ? <Badge text={`${mw.warrantyDays} ngày`} fg={C.ink2} bg={C.surface} /> : null}
                  </View>
                  {mw.serialNumber ? <Text style={[ui.meta, { marginTop: 3 }]}>Số sê-ri: {mw.serialNumber}</Text> : null}
                  {mw.externalWarrantyCode ? <Text style={[ui.meta, { marginTop: 2, color: C.goldInk, fontWeight: '700' }]}>Mã BH hãng: {mw.externalWarrantyCode}</Text> : null}
                  {mw.startsAt || mw.expiresAt ? (
                    <Text style={[ui.meta, { marginTop: 2 }]}>
                      Hiệu lực: {mw.startsAt ? fmtDate(mw.startsAt) : 'Khi hoàn tất'} → {mw.expiresAt ? fmtDate(mw.expiresAt) : '—'}
                      {mw.remainingDays != null && mw.remainingDays > 0 && ['VALID', 'EXPIRING_SOON'].includes(mw.status) ? ` (còn ${mw.remainingDays} ngày)` : ''}
                    </Text>
                  ) : null}
                  {mw.replacesId ? <Text style={[ui.meta, { marginTop: 2 }]}>Thay thế cho linh kiện #{mw.replacesId}</Text> : null}
                  {mw.statusReason ? <Text style={[ui.meta, { marginTop: 2, color: C.redInk }]}>Lý do: {mw.statusReason}</Text> : null}
                  {receiptUri ? (
                    <Tap
                      onPress={() => setPreviewTechPhoto({ uri: receiptUri, title: `Hoá đơn linh kiện · ${mw.itemName}` })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' }}
                    >
                      <AppIcon name="receipt-text" size={13} color={C.primary} strokeWidth={2.2} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary }}>Xem hoá đơn</Text>
                    </Tap>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ) : null}
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

        {/* ===== Thông tin đơn hàng (gộp Khách hàng + Lịch hẹn + Check-in gọn) ===== */}
        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Text style={[tx.h, { marginBottom: 0 }]}>Thông tin đơn hàng</Text>
            {o.customerTierLabel ? (
              <Badge text={`👑 ${o.customerTierLabel}${o.warrantyDays > 0 ? ` · BH ${o.warrantyDays}n` : ''}`} fg={C.primary} bg={C.primarySoft} />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBox icon="user" size={44} bg={C.primarySoft} radius={14} />
            <View style={{ flex: 1 }}>
              <Text style={tx.name}>{customerDisplayName(o.address)}</Text>
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

          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 12 }} />

          <Text style={tx.info}>📅 {o.dateLabel} · {o.slot}</Text>
          {o.warrantyOf && (o.kind === 'warranty' || o.kind === 'followup') ? (
            <Text style={[tx.info, { marginTop: 6 }]}>
              🔗 {o.kind === 'followup' ? 'Tái khám cho đơn' : 'Bảo hành cho đơn'}: {o.warrantyOf}
            </Text>
          ) : null}
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
          {o.outOfWarranty && o.outOfWarrantyReason ? (
            <Text style={[tx.info, { marginTop: 6, color: C.redInk, fontWeight: '700' }]}>⚠️ Lý do ngoài bảo hành: {o.outOfWarrantyReason}</Text>
          ) : null}
          {(() => {
            const oowEvidence = (o.evidence || []).filter(
              (e) => e?.uri && (e.isOowUpload || /^\[Ngoài bảo hành\]/i.test(String(e.note || '').trim())),
            );
            if (!oowEvidence.length) return null;
            return (
              <View style={{ marginTop: 8 }}>
                <Text style={[ui.meta, { fontWeight: '700', color: C.redInk, marginBottom: 6 }]}>
                  Ảnh minh chứng ngoài bảo hành ({oowEvidence.length})
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {oowEvidence.map((ev, idx) => (
                    <Tap
                      key={ev.id || `oow_ev_${idx}`}
                      style={tx.thumb}
                      onPress={() => setPreviewTechPhoto({ uri: ev.uri, title: ev.note || 'Ảnh minh chứng ngoài bảo hành' })}
                      scaleTo={0.97}
                    >
                      <Image source={{ uri: ev.uri }} style={{ width: '100%', height: '100%' }} />
                    </Tap>
                  ))}
                </View>
              </View>
            );
          })()}
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
          {!isSupport ? <Text style={[tx.info, { marginTop: 6 }]}>💳 {o.payment}</Text> : null}
          {o.kind !== 'warranty' && o.kind !== 'followup' && o.status !== 'cancelled' && !isSupport ? (
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
          {!isSupport && o.kind !== 'warranty' && o.kind !== 'followup' && o.status !== 'cancelled' ? (() => {
            const paidAmt = Number(o.bill?.paidAmount) || 0;
            const hasDiscounts = prodDisc > 0 || comboDisc > 0 || partDisc > 0 || voucherDisc > 0 || lateDisc > 0;
            const showPartial = paidAmt > 0 && !orderPaid;
            if (!((!o.quote && hasDiscounts) || showPartial)) return null;
            return (
              <View style={{ marginTop: 8, padding: 10, borderRadius: R.sm, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, gap: 4 }}>
                {!o.quote && hasDiscounts ? (
                  <>
                    <View style={tx.qRow}>
                      <Text style={{ flex: 1, fontSize: 12.5, color: C.ink2 }}>Giá dịch vụ gốc</Text>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.ink }}>{formatVND(o.goods || bookedValue(o))}</Text>
                    </View>
                    {prodDisc > 0 ? (
                      <View style={tx.qRow}>
                        <Text style={{ flex: 1, fontSize: 12.5, color: C.green }}>Giảm giá dịch vụ</Text>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green }}>-{formatVND(prodDisc)}</Text>
                      </View>
                    ) : null}
                    {comboDisc > 0 ? (
                      <View style={tx.qRow}>
                        <Text style={{ flex: 1, fontSize: 12.5, color: C.green }}>Ưu đãi {o.comboLabel || 'gộp nhiều máy (-5%)'}</Text>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green }}>-{formatVND(comboDisc)}</Text>
                      </View>
                    ) : null}
                    {partDisc > 0 ? (
                      <View style={tx.qRow}>
                        <Text style={{ flex: 1, fontSize: 12.5, color: C.green }}>Ưu đãi hạng thành viên (−{o.bill?.tierPartDiscountPercent || 0}% VT)</Text>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green }}>-{formatVND(partDisc)}</Text>
                      </View>
                    ) : null}
                    {voucherDisc > 0 ? (
                      <View style={tx.qRow}>
                        <Text style={{ flex: 1, fontSize: 12.5, color: C.green }}>Mã giảm giá {o.voucher?.code || ''}</Text>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green }}>-{formatVND(voucherDisc)}</Text>
                      </View>
                    ) : null}
                    {lateDisc > 0 ? (
                      <View style={tx.qRow}>
                        <Text style={{ flex: 1, fontSize: 12.5, color: C.green }}>Bồi thường đến muộn</Text>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green }}>-{formatVND(lateDisc)}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
                {showPartial ? (
                  <>
                    <View style={[tx.qRow, !o.quote && hasDiscounts ? { marginTop: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: C.line } : null]}>
                      <Text style={{ flex: 1, fontSize: 12.5, color: C.ink2 }}>Tổng đơn</Text>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.ink }}>{formatVND(orderTotal(o))}</Text>
                    </View>
                    <View style={tx.qRow}>
                      <Text style={{ flex: 1, fontSize: 12.5, color: C.green }}>Khách đã thanh toán trước</Text>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.green }}>-{formatVND(paidAmt)}</Text>
                    </View>
                    <View style={[tx.qRow, { marginTop: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: C.line }]}>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: C.ink }}>
                        {isQRPayment(o) ? 'Còn lại cần thanh toán' : 'Còn lại cần thu'}
                      </Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.primary }}>{formatVND(amountRemaining(o))}</Text>
                    </View>
                  </>
                ) : (
                  <View style={[tx.qRow, { marginTop: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: C.line }]}>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: C.ink }}>Tổng thanh toán</Text>
                    <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.primary }}>{formatOrderTotal(o)}</Text>
                  </View>
                )}
              </View>
            );
          })() : null}
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
          {o.checkIn ? (
            <View
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: C.line,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <AppIcon name="map-pin" size={14} color={C.green} strokeWidth={2.2} />
                <Text style={{ fontSize: 12.5, color: C.ink2, fontWeight: '600', flex: 1 }}>
                  Đã đến nơi{o.checkIn.at ? ` · ${fmtDateTime(o.checkIn.at)}` : ''}
                </Text>
              </View>
              {o.lateCompensation && o.lateCompensation.tier !== 'ok' && (o.lateCompensation.minutesLate || o.lateCompensation.minutes || o.lateCompensation.amount) ? (
                <Badge
                  text={`${(o.lateCompensation.minutesLate || o.lateCompensation.minutes) ? `Muộn ${o.lateCompensation.minutesLate || o.lateCompensation.minutes}p` : 'Đến muộn'}${!isSupport && lateDisc > 0 ? ` (-${formatVND(lateDisc)})` : ''}`}
                  fg={C.goldInk}
                  bg={C.goldSoft}
                />
              ) : o.arrivedAt ? (
                <Badge text="Đúng giờ" fg={C.greenInk} bg={C.greenSoft} />
              ) : null}
            </View>
          ) : null}
        </Card>

        {/* Nhật ký ghi chú sửa chữa (thu gọn khi chưa có ghi chú) */}
        {(mine && !waitingForLead && (isSupport ? (Boolean(o.arrivedAt || o.checkIn) && ['diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(o.status)) : o.status === 'repairing')) || (o.repairNotes || []).length ? (
          <Card style={{ marginTop: 12 }}>
            <Tap
              onPress={() => setShowRepairNotes((v) => !v)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
            >
              <Text style={[tx.h, { marginBottom: 0, flex: 1 }]}>
                Ghi chú sửa chữa{(o.repairNotes || []).length === 0 && !showRepairNotes ? ' (tuỳ chọn)' : ''}
              </Text>
              {(o.repairNotes || []).length > 0 ? (
                <Badge text={`${(o.repairNotes || []).length} ghi chú`} fg={C.ink2} bg={C.surface} />
              ) : null}
              <View style={{ transform: [{ rotate: showRepairNotes ? '-90deg' : '90deg' }] }}>
                <AppIcon name="chevron-right" size={14} color={C.muted} strokeWidth={2.2} />
              </View>
            </Tap>
            {showRepairNotes ? (
              <View style={{ marginTop: 10 }}>
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
                        {mine && !waitingForLead && n.dbProgressId && (isSupport ? (Boolean(o.arrivedAt || o.checkIn) && ['diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(o.status)) : ['diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(o.status)) ? (
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
                {mine && !waitingForLead && (isSupport ? (Boolean(o.arrivedAt || o.checkIn) && ['diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(o.status)) : o.status === 'repairing') ? (
                  <View style={{ marginTop: 4 }}>
                    <Field value={repairNote} onChangeText={setRepairNote} placeholder="Thêm ghi chú công việc đã làm / phát hiện thêm…" multiline />
                    <Btn title={busyNote ? 'Đang lưu…' : '＋ Thêm ghi chú mới'} variant="soft" small style={{ marginTop: 10 }} disabled={busyNote || !repairNote.trim()} onPress={submitRepairNote} />
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Lịch sử trạng thái (thu gọn mặc định ở cuối trang) */}
        <Card style={{ marginTop: 12 }}>
          <Tap
            onPress={() => setShowTimeline((v) => !v)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
          >
            <Text style={[tx.h, { marginBottom: 0, flex: 1 }]}>
              Dòng thời gian ({(o.history || []).length} mốc)
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.primary }}>
                {showTimeline ? 'Thu gọn' : 'Xem'}
              </Text>
              <View style={{ transform: [{ rotate: showTimeline ? '-90deg' : '90deg' }] }}>
                <AppIcon name="chevron-right" size={14} color={C.primary} strokeWidth={2.2} />
              </View>
            </View>
          </Tap>
          {showTimeline ? (
            <View style={{ marginTop: 12 }}>
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
            </View>
          ) : null}
        </Card>
      </ScrollView>

      {/* ===== Thanh hành động ===== */}
      {o.status === 'pending' ? (
        <View style={tx.dock}>
          <Btn title="Từ chối ca" variant="ghost" style={{ flex: 1 }} disabled={busyAccept || busyDecline} onPress={() => { setReason(DECLINE_REASONS[0]); setReasonNote(''); setShowDecline(true); }} />
          <Btn title={busyAccept ? 'Đang nhận…' : 'Tiếp nhận ca'} icon="handshake" style={{ flex: 2 }} disabled={busyAccept || busyDecline} onPress={() => run(K.accept, () => a.acceptJob(o.code))} />
        </View>
      ) : null}
      {o.status === 'quoted' && mine && !isSupport ? (
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
      {mine && !isSupport && ['confirmed', 'onway'].includes(o.status) ? (
        <View style={tx.dock}>
          <Btn title="Trả việc" variant="dangerSoft" style={{ flex: 1 }} onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }} />
          {o.status === 'confirmed' && (showPreQuote || o.quote?.revisionRequested) ? (
            <Btn title={busyQuote ? 'Đang gửi…' : (o.quote?.revisionRequested ? 'Gửi lại báo giá' : 'Gửi báo giá trước khi đi')} icon="receipt-text" style={{ flex: 2 }} disabled={busyQuote} onPress={sendQuote} />
          ) : next ? (
            <Btn title={next.label} icon={next.icon} variant={next.variant || 'primary'} style={{ flex: 2 }} disabled={Boolean(next.disabled)} onPress={next.run} />
          ) : null}
        </View>
      ) : null}
      {mine && !isSupport && (o.status === 'diagnosing' || o.status === 'out_of_warranty') ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line }}>
          <Tap onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }}>
            <Text style={{ color: C.red, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>Không thể tiếp tục? Trả việc cho điều phối</Text>
          </Tap>
        </View>
      ) : null}
      {mine && !isSupport && (o.status === 'diagnosing' || o.status === 'out_of_warranty') ? (
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
        ) : !showDiagQuoteForm && o.status === 'diagnosing' ? (
          <View style={tx.dock}>
            {o.kind !== 'followup' ? (
              <Btn
                title="Báo giá phát sinh"
                icon="receipt-text"
                variant="soft"
                style={{ flex: 1 }}
                disabled={busyQuote}
                onPress={() => setShowDiagQuoteForm(true)}
              />
            ) : null}
            <Btn
              title={busyQuote ? 'Đang bắt đầu…' : 'Bắt đầu sửa ngay'}
              icon="wrench"
              style={{ flex: 1.4 }}
              disabled={busyQuote}
              onPress={quickStartRepair}
            />
          </View>
        ) : (
          <View style={tx.dock}>
            <View style={{ flex: 1 }}>
              <Text style={[ui.meta, { marginTop: 0 }]}>
                {hasDraftRange ? 'Tổng cộng dự kiến' : 'Tổng thanh toán'}
              </Text>
              <Text style={[ui.price, { fontSize: hasDraftRange && dockTotalMin !== dockTotalMax ? 14.5 : 17.5 }]}>
                {formatRangeVND(dockTotalMin, dockTotalMax)}
              </Text>
              {diffMax > 0 ? (
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.orange, marginTop: 1 }} numberOfLines={1}>
                  Phát sinh: {formatRangeVND(diffMin, diffMax, { prefix: '+' })}
                </Text>
              ) : dockReductionMax > 0 ? (
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.green, marginTop: 1 }} numberOfLines={1}>
                  Giảm: {formatRangeVND(dockReductionMin, dockReductionMax, { prefix: '-' })}
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
      {mine && !isSupport && o.status === 'repairing' ? (
        <View style={tx.dock}>
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
            style={{ flex: 1 }}
            onPress={openComplete}
          />
        </View>
      ) : null}
      {mine && isSupport && ['confirmed', 'onway', 'diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(o.status) ? (
        <View style={tx.dock}>
          <Btn
            title="Trả việc"
            variant="dangerSoft"
            style={{ flex: 1 }}
            onPress={() => { setReleaseReason(RELEASE_REASONS[0]); setReleaseNote(''); setShowRelease(true); }}
          />
          {waitingForLead ? (
            <Btn
              title="Chờ thợ chính tới"
              icon="clock"
              variant="soft"
              style={{ flex: 2 }}
              disabled
              onPress={() => {}}
            />
          ) : ['confirmed', 'onway'].includes(o.status) && next ? (
            <Btn
              title={next.label}
              icon={next.icon}
              variant={next.variant || 'primary'}
              style={{ flex: 2 }}
              disabled={Boolean(next.disabled)}
              onPress={next.run}
            />
          ) : ['diagnosing', 'quoted', 'repairing', 'out_of_warranty'].includes(o.status) && (o.arrivedAt || o.checkIn) ? (
            <Btn
              title={busyFinishPart ? 'Đang gửi…' : 'Xong phần việc'}
              icon="check-circle-2"
              style={{ flex: 2 }}
              disabled={busyFinishPart}
              onPress={() => { setSupportPartNote(''); setShowFinishSupport(true); }}
            />
          ) : (
            <View style={{ flex: 2, alignItems: 'center' }}>
              <Text style={[ui.meta, { marginTop: 0 }]}>Đang phối hợp cùng thợ chính</Text>
            </View>
          )}
        </View>
      ) : null}
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
                {isSupport
                  ? `Đơn vị: ${m.unit || 'cái'}`
                  : (Number(m.price) > 0 ? `${formatVND(m.price)} / ${m.unit}` : 'Chưa niêm yết giá · Nhập đơn giá khi thêm')}
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
              {isSupport
                ? 'Thợ phụ trả việc sẽ chỉ rời khỏi phần hỗ trợ; đơn của khách vẫn giữ cho thợ chính phụ trách.'
                : releaseAssess.free
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
      <Sheet
        visible={showFinishSupport}
        onClose={() => { if (!busyFinishPart) setShowFinishSupport(false); }}
        title="Xác nhận xong phần việc"
        footer={(
          <Btn
            title={busyFinishPart ? 'Đang gửi…' : 'Xác nhận xong phần việc'}
            icon="check-circle-2"
            disabled={busyFinishPart}
            onPress={async () => {
              const res = await run(K.finishPart, () => a.finishSupportPart(o.code, supportPartNote.trim()));
              if (succeeded(res)) {
                setShowFinishSupport(false);
                setSupportPartNote('');
              }
            }}
          />
        )}
      >
        <View style={[tx.offline, { marginBottom: 12, borderLeftColor: C.primary }]}>
          <Text style={{ fontWeight: '800', color: C.primary }}>Hoàn tất phần việc hỗ trợ</Text>
          <Text style={{ marginTop: 4, lineHeight: 18, color: C.ink2 }}>
            Xác nhận bạn đã làm xong các hạng mục được phân công. Thợ chính sẽ tiếp tục hoàn thành biên bản và nghiệm thu với khách hàng.
          </Text>
        </View>
        <Field
          label="Ghi chú phần việc (tuỳ chọn)"
          multiline
          value={supportPartNote}
          onChangeText={setSupportPartNote}
          placeholder="VD: Đã lắp đặt xong phần ống đồng và thử kín…"
        />
      </Sheet>
      <Sheet
        visible={showOnsiteApprove}
        onClose={() => { if (!busyOnsiteApprove) setShowOnsiteApprove(false); }}
        title="Khách đồng ý báo giá tại chỗ"
        footer={(
          <Btn
            title={busyOnsiteApprove ? 'Đang gửi…' : 'Xác nhận khách đồng ý'}
            icon="check-circle-2"
            disabled={busyOnsiteApprove}
            onPress={async () => {
              const res = await run(K.onsiteApprove, () => a.approveQuotationOnSite(o.code, {
                photoUris: onsitePhotos,
                note: onsiteNote,
              }));
              if (succeeded(res) || res?.code === 'CUSTOMER_HAS_APP') {
                setShowOnsiteApprove(false);
                setOnsitePhotos([]);
                setOnsiteNote('');
              }
            }}
          />
        )}
      >
        <View style={[tx.offline, { marginBottom: 12, borderLeftColor: C.primary }]}>
          <Text style={{ fontWeight: '800', color: C.primary }}>Dành cho khách đặt qua tổng đài (không có app)</Text>
          <Text style={{ marginTop: 4, lineHeight: 18, color: C.ink2 }}>
            Chụp 1–5 ảnh tờ báo giá có chữ ký xác nhận của khách hàng làm bằng chứng để tiếp tục sửa chữa.
          </Text>
        </View>
        <Text style={[ui.meta, { fontWeight: '700', marginBottom: 6 }]}>Ảnh báo giá có chữ ký (1–5 ảnh, bắt buộc)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {onsitePhotos.map((uri, i) => (
            <View key={`onsite_ph_${i}`} style={tx.thumb}>
              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
              <Tap style={tx.thumbX} disabled={busyOnsiteApprove} onPress={() => setOnsitePhotos((p) => p.filter((_, j) => j !== i))}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text>
              </Tap>
            </View>
          ))}
          {onsitePhotos.length < 5 ? (
            <>
              <Tap style={[tx.thumb, tx.thumbAdd]} disabled={busyOnsiteApprove} onPress={() => addOnsitePhoto('camera')}>
                <AppIcon name="camera" size={20} color={C.primary} strokeWidth={2.1} />
                <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700', marginTop: 2 }}>Chụp ảnh</Text>
              </Tap>
              <Tap style={[tx.thumb, tx.thumbAdd]} disabled={busyOnsiteApprove} onPress={() => addOnsitePhoto('gallery')}>
                <AppIcon name="image" size={20} color={C.primary} strokeWidth={2.1} />
                <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700', marginTop: 2 }}>Tải ảnh lên</Text>
              </Tap>
            </>
          ) : null}
        </View>
        <Field
          label="Ghi chú (tuỳ chọn)"
          multiline
          maxLength={500}
          value={onsiteNote}
          onChangeText={setOnsiteNote}
          placeholder="VD: Khách ký trên báo giá giấy"
        />
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
