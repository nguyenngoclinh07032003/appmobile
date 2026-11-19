import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-loader.mjs';

const {
  SYMPTOM_PHOTO_PREFIX,
  formatSymptomPhotoNote,
  parseSymptomPhotoTitle,
  parseSymptomsField,
  buildSymptomsSummary,
  buildSymptomRecommendationFallback,
  draftFromOrder,
} = await import('../src/screens/tech/components/useQuoteDraft.js');
const {
  stripSymptomsPrefixFromDiagnosis,
  stripAutoRecommendationPrefix,
  parseSymptomPhotoMeta,
} = await import('../src/utils/symptomItems.js');
const { isQuotationPendingCustomer } = await import('../src/utils/externalPartsPricing.js');
const {
  mapBackendCustomerRequestToOrder,
  mergeCustomerRequestDetail,
  mapBackendPhotoToEvidence,
  extractInitialAttachments,
} = await import('../src/services/syncService.js');

test('symptomDraft: mã hoá và tách tiêu đề ảnh triệu chứng', () => {
  const note = formatSymptomPhotoNote('Chảy nước dàn lạnh');
  assert.equal(note, `${SYMPTOM_PHOTO_PREFIX}Chảy nước dàn lạnh`);
  assert.equal(parseSymptomPhotoTitle(note), 'Chảy nước dàn lạnh');
  assert.equal(parseSymptomPhotoTitle('Minh chứng chẩn đoán'), null);
});

test('symptomDraft: buildSymptomsSummary và buildSymptomRecommendationFallback', () => {
  const tags = ['Máy yếu lạnh'];
  const items = [
    { id: 's1', title: 'Hỏng tụ điện', action: 'replace' },
    { id: 's2', title: 'Rò rỉ ống thoát nước', action: 'repair' },
  ];
  assert.equal(
    buildSymptomsSummary(tags, items),
    'Máy yếu lạnh, Hỏng tụ điện (Thay thế), Rò rỉ ống thoát nước (Sửa chữa)',
  );
  assert.equal(
    buildSymptomRecommendationFallback(items),
    'Thay thế: Hỏng tụ điện; Sửa chữa: Rò rỉ ống thoát nước',
  );
});

test('symptomDraft: parseSymptomsField và draftFromOrder khôi phục đúng collapsible + ảnh theo triệu chứng', () => {
  const rawSymptoms = 'Không mát, Chảy nước dàn lạnh (Sửa chữa), Hỏng cảm biến (Thay thế)';
  const evidence = [
    { id: 'att-1', stage: 'diagnosis', note: '[Triệu chứng] Chảy nước dàn lạnh', uri: 'https://example.com/drain.jpg' },
    { id: 'att-2', stage: 'diagnosis', note: '[Triệu chứng] Bám bụi dàn nóng', uri: 'https://example.com/coil.jpg' },
    { id: 'att-3', stage: 'diagnosis', note: 'Minh chứng chẩn đoán', uri: 'https://example.com/general.jpg' },
  ];

  const parsed = parseSymptomsField(rawSymptoms, evidence);
  assert.deepEqual(parsed.tags, ['Không mát']);
  assert.equal(parsed.symptomItems.length, 3);
  assert.equal(parsed.symptomItems[0].title, 'Chảy nước dàn lạnh');
  assert.equal(parsed.symptomItems[0].action, 'repair');
  assert.equal(parsed.symptomItems[0].photoUri, 'https://example.com/drain.jpg');
  assert.equal(parsed.symptomItems[0].photos.length, 1);
  assert.equal(parsed.symptomItems[1].title, 'Hỏng cảm biến');
  assert.equal(parsed.symptomItems[1].action, 'replace');
  assert.equal(parsed.symptomItems[1].photoUri, null);
  assert.equal(parsed.symptomItems[1].photos.length, 0);
  assert.equal(parsed.symptomItems[2].title, 'Bám bụi dàn nóng');
  assert.equal(parsed.symptomItems[2].action, '');
  assert.equal(parsed.symptomItems[2].photoUri, 'https://example.com/coil.jpg');

  const draft = draftFromOrder({
    code: 'ORD-100',
    status: 'diagnosing',
    arrivedAt: Date.now(),
    items: [{ id: 's1', name: 'Vệ sinh máy lạnh', qty: 1, price: 180000 }],
    evidence,
    quote: {
      symptoms: rawSymptoms,
      diagnosis: `${rawSymptoms}. Dàn lạnh bám bẩn và cảm biến sai trị số`,
      recommendation: 'Sửa chữa: Chảy nước dàn lạnh; Thay thế: Hỏng cảm biến',
      lines: [],
    },
  });

  assert.deepEqual(draft.tags, ['Không mát']);
  assert.equal(draft.symptomItems.length, 3);
  assert.equal(draft.diagnosis, 'Dàn lạnh bám bẩn và cảm biến sai trị số');
});

