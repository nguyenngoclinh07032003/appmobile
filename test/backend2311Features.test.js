import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-loader.mjs';

const { syncCatalogFromBackend } = await import('../src/constants/data.js');
const {
  normalizeAssignmentRole,
  isSupportAssignment,
  isSupportWaitingForLead,
  isStepInSupportScope,
  resolveCategoryNamesByIds,
} = await import('../src/utils/teamHelpers.js');
const {
  isSundayYmd,
  buildHolidayMap,
  getNonWorkingDayInfo,
  findFirstWorkingDayIndex,
  getHolidayQueryRange,
} = await import('../src/utils/workingDays.js');
const {
  MATERIAL_WARRANTY_STATUS_META,
  extractMaterialWarrantiesFromQuotations,
  validateQuoteItemWarrantyFields,
  buildQuoteItemWarrantyPayload,
} = await import('../src/utils/materialWarranty.js');
const { analyzeWarrantyEligibility } = await import('../src/utils/warrantyPolicy.js');
const { toVietnamese, viServerMessage } = await import('../src/utils/viText.js');
const { formatAttendanceCheckInError, isAttendanceNotifType } = await import('../src/utils/attendance.js');
const {
  mapBackendCustomerRequestToOrder,
  mapBackendTechJobToOrder,
} = await import('../src/services/syncService.js');

const SAMPLE_CATEGORIES = [
  { id: 'c1', dbId: 1, label: 'Điện lạnh' },
  { id: 'c2', dbId: 2, label: 'Điện nước' },
];

const SAMPLE_SERVICES = [
  { id: 's101', dbId: 101, service_id: 101, category: 'c1', categoryId: 1, name: 'Vệ sinh máy lạnh' },
  { id: 's201', dbId: 201, service_id: 201, category: 'c2', categoryId: 2, name: 'Sửa ống nước rò rỉ' },
];

syncCatalogFromBackend({
  categories: [
    { category_id: 1, category_name: 'Điện lạnh', is_active: true },
    { category_id: 2, category_name: 'Điện nước', is_active: true },
  ],
  services: [
    { service_id: 101, category_id: 1, service_name: 'Vệ sinh máy lạnh', base_price: 250000 },
    { service_id: 201, category_id: 2, service_name: 'Sửa ống nước rò rỉ', base_price: 200000 },
  ],
  materials: [],
});

describe('Team role & support scope helpers', () => {
  test('normalizeAssignmentRole và isSupportAssignment xử lý đúng LEAD/SUPPORT và giá trị rỗng', () => {
    assert.equal(normalizeAssignmentRole('SUPPORT'), 'SUPPORT');
    assert.equal(normalizeAssignmentRole('support'), 'SUPPORT');
    assert.equal(normalizeAssignmentRole('LEAD'), 'LEAD');
    assert.equal(normalizeAssignmentRole(undefined), 'LEAD');

    assert.equal(isSupportAssignment({ assignmentRole: 'SUPPORT' }), true);
    assert.equal(isSupportAssignment({ assignmentRole: 'LEAD' }), false);
    assert.equal(isSupportAssignment({}), false);
  });

  test('isSupportWaitingForLead chỉ bật khi thợ phụ đã check-in nhưng visit_status vẫn SCHEDULED', () => {
    assert.equal(
      isSupportWaitingForLead({ assignmentRole: 'SUPPORT', arrivedAt: 1700000000000, visitStatus: 'SCHEDULED' }),
      true,
    );
    assert.equal(
      isSupportWaitingForLead({ assignmentRole: 'SUPPORT', checkIn: { at: 1700000000000 }, visitStatus: 'IN_PROGRESS' }),
      false,
    );
    assert.equal(
      isSupportWaitingForLead({ assignmentRole: 'LEAD', arrivedAt: 1700000000000, visitStatus: 'SCHEDULED' }),
      false,
    );
  });

  test('isStepInSupportScope giới hạn đúng danh mục của thợ phụ', () => {
    const supportOrder = {
      assignmentRole: 'SUPPORT',
      supportCategoryIds: [1],
      items: [{ id: 's101', name: 'Vệ sinh máy lạnh', categoryId: 1 }],
    };
    const leadOrder = { assignmentRole: 'LEAD', supportCategoryIds: [1] };

    assert.equal(isStepInSupportScope({ service_id: 201, category_id: 2 }, leadOrder, SAMPLE_SERVICES), true);
    assert.equal(isStepInSupportScope({ service_id: 101 }, supportOrder, SAMPLE_SERVICES), true);
    assert.equal(isStepInSupportScope({ service_id: 201 }, supportOrder, SAMPLE_SERVICES), false);
    assert.equal(isStepInSupportScope({ category_id: 2 }, supportOrder, SAMPLE_SERVICES), false);
  });

  test('resolveCategoryNamesByIds trả nhãn danh mục và fallback an toàn', () => {
    assert.deepEqual(
      resolveCategoryNamesByIds([1, 2, 99, 1], SAMPLE_CATEGORIES),
      ['Điện lạnh', 'Điện nước', 'Danh mục #99'],
    );
  });
});

