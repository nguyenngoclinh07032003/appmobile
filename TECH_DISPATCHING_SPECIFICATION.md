# ĐẶC TẢ KỸ THUẬT: MÔ HÌNH ĐIỀU PHỐI THÔNG MINH CÓ TRỌNG SỐ CHO KỸ THUẬT VIÊN (HRMSS)
> **Tài liệu bàn giao cho Backend Team**  
> **Phiên bản:** 1.0 | **Ngày ban hành:** 08/11/2026  
> **Phân hệ:** Quản lý Kỹ thuật viên & Điều phối đơn hàng (Field Service Management - FSM)

> [!NOTE]
> **Ghi chú thống nhất (cập nhật 11/2026)**
> - Trọng số: **Workload 0.40 / Distance 0.35 / Rating 0.25**. Ngưỡng top candidate: **Score ≥ 0.88 × Score cao nhất**, lấy tối đa 3 thợ, chọn ngẫu nhiên đồng xác suất. Mô hình **gán trực tiếp** (không có chợ việc/giật đơn).
> - Hai ngưỡng khác nhau: **`max_active_jobs = 3`** (lọc cứng — số việc *đang mở* `assigned`/`confirmed` cùng lúc) và **`N_max_daily = 5`** (chỉ dùng để *chấm điểm* workload — tổng việc được giao trong ngày, kể cả đã hoàn thành).
> - SQL/code mẫu đã sửa: điều kiện khu vực `(t.service_area = $3 OR distance <= $radius)`; khoảng cách mặc định `calculateDistance(...) ?? 3.5` (dùng `??` để 0 km không bị thay bằng 3.5); UNIQUE lịch dùng **partial index** loại trừ `cancelled`/`declined`; thêm trạng thái `declined`.
> - Mã đơn tiền tố `HRM` (ví dụ `HRM261108-03`); địa bàn ví dụ Hà Nội (Cầu Giấy). Bảo hành theo hạng 60/75/90/120 ngày. App thợ hiện nhận việc mới qua đồng bộ/polling; push notification là hướng phát triển.

---

## 1. BỐI CẢNH NGHIỆP VỤ & ĐẶT VẤN ĐỀ

### 1.1. Tại sao không thể dùng "Random thuần túy 100%" (Pure Random)?
Hệ thống Thợ HRMSS là mô hình dịch vụ kỹ thuật điện lạnh, gia dụng tại nhà của công ty, **khác hoàn toàn với mô hình tài xế công nghệ (Grab / Gojek / Be)**:
- **Kỹ năng chuyên môn bắt buộc:** Thợ điện lạnh không thể làm vệ sinh bình nóng lạnh nếu không có đồ nghề và chuyên môn.
- **Lịch hẹn theo khung giờ (Time-slot):** Khách đặt khung giờ cố định (ví dụ: `10h00 - 12h00`), thợ đã có lịch trong khung giờ đó không được phép nhận thêm việc trùng giờ.
- **Địa bàn phụ trách:** Thợ di chuyển bằng xe máy mang đồ nghề, nếu random thợ ở Long Biên sang Cầu Giấy (Hà Nội) giờ cao điểm sẽ gây trễ hẹn với khách và lãng phí chi phí di chuyển.
- **Cân bằng KPI nội bộ:** Thợ công ty hưởng lương/thưởng theo năng suất, nếu random ngẫu nhiên sẽ dẫn tới tình trạng có thợ quá tải còn thợ khác không có việc làm.

### 1.2. Giải pháp: Điều phối thông minh có trọng số (Smart Weighted Dispatching)
Hệ thống kết hợp giữa **Bộ lọc cứng (Hard Filters)** để loại bỏ người không phù hợp $\rightarrow$ **Tính điểm tối ưu (Scoring)** $\rightarrow$ **Random có kiểm soát trong Top 2 - 3 thợ tối ưu nhất** để vừa công bằng, vừa tối ưu chi phí vận hành.

---

## 2. QUY TRÌNH GIẢI THUẬT (FLOW ARCHITECTURE)