test('symptomItems: tách tiền tố triệu chứng & đề xuất tự động trùng lặp cho UI Khách', () => {
  const items = [
    { id: 's1', title: 'Hỏng tụ điện', action: 'replace' },
    { id: 's2', title: 'Nghẹt ống xả', action: 'repair' },
  ];
  const rawSymptoms = 'Hỏng tụ điện (Thay thế), Nghẹt ống xả (Sửa chữa)';
  assert.equal(
    stripSymptomsPrefixFromDiagnosis(`${rawSymptoms}. Tụ yếu chỉ số`, rawSymptoms, [], items),
    'Tụ yếu chỉ số',
  );
  assert.equal(stripSymptomsPrefixFromDiagnosis(rawSymptoms, rawSymptoms, [], items), '');

  const auto = 'Thay thế: Hỏng tụ điện; Sửa chữa: Nghẹt ống xả';
  assert.equal(stripAutoRecommendationPrefix(auto, items), '');
  assert.equal(
    stripAutoRecommendationPrefix(`${auto}. Vệ sinh lại dàn lạnh`, items),
    'Vệ sinh lại dàn lạnh',
  );
});

test('syncService: giữ diagnosisReport cho Khách ngay cả khi đơn 0đ phát sinh (chưa có quotations)', () => {
  const mapped = mapBackendCustomerRequestToOrder({
    request_id: 901,
    request_code: 'REQ-901',
    request_status: 'IN_PROGRESS',
    preferred_payment_method: 'CASH',
    created_at: '2026-11-20T00:10:00Z',
    items: [{ request_service_id: 1, service_id: 1, service_name: 'Vệ sinh máy lạnh', quantity: 1, selected_price: 180000 }],
    visits: [{ visit_status: 'IN_PROGRESS', needs_quotation: false }],
    quotations: [],
    diagnoses: [
      {
        symptoms: 'Chảy nước dàn lạnh (Sửa chữa)',
        findings: 'Nghẹt máng thoát nước',
        repair_recommendation: 'Sửa chữa: Chảy nước dàn lạnh',
        recorded_at: '2026-11-20T00:15:00Z',
      },
    ],
  });

  assert.equal(mapped.quote, null);
  assert.ok(mapped.diagnosisReport);
  assert.equal(mapped.diagnosisReport.symptoms, 'Chảy nước dàn lạnh (Sửa chữa)');
  assert.equal(mapped.diagnosisReport.diagnosis, 'Nghẹt máng thoát nước');
  assert.equal(mapped.diagnosisReport.recommendation, 'Sửa chữa: Chảy nước dàn lạnh');
});

test('symptomItems: khôi phục triệu chứng, ảnh và (Thay thế)/(Sửa chữa) từ ghi chú ảnh khi rawSymptoms trống', () => {
  const replaceNote = formatSymptomPhotoNote('Hỏng tụ điện', 'replace');
  const repairNote = formatSymptomPhotoNote('Nghẹt ống xả', 'repair');
  assert.equal(replaceNote, '[Triệu chứng] Hỏng tụ điện (Thay thế)');
  assert.equal(repairNote, '[Triệu chứng] Nghẹt ống xả (Sửa chữa)');
  assert.deepEqual(parseSymptomPhotoMeta(replaceNote), { title: 'Hỏng tụ điện', action: 'replace' });
  assert.deepEqual(parseSymptomPhotoMeta(repairNote), { title: 'Nghẹt ống xả', action: 'repair' });
  assert.equal(parseSymptomPhotoTitle(replaceNote), 'Hỏng tụ điện');

  const parsed = parseSymptomsField('', [
    { id: 'att-10', stage: 'diagnosis', note: replaceNote, uri: 'https://example.com/tu.jpg' },
    { id: 'att-11', stage: 'diagnosis', note: repairNote, uri: 'https://example.com/ong.jpg' },
  ]);
  assert.equal(parsed.symptomItems.length, 2);
  assert.equal(parsed.symptomItems[0].title, 'Hỏng tụ điện');
  assert.equal(parsed.symptomItems[0].action, 'replace');
  assert.equal(parsed.symptomItems[0].photoUri, 'https://example.com/tu.jpg');
  assert.equal(parsed.symptomItems[1].title, 'Nghẹt ống xả');
  assert.equal(parsed.symptomItems[1].action, 'repair');
  assert.equal(parsed.symptomItems[1].photoUri, 'https://example.com/ong.jpg');
});