describe('Working days, Sundays & Holidays helpers', () => {
  test('isSundayYmd và buildHolidayMap phân loại đúng Chủ nhật & ngày lễ', () => {
    assert.equal(isSundayYmd('2026-11-22'), true);
    assert.equal(isSundayYmd('2026-11-23'), false);

    const hMap = buildHolidayMap([
      { date: '2026-11-24', name: 'Nghỉ bảo trì hệ thống' },
      { date: '2027-01-01T00:00:00Z', name: 'Tết Dương lịch' },
    ]);
    assert.equal(hMap.get('2026-11-24'), 'Nghỉ bảo trì hệ thống');
    assert.equal(hMap.get('2027-01-01'), 'Tết Dương lịch');
  });

  test('getNonWorkingDayInfo chặn đúng HOLIDAY và SUNDAY theo config', () => {
    const holidays = [{ date: '2026-11-25', name: 'Ngày hội công ty' }];
    const hol = getNonWorkingDayInfo('2026-11-25', { holidays, sundaysClosed: true });
    assert.equal(hol.blocked, true);
    assert.equal(hol.reason, 'HOLIDAY');
    assert.equal(hol.shortLabel, 'Nghỉ lễ');

    const sunBlocked = getNonWorkingDayInfo('2026-11-22', { holidays, sundaysClosed: true });
    assert.equal(sunBlocked.blocked, true);
    assert.equal(sunBlocked.reason, 'SUNDAY');
    assert.equal(sunBlocked.shortLabel, 'Nghỉ CN');

    const sunOpen = getNonWorkingDayInfo('2026-11-22', { holidays, sundaysClosed: false });
    assert.equal(sunOpen.blocked, false);

    const normal = getNonWorkingDayInfo('2026-11-24', { holidays, sundaysClosed: true });
    assert.equal(normal.blocked, false);
  });

  test('findFirstWorkingDayIndex bỏ qua ngày hết giờ, Chủ nhật và ngày lễ', () => {
    const days = [
      { key: '2026-11-21' }, // Hôm nay nhưng hết slot
      { key: '2026-11-22' }, // Chủ nhật
      { key: '2026-11-23' }, // Ngày lễ
      { key: '2026-11-24' }, // Ngày làm việc hợp lệ đầu tiên
    ];
    const idx = findFirstWorkingDayIndex(
      days,
      { holidays: [{ date: '2026-11-23', name: 'Ngày lễ' }], sundaysClosed: true },
      { isTodayOutOfSlots: true },
    );
    assert.equal(idx, 3);
  });

  test('getHolidayQueryRange tạo khoảng YYYY-MM-DD hợp lệ và analyzeWarrantyEligibility không vỡ policy cũ', () => {
    const range = getHolidayQueryRange(90, new Date('2026-11-23T03:00:00Z'));
    assert.match(range.from, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(range.to, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(range.to > range.from);

    const wRes = analyzeWarrantyEligibility({
      completedAt: new Date(2026, 9, 1, 9, 0, 0).getTime(),
      warrantyDays: 60,
      serverNow: new Date(2026, 10, 1, 9, 0, 0).getTime(),
    });
    assert.equal(wRes.eligible, true);
  });
});

describe('Material warranty helpers & payload rules', () => {
  test('MATERIAL_WARRANTY_STATUS_META có đủ 6 trạng thái của backend', () => {
    for (const st of ['PENDING', 'VALID', 'EXPIRING_SOON', 'OUT_OF_WARRANTY', 'REPLACED', 'VOID']) {
      assert.ok(MATERIAL_WARRANTY_STATUS_META[st], `Thiếu metadata cho ${st}`);
      assert.ok(MATERIAL_WARRANTY_STATUS_META[st].label);
    }
  });

  test('validateQuoteItemWarrantyFields và buildQuoteItemWarrantyPayload chặn gửi warranty_days với vật tư kho', () => {
    const overSn = validateQuoteItemWarrantyFields({ serialNumber: 'A'.repeat(101) });
    assert.equal(overSn.ok, false);

    const codeWithoutDays = validateQuoteItemWarrantyFields({
      isExternalPurchase: true,
      externalWarrantyCode: 'BH-LG-123',
      warrantyDays: '',
    });
    assert.equal(codeWithoutDays.ok, false);

    const badDays = validateQuoteItemWarrantyFields({
      isExternalPurchase: true,
      warrantyDays: '4000',
    });
    assert.equal(badDays.ok, false);

    const validExt = validateQuoteItemWarrantyFields({
      isExternalPurchase: true,
      warrantyDays: '180',
      externalWarrantyCode: 'BH-DAIKIN-99',
      serialNumber: 'SN-001',
    });
    assert.equal(validExt.ok, true);

    // Vật tư HRMSS kho KHÔNG được phép gửi warranty_days hay external_warranty_code
    const hrmssPayload = buildQuoteItemWarrantyPayload({
      isMaterial: true,
      isExternalPurchase: false,
      warrantyDays: 180,
      externalWarrantyCode: 'SHOULD-DROP',
      serialNumber: 'SN-HRMSS-1',
    });
    assert.deepEqual(hrmssPayload, { serial_number: 'SN-HRMSS-1' });

    const extPayload = buildQuoteItemWarrantyPayload({
      isMaterial: true,
      isExternalPurchase: true,
      warrantyDays: 365,
      externalWarrantyCode: 'BH-EXT-2',
      serialNumber: 'SN-EXT-2',
    });
    assert.deepEqual(extPayload, {
      serial_number: 'SN-EXT-2',
      warranty_days: 365,
      external_warranty_code: 'BH-EXT-2',
    });

    assert.deepEqual(buildQuoteItemWarrantyPayload({ isMaterial: false, serialNumber: 'X' }), {});
  });

  test('extractMaterialWarrantiesFromQuotations trích xuất đúng bảo hành từ danh sách báo giá', () => {
    const list = extractMaterialWarrantiesFromQuotations([
      {
        quotation_id: 88,
        quotation_status: 'APPROVED',
        created_at: '2026-11-23T10:00:00Z',
        items: [
          {
            quotation_item_id: 501,
            item_type: 'MATERIAL',
            material_id: null,
            is_external_purchase: true,
            description_snapshot: '[VT ngoài dự kiến 900.000đ - 1.200.000đ] Block nén LG',
            quantity: 1,
            receipt_url: 'https://cdn.example/receipt.jpg',
            warranties: [
              {
                material_warranty_id: 19,
                status: 'VALID',
                warranty_days: 180,
                serial_number: 'SN-LG-900',
                external_warranty_code: 'BH-LG-900',
                starts_at: '2026-11-23T10:00:00Z',
                expires_at: '2027-05-22T10:00:00Z',
                remaining_days: 180,
                replaces_id: 11,
              },
            ],
          },
        ],
      },
    ]);

    assert.equal(list.length, 1);
    assert.equal(list[0].id, 19);
    assert.equal(list[0].itemName, 'Block nén LG');
    assert.equal(list[0].isExternalPurchase, true);
    assert.equal(list[0].warrantyDays, 180);
    assert.equal(list[0].serialNumber, 'SN-LG-900');
    assert.equal(list[0].externalWarrantyCode, 'BH-LG-900');
    assert.equal(list[0].replacesId, 11);
    assert.equal(list[0].receiptUrl, 'https://cdn.example/receipt.jpg');
  });
});

describe('syncService & Vietnamese error code mappings', () => {
  test('mapBackendCustomerRequestToOrder map support_technicians (không có SĐT) & materialWarranties', () => {
    const mapped = mapBackendCustomerRequestToOrder({
      request_id: 9001,
      request_code: 'REQ-9001',
      status: 'IN_PROGRESS',
      scheduled_date: '2026-11-24',
      time_slot: '09:00-11:00',
      technician: { technician_id: 10, full_name: 'Nguyễn Văn A', phone: '0901234567' },
      support_technicians: [
        {
          technician_id: 22,
          full_name: 'Trần Văn B',
          rating_average: 4.9,
          category_ids: [1, 2],
          phone: '0999888777',
        },
      ],
      items: [{ request_item_id: 1, service_id: 101, category_id: 1, quantity: 1 }],
      quotations: [
        {
          quotation_id: 77,
          quotation_status: 'APPROVED',
          items: [
            {
              quotation_item_id: 701,
              item_type: 'MATERIAL',
              material_id: 5,
              description_snapshot: 'Tụ đề 35uF',
              quantity: 1,
              warranties: [{ material_warranty_id: 30, status: 'PENDING', serial_number: 'SN-TU-35' }],
            },
          ],
        },
      ],
    });

    assert.equal(mapped.supportTechnicians.length, 1);
    assert.equal(mapped.supportTechnicians[0].name, 'Trần Văn B');
    assert.equal(mapped.supportTechnicians[0].rating, 4.9);
    assert.deepEqual(mapped.supportTechnicians[0].categoryIds, [1, 2]);
    assert.equal('phone' in mapped.supportTechnicians[0], false);
    assert.equal(mapped.materialWarranties.length, 1);
    assert.equal(mapped.materialWarranties[0].serialNumber, 'SN-TU-35');
  });

  test('mapBackendTechJobToOrder map assignment_role, support_category_ids, visit_status & tương thích ngược', () => {
    const supportJob = mapBackendTechJobToOrder({
      assignment_id: 501,
      assignment_role: 'SUPPORT',
      support_category_ids: [1],
      visit_status: 'SCHEDULED',
      assignment_status: 'ACTIVE',
      request: {
        request_id: 9002,
        request_code: 'REQ-9002',
        status: 'ASSIGNED',
        scheduled_date: '2026-11-24',
        time_slot: '09:00-11:00',
        items: [{ request_item_id: 1, service_id: 101, quantity: 1 }],
      },
    });

    assert.equal(supportJob.assignmentRole, 'SUPPORT');
    assert.deepEqual(supportJob.supportCategoryIds, [1]);
    assert.equal(supportJob.visitStatus, 'SCHEDULED');

    const legacyJob = mapBackendTechJobToOrder({
      assignment_id: 502,
      assignment_status: 'ACTIVE',
      request: {
        request_id: 9003,
        request_code: 'REQ-9003',
        status: 'ASSIGNED',
        scheduled_date: '2026-11-24',
        time_slot: '09:00-11:00',
        items: [{ request_item_id: 1, service_id: 101, quantity: 1 }],
      },
    });
    assert.equal(legacyJob.assignmentRole, 'LEAD');
    assert.deepEqual(legacyJob.supportCategoryIds, []);
  });

  test('viServerMessage, toVietnamese và formatAttendanceCheckInError dịch đủ các mã lỗi mới 23/11/2026', () => {
    for (const code of [
      'LEAD_NOT_STARTED',
      'OUTSIDE_SUPPORT_SCOPE',
      'LEAD_ONLY',
      'NOT_A_WORKING_DAY',
      'ON_LEAVE',
      'SHIFT_NOT_USABLE',
      'NON_WORKING_DAY',
      'MATERIAL_WARRANTY_NOT_FOUND',
      'MATERIAL_WARRANTY_NOT_ACTIVE',
      'MATERIAL_WARRANTY_CLOSED',
      'HOLIDAY_EXISTS',
      'LEAVE_DUPLICATE',
    ]) {
      const msg = viServerMessage(null, code);
      assert.ok(msg && msg !== code && msg !== 'Có lỗi xảy ra. Vui lòng thử lại.', `Mã ${code} phải được dịch sang tiếng Việt (${msg})`);
    }

    const waitMsg = toVietnamese('Wait for the lead technician to check in before starting your part.');
    assert.ok(waitMsg && /thợ chính/i.test(waitMsg), `Phải dịch câu chờ thợ chính (${waitMsg})`);

    assert.match(formatAttendanceCheckInError({ code: 'SHIFT_NOT_USABLE', reason: 'ON_LEAVE' }).message, /hiệu lực|hôm nay/i);
    assert.match(formatAttendanceCheckInError({ code: 'NOT_A_WORKING_DAY' }).message, /ngày nghỉ|Chủ nhật|lễ/i);
    assert.match(formatAttendanceCheckInError({ code: 'ON_LEAVE' }).message, /nghỉ/i);
    assert.equal(isAttendanceNotifType('LEAVE_RECORDED'), true);
    assert.equal(isAttendanceNotifType('LEAVE_CANCELLED'), true);
  });
});