```
[Khách hàng đặt lịch thành công (Order O)]
                    │
                    ▼
       ┌───────────────────────────┐
       │   GIAI ĐOẠN 1: LỌC CỨNG   │
       │     (Hard Constraints)    │
       └─────────────┬─────────────┘
                     │
     ┌───────────────┴───────────────┐
     ▼                               ▼
Thỏa mãn đủ 4 tiêu chí:           Không tìm thấy thợ phù hợp:
1. Đúng chuyên môn thiết bị       ➔ Kích hoạt Fallback:
2. Cùng khu vực / Bán kính <= 7km   - Mở rộng bán kính lên 12km
3. Không trùng khung giờ hẹn        - Hoặc chuyển Admin Web gán tay
4. Chưa vượt quá 3 việc đang mở (max_active_jobs)
     │
     ▼
┌─────────────────────────────────┐
│ GIAI ĐOẠN 2: CHẤM ĐIỂM TỐI ƯU   │
│     (Weighted Scoring Model)    │
└────────────────┬────────────────┘
                 │
                 ├── 1. Điểm cân bằng tải Workload (40%)
                 ├── 2. Điểm khoảng cách di chuyển Distance (35%)
                 └── 3. Điểm đánh giá & uy tín Rating (25%)
                 │
                 ▼
┌─────────────────────────────────┐
│ GIAI ĐOẠN 3: RANDOM CÓ KIỂM SOÁT│
└────────────────┬────────────────┘
                 │
                 ▼
- Xếp hạng điểm từ cao xuống thấp
- Lấy các thợ có Score >= 0.88 × Score cao nhất (tối đa 3)
- Random đồng xác suất trong nhóm Top (≤ 3)
                 │
                 ▼
[Gán đơn cho Thợ được chọn]
- Gửi thông báo Push Notification đến App Thợ
- Kích hoạt đếm ngược phản hồi: 15 phút (Assignment TTL)
```

---

## 3. CÔNG THỨC TOÁN HỌC & TIÊU CHÍ CHẤM ĐIỂM

### 3.1. Giai đoạn 1: Bộ lọc cứng (Hard Constraints)
Một kỹ thuật viên $t_i$ thuộc tập hợp thợ $T$ chỉ được coi là ứng viên hợp lệ ($t_i \in T_{valid}$) khi thỏa mãn đồng thời cả 4 điều kiện:

$$\forall t_i \in T, \quad t_i \in T_{valid} \iff \big(C_{skill}(t_i, O) \land C_{area}(t_i, O) \land C_{time}(t_i, O) \land C_{cap}(t_i)\big)$$

| Điều kiện | Vị từ logic | Giải thích |
|---|---|---|
| **Chuyên môn** | $O.category \in t_i.skills$ | Thợ có đăng ký kỹ năng sửa loại thiết bị này. |
| **Khu vực** | $d(t_i.station, O.location) \le 7\text{ km}$ hoặc $t_i.area = O.district$ | Nằm trong phạm vi di chuyển hợp lý. |
| **Không trùng lịch** | $\nexists \text{ Slot } \in t_i.schedule \text{ trùng } (O.date, O.slot)$ | Khung giờ hẹn của khách thợ chưa có lịch nào. |
| **Giới hạn việc đang mở** | $t_i.active\_jobs < max\_active\_jobs \; (=3)$ | Số việc `assigned`/`confirmed` chưa xong cùng lúc. Khác với $N_{max\_daily}=5$ ở công thức workload (tổng việc trong ngày, chỉ dùng để chấm điểm). |

---

### 3.2. Giai đoạn 2: Công thức tính điểm tổng hợp ($Score$)
Với mỗi thợ hợp lệ $t_i \in T_{valid}$, hệ thống tính điểm từ 0 đến 100:

$$Score(t_i) = 0.40 \times S_{workload}(t_i) + 0.35 \times S_{distance}(t_i, O) + 0.25 \times S_{rating}(t_i)$$

#### 1. Điểm cân bằng tải công việc ($S_{workload}$ - Trọng số 40%):
Ưu tiên thợ có ít đơn trong ngày/tuần hơn để đảm bảo thu nhập và KPI công bằng giữa các thành viên:
$$S_{workload}(t_i) = \left( 1 - \frac{N_{today}(t_i)}{N_{max\_daily}} \right) \times 100$$
*(Ví dụ: $N_{max\_daily} = 5$ đơn. Thợ A mới làm 1 đơn thì $S_{workload} = 80$; Thợ B đã làm 4 đơn thì $S_{workload} = 20$. $N_{today}$ = tổng việc được giao trong ngày, kể cả đã hoàn thành, trừ việc huỷ/từ chối. Ngưỡng này khác `max_active_jobs = 3` ở bộ lọc cứng.)*

