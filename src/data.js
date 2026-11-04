// Dữ liệu lấy theo video: giá, giảm giá, lượt bán, đánh giá hiển thị trên app Thợ ĐMX
export const CATEGORIES = [
  { id: 'may-lanh', label: 'Máy lạnh', icon: '❄️' },
  { id: 'may-giat', label: 'Máy giặt/sấy', icon: '🧺' },
  { id: 'tu-lanh', label: 'Tủ lạnh', icon: '🧊' },
  { id: 'nuoc-nong', label: 'Máy nước nóng/Bồn nước', icon: '🚿' },
  { id: 'hut-mui', label: 'Máy hút mùi/khói', icon: '🍳' },
  { id: 'quat', label: 'Quạt điều hòa/nước', icon: '🌀' },
  { id: 'loc-khong-khi', label: 'Máy lọc không khí', icon: '🌬️' },
];

export const SERVICES = [
  // Máy lạnh
  { id: 'vs-ml-1', category: 'may-lanh', name: 'Vệ sinh máy lạnh từ 1-2.5 HP', price: 180000, oldPrice: 200000, rating: 5, sold: 'Đã bán 631,7k', reviews: 16732, icon: '❄️', warranty: 'BH 60 ngày' },
  { id: 'vs-ml-am-tran', category: 'may-lanh', name: 'Vệ sinh Máy lạnh Âm Trần', price: 480000, oldPrice: 600000, rating: 5, sold: 'Đã bán 230', icon: '🏢', warranty: 'BH 60 ngày' },
  { id: 'gas-410-1hp', category: 'may-lanh', name: 'Sạc gas R410 - R32 (Inverter) máy lạnh 1HP...', price: 850000, rating: 0, sold: 'Đã bán 104', icon: '⛽', warranty: 'BH 60 ngày' },
  { id: 'vs-ml-tu-dung', category: 'may-lanh', name: 'Vệ sinh Máy lạnh Tủ Đứng', price: 480000, oldPrice: 600000, rating: 5, sold: 'Đã bán 20', icon: '🗄️', warranty: 'BH 60 ngày' },
  { id: 'gas-410-2hp', category: 'may-lanh', name: 'Sạc gas R410 - R32 (Inverter) máy lạnh 2H...', price: 1150000, rating: 0, sold: 'Đã bán 10', icon: '⛽', warranty: 'BH 60 ngày' },
  { id: 'gas-r22-1hp', category: 'may-lanh', name: 'Sạc gas R22 (Mono) máy lạnh 1-1.5 HP', price: 700000, rating: 0, sold: 'Đã bán 8', icon: '⛽', warranty: 'BH 60 ngày' },
  { id: 'vs-ml-chuyen-sau', category: 'may-lanh', name: 'Vệ sinh chuyên sâu máy lạnh treo tường 1-2,5 HP', price: 600000, oldPrice: 750000, rating: 0, sold: '', icon: '❄️', warranty: 'BH 60 ngày' },
  { id: 'gas-r22-2hp', category: 'may-lanh', name: 'Sạc gas R22 (Mono) máy lạnh 2HP-2.5HP', price: 850000, rating: 0, sold: '', icon: '⛽', warranty: 'BH 60 ngày' },
  // Máy giặt
  { id: 'vs-mg-tren', category: 'may-giat', name: 'Dịch Vụ Vệ Sinh Máy Giặt Cửa Trên', price: 357000, oldPrice: 420000, rating: 5, sold: 'Đã bán 8,3k', icon: '🧺', warranty: 'BH 60 ngày' },
  { id: 'vs-mg-truoc', category: 'may-giat', name: 'Dịch Vụ Vệ Sinh Máy Giặt Cửa Trước', price: 552500, oldPrice: 650000, rating: 5, sold: 'Đã bán 7,1k', icon: '🌀', warranty: 'BH 60 ngày' },
  { id: 'vs-mg-quan-ao', category: 'may-giat', name: 'Dịch Vụ Vệ Sinh Máy Giặt Quần Áo', price: 357000, oldPrice: 420000, rating: 4.9, sold: 'Đã bán 185', icon: '👕', warranty: 'BH 60 ngày' },
  // Tủ lạnh
  { id: 'vs-tl-300', category: 'tu-lanh', name: 'Vệ sinh Tủ lạnh ≤ 300 lít', price: 247500, oldPrice: 275000, rating: 0, sold: 'Đã bán 66', icon: '🧊', warranty: 'BH 60 ngày' },
  { id: 'vs-tl-side', category: 'tu-lanh', name: 'Vệ sinh Tủ lạnh side-by-side', price: 450000, oldPrice: 500000, rating: 0, sold: 'Đã bán 29', icon: '🧊', warranty: 'BH 60 ngày' },
  { id: 'vs-tl-tren300', category: 'tu-lanh', name: 'Vệ sinh Tủ lạnh > 300 lít', price: 315000, oldPrice: 350000, rating: 0, sold: 'Đã bán 23', icon: '🧊', warranty: 'BH 60 ngày' },
  // Nước nóng / Bồn nước
  { id: 'vs-bnn', category: 'nuoc-nong', name: 'Vệ sinh Bình nước nóng', price: 250000, rating: 0, sold: 'Đã bán 106', icon: '🚿', warranty: 'BH 60 ngày' },
  { id: 'vs-nlmt-300', category: 'nuoc-nong', name: 'Vệ sinh Bình năng lượng mặt trời ≤ 300 lít', price: 700000, rating: 0, sold: 'Đã bán 26', icon: '☀️', warranty: 'BH 60 ngày' },
  { id: 'vs-nlmt-tren300', category: 'nuoc-nong', name: 'Vệ sinh Bình năng lượng mặt trời > 300 lít', price: 900000, rating: 0, sold: 'Đã bán 2', icon: '☀️', warranty: 'BH 60 ngày' },
  { id: 'vs-bon-2500', category: 'nuoc-nong', name: 'Vệ sinh bồn nước từ 2500 đến 5000 lít', price: 525000, oldPrice: 750000, rating: 0, sold: '', icon: '🛢️', warranty: 'BH 60 ngày' },
  { id: 'vs-bon-duoi', category: 'nuoc-nong', name: 'Vệ sinh bồn nước dưới 2500 lít', price: 385000, oldPrice: 550000, rating: 0, sold: '', icon: '🛢️', warranty: 'BH 60 ngày' },
  // Hút mùi
  { id: 'vs-hut-mui', category: 'hut-mui', name: 'Vệ sinh Máy hút mùi', price: 350000, rating: 0, sold: 'Đã bán 29', icon: '🍳', warranty: 'BH 60 ngày' },
  // Quạt
  { id: 'vs-quat-dh', category: 'quat', name: 'Vệ sinh Quạt điều hòa', price: 180000, oldPrice: 200000, rating: 5, sold: 'Đã bán 329', icon: '🌀', warranty: 'BH 60 ngày' },
  { id: 'vs-quat-dung', category: 'quat', name: 'Vệ sinh Quạt đứng/treo tường', price: 150000, rating: 0, sold: 'Đã bán 184', icon: '🌀', warranty: 'BH 60 ngày' },
  // Lọc không khí
  { id: 'vs-loc-kk', category: 'loc-khong-khi', name: 'Vệ sinh Máy lọc không khí', price: 250000, rating: 0, sold: 'Đã bán 16', icon: '🌬️', warranty: 'BH 60 ngày' },
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
    detail: 'Thợ Điện Máy XANH cam kết thợ có tay nghề chuyên môn cao mang đến cho Quý Khách dịch vụ chất lượng tốt và thẩm mỹ. Nếu Quý Khách không hài lòng về tay nghề của kỹ thuật viên Điện Máy XANH, chúng tôi sẽ cử quản lý kỹ thuật viên làm lại hoàn toàn miễn phí cho Quý Khách như một lời xin lỗi chân thành và sẽ đưa nhân viên vào quy trình kèm cặp/huấn luyện nâng cao tay nghề.',
  },
  {
    title: 'Trung thực',
    sub: 'Báo giá rõ ràng trên app trước khi thực hiện',
    detail: 'Thợ Điện Máy XANH cam kết thợ trung thực và nghiêm túc. Nếu Điện Máy XANH phát hiện bất kỳ gian lận nào của kỹ thuật viên chung, Thợ Điện Máy XANH sẽ bồi thường 2 lần giá trị gian lận của Quý Khách.',
  },
  {
    title: 'Thân thiện & Vui vẻ',
    sub: 'Không tư vấn thêm dịch vụ hay linh kiện không cần thiết',
    detail: 'Được phục vụ Quý Khách là một vinh dự lớn với Thợ Điện Máy XANH và Thợ Điện Máy XANH luôn trân trọng. Thợ Điện Máy XANH cam kết mang đến cho Quý Khách dịch vụ thân thiện và vui vẻ. Nhân viên chỉ nhận thanh toán đúng số tiền trên đơn hàng. Nhân viên sẽ không được xin hoặc gợi ý tiền bồi dưỡng của Quý Khách. Nếu Quý Khách cảm thấy không hài lòng với thái độ, hành vi xin tiền bồi dưỡng của nhân viên, xin vui lòng phản ánh cho Thợ Điện Máy XANH để chúng tôi chấn chỉnh.',
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

export const formatVND = (n) => n.toLocaleString('vi-VN') + 'đ';

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
  if (serviceKind(item) === 'clean' && item?.category === 'may-lanh') {
    return { title: 'Quy trình vệ sinh máy lạnh tại nhà', sub: 'Thợ Điện Máy XANH · Xem trên YouTube' };
  }
  return null;
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
  if (kinds[0] === 'install') return 'Tôi cần lắp đặt';
  if (kinds[0] === 'repair') return 'Máy đang gặp sự cố, cần thợ kiểm tra';
  if (kinds[0] === 'gas') return 'Máy lạnh yếu lạnh, cần kiểm tra gas';
  if (kinds[0] === 'lifetime') return 'Tôi muốn đăng ký bảo dưỡng định kỳ';
  return '';
};

