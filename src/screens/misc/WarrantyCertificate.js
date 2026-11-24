// Phiếu nghiệm thu & bảo hành điện tử (khách xem sau khi đơn hoàn thành).
// Bố cục: thẻ chứng nhận (mã, hiệu lực, thanh ngày còn lại) -> thông tin đơn -> hạng mục đã làm
// -> checklist an toàn -> xác nhận của khách -> lưu ý bảo hành. Chỉ hiển thị, không đổi dữ liệu.
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { C, R, grad } from '../../theme';
import { catLabel, SAFETY_CHECKLIST_ITEMS, HOTLINE } from '../../constants/data';
import { fmtDate, fmtDateTime } from '../../context';
import { AppIcon, Badge, Tap } from '../../components';
import { MATERIAL_WARRANTY_STATUS_META, extractMaterialWarrantiesFromQuotations } from '../../utils/materialWarranty';

function InfoRow({ icon, label, value, last }) {
  if (!value) return null;
  return (
    <View style={[st.infoRow, !last && st.infoDivider]}>
      <View style={st.infoIcon}><AppIcon name={icon} size={15} color={C.primary} strokeWidth={2.2} /></View>
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={st.infoValue}>{value}</Text>
    </View>
  );
}

function Section({ icon, title, right, children, style }) {
  return (
    <View style={[st.section, style]}>
      <View style={st.sectionHead}>
        <AppIcon name={icon} size={16} color={C.primary} strokeWidth={2.3} />
        <Text style={st.sectionTitle}>{title}</Text>
        {right || null}
      </View>
      {children}
    </View>
  );
}

