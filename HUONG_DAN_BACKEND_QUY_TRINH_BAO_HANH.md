# ĐẶC TẢ NGHIỆP VỤ & HƯỚNG DẪN KỸ THUẬT BACKEND: QUY TRÌNH BẢO HÀNH ĐIỆN TỬ HRMSS
> **Dành cho:** Đội ngũ Backend Developer & System Architect  
> **Phiên bản tài liệu:** v2.0 - Chuẩn hóa vòng đời bảo hành, đặt lịch thông minh & kiểm soát thời hạn biên  
> **Mục tiêu:** Đồng bộ tuyệt đối giữa Mobile App và Backend Server, bảo đảm tính toàn vẹn dữ liệu, chống gian lận thời gian và nâng cao tỷ lệ giữ chân khách hàng (Customer Retention).

---

## 1. TỔNG QUAN VẤN ĐỀ & BỐI CẢNH HỆ THỐNG

Trước đây, khi khách hàng bấm **"Yêu cầu bảo hành"** trên App:
- App chỉ gửi yêu cầu chung chung (`POST /customer/requests/:id/warranty`), không cho khách hàng chọn ngày giờ.
- Hệ thống tự động gán lịch hẹn mặc định (`08h00 - 10h00` ngày hôm sau).
- Khách hàng không nhận được cảnh báo khi đơn sắp hết hạn bảo hành.
- Chưa có cơ chế kiểm soát giờ làm việc thực tế của thợ vào **ngày cuối cùng (Ngày thứ 60)**, dẫn đến nguy cơ khách hàng gửi yêu cầu lúc nửa đêm ngày 60 hoặc hẹn lùi sang ngày 61, 62 gây sai lệch chính sách bảo hành.

### 🎯 3 Yêu cầu cốt lõi cần Backend giải quyết:
1. **Cho phép khách hàng cấu hình ngày & giờ bảo hành**: Khách hàng được tự chọn ngày hẹn và ca làm việc (Time Slot) theo khung giờ hoạt động của thợ.
2. **Hệ thống cảnh báo chủ động (Proactive Notification)**: Tự động gửi thông báo push/socket đếm ngược khi đơn hàng sắp hết hạn bảo hành theo các mốc **D-7 (7 ngày), D-3 (3 ngày), D-1 (1 ngày)**.
3. **Quy tắc biên Ngày thứ 60 & Giờ cắt ca thợ (Strict Cut-off Policy)**:
   - Nếu khách hàng gửi yêu cầu đúng vào ngày thứ 60 (ngày cuối cùng của thời hạn): **Chỉ được phép đặt lịch trong chính ngày thứ 60 đó**, cấm chọn sang ngày 61 trở đi.
   - Lịch hẹn trong ngày thứ 60 phải **nằm trong khung giờ làm việc của thợ**. Nếu tại thời điểm bấm gửi, thời gian hiện tại đã vượt quá giờ cắt ca làm việc khả dụng cuối cùng trong ngày (sau **18h00**), Backend **từ chối tiếp nhận bảo hành miễn phí** và trả về mã lỗi cụ thể để App hiển thị thông báo chuyển hướng sang hỗ trợ CSKH/Hotline.

---

## 2. CHUẨN HÓA DỮ LIỆU & QUY TẮC THỜI GIAN (TIME & POLICY DEFINITION)

### 2.1. Khung giờ làm việc của Kỹ thuật viên (Time Slots)
Hệ thống vận hành theo 6 ca làm việc tiêu chuẩn trong ngày:
```
Slot 1: 08h00 - 10h00
Slot 2: 10h00 - 12h00
Slot 3: 12h00 - 14h00
Slot 4: 14h00 - 16h00
Slot 5: 16h00 - 18h00
Slot 6: 18h00 - 20h00
```

### 2.2. Quy tắc giờ cắt tiếp nhận (Lead Time & Cut-off Threshold)
- **Quy tắc Lead Time**: Để thợ có tối thiểu **30 phút** chuẩn bị và di chuyển, một ca làm việc chỉ được xem là khả dụng nếu:
  $$\text{Slot Start Time} \ge \text{Server Current Time} + 30 \text{ phút}$$