// Các tab còn lại trong video chỉ quay lướt phần tiêu đề, không quay chi tiết giá.
// Dưới đây là danh mục demo để các tab bấm được và không bị trống; thay giá thật khi có bảng giá chính thức.
export const INSTALL_SERVICES = [
  { id: 'ld-ml', category: 'may-lanh', name: 'Lắp đặt máy lạnh treo tường 1 - 1.5 HP', price: 350000, rating: 0, sold: '', icon: '❄️', warranty: 'BH 60 ngày' },
  { id: 'ld-ml-2', category: 'may-lanh', name: 'Lắp đặt máy lạnh treo tường 2 - 2.5 HP', price: 450000, rating: 0, sold: '', icon: '❄️', warranty: 'BH 60 ngày' },
  { id: 'ld-mg', category: 'may-giat', name: 'Lắp đặt máy giặt cửa trên / cửa trước', price: 250000, rating: 0, sold: '', icon: '🧺', warranty: 'BH 60 ngày' },
  { id: 'ld-tl', category: 'tu-lanh', name: 'Lắp đặt tủ lạnh', price: 300000, rating: 0, sold: '', icon: '🧊', warranty: 'BH 60 ngày' },
];
export const REPAIR_SERVICES = [
  { id: 'sc-ml', category: 'may-lanh', name: 'Kiểm tra / sửa máy lạnh không lạnh', price: 200000, rating: 0, sold: '', icon: '❄️', warranty: 'BH 60 ngày' },
  { id: 'sc-mg', category: 'may-giat', name: 'Kiểm tra / sửa máy giặt không vắt', price: 200000, rating: 0, sold: '', icon: '🧺', warranty: 'BH 60 ngày' },
  { id: 'sc-tl', category: 'tu-lanh', name: 'Kiểm tra / sửa tủ lạnh kém lạnh', price: 200000, rating: 0, sold: '', icon: '🧊', warranty: 'BH 60 ngày' },
];
export const LIFETIME_SERVICES = [
  { id: 'td-ml', category: 'may-lanh', name: 'Gói bảo dưỡng trọn đời máy lạnh treo tường', price: 1200000, rating: 0, sold: '', icon: '❄️', warranty: 'BH 60 ngày' },
  { id: 'td-mg', category: 'may-giat', name: 'Gói bảo dưỡng trọn đời máy giặt', price: 900000, rating: 0, sold: '', icon: '🧺', warranty: 'BH 60 ngày' },
];
export const AREAS = [
  'An Khánh, Hà Nội', 'Hoài Đức, Hà Nội', 'Cầu Giấy, Hà Nội', 'Nam Từ Liêm, Hà Nội',
  'Thanh Xuân, Hà Nội', 'Quận 1, TP. Hồ Chí Minh', 'Quận 3, TP. Hồ Chí Minh', 'Thủ Đức, TP. Hồ Chí Minh',
];
export const TIME_SLOTS = ['08h00 - 10h00', '10h00 - 12h00', '12h00 - 14h00', '14h00 - 16h00', '16h00 - 18h00', '18h00 - 20h00'];
export const VOUCHERS = [
  { code: 'THO20', label: 'Giảm 20.000đ cho đơn từ 150.000đ', discount: 20000, min: 150000 },
  { code: 'DMX10', label: 'Giảm 10% tối đa 50.000đ', percent: 10, max: 50000 },
];
export const imgFor = (id) => `https://picsum.photos/seed/${id}/400/300`;