#### 2. Điểm khoảng cách địa lý ($S_{distance}$ - Trọng số 35%):
Ưu tiên thợ ở gần nhà khách nhất (tính theo tọa độ GPS hoặc trạm gần nhất):
$$S_{distance}(t_i, O) = \max\left(0, \; 100 - \frac{d(t_i, O)}{R_{max}} \times 100\right)$$
*(Với $R_{max} = 7\text{ km}$. Khoảng cách càng gần thì điểm càng tiệm cận 100).*

#### 3. Điểm đánh giá chất lượng ($S_{rating}$ - Trọng số 25%):
Khuyến khích thợ duy trì thái độ phục vụ tốt và không vi phạm kỷ luật:
$$S_{rating}(t_i) = \left( \frac{Rating(t_i)}{5.0} \right) \times 100$$

---

### 3.3. Giai đoạn 3: Phân bổ ngẫu nhiên có kiểm soát (Controlled Random)
1. Sắp xếp danh sách $T_{valid}$ theo thứ tự giảm dần của $Score(t_i)$.
2. Chọn ra nhóm ứng viên hàng đầu:
   $$TopCandidates = \{ t \in T_{valid} \mid Score(t) \ge 0.88 \times Score(t_{max}) \} \quad (\text{Lấy tối đa 3 thợ})$$
3. **Random ngẫu nhiên 1 thợ trong nhóm $TopCandidates$**:
   $$P(t_k) = \frac{1}{|TopCandidates|}, \quad \forall t_k \in TopCandidates$$

*Cách làm này giải quyết triệt để yêu cầu của doanh nghiệp: Vừa đảm bảo người được chọn nằm trong nhóm làm tốt nhất, vừa có yếu tố ngẫu nhiên để tránh khiếu nại thiên vị công việc.*

---

## 4. THIẾT KẾ CƠ SỞ DỮ LIỆU ĐỀ XUẤT (DATABASE SCHEMA)

### 4.1. Bảng `technicians` (Kỹ thuật viên)
```sql
CREATE TABLE technicians (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,             -- vd: "THO-001"
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    skills JSONB NOT NULL,                         -- vd: ["may-lanh", "tu-lanh", "may-giat"]
    service_area VARCHAR(100) NOT NULL,            -- vd: "Cầu Giấy"
    station_lat DOUBLE PRECISION,                  -- Tọa độ trạm thường trực
    station_lng DOUBLE PRECISION,
    max_active_jobs INT DEFAULT 3,                 -- Số việc song song tối đa
    rating DECIMAL(2,1) DEFAULT 5.0,              -- Điểm đánh giá (1.0 - 5.0)
    reputation_score INT DEFAULT 100,              -- Điểm uy tín
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tech_skills ON technicians USING GIN (skills);
CREATE INDEX idx_tech_area ON technicians(service_area);
```

### 4.2. Bảng `technician_schedules` (Lịch làm việc của Thợ)
```sql
CREATE TABLE technician_schedules (
    id SERIAL PRIMARY KEY,
    tech_id INT REFERENCES technicians(id) ON DELETE CASCADE,
    order_id INT NOT NULL,
    work_date DATE NOT NULL,                      -- vd: '2026-11-08'
    time_slot VARCHAR(50) NOT NULL,               -- vd: '10h00 - 12h00'
    status VARCHAR(20) DEFAULT 'assigned',        -- 'assigned', 'confirmed', 'completed', 'declined', 'cancelled'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Một thợ chỉ có 1 lịch HIỆU LỰC mỗi khung giờ; lịch đã huỷ/bị từ chối không chặn việc gán lại.
CREATE UNIQUE INDEX unique_tech_slot_active
    ON technician_schedules(tech_id, work_date, time_slot)
    WHERE status NOT IN ('cancelled', 'declined');
CREATE INDEX idx_sched_tech_date ON technician_schedules(tech_id, work_date);
```

### 4.3. Bảng `dispatch_logs` (Nhật ký điều phối để đối soát)
```sql
CREATE TABLE dispatch_logs (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL,
    assigned_tech_id INT REFERENCES technicians(id),
    candidate_scores JSONB,                       -- Lưu danh sách điểm của các ứng viên để đối soát
    status VARCHAR(20) DEFAULT 'pending_ack',     -- 'pending_ack', 'accepted', 'declined', 'timeout'
    decline_reason VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,                -- Thời điểm hết hạn 15 phút
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. THAM KHẢO CODE BACKEND (TYPESCRIPT / NODE.JS)

Backend có thể tham khảo trực tiếp logic sau:

```typescript
import { db } from '../database';