- **Giờ cắt ca cuối cùng của ngày (`FINAL_SLOT_CUTOFF`)**:
  - Ca cuối cùng trong ngày là `18h00 - 20h00`.
  - Giờ cắt tiếp nhận mới cho ca này là **18h00** (sau 18h00 không tiếp nhận bất kỳ lịch hẹn mới nào trong ngày hôm đó).

### 2.3. Quy tắc tính Ngày thứ 60 (Expiry Day Definition)
- Ngày bắt đầu tính bảo hành: Thời điểm đơn hàng gốc chuyển trạng thái `DONE` (`completed_at`).
- Thời hạn bảo hành: `warranty_days` (mặc định 60 ngày, hoặc 75/90/120 ngày tùy theo hạng thành viên `TIERS`).
- `warranty_end_date`: `DATE(DATE_ADD(completed_at, INTERVAL warranty_days DAY))`.
- **Ngày cuối cùng (Final Day)** là khi:
  $$\text{DATE(Server Current Time)} = \text{warranty\_end\_date}$$

---

## 3. CHI TIẾT API CONTRACTS CHO BACKEND

### 3.1. API Kiểm tra tính khả dụng bảo hành (Pre-check / Eligibility)
Hỗ trợ Mobile App kiểm tra quyền lợi và lấy danh sách ngày/giờ hợp lệ trước khi hiển thị form.

- **Endpoint:** `GET /api/v1/customer/requests/:id/warranty-eligibility`
- **Headers:** `Authorization: Bearer <access_token>`
- **Response thành công (200 OK) - Trường hợp ngày bình thường (còn hạn dài):**
```json
{
  "ok": true,
  "data": {
    "request_id": 1234,
    "eligible": true,
    "warranty_days": 60,
    "completed_at": "2026-10-01T09:15:00.000Z",
    "warranty_end_date": "2026-11-30",
    "server_today": "2026-11-18",
    "days_remaining": 12,
    "is_final_day": false,
    "available_dates": [
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
      "2026-11-23",
      "2026-11-24"
    ],
    "available_slots_today": [
      "14h00 - 16h00",
      "16h00 - 18h00",
      "18h00 - 20h00"
    ]
  }
}
```

- **Response thành công (200 OK) - Trường hợp đúng Ngày thứ 60 (Trước 18h00):**
```json
{
  "ok": true,
  "data": {
    "request_id": 1234,
    "eligible": true,
    "warranty_days": 60,
    "completed_at": "2026-09-19T10:00:00.000Z",
    "warranty_end_date": "2026-11-18",
    "server_today": "2026-11-18",
    "days_remaining": 1,
    "is_final_day": true,
    "notice": "Hôm nay là ngày cuối cùng của thời hạn bảo hành. Bạn chỉ có thể đặt lịch kiểm tra trong hôm nay.",
    "available_dates": [
      "2026-11-18"
    ],
    "available_slots_today": [
      "16h00 - 18h00",
      "18h00 - 20h00"
    ]
  }
}
```

- **Response thành công (200 OK) - Trường hợp Ngày thứ 60 nhưng ĐÃ QUÁ 18h00:**
```json
{
  "ok": true,
  "data": {
    "request_id": 1234,
    "eligible": false,
    "reason_code": "WARRANTY_FINAL_DAY_CUTOFF",
    "message": "Hôm nay là ngày cuối cùng của thời hạn bảo hành và đã quá giờ làm việc khả dụng của kỹ thuật viên (sau 18h00).",
    "warranty_end_date": "2026-11-18",
    "server_time": "2026-11-18T18:15:30.000Z",
    "support_hotline": "1900 886633",
    "retention_voucher": {
      "code": "TRIAN15",
      "discount_percent": 15,
      "title": "Ưu đãi 15% kiểm tra & sửa chữa thiết bị"
    }
  }
}
```

---

### 3.2. Cập nhật API Tạo đơn yêu cầu bảo hành (Submit Warranty Request)

- **Endpoint:** `POST /api/v1/customer/requests/:id/warranty`
- **Headers:** `Authorization: Bearer <access_token>`
- **Request Body (JSON mới đầy đủ):**
```json
{
  "scheduled_date": "2026-11-18",
  "time_slot": "16h00 - 18h00",
  "issue_description": "Sau khi vệ sinh 1 tuần, điều hoà không mát và có tiếng kêu cạch cạch ở cánh vẫy gió.",
  "attachment_urls": [
    "https://storage.hrmss.cyou/uploads/warranty/evidence_01.jpg",
    "https://storage.hrmss.cyou/uploads/warranty/evidence_02.jpg"
  ],
  "contact_phone": "0988123456",
  "contact_address": "Số 25 Phố Duy Tân, Phường Dịch Vọng Hậu, Cầu Giấy, Hà Nội"
}
```