// ---------------------------------------------------------------------------
// Dữ liệu dùng chung cho bản giao diện mới (liên kết giữa các chức năng)
// ---------------------------------------------------------------------------
export const ALL_SERVICES = [...SERVICES, ...INSTALL_SERVICES, ...REPAIR_SERVICES, ...LIFETIME_SERVICES];
const SERVICE_MAP = Object.fromEntries(ALL_SERVICES.map((s) => [s.id, s]));
export const getService = (id) => SERVICE_MAP[id];

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
export const catIcon = (id) => CATEGORIES.find((c) => c.id === id)?.icon || '🔧';

// Chu kỳ bảo dưỡng khuyến nghị (tháng) theo loại thiết bị — dùng để nhắc lịch ở tab Thiết bị / Trang chủ
export const MAINT_MONTHS = {
  'may-lanh': 6, 'may-giat': 6, 'tu-lanh': 6, 'nuoc-nong': 12, 'hut-mui': 6, quat: 12, 'loc-khong-khi': 6,
};

export const SERVICE_TYPES = [
  { id: 'bao-duong', label: 'Bảo dưỡng', icon: '🧼', desc: 'Vệ sinh định kỳ' },
  { id: 'lap-dat', label: 'Lắp đặt', icon: '🛠️', desc: 'Khảo sát tận nhà' },
  { id: 'sua-chua', label: 'Sửa chữa', icon: '🔧', desc: 'Báo giá trước' },
  { id: 'bao-hanh', label: 'Bảo hành', icon: '🛡️', desc: 'Tra cứu 60 ngày' },
  { id: 'tron-doi', label: 'Trọn đời', icon: '♾️', desc: 'Gói định kỳ' },
];

