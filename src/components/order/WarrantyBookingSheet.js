import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Linking,
  Image,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { C, R, shadow } from '../../theme';
import { TIME_SLOTS, HOTLINE } from '../../constants/data';
import { useApp } from '../../context/AppContext';
import {
  AppIcon,
  Btn,
  Card,
  Field,
  Sheet,
  Tap,
} from '../common';
import { pickImage, pickCamera } from '../../utils/media';
import { formatYmd, getAvailableSlotsForToday } from '../../utils/warrantyPolicy';
import { validateVietnamesePhone } from '../../utils/validators';

/** Ưu tiên SĐT của đơn hàng, sau đó mới tới SĐT tài khoản. */
function resolveContactPhone(order, s) {
  const addr = order?.address && typeof order.address === 'object' ? order.address : null;
  const matchedSaved = Array.isArray(s?.addresses)
    ? s.addresses.find((a) => (
      a?.id && addr?.id && String(a.id) === String(addr.id)
    ) || (
      a?.full && addr?.full && String(a.full).trim() === String(addr.full).trim()
    ))
    : null;

  const candidates = [
    order?.customerPhone,
    addr?.phone,
    addr?.contact_phone,
    order?.contact_phone,
    matchedSaved?.phone,
    s?.user?.phone,
    s?.auth?.phone,
  ];

  const real = candidates.find((p) => {
    if (!p || String(p).includes('*')) return false;
    const digits = String(p).replace(/\D/g, '');
    return digits.length >= 10;
  });

  return real ? String(real).replace(/\D/g, '') : '';
}

function resolveOrderAddress(order) {
  if (!order) return '';
  if (typeof order.address === 'string') return order.address;
  return order.address?.full || order.address?.street || 'Địa chỉ ghi nhận từ đơn hàng gốc';
}