- **Quy tắc Validate nghiêm ngặt phía Backend (Server Validation Rules):**
  1. Kiểm tra đơn gốc `:id` phải tồn tại, thuộc quyền sở hữu của `user_id` và có `status = 'DONE'`.
  2. Không có đơn bảo hành nào khác của đơn gốc đang trong trạng thái mở (`WARRANTY_PENDING`, `CONFIRMED`, `ONWAY`, `DIAGNOSING`, `REPAIRING`). Nếu có: trả lỗi `409 Conflict` - `WARRANTY_ALREADY_OPEN`.
  3. Lấy `server_now` (theo múi giờ `Asia/Ho_Chi_Minh`):
     - Nếu `DATE(server_now) > warranty_end_date`: Trả lỗi `400 Bad Request` - `WARRANTY_EXPIRED`.
     - Nếu `DATE(server_now) == warranty_end_date`:
       - `scheduled_date` BẮT BUỘC phải bằng `DATE(server_now)`. Nếu client truyền ngày khác $\rightarrow$ Trả lỗi `400 Bad Request` - `WARRANTY_MUST_BE_TODAY`.
       - Giờ hiện tại `TIME(server_now)` phải $\le$ `18:00:00`. Nếu $> 18:00:00 \rightarrow$ Trả lỗi `400 Bad Request` - `WARRANTY_FINAL_DAY_CUTOFF`.
       - `time_slot` phải nằm trong danh sách slot còn hiệu lực của ngày hôm nay (Slot bắt đầu sau giờ hiện tại tối thiểu 30 phút).
     - Nếu `DATE(server_now) < warranty_end_date`:
       - `scheduled_date` phải thỏa mãn: $\text{DATE}(server\_now) \le scheduled\_date \le \text{MIN}(\text{DATE}(server\_now) + 7 \text{ ngày}, warranty\_end\_date)$.
  4. Tạo bản ghi mới trong bảng `requests` với:
     - `kind = 'warranty'`
     - `original_request_id = :id`
     - `code = 'BH-' + RandomDigits()`
     - `status = 'WARRANTY_PENDING'`
     - `total_price = 0` (Bảo hành miễn phí 100%)
     - `scheduled_at = parseDateTime(scheduled_date, time_slot)`
     - `notes = issue_description`

- **Response thành công (201 Created):**
```json
{
  "ok": true,
  "message": "Đã tiếp nhận yêu cầu bảo hành thành công.",
  "data": {
    "request": {
      "id": 5678,
      "code": "BH-8457326652",
      "kind": "warranty",
      "original_request_id": 1234,
      "original_code": "REQ-5393168463",
      "status": "WARRANTY_PENDING",
      "scheduled_date": "2026-11-18",
      "time_slot": "16h00 - 18h00",
      "customer_name": "Nguyễn Văn Khách",
      "customer_phone": "0988123456",
      "address": "Số 25 Phố Duy Tân, Phường Dịch Vọng Hậu, Cầu Giấy, Hà Nội",
      "issue_description": "Sau khi vệ sinh 1 tuần, điều hoà không mát...",
      "attachments": [
        "https://storage.hrmss.cyou/uploads/warranty/evidence_01.jpg"
      ],
      "created_at": "2026-11-18T10:15:00.000Z"
    }
  }
}
```

- **Mã lỗi Backend cần chuẩn hóa (Standard Error Responses):**

