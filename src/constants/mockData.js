import { TECH_ME, getService } from './data';

const now = Date.now();
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const todayKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayLabel = `Hôm nay (${pad(d.getDate())}/${pad(d.getMonth() + 1)})`;
const curH = d.getHours();
const slotH1 = Math.min(20, Math.max(8, curH));
const slotH2 = Math.min(22, slotH1 + 2);
const activeSlot1 = `${pad(slotH1)}h00 - ${pad(slotH2)}h00`;
const activeSlot2 = `${pad(Math.max(8, slotH1 - 1))}h30 - ${pad(Math.min(22, slotH1 + 1))}h30`;

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
    lastService: now - 86400000 * 2, // Vừa hoàn thành sửa chữa 2 ngày trước
    warrantyUntil: now + 86400000 * 88, // Còn 88 ngày bảo hành điện tử
    warrantyCode: 'BH-HRM261108-04',
    maintMonths: 6,
    note: 'Đã sửa chữa thay cụm bơm xả & dây curoa, chạy êm ái, còn bảo hành 88 ngày',
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
    slot: activeSlot1,
    items: [{ id: 'vs-ml-1', qty: 1 }],
    payment: 'Chuyển khoản VietQR',
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
    slot: activeSlot2,
    items: [{ id: 'vs-mg-truoc', qty: 1 }],
    payment: 'Tiền mặt cho thợ tại nhà',
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

  // 4. ĐƠN 4: ĐÃ HOÀN THÀNH DỊCH VỤ SỬA CHỮA THIẾT BỊ (Trạng thái: done)
  // Thể hiện trọn vẹn quy trình sửa chữa thực tế: Chẩn đoán lỗi, báo giá linh kiện phát sinh đã duyệt, vật tư thay thế, thanh toán VietQR, chữ ký điện tử và bảo hành 90 ngày
  {
    code: 'HRM261108-04',
    status: 'done',
    kind: 'standard',
    createdAt: now - 86400000 * 2,
    acceptedAt: now - 86400000 * 2 + 15 * 60 * 1000,
    arrivedAt: now - 86400000 * 2 + 35 * 60 * 1000,
    doneAt: now - 86400000 * 2 + 120 * 60 * 1000,
    dateKey: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate() - 2)}`,
    dateLabel: '2 ngày trước',
    slot: '08h00 - 10h00',
    items: [{ id: 'sc-mg', qty: 1 }],
    payment: 'Chuyển khoản VietQR',
    address: {
      name: 'Nguyễn Minh Anh',
      phone: '0901234567',
      gender: 'Nữ',
      district: 'Bình Thạnh',
      full: '123 Điện Biên Phủ, Phường 15, Quận Bình Thạnh, TP.HCM',
    },
    device: {
      category: 'may-giat',
      brand: 'Electrolux',
      model: 'EWF9024P5WB',
      room: 'Ban công',
      serial: 'EL-2022-4412',
    },
    tech: { ...TECH_ME },
    quote: {
      symptoms: 'Máy giặt báo lỗi E40, không xả nước và rung lắc dữ dội khi chuyển sang chu trình vắt',
      diagnosis: 'Hỏng cụm bơm xả từ tính (kẹt dị vật cháy cuộn dây) và dão đứt dây curoa truyền động motor',
      recommendation: 'Thay mới cụm bơm xả nước thải máy giặt Electrolux và thay dây curoa mới, cân chỉnh lại chân đế chống rung',
      booked: 200000,
      lines: [
        { name: 'Công kiểm tra & sửa chữa hệ thống xả vắt', price: 200000, qty: 1, type: 'labor' },
        { name: 'Bơm xả máy giặt cửa trước Electrolux', price: 450000, qty: 1, type: 'part', matId: 'm-bom-xa' },
        { name: 'Dây curoa máy giặt Electrolux', price: 180000, qty: 1, type: 'part', matId: 'm-curoa', isCustom: true },
      ],
      total: 830000,
      approved: true,
      at: now - 86400000 * 2 + 50 * 60 * 1000,
      respondedAt: now - 86400000 * 2 + 55 * 60 * 1000,
    },
    materials: [
      { id: 'mat-rep-1', name: 'Bơm xả máy giặt cửa trước Electrolux', qty: 1, unit: 'cái', price: 450000 },
      { id: 'mat-rep-2', name: 'Dây curoa máy giặt Electrolux', qty: 1, unit: 'sợi', price: 180000, isCustom: true },
    ],
    report: {
      summary: 'Đã hoàn thành sửa chữa: Thay mới cụm bơm xả nước thải và dây curoa truyền động chính hãng. Cân chỉnh lại hệ thống giảm chấn lồng giặt. Máy đã xả sạch nước, test vắt 1200 RPM êm ái, không còn rung lắc hay báo lỗi E40.',
      paid: true,
      paidAt: now - 86400000 * 2 + 118 * 60 * 1000,
      paidBy: 'vietqr_webhook',
      warrantyCertificateCode: 'BH-HRM261108-04',
      warrantyDays: 90,
      customerSignature: 'Nguyễn Minh Anh',
      safetyChecklist: [
        'Đã ngắt nguồn điện và khóa van cấp nước trước khi thao tác',
        'Kiểm tra an toàn tiếp địa và chống rò điện vỏ máy giặt',
        'Chạy thử vắt tải 1200 vòng/phút êm ái, thoát nước triệt để',
        'Bàn giao và dọn dẹp vệ sinh sạch sẽ khu vực ban công',
      ],
    },
    rating: {
      stars: 5,
      text: 'Kỹ thuật viên Hùng sửa chữa rất chuyên nghiệp và nhanh nhẹn! Báo giá minh bạch trên app, thay linh kiện mới tinh có dán tem bảo hành 90 ngày. Máy giặt xong chạy cực kỳ êm ái!',
      comment: 'Kỹ thuật viên Hùng sửa chữa rất chuyên nghiệp và nhanh nhẹn! Báo giá minh bạch trên app, thay linh kiện mới tinh có dán tem bảo hành 90 ngày. Máy giặt xong chạy cực kỳ êm ái!',
      at: now - 86400000 * 2 + 130 * 60 * 1000,
    },
    evidence: [
      { id: 'ev-1', uri: 'https://picsum.photos/seed/wm-broken/600/400', stage: 'before', note: 'Hiện trạng máy giặt ứ nước, lồng lệch trục', at: now - 86400000 * 2 + 40 * 60 * 1000 },
      { id: 'ev-2', uri: 'https://picsum.photos/seed/wm-pump/600/400', stage: 'diagnosis', note: 'Bơm xả cũ bị cháy cuộn dây và dây curoa nứt đứt', at: now - 86400000 * 2 + 48 * 60 * 1000 },
      { id: 'ev-3', uri: 'https://picsum.photos/seed/wm-fixed/600/400', stage: 'after', note: 'Đã thay mới bơm xả & dây curoa, chạy vắt 1200 RPM êm ái', at: now - 86400000 * 2 + 110 * 60 * 1000 },
    ],
    history: [
      { status: 'pending', at: now - 86400000 * 2 },
      { status: 'confirmed', at: now - 86400000 * 2 + 15 * 60 * 1000 },
      { status: 'onway', at: now - 86400000 * 2 + 25 * 60 * 1000 },
      { status: 'diagnosing', at: now - 86400000 * 2 + 40 * 60 * 1000 },
      { status: 'quoted', at: now - 86400000 * 2 + 50 * 60 * 1000 },
      { status: 'repairing', at: now - 86400000 * 2 + 55 * 60 * 1000 },
      { status: 'done', at: now - 86400000 * 2 + 120 * 60 * 1000 },
    ],
  },
];

export const MOCK_CUSTOMER_NOTIFS = [
  {
    id: 'notif-cust-1',
    at: now - 8 * 60 * 1000,
    read: false,
    tone: 'warning',
    icon: '🧾',
    title: 'Báo giá chính thức từ Văn phòng · HRM261108-03',
    body: 'Văn phòng HRMSS đã gửi báo giá 480.000đ (Thay rơ-le khởi động & cảm biến nhiệt tủ lạnh Samsung). Vui lòng mở đơn để xác nhận.',
    link: { name: 'order', params: { code: 'HRM261108-03' } },
  },
  {
    id: 'notif-cust-2',
    at: now - 15 * 60 * 1000,
    read: false,
    tone: 'warning',
    icon: '🛵',
    title: 'Thợ đang đến · HRM261108-02',
    body: 'KTV Hoàng Văn Thọ đang di chuyển tới địa chỉ của bạn. Mở đơn để theo dõi GPS trực tiếp.',
    link: { name: 'order', params: { code: 'HRM261108-02' } },
  },
  {
    id: 'notif-cust-3',
    at: now - 2 * 60 * 60 * 1000,
    read: true,
    tone: 'success',
    icon: '✅',
    title: 'Đơn HRM261108-04 đã hoàn thành',
    body: 'Bạn nhận được +75 điểm và Phiếu bảo hành điện tử BH-HRM261108-04 (60 ngày).',
    link: { name: 'order', params: { code: 'HRM261108-04' } },
  },
  {
    id: 'notif-cust-4',
    at: now - 5 * 60 * 60 * 1000,
    read: true,
    tone: 'danger',
    icon: '⚠️',
    title: 'Thiết bị đến chu kỳ bảo dưỡng định kỳ',
    body: 'Máy lạnh Daikin Inverter 1.5 HP (Phòng khách) đã đến chu kỳ bảo dưỡng 6 tháng. Đặt lịch vệ sinh ngay.',
    link: { tab: 'services' },
  },
  {
    id: 'notif-cust-5',
    at: now - 24 * 60 * 60 * 1000,
    read: true,
    tone: 'success',
    icon: '🎉',
    title: 'Chào mừng bạn đến với Thợ HRMSS',
    body: 'Nhập mã THO20 để được giảm 20.000đ cho đơn từ 150.000đ.',
    link: { name: 'rewards' },
  },
];

export const MOCK_TECH_NOTIFS = [
  {
    id: 'notif-tech-1',
    at: now - 5 * 60 * 1000,
    read: false,
    tone: 'warning',
    icon: '🆕',
    title: 'Việc mới HRM261108-01 · Vệ sinh máy lạnh từ 1–2.5 HP',
    body: `${todayLabel} · ${activeSlot1} · Máy lạnh Daikin · Bình Thạnh, TP.HCM`,
    link: { name: 'tech-job', params: { code: 'HRM261108-01' } },
  },
  {
    id: 'notif-tech-2',
    at: now - 25 * 60 * 1000,
    read: false,
    tone: 'warning',
    icon: '✏️',
    title: 'Chờ khách duyệt báo giá · HRM261108-03',
    body: 'Đã gửi báo giá 480.000đ cho khách Chị Phạm Thu Trang. Chờ khách xác nhận trên ứng dụng.',
    link: { name: 'tech-job', params: { code: 'HRM261108-03' } },
  },
  {
    id: 'notif-tech-3',
    at: now - 60 * 60 * 1000,
    read: true,
    tone: 'success',
    icon: '✅',
    title: 'Khách xác nhận đã thanh toán · HRM261108-04',
    body: 'Hệ thống đã nhận đủ 750.000đ qua VietQR. Thợ KHÔNG thu tiền mặt — hoàn ứng đã cộng vào Ví thợ!',
    link: { name: 'tech-job', params: { code: 'HRM261108-04' } },
  },
  {
    id: 'notif-tech-4',
    at: now - 2 * 60 * 60 * 1000,
    read: true,
    tone: 'danger',
    icon: '❌',
    title: 'Khách đã huỷ đơn HRMSS897989',
    body: 'Tôi muốn đổi lịch khác vào cuối tuần.',
    link: { tab: 'tech-jobs' },
  },
  {
    id: 'notif-tech-5',
    at: now - 3 * 60 * 60 * 1000,
    read: true,
    tone: 'success',
    icon: '⭐',
    title: 'Khách đánh giá 5★ · HRM261108-04',
    body: 'Kỹ thuật viên sửa chữa rất chuyên nghiệp và nhanh nhẹn! Máy giặt xong chạy cực kỳ êm ái!',
    link: { name: 'tech-job', params: { code: 'HRM261108-04' } },
  },
];