interface OrderDispatchPayload {
  orderId: number;
  orderCode: string;
  category: string;
  bookingDate: string;      // 'YYYY-MM-DD'
  timeSlot: string;         // '10h00 - 12h00'
  district: string;
  customerLat?: number;
  customerLng?: number;
}

const MAX_DAILY_JOBS = 5;      // N_max_daily: chỉ dùng chấm điểm workload
const R_MAX_KM = 7;            // bán kính chuẩn (fallback mở rộng 12 km)
const DEFAULT_DIST_KM = 3.5;   // khi thiếu toạ độ thợ/khách

export async function dispatchOrderSmart(order: OrderDispatchPayload, radiusKm = R_MAX_KM) {
  const hasGps = order.customerLat != null && order.customerLng != null;

  // 1. LỌC CỨNG (Hard Constraints)
  //  - today_count : tổng việc trong ngày (trừ huỷ/từ chối) -> chấm điểm workload (N_today / 5)
  //  - active_count: việc đang mở assigned/confirmed        -> lọc cứng < max_active_jobs (3)
  //  - Khu vực: cùng service_area HOẶC trạm trong bán kính (Haversine, km)
  const candidateTechs = await db.query(`
    SELECT t.*,
      (SELECT COUNT(*) FROM technician_schedules s
        WHERE s.tech_id = t.id AND s.work_date = $1
          AND s.status NOT IN ('cancelled', 'declined')) AS today_count,
      (SELECT COUNT(*) FROM technician_schedules s
        WHERE s.tech_id = t.id AND s.work_date = $1
          AND s.status IN ('assigned', 'confirmed')) AS active_count
    FROM technicians t
    WHERE t.is_active = TRUE
      AND t.skills ? $2
      AND (
        t.service_area = $3
        OR ($5::float8 IS NOT NULL AND t.station_lat IS NOT NULL AND
            6371 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS(t.station_lat - $5) / 2), 2) +
              COS(RADIANS($5)) * COS(RADIANS(t.station_lat)) *
              POWER(SIN(RADIANS(t.station_lng - $6) / 2), 2)
            )) <= $7)
      )
      AND NOT EXISTS (
        SELECT 1 FROM technician_schedules s
        WHERE s.tech_id = t.id
          AND s.work_date = $1
          AND s.time_slot = $4
          AND s.status IN ('assigned', 'confirmed')
      )
  `, [order.bookingDate, order.category, order.district, order.timeSlot,
      hasGps ? order.customerLat : null, hasGps ? order.customerLng : null, radiusKm]);

  // Lọc ngưỡng việc đang mở (max_active_jobs mặc định 3)
  const eligibleTechs = candidateTechs.rows.filter(t => Number(t.active_count) < t.max_active_jobs);

  // Kịch bản ngoại lệ: Không có thợ nào thỏa mãn
  if (eligibleTechs.length === 0) {
    console.warn(`[Dispatch] Không có thợ khả dụng cho đơn ${order.orderCode} -> Chuyển Fallback`);
    return handleDispatchFallback(order); // mở rộng 7 -> 12 km rồi chuyển Admin gán tay
  }

  // 2. CHẤM ĐIỂM TỐI ƯU (Scoring)
  const scored = eligibleTechs.map(tech => {
    // Điểm cân bằng tải: N_today / N_max_daily (5)
    const workloadScore = Math.max(0, (1 - (Number(tech.today_count) / MAX_DAILY_JOBS)) * 100);

    // Điểm khoảng cách: calculateDistance trả null khi thiếu toạ độ -> mặc định 3.5 km.
    // Dùng ?? (không dùng ||) để khoảng cách 0 km hợp lệ không bị thay thành 3.5.
    const distKm = calculateDistance(tech.station_lat, tech.station_lng, order.customerLat, order.customerLng) ?? DEFAULT_DIST_KM;
    const distanceScore = Math.max(0, 100 - (distKm / R_MAX_KM) * 100);

    // Điểm đánh giá sao
    const ratingScore = (Number(tech.rating || 5.0) / 5.0) * 100;

    const totalScore = (workloadScore * 0.40) + (distanceScore * 0.35) + (ratingScore * 0.25);
    return { ...tech, totalScore };
  });

  // Sắp xếp điểm giảm dần
  scored.sort((a, b) => b.totalScore - a.totalScore);

  // 3. RANDOM CÓ KIỂM SOÁT TRONG TOP ≤ 3 (ngưỡng 0.88)
  const topScore = scored[0].totalScore;
  const topCandidates = scored.filter(t => t.totalScore >= topScore * 0.88).slice(0, 3);
  
  // Random ngẫu nhiên 1 người trong nhóm Top
  const selectedTech = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  // 4. LƯU LỊCH & KÍCH HOẠT HẸN GIỜ 15 PHÚT (TIMEOUT)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 phút sau
  
  await db.query(`
    INSERT INTO technician_schedules (tech_id, order_id, work_date, time_slot, status)
    VALUES ($1, $2, $3, $4, 'assigned')
  `, [selectedTech.id, order.orderId, order.bookingDate, order.timeSlot]);

  await db.query(`
    INSERT INTO dispatch_logs (order_id, assigned_tech_id, candidate_scores, expires_at)
    VALUES ($1, $2, $3, $4)
  `, [order.orderId, selectedTech.id, JSON.stringify(scored), expiresAt]);

  // Gửi Push Notification đến App của thợ được chọn (hướng phát triển — hiện app thợ nhận việc qua đồng bộ/polling)
  await sendPushNotification(selectedTech.id, {
    title: 'Việc mới được phân công!',
    body: `Đơn ${order.orderCode} tại ${order.district}. Bạn có 15 phút để bấm Nhận việc.`,
    data: { orderCode: order.orderCode }
  });

  return { success: true, assignedTech: selectedTech };
}
```

---

## 6. ĐẶC TẢ API CONTRACT (APP MOBILE ↔ BACKEND)

### 6.1. `GET /api/v1/tech/assigned-jobs`
Lấy danh sách các đơn đang được phân công cho thợ đăng nhập.
- **Request Headers:** `Authorization: Bearer <tech_jwt_token>`
- **Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "order_code": "HRM261108-01",
      "service_name": "Vệ sinh máy lạnh treo tường (Inverter)",
      "category": "may-lanh",
      "booking_date": "2026-11-08",
      "time_slot": "14h00 - 16h00",
      "customer": {
        "name": "Nguyễn Văn A",
        "phone_masked": "0912***456",
        "address": "123 Trần Duy Hưng, Trung Hoà, Cầu Giấy, Hà Nội",
        "distance_km": 2.8
      },
      "assigned_at": "2026-11-08T11:15:00Z",
      "expires_at": "2026-11-08T11:30:00Z",
      "dispatch_note": "Hệ thống tự động phân công theo chuyên môn Điện lạnh & khu vực Cầu Giấy"
    }
  ]
}
```

