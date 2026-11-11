// Dữ liệu dịch vụ, giá niêm yết, lượt bán và đánh giá trên hệ thống Thợ Minh Đức
export const CATEGORIES = [
  { id: 'may-lanh', label: 'Máy lạnh', icon: 'snowflake' },
  { id: 'may-giat', label: 'Máy giặt/sấy', icon: 'washing-machine' },
  { id: 'tu-lanh', label: 'Tủ lạnh', icon: 'refrigerator' },
  { id: 'nuoc-nong', label: 'Máy nước nóng/Bồn nước', icon: 'shower-head' },
  { id: 'hut-mui', label: 'Máy hút mùi/khói', icon: 'air-vent' },
  { id: 'quat', label: 'Quạt điều hòa/nước', icon: 'fan' },
  { id: 'loc-khong-khi', label: 'Máy lọc không khí', icon: 'wind' },
];

export const SERVICES = [
  // Máy lạnh
  { id: 'vs-ml-1', dbId: 80, category: 'may-lanh', name: 'Vệ sinh máy lạnh từ 1-2.5 HP', price: 180000, oldPrice: 200000, rating: 5, sold: 'Đã bán 631,7k', reviews: 16732, icon: 'snowflake', warranty: 'BH 60 ngày' },
  { id: 'vs-ml-am-tran', dbId: 82, category: 'may-lanh', name: 'Vệ sinh Máy lạnh Âm Trần', price: 480000, oldPrice: 600000, rating: 5, sold: 'Đã bán 230', icon: 'air-vent', warranty: 'BH 60 ngày' },
  { id: 'gas-410-1hp', dbId: 81, category: 'may-lanh', name: 'Sạc gas R410 - R32 (Inverter) máy lạnh 1HP...', price: 400000, rating: 0, sold: 'Đã bán 104', icon: 'gauge', warranty: 'BH 60 ngày' },
  { id: 'vs-ml-tu-dung', dbId: 82, category: 'may-lanh', name: 'Vệ sinh Máy lạnh Tủ Đứng', price: 480000, oldPrice: 600000, rating: 5, sold: 'Đã bán 20', icon: 'server', warranty: 'BH 60 ngày' },
  { id: 'gas-410-2hp', dbId: 81, category: 'may-lanh', name: 'Sạc gas R410 - R32 (Inverter) máy lạnh 2H...', price: 400000, rating: 0, sold: 'Đã bán 10', icon: 'gauge', warranty: 'BH 60 ngày' },
  { id: 'gas-r22-1hp', dbId: 81, category: 'may-lanh', name: 'Sạc gas R22 (Mono) máy lạnh 1-1.5 HP', price: 400000, rating: 0, sold: 'Đã bán 8', icon: 'gauge', warranty: 'BH 60 ngày' },
  { id: 'vs-ml-chuyen-sau', dbId: 80, category: 'may-lanh', name: 'Vệ sinh chuyên sâu máy lạnh treo tường 1-2,5 HP', price: 180000, oldPrice: 250000, rating: 0, sold: '', icon: 'snowflake', warranty: 'BH 60 ngày' },
  { id: 'gas-r22-2hp', dbId: 81, category: 'may-lanh', name: 'Sạc gas R22 (Mono) máy lạnh 2HP-2.5HP', price: 400000, rating: 0, sold: '', icon: 'gauge', warranty: 'BH 60 ngày' },
  // Máy giặt
  { id: 'vs-mg-tren', dbId: 91, category: 'may-giat', name: 'Dịch Vụ Vệ Sinh Máy Giặt Cửa Trên', price: 300000, oldPrice: 350000, rating: 5, sold: 'Đã bán 8,3k', icon: 'washing-machine', warranty: 'BH 60 ngày' },
  { id: 'vs-mg-truoc', dbId: 91, category: 'may-giat', name: 'Dịch Vụ Vệ Sinh Máy Giặt Cửa Trước', price: 300000, oldPrice: 350000, rating: 5, sold: 'Đã bán 7,1k', icon: 'washing-machine', warranty: 'BH 60 ngày' },
  { id: 'vs-mg-quan-ao', dbId: 91, category: 'may-giat', name: 'Dịch Vụ Vệ Sinh Máy Giặt Quần Áo', price: 300000, oldPrice: 350000, rating: 4.9, sold: 'Đã bán 185', icon: 'shirt', warranty: 'BH 60 ngày' },
  // Tủ lạnh
  { id: 'vs-tl-300', dbId: 86, category: 'tu-lanh', name: 'Vệ sinh Tủ lạnh ≤ 300 lít', price: 200000, oldPrice: 250000, rating: 0, sold: 'Đã bán 66', icon: 'refrigerator', warranty: 'BH 60 ngày' },
  { id: 'vs-tl-side', dbId: 86, category: 'tu-lanh', name: 'Vệ sinh Tủ lạnh side-by-side', price: 200000, oldPrice: 250000, rating: 0, sold: 'Đã bán 29', icon: 'refrigerator', warranty: 'BH 60 ngày' },
  { id: 'vs-tl-tren300', dbId: 86, category: 'tu-lanh', name: 'Vệ sinh Tủ lạnh > 300 lít', price: 200000, oldPrice: 250000, rating: 0, sold: 'Đã bán 23', icon: 'refrigerator', warranty: 'BH 60 ngày' },
  // Nước nóng / Bồn nước
  { id: 'vs-bnn', dbId: 112, category: 'nuoc-nong', name: 'Vệ sinh Bình nước nóng', price: 200000, rating: 0, sold: 'Đã bán 106', icon: 'shower-head', warranty: 'BH 60 ngày' },
  { id: 'vs-nlmt-300', dbId: 112, category: 'nuoc-nong', name: 'Vệ sinh Bình năng lượng mặt trời ≤ 300 lít', price: 200000, rating: 0, sold: 'Đã bán 26', icon: 'sun', warranty: 'BH 60 ngày' },
  { id: 'vs-nlmt-tren300', dbId: 112, category: 'nuoc-nong', name: 'Vệ sinh Bình năng lượng mặt trời > 300 lít', price: 200000, rating: 0, sold: 'Đã bán 2', icon: 'sun', warranty: 'BH 60 ngày' },
  { id: 'vs-bon-2500', dbId: 112, category: 'nuoc-nong', name: 'Vệ sinh bồn nước từ 2500 đến 5000 lít', price: 200000, rating: 0, sold: '', icon: 'droplets', warranty: 'BH 60 ngày' },
  { id: 'vs-bon-duoi', dbId: 112, category: 'nuoc-nong', name: 'Vệ sinh bồn nước dưới 2500 lít', price: 200000, rating: 0, sold: '', icon: 'droplets', warranty: 'BH 60 ngày' },
  // Hút mùi
  { id: 'vs-hut-mui', dbId: 98, category: 'hut-mui', name: 'Vệ sinh Máy hút mùi', price: 200000, rating: 0, sold: 'Đã bán 29', icon: 'air-vent', warranty: 'BH 60 ngày' },
  // Quạt
  { id: 'vs-quat-dh', dbId: 103, category: 'quat', name: 'Vệ sinh Quạt điều hòa', price: 100000, oldPrice: 120000, rating: 5, sold: 'Đã bán 329', icon: 'fan', warranty: 'BH 60 ngày' },
  { id: 'vs-quat-dung', dbId: 103, category: 'quat', name: 'Vệ sinh Quạt đứng/treo tường', price: 100000, rating: 0, sold: 'Đã bán 184', icon: 'fan', warranty: 'BH 60 ngày' },
  // Lọc không khí
  { id: 'vs-loc-kk', dbId: 109, category: 'loc-khong-khi', name: 'Vệ sinh Máy lọc không khí', price: 120000, rating: 0, sold: 'Đã bán 16', icon: 'wind', warranty: 'BH 60 ngày' },
];

