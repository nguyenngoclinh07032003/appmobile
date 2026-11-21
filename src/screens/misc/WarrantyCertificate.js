// Phiếu nghiệm thu & bảo hành điện tử (khách xem sau khi đơn hoàn thành).
// Bố cục: thẻ chứng nhận (mã, hiệu lực, thanh ngày còn lại, QR) -> thông tin đơn -> hạng mục đã làm
// -> checklist an toàn -> xác nhận của khách -> lưu ý bảo hành. Chỉ hiển thị, không đổi dữ liệu.
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { C, R, grad } from '../../theme';
import { catLabel, SAFETY_CHECKLIST_ITEMS, HOTLINE } from '../../constants/data';
import { fmtDate, fmtDateTime } from '../../context';
import { PseudoQR, AppIcon } from '../../components';

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

export function WarrantyCertificate({ o, winfo, tierWarrantyDays }) {
  const certCode = o.report?.warrantyCertificateCode || `BH-${o.code}`;
  const totalDays = winfo.totalDays || tierWarrantyDays;
  const daysLeft = winfo.ok ? winfo.daysLeft : 0;
  const ratio = totalDays ? Math.max(0, Math.min(1, daysLeft / totalDays)) : 0;
  const checklist = o.report?.safetyChecklist?.length ? o.report.safetyChecklist : SAFETY_CHECKLIST_ITEMS;
  const device = o.device
    ? [catLabel(o.device.category), o.device.brand, o.device.room ? `(${o.device.room})` : '', o.device.serial ? `· SN: ${o.device.serial}` : ''].filter(Boolean).join(' ')
    : '';
  const techName = o.tech?.name || o.report?.tech || 'Thợ Minh Đức';
  const techCode = o.tech?.code || o.report?.techCode;
  const evidence = Array.isArray(o.evidence) ? o.evidence : [];
  const initialPhotos = [];
  const seenInitial = new Set();
  [...(o.attachments || []), ...evidence.filter((e) => e?.stage === 'diagnosis')].forEach((ph) => {
    if (!ph?.uri) return;
    const key = ph.dbAttachmentId != null ? `id:${ph.dbAttachmentId}` : `uri:${ph.uri}`;
    if (seenInitial.has(key)) return;
    seenInitial.add(key);
    initialPhotos.push(ph);
  });
  const completionPhotos = evidence.filter((e) => e?.stage === 'after' && e?.uri);

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
          <View style={[st.statusPill, { backgroundColor: winfo.ok ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.16)' }]}>
            <View style={[st.statusDot, { backgroundColor: winfo.ok ? '#34D399' : '#FCD34D' }]} />
            <Text style={st.statusText}>{winfo.ok ? 'Còn hiệu lực' : 'Hết hiệu lực'}</Text>
          </View>
        </View>

        <View style={st.heroBody}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={st.heroLabel}>Mã chứng nhận</Text>
            <Text style={st.heroCode} numberOfLines={2}>{certCode}</Text>

            <Text style={[st.heroLabel, { marginTop: 12 }]}>Thời hạn bảo hành</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
              <Text style={st.heroDays}>{daysLeft}</Text>
              <Text style={st.heroDaysOf}>/ {totalDays} ngày</Text>
            </View>
            <View style={st.bar}><View style={[st.barFill, { width: `${ratio * 100}%`, backgroundColor: winfo.ok ? '#34D399' : '#FCD34D' }]} /></View>
            <Text style={st.heroUntil}>{winfo.ok ? `Hiệu lực đến ${fmtDate(winfo.until)}` : winfo.text}</Text>
          </View>
          <View style={st.qrWrap}>
            <PseudoQR value={`MINHDUC-WARRANTY|${o.code}|${o.address?.phone || ''}|${totalDays}D`} size={96} />
            <Text style={st.qrCaption}>Đưa mã cho thợ{'\n'}khi bảo hành</Text>
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
          .filter((l) => !l.isOriginal && !l.isEstimatedRange)
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
                  <View key={ph.id || `cert_init_${idx}`} style={st.photoThumb}>
                    <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {completionPhotos.length > 0 ? (
            <View>
              <Text style={[st.photoGroupLabel, { color: C.green }]}>Sau khi hoàn thành bàn giao</Text>
              <View style={st.photoGrid}>
                {completionPhotos.map((ph, idx) => (
                  <View key={ph.id || `cert_after_${idx}`} style={[st.photoThumb, { borderColor: C.greenBorder }]}>
                    <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} />
                  </View>
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
          Bảo hành miễn phí cho lỗi phát sinh từ hạng mục đã làm. Không áp dụng khi thiết bị bị rơi vỡ, chập điện ngoài hoặc do tác động bên ngoài. Hotline {HOTLINE}.
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
