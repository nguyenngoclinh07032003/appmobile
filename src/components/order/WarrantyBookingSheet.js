import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Image,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { C } from '../../theme';
import { HOTLINE, getService } from '../../constants/data';
import { BASE_WARRANTY_DAYS } from '../../constants/appPolicy';
import { useApp } from '../../context/AppContext';
import {
  AppIcon,
  Btn,
  HScroll,
  Sheet,
  Tap,
} from '../common';
import { pickImage, pickCamera } from '../../utils/media';
import { formatYmd, getSlotsForDate } from '../../utils/warrantyPolicy';
import { normalizeVnPhone, validateVietnamesePhone } from '../../utils/validators';
import { WEEKDAYS } from '../../utils/dateTime';

const webNoOutline = Platform.select({ web: { outlineStyle: 'none' }, default: {} });

/**
 * Lấy số điện thoại của đơn hàng:
 * Ưu tiên số điện thoại của chính đơn hàng đó, nếu bị che sao (*) thì thử tìm số thật từ tài khoản.
 * Nếu không có số thật, vẫn lấy chính SĐT của đơn hàng để điền vào ô cho khách hàng thấy.
 */
function resolveContactPhone(order, s) {
  const addr = order?.address && typeof order.address === 'object' ? order.address : null;

  const orderPhones = [
    order?.customerPhone,
    addr?.phone,
    addr?.contact_phone,
    order?.contact_phone,
    order?.phone,
  ].filter(Boolean);

  // 1. Tìm trong đơn hàng nếu có số thật không bị che sao (*)
  const realOrderPhone = orderPhones.find(
    (p) => !String(p).includes('*') && normalizeVnPhone(p).length >= 10
  );
  if (realOrderPhone) return normalizeVnPhone(realOrderPhone);

  // 2. Tìm trong danh sách địa chỉ đã lưu của khách hàng
  const matchedSaved = Array.isArray(s?.addresses)
    ? s.addresses.find((a) => (
      (a?.id && addr?.id && String(a.id) === String(addr.id)) ||
      (a?.full && addr?.full && String(a.full).trim() === String(addr.full).trim())
    ))
    : null;
  if (matchedSaved?.phone && !String(matchedSaved.phone).includes('*')) {
    return normalizeVnPhone(matchedSaved.phone);
  }

  // 3. Tìm trong tài khoản đang đăng nhập (s.user, s.auth)
  const accountPhones = [s?.user?.phone, s?.auth?.phone].filter(Boolean);
  const realAccountPhone = accountPhones.find(
    (p) => !String(p).includes('*') && normalizeVnPhone(p).length >= 10
  );
  if (realAccountPhone) return normalizeVnPhone(realAccountPhone);

  // 4. Nếu tất cả đều bị mask (hoặc chưa có số thật), điền luôn SĐT của đơn hàng đó
  const anyPhone = orderPhones[0] || accountPhones[0] || '';
  return String(anyPhone).trim();
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
  const isIneligible = Boolean(winfo && !winfo.ok && !isCutoff);
  const availableDates = winfo?.availableDates?.length ? winfo.availableDates : [formatYmd(new Date())];

  const [selectedDate, setSelectedDate] = useState(availableDates[0] || formatYmd(new Date()));
  const endYmd = winfo?.endYmd || null;

  // Ca khả dụng theo ngày được chọn: dùng danh sách server trả cho hôm nay (nếu có), còn lại bỏ ca đã qua và ca từ 18h00 ở ngày cuối bảo hành.
  const todayYmd = formatYmd(new Date());
  const validSlots = useMemo(() => {
    if (selectedDate === todayYmd && Array.isArray(winfo?.serverAvailableSlotsToday)) {
      return winfo.serverAvailableSlotsToday;
    }
    return getSlotsForDate(selectedDate, { now: new Date(), endYmd });
  }, [selectedDate, todayYmd, winfo?.serverAvailableSlotsToday, endYmd]);

  const [selectedSlot, setSelectedSlot] = useState(validSlots[0] || null);

  // =========================================================================
  // DANH SÁCH CÔNG VIỆC / DỊCH VỤ / VẬT TƯ ĐƠN HÀNG ĐÃ LÀM
  // =========================================================================
  const completedItems = useMemo(() => {
    if (!order) return [];
    const list = [];

    // 1. Dịch vụ gốc trong đơn (order.items)
    if (Array.isArray(order.items) && order.items.length) {
      order.items.forEach((it, idx) => {
        list.push({
          id: String(it.id || it.service_id || `svc-${idx}`),
          name: it.name || it.service_name || getService(it.id)?.name || 'Dịch vụ đã thực hiện',
          qty: it.qty || 1,
          type: 'service',
        });
      });
    }

    // 2 + 3. Vật tư / linh kiện thay thế (order.materials, order.quote.materials).
    // Cùng một vật tư có thể xuất hiện ở cả hai nguồn → lọc trùng theo tên.
    const seenMaterial = new Set();
    const pushMaterial = (m, id) => {
      const nameKey = String(m?.name || '').trim().toLowerCase();
      if (!nameKey || seenMaterial.has(nameKey)) return;
      seenMaterial.add(nameKey);
      const qty = Number(m.qty) || 1;
      list.push({
        id,
        name: `Vật tư: ${m.name} (${qty} ${m.unit || 'cái'})`,
        qty,
        type: 'material',
      });
    };
    (Array.isArray(order.materials) ? order.materials : []).forEach((m, idx) => pushMaterial(m, `mat-${m?.id || idx}`));

    // Fallback nếu không có mục nào
    if (!list.length) {
      list.push({
        id: `default-${order.code}`,
        name: order.serviceName || order.title || `Toàn bộ dịch vụ đơn ${order.code}`,
        qty: 1,
        type: 'service',
      });
    }

    return list;
  }, [order]);

  // Mặc định chọn tất cả các hạng mục của đơn hàng
  const [selectedItemIds, setSelectedItemIds] = useState(() => (
    new Set(completedItems.map((it) => it.id))
  ));

  const [phone, setPhone] = useState('');
  const [initialPrefilledPhone, setInitialPrefilledPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const seenItemIdsRef = React.useRef(new Set());

  // Chỉ reset form khi mở sheet hoặc chuyển sang đơn khác (tránh mất dữ liệu đang nhập khi hydrate xong giữa chừng).
  useEffect(() => {
    if (!visible || !order) return;
    const initialPhone = resolveContactPhone(order, s);
    setPhone(initialPhone);
    setInitialPrefilledPhone(initialPhone && !initialPhone.includes('*') ? initialPhone : '');
    setAddress(resolveOrderAddress(order));
    const initialIds = completedItems.map((it) => it.id);
    seenItemIdsRef.current = new Set(initialIds);
    setSelectedItemIds(new Set(initialIds));
    setDescription('');
    setImages([]);

    const dates = winfo?.availableDates?.length ? winfo.availableDates : [formatYmd(new Date())];
    const nextDate = dates[0] || formatYmd(new Date());
    setSelectedDate(nextDate);
    const tYmd = formatYmd(new Date());
    const slots =
      nextDate === tYmd && Array.isArray(winfo?.serverAvailableSlotsToday)
        ? winfo.serverAvailableSlotsToday
        : getSlotsForDate(nextDate, { now: new Date(), endYmd: winfo?.endYmd || null });
    setSelectedSlot(slots[0] || null);
  }, [visible, order?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nếu server eligibility cập nhật lại ngày / ca khả dụng sau khi mở sheet: tự đồng bộ lựa chọn hợp lệ.
  useEffect(() => {
    if (!visible || !order) return;
    const dates = winfo?.availableDates?.length ? winfo.availableDates : [formatYmd(new Date())];
    const targetDate = dates.includes(selectedDate) ? selectedDate : (dates[0] || formatYmd(new Date()));
    if (targetDate !== selectedDate) setSelectedDate(targetDate);
    const slots =
      targetDate === todayYmd && Array.isArray(winfo?.serverAvailableSlotsToday)
        ? winfo.serverAvailableSlotsToday
        : getSlotsForDate(targetDate, { now: new Date(), endYmd });
    if (!slots.includes(selectedSlot)) {
      setSelectedSlot(slots[0] || null);
    }
  }, [
    visible,
    order?.code,
    winfo?.availableDates,
    winfo?.serverAvailableSlotsToday,
    endYmd,
    todayYmd,
    selectedDate,
    selectedSlot,
  ]);

  // Nếu đơn được hydrate thêm hạng mục sau khi sheet đã mở: tự tick thêm hạng mục mới, giữ nguyên nội dung khách đang nhập.
  useEffect(() => {
    if (!visible || !order) return;
    const newIds = completedItems.map((it) => it.id).filter((id) => !seenItemIdsRef.current.has(id));
    if (!newIds.length) return;
    newIds.forEach((id) => seenItemIdsRef.current.add(id));
    setSelectedItemIds((prev) => new Set([...prev, ...newIds]));
  }, [visible, order?.code, completedItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order) return null;

  const displayAddress = resolveOrderAddress(order);
  const totalDays = winfo?.totalDays ?? BASE_WARRANTY_DAYS;
  const daysLeft = winfo?.daysLeft ?? totalDays;
  const hotline = winfo?.supportHotline || HOTLINE;

  const isPrefilledPhoneShown = Boolean(
    phone &&
    !String(phone).includes('*') &&
    initialPrefilledPhone &&
    normalizeVnPhone(phone) === normalizeVnPhone(initialPrefilledPhone),
  );
  const toggleItem = (itemId) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        if (next.size > 1) {
          next.delete(itemId);
        } else {
          u.toast('Vui lòng chọn ít nhất 1 hạng mục cần bảo hành.', '⚠️');
        }
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleAddImage = async (fromCamera = false) => {
    try {
      const uri = fromCamera ? await pickCamera() : await pickImage();
      if (uri === null) {
        u.alert(
          fromCamera ? 'Cần quyền truy cập máy ảnh' : 'Cần quyền truy cập ảnh',
          'Vui lòng cấp quyền truy cập trong Cài đặt thiết bị để đính kèm ảnh.',
          '📷',
        );
        return;
      }
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
    const rawPhone = String(phone || '').trim();
    if (!rawPhone) {
      u.toast('Vui lòng nhập số điện thoại liên hệ.', '⚠️');
      return;
    }

    if (rawPhone.includes('*')) {
      u.toast('Số điện thoại đang bị che sao (*). Vui lòng điền số điện thoại thật để thợ liên hệ nhé!', '⚠️');
      return;
    }

    const cleanPhone = normalizeVnPhone(rawPhone);
    const phoneError = validateVietnamesePhone(cleanPhone);
    if (phoneError) {
      u.toast(phoneError, '⚠️');
      return;
    }

    // 2. Kiểm tra hạng mục bảo hành
    if (!selectedItemIds.size) {
      u.toast('Vui lòng chọn ít nhất 1 hạng mục cần bảo hành.', '⚠️');
      return;
    }

    // 3. Kiểm tra mô tả sự cố
    if (!description.trim()) {
      u.toast('Vui lòng nhập mô tả sự cố của thiết bị.', '⚠️');
      return;
    }

    if (!availableDates.includes(selectedDate)) {
      u.toast('Ngày hẹn bảo hành không còn khả dụng. Vui lòng chọn lại.', '⚠️');
      return;
    }
    if (!selectedSlot || !validSlots.includes(selectedSlot)) {
      u.toast('Vui lòng chọn khung giờ hẹn thợ khả dụng.', '⚠️');
      return;
    }

    const chosenItems = completedItems.filter((it) => selectedItemIds.has(it.id));
    const itemsSummary = chosenItems.map((it) => it.name).join(', ');
    const fullIssueDesc = `[Hạng mục bảo hành: ${itemsSummary}]\n${description.trim()}`;

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
      // Chỉ đóng sheet khi gửi thành công
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

  const formatWarrantyDateLabel = (ymdStr) => {
    const todayStr = formatYmd(new Date());
    if (ymdStr === todayStr) return 'Hôm nay';
    const parts = String(ymdStr || '').split('-').map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      const tomorrowStr = formatYmd(new Date(Date.now() + 86400000));
      if (ymdStr === tomorrowStr) return 'Ngày mai';
      const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      return WEEKDAYS[d.getUTCDay()] || ymdStr;
    }
    return ymdStr;
  };
  if (isCutoff) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Hết giờ tiếp nhận bảo hành">
        <View style={styles.cutoffWrap}>
          <View style={styles.cutoffIconBox}>
            <AppIcon name="alert-triangle" size={36} color={C.red} />
          </View>
          <Text style={styles.cutoffTitle}>Đã quá ca làm việc của kỹ thuật viên</Text>
          <Text style={styles.cutoffDesc}>
            Hôm nay là ngày cuối cùng trong thời hạn bảo hành {totalDays} ngày của đơn{' '}
            <Text style={{ fontWeight: '800', color: C.ink }}>{order.code}</Text>.
            Khung giờ làm việc khả dụng của kỹ thuật viên trong ngày đã kết thúc (18h00).
          </Text>

          <View style={styles.cutoffCallCard}>
            <Text style={styles.cutoffCallTitle}>Bạn cần hỗ trợ khẩn cấp?</Text>
            <Text style={styles.cutoffCallSub}>
              Vui lòng liên hệ trực tiếp với bộ phận chăm sóc khách hàng Thợ Minh Đức để được kiểm tra và xử lý ngoại lệ.
            </Text>
            <Btn
              title={`Gọi tổng đài ${hotline}`}
              variant="danger"
              style={{ marginTop: 12 }}
              onPress={() => Linking.openURL(`tel:${hotline.replace(/\s+/g, '')}`).catch(() => {})}
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

  if (isIneligible) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Chưa thể gửi yêu cầu bảo hành">
        <View style={styles.cutoffWrap}>
          <View style={styles.cutoffIconBox}>
            <AppIcon name="shield-alert" size={36} color={C.red} />
          </View>
          <Text style={styles.cutoffTitle}>Đơn chưa đủ điều kiện bảo hành</Text>
          <Text style={styles.cutoffDesc}>
            {winfo?.text || `Đơn ${order.code} hiện không thể gửi yêu cầu bảo hành mới.`}
          </Text>
          <View style={styles.cutoffCallCard}>
            <Text style={styles.cutoffCallTitle}>Cần kiểm tra thêm?</Text>
            <Text style={styles.cutoffCallSub}>
              Liên hệ bộ phận hỗ trợ Thợ Minh Đức để được kiểm tra thông tin bảo hành của đơn hàng.
            </Text>
            <Btn
              title={`Gọi tổng đài ${hotline}`}
              variant="soft"
              style={{ marginTop: 12 }}
              onPress={() => Linking.openURL(`tel:${hotline.replace(/\s+/g, '')}`).catch(() => {})}
            />
          </View>
          <Btn
            title="Đóng"
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
        {/* BANNER CẢNH BÁO NẾU LÀ NGÀY CUỐI CÙNG */}
        {isFinalDay ? (
          <View style={styles.finalDayBanner}>
            <AppIcon name="alert-triangle" size={18} color={C.red} />
            <View style={{ flex: 1 }}>
              <Text style={styles.finalDayTitle}>HÔM NAY LÀ HẠN CHÓT BẢO HÀNH (NGÀY THỨ {totalDays})</Text>
              <Text style={styles.finalDayDesc}>
                Hệ thống chỉ tiếp nhận lịch hẹn trong ngày hôm nay trước 18h00. Sau 18h00, thời hạn bảo hành miễn phí sẽ chính thức kết thúc.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.normalDayBanner}>
            <AppIcon name="shield-check" size={18} color={C.primary} />
            <Text style={styles.normalDayText}>
              Bảo hành miễn phí 100% · Còn {daysLeft} / {totalDays} ngày bảo hành
            </Text>
          </View>
        )}

        {/* 1. HẠNG MỤC CẦN BẢO HÀNH (LẤY TỪ DỊCH VỤ VÀ VẬT TƯ ĐƠN HÀNG ĐÃ LÀM) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>1. HẠNG MỤC ĐÃ LÀM CẦN BẢO HÀNH *</Text>
          <Text style={styles.sectionSub}>Chọn mục gặp sự cố</Text>
        </View>
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
                  <Text style={styles.itemMeta}>
                    {it.type === 'material' ? 'Linh kiện thay thế' : `Dịch vụ gốc (x${it.qty})`}
                  </Text>
                </View>
              </Tap>
            );
          })}
        </View>

        {/* 2. CHỌN NGÀY HẸN THỢ */}
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>2. CHỌN NGÀY HẸN THỢ</Text>
        {isFinalDay ? (
          <View style={styles.lockedDateCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="calendar" size={18} color={C.red} />
              <Text style={styles.lockedDateText}>Hôm nay ({formatDisplayDate(selectedDate)})</Text>
            </View>
            <Text style={styles.lockedDateBadge}>Hạn chót</Text>
          </View>
        ) : (
          <HScroll contentContainerStyle={styles.dateRow}>
            {availableDates.map((dateStr) => {
              const isSelected = selectedDate === dateStr;
              return (
                <Tap
                  key={dateStr}
                  style={[styles.dateChip, isSelected && styles.dateChipActive]}
                  onPress={() => {
                    setSelectedDate(dateStr);
                    const slotsOfDay =
                      dateStr === todayYmd && Array.isArray(winfo?.serverAvailableSlotsToday)
                        ? winfo.serverAvailableSlotsToday
                        : getSlotsForDate(dateStr, { now: new Date(), endYmd });
                    if (!slotsOfDay.includes(selectedSlot)) {
                      setSelectedSlot(slotsOfDay[0] || null);
                    }
                  }}
                >
                  <Text style={[styles.dateChipDay, isSelected && styles.dateChipTextActive]}>
                    {formatWarrantyDateLabel(dateStr)}
                  </Text>
                  <Text style={[styles.dateChipNum, isSelected && styles.dateChipTextActive]}>
                    {formatDisplayDate(dateStr)}
                  </Text>
                </Tap>
              );
            })}
          </HScroll>
        )}

        {/* 3. CHỌN KHUNG GIỜ PHỤC VỤ */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>3. CHỌN KHUNG GIỜ PHỤC VỤ</Text>
        {validSlots.length === 0 ? (
          <View style={styles.emptySlotCard}>
            <AppIcon name="clock" size={20} color={C.red} />
            <Text style={styles.emptySlotText}>
              {isFinalDay
                ? `Hôm nay là hạn cuối bảo hành và đã hết ca tiếp nhận trước 18h00. Vui lòng liên hệ tổng đài ${hotline} để được hỗ trợ.`
                : 'Đã hết ca làm việc khả dụng trong ngày này. Vui lòng chọn ngày khác bên trên.'}
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
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, { marginTop: 18 }]}>4. SỐ ĐIỆN THOẠI LIÊN HỆ *</Text>
          {isPrefilledPhoneShown ? <Text style={[styles.sectionSub, { marginTop: 18 }]}>Đã điền từ đơn hàng</Text> : null}
        </View>
        <TextInput
          style={styles.textInput}
          keyboardType="phone-pad"
          maxLength={15}
          placeholder="Nhập số điện thoại để thợ liên hệ khi đến..."
          placeholderTextColor={C.faint}
          value={phone}
          onChangeText={setPhone}
        />
        {phone && phone.includes('*') ? (
          <Text style={styles.phoneHint}>
            Số điện thoại trên đơn hàng đang được bảo mật ({phone}). Vui lòng nhập số điện thoại thật của bạn để thợ liên lạc nhé!
          </Text>
        ) : null}

        {/* 5. ĐỊA CHỈ PHỤC VỤ */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>5. ĐỊA CHỈ PHỤC VỤ TẬN NƠI</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Địa chỉ phục vụ..."
          placeholderTextColor={C.faint}
          value={address}
          onChangeText={setAddress}
        />

        {/* 6. MÔ TẢ HIỆN TƯỢNG HƯ HỎNG / SỰ CỐ */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>6. MÔ TẢ HIỆN TƯỢNG HƯ HỎNG / SỰ CỐ *</Text>
        <TextInput
          style={[styles.textInput, styles.descInput]}
          multiline
          numberOfLines={3}
          placeholder="Ghi rõ hiện tượng (ví dụ: máy lạnh chảy nước mặt lạnh sau 3 ngày sửa, không mát, cánh vẫy kêu to...)"
          placeholderTextColor={C.faint}
          value={description}
          onChangeText={setDescription}
        />

        {/* 7. HÌNH ẢNH BẰNG CHỨNG LỖI */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>7. HÌNH ẢNH MINH CHỨNG (TỐI ĐA 3 ẢNH)</Text>
        <View style={styles.imageGrid}>
          {images.map((imgUri, idx) => (
            <View key={`${idx}-${imgUri}`} style={styles.thumbWrap}>
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
    backgroundColor: C.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cutoffTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.redInk,
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
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 3.5,
    borderLeftColor: C.red,
  },
  cutoffCallTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.redInk,
  },
  cutoffCallSub: {
    fontSize: 12.5,
    lineHeight: 18,
    color: C.ink2,
    marginTop: 4,
  },
  finalDayBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 3.5,
    borderLeftColor: C.red,
    marginBottom: 14,
  },
  finalDayTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: C.redInk,
    letterSpacing: 0.2,
  },
  finalDayDesc: {
    fontSize: 12,
    lineHeight: 16,
    color: C.ink2,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: C.ink2,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sectionSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.primary,
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
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.line,
  },
  itemCardActive: {
    backgroundColor: C.primarySoft,
    borderColor: C.primary,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.faint,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
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
    backgroundColor: C.primarySoft,
    color: C.primary,
  },
  itemBadgeInactive: {
    backgroundColor: C.surface,
    color: C.faint,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C.surface,
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
    color: C.card,
  },
  lockedDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 3.5,
    borderLeftColor: C.red,
  },
  lockedDateText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.redInk,
  },
  lockedDateBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: C.redInk,
    backgroundColor: C.redSoft,
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
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
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
    color: C.card,
  },
  emptySlotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 3.5,
    borderLeftColor: C.red,
  },
  emptySlotText: {
    fontSize: 12.5,
    color: C.ink2,
    flex: 1,
  },
  textInput: {
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    color: C.ink,
    ...webNoOutline,
  },
  phoneHint: {
    fontSize: 11.5,
    lineHeight: 16,
    color: C.goldInk,
    marginTop: 4,
    paddingHorizontal: 4,
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
    borderColor: C.line,
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