export const COMMITMENTS = [
  {
    title: 'Đúng giờ',
    sub: 'Thợ đúng khung giờ đã hẹn trên app',
    detail: 'Thợ cam kết đến đúng khung giờ. Trễ 21–45 phút: giảm 20% phí nhân công (tối đa 100.000đ). Trễ trên 45 phút: giảm 50% phí nhân công (tối đa 200.000đ). Dưới 10 phút được coi là đúng giờ.',
  },
  {
    title: 'Tay nghề giỏi',
    sub: '100% Thợ được tuyển chọn',
    detail: 'Thợ Minh Đức cam kết thợ có tay nghề chuyên môn cao mang đến cho Quý Khách dịch vụ chất lượng tốt và thẩm mỹ. Nếu Quý Khách không hài lòng về tay nghề của kỹ thuật viên Minh Đức, chúng tôi sẽ cử quản lý kỹ thuật viên làm lại hoàn toàn miễn phí cho Quý Khách như một lời xin lỗi chân thành và sẽ đưa nhân viên vào quy trình kèm cặp/huấn luyện nâng cao tay nghề.',
  },
  {
    title: 'Trung thực',
    sub: 'Báo giá rõ ràng trên app trước khi thực hiện',
    detail: 'Thợ Minh Đức cam kết thợ trung thực và nghiêm túc. Nếu Minh Đức phát hiện bất kỳ gian lận nào của kỹ thuật viên chung, Thợ Minh Đức sẽ bồi thường 2 lần giá trị gian lận của Quý Khách.',
  },
  {
    title: 'Thân thiện & Vui vẻ',
    sub: 'Không tư vấn thêm dịch vụ hay linh kiện không cần thiết',
    detail: 'Được phục vụ Quý Khách là một vinh dự lớn với Thợ Minh Đức và Thợ Minh Đức luôn trân trọng. Thợ Minh Đức cam kết mang đến cho Quý Khách dịch vụ thân thiện và vui vẻ. Nhân viên chỉ nhận thanh toán đúng số tiền trên đơn hàng. Nhân viên sẽ không được xin hoặc gợi ý tiền bồi dưỡng của Quý Khách. Nếu Quý Khách cảm thấy không hài lòng với thái độ, hành vi xin tiền bồi dưỡng của nhân viên, xin vui lòng phản ánh cho Thợ Minh Đức để chúng tôi chấn chỉnh.',
  },
];

export const PROCESS_STEPS = [
  { title: 'Bước 1: Kiểm tra trước vệ sinh', items: ['Ghi nhận tình trạng', 'Chỉ số tốc độ gió', 'Chỉ số nhiệt độ'] },
  { title: 'Bước 2: Vệ sinh dàn lạnh', items: ['Bật nắp trước máy và chụp hình'] },
  { title: 'Bước 3: Vệ sinh dàn nóng', items: ['Xịt rửa cánh quạt, các góc cạnh, mặt sau'] },
  { title: 'Bước 4: Kiểm tra sau vệ sinh', items: ['Khối lượng ga nạp', 'Kết nối đồng hồ đo gas và chụp hình', 'Đo dòng điện của máy', 'Chỉ số tốc độ gió', 'Chỉ số nhiệt độ'] },
  { title: 'Bước 5: Vệ sinh khu vực', items: ['Dọn dẹp toàn bộ khu vực vệ sinh cho khách hàng'] },
  { title: 'Bước 6: Nghiệm thu và bàn giao cho khách', items: ['Điểm sao đúng hẹn', 'Điểm sao sạch sẽ', 'Điểm sao thân thiện vui vẻ', 'Điểm sao chất lượng'] },
];

export const formatVND = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