| HTTP Code | Error Code | Ý nghĩa | Thông báo trả về cho App |
| :---: | :--- | :--- | :--- |
| `400` | `WARRANTY_EXPIRED` | Đơn hàng đã quá thời hạn bảo hành | *"Đơn hàng đã hết thời hạn bảo hành theo chính sách."* |
| `400` | `WARRANTY_FINAL_DAY_CUTOFF` | Ngày thứ 60 và đã quá 18h00 | *"Hôm nay là ngày cuối bảo hành và đã quá ca tiếp nhận của thợ (sau 18h00)."* |
| `400` | `WARRANTY_MUST_BE_TODAY` | Ngày thứ 60 nhưng chọn ngày tương lai | *"Ngày cuối bảo hành chỉ được chọn lịch trong ngày hôm nay."* |
| `400` | `INVALID_TIME_SLOT` | Khung giờ không hợp lệ hoặc đã qua | *"Khung giờ đã chọn không còn khả dụng. Vui lòng chọn ca tiếp theo."* |
| `409` | `WARRANTY_ALREADY_OPEN` | Đang có đơn bảo hành chưa giải quyết | *"Đơn này đang có một yêu cầu bảo hành đang được xử lý."* |

---

## 4. HỆ THỐNG CẢNH BÁO TỰ ĐỘNG TRƯỚC HẾT HẠN (CRONJOB & PUSH NOTIFICATION)

Để thực hiện yêu cầu **"Gần đến ngày hết hạn bảo hành thì app sẽ phải thông báo là anh chị còn bao nhiêu ngày nữa sẽ hết hạn"**, Backend cần thiết lập Cronjob tự động quét hàng ngày.

### 4.1. Lịch trình chạy Cronjob
- **Thời gian chạy:** `08:30:00` hàng ngày (theo múi giờ `Asia/Ho_Chi_Minh`).
- **Tên tác vụ:** `warranty-expiration-reminder`.

### 4.2. Logic truy vấn & Phân nhóm cảnh báo
Cronjob thực hiện truy vấn SQL lấy tất cả các đơn hàng hoàn tất chưa bị huỷ:
```sql
SELECT 
  r.id, 
  r.code, 
  r.customer_account_id, 
  r.completed_at, 
  COALESCE(r.warranty_days, 60) AS warranty_days,
  DATE_ADD(DATE(r.completed_at), INTERVAL COALESCE(r.warranty_days, 60) DAY) AS warranty_end_date,
  DATEDIFF(DATE_ADD(DATE(r.completed_at), INTERVAL COALESCE(r.warranty_days, 60) DAY), CURDATE()) AS days_left,
  it.name AS service_name
FROM requests r
LEFT JOIN request_items it ON it.request_id = r.id AND it.is_primary = 1
WHERE r.status = 'DONE'
  AND r.kind != 'warranty'
  AND DATEDIFF(DATE_ADD(DATE(r.completed_at), INTERVAL COALESCE(r.warranty_days, 60) DAY), CURDATE()) IN (7, 3, 1)
  AND NOT EXISTS (
    SELECT 1 FROM notifications n 
    WHERE n.user_id = r.customer_account_id 
      AND n.type = 'WARRANTY_EXPIRING_SOON' 
      AND DATE(n.created_at) = CURDATE()
      AND JSON_EXTRACT(n.metadata, '$.request_id') = r.id
  );
```

### 4.3. Nội dung thông báo theo từng mốc (Notification Templates)

#### 🔹 Mốc D-7 (Còn 7 ngày): Nhắc nhở kiểm tra định kỳ (Gentle Health Check)
- **Tiêu đề:** `🛡️ Thiết bị của bạn còn 7 ngày bảo hành`
- **Nội dung:** `Đơn hàng {code} ({service_name}) sẽ hết hạn bảo hành vào {warranty_end_date}. Nếu thiết bị hoạt động chưa ưng ý, hãy đặt lịch để thợ kiểm tra miễn phí ngay nhé!`
- **Action Type:** `NAVIGATE_ORDER_DETAIL` $\rightarrow$ Mở màn hình đơn hàng kèm nút tạo bảo hành.

#### 🔹 Mốc D-3 (Còn 3 ngày): Cảnh báo sắp kết thúc (Urgent Notice)
- **Tiêu đề:** `⚠️ Thời hạn bảo hành sắp kết thúc (còn 3 ngày)`
- **Nội dung:** `Quyền lợi bảo hành miễn phí cho đơn {code} chỉ còn 3 ngày (hết hạn ngày {warranty_end_date}). Nhấn vào đây để kiểm tra lại quyền lợi của bạn.`

#### 🔹 Mốc D-1 (Còn 1 ngày - Ngày áp chót): Thông báo khẩn cấp cuối cùng (Final Call)
- **Tiêu đề:** `🚨 Cơ hội cuối: Còn 24h để yêu cầu bảo hành`
- **Nội dung:** `Ngày mai là ngày cuối cùng trong thời hạn bảo hành 60 ngày của đơn {code}. Đặt lịch ngay hôm nay để được kỹ thuật viên hỗ trợ tốt nhất!`