export const TIPS = [
  {
    id: 'tip-1', title: '5 cách dùng tủ lạnh giúp tăng tuổi thọ máy', views: '10,2K lượt xem', icon: '🧊', category: 'tu-lanh', serviceId: 'vs-tl-300',
    body: '1. Không để thức ăn còn nóng vào tủ.\n2. Đặt tủ cách tường ít nhất 10 cm để dàn nóng tản nhiệt.\n3. Không chất đầy quá 3/4 dung tích.\n4. Kiểm tra gioăng cửa định kỳ, gioăng hở làm tủ chạy liên tục.\n5. Vệ sinh tủ 6 tháng/lần để khử mùi và giữ dàn lạnh sạch.',
  },
  {
    id: 'tip-2', title: 'Máy lạnh kém mát? 3 dấu hiệu cần vệ sinh ngay', views: '8,4K lượt xem', icon: '❄️', category: 'may-lanh', serviceId: 'vs-ml-1',
    body: '• Gió thổi ra yếu hoặc có mùi hôi.\n• Dàn lạnh chảy nước, đọng sương.\n• Tiền điện tăng bất thường dù dùng như cũ.\n\nNếu gặp một trong các dấu hiệu trên, hãy đặt lịch vệ sinh để máy mát nhanh và tiết kiệm điện hơn.',
  },
  {
    id: 'tip-3', title: 'Vì sao máy giặt có mùi hôi và cách xử lý', views: '6,1K lượt xem', icon: '🧺', category: 'may-giat', serviceId: 'vs-mg-tren',
    body: 'Cặn bột giặt và nước tồn đọng trong lồng là nơi vi khuẩn phát triển. Hãy mở cửa máy sau khi giặt, vệ sinh khay bột hàng tháng và vệ sinh lồng giặt chuyên sâu 6 tháng/lần.',
  },
];

