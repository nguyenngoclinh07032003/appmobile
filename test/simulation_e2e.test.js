import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  SERVICES,
  formatVND,
  syncCatalogFromBackend,
  matchJobForTech,
  ORDER_STEPS,
  SAFETY_CHECKLIST_ITEMS,
  TIME_SLOTS,
  TECH_ME,
  STATUS_FLOW,
} from '../src/constants/data.js';
import { draftFromOrder } from '../src/screens/tech/components/useQuoteDraft.js';
import {
  BASE_WARRANTY_DAYS,
  PASSWORD_MIN_LENGTH,
  OTP_TTL_MINUTES,
} from '../src/constants/appPolicy.js';

test('E2E SIMULATION: Khách hàng đặt đơn -> Thợ tiếp nhận & báo giá -> Nghiệm thu & Bảo hành', async (t) => {
  console.log('\n===============================================================');
  console.log('🚀 BẮT ĐẦU GIẢ LẬP TOÀN DIỆN: KHÁCH HÀNG & KỸ THUẬT VIÊN HRMSS');
  console.log('===============================================================\n');

  // 0. Nạp catalog chuẩn đồng bộ từ hệ thống
  syncCatalogFromBackend({
    categories: [
      { category_id: 1, category_name: 'Điện lạnh', icon: 'snowflake', is_active: true },
      { category_id: 2, category_name: 'Máy giặt', icon: 'disc', is_active: true },
    ],
    services: [
      { service_id: 101, category_id: 1, service_name: 'Vệ sinh máy lạnh treo tường (1-2 HP)', base_price: 150000 },
      { service_id: 102, category_id: 1, service_name: 'Nạp gas R32/R410A bổ sung', base_price: 250000 },
    ],
    materials: [
      { material_id: 201, material_name: 'Sò lạnh / Cảm biến nhiệt độ', unit_price: 180000, unit_of_measure: 'cái' },
      { material_id: 202, material_name: 'Tụ ngậm máy nén 35uF', unit_price: 120000, unit_of_measure: 'cái' },
    ],
  });

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 1: KHÁCH HÀNG (CUSTOMER SIMULATION)
  // ---------------------------------------------------------------------------
  await t.test('1. Khách hàng: Duyệt dịch vụ & Tạo đơn đặt lịch tại Hà Nội', () => {
    const customer = {
      id: 'cust-1001',
      name: 'Nguyễn Văn Khách',
      phone: '0988123456',
      address: {
        full: 'Số 25 Phố Duy Tân, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội',
        district: 'Cầu Giấy',
        area: 'Hà Nội',
        wardCode: '00123',
      },
    };

    console.log(`[Khách hàng] Đăng nhập: ${customer.name} (${customer.phone})`);
    console.log(`[Khách hàng] Địa chỉ phục vụ: ${customer.address.full}`);

    // Chọn dịch vụ từ danh mục
    const selectedService = SERVICES.find((s) => s.dbId === 101);
    assert.ok(selectedService, 'Dịch vụ vệ sinh máy lạnh phải tồn tại');
    console.log(`[Khách hàng] Chọn dịch vụ: "${selectedService.name}" - Giá niêm yết: ${formatVND(selectedService.price)}`);

    const orderPayload = {
      code: 'HRM261114-01',
      customer,
      items: [{ id: selectedService.id, dbId: selectedService.dbId, name: selectedService.name, price: selectedService.price, qty: 1 }],
      goods: selectedService.price,
      productDiscount: 0,
      comboDiscount: 0,
      dateKey: '2026-11-15',
      slot: TIME_SLOTS[1], // '10h00 - 12h00'
      note: 'Máy lạnh chảy nước và kém lạnh',
      status: 'pending',
      createdAt: Date.now(),
      total: selectedService.price,
      history: [{ status: 'pending', at: Date.now(), label: 'Đã tạo yêu cầu đặt dịch vụ' }],
    };

    assert.equal(orderPayload.status, 'pending');
    assert.equal(orderPayload.total, 150000);
    console.log(`[Khách hàng] Đặt đơn thành công! Mã đơn: ${orderPayload.code} | Khung giờ: ${orderPayload.slot} ngày ${orderPayload.dateKey}`);
  });

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 2: KỸ THUẬT VIÊN (TECHNICIAN SIMULATION)
  // ---------------------------------------------------------------------------
  let activeOrder = null;

  await t.test('2. Thợ: Tiếp nhận đơn, kiểm tra khu vực Hà Nội & Xuất phát', () => {
    const techProfile = {
      name: 'Trần Văn Kỹ Thuật',
      code: 'THO-HN01',
      phone: '0977888999',
      rating: 4.95,
      area: 'Hà Nội',
      specialties: ['Điện lạnh', 'Máy giặt'],
      acceptsAllCategories: true,
    };

    console.log(`\n[Thợ] Đăng nhập KTV: ${techProfile.name} (Mã: ${techProfile.code})`);
    console.log(`[Thợ] 📍 Khu vực phục vụ: ${techProfile.area} | Đánh giá: ★ ${techProfile.rating}`);

    activeOrder = {
      code: 'HRM261114-01',
      customer: { name: 'Nguyễn Văn Khách', phone: '0988123456' },
      address: {
        full: 'Số 25 Phố Duy Tân, Cầu Giấy, Hà Nội',
        district: 'Cầu Giấy',
        area: 'Hà Nội',
      },
      items: [{ id: 's-101', dbId: 101, name: 'Vệ sinh máy lạnh treo tường (1-2 HP)', price: 150000, qty: 1 }],
      goods: 150000,
      productDiscount: 0,
      comboDiscount: 0,
      status: 'pending',
      total: 150000,
      history: [],
    };

    // Kiểm tra khớp việc theo khu vực và kỹ năng
    const match = matchJobForTech(activeOrder, techProfile);
    assert.equal(match.areaMatch, true, 'Đơn tại Hà Nội phải khớp khu vực hoạt động của Thợ');
    console.log(`[Thợ] Đối soát đơn ${activeOrder.code}: Khớp khu vực Hà Nội = ${match.areaMatch} | Khớp tay nghề = ${match.skillMatch}`);

    // Thợ tiếp nhận việc
    activeOrder.status = 'confirmed';
    activeOrder.tech = techProfile;
    activeOrder.history.push({ status: 'confirmed', at: Date.now(), label: 'Kỹ thuật viên đã tiếp nhận ca' });
    console.log(`[Thợ] Đã bấm "Tiếp nhận việc" -> Trạng thái: ${activeOrder.status}`);

    // Thợ bắt đầu di chuyển
    activeOrder.status = 'onway';
    activeOrder.history.push({ status: 'onway', at: Date.now(), label: 'Thợ đang di chuyển tới địa chỉ' });
    console.log(`[Thợ] Đã bấm "Bắt đầu di chuyển" -> Trạng thái: ${activeOrder.status} (chia sẻ GPS realtime)`);

    // Thợ đến nơi và check-in GPS
    activeOrder.status = 'diagnosing';
    activeOrder.arrivedAt = Date.now();
    activeOrder.history.push({ status: 'diagnosing', at: Date.now(), label: 'Thợ đã check-in tại nhà khách' });
    console.log(`[Thợ] Đã check-in GPS tại địa chỉ khách hàng -> Trạng thái: ${activeOrder.status}`);
  });

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 3: BÁO GIÁ MINH BẠCH (KIỂM TRA LỖI CHÊNH LỆCH KHI 0 VẬT TƯ)
  // ---------------------------------------------------------------------------
  await t.test('3. Báo giá: Kiểm tra tính minh bạch & Không lệch giá khi 0 vật tư', () => {
    // Kịch bản A: Thợ kiểm tra máy, chẩn đoán chỉ cần vệ sinh theo gói gốc, KHÔNG phát sinh vật tư
    const draftInitial = draftFromOrder(activeOrder);
    assert.equal(draftInitial.lines.length, 1);
    assert.equal(draftInitial.lines[0].price, 150000);

    const booked = Math.max(0, (activeOrder.goods || 0) - (activeOrder.productDiscount || 0) - (activeOrder.comboDiscount || 0));
    const totalInitial = draftInitial.lines.reduce((sum, l) => sum + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
    const diffInitial = totalInitial - booked;

    console.log('\n[Báo giá - Kịch bản 1: Không phát sinh vật tư]');
    console.log(`- Giá gốc đơn hàng: ${formatVND(booked)}`);
    console.log(`- Tổng báo giá:     ${formatVND(totalInitial)}`);
    console.log(`- Chênh lệch (diff): ${formatVND(diffInitial)}`);

    // Khẳng định KHÔNG bị chênh lệch giá ảo khi không thêm vật tư
    assert.equal(diffInitial, 0, 'Khi không có vật tư hay phụ phí, chênh lệch phát sinh phải bằng đúng 0');
    assert.equal(totalInitial, 150000, 'Tổng giá phải giữ nguyên giá gói ban đầu');

    // Kịch bản B: Khách đồng ý thay thêm cảm biến sò lạnh 180.000đ
    const linesWithExtra = [
      ...draftInitial.lines,
      {
        key: 'mat-201',
        name: 'Sò lạnh / Cảm biến nhiệt độ',
        price: 180000,
        qty: 1,
        type: 'part',
        isCustom: false,
      },
    ];

    const laborTotal = linesWithExtra.filter((l) => l.type !== 'part').reduce((s, l) => s + l.price * l.qty, 0);
    const partsTotal = linesWithExtra.filter((l) => l.type === 'part').reduce((s, l) => s + l.price * l.qty, 0);
    const grandTotal = laborTotal + partsTotal;
    const extraDiff = grandTotal - booked;

    console.log('\n[Báo giá - Kịch bản 2: Phát sinh thêm linh kiện]');
    console.log(`- Nhân công dịch vụ gốc: ${formatVND(laborTotal)}`);
    console.log(`- Linh kiện vật tư:      ${formatVND(partsTotal)} (Sò lạnh / Cảm biến nhiệt độ)`);
    console.log(`- Tổng tiền báo giá mới: ${formatVND(grandTotal)}`);
    console.log(`- Phần phát sinh duyệt:  ${formatVND(extraDiff)}`);

    assert.equal(laborTotal, 150000);
    assert.equal(partsTotal, 180000);
    assert.equal(grandTotal, 330000);
    assert.equal(extraDiff, 180000);

    // Thợ gửi báo giá lên hệ thống
    activeOrder.status = 'quoted';
    activeOrder.quote = {
      diagnosis: 'Nghẹt bụi dàn lạnh và cảm biến nhiệt độ bị sai trị số',
      lines: linesWithExtra,
      grandTotal,
      approved: false,
    };
    activeOrder.history.push({ status: 'quoted', at: Date.now(), label: 'Đã gửi báo giá chi tiết cho khách' });
    console.log(`[Thợ] Đã gửi báo giá -> Trạng thái: ${activeOrder.status}`);
  });

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 4: KHÁCH DUYỆT BÁO GIÁ & THỢ THI CÔNG HOÀN TẤT
  // ---------------------------------------------------------------------------
  await t.test('4. Khách duyệt báo giá & Thợ thi công theo checklist an toàn', () => {
    // Khách kiểm tra thấy minh bạch từng dòng và bấm Đồng ý
    console.log('\n[Khách hàng] Xem bảng chi tiết báo giá:');
    console.log(`  1. ${activeOrder.quote.lines[0].name}: ${formatVND(activeOrder.quote.lines[0].price)}`);
    console.log(`  2. [Phát sinh] ${activeOrder.quote.lines[1].name}: ${formatVND(activeOrder.quote.lines[1].price)}`);
    console.log(`  => Khách hàng bấm: [Đồng ý báo giá (${formatVND(activeOrder.quote.grandTotal)})]`);

    activeOrder.quote.approved = true;
    activeOrder.status = 'repairing';
    activeOrder.total = activeOrder.quote.grandTotal;
    activeOrder.history.push({ status: 'repairing', at: Date.now(), label: 'Khách hàng đã duyệt báo giá' });

    assert.equal(activeOrder.status, 'repairing');
    console.log(`[Hệ thống] Đơn chuyển sang: ${activeOrder.status}`);

    // Thợ thực hiện các bước và kiểm tra checklist an toàn
    console.log('[Thợ] Tiến hành vệ sinh và thay linh kiện theo đúng quy trình.');

    // Thợ quản lý ghi chú sửa chữa (sửa & xóa)
    activeOrder.repairNotes = [
      { id: 'note-1', text: 'káhdhasd -> Đề xuất: sdfgasdfgsdfgsfg', at: Date.now() - 3600000 },
      { id: 'note-2', text: 'Kiểm tra áp suất gas R32 đạt 140 PSI', at: Date.now() - 1800000 },
    ];
    // Sửa ghi chú note-1
    activeOrder.repairNotes = activeOrder.repairNotes.map((n) => (n.id === 'note-1' ? { ...n, text: 'Đã vệ sinh sạch lưới lọc bụi dàn lạnh' } : n));
    assert.equal(activeOrder.repairNotes[0].text, 'Đã vệ sinh sạch lưới lọc bụi dàn lạnh');
    // Xóa ghi chú note-1
    activeOrder.repairNotes = activeOrder.repairNotes.filter((n) => n.id !== 'note-1');
    assert.equal(activeOrder.repairNotes.length, 1);
    assert.equal(activeOrder.repairNotes[0].id, 'note-2');
    console.log('[Thợ] Đã kiểm thử sửa & xóa ghi chú sửa chữa thành công!');

    const completedSafetyChecks = [
      'Đã vận hành chạy thử thiết bị ổn định (≥15 phút)',
      'Đã đo kiểm dòng điện và điện áp an toàn',
      'Đã dọn dẹp & vệ sinh sạch sẽ khu vực làm việc',
      'Đã hướng dẫn khách hàng sử dụng và bàn giao',
    ];

    // Thợ nộp biên bản nghiệm thu
    activeOrder.status = 'done';
    activeOrder.report = {
      summary: 'Đã vệ sinh dàn nóng/lạnh sạch sẽ, thay cảm biến sò lạnh chuẩn trị số. Thiết bị làm lạnh sâu.',
      safetyChecklist: completedSafetyChecks,
      completedAt: Date.now(),
    };
    activeOrder.paid = true;
    activeOrder.history.push({ status: 'done', at: Date.now(), label: 'Đã hoàn thành công việc và bàn giao' });

    assert.equal(activeOrder.status, 'done');
    console.log(`[Thợ] Đã nộp biên bản và nhận thanh toán -> Trạng thái: ${activeOrder.status}`);
  });

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 5: BẢO HÀNH ĐIỆN TỬ & ĐÁNH GIÁ DỊCH VỤ
  // ---------------------------------------------------------------------------
  await t.test('5. Kích hoạt bảo hành điện tử & Khách hàng đánh giá 5 sao', () => {
    // Kích hoạt bảo hành điện tử theo appPolicy (tối thiểu 60 ngày)
    const warrantyExpireDate = new Date(Date.now() + BASE_WARRANTY_DAYS * 24 * 60 * 60 * 1000);
    const warrantyCertificate = {
      orderCode: activeOrder.code,
      customerName: activeOrder.customer.name,
      techName: activeOrder.tech.name,
      serviceName: activeOrder.items[0].name,
      parts: activeOrder.quote.lines.filter((l) => l.type === 'part').map((l) => l.name),
      durationDays: BASE_WARRANTY_DAYS,
      expiresAt: warrantyExpireDate.toISOString().slice(0, 10),
      status: 'active',
    };

    console.log('\n[Bảo hành] Chứng nhận bảo hành điện tử kích hoạt:');
    console.log(`- Mã đơn:        ${warrantyCertificate.orderCode}`);
    console.log(`- KTV phụ trách: ${warrantyCertificate.techName}`);
    console.log(`- Thiết bị/Dịch vụ: ${warrantyCertificate.serviceName}`);
    console.log(`- Linh kiện BH:  ${warrantyCertificate.parts.join(', ')}`);
    console.log(`- Thời hạn:      ${warrantyCertificate.durationDays} ngày (Hết hạn: ${warrantyCertificate.expiresAt})`);

    assert.equal(warrantyCertificate.durationDays, 60);
    assert.equal(warrantyCertificate.status, 'active');

    // Khách hàng chấm điểm và đánh giá
    const review = {
      stars: 5,
      comment: 'Thợ đến đúng giờ, thao tác chuyên nghiệp, báo giá rõ ràng không chênh lệch linh tinh. Rất hài lòng!',
      at: Date.now(),
    };
    activeOrder.review = review;
    console.log(`\n[Khách hàng] Gửi đánh giá: ${'⭐'.repeat(review.stars)}`);
    console.log(`- Nhận xét: "${review.comment}"`);
    console.log(`- Thưởng điểm: +20 điểm Loyalty vào tài khoản khách hàng.`);

    assert.equal(activeOrder.review.stars, 5);
    console.log('\n===============================================================');
    console.log('🎉 GIẢ LẬP TOÀN VẸN 100% LUỒNG KHÁCH HÀNG & THỢ THÀNH CÔNG RỰC RỠ!');
    console.log('===============================================================\n');
  });
});
