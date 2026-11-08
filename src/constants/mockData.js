import { TECH_ME, getService } from './data';

const now = Date.now();
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const todayKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayLabel = `Hôm nay (${pad(d.getDate())}/${pad(d.getMonth() + 1)})`;

export const MOCK_ADDRESSES = [
  {
    id: 'addr-demo-1',
    name: 'Nguyễn Minh Anh',
    phone: '0901234567',
    gender: 'Nữ',
    district: 'Bình Thạnh',
    full: '123 Điện Biên Phủ, Phường 15, Quận Bình Thạnh, TP.HCM',
    isDefault: true,
  },
  {
    id: 'addr-demo-2',
    name: 'Nguyễn Minh Anh',
    phone: '0901234567',
    gender: 'Nữ',
    district: 'Quận 1',
    full: '45 Lê Duẩn, Phường Bến Nghé, Quận 1, TP.HCM',
    isDefault: false,
  },
];

export const MOCK_DEVICES = [
  {
    id: 'dev-demo-1',
    name: 'Máy lạnh Daikin Inverter 1.5 HP',
    category: 'may-lanh',
    brand: 'Daikin',
    model: 'FTKC35UAVMV',
    room: 'Phòng khách',
    serial: 'DK-2023-8891',
    installedAt: now - 86400000 * 365,
    lastService: now - 86400000 * 210, // 7 tháng trước -> Quá hạn bảo dưỡng
    maintMonths: 6,
    note: 'Lắp đặt chính hãng, cần vệ sinh lưới lọc định kỳ',
  },
  {
    id: 'dev-demo-2',
    name: 'Máy giặt lồng ngang Electrolux 9kg',
    category: 'may-giat',
    brand: 'Electrolux',
    model: 'EWF9024P5WB',
    room: 'Ban công',
    serial: 'EL-2022-4412',
    installedAt: now - 86400000 * 500,
    lastService: now - 86400000 * 160, // Sắp đến hạn
    maintMonths: 6,
    note: 'Dùng gia đình 4 người, giặt 1 lần/ngày',
  },
  {
    id: 'dev-demo-3',
    name: 'Tủ lạnh Samsung Twin Cooling 380L',
    category: 'tu-lanh',
    brand: 'Samsung',
    model: 'RT38K5982SL',
    room: 'Bếp',
    serial: 'SS-2024-1109',
    installedAt: now - 86400000 * 180,
    lastService: now - 86400000 * 30, // Mới làm 1 tháng trước -> Rất tốt
    maintMonths: 6,
    note: 'Đang hoạt động ổn định',
  },
];