export const FAQ = [
  { q: 'Thợ có đến đúng giờ không?', a: 'Cam kết đúng khung giờ. Trễ 21–45 phút: giảm 20% phí nhân công (tối đa 100.000đ). Trễ trên 45 phút: giảm 50% (tối đa 200.000đ). Trễ ≤10 phút không bị trừ. Thợ đến muộn còn bị trừ điểm uy tín.' },
  { q: 'Tôi có thể huỷ hoặc đổi lịch không?', a: 'Khi đơn còn chờ thợ nhận, vào Chi tiết đơn → "Sửa yêu cầu" để đổi ngày/giờ, mô tả và ảnh. Huỷ miễn phí khi thợ chưa bắt đầu di chuyển (chờ nhận / đã nhận). Sau khi thợ đang đến thì không huỷ trên app — gọi hotline.' },
  { q: 'Bảo hành 60 ngày được tính thế nào?', a: 'Bảo hành bắt đầu từ lúc đơn hoàn thành. Vào Dịch vụ › Bảo hành hoặc Chi tiết đơn hàng để tra cứu và gửi yêu cầu bảo hành miễn phí.' },
  { q: 'Điểm tích luỹ dùng để làm gì?', a: 'Mỗi 10.000đ thanh toán = 1 điểm, đánh giá đơn hàng được thêm 20 điểm. Dùng điểm để đổi voucher ở mục Quyền lợi của tôi.' },
  { q: 'Phương thức thanh toán nào được hỗ trợ?', a: 'Tiền mặt khi thợ hoàn thành, chuyển khoản, thẻ ATM, VNPay QR, thẻ quốc tế, Google Pay và Apple Pay.' },
];

// Đổi điểm lấy voucher (Quyền lợi của tôi) — voucher đổi được sẽ hiện ở bước Thanh toán
export const REDEEM_OPTIONS = [
  { id: 'r-20k', cost: 100, title: 'Voucher giảm 20.000đ', voucher: { prefix: 'DIEM20K', label: 'Giảm 20.000đ (đổi điểm)', discount: 20000 } },
  { id: 'r-50k', cost: 250, title: 'Voucher giảm 50.000đ', voucher: { prefix: 'DIEM50K', label: 'Giảm 50.000đ (đổi điểm)', discount: 50000 } },
  { id: 'r-15p', cost: 500, title: 'Voucher giảm 15% tối đa 100.000đ', voucher: { prefix: 'DIEM15', label: 'Giảm 15% tối đa 100.000đ (đổi điểm)', percent: 15, max: 100000 } },
];

export const TIERS = [
  { id: 'member', label: 'Thành viên', min: 0, color: '#64748B' },
  { id: 'silver', label: 'Bạc', min: 200, color: '#94A3B8' },
  { id: 'gold', label: 'Vàng', min: 500, color: '#D69E00' },
  { id: 'diamond', label: 'Kim cương', min: 1000, color: '#2563EB' },
];
export const tierOf = (lifetimePoints) => {
  let cur = TIERS[0];
  TIERS.forEach((t) => { if (lifetimePoints >= t.min) cur = t; });
  const next = TIERS[TIERS.indexOf(cur) + 1] || null;
  return { cur, next };
};