### 6.2. `POST /api/v1/tech/jobs/:order_code/accept`
Thợ bấm "Nhận việc".
- **Request Headers:** `Authorization: Bearer <tech_jwt_token>`
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Đã tiếp nhận công việc thành công",
  "order": {
    "order_code": "HRM261108-01",
    "status": "confirmed",
    "customer_full_phone": "0912345678"
  }
}
```

### 6.3. `POST /api/v1/tech/jobs/:order_code/decline`
Thợ từ chối đơn kèm lý do.
- **Request Headers:** `Authorization: Bearer <tech_jwt_token>`
- **Request Body:**
```json
{
  "reason_code": "VEHICLE_BREAKDOWN", 
  "reason_note": "Xe bị thủng săm đang trên đường sửa"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Đã ghi nhận lý do từ chối. Hệ thống đang tự động chuyển tiếp đơn cho kỹ thuật viên tiếp theo."
}
```

---

## 7. XỬ LÝ CÁC TRƯỜNG HỢP BIÊN (EDGE CASES)

1. **Hết thời hạn 15 phút thợ không bấm nhận (Assignment Timeout):**
   - Backend dùng Redis Key Expiration (hoặc Scheduled Cron Job chạy mỗi 1 phút).
   - Khi hết hạn: Chuyển trạng thái đơn thợ cũ thành `timeout`, tự động lấy thợ xếp vị trí thứ 2 trong `dispatch_logs.candidate_scores` để gán tiếp.
2. **Thợ từ chối có lý do:**
   - Hệ thống tự động gán tiếp cho ứng viên kế tiếp trong danh sách điểm cao.
   - Thợ từ chối quá 3 lần/tuần không lý do chính đáng sẽ bị trừ điểm uy tín theo chính sách công ty.
3. **Khu vực không còn thợ khả dụng:**
   - Tự động nâng bán kính tìm kiếm $R_{max}$ từ $7\text{ km} \rightarrow 12\text{ km}$.
   - Nếu vẫn không có: Bắn thông báo Socket/Notification lên Dashboard của **Admin Web** (Trưởng trạm kỹ thuật) để gán tay hoặc gọi điện dời lịch hẹn với khách hàng.

---

## 8. ĐẶC TẢ GIAO DIỆN MOBILE APP (UI/UX SPECIFICATION)

Để đồng bộ với giải thuật backend, phía giao diện ứng dụng di động (Mobile App) được thiết kế theo đúng chuẩn tác phong Kỹ thuật viên Doanh nghiệp (Field Service) thay vì tài xế công nghệ (Ride-hailing):

### 8.1. Phân hệ Thợ (Technician App)

#### A. Thẻ việc mới được phân công (Assigned Job Card)
- **Tiêu đề:** `VIỆC ĐƯỢC PHÂN CÔNG` (kèm đồng hồ đếm ngược `⏳ Còn 14:30`).
- **Khung giờ hẹn:** Hiển thị rõ khung giờ hẹn trước của khách (vd: `14h00 - 16h00 Hôm nay`).
- **Hộp nhãn lý do phân công (Dispatch Transparency Tags):**
  - `✓ Đúng chuyên môn: [Tên chuyên môn]` (vd: Điện Lạnh).
  - `✓ Khu vực phụ trách: [Tên khu vực]` (vd: Cầu Giấy).
  - `✓ Lịch hẹn trống: [Khung giờ]` (Tránh xung đột ca làm).
- **Hành động:**
  - Nút chính `[ TIẾP NHẬN CA ]` (Variant primary).
  - Nút phụ `[ Từ chối ]` (Mở modal chọn lý do công việc: *Xe hỏng / Ca trước phát sinh / Nghỉ đột xuất*).

#### B. Tab "Lịch làm việc" (Work Schedule Timeline)
- Hiển thị công việc theo từng khung giờ hẹn trong ngày (Timeline Slot 2 tiếng).
- Thể hiện trạng thái trực quan: `Đã hoàn thành` | `Đang thực hiện` | `Ca tiếp theo`.

#### C. Chỉ số năng suất lao động (Workload & KPI)
- Thay vì hiển thị "Thu nhập cuốc xe kiểu Grab", giao diện thể hiện:
  - `Số ca hoàn thành trong ngày:` (vd: 2/4 ca).
  - `Tỷ lệ hoàn thành đúng hẹn (On-time Rate):` $\ge 98\%$.
  - `Điểm đánh giá chất lượng:` 4.9★.

### 8.2. Phân hệ Khách hàng (Customer App)

#### A. Màn hình chờ điều phối (Dispatching Progress)
- **Tiêu đề:** `ĐANG ĐIỀU PHỐI KỸ THUẬT VIÊN CHUYÊN TRÁCH...`
- **Thông điệp:** *"Hệ thống đang lựa chọn kỹ thuật viên đúng chuyên môn và gần bạn nhất để đảm bảo chất lượng dịch vụ và đúng giờ hẹn."*
- **Cam kết dịch vụ:**
  - `[✓]` Đúng chuyên môn kỹ thuật thiết bị.
  - `[✓]` Cam kết có mặt đúng khung giờ đã chọn.
  - `[✓]` Bảo hành dịch vụ theo hạng thành viên (60 / 75 / 90 / 120 ngày).

#### B. Thẻ kỹ thuật viên đã tiếp nhận (Assigned Tech Card)
- Ảnh đại diện, họ tên, mã nhân viên (vd: `THO-042`).
- Chuyên môn kỹ thuật & Đánh giá sao (`★ 4.9`).
- Nút liên hệ: `[ Gọi điện ]` & `[ Nhắn tin trực tiếp ]`.
- Thời gian dự kiến xuất phát và có mặt tại nhà khách hàng.