export function WarrantyCertificate({ o, winfo, tierWarrantyDays, onPreviewPhoto }) {
  const certCode = o.report?.warrantyCertificateCode || `BH-${o.code}`;
  const totalDays = winfo.totalDays ?? tierWarrantyDays;
  const isActivePending = Boolean(winfo.pending && winfo.stillValid);
  const isNotStarted = Boolean(winfo.notStarted || winfo.reason === 'WARRANTY_NOT_STARTED');
  const daysLeft = (winfo.ok || isActivePending || isNotStarted) ? (winfo.daysLeft ?? totalDays) : 0;
  const ratio = totalDays ? Math.max(0, Math.min(1, daysLeft / totalDays)) : 0;
  const checklist = o.report?.safetyChecklist?.length ? o.report.safetyChecklist : SAFETY_CHECKLIST_ITEMS;
  const device = o.device
    ? [catLabel(o.device.category), o.device.brand, o.device.room ? `(${o.device.room})` : '', o.device.serial ? `· Số sê-ri: ${o.device.serial}` : ''].filter(Boolean).join(' ')
    : '';
  const techName = o.tech?.name || o.report?.tech || 'Thợ Minh Đức';
  const techCode = o.tech?.code || o.report?.techCode;
  const evidence = Array.isArray(o.evidence) ? o.evidence : [];
  const initialPhotos = [];
  const seenInitial = new Set();
  [...(o.attachments || []), ...evidence.filter((e) => e?.stage === 'diagnosis' && !e?.isWarrantyUpload)].forEach((ph) => {
    if (!ph?.uri || ph?.isWarrantyUpload) return;
    const key = ph.dbAttachmentId != null ? `id:${ph.dbAttachmentId}` : `uri:${ph.uri}`;
    if (seenInitial.has(key)) return;
    seenInitial.add(key);
    initialPhotos.push(ph);
  });
  const strictCompletionPhotos = evidence.filter(
    (e) => e?.stage === 'after' && e?.uri && (!e.procedureStepId || /hoàn thành|bàn giao/i.test(String(e.note || ''))),
  );
  const completionPhotos = strictCompletionPhotos.length
    ? strictCompletionPhotos
    : (o.status === 'done' ? evidence.filter((e) => e?.stage === 'after' && e?.uri) : []);
  const matWarranties = (o.materialWarranties && o.materialWarranties.length)
    ? o.materialWarranties
    : extractMaterialWarrantiesFromQuotations(o.quotations || []);
  const isMaterialOnly = Boolean((winfo.noWarranty || totalDays <= 0) && matWarranties.length > 0);
  const activeMatWarranties = matWarranties.filter((mw) =>
    ['VALID', 'EXPIRING_SOON', 'PENDING'].includes(String(mw.status || '').toUpperCase()) && (Number(mw.warrantyDays) || 0) > 0,
  );
  const hasActiveMatWarranty = activeMatWarranties.length > 0;
  const leadMatWarranty = hasActiveMatWarranty
    ? activeMatWarranties.reduce((best, mw) => {
        const bestRem = best.remainingDays != null ? Number(best.remainingDays) : (Number(best.warrantyDays) || 0);
        const curRem = mw.remainingDays != null ? Number(mw.remainingDays) : (Number(mw.warrantyDays) || 0);
        if (curRem !== bestRem) return curRem > bestRem ? mw : best;
        return (Number(mw.warrantyDays) || 0) > (Number(best.warrantyDays) || 0) ? mw : best;
      })
    : (matWarranties.length
        ? matWarranties.reduce((best, mw) => ((Number(mw.warrantyDays) || 0) > (Number(best.warrantyDays) || 0) ? mw : best))
        : null);
  const maxMatDays = leadMatWarranty ? (Number(leadMatWarranty.warrantyDays) || 0) : 0;
  const maxMatRemaining = hasActiveMatWarranty && leadMatWarranty
    ? (leadMatWarranty.remainingDays != null ? Number(leadMatWarranty.remainingDays) : maxMatDays)
    : 0;
  const displayTotalDays = isMaterialOnly ? maxMatDays : totalDays;
  const displayDaysLeft = isMaterialOnly ? (hasActiveMatWarranty ? maxMatRemaining : 0) : daysLeft;
  const displayRatio = displayTotalDays ? Math.max(0, Math.min(1, displayDaysLeft / displayTotalDays)) : 0;
  const isHeroPositive = isMaterialOnly ? hasActiveMatWarranty : (winfo.ok || isActivePending || isNotStarted);
  const heroToneColor = isMaterialOnly
    ? (hasActiveMatWarranty ? '#34D399' : '#FCD34D')
    : (winfo.ok ? '#34D399' : (isActivePending || isNotStarted) ? '#93C5FD' : '#FCD34D');
  const untilStr = winfo.until ? fmtDate(winfo.until) : '';
  const notStartedSubtitle = `${winfo.text}${untilStr && !String(winfo.text || '').includes(untilStr) ? ` (hiệu lực đến ${untilStr})` : ''}`;

  return (
    <View>
      {/* ===== Thẻ chứng nhận ===== */}
      <View style={[st.hero, grad.navyCard]}>
        <View style={st.heroTop}>
          <View style={st.heroBrand}>
            <View style={st.heroShield}><AppIcon name="shield-check" size={18} color="#fff" strokeWidth={2.3} /></View>
            <View>
              <Text style={st.heroBrandName}>THỢ MINH ĐỨC</Text>
              <Text style={st.heroBrandSub}>Chứng nhận bảo hành điện tử</Text>
            </View>
          </View>
          <View style={[st.statusPill, { backgroundColor: isHeroPositive ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.16)' }]}>
            <View style={[st.statusDot, { backgroundColor: heroToneColor }]} />
            <Text style={st.statusText}>
              {isMaterialOnly
                ? (hasActiveMatWarranty ? 'BH linh kiện' : (maxMatDays > 0 ? 'Hết hiệu lực' : 'Không bảo hành'))
                : (isNotStarted ? 'Chờ kích hoạt' : (isActivePending ? 'Đang bảo hành' : (winfo.ok ? 'Còn hiệu lực' : 'Hết hiệu lực')))}
            </Text>
          </View>
        </View>

        <View style={st.heroBody}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={st.heroLabel}>Mã chứng nhận</Text>
            <Text style={st.heroCode} numberOfLines={2}>{certCode}</Text>

            <Text style={[st.heroLabel, { marginTop: 12 }]}>{isMaterialOnly ? 'Bảo hành linh kiện kèm theo' : 'Thời hạn bảo hành'}</Text>
            {isMaterialOnly && maxMatDays <= 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                <Text style={st.heroDays}>{matWarranties.length}</Text>
                <Text style={st.heroDaysOf}>linh kiện</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                <Text style={st.heroDays}>{displayDaysLeft}</Text>
                <Text style={st.heroDaysOf}>/ {displayTotalDays} ngày</Text>
              </View>
            )}
            <View style={st.bar}><View style={[st.barFill, { width: `${displayRatio * 100}%`, backgroundColor: heroToneColor }]} /></View>
            <Text style={st.heroUntil}>
              {isMaterialOnly
                ? (hasActiveMatWarranty
                    ? 'Dịch vụ không áp dụng bảo hành riêng · Xem chi tiết bảo hành linh kiện bên dưới.'
                    : 'Dịch vụ không áp dụng bảo hành · Các linh kiện kèm theo không có hoặc đã hết hạn bảo hành.')
                : winfo.ok
                  ? `Hiệu lực đến ${fmtDate(winfo.until)}`
                  : isNotStarted
                    ? notStartedSubtitle
                    : (isActivePending && winfo.until ? `${winfo.text} (Còn hiệu lực đến ${fmtDate(winfo.until)})` : winfo.text)}
            </Text>
          </View>
          <View style={st.qrWrap}>
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <AppIcon name="shield-check" size={22} color={C.primary} strokeWidth={2.2} />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '900', color: C.navy, marginTop: 6 }} numberOfLines={1}>{o.code}</Text>
            <Text style={st.qrCaption}>Mã bảo hành{'\n'}điện tử</Text>
          </View>
        </View>
      </View>

      {/* ===== Thông tin ===== */}
      <Section icon="receipt-text" title="Thông tin đơn hàng">
        <InfoRow icon="receipt-text" label="Mã đơn" value={o.code} />
        <InfoRow icon="clock" label="Hoàn thành" value={fmtDateTime(o.doneAt || o.createdAt)} />
        <InfoRow icon="user" label="Khách hàng" value={[o.address?.name, o.address?.phone].filter(Boolean).join(' · ')} />
        <InfoRow icon="map-pin" label="Địa chỉ" value={o.address?.full} />
        {device ? <InfoRow icon="wrench" label="Thiết bị" value={device} /> : null}
        <InfoRow icon="shield-check" label="Kỹ thuật viên" value={techCode ? `${techName} (${techCode})` : techName} last />
      </Section>

      {/* ===== Hạng mục đã làm ===== */}
      <Section icon="wrench" title="Hạng mục đã thực hiện">
        {(o.items || []).map((it, i) => (
          <View key={`${it.id}-${i}`} style={st.itemRow}>
            <View style={st.itemDot} />
            <Text style={st.itemName}>{it.name}</Text>
            <Text style={st.itemQty}>x{it.qty || 1}</Text>
          </View>
        ))}
        {(o.quote?.lines || [])
          .filter((l) => (o.quote?.approved || l.isPriorApproved) && !l.isOriginal && !l.isEstimatedRange)
          .map((l, i) => (
            <View key={`q-${l.name}-${i}`} style={st.itemRow}>
              <View style={[st.itemDot, { backgroundColor: C.orange }]} />
              <Text style={st.itemName}>[Linh kiện / Phát sinh] {l.name}</Text>
              <Text style={st.itemQty}>x{l.qty || 1}</Text>
            </View>
          ))}
        {o.report?.summary ? (
          <View style={st.summary}>
            <Text style={st.summaryText}>{o.report.summary}</Text>
          </View>
        ) : null}
      </Section>

      {/* ===== Bảo hành linh kiện kèm theo ===== */}
      {matWarranties.length > 0 ? (
        <Section icon="shield-check" title={`Bảo hành linh kiện (${matWarranties.length})`}>
          {matWarranties.map((mw, i) => {
            const meta = MATERIAL_WARRANTY_STATUS_META[mw.status] || { label: mw.status || 'Theo dõi', tone: 'primary' };
            const badgeColors =
              meta.tone === 'green'
                ? { fg: C.greenInk, bg: C.greenSoft }
                : meta.tone === 'gold'
                  ? { fg: C.goldInk, bg: C.goldSoft }
                  : meta.tone === 'red'
                    ? { fg: C.redInk, bg: C.redSoft }
                    : meta.tone === 'neutral'
                      ? { fg: C.ink2, bg: C.surface }
                      : meta.tone === 'muted'
                        ? { fg: C.muted, bg: C.surface }
                        : { fg: C.primary, bg: C.primarySoft };
            const receiptUri =
              mw.receiptUrl
              || (mw.receiptAttachmentId ? evidence.find((e) => String(e.dbAttachmentId) === String(mw.receiptAttachmentId))?.uri : null)
              || null;
            return (
              <View
                key={mw.id || `cert_mw_${i}`}
                style={{
                  paddingTop: i > 0 ? 8 : 0,
                  marginTop: i > 0 ? 8 : 0,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: C.surface,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={st.itemName}>
                    {mw.itemName}{mw.quantity > 1 ? ` x${mw.quantity}` : ''}
                  </Text>
                  <Badge text={meta.label} fg={badgeColors.fg} bg={badgeColors.bg} />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {mw.isExternalPurchase ? <Badge text="Bảo hành hãng / bên thứ 3" fg={C.goldInk} bg={C.goldSoft} /> : null}
                  {mw.warrantyDays > 0 ? <Badge text={`${mw.warrantyDays} ngày`} fg={C.ink2} bg={C.surface} /> : null}
                </View>
                {mw.serialNumber ? <Text style={{ fontSize: 12, color: C.ink2, marginTop: 4 }}>Số sê-ri: {mw.serialNumber}</Text> : null}
                {mw.externalWarrantyCode ? (
                  <Text style={{ fontSize: 12, color: C.goldInk, fontWeight: '700', marginTop: 2 }}>
                    Mã BH hãng: {mw.externalWarrantyCode}
                  </Text>
                ) : null}
                {mw.startsAt || mw.expiresAt ? (
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    Hiệu lực: {mw.startsAt ? fmtDate(mw.startsAt) : 'Khi hoàn tất'} → {mw.expiresAt ? fmtDate(mw.expiresAt) : '—'}
                    {mw.remainingDays != null && mw.remainingDays > 0 && ['VALID', 'EXPIRING_SOON'].includes(mw.status) ? ` (còn ${mw.remainingDays} ngày)` : ''}
                  </Text>
                ) : null}
                {mw.replacesId ? (
                  <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Thay thế linh kiện #{mw.replacesId}</Text>
                ) : null}
                {mw.statusReason ? (
                  <Text style={{ fontSize: 11.5, color: C.redInk, marginTop: 2 }}>Lý do: {mw.statusReason}</Text>
                ) : null}
                {receiptUri && onPreviewPhoto ? (
                  <Tap
                    onPress={() => onPreviewPhoto({ uri: receiptUri, title: `Hoá đơn linh kiện · ${mw.itemName}` })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' }}
                  >
                    <AppIcon name="receipt-text" size={13} color={C.primary} strokeWidth={2.2} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.primary }}>Xem hoá đơn</Text>
                  </Tap>
                ) : null}
              </View>
            );
          })}
        </Section>
      ) : null}

      {/* ===== An toàn kỹ thuật ===== */}
      <Section
        icon="check-circle-2"
        title="Nghiệm thu an toàn kỹ thuật"
        right={<Text style={st.checkCount}>{checklist.length}/{checklist.length}</Text>}
      >
        {checklist.map((chk, idx) => (
          <View key={idx} style={st.checkRow}>
            <View style={st.checkIcon}><AppIcon name="check" size={11} color="#fff" strokeWidth={3.2} /></View>
            <Text style={st.checkText}>{chk}</Text>
          </View>
        ))}
      </Section>

      {/* ===== Xác nhận của khách ===== */}
      {o.report?.customerSignature ? (
        <View style={st.sign}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name="pen-tool" size={16} color={C.greenInk} strokeWidth={2.3} />
            <Text style={st.signTitle}>Khách hàng xác nhận bàn giao</Text>
          </View>
          <Text style={st.signName}>{typeof o.report.customerSignature === 'string' ? o.report.customerSignature : o.report.customerSignature?.name}</Text>
          <Text style={st.signNote}>✓ Thiết bị hoạt động bình thường, bàn giao an toàn</Text>
        </View>
      ) : null}

      {/* ===== Hình ảnh đối chứng Trước & Sau ===== */}
      {initialPhotos.length > 0 || completionPhotos.length > 0 ? (
        <Section icon="camera" title="Hình ảnh đối chứng (Trước & Sau)">
          {initialPhotos.length > 0 ? (
            <View style={{ marginBottom: completionPhotos.length > 0 ? 10 : 0 }}>
              <Text style={st.photoGroupLabel}>Trước khi sửa (Triệu chứng ban đầu)</Text>
              <View style={st.photoGrid}>
                {initialPhotos.map((ph, idx) => (
                  <Tap
                    key={ph.id || `cert_init_${idx}`}
                    style={st.photoThumb}
                    disabled={!onPreviewPhoto}
                    onPress={() => onPreviewPhoto?.({ uri: ph.uri, title: 'Ảnh trước khi sửa' })}
                  >
                    <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                  </Tap>
                ))}
              </View>
            </View>
          ) : null}
          {completionPhotos.length > 0 ? (
            <View>
              <Text style={[st.photoGroupLabel, { color: C.green }]}>Sau khi hoàn thành bàn giao</Text>
              <View style={st.photoGrid}>
                {completionPhotos.map((ph, idx) => (
                  <Tap
                    key={ph.id || `cert_after_${idx}`}
                    style={[st.photoThumb, { borderColor: C.greenBorder }]}
                    disabled={!onPreviewPhoto}
                    onPress={() => onPreviewPhoto?.({ uri: ph.uri, title: 'Ảnh sau khi hoàn thành bàn giao' })}
                  >
                    <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                  </Tap>
                ))}
              </View>
            </View>
          ) : null}
        </Section>
      ) : null}

      {/* ===== Lưu ý ===== */}
      <View style={st.note}>
        <AppIcon name="info" size={15} color={C.muted} strokeWidth={2.2} />
        <Text style={st.noteText}>
          Bảo hành miễn phí cho lỗi phát sinh từ hạng mục đã làm. Không áp dụng khi thiết bị bị rơi vỡ, chập điện ngoài hoặc do tác động bên ngoài. Tổng đài {HOTLINE}.
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: C.navy, borderRadius: R.lg, padding: 16, marginBottom: 12, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  heroShield: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  heroBrandName: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.8 },
  heroBrandSub: { color: 'rgba(255,255,255,0.72)', fontSize: 11.5, marginTop: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: '#fff', fontWeight: '800', fontSize: 11.5 },
  heroBody: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  heroLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroCode: { color: '#fff', fontWeight: '900', fontSize: 15.5, marginTop: 3, letterSpacing: 0.3 },
  heroDays: { color: '#fff', fontWeight: '900', fontSize: 30, lineHeight: 34 },
  heroDaysOf: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  heroUntil: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 6, fontWeight: '600' },
  qrWrap: { backgroundColor: '#fff', borderRadius: 14, padding: 8, alignItems: 'center' },
  qrCaption: { fontSize: 9.5, color: C.muted, textAlign: 'center', marginTop: 4, fontWeight: '600', lineHeight: 12 },

  section: { backgroundColor: '#fff', borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { flex: 1, fontSize: 14.5, fontWeight: '800', color: C.ink },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, gap: 10 },
  infoDivider: { borderBottomWidth: 1, borderBottomColor: C.surface },
  infoIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { width: 92, fontSize: 12.5, color: C.muted, paddingTop: 4 },
  infoValue: { flex: 1, fontSize: 13.5, color: C.ink, fontWeight: '700', paddingTop: 3, lineHeight: 19 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  itemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
  itemName: { flex: 1, fontSize: 13.5, color: C.ink, fontWeight: '700' },
  itemQty: { fontSize: 13, color: C.muted, fontWeight: '700' },
  summary: { marginTop: 8, padding: 10, borderRadius: R.sm, backgroundColor: C.bg },
  summaryText: { fontSize: 13, color: C.ink2, lineHeight: 19 },

  checkCount: { fontSize: 12, fontWeight: '800', color: C.greenInk, backgroundColor: C.greenSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 5 },
  checkIcon: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkText: { flex: 1, fontSize: 13, color: C.ink2, lineHeight: 19 },

  sign: { padding: 14, borderRadius: R.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderLeftWidth: 3.5, borderLeftColor: C.green, marginBottom: 10 },
  signTitle: { fontWeight: '800', color: C.greenInk, fontSize: 13.5 },
  signName: { fontStyle: 'italic', fontSize: 20, fontWeight: '900', color: C.navy, marginTop: 6 },
  signNote: { fontSize: 11.5, color: C.ink2, marginTop: 4 },

  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: R.md, backgroundColor: C.bg, marginBottom: 4 },
  noteText: { flex: 1, fontSize: 12, color: C.muted, lineHeight: 17 },
  photoGroupLabel: { fontSize: 12, fontWeight: '700', color: C.ink2, marginBottom: 6 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { width: 72, height: 72, borderRadius: R.sm, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
});