export const formatNumberInput = (val) => {
  if (val == null) return '';
  const clean = String(val).replace(/[^0-9]/g, '');
  if (!clean) return '';
  const normalized = clean.replace(/^0+(?=\d)/, '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const serviceKind = (item) => {
  const id = item?.id || '';
  if (id.startsWith('ld-')) return 'install';
  if (id.startsWith('sc-')) return 'repair';
  if (id.startsWith('td-')) return 'lifetime';
  if (id.startsWith('gas-')) return 'gas';
  return 'clean';
};

export const isEstimate = (item) => ['install', 'repair', 'lifetime'].includes(serviceKind(item));

const CLEAN_STEPS = {
  'may-giat': [
    { title: 'Kiểm tra máy trước khi vệ sinh', items: ['Ghi nhận tình trạng lồng giặt và cửa', 'Chụp hình vị trí máy'] },
    { title: 'Vệ sinh lồng giặt và gioăng cửa', items: ['Tháo khay bột, ngâm và chà cặn', 'Vệ sinh gioăng cao su'] },
    { title: 'Vệ sinh bộ lọc và hộp bột', items: ['Rửa lưới lọc', 'Lau khô bộ phận tháo ra'] },
    { title: 'Chạy thử và bàn giao', items: ['Chạy không tải kiểm tra rung', 'Dọn khu vực và nghiệm thu'] },
  ],
  'tu-lanh': [
    { title: 'Kiểm tra trước vệ sinh', items: ['Ghi nhận nhiệt độ ngăn mát và ngăn đá', 'Chụp hình lượng đá, cặn'] },
    { title: 'Vệ sinh ngăn mát và ngăn đá', items: ['Lau khay, gioăng cửa', 'Thông lỗ thoát nước'] },
    { title: 'Vệ sinh dàn nóng', items: ['Hút bụi mặt sau và quạt tản nhiệt'] },
    { title: 'Kiểm tra sau vệ sinh và bàn giao', items: ['Đo lại nhiệt độ', 'Dọn khu vực và nghiệm thu'] },
  ],
};

const KIND_STEPS = {
  clean: [
    { title: 'Kiểm tra trước khi làm', items: ['Ghi nhận tình trạng thiết bị', 'Chụp hình khu vực làm việc'] },
    { title: 'Vệ sinh các bộ phận chính', items: ['Tháo bộ phận dễ tháo, ngâm và chà', 'Xịt rửa đúng kỹ thuật'] },
    { title: 'Lắp lại và kiểm tra', items: ['Lắp đúng vị trí ban đầu', 'Chạy thử thiết bị'] },
    { title: 'Dọn khu vực và bàn giao', items: ['Lau khô sàn', 'Nghiệm thu với khách'] },
  ],
  gas: [
    { title: 'Kiểm tra áp suất và rò rỉ', items: ['Đo gas hiện có', 'Kiểm tra mối nối'] },
    { title: 'Hút chân không nếu cần', items: ['Xả gas cũ khi hệ thống không kín'] },
    { title: 'Nạp gas đúng chủng loại', items: ['Nạp theo tải máy', 'Đo dòng điện và nhiệt độ gió'] },
    { title: 'Bàn giao', items: ['Giải thích lượng gas đã nạp', 'Dọn khu vực'] },
  ],
  install: [
    { title: 'Khảo sát vị trí lắp', items: ['Đo khoảng cách dàn nóng và dàn lạnh', 'Xác nhận vật tư phát sinh'] },
    { title: 'Lắp đặt thiết bị', items: ['Đục lỗ, đi ống hoặc định vị máy', 'Cố định chắc chắn'] },
    { title: 'Chạy thử', items: ['Kiểm tra rò rỉ, rung, thoát nước', 'Đo thông số vận hành'] },
    { title: 'Bàn giao và dọn khu vực', items: ['Hướng dẫn sử dụng', 'Chốt giá cuối sau khảo sát'] },
  ],
  repair: [
    { title: 'Chẩn đoán lỗi', items: ['Nghe mô tả và kiểm tra thực tế', 'Xác định nguyên nhân'] },
    { title: 'Báo giá trước khi sửa', items: ['Nêu rõ nhân công và linh kiện', 'Chỉ làm khi khách đồng ý'] },
    { title: 'Sửa và chạy thử', items: ['Thay hoặc chỉnh bộ phận lỗi', 'Kiểm tra máy chạy ổn'] },
    { title: 'Bàn giao', items: ['Giải thích việc đã làm', 'Ghi nhận bảo hành phần đã sửa'] },
  ],
  lifetime: [
    { title: 'Ghi nhận thiết bị vào gói', items: ['Loại máy, hãng, công suất', 'Lịch sử bảo dưỡng nếu có'] },
    { title: 'Bảo dưỡng lần này', items: ['Làm theo quy trình vệ sinh của loại máy', 'Ghi chỉ số trước và sau'] },
    { title: 'Hẹn kỳ tiếp theo', items: ['Thống nhất mốc nhắc lịch', 'Gửi biên bản cho khách'] },
  ],
};

export const stepsFor = (item) => {
  const kind = serviceKind(item);
  if (kind === 'clean') return CLEAN_STEPS[item?.category] || KIND_STEPS.clean;
  return KIND_STEPS[kind] || KIND_STEPS.clean;
};

export const featureFor = (item) => {
  const kind = serviceKind(item);
  const name = item?.name || 'Dịch vụ';
  if (kind === 'install') return `${name}.\n\nThợ khảo sát tại nhà trước khi lắp. Giá trên app là giá tham khảo cho nhân công cơ bản, chưa gồm vật tư phát sinh như ống đồng, giá đỡ hay khoan tường. Thợ báo giá cuối và chỉ làm khi bạn đồng ý.`;
  if (kind === 'repair') return `${name}.\n\nPhí hiển thị là phí kiểm tra. Linh kiện hỏng được báo riêng trước khi thay. Thợ không sửa nếu bạn chưa xác nhận giá.`;
  if (kind === 'lifetime') return `${name}.\n\nGiá gói là mức tham khảo cho một chu kỳ bảo dưỡng định kỳ. Lịch các lần sau được hẹn sau lần đầu. Vật tư thay thế tính riêng.`;
  if (kind === 'gas') return `${name}.\n\nGiá gồm công nạp gas đúng chủng loại máy. Nếu hệ thống thủng hoặc hết gas do rò rỉ, thợ báo phát sinh trước khi xử lý. Sau khi nạp, thợ đo nhiệt độ gió và dòng điện.`;
  if (item?.category === 'may-giat') return `${name}.\n\nVệ sinh lồng giặt, gioăng cửa, khay bột và lưới lọc. Giá gồm nhân công, chưa gồm hóa chất đặc biệt nếu máy bám cặn nặng. Thợ chạy thử không tải trước khi bàn giao.`;
  if (item?.category === 'tu-lanh') return `${name}.\n\nVệ sinh ngăn mát, ngăn đá, gioăng và dàn nóng. Giá gồm nhân công. Nếu máy không lạnh do hết gas hoặc hỏng block, đó là việc sửa chữa và được báo giá riêng.`;
  if (item?.category === 'may-lanh') return `${name}.\n\nGiúp máy lạnh sạch sâu, mát nhanh và vận hành ổn định hơn. Phù hợp với gia đình, căn hộ, văn phòng và cửa hàng.\n\nVệ sinh đúng kỹ thuật: dàn lạnh, lưới lọc và dàn nóng theo điều kiện thực tế. Kiểm tra máy trước và sau khi làm, rồi bàn giao.\n\nGiá gồm nhân công vệ sinh, chưa gồm vật tư hoặc gas phát sinh. Thợ kiểm tra thực tế tại nhà.`;
  return `${name}.\n\nGiá gồm nhân công thực hiện tại nhà. Vật tư hoặc lỗi phát sinh được báo trước khi làm thêm. Thợ dọn khu vực và nghiệm thu trước khi kết thúc.`;
};

export const videoFor = (item) => {
  if (!item) return null;
  const kind = serviceKind(item);
  const cat = catLabel(item.category).toLowerCase();
  if (kind === 'install') {
    return {
      title: `Quy trình khảo sát & lắp đặt ${cat}`,
      sub: 'Tiêu chuẩn kỹ thuật Thợ Minh Đức · 4 bước an toàn',
      duration: '45 – 90 phút',
      tools: ['Máy khoan chuyên dụng', 'Thước thủy cân bằng', 'Đồng hồ đo áp suất & dòng điện', 'Bộ dụng cụ bảo hộ & bạt che bụi'],
    };
  }
  if (kind === 'repair') {
    return {
      title: `Quy trình kiểm tra & chẩn đoán ${cat}`,
      sub: 'Báo giá minh bạch trước khi sửa · Linh kiện chính hãng',
      duration: '30 – 60 phút',
      tools: ['Đồng hồ vạn năng đo điện', 'Thiết bị đo nhiệt độ & áp suất', 'Bộ dụng cụ tháo lắp chuyên dụng', 'Tem bảo hành điện tử Minh Đức'],
    };
  }
  if (kind === 'gas') {
    return {
      title: 'Quy trình kiểm tra rò rỉ & nạp gas máy lạnh',
      sub: 'Đo áp suất chuẩn hãng · Bảo hành 60 ngày',
      duration: '30 – 45 phút',
      tools: ['Đồng hồ đo áp suất gas đôi', 'Máy hút chân không chuyên dụng', 'Bình gas chính hãng R32/R410A/R22', 'Ampe kìm & máy đo nhiệt độ gió'],
    };
  }
  return {
    title: `Quy trình vệ sinh & bảo dưỡng ${cat} tại nhà`,
    sub: 'Sạch sâu đúng kỹ thuật · Dọn dẹp gọn gàng · BH 60 ngày',
    duration: durationText(item.id),
    tools: ['Máy xịt rửa áp lực có chỉnh áp', 'Áo trùm hứng nước bẩn chuyên dụng', 'Dung dịch khử khuẩn an toàn', 'Đồng hồ đo dòng điện & nhiệt độ gió'],
  };
};

export const REVIEWS_BY_ID = {
  'vs-ml-1': [
    { name: 'Chị Vân', date: '10/04/2026' },
    { name: 'Đỗ Minh Châu', date: '10/04/2026' },
  ],
};

export const noteFor = (items) => {
  const kinds = [...new Set((items || []).map((it) => serviceKind(it.service)))];
  if (kinds.length !== 1) return '';
  if (kinds[0] === 'clean') return 'Tôi muốn vệ sinh';
  if (kinds[0] === 'repair') return 'Máy đang gặp sự cố, cần thợ kiểm tra sửa chữa';
  if (kinds[0] === 'gas') return 'Máy lạnh yếu lạnh, cần kiểm tra gas';
  if (kinds[0] === 'lifetime') return 'Tôi muốn đăng ký bảo dưỡng định kỳ';
  return '';
};

// Bảng giá dịch vụ sửa chữa & bảo dưỡng định kỳ chính hãng Thợ Minh Đức (Hệ thống không cung cấp lắp đặt mới).
export const INSTALL_SERVICES = [];
export const REPAIR_SERVICES = [
  { id: 'sc-ml', dbId: 79, category: 'may-lanh', name: 'Sửa chữa điều hòa / máy lạnh', price: 250000, rating: 0, sold: '', icon: 'snowflake', warranty: 'BH 60 ngày' },
  { id: 'sc-mg', dbId: 89, category: 'may-giat', name: 'Sửa chữa máy giặt', price: 250000, rating: 0, sold: '', icon: 'washing-machine', warranty: 'BH 60 ngày' },
  { id: 'sc-tl', dbId: 84, category: 'tu-lanh', name: 'Sửa chữa tủ lạnh', price: 250000, rating: 0, sold: '', icon: 'refrigerator', warranty: 'BH 60 ngày' },
  { id: 'sc-bnn', dbId: 111, category: 'nuoc-nong', name: 'Sửa chữa bình nóng lạnh', price: 250000, rating: 0, sold: '', icon: 'shower-head', warranty: 'BH 60 ngày' },
  { id: 'sc-dien', dbId: 116, category: 'all', name: 'Kiểm tra, xử lý sự cố điện', price: 150000, rating: 0, sold: '', icon: 'zap', warranty: 'BH 60 ngày' },
  { id: 'sc-tv', dbId: 122, category: 'all', name: 'Sửa chữa tivi', price: 300000, rating: 0, sold: '', icon: 'tv', warranty: 'BH 60 ngày' },
];
export const LIFETIME_SERVICES = [
  { id: 'td-ml', dbId: 80, category: 'may-lanh', name: 'Gói bảo dưỡng trọn đời máy lạnh treo tường', price: 1200000, rating: 0, sold: '', icon: 'snowflake', warranty: 'BH 60 ngày' },
  { id: 'td-mg', dbId: 91, category: 'may-giat', name: 'Gói bảo dưỡng trọn đời máy giặt', price: 900000, rating: 0, sold: '', icon: 'washing-machine', warranty: 'BH 60 ngày' },
];
export const AREAS = [
  'An Khánh, Hà Nội', 'Hoài Đức, Hà Nội', 'Cầu Giấy, Hà Nội', 'Nam Từ Liêm, Hà Nội',
  'Thanh Xuân, Hà Nội', 'Quận 1, TP. Hồ Chí Minh', 'Quận 3, TP. Hồ Chí Minh', 'Thủ Đức, TP. Hồ Chí Minh',
];
export const TIME_SLOTS = ['08h00 - 10h00', '10h00 - 12h00', '12h00 - 14h00', '14h00 - 16h00', '16h00 - 18h00', '18h00 - 20h00'];
export const VOUCHERS = [
  { code: 'THO20', label: 'Giảm 20.000đ cho đơn từ 150.000đ', discount: 20000, min: 150000 },
  { code: 'MINHDUC10', label: 'Giảm 10% tối đa 50.000đ', percent: 10, max: 50000 },
];
export const imgFor = (id) => `https://picsum.photos/seed/${id}/400/300`;


// ---------------------------------------------------------------------------
// Dữ liệu dùng chung cho bản giao diện mới (liên kết giữa các chức năng)
// ---------------------------------------------------------------------------
export const ALL_SERVICES = [...SERVICES, ...REPAIR_SERVICES, ...LIFETIME_SERVICES];
const SERVICE_MAP = Object.fromEntries(ALL_SERVICES.map((s) => [s.id, s]));
const SERVICE_BY_DB_ID = Object.fromEntries(ALL_SERVICES.map((s) => [String(s.dbId), s]));

export const getService = (id) => {
  if (id == null) return undefined;
  return SERVICE_MAP[id] || SERVICE_BY_DB_ID[String(id)];
};

export const CAT_SHORT = {
  'may-lanh': 'Máy lạnh',
  'may-giat': 'Máy giặt',
  'tu-lanh': 'Tủ lạnh',
  'nuoc-nong': 'Nước nóng',
  'hut-mui': 'Hút mùi',
  quat: 'Quạt',
  'loc-khong-khi': 'Lọc khí',
};
export const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || CAT_SHORT[id] || 'Thiết bị';
export const catIcon = (id) => CATEGORIES.find((c) => c.id === id)?.icon || 'wrench';

// Chu kỳ bảo dưỡng khuyến nghị (tháng) theo loại thiết bị — dùng để nhắc lịch ở tab Thiết bị / Trang chủ
export const MAINT_MONTHS = {
  'may-lanh': 6, 'may-giat': 6, 'tu-lanh': 6, 'nuoc-nong': 12, 'hut-mui': 6, quat: 12, 'loc-khong-khi': 6,
};

export const SERVICE_TYPES = [
  { id: 'bao-duong', label: 'Bảo dưỡng', icon: 'spray-can', desc: 'Vệ sinh định kỳ' },
  { id: 'sua-chua', label: 'Sửa chữa', icon: 'wrench', desc: 'Báo giá trước' },
  { id: 'bao-hanh', label: 'Bảo hành', icon: 'shield-check', desc: 'Tra cứu 60 ngày' },
  { id: 'tron-doi', label: 'Trọn đời', icon: 'infinity', desc: 'Gói định kỳ' },
];

export const TIPS = [
  {
    id: 'tip-1', title: '5 cách dùng tủ lạnh giúp tăng tuổi thọ máy', views: '10,2K lượt xem', icon: 'refrigerator', category: 'tu-lanh', serviceId: 'vs-tl-300',
    body: '1. Không để thức ăn còn nóng vào tủ.\n2. Đặt tủ cách tường ít nhất 10 cm để dàn nóng tản nhiệt.\n3. Không chất đầy quá 3/4 dung tích.\n4. Kiểm tra gioăng cửa định kỳ, gioăng hở làm tủ chạy liên tục.\n5. Vệ sinh tủ 6 tháng/lần để khử mùi và giữ dàn lạnh sạch.',
  },
  {
    id: 'tip-2', title: 'Máy lạnh kém mát? 3 dấu hiệu cần vệ sinh ngay', views: '8,4K lượt xem', icon: 'snowflake', category: 'may-lanh', serviceId: 'vs-ml-1',
    body: '• Gió thổi ra yếu hoặc có mùi hôi.\n• Dàn lạnh chảy nước, đọng sương.\n• Tiền điện tăng bất thường dù dùng như cũ.\n\nNếu gặp một trong các dấu hiệu trên, hãy đặt lịch vệ sinh để máy mát nhanh và tiết kiệm điện hơn.',
  },
  {
    id: 'tip-3', title: 'Vì sao máy giặt có mùi hôi và cách xử lý', views: '6,1K lượt xem', icon: 'washing-machine', category: 'may-giat', serviceId: 'vs-mg-tren',
    body: 'Cặn bột giặt và nước tồn đọng trong lồng là nơi vi khuẩn phát triển. Hãy mở cửa máy sau khi giặt, vệ sinh khay bột hàng tháng và vệ sinh lồng giặt chuyên sâu 6 tháng/lần.',
  },
];

export const FAQ = [
  { q: 'Thợ có đến đúng giờ không?', a: 'Cam kết đúng khung giờ. Trễ 21–45 phút: giảm 20% phí nhân công (tối đa 100.000đ). Trễ trên 45 phút: giảm 50% (tối đa 200.000đ). Trễ ≤10 phút không bị trừ. Thợ đến muộn còn bị trừ điểm uy tín.' },
  { q: 'Tôi có thể huỷ hoặc đổi lịch không?', a: 'Khi đơn còn chờ thợ nhận, vào Chi tiết đơn → "Sửa yêu cầu" để đổi ngày/giờ, mô tả và ảnh. Huỷ miễn phí khi thợ chưa bắt đầu di chuyển (chờ nhận / đã nhận). Sau khi thợ đang đến thì không huỷ trên app — gọi hotline.' },
  { q: 'Bảo hành 60 ngày được tính thế nào?', a: 'Bảo hành bắt đầu từ lúc đơn hoàn thành. Vào Dịch vụ › Bảo hành hoặc Chi tiết đơn hàng để tra cứu và gửi yêu cầu bảo hành miễn phí.' },
  { q: 'Điểm tích luỹ dùng để làm gì?', a: 'Mỗi 10.000đ thanh toán = 1 điểm, đánh giá đơn hàng được thêm 20 điểm. Dùng điểm để đổi voucher ở mục Quyền lợi của tôi.' },
  { q: 'Phương thức thanh toán nào được hỗ trợ?', a: 'Quý khách có thể thanh toán bằng Chuyển khoản VietQR (MBBank) hoặc Tiền mặt trực tiếp cho thợ sau khi hoàn thành nghiệm thu.' },
];

// Đổi điểm lấy voucher (Quyền lợi của tôi) — voucher đổi được sẽ hiện ở bước Thanh toán
export const REDEEM_OPTIONS = [
  { id: 'r-20k', cost: 100, title: 'Voucher giảm 20.000đ', voucher: { prefix: 'DIEM20K', label: 'Giảm 20.000đ (đổi điểm)', discount: 20000 } },
  { id: 'r-50k', cost: 250, title: 'Voucher giảm 50.000đ', voucher: { prefix: 'DIEM50K', label: 'Giảm 50.000đ (đổi điểm)', discount: 50000 } },
  { id: 'r-15p', cost: 500, title: 'Voucher giảm 15% tối đa 100.000đ', voucher: { prefix: 'DIEM15', label: 'Giảm 15% tối đa 100.000đ (đổi điểm)', percent: 15, max: 100000 } },
];

export const TIERS = [
  {
    id: 'member',
    label: 'Thành viên',
    min: 0,
    color: '#64748B',
    bg: '#F1F5F9',
    summary: 'Quyền lợi tiêu chuẩn bảo vệ khách hàng ngay từ đơn đầu tiên',
    condition: 'Đăng ký tài khoản miễn phí trên ứng dụng Thợ Minh Đức (từ 0 điểm tích luỹ).',
    pointRule: '10.000đ thanh toán = 1 điểm · Đánh giá đơn = +20 điểm',
    warrantyDays: 60,
    partDiscountPercent: 0,
    benefits: [
      '🎁 Tặng ngay mã giảm 10% (MINHDUC10) cho đơn đặt lịch đầu tiên',
      '💰 Tích luỹ 1 điểm cho mỗi 10.000đ thanh toán dịch vụ hoàn tất',
      '⭐ Thưởng thêm +20 điểm mỗi khi gửi đánh giá chất lượng thợ sau nghiệm thu',
      '🛡️ Bảo hành tiêu chuẩn 60 ngày cho dịch vụ vệ sinh, nạp gas & sửa chữa',
      '🔍 Khảo sát & báo giá minh bạch tại nhà — từ chối báo giá hoàn toàn miễn phí',
    ],
    terms: [
      'Cam kết đúng giờ: Tự động giảm 20%–50% phí nhân công (tối đa 200.000đ) nếu thợ check-in trễ giờ hẹn.',
      'Linh hoạt tuyệt đối: Miễn phí 100% khi sửa yêu cầu, đổi lịch hẹn hoặc huỷ đơn trước khi thợ di chuyển.',
      'Điểm tích luỹ xếp hạng được cộng dồn trọn đời, không bị trừ khi bạn dùng điểm đổi voucher.',
    ],
  },
  {
    id: 'silver',
    label: 'Bạc',
    min: 200,
    color: '#475569',
    bg: '#E2E8F0',
    summary: 'Ưu tiên điều phối thợ giỏi & cộng thêm thời hạn bảo hành tận nhà',
    condition: 'Đạt từ 200 điểm tích luỹ trọn đời (tương đương ~2.000.000đ chi tiêu tích luỹ hoặc hoàn thành đơn kèm đánh giá).',
    pointRule: 'Giữ hạng trọn đời · Không hạ hạng khi đổi điểm lấy voucher',
    warrantyDays: 75,
    partDiscountPercent: 0,
    benefits: [
      '⚡ Ưu tiên điều phối thợ tay nghề cao (★ 4.8+) trong khu vực gần nhà bạn nhất',
      '🛡️ Cộng thêm +15 ngày bảo hành miễn phí (nâng tổng bảo hành lên 75 ngày)',
      '🎟️ Mở khoá đổi điểm lấy Voucher giảm trực tiếp 20.000đ – 50.000đ không giới hạn dịch vụ',
      '🔔 Nhắc lịch bảo dưỡng thiết bị định kỳ kèm mã ưu đãi riêng theo mùa',
      '🔄 Miễn phí 100% chi phí kiểm tra lại tận nơi nếu thiết bị phát sinh lỗi trong thời gian bảo hành',
    ],
    terms: [
      'Bảo toàn thứ hạng: Hạng Bạc được tính theo tổng điểm tích luỹ trọn đời, việc đổi điểm lấy voucher không làm giảm hạng.',
      'Bảo vệ lịch hẹn: Nếu thợ gặp sự cố đột xuất phải trả việc, hệ thống lập tức điều phối thợ ưu tiên mới kèm tặng bạn Voucher xin lỗi.',
      'Quyền yêu cầu báo giá lại: Khách có quyền yêu cầu thợ điều chỉnh phương án/vật tư ngay trên app mà không mất phí.',
    ],
  },
  {
    id: 'gold',
    label: 'Vàng',
    min: 500,
    color: '#D69E00',
    bg: '#FEF3C7',
    summary: 'Đặc quyền giảm giá linh kiện chính hãng & bảo hành mở rộng 90 ngày',
    condition: 'Đạt từ 500 điểm tích luỹ trọn đời trên hệ thống Thợ Minh Đức.',
    pointRule: 'Ưu tiên ghép lịch giờ cao điểm · Bảo hành 90 ngày',
    warrantyDays: 90,
    partDiscountPercent: 5,
    benefits: [
      '💎 Mở khoá đổi Voucher VIP giảm 15% (tối đa 100.000đ) áp dụng cho mọi đơn hàng',
      '🔩 Ưu đãi giảm 5% chi phí vật tư & linh kiện thay thế chính hãng trên bảng báo giá',
      '🛡️ Nâng thời hạn bảo hành tận nhà lên 90 ngày (3 tháng) cho toàn bộ hạng mục thực hiện',
      '🚀 Ưu tiên giữ chỗ khung giờ cao điểm (cuối tuần, ngày lễ, mùa nắng nóng cao điểm)',
      '🧰 Miễn phí kiểm tra tổng quát thêm 01 thiết bị điện máy khác trong cùng lần thợ đến nhà',
    ],
    terms: [
      'Cam kết phản hồi nhanh: Ưu tiên phân công thợ xác nhận lịch hẹn trong vòng 15 phút tại khu vực nội thành.',
      'Bảo vệ giá 100%: Tuyệt đối không phát sinh bất kỳ phụ phí nào ngoài bảng báo giá điện tử đã được bạn phê duyệt trên ứng dụng.',
      'Hỗ trợ kỹ thuật tận nhà: Kiểm tra vận hành thiết bị và hỗ trợ bảo hành tận nơi hoàn toàn miễn phí.',
    ],
  },
  {
    id: 'diamond',
    label: 'Kim cương',
    min: 1000,
    color: '#2563EB',
    bg: '#DBEAFE',
    summary: 'Chăm sóc đặc quyền VIP, bảo hành 120 ngày & Thợ Trưởng phụ trách',
    condition: 'Đạt từ 1.000 điểm tích luỹ trọn đời — Hạng thành viên danh giá nhất của Thợ Minh Đức.',
    pointRule: 'Đặc quyền trọn đời · Thợ Trưởng ★ 4.9+ · Bảo hành 120 ngày',
    warrantyDays: 120,
    partDiscountPercent: 10,
    benefits: [
      '👑 Chỉ định ưu tiên Thợ Trưởng (Master Technician ★ 4.9–5.0) cho mọi đơn đặt lịch',
      '🛡️ Đặc quyền Bảo hành Kim Cương lên tới 120 ngày (4 tháng) — xử lý bảo hành khẩn cấp trong 2 giờ',
      '🔩 Giảm 10% chi phí vật tư, linh kiện chính hãng & miễn phí 100% công khảo sát mọi hạng mục',
      '🧹 Tặng 01 suất kiểm tra an toàn điện & vệ sinh lưới lọc máy lạnh định kỳ mỗi năm',
      '📞 Đường dây nóng CSKH VIP ưu tiên hỗ trợ 24/7 và giải quyết yêu cầu tức thì',
    ],
    terms: [
      'Duy trì hạng Vĩnh Viễn: Quyền lợi Kim Cương được bảo lưu trọn đời trên tài khoản số điện thoại của khách hàng.',
      'Cam kết hài lòng 100%: Hỗ trợ cử Thợ Trưởng kiểm tra và xử lý lại hoàn toàn miễn phí trong 48 giờ nếu bạn chưa hài lòng khi nghiệm thu.',
      'Ưu tiên bồi thường cao nhất: Nhân đôi giá trị Voucher đền bù nếu xảy ra bất kỳ sự cố trễ hẹn hoặc đổi lịch nào từ phía kỹ thuật.',
    ],
  },
];
export const tierOf = (lifetimePoints) => {
  let cur = TIERS[0];
  TIERS.forEach((t) => { if (lifetimePoints >= t.min) cur = t; });
  const next = TIERS[TIERS.indexOf(cur) + 1] || null;
  return { cur, next };
};

export const ORDER_STEPS = [
  { key: 'pending', label: 'Đã đặt lịch', desc: 'Đơn đã gửi, chờ điều phối thợ' },
  { key: 'confirmed', label: 'Thợ đã nhận đơn', desc: 'Thợ sẽ gọi cho bạn trước khi đến' },
  { key: 'onway', label: 'Thợ đang đến', desc: 'Thợ đang di chuyển tới địa chỉ của bạn' },
  { key: 'diagnosing', label: 'Kiểm tra thiết bị', desc: 'Thợ kiểm tra và lập chẩn đoán' },
  { key: 'quoted', label: 'Chờ duyệt báo giá', desc: 'Văn phòng đã gửi báo giá, chờ bạn duyệt' },
  { key: 'repairing', label: 'Đang thực hiện', desc: 'Thợ đang sửa chữa / vệ sinh' },
  { key: 'pending_review', label: 'Chờ nghiệm thu', desc: 'Văn phòng Minh Đức đang đối soát biên bản nghiệm thu' },
  { key: 'done', label: 'Hoàn thành', desc: 'Dịch vụ đã hoàn tất và nghiệm thu' },
];
// Timeline thợ gọn hơn (gộp báo giá vào bước kiểm tra)
export const TECH_ORDER_STEPS = ORDER_STEPS.filter((s) => s.key !== 'quoted').map((s) => (
  s.key === 'diagnosing' ? { ...s, label: 'Kiểm tra & báo giá', desc: 'Chẩn đoán và gửi báo giá trước khi làm' } : s
));
export const stepIndexOf = (status) => {
  if (status === 'quoted') return ORDER_STEPS.findIndex((x) => x.key === 'quoted');
  if (status === 'warranty_pending') return 0;
  if (status === 'out_of_warranty') return ORDER_STEPS.findIndex((x) => x.key === 'diagnosing');
  return ORDER_STEPS.findIndex((x) => x.key === status);
};
/** Index bước trên timeline thợ (không có bước quoted riêng) */
export const techStepIndexOf = (status) => {
  if (status === 'quoted') return TECH_ORDER_STEPS.findIndex((x) => x.key === 'diagnosing');
  if (status === 'warranty_pending') return 0;
  if (status === 'out_of_warranty') return TECH_ORDER_STEPS.findIndex((x) => x.key === 'diagnosing');
  const i = TECH_ORDER_STEPS.findIndex((x) => x.key === status);
  return i;
};

export const TECHS = [
  { name: 'Hoàng Văn Thọ', code: 'MD1024', rating: 5.0, jobs: 1250 },
  { name: 'Đặng Quang Minh', code: 'MD2071', rating: 5.0, jobs: 860 },
  { name: 'Lê Quốc Cường', code: 'MD3318', rating: 4.9, jobs: 1520 },
];

export const PAYMENT_METHODS = [
  {
    id: 'vietqr',
    label: 'Chuyển khoản VietQR (MBBank)',
    shortLabel: 'VietQR (MBBank)',
    icon: 'qr-code',
    desc: 'Quét mã QR thanh toán sau nghiệm thu · Kích hoạt bảo hành điện tử 60 ngày tự động',
    badge: 'Khuyên dùng',
    badgeBg: '#ECFDF5',
    badgeFg: '#059669',
    timing: 'Thanh toán sau khi thợ hoàn thành & nghiệm thu',
  },
  {
    id: 'cash',
    label: 'Tiền mặt cho thợ tại nhà',
    shortLabel: 'Tiền mặt tại nhà',
    icon: 'banknote',
    desc: 'Trả tiền mặt trực tiếp cho thợ sau khi kiểm tra thiết bị chạy tốt & ký nghiệm thu',
    badge: 'Phổ biến',
    badgeBg: '#FFFBEB',
    badgeFg: '#D97706',
    timing: 'Thanh toán sau khi thợ hoàn thành & nghiệm thu',
  },
];

export const PAYMENTS = PAYMENT_METHODS.map((p) => p.label);
export const PARTNERS = ['Panasonic', 'SONY', 'LG', 'Samsung', 'Coway', 'SKYWORTH', 'Nagakawa', 'Sumico', 'Electrolux'];
export const HOTLINE = '1900 232 461';
export const POPULAR_SEARCHES = ['Vệ sinh máy lạnh', 'Sạc gas', 'Máy giặt', 'Tủ lạnh', 'Sửa chữa', 'Bình nước nóng'];

// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu
export const normalize = (s) => (s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase();

export const discountOf = (item) => (item?.oldPrice ? Math.round((1 - item.price / item.oldPrice) * 100) : 0);
export const isClean = (item) => /vệ sinh/i.test(item?.name || '');
export const durationText = (id) => (id === 'vs-mg-truoc' ? '90 phút' : '60 phút');

export const voucherDiscount = (voucher, subtotal) => {
  if (!voucher) return 0;
  if (voucher.min && subtotal < voucher.min) return 0;
  if (voucher.discount) return Math.min(voucher.discount, subtotal);
  if (voucher.percent) return Math.min(Math.round((subtotal * voucher.percent) / 100), voucher.max || Infinity);
  return 0;
};

// ---------------------------------------------------------------------------
// PHÍA THỢ (Technician) — Hệ thống điều phối kỹ thuật viên Thợ Minh Đức:
//   Thợ → Hệ thống: chẩn đoán, tiến độ sửa chữa, vật tư sử dụng, ảnh minh chứng, biên bản hoàn thành
//   Hệ thống → Thợ: việc được giao, địa chỉ & liên hệ khách, lịch làm việc, báo giá, thông báo
// ---------------------------------------------------------------------------
export const TECH_ME = {
  name: 'Hoàng Văn Thọ', code: 'MD1024', rating: 5.0, jobs: 1, phone: '0945678901',
  area: 'Cầu Giấy, Nam Từ Liêm, Ba Đình, Hoài Đức', skills: ['Máy lạnh', 'Máy giặt', 'Tủ lạnh', 'Nạp gas'],
};

// Trạng thái đơn đầy đủ (khách ↔ thợ)
export const STATUS_FLOW = ['pending', 'confirmed', 'onway', 'diagnosing', 'quoted', 'repairing', 'pending_review', 'done'];
export const STATUS_DESC = {
  pending: 'Đơn đã gửi, đang chờ thợ nhận',
  confirmed: 'Thợ sẽ gọi cho bạn trước khi đến',
  onway: 'Thợ đang di chuyển tới địa chỉ của bạn',
  diagnosing: 'Thợ đang kiểm tra thiết bị và lập báo giá',
  quoted: 'Văn phòng đã gửi báo giá — mở đơn để đồng ý hoặc từ chối',
  repairing: 'Thợ đang thực hiện dịch vụ',
  pending_review: 'KTV đã gửi biên bản. Văn phòng Minh Đức đang đối soát kiểm tra nghiệm thu (WF2).',
  warranty_pending: 'Văn phòng Minh Đức đang thẩm định hồ sơ bảo hành theo lịch sử cũ (WF4).',
  out_of_warranty: 'Thiết bị lỗi do ngoại lực/người dùng. Đã chuyển sang báo giá dịch vụ có phí.',
  done: 'Văn phòng đã duyệt nghiệm thu & dịch vụ hoàn tất. Cảm ơn bạn!',
  cancelled: 'Đơn đã huỷ',
};
// Copy hướng thợ (thao tác hiện trường) — khác với STATUS_DESC phía khách
export const TECH_STATUS_DESC = {
  pending: 'Việc mới — xác nhận lịch rồi nhận hoặc từ chối.',
  confirmed: 'Đã nhận. Gọi khách nếu cần, rồi bắt đầu di chuyển đúng giờ hẹn.',
  onway: 'Đang trên đường. Check-in khi tới địa chỉ khách.',
  diagnosing: 'Kiểm tra thiết bị, ghi chẩn đoán và gửi báo giá trước khi làm.',
  quoted: 'Đã gửi báo giá. Chờ khách duyệt trên app để tiếp tục.',
  repairing: 'Đang làm việc — cập nhật tiến độ, vật tư và ảnh minh chứng.',
  pending_review: 'Đã nộp biên bản. Chờ Văn phòng Minh Đức duyệt kết quả nghiệm thu (WF2).',
  warranty_pending: 'Đơn bảo hành mới — chờ Văn phòng thẩm định hồ sơ gốc (WF4).',
  out_of_warranty: 'Đã xác định ngoài phạm vi bảo hành — chuyển sang báo giá có phí.',
  done: 'Văn phòng đã duyệt nghiệm thu hoàn tất biên bản cho khách.',
  cancelled: 'Việc đã kết thúc / bị huỷ.',
};

// Vật tư / linh kiện thợ dùng khi lập báo giá (đồng bộ 1-1 với bảng hrmss.material 1..18)
export const MATERIALS = [
  { id: 'm-gas-r32', dbId: 1, name: 'Gas R32', unit: 'kg', price: 250000, category: 'may-lanh' },
  { id: 'm-gas-r410', dbId: 2, name: 'Gas R410A', unit: 'kg', price: 280000, category: 'may-lanh' },
  { id: 'm-gas-r22', dbId: 3, name: 'Gas R22', unit: 'kg', price: 220000, category: 'may-lanh' },
  { id: 'm-tu-ml', dbId: 4, name: 'Tụ điện block máy lạnh', unit: 'cái', price: 350000, category: 'may-lanh' },
  { id: 'm-ong-dong', dbId: 5, name: 'Ống đồng + bảo ôn', unit: 'm', price: 180000, category: 'may-lanh' },
  { id: 'm-ong-nuoc', dbId: 6, name: 'Ống thoát nước', unit: 'm', price: 20000, category: 'may-lanh' },
  { id: 'm-van-xa', dbId: 7, name: 'Van xả máy giặt', unit: 'cái', price: 220000, category: 'may-giat' },
  { id: 'm-curoa', dbId: 8, name: 'Dây curoa máy giặt', unit: 'sợi', price: 180000, category: 'may-giat' },
  { id: 'm-bom-xa', dbId: 9, name: 'Bơm xả máy giặt cửa trước', unit: 'cái', price: 450000, category: 'may-giat' },
  { id: 'm-gioang-tl', dbId: 10, name: 'Gioăng cửa tủ lạnh', unit: 'bộ', price: 350000, category: 'tu-lanh' },
  { id: 'm-role-tl', dbId: 11, name: 'Rơ-le khởi động tủ lạnh', unit: 'cái', price: 120000, category: 'tu-lanh' },
  { id: 'm-sensor-tl', dbId: 12, name: 'Cảm biến nhiệt tủ lạnh', unit: 'cái', price: 160000, category: 'tu-lanh' },
  { id: 'm-thanh-nhiet', dbId: 13, name: 'Thanh nhiệt bình nóng lạnh', unit: 'cái', price: 280000, category: 'nuoc-nong' },
  { id: 'm-magie', dbId: 14, name: 'Thanh magie chống cặn', unit: 'cái', price: 150000, category: 'nuoc-nong' },
  { id: 'm-loc-hm', dbId: 15, name: 'Lưới lọc máy hút mùi', unit: 'tấm', price: 190000, category: 'hut-mui' },
  { id: 'm-loc-hepa', dbId: 16, name: 'Màng lọc HEPA', unit: 'tấm', price: 450000, category: 'loc-khong-khi' },
  { id: 'm-hoa-chat', dbId: 17, name: 'Dung dịch vệ sinh chuyên dụng', unit: 'chai', price: 60000, category: 'all' },
  { id: 'm-day-dien', dbId: 18, name: 'Dây điện + CB', unit: 'bộ', price: 120000, category: 'all' },
];

// Ánh xạ giữa mã App Mobile và ID trong PostgreSQL (hrmss.service & hrmss.material)
export const resolveDbServiceId = (serviceSlugOrId) => {
  const raw = String(serviceSlugOrId || '').trim();
  if (/^[1-9]\d*$/.test(raw)) return Number(raw);
  const found = getService(raw);
  if (found?.dbId) return Number(found.dbId);
  const slug = resolveServiceSlugFromBackend(raw);
  const matched = getService(slug);
  return matched?.dbId ? Number(matched.dbId) : 80;
};

export const resolveServiceSlugFromBackend = (serviceId, serviceName = '') => {
  const byId = SERVICE_BY_DB_ID[String(serviceId)];
  if (byId && (!serviceName || normalize(byId.name) === normalize(serviceName))) {
    return byId.id;
  }
  const normName = normalize(serviceName);
  const byExactName = ALL_SERVICES.find((s) => normalize(s.name) === normName);
  if (byExactName) return byExactName.id;
  if (byId) return byId.id;

  if (normName.includes('dieu hoa') || normName.includes('may lanh')) {
    if (normName.includes('gas') || normName.includes('nap gas') || normName.includes('sac gas')) return 'gas-410-1hp';
    if (normName.includes('sua') || normName.includes('chan doan') || normName.includes('kiem tra')) return 'sc-ml';
    if (normName.includes('lap dat') || normName.includes('thao do') || normName.includes('am tran')) return 'vs-ml-am-tran';
    return 'vs-ml-1';
  }
  if (normName.includes('may giat') || normName.includes('may say')) {
    if (normName.includes('sua') || normName.includes('chan doan')) return 'sc-mg';
    if (normName.includes('cua truoc') || normName.includes('long ngang')) return 'vs-mg-truoc';
    return 'vs-mg-tren';
  }
  if (normName.includes('tu lanh') || normName.includes('tu dong') || normName.includes('tu mat') || normName.includes('thiet bi lanh')) {
    if (normName.includes('sua') || normName.includes('chan doan')) return 'sc-tl';
    if (normName.includes('side')) return 'vs-tl-side';
    return 'vs-tl-300';
  }
  if (normName.includes('binh nong') || normName.includes('nuoc nong') || normName.includes('loc nuoc') || normName.includes('bon nuoc')) {
    if (normName.includes('sua')) return 'sc-bnn';
    return 'vs-bnn';
  }
  if (normName.includes('hut mui') || normName.includes('nha bep') || normName.includes('bep tu') || normName.includes('lo vi song') || normName.includes('may rua bat')) {
    return 'vs-hut-mui';
  }
  if (normName.includes('quat')) return 'vs-quat-dh';
  if (normName.includes('loc khong khi') || normName.includes('gia dung') || normName.includes('hut bui')) return 'vs-loc-kk';
  if (normName.includes('dien') || normName.includes('su co dien') || normName.includes('day dien') || normName.includes('aptomat')) return 'sc-dien';
  if (normName.includes('tivi') || normName.includes('tv')) return 'sc-tv';
  return 'vs-ml-1';
};

export const resolveDbMaterialId = (matIdOrSlug, matName = '') => {
  const raw = String(matIdOrSlug || '').trim();
  if (/^[1-9]\d*$/.test(raw)) return raw;
  const found = MATERIALS.find((m) => m.id === raw || normalize(m.name) === normalize(matName));
  return found?.dbId ? String(found.dbId) : '1';
};

export const syncCatalogFromBackend = ({ services = [], materials = [] } = {}) => {
  if (Array.isArray(services) && services.length > 0) {
    services.forEach((dbSvc) => {
      const slug = resolveServiceSlugFromBackend(dbSvc.service_id, dbSvc.service_name);
      const localSvc = SERVICE_MAP[slug];
      if (localSvc) {
        localSvc.dbId = Number(dbSvc.service_id) || localSvc.dbId;
        if (dbSvc.base_price != null && Number(dbSvc.base_price) > 0) {
          localSvc.price = Number(dbSvc.base_price);
        }
        SERVICE_BY_DB_ID[String(dbSvc.service_id)] = localSvc;
      }
    });
  }
  if (Array.isArray(materials) && materials.length > 0) {
    materials.forEach((dbMat, idx) => {
      const matIdNum = Number(dbMat.material_id) || idx + 1;
      const byDbId = MATERIALS.find((m) => m.dbId === matIdNum || normalize(m.name) === normalize(dbMat.material_name));
      if (byDbId) {
        byDbId.dbId = matIdNum;
        if (dbMat.material_name) byDbId.name = dbMat.material_name;
        if (dbMat.unit_of_measure) byDbId.unit = dbMat.unit_of_measure;
      } else {
        MATERIALS.push({
          id: `m-db-${matIdNum}`,
          dbId: matIdNum,
          name: dbMat.material_name || `Vật tư #${matIdNum}`,
          unit: dbMat.unit_of_measure || 'cái',
          price: 150000,
          category: 'all',
        });
      }
    });
  }
};

// Gợi ý nhanh khi chẩn đoán
export const DIAG_TAGS = {
  'may-lanh': ['Dàn lạnh bám bụi', 'Thiếu gas', 'Rò gas mối nối', 'Hỏng tụ', 'Nghẹt ống thoát nước'],
  'may-giat': ['Lồng giặt bám cặn', 'Kẹt van xả', 'Mòn dây curoa', 'Lỗi bơm xả'],
  'tu-lanh': ['Gioăng cửa hở', 'Dàn nóng bám bụi', 'Hỏng rơ-le', 'Đóng tuyết ngăn đá'],
  'nuoc-nong': ['Bám cặn thanh nhiệt', 'Thanh magie mòn', 'Rò rỉ nước'],
  all: ['Thiết bị hoạt động bình thường', 'Cần vệ sinh định kỳ', 'Nguồn điện không ổn định'],
};

// Map danh mục / loại dịch vụ sang kỹ năng của thợ để đối chiếu chuyên môn & khu vực
const CAT_TO_SKILL = {
  'may-lanh': 'Máy lạnh',
  'may-giat': 'Máy giặt',
  'tu-lanh': 'Tủ lạnh',
  'nuoc-nong': 'Nóng lạnh',
  'hut-mui': 'Hút mùi',
  quat: 'Máy lạnh',
  'loc-khong-khi': 'Máy lạnh',
};

export const matchJobForTech = (order, techProfile) => {
  const me = techProfile || TECH_ME;
  const skills = (me.skills || TECH_ME.skills || []).map((s) => normalize(s));
  const areaTokens = String(me.area || TECH_ME.area || '')
    .split(/[,;/·|-]+/)
    .map((x) => normalize(x.trim()))
    .filter((x) => x.length >= 3);

  const items = order?.items || [];
  const neededSkills = new Set();
  items.forEach((it) => {
    const sv = getService(it.id);
    if (!sv) return;
    const catSkill = CAT_TO_SKILL[sv.category];
    if (catSkill) neededSkills.add(catSkill);
    const k = serviceKind(sv);
    if (k === 'gas') neededSkills.add('Nạp gas');
    if (k === 'repair' || k === 'install') neededSkills.add('Sửa chữa');
  });
  const neededArr = [...neededSkills];
  const skillMatch = neededArr.length === 0 || neededArr.some((sk) => skills.includes(normalize(sk)));

  const orderAddrNorm = normalize(`${order?.address?.area || ''} ${order?.address?.full || ''}`);
  const areaMatch = areaTokens.length === 0 || areaTokens.some((tok) => orderAddrNorm.includes(tok));

  const assignedToMe = Boolean(
    order?.workerCode && String(order.workerCode).trim().toUpperCase() === String(me.code || '').toUpperCase(),
  );
  const matchScore = (assignedToMe ? 4 : 0) + (skillMatch ? 2 : 0) + (areaMatch ? 1 : 0);
  return {
    skillMatch,
    areaMatch,
    assignedToMe,
    matchScore,
    neededSkills: neededArr,
  };
};

// Điều kiện vị trí thi công chuẩn Minh Đức (để thợ chuẩn bị thang, giấy đăng ký BQL, đồ bảo hộ)
export const SITE_CONDITIONS = [
  { id: 'nha-pho', label: 'Nhà phố / Tầng trệt', note: 'Vị trí dễ tiếp cận, thi công tiêu chuẩn' },
  { id: 'chung-cu', label: 'Chung cư / Căn hộ', note: 'Thợ đăng ký với BQL toà nhà' },
  { id: 'vi-tri-cao', label: 'Vị trí cao / Cần thang', note: 'Thợ mang theo thang chuyên dụng và dây an toàn' },
  { id: 'van-phong', label: 'Văn phòng / Cửa hàng', note: 'Thi công gọn gàng, hạn chế tiếng ồn' },
];

// Checklist an toàn điện & nghiệm thu bắt buộc của Thợ Minh Đức trước khi đóng đơn
export const SAFETY_CHECKLIST_ITEMS = [
  'Đã đo kiểm dòng điện & áp suất hoạt động an toàn',
  'Đã vận hành chạy thử thiết bị ổn định (≥15 phút)',
  'Đã thu dọn & vệ sinh sạch sẽ khu vực thi công',
  'Đã kích hoạt bảo hành điện tử & hướng dẫn khách sử dụng',
];

// Ưu đãi Combo nhiều máy chuẩn Minh Đức: đặt từ 2 máy giảm 5% (tối đa 50k), từ 3 máy giảm 10% (tối đa 120k)
export const comboDiscountFor = (items = []) => {
  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  if (totalQty < 2) return { qty: totalQty, percent: 0, amount: 0, label: '' };
  const sub = items.reduce((s, it) => {
    const sv = getService(it.id);
    return s + (sv?.price || 0) * (Number(it.qty) || 0);
  }, 0);
  if (totalQty === 2) {
    const amount = Math.min(50000, Math.round(sub * 0.05));
    return { qty: totalQty, percent: 5, amount, label: 'Combo 2 thiết bị (-5%)' };
  }
  const amount = Math.min(120000, Math.round(sub * 0.1));
  return { qty: totalQty, percent: 10, amount, label: `Combo ${totalQty} thiết bị (-10%)` };
};

// Danh sách thiết bị trên hệ thống Minh Đức tra cứu theo SĐT khách hàng
export const lookupHrmssPurchasedDevices = (phone = '') => {
  const digits = String(phone || '').replace(/\D/g, '').slice(-4) || '9180';
  const now = Date.now();
  const DAY_MS = 86400000;
  return [
    {
      category: 'may-lanh',
      brand: 'Daikin Inverter 1.5 HP ATKF35XVMV',
      room: 'Phòng ngủ',
      serial: `DK-${digits}-01`,
      hrmssInvoice: `HD-MINHDUC-${digits}1`,
      purchasedAt: now - 210 * DAY_MS,
      warrantyUntil: now + 520 * DAY_MS,
      lastService: now - 195 * DAY_MS, // đã đến kỳ bảo dưỡng 6 tháng
      hrmssPurchased: true,
    },
    {
      category: 'may-giat',
      brand: 'LG AI DD Inverter 10 kg FV1410S4P',
      room: 'Phòng tắm',
      serial: `LG-${digits}-02`,
      hrmssInvoice: `HD-MINHDUC-${digits}2`,
      purchasedAt: now - 160 * DAY_MS,
      warrantyUntil: now + 570 * DAY_MS,
      lastService: now - 155 * DAY_MS, // sắp đến kỳ bảo dưỡng
      hrmssPurchased: true,
    },
    {
      category: 'tu-lanh',
      brand: 'Panasonic Inverter 322L NR-BC360QKVN',
      room: 'Bếp',
      serial: `PA-${digits}-03`,
      hrmssInvoice: `HD-MINHDUC-${digits}3`,
      purchasedAt: now - 90 * DAY_MS,
      warrantyUntil: now + 640 * DAY_MS,
      lastService: now - 60 * DAY_MS,
      hrmssPurchased: true,
    },
  ];
};