### 4.4. Kênh phát thông báo
1. **Lưu Database:** Bảng `notifications` (để khách xem lại trong tab Hòm thư thông báo trên App).
2. **Realtime Socket.IO:** Phát event `notification:new` tới room của `customer_account_id`.
3. **Expo Push Notification:** Gửi push về thiết bị điện thoại qua Expo Push Token của user.

---

## 5. THUẬT TOÁN THẨM ĐỊNH TẠI BACKEND (SERVER PSEUDOCODE)

Dưới đây là hàm mẫu Node.js/Express để Backend Developer đưa vào Controller xử lý:

```javascript
// controllers/customerWarrantyController.js

const WORKING_SLOTS = [
  { id: '08h00 - 10h00', startHour: 8, endHour: 10 },
  { id: '10h00 - 12h00', startHour: 10, endHour: 12 },
  { id: '12h00 - 14h00', startHour: 12, endHour: 14 },
  { id: '14h00 - 16h00', startHour: 14, endHour: 16 },
  { id: '16h00 - 18h00', startHour: 16, endHour: 18 },
  { id: '18h00 - 20h00', startHour: 18, endHour: 20 },
];

const FINAL_DAY_CUTOFF_HOUR = 18; // Sau 18h00 ngày cuối cùng: ngắt tiếp nhận

export async function submitWarrantyRequest(req, res) {
  const { id } = req.params;
  const { scheduled_date, time_slot, issue_description, attachment_urls, contact_phone, contact_address } = req.body;
  const userId = req.user.id;

  // 1. Kiểm tra đơn gốc
  const originalOrder = await getOrderById(id);
  if (!originalOrder || originalOrder.customer_account_id !== userId) {
    return res.status(404).json({ ok: false, code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy đơn hàng' });
  }

  if (originalOrder.status !== 'DONE') {
    return res.status(400).json({ ok: false, code: 'WARRANTY_NOT_STARTED', message: 'Chỉ được bảo hành cho đơn đã hoàn tất' });
  }

  // 2. Kiểm tra trùng lặp
  const hasActiveWarranty = await checkActiveWarranty(originalOrder.id);
  if (hasActiveWarranty) {
    return res.status(409).json({ ok: false, code: 'WARRANTY_ALREADY_OPEN', message: 'Đơn này đang có một yêu cầu bảo hành đang xử lý' });
  }

  // 3. Tính toán thời gian Server (Timezone GMT+7)
  const now = new Date();
  const todayStr = formatDateYMD(now);
  const currentHour = now.getHours() + now.getMinutes() / 60;
  
  const warrantyDays = originalOrder.warranty_days || 60;
  const warrantyEndDate = addDays(formatDateYMD(originalOrder.completed_at), warrantyDays);

  // Đã qua ngày hết hạn
  if (todayStr > warrantyEndDate) {
    return res.status(400).json({ ok: false, code: 'WARRANTY_EXPIRED', message: 'Đơn hàng đã hết thời hạn bảo hành 60 ngày' });
  }

  // TRƯỜNG HỢP NGHIỆP VỤ BIÊN: Đúng ngày thứ 60 (Ngày cuối cùng)
  if (todayStr === warrantyEndDate) {
    // Điều kiện 1: Đã quá giờ làm việc của thợ chưa?
    if (currentHour >= FINAL_DAY_CUTOFF_HOUR) {
      return res.status(400).json({
        ok: false,
        code: 'WARRANTY_FINAL_DAY_CUTOFF',
        message: 'Hôm nay là ngày cuối cùng của thời hạn bảo hành và đã quá giờ làm việc khả dụng của kỹ thuật viên (sau 18h00).'
      });
    }

    // Điều kiện 2: Khách có chọn đúng ngày hôm nay không?
    if (scheduled_date !== todayStr) {
      return res.status(400).json({
        ok: false,
        code: 'WARRANTY_MUST_BE_TODAY',
        message: 'Hôm nay là ngày cuối của bảo hành, quý khách chỉ có thể đặt lịch hẹn trong ngày hôm nay.'
      });
    }

    // Điều kiện 3: Khung giờ chọn có còn khả dụng trong ngày không?
    const chosenSlot = WORKING_SLOTS.find(s => s.id === time_slot);
    if (!chosenSlot || chosenSlot.startHour <= currentHour) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_TIME_SLOT',
        message: 'Khung giờ đã chọn đã trôi qua. Vui lòng chọn ca tiếp theo.'
      });
    }
  } else {
    // Trường hợp ngày thường (< ngày thứ 60): Được chọn từ Hôm nay đến min(Hôm nay + 7, warrantyEndDate)
    const maxSelectableDate = minDate(addDays(todayStr, 7), warrantyEndDate);
    if (scheduled_date < todayStr || scheduled_date > maxSelectableDate) {
      return res.status(400).json({
        ok: false,
        code: 'DATE_OUT_OF_RANGE',
        message: `Ngày hẹn phải từ ${todayStr} đến trước ngày ${maxSelectableDate}`
      });
    }
  }

  // 4. Tạo đơn bảo hành mới
  const newWarrantyOrder = await createWarrantyRequestRecord({
    originalRequestId: originalOrder.id,
    customerId: userId,
    scheduledDate: scheduled_date,
    timeSlot: time_slot,
    description: issue_description,
    attachments: attachment_urls,
    phone: contact_phone || originalOrder.customer_phone,
    address: contact_address || originalOrder.address
  });

  return res.status(201).json({
    ok: true,
    message: 'Đã gửi yêu cầu bảo hành thành công',
    data: { request: newWarrantyOrder }
  });
}
```

