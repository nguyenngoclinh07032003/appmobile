/**
 * Kịch bản demo bảo vệ đồ án — nạp nhanh dữ liệu mẫu cho Khách + Thợ.
 * Hai tab dùng chung localStorage nên thấy cùng đơn.
 */
import { getService, TECH_ME, formatVND } from './data';

const pad = (n) => String(n).padStart(2, '0');
const dayLabel = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const label = offset === 0 ? 'Hôm nay' : offset === 1 ? 'Ngày mai' : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
  return {
    label: `${label} (${pad(d.getDate())}/${pad(d.getMonth() + 1)})`,
    key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  };
};

export const DEMO_ADDR_ID = 'demo-addr-hn';
export const DEMO_CODES = {
  pending: 'DMXDEMO1',
  onway: 'DMXDEMO2',
  quoted: 'DMXDEMO3',
  done: 'DMXDEMO4',
};

export const demoAddress = () => ({
  id: DEMO_ADDR_ID,
  name: 'Linh Nguyễn',
  phone: '0901234567',
  gender: 'Nữ',
  full: '12 Nguyễn Văn Cừ, Nghĩa Đô, Cầu Giấy, Hà Nội',
  area: 'Cầu Giấy',
  lat: 21.036778,
  lng: 105.782374,
  isDefault: true,
  note: 'Gọi trước khi lên — cổng xanh',
});

const techSnapshot = (profile) => {
  const t = profile || TECH_ME;
  return {
    name: t.name || TECH_ME.name,
    phone: t.phone || TECH_ME.phone,
    code: t.code || TECH_ME.code,
    rating: t.rating ?? TECH_ME.rating,
    jobs: t.jobs ?? 0,
    reputation: t.reputation ?? 100,
  };
};