export function WarrantyBookingSheet({
  visible,
  onClose,
  order,
  winfo,
  onSubmit,
}) {
  const { s, ui: u } = useApp();

  const isCutoff = Boolean(winfo?.isCutoff);
  const isFinalDay = Boolean(winfo?.isFinalDay);
  const availableDates = winfo?.availableDates?.length ? winfo.availableDates : [formatYmd(new Date())];

  const [selectedDate, setSelectedDate] = useState(availableDates[0] || formatYmd(new Date()));
  const isSelectedDateToday = selectedDate === formatYmd(new Date());

  // Lọc slot khả dụng theo ngày được chọn
  const validSlots = useMemo(() => {
    if (isSelectedDateToday) {
      return getAvailableSlotsForToday(new Date());
    }
    return TIME_SLOTS;
  }, [isSelectedDateToday]);

  const [selectedSlot, setSelectedSlot] = useState(validSlots[0] || TIME_SLOTS[0]);

  // Danh sách công việc / dịch vụ / linh kiện đã làm của đơn hàng
  const completedItems = useMemo(() => {
    if (!order) return [];
    const list = [];
    if (Array.isArray(order.items)) {
      order.items.forEach((it, idx) => {
        list.push({
          id: String(it.id || it.service_id || `svc-${idx}`),
          name: it.name || it.service_name || 'Dịch vụ đã thực hiện',
          qty: it.qty || 1,
          type: 'service',
        });
      });
    }
    // Vật tư phát sinh trong báo giá (nếu có)
    if (Array.isArray(order.quote?.materials)) {
      order.quote.materials.forEach((m, idx) => {
        list.push({
          id: `mat-${m.id || idx}`,
          name: `Vật tư: ${m.name} (${m.qty || 1} cái)`,
          qty: m.qty || 1,
          type: 'material',
        });
      });
    }
    return list;
  }, [order]);

  // Mặc định chọn tất cả hạng mục đã làm
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set());

  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Mỗi lần mở sheet: điền sẵn SĐT + địa chỉ của đơn hàng
  useEffect(() => {
    if (!visible || !order) return;
    setPhone(resolveContactPhone(order, s));
    setAddress(resolveOrderAddress(order));
    setSelectedItemIds(new Set(completedItems.map((it) => it.id)));
    setDescription('');
    setImages([]);
    const dates = winfo?.availableDates?.length ? winfo.availableDates : [formatYmd(new Date())];
    const nextDate = dates[0] || formatYmd(new Date());
    setSelectedDate(nextDate);
    const today = formatYmd(new Date());
    const slots = nextDate === today ? getAvailableSlotsForToday(new Date()) : TIME_SLOTS;
    setSelectedSlot(slots[0] || TIME_SLOTS[0]);
  }, [visible, order?.code]);

  if (!order) return null;

  const displayAddress = resolveOrderAddress(order);

  const toggleItem = (itemId) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        if (next.size > 1) next.delete(itemId); // giữ ít nhất 1 hạng mục
        else u.toast('Vui lòng chọn ít nhất 1 hạng mục cần bảo hành.', '⚠️');
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleAddImage = async (fromCamera = false) => {
    try {
      const uri = fromCamera ? await pickCamera() : await pickImage();
      if (uri) {
        setImages((prev) => [...prev, uri].slice(0, 3));
      }
    } catch (e) {
      u.toast('Không thể tải ảnh. Vui lòng thử lại.', '⚠️');
    }
  };

  const handleRemoveImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // 1. Kiểm tra SĐT
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const phoneError = validateVietnamesePhone(cleanPhone);
    if (phoneError) {
      u.toast(phoneError, '⚠️');
      return;
    }

    // 2. Kiểm tra hạng mục bảo hành
    if (!selectedItemIds.size) {
      u.toast('Vui lòng chọn hạng mục cần bảo hành.', '⚠️');
      return;
    }

    // 3. Kiểm tra mô tả sự cố
    if (!description.trim()) {
      u.toast('Vui lòng nhập mô tả sự cố của thiết bị.', '⚠️');
      return;
    }

    if (!selectedSlot) {
      u.toast('Vui lòng chọn khung giờ hẹn thợ.', '⚠️');
      return;
    }

    const chosenItems = completedItems.filter((it) => selectedItemIds.has(it.id));
    const itemsSummary = chosenItems.map((it) => it.name).join(', ');
    const fullIssueDesc = `[Hạng mục: ${itemsSummary}]\n${description.trim()}`;

    setSubmitting(true);
    try {
      const result = await onSubmit({
        code: order.code,
        scheduled_date: selectedDate,
        time_slot: selectedSlot,
        issue_description: fullIssueDesc,
        attachment_urls: images,
        contact_phone: cleanPhone,
        contact_address: address.trim() || displayAddress,
      });
      // Chỉ đóng sheet khi gửi thành công (có mã đơn / true). Lỗi đã được alert ở action.
      if (result) onClose();
    } catch (e) {
      u.toast('Chưa thể gửi yêu cầu bảo hành. Vui lòng thử lại.', '⚠️');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDisplayDate = (ymdStr) => {
    const parts = String(ymdStr || '').split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return ymdStr;
  };

  // =========================================================================
  // GIAO DIỆN KHI NGÀY THỨ 60 VÀ ĐÃ QUÁ GIỜ LÀM VIỆC CỦA THỢ (CUT-OFF REACHED)
  // =========================================================================
  if (isCutoff) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Hết giờ tiếp nhận bảo hành">
        <View style={styles.cutoffWrap}>
          <View style={styles.cutoffIconBox}>
            <AppIcon name="alert-triangle" size={36} color="#DC2626" />
          </View>
          <Text style={styles.cutoffTitle}>Đã quá ca làm việc của kỹ thuật viên</Text>
          <Text style={styles.cutoffDesc}>
            Hôm nay là ngày cuối cùng trong thời hạn bảo hành 60 ngày của đơn{' '}
            <Text style={{ fontWeight: '800', color: C.ink }}>{order.code}</Text>.
            Khung giờ làm việc khả dụng của kỹ thuật viên trong ngày đã kết thúc (18h00).
          </Text>

          <View style={styles.cutoffCallCard}>
            <Text style={styles.cutoffCallTitle}>Bạn cần hỗ trợ khẩn cấp?</Text>
            <Text style={styles.cutoffCallSub}>
              Vui lòng liên hệ trực tiếp với bộ phận chăm sóc khách hàng Thợ Minh Đức để được kiểm tra và xử lý ngoại lệ.
            </Text>
            <Btn
              title={`Gọi Hotline ${HOTLINE}`}
              variant="primary"
              style={{ marginTop: 12, backgroundColor: '#DC2626' }}
              onPress={() => Linking.openURL(`tel:${HOTLINE.replace(/\s+/g, '')}`)}
            />
          </View>

          <Btn
            title="Đóng thông báo"
            variant="outline"
            style={{ marginTop: 12, width: '100%' }}
            onPress={onClose}
          />
        </View>
      </Sheet>
    );
  }

  // =========================================================================
  // GIAO DIỆN ĐẶT LỊCH BẢO HÀNH CHUẨN CÔNG NGHIỆP
  // =========================================================================
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Đặt lịch bảo hành tận nhà"
      footer={
        <Btn
          title={submitting ? 'Đang gửi yêu cầu...' : 'Xác nhận gửi bảo hành'}
          variant="primary"
          disabled={submitting || !validSlots.length}
          onPress={handleSubmit}
        />
      }
    >
      <View style={{ paddingBottom: 16 }}>
        {/* BANNER CẢNH BÁO NẾU LÀ NGÀY CUỐI CÙNG (NGÀY THỨ 60) */}
        {isFinalDay ? (
          <View style={styles.finalDayBanner}>
            <AppIcon name="alert-triangle" size={18} color="#991B1B" />
            <View style={{ flex: 1 }}>
              <Text style={styles.finalDayTitle}>HÔM NAY LÀ HẠN CHÓT BẢO HÀNH (NGÀY THỨ 60)</Text>
              <Text style={styles.finalDayDesc}>
                Hệ thống chỉ tiếp nhận lịch hẹn trong ngày hôm nay trước 18h00. Sau 18h00, thời hạn bảo hành miễn phí sẽ chính thức kết thúc.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.normalDayBanner}>
            <AppIcon name="shield-check" size={18} color={C.primary} />
            <Text style={styles.normalDayText}>
              Bảo hành miễn phí 100% · Còn {winfo?.daysLeft || 60} ngày bảo hành
            </Text>
          </View>
        )}

        {/* 1. HẠNG MỤC ĐÃ LÀM TRONG ĐƠN HÀNG CẦN BẢO HÀNH */}
        <Text style={styles.sectionLabel}>1. HẠNG MỤC ĐÃ LÀM CỦA ĐƠN CẦN BẢO HÀNH</Text>
        <View style={styles.itemsWrap}>
          {completedItems.map((it) => {
            const isChecked = selectedItemIds.has(it.id);
            return (
              <Tap
                key={it.id}
                style={[styles.itemCard, isChecked && styles.itemCardActive]}
                onPress={() => toggleItem(it.id)}
              >
                <View style={[styles.checkbox, isChecked && styles.checkboxActive]}>
                  {isChecked ? <AppIcon name="check" size={12} color="#fff" strokeWidth={3} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, isChecked && styles.itemTitleActive]}>
                    {it.name}
                  </Text>
                  <Text style={styles.itemMeta}>Số lượng: x{it.qty}</Text>
                </View>
                <Text style={[styles.itemBadge, isChecked ? styles.itemBadgeActive : styles.itemBadgeInactive]}>
                  {isChecked ? 'Được bảo hành' : 'Không chọn'}
                </Text>
              </Tap>
            );
          })}
        </View>

        {/* 2. CHỌN NGÀY HẸN THỢ */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>2. CHỌN NGÀY HẸN THỢ</Text>
        {isFinalDay ? (
          <View style={styles.lockedDateCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="calendar" size={18} color="#991B1B" />
              <Text style={styles.lockedDateText}>Hôm nay ({formatDisplayDate(selectedDate)})</Text>
            </View>
            <Text style={styles.lockedDateBadge}>Hạn chót</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
            {availableDates.map((dateStr, idx) => {
              const isSelected = selectedDate === dateStr;
              const isToday = idx === 0;
              return (
                <Tap
                  key={dateStr}
                  style={[styles.dateChip, isSelected && styles.dateChipActive]}
                  onPress={() => {
                    setSelectedDate(dateStr);
                    if (idx === 0) {
                      const todayValid = getAvailableSlotsForToday(new Date());
                      if (!todayValid.includes(selectedSlot) && todayValid.length) {
                        setSelectedSlot(todayValid[0]);
                      }
                    }
                  }}
                >
                  <Text style={[styles.dateChipDay, isSelected && styles.dateChipTextActive]}>
                    {isToday ? 'Hôm nay' : `Ngày ${idx + 1}`}
                  </Text>
                  <Text style={[styles.dateChipNum, isSelected && styles.dateChipTextActive]}>
                    {formatDisplayDate(dateStr)}
                  </Text>
                </Tap>
              );
            })}
          </ScrollView>
        )}

        {/* 3. CHỌN KHUNG GIỜ PHỤC VỤ */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>3. CHỌN KHUNG GIỜ PHỤC VỤ</Text>
        {validSlots.length === 0 ? (
          <View style={styles.emptySlotCard}>
            <AppIcon name="clock" size={20} color="#DC2626" />
            <Text style={styles.emptySlotText}>
              Đã hết ca làm việc khả dụng trong ngày hôm nay. Vui lòng chọn ngày tiếp theo.
            </Text>
          </View>
        ) : (
          <View style={styles.slotGrid}>
            {validSlots.map((slot) => {
              const isSelected = selectedSlot === slot;
              return (
                <Tap
                  key={slot}
                  style={[styles.slotItem, isSelected && styles.slotItemActive]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <AppIcon name="clock" size={14} color={isSelected ? '#fff' : C.ink2} />
                  <Text style={[styles.slotItemText, isSelected && styles.slotItemTextActive]}>
                    {slot}
                  </Text>
                </Tap>
              );
            })}
          </View>
        )}

        {/* 4. SỐ ĐIỆN THOẠI LIÊN HỆ */}
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>4. SỐ ĐIỆN THOẠI LIÊN HỆ *</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="phone-pad"
          maxLength={11}
          placeholder="Nhập số điện thoại thật của bạn (ví dụ: 0988123456)..."
          placeholderTextColor="#94A3B8"
          value={phone}
          onChangeText={setPhone}
        />

        {/* 5. ĐỊA CHỈ PHỤC VỤ */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>5. ĐỊA CHỈ PHỤC VỤ TẬN NƠI</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Địa chỉ phục vụ..."
          placeholderTextColor="#94A3B8"
          value={address}
          onChangeText={setAddress}
        />

        {/* 6. MÔ TẢ HIỆN TƯỢNG SỰ CỐ */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>6. MÔ TẢ HIỆN TƯỢNG HƯ HỎNG / SỰ CỐ *</Text>
        <TextInput
          style={[styles.textInput, styles.descInput]}
          multiline
          numberOfLines={3}
          placeholder="Ghi rõ hiện tượng (ví dụ: máy lạnh chảy nước mặt lạnh sau 3 ngày sửa, không mát, cánh vẫy kêu to...)"
          placeholderTextColor="#94A3B8"
          value={description}
          onChangeText={setDescription}
        />

        {/* 7. HÌNH ẢNH BẰNG CHỨNG LỖI */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>7. HÌNH ẢNH MINH CHỨNG (TỐI ĐA 3 ẢNH)</Text>
        <View style={styles.imageGrid}>
          {images.map((imgUri, idx) => (
            <View key={imgUri} style={styles.thumbWrap}>
              <Image source={{ uri: imgUri }} style={styles.thumbImg} />
              <TouchableOpacity
                style={styles.thumbDelete}
                onPress={() => handleRemoveImage(idx)}
              >
                <AppIcon name="x" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {images.length < 3 ? (
            <Tap style={styles.addImgBtn} onPress={() => handleAddImage(false)}>
              <AppIcon name="camera" size={20} color={C.primary} />
              <Text style={styles.addImgText}>Thêm ảnh</Text>
            </Tap>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  cutoffWrap: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cutoffIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cutoffTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#991B1B',
    textAlign: 'center',
    marginBottom: 8,
  },
  cutoffDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: C.ink2,
    textAlign: 'center',
  },
  cutoffCallCard: {
    width: '100%',
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cutoffCallTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#991B1B',
  },
  cutoffCallSub: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#7F1D1D',
    marginTop: 4,
  },
  finalDayBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginBottom: 14,
  },
  finalDayTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#991B1B',
    letterSpacing: 0.2,
  },
  finalDayDesc: {
    fontSize: 12,
    lineHeight: 16,
    color: '#7F1D1D',
    marginTop: 3,
  },
  normalDayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.primarySoft,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  normalDayText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.primary,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: C.ink2,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  itemsWrap: {
    gap: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  itemCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: C.primary,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  itemTitleActive: {
    color: C.primary,
  },
  itemMeta: {
    fontSize: 11.5,
    color: C.muted,
    marginTop: 2,
  },
  itemBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  itemBadgeActive: {
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
  },
  itemBadgeInactive: {
    backgroundColor: '#F1F5F9',
    color: '#94A3B8',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dateChipActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  dateChipDay: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '600',
  },
  dateChipNum: {
    fontSize: 13,
    fontWeight: '800',
    color: C.ink,
    marginTop: 2,
  },
  dateChipTextActive: {
    color: '#fff',
  },
  lockedDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F87171',
  },
  lockedDateText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#991B1B',
  },
  lockedDateBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  slotItemActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  slotItemText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.ink,
  },
  slotItemTextActive: {
    color: '#fff',
  },
  emptySlotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
  },
  emptySlotText: {
    fontSize: 12.5,
    color: '#991B1B',
    flex: 1,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    color: C.ink,
  },
  descInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  imageGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  thumbWrap: {
    width: 68,
    height: 68,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImgBtn: {
    width: 68,
    height: 68,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primarySoft,
  },
  addImgText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: C.primary,
    marginTop: 4,
  },
});

export default WarrantyBookingSheet;