export const ORDER_STEPS = [
  { key: 'pending', label: 'Đã đặt lịch', desc: 'Đơn đã gửi, chờ thợ nhận' },
  { key: 'confirmed', label: 'Thợ đã nhận đơn', desc: 'Thợ sẽ gọi cho bạn trước khi đến' },
  { key: 'onway', label: 'Thợ đang đến', desc: 'Thợ đang di chuyển tới địa chỉ của bạn' },
  { key: 'diagnosing', label: 'Kiểm tra thiết bị', desc: 'Thợ kiểm tra và lập chẩn đoán' },
  { key: 'quoted', label: 'Chờ duyệt báo giá', desc: 'Bạn cần đồng ý báo giá để thợ bắt đầu' },
  { key: 'repairing', label: 'Đang thực hiện', desc: 'Thợ đang sửa chữa / vệ sinh' },
  { key: 'done', label: 'Hoàn thành', desc: 'Dịch vụ đã hoàn tất và nghiệm thu' },
];
// Timeline thợ gọn hơn (gộp báo giá vào bước kiểm tra)
export const TECH_ORDER_STEPS = ORDER_STEPS.filter((s) => s.key !== 'quoted').map((s) => (
  s.key === 'diagnosing' ? { ...s, label: 'Kiểm tra & báo giá', desc: 'Chẩn đoán và gửi báo giá trước khi làm' } : s
));
export const stepIndexOf = (status) => {
  if (status === 'quoted') return ORDER_STEPS.findIndex((x) => x.key === 'quoted');
  return ORDER_STEPS.findIndex((x) => x.key === status);
};
/** Index bước trên timeline thợ (không có bước quoted riêng) */
export const techStepIndexOf = (status) => {
  if (status === 'quoted') return TECH_ORDER_STEPS.findIndex((x) => x.key === 'diagnosing');
  const i = TECH_ORDER_STEPS.findIndex((x) => x.key === status);
  return i;
};

export const TECHS = [
  { name: 'Nguyễn Văn Hùng', code: 'TDMX1024', rating: 4.9, jobs: 1250 },
  { name: 'Trần Minh Đức', code: 'TDMX2071', rating: 5.0, jobs: 860 },
  { name: 'Lê Quốc Bảo', code: 'TDMX3318', rating: 4.8, jobs: 1520 },
];

export const PAYMENTS = ['Thanh toán khi nhận hàng', 'Chuyển khoản ngân hàng', 'Qua thẻ ATM (có Internet Banking)', 'VNPay QR', 'Qua thẻ quốc tế', 'Google Pay', 'Apple Pay'];
export const PARTNERS = ['Panasonic', 'SONY', 'LG', 'Samsung', 'Coway', 'SKYWORTH', 'Nagakawa', 'Sumico', 'Electrolux'];
export const HOTLINE = '1900 232 461';
export const POPULAR_SEARCHES = ['Vệ sinh máy lạnh', 'Sạc gas', 'Máy giặt', 'Tủ lạnh', 'Lắp đặt', 'Bình nước nóng'];

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
// PHÍA THỢ (Technician) — theo sơ đồ ngữ cảnh HRMSS:
//   Thợ → Hệ thống: chẩn đoán, tiến độ sửa chữa, vật tư sử dụng, ảnh minh chứng, biên bản hoàn thành
//   Hệ thống → Thợ: việc được giao, địa chỉ & liên hệ khách, lịch làm việc, báo giá, thông báo
// ---------------------------------------------------------------------------
export const TECH_ME = {
  name: 'Nguyễn Văn Hùng', code: 'TDMX1024', rating: 4.9, jobs: 0, phone: '0987654321',
  area: 'Cầu Giấy, Nam Từ Liêm, Hoài Đức', skills: ['Máy lạnh', 'Máy giặt', 'Tủ lạnh', 'Nạp gas'],
};