export const MOCK_ORDERS = [
  // 1. ĐƠN 1: VIỆC MỚI ĐƯỢC HỆ THỐNG ĐIỀU PHỐI (Trạng thái: pending)
  // Thể hiện rõ mô hình: Đúng chuyên môn Điện lạnh & thuộc khu vực Bình Thạnh
  {
    code: 'HRM261108-01',
    status: 'pending',
    kind: 'standard',
    createdAt: now - 15 * 60 * 1000,
    dateKey: todayKey,
    dateLabel: todayLabel,
    slot: '14h00 - 16h00',
    items: [{ id: 'vs-ml-1', qty: 1 }],
    payment: 'Thanh toán khi nhận hàng',
    address: {
      name: 'Chị Hoàng Mai Anh',
      phone: '0912345678',
      gender: 'Nữ',
      district: 'Bình Thạnh',
      full: '123 Điện Biên Phủ, Phường 15, Quận Bình Thạnh, TP.HCM',
    },
    device: {
      category: 'may-lanh',
      brand: 'Daikin',
      room: 'Phòng khách',
      serial: 'DK-2023-8891',
    },
    note: 'Máy lạnh có mùi ẩm nhẹ, nhờ thợ kiểm tra kỹ dàn lạnh và vệ sinh quạt lồng sóc giúp mình.',
    dispatchNote: 'Hệ thống HRMSS tự động điều phối: Đúng chuyên môn Điện Lạnh & Khu vực Bình Thạnh',
    history: [
      { status: 'pending', at: now - 15 * 60 * 1000 },
    ],
  },

  // 2. ĐƠN 2: THỢ ĐANG TRÊN ĐƯỜNG ĐẾN (Trạng thái: onway)
  // Thể hiện theo dõi GPS trực tiếp + chat thời gian thực
  {
    code: 'HRM261108-02',
    status: 'onway',
    kind: 'standard',
    createdAt: now - 90 * 60 * 1000,
    acceptedAt: now - 45 * 60 * 1000,
    travelStartedAt: now - 10 * 60 * 1000,
    dateKey: todayKey,
    dateLabel: todayLabel,
    slot: '10h00 - 12h00',
    items: [{ id: 'vs-mg-truoc', qty: 1 }],
    payment: 'Thanh toán khi nhận hàng',
    address: {
      name: 'Anh Trần Minh Quân',
      phone: '0908987654',
      gender: 'Nam',
      district: 'Quận 1',
      full: '45 Lê Duẩn, Phường Bến Nghé, Quận 1, TP.HCM',
    },
    device: {
      category: 'may-giat',
      brand: 'Electrolux',
      room: 'Ban công',
      serial: 'EL-2022-4412',
    },
    tech: { ...TECH_ME },
    tracking: {
      progress: 0.55,
      etaMin: 8,
      distanceKm: 1.4,
      lat: 10.7812,
      lng: 106.6985,
      label: 'Thợ đang di chuyển trên đường Lê Duẩn, dự kiến đến sau 8 phút',
      updatedAt: now,
    },
    messages: [
      { id: 'm-1', from: 'tech', text: 'Chào anh Quân, em là Hùng KTV HRMSS. Em đang trên đường qua nhà mình ạ.', at: now - 8 * 60 * 1000 },
      { id: 'm-2', from: 'customer', text: 'Chào em, khi đến tòa nhà em bấm chuông phòng 402 nhé.', at: now - 6 * 60 * 1000 },
      { id: 'm-3', from: 'tech', text: 'Dạ vâng anh, khoảng 8 phút nữa em có mặt ạ!', at: now - 4 * 60 * 1000 },
    ],
    history: [
      { status: 'pending', at: now - 90 * 60 * 1000 },
      { status: 'confirmed', at: now - 45 * 60 * 1000 },
      { status: 'onway', at: now - 10 * 60 * 1000 },
    ],
  },

  // 3. ĐƠN 3: BÁO GIÁ PHÁT SINH CHỜ KHÁCH PHÊ DUYỆT (Trạng thái: quoted)
  // Thể hiện tính minh bạch bảo vệ giá 100%, khách duyệt hoặc từ chối miễn phí
  {
    code: 'HRM261108-03',
    status: 'quoted',
    kind: 'standard',
    createdAt: now - 180 * 60 * 1000,
    acceptedAt: now - 140 * 60 * 1000,
    arrivedAt: now - 60 * 60 * 1000,
    dateKey: todayKey,
    dateLabel: todayLabel,
    slot: '08h00 - 10h00',
    items: [{ id: 'sc-tl-1', qty: 1 }],
    payment: 'Chuyển khoản ngân hàng',
    address: {
      name: 'Chị Phạm Thu Trang',
      phone: '0933112233',
      gender: 'Nữ',
      district: 'Bình Thạnh',
      full: '88 Nguyễn Gia Trí, Phường 25, Quận Bình Thạnh, TP.HCM',
    },
    device: {
      category: 'tu-lanh',
      brand: 'Samsung',
      room: 'Bếp',
      serial: 'SS-2024-1109',
    },
    tech: { ...TECH_ME },
    checkIn: {
      at: now - 60 * 60 * 1000,
      label: 'Đã check-in định vị tại 88 Nguyễn Gia Trí, P.25, Bình Thạnh',
      lat: 10.8035,
      lng: 106.7142,
    },
    quote: {
      symptoms: 'Ngăn đá không đông, quạt gió kêu to rè rè bất thường',
      diagnosis: 'Hỏng sò lạnh (cảm biến xả đá âm) dẫn tới đóng tuyết nghẹt cánh quạt gió',
      recommendation: 'Thay thế sò lạnh chính hãng Samsung và xả băng bảo dưỡng hệ thống xả đá',
      booked: 150000,
      lines: [
        { name: 'Công kiểm tra & bảo dưỡng xả đá', price: 150000, qty: 1, type: 'labor' },
        { name: 'Sò lạnh âm tủ lạnh Inverter Samsung chính hãng', price: 280000, qty: 1, type: 'part' },
        { name: 'Gia cố bas giữ cánh quạt bị rung lỏng', price: 50000, qty: 1, type: 'labor', isCustom: true },
      ],
      total: 480000,
      approved: false,
    },
    history: [
      { status: 'pending', at: now - 180 * 60 * 1000 },
      { status: 'confirmed', at: now - 140 * 60 * 1000 },
      { status: 'onway', at: now - 80 * 60 * 1000 },
      { status: 'diagnosing', at: now - 60 * 60 * 1000 },
      { status: 'quoted', at: now - 25 * 60 * 1000 },
    ],
  },

  // 4. ĐƠN 4: ĐÃ HOÀN THÀNH & BẢO HÀNH ĐIỆN TỬ 60 NGÀY (Trạng thái: done)
  // Thể hiện nghiệm thu, biên bản kỹ thuật, ảnh trước/sau và đánh giá 5 sao
  {
    code: 'HRM261108-04',
    status: 'done',
    kind: 'standard',
    createdAt: now - 86400000 * 2,
    acceptedAt: now - 86400000 * 2 + 15 * 60 * 1000,
    doneAt: now - 86400000 * 2 + 120 * 60 * 1000,
    dateKey: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate() - 2)}`,
    dateLabel: '2 ngày trước',
    slot: '08h00 - 10h00',
    items: [{ id: 'vs-ml-1', qty: 2 }],
    payment: 'VNPay QR',
    address: {
      name: 'Anh Lê Hoàng Nam',
      phone: '0977445566',
      gender: 'Nam',
      district: 'Bình Thạnh',
      full: '202 Xô Viết Nghệ Tĩnh, Phường 21, Quận Bình Thạnh, TP.HCM',
    },
    device: {
      category: 'may-lanh',
      brand: 'Panasonic',
      room: 'Phòng ngủ Master',
      serial: 'PN-2023-7721',
    },
    tech: { ...TECH_ME },
    report: {
      summary: 'Đã hoàn thành vệ sinh sạch sẽ 02 bộ máy lạnh treo tường (dàn nóng + dàn lạnh). Xịt thông đường ống thoát nước, kiểm tra áp suất gas đạt chuẩn 140 PSI. Máy chạy êm, nhiệt độ gió ra 17.5°C.',
      paid: true,
      paidAt: now - 86400000 * 2 + 115 * 60 * 1000,
      paidBy: 'customer',
      warrantyCertificateCode: 'BH-HRM261108-04',
      warrantyDays: 60,
      customerSignature: 'Nguyễn Văn Minh',
      safetyChecklist: [
        'Đã ngắt aptomat nguồn trước khi thao tác',
        'Đã bọc chống nước bo mạch dàn lạnh',
        'Kiểm tra rò rỉ điện vỏ máy an toàn',
        'Bàn giao và dọn dẹp vệ sinh sạch sẽ khu vực làm việc',
      ],
    },
    rating: {
      stars: 5,
      comment: 'Kỹ thuật viên Hùng làm việc rất chuyên nghiệp, cẩn thận, mang đầy đủ bạt phủ bảo vệ sàn và đồ đạc. Máy sau khi làm xong chạy cực mát và êm!',
      at: now - 86400000 * 2 + 130 * 60 * 1000,
    },
    evidence: [
      { id: 'ev-1', uri: 'https://picsum.photos/seed/ml-before/600/400', stage: 'before', at: now - 86400000 * 2 + 40 * 60 * 1000 },
      { id: 'ev-2', uri: 'https://picsum.photos/seed/ml-after/600/400', stage: 'after', at: now - 86400000 * 2 + 105 * 60 * 1000 },
    ],
    history: [
      { status: 'pending', at: now - 86400000 * 2 },
      { status: 'confirmed', at: now - 86400000 * 2 + 15 * 60 * 1000 },
      { status: 'onway', at: now - 86400000 * 2 + 30 * 60 * 1000 },
      { status: 'diagnosing', at: now - 86400000 * 2 + 45 * 60 * 1000 },
      { status: 'repairing', at: now - 86400000 * 2 + 55 * 60 * 1000 },
      { status: 'done', at: now - 86400000 * 2 + 120 * 60 * 1000 },
    ],
  },
];