test('syncService: mergeCustomerRequestDetail đưa báo giá SENT và PENDING sang trạng thái quoted cho Khách', () => {
  const listRow = {
    request_id: 902,
    request_code: 'REQ-902',
    request_status: 'DIAGNOSED_PENDING_QUOTATION',
    preferred_payment_method: 'CASH',
    created_at: '2026-11-20T00:10:00Z',
    items: [{ request_service_id: 1, service_id: 1, service_name: 'Vệ sinh máy lạnh', quantity: 1, selected_price: 180000 }],
  };
  // Trước khi tải chi tiết, list không có quotations -> chưa hiện báo giá.
  assert.equal(mapBackendCustomerRequestToOrder(listRow).status, 'diagnosing');
  assert.equal(mapBackendCustomerRequestToOrder(listRow).quote, null);

  // Sau khi tải GET /customer/requests/:id dạng lồng { request: { quotations, diagnoses } }
  const merged = mergeCustomerRequestDetail(listRow, {
    request: {
      request_id: 902,
      request_status: 'DIAGNOSED_PENDING_QUOTATION',
      quotations: [
        {
          quotation_id: 501,
          quotation_code: 'QT-501',
          quotation_type: 'SUPPLEMENTAL',
          quotation_status: 'SENT',
          sent_at: '2026-11-20T00:20:00Z',
          total_amount: 120000,
          items: [
            { quotation_item_id: 88, item_type: 'MATERIAL', material_id: 2, description_snapshot: 'Tụ đề 35uF', quantity: 1, unit_price: 120000 },
          ],
        },
      ],
      diagnoses: [
        {
          symptoms: 'Hỏng tụ điện (Thay thế)',
          findings: 'Tụ đề suy giảm điện dung',
          repair_recommendation: 'Thay thế: Hỏng tụ điện',
          recorded_at: '2026-11-20T00:19:00Z',
        },
      ],
    },
  });
  const mappedSent = mapBackendCustomerRequestToOrder(merged);
  assert.equal(mappedSent.status, 'quoted');
  assert.ok(mappedSent.quote);
  assert.equal(mappedSent.quote.status, 'SENT');
  assert.equal(mappedSent.quote.symptoms, 'Hỏng tụ điện (Thay thế)');
  assert.equal(mappedSent.diagnosisReport.symptoms, 'Hỏng tụ điện (Thay thế)');
  assert.ok(mappedSent.quote.lines.some((l) => l.name === 'Tụ đề 35uF'));

  // Kiểm tra thêm trường hợp mảng quotations đặt ngang cấp và trạng thái quotation_status = PENDING
  assert.equal(isQuotationPendingCustomer({ quotation_status: 'PENDING' }), true);
  assert.equal(isQuotationPendingCustomer({ quotation_status: 'SENT', customer_decision: 'APPROVED' }), false);
  const mergedPending = mergeCustomerRequestDetail(
    { ...listRow, request_id: 903, request_code: 'REQ-903', request_status: 'IN_PROGRESS' },
    {
      request: { request_id: 903, request_status: 'IN_PROGRESS' },
      quotations: [
        {
          quotation_id: 502,
          quotation_type: 'SUPPLEMENTAL',
          quotation_status: 'PENDING',
          items: [{ quotation_item_id: 89, item_type: 'SERVICE', description_snapshot: 'Hàn lại ống đồng', quantity: 1, unit_price: 150000 }],
        },
      ],
      diagnoses: [{ symptoms: 'Xì ga đầu tán (Sửa chữa)', findings: 'Rò nhẹ đầu nối' }],
    },
  );
  const mappedPending = mapBackendCustomerRequestToOrder(mergedPending);
  assert.equal(mappedPending.status, 'quoted');
  assert.equal(mappedPending.quote.status, 'SENT');
  assert.ok(mappedPending.quote.lines.some((l) => l.name === 'Hàn lại ống đồng'));
});

test('syncService: mapBackendPhotoToEvidence & extractInitialAttachments giữ đúng ảnh triệu chứng ban đầu khách gửi', () => {
  const custPhoto = mapBackendPhotoToEvidence({
    attachment_id: 701,
    request_id: 905,
    image_url: 'https://example.com/customer-init.jpg',
    uploaded_at: '2026-11-20T00:05:00Z',
  });
  assert.equal(custPhoto.stage, 'diagnosis');
  assert.equal(custPhoto.isCustomerInitial, true);
  assert.equal(custPhoto.uri, 'https://example.com/customer-init.jpg');

  const techSymPhoto = mapBackendPhotoToEvidence({
    attachment_id: 702,
    job_id: 88,
    evidence_type: 'PROBLEM_PHOTO',
    description: '[Triệu chứng] Hỏng tụ (Thay thế)',
    image_url: 'https://example.com/tech-sym.jpg',
  });
  assert.equal(techSymPhoto.stage, 'diagnosis');
  assert.equal(techSymPhoto.isCustomerInitial, false);

  const initials = extractInitialAttachments([custPhoto, techSymPhoto]);
  assert.equal(initials.length, 1);
  assert.equal(initials[0].uri, 'https://example.com/customer-init.jpg');
});