// Trạng thái đơn đầy đủ (khách ↔ thợ)
export const STATUS_FLOW = ['pending', 'confirmed', 'onway', 'diagnosing', 'quoted', 'repairing', 'done'];
export const STATUS_DESC = {
  pending: 'Đơn đã gửi, đang chờ thợ nhận',
  confirmed: 'Thợ sẽ gọi cho bạn trước khi đến',
  onway: 'Thợ đang di chuyển tới địa chỉ của bạn',
  diagnosing: 'Thợ đang kiểm tra thiết bị và lập báo giá',
  quoted: 'Có báo giá chờ bạn duyệt — mở đơn để đồng ý hoặc từ chối',
  repairing: 'Thợ đang thực hiện dịch vụ',
  done: 'Dịch vụ đã hoàn tất. Kiểm tra biên lai và đánh giá thợ.',
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
  done: 'Đã hoàn thành và gửi biên bản cho khách.',
  cancelled: 'Việc đã kết thúc / bị huỷ.',
};

// Vật tư / linh kiện thợ dùng khi lập báo giá (giá tham khảo)
export const MATERIALS = [
  { id: 'm-gas-r32', name: 'Gas R32', unit: 'kg', price: 250000, category: 'may-lanh' },
  { id: 'm-gas-r410', name: 'Gas R410A', unit: 'kg', price: 280000, category: 'may-lanh' },
  { id: 'm-gas-r22', name: 'Gas R22', unit: 'kg', price: 220000, category: 'may-lanh' },
  { id: 'm-tu-ml', name: 'Tụ điện block máy lạnh', unit: 'cái', price: 350000, category: 'may-lanh' },
  { id: 'm-ong-dong', name: 'Ống đồng + bảo ôn', unit: 'm', price: 180000, category: 'may-lanh' },
  { id: 'm-ong-nuoc', name: 'Ống thoát nước', unit: 'm', price: 20000, category: 'may-lanh' },
  { id: 'm-van-xa', name: 'Van xả máy giặt', unit: 'cái', price: 220000, category: 'may-giat' },
  { id: 'm-curoa', name: 'Dây curoa máy giặt', unit: 'sợi', price: 180000, category: 'may-giat' },
  { id: 'm-bom-xa', name: 'Bơm xả máy giặt cửa trước', unit: 'cái', price: 450000, category: 'may-giat' },
  { id: 'm-gioang-tl', name: 'Gioăng cửa tủ lạnh', unit: 'bộ', price: 350000, category: 'tu-lanh' },
  { id: 'm-role-tl', name: 'Rơ-le khởi động tủ lạnh', unit: 'cái', price: 120000, category: 'tu-lanh' },
  { id: 'm-sensor-tl', name: 'Cảm biến nhiệt tủ lạnh', unit: 'cái', price: 160000, category: 'tu-lanh' },
  { id: 'm-thanh-nhiet', name: 'Thanh nhiệt bình nóng lạnh', unit: 'cái', price: 280000, category: 'nuoc-nong' },
  { id: 'm-magie', name: 'Thanh magie chống cặn', unit: 'cái', price: 150000, category: 'nuoc-nong' },
  { id: 'm-loc-hm', name: 'Lưới lọc máy hút mùi', unit: 'tấm', price: 190000, category: 'hut-mui' },
  { id: 'm-loc-hepa', name: 'Màng lọc HEPA', unit: 'tấm', price: 450000, category: 'loc-khong-khi' },
  { id: 'm-hoa-chat', name: 'Dung dịch vệ sinh chuyên dụng', unit: 'chai', price: 60000, category: 'all' },
  { id: 'm-day-dien', name: 'Dây điện + CB', unit: 'bộ', price: 120000, category: 'all' },
];

// Gợi ý nhanh khi chẩn đoán
export const DIAG_TAGS = {
  'may-lanh': ['Dàn lạnh bám bụi', 'Thiếu gas', 'Rò gas mối nối', 'Hỏng tụ', 'Nghẹt ống thoát nước'],
  'may-giat': ['Lồng giặt bám cặn', 'Kẹt van xả', 'Mòn dây curoa', 'Lỗi bơm xả'],
  'tu-lanh': ['Gioăng cửa hở', 'Dàn nóng bám bụi', 'Hỏng rơ-le', 'Đóng tuyết ngăn đá'],
  'nuoc-nong': ['Bám cặn thanh nhiệt', 'Thanh magie mòn', 'Rò rỉ nước'],
  all: ['Thiết bị hoạt động bình thường', 'Cần vệ sinh định kỳ', 'Nguồn điện không ổn định'],
};