---

## 6. MA TRẬN KIỂM THỬ (TEST MATRIX) DÀNH CHO BACKEND

Backend cần vượt qua 100% các Test Cases sau trước khi release:

| ID | Kịch bản kiểm thử (Test Scenario) | Input | Kỳ vọng kết quả (Expected Output) |
| :---: | :--- | :--- | :--- |
| **TC-01** | Ngày thứ 30, khách đặt lịch 3 ngày sau | `date: Today + 3`, `slot: 10h-12h` | `201 Created` - Đơn tạo thành công |
| **TC-02** | Ngày thứ 30, khách đặt lịch ngày 70 | `date: Today + 40` | `400 Bad Request` - `DATE_OUT_OF_RANGE` |
| **TC-03** | **Ngày thứ 60, khách gửi lúc 14:00, chọn ca 16h-18h hôm nay** | `date: Today`, `slot: 16h-18h` | **`201 Created` - Hợp lệ, tiếp nhận thành công** |
| **TC-04** | **Ngày thứ 60, khách gửi lúc 14:00 nhưng cố tình chọn ngày mai (Ngày 61)** | `date: Tomorrow` | **`400 Bad Request` - `WARRANTY_MUST_BE_TODAY`** |
| **TC-05** | **Ngày thứ 60, khách gửi lúc 18:30 (sau 18h00)** | Bất kỳ `date`/`slot` | **`400 Bad Request` - `WARRANTY_FINAL_DAY_CUTOFF`** |
| **TC-06** | Ngày thứ 61 (đã quá hạn) | Bất kỳ | `400 Bad Request` - `WARRANTY_EXPIRED` |
| **TC-07** | Đơn đang có 1 yêu cầu bảo hành `WARRANTY_PENDING` | Gửi thêm yêu cầu mới | `409 Conflict` - `WARRANTY_ALREADY_OPEN` |
| **TC-08** | Cronjob chạy lúc 08:30 sáng | Có đơn đến mốc 7, 3, 1 ngày | Bắn đúng số lượng push notification và ghi log bảng `notifications` |

---

## 7. KẾ HOẠCH PHỐI HỢP DEPLOY & THỬ NGHIỆM

1. **Bước 1 (Backend):** Triển khai API pre-check và update body API `POST .../warranty`.
2. **Bước 2 (Backend):** Cài đặt Cronjob nhắc hạn D-7, D-3, D-1 trên máy chủ staging.
3. **Bước 3 (Mobile App):** Cập nhật UI Modal chọn ngày giờ & tích hợp mã lỗi `WARRANTY_FINAL_DAY_CUTOFF`.
4. **Bước 4 (Joint Test):** Kiểm thử liên thông các kịch bản biên với dữ liệu mock ngày thứ 60.