/** Tạo / ghi đè 4 đơn demo minh họa đủ luồng chính */
export const buildDemoScenario = (state = {}) => {
  const now = Date.now();
  const svc = getService('vs-ml-1');
  const goods = svc?.price || 180000;
  const addr = demoAddress();
  const tech = techSnapshot(state.techProfile);
  const today = dayLabel(0);
  const tomorrow = dayLabel(1);
  const booked = goods;

  const base = (code, extra) => ({
    code,
    kind: 'normal',
    demo: true,
    items: [{ id: 'vs-ml-1', qty: 1 }],
    goods,
    productDiscount: 0,
    voucher: null,
    voucherDiscount: 0,
    total: booked,
    finalTotal: booked,
    payment: 'Thanh toán khi nhận hàng',
    note: 'Máy lạnh phòng khách kém mát',
    workerCode: '',
    attachments: [],
    address: addr,
    rating: null,
    ...extra,
  });

  const pending = base(DEMO_CODES.pending, {
    status: 'pending',
    dateLabel: tomorrow.label,
    dateKey: tomorrow.key,
    slot: '08h00 - 10h00',
    tech: null,
    history: [{ status: 'pending', at: now - 8 * 60000 }],
    createdAt: now - 8 * 60000,
    dispatchNote: 'Demo: việc mới — thợ nhận ở tab Công việc.',
  });

  const onway = base(DEMO_CODES.onway, {
    status: 'onway',
    dateLabel: today.label,
    dateKey: today.key,
    slot: '14h00 - 16h00',
    tech: { ...tech },
    workerCode: tech.code,
    acceptedAt: now - 35 * 60000,
    travelStartedAt: now - 12 * 60000,
    history: [
      { status: 'pending', at: now - 90 * 60000 },
      { status: 'confirmed', at: now - 35 * 60000 },
      { status: 'onway', at: now - 12 * 60000 },
    ],
    createdAt: now - 90 * 60000,
    tracking: {
      progress: 0.35,
      etaMin: 18,
      lat: 21.0302,
      lng: 105.7881,
      updatedAt: now,
      label: 'Thợ đang trên đường',
    },
  });

  const quoteLines = [
    { type: 'labor', name: svc?.name || 'Vệ sinh máy lạnh', qty: 1, price: booked },
    { type: 'part', name: 'Gas R32', qty: 1, price: 250000, unit: 'kg' },
  ];
  const qTotal = quoteLines.reduce((s, l) => s + l.price * l.qty, 0);
  const quoted = base(DEMO_CODES.quoted, {
    status: 'quoted',
    dateLabel: today.label,
    dateKey: today.key,
    slot: '10h00 - 12h00',
    tech: { ...tech },
    workerCode: tech.code,
    acceptedAt: now - 120 * 60000,
    arrivedAt: now - 50 * 60000,
    checkIn: {
      lat: addr.lat, lng: addr.lng, accuracy: 25, simulated: true,
      label: 'Vị trí mô phỏng tại nhà khách', at: now - 50 * 60000,
    },
    history: [
      { status: 'pending', at: now - 180 * 60000 },
      { status: 'confirmed', at: now - 120 * 60000 },
      { status: 'onway', at: now - 70 * 60000 },
      { status: 'diagnosing', at: now - 50 * 60000 },
      { status: 'quoted', at: now - 20 * 60000 },
    ],
    createdAt: now - 180 * 60000,
    quote: {
      symptoms: 'Máy lạnh kém mát, chảy nước',
      diagnosis: 'Thiếu gas nhẹ, dàn lạnh bẩn',
      recommendation: 'Vệ sinh sâu + nạp bổ sung gas R32',
      lines: quoteLines,
      booked,
      total: qTotal,
      approved: false,
      at: now - 20 * 60000,
    },
    materials: [{ id: 'm-gas-r32', name: 'Gas R32', qty: 1, unit: 'kg', price: 250000 }],
    finalTotal: qTotal,
    total: qTotal,
  });

  const done = base(DEMO_CODES.done, {
    status: 'done',
    dateLabel: dayLabel(-1).label,
    dateKey: dayLabel(-1).key,
    slot: '16h00 - 18h00',
    payment: 'VNPay QR',
    tech: { ...tech },
    workerCode: tech.code,
    acceptedAt: now - 2 * 86400000,
    arrivedAt: now - 2 * 86400000 + 40 * 60000,
    doneAt: now - 2 * 86400000 + 90 * 60000,
    history: [
      { status: 'pending', at: now - 2 * 86400000 },
      { status: 'confirmed', at: now - 2 * 86400000 + 10 * 60000 },
      { status: 'onway', at: now - 2 * 86400000 + 30 * 60000 },
      { status: 'diagnosing', at: now - 2 * 86400000 + 40 * 60000 },
      { status: 'repairing', at: now - 2 * 86400000 + 55 * 60000 },
      { status: 'done', at: now - 2 * 86400000 + 90 * 60000 },
    ],
    createdAt: now - 2 * 86400000,
    report: {
      summary: 'Đã vệ sinh máy lạnh 1–2.5 HP. Máy chạy ổn, bàn giao khách.',
      paid: false,
      at: now - 2 * 86400000 + 90 * 60000,
      tech: tech.name,
    },
    progress: [
      { id: 'p1', percent: 50, note: 'Đang vệ sinh dàn lạnh', at: now - 2 * 86400000 + 60 * 60000 },
      { id: 'p2', percent: 100, note: 'Hoàn tất, chạy thử', at: now - 2 * 86400000 + 85 * 60000 },
    ],
    chat: [
      { id: 'c1', from: 'tech', text: 'Em đã đến gần nhà chị, 5 phút nữa tới ạ.', at: now - 2 * 86400000 + 32 * 60000 },
      { id: 'c2', from: 'customer', text: 'Ok anh, cổng xanh nhé.', at: now - 2 * 86400000 + 33 * 60000 },
    ],
  });

  const demoOrders = [pending, onway, quoted, done];
  const keep = (state.orders || []).filter((o) => !o.demo && !Object.values(DEMO_CODES).includes(o.code));
  const addresses = (() => {
    const list = [...(state.addresses || [])];
    if (!list.some((a) => a.id === DEMO_ADDR_ID)) list.unshift(addr);
    else {
      const i = list.findIndex((a) => a.id === DEMO_ADDR_ID);
      list[i] = { ...list[i], ...addr };
    }
    return list.map((a, idx) => ({ ...a, isDefault: a.id === DEMO_ADDR_ID || (idx === 0 && !list.some((x) => x.id === DEMO_ADDR_ID)) }));
  })();

  return {
    addresses,
    selectedAddressId: DEMO_ADDR_ID,
    user: {
      ...(state.user || {}),
      name: state.user?.name || addr.name,
      phone: state.user?.phone || addr.phone,
    },
    orders: [...demoOrders, ...keep],
    devices: (state.devices || []).length ? state.devices : [{
      id: 'demo-dev-ml',
      category: 'may-lanh',
      brand: 'Panasonic',
      room: 'Phòng khách',
      lastService: now - 200 * 86400000,
      createdAt: now - 10 * 86400000,
      demo: true,
    }],
    tips: { customerHome: false, techJobs: false, ...(state.tips || {}) },
    techOnline: true,
    summary: {
      pending: DEMO_CODES.pending,
      onway: DEMO_CODES.onway,
      quoted: DEMO_CODES.quoted,
      done: DEMO_CODES.done,
      totals: demoOrders.map((o) => `${o.code}: ${o.status} · ${formatVND(o.finalTotal ?? o.total)}`),
    },
  };
};