test('syncService: trích xuất diagnoses trong visits hoặc work_performed và ảnh từ chi tiết đơn', () => {
  const merged = mergeCustomerRequestDetail(
    {
      request_id: 906,
      request_code: 'REQ-4722337491',
      request_status: 'COMPLETED',
      problem_description: 'Tôi muốn vệ sinh',
      preferred_payment_method: 'CASH',
      created_at: '2026-11-19T12:00:00Z',
      items: [{ request_service_id: 1, service_id: 3, service_name: 'Vệ sinh Quạt đứng/treo tường', quantity: 2, selected_price: 150000 }],
    },
    {
      request: {
        request_id: 906,
        request_status: 'COMPLETED',
        visits: [
          {
            visit_id: 1,
            visit_status: 'COMPLETED',
            work_performed: 'Đã hoàn thành: Vệ sinh Quạt đứng/treo tường. Tình trạng: Thiết bị bẩn, hiệu suất giảm. Thiết bị hoạt động ổn định, đã dọn dẹp khu vực.',
          },
        ],
        quotations: [
          {
            quotation_id: 601,
            quotation_status: 'APPROVED',
            quotation_type: 'SUPPLEMENTAL',
            total_amount: 480000,
            items: [{ quotation_item_id: 11, item_type: 'MATERIAL', material_id: 5, description_snapshot: 'Tụ điện block máy lạnh', quantity: 1, unit_price: 350000 }],
          },
        ],
        attachments: [
          { attachment_id: 801, request_id: 906, image_url: 'https://example.com/fan-initial.jpg' },
        ],
      },
    },
  );
  const mapped = mapBackendCustomerRequestToOrder(merged);
  assert.ok(mapped.diagnosisReport);
  assert.equal(mapped.diagnosisReport.diagnosis, 'Thiết bị bẩn, hiệu suất giảm');
  assert.equal(mapped.quote.diagnosis, 'Thiết bị bẩn, hiệu suất giảm');
  assert.equal(mapped.attachments.length, 1);
  assert.equal(mapped.attachments[0].uri, 'https://example.com/fan-initial.jpg');
});

test('syncService: phân loại ảnh AFTER_REPAIR khi hoàn thành công việc và giữ đủ ảnh Trước & Sau trong chi tiết đơn', () => {
  const afterPhoto = mapBackendPhotoToEvidence({
    attachment_id: 901,
    job_id: 55,
    procedure_step_id: 12,
    evidence_type: 'AFTER_REPAIR',
    description: 'Ảnh hoàn thành bàn giao thiết bị',
    image_url: 'https://example.com/after-repair.jpg',
  });
  assert.equal(afterPhoto.stage, 'after');
  assert.equal(afterPhoto.isCustomerInitial, false);
  assert.equal(extractInitialAttachments([afterPhoto]).length, 0);

  const merged = mergeCustomerRequestDetail(
    {
      request_id: 910,
      request_code: 'REQ-910',
      request_status: 'COMPLETED',
    },
    {
      request: {
        request_id: 910,
        request_status: 'COMPLETED',
        attachments: [
          { attachment_id: 911, request_id: 910, image_url: 'https://example.com/before-init.jpg' },
          { attachment_id: 912, job_id: 70, procedure_step_id: 3, evidence_type: 'BEFORE_REPAIR', image_url: 'https://example.com/step-before-ignored.jpg' },
          { attachment_id: 913, job_id: 70, procedure_step_id: 4, evidence_type: 'AFTER_REPAIR', image_url: 'https://example.com/step-after-kept.jpg' },
        ],
      },
    },
  );
  assert.equal(merged._detailAttachments.length, 2);
  const mappedPhotos = merged._detailAttachments.map(mapBackendPhotoToEvidence);
  assert.equal(mappedPhotos[0].stage, 'diagnosis');
  assert.equal(mappedPhotos[0].isCustomerInitial, true);
  assert.equal(mappedPhotos[1].stage, 'after');
  assert.equal(mappedPhotos[1].uri, 'https://example.com/step-after-kept.jpg');
});
