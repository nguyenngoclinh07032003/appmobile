import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/register-loader.mjs';

const sync = await import('../src/services/syncService.js');

test('syncService: buildPreferredTimeIso và formatSlotFromIso giữ nguyên phút lẻ và giữ bucket giờ chẵn', () => {
  const iso15 = sync.buildPreferredTimeIso('2026-11-22', '15h45 - 17h45');
  assert.ok(iso15);
  assert.equal(sync.formatSlotFromIso(iso15), '15h45 - 17h45');

  const iso00 = sync.buildPreferredTimeIso('2026-11-22', '08h00 - 10h00');
  assert.ok(iso00);
  assert.equal(sync.formatSlotFromIso(iso00), '08h00 - 10h00');
});

test('syncService: mapBackendPhotoToEvidence và extractInitialAttachments lọc ảnh [Bảo hành]', () => {
  const warrantyEv = sync.mapBackendPhotoToEvidence({
    id: 101,
    image_url: 'https://cdn.example.com/bh.jpg',
    description: '[Bảo hành] lỗi tái phát',
    uploaded_by_role: 'CUSTOMER',
  });
  assert.equal(warrantyEv.isWarrantyUpload, true);
  assert.equal(warrantyEv.isCustomerInitial, false);

  const initEv = sync.mapBackendPhotoToEvidence({
    id: 102,
    image_url: 'https://cdn.example.com/init.jpg',
    description: 'Ảnh hiện trạng ban đầu',
    uploaded_by_role: 'CUSTOMER',
  });
  assert.equal(initEv.isWarrantyUpload, false);
  assert.equal(initEv.isCustomerInitial, true);

  const initial = sync.extractInitialAttachments(
    [warrantyEv, initEv],
    [
      { id: 101, image_url: 'https://cdn.example.com/bh.jpg', description: '[Bảo hành] lỗi tái phát' },
      { id: 102, image_url: 'https://cdn.example.com/init.jpg', description: 'Ảnh hiện trạng ban đầu' },
    ],
  );
  assert.deepEqual(initial.map((x) => x.uri), ['https://cdn.example.com/init.jpg']);
});

test('syncService: mergeBackendOrdersWithLocal kiểm tra đổi thợ, revisionRequested và _evidenceFetched rỗng', () => {
  // 1) Đổi thợ khi local đang onway -> không giữ onway và xoá tracking cũ
  const reassigned = sync.mergeBackendOrdersWithLocal(
    [{
      dbRequestId: 901,
      code: 'REQ-901',
      status: 'onway',
      tech: { code: 'THO-01' },
      tracking: { eta: '10 phút' },
    }],
    [{
      dbRequestId: 901,
      code: 'REQ-901',
      status: 'confirmed',
      tech: { code: 'THO-02' },
    }],
  );
  assert.equal(reassigned[0].status, 'confirmed');
  assert.equal(reassigned[0].tracking, null);

  // 2) Cùng thợ đang onway -> giữ trạng thái onway và tracking cục bộ
  const sameTechOnway = sync.mergeBackendOrdersWithLocal(
    [{
      dbRequestId: 902,
      code: 'REQ-902',
      status: 'onway',
      tech: { code: 'THO-01' },
      tracking: { eta: '8 phút' },
    }],
    [{
      dbRequestId: 902,
      code: 'REQ-902',
      status: 'confirmed',
      tech: { code: 'THO-01' },
    }],
  );
  assert.equal(sameTechOnway[0].status, 'onway');
  assert.deepEqual(sameTechOnway[0].tracking, { eta: '8 phút' });

  // 3) Khách yêu cầu sửa báo giá (revisionRequested) -> không giữ trạng thái repairing cục bộ
  const revised = sync.mergeBackendOrdersWithLocal(
    [{
      dbRequestId: 903,
      code: 'REQ-903',
      status: 'repairing',
      tech: { code: 'THO-01' },
    }],
    [{
      dbRequestId: 903,
      code: 'REQ-903',
      status: 'diagnosing',
      tech: { code: 'THO-01' },
      quote: { revisionRequested: true },
    }],
  );
  assert.equal(revised[0].status, 'diagnosing');

  // 4) Backend đã fetch evidence rỗng (_evidenceFetched: true, evidence: []) -> không hồi sinh ảnh local
  const clearedEvidence = sync.mergeBackendOrdersWithLocal(
    [{
      dbRequestId: 904,
      code: 'REQ-904',
      status: 'confirmed',
      evidence: [{ id: 'att-1', uri: 'https://cdn.example.com/old.jpg' }],
    }],
    [{
      dbRequestId: 904,
      code: 'REQ-904',
      status: 'confirmed',
      _evidenceFetched: true,
      evidence: [],
    }],
  );
  assert.deepEqual(clearedEvidence[0].evidence, []);
});

const { toVnParts, vnTimestamp } = await import('../src/utils/vnTime.js');
const { ALLOW_ALL_TIME_SLOTS, isDayOutOfSlots } = await import('../src/utils/dateTime.js');
const { getCancellationWindowStatus, assessCancelAfterAccept } = await import('../src/constants/techPolicy.js');
const { viServerMessage } = await import('../src/utils/viText.js');
const { isOnSiteQuote, draftFromOrder } = await import('../src/screens/tech/components/useQuoteDraft.js');

test('vnTime & dateTime: weekday GMT+7 và kiểm tra hết ca theo cấu hình ALLOW_ALL_TIME_SLOTS', () => {
  // 2026-11-22 18:00 UTC = 2026-11-23 01:00 VN (Thứ Hai -> weekday 1)
  const p = toVnParts(Date.UTC(2026, 10, 22, 18, 0, 0));
  assert.equal(p.year, 2026);
  assert.equal(p.month, 11);
  assert.equal(p.day, 23);
  assert.equal(p.weekday, 1);

  if (ALLOW_ALL_TIME_SLOTS) {
    assert.equal(isDayOutOfSlots(0, new Date(vnTimestamp(2026, 11, 22, 19, 15))), false);
    assert.equal(isDayOutOfSlots(0, new Date(vnTimestamp(2026, 11, 22, 19, 20))), false);
    assert.equal(isDayOutOfSlots(0, new Date(vnTimestamp(2026, 11, 22, 23, 55))), true);
  } else {
    assert.equal(isDayOutOfSlots(0, new Date(vnTimestamp(2026, 11, 22, 19, 15))), false);
    assert.equal(isDayOutOfSlots(0, new Date(vnTimestamp(2026, 11, 22, 19, 20))), true);
  }
});

test('techPolicy: cửa sổ huỷ miễn phí 60 phút và mức phạt out_of_warranty', () => {
  const now = Date.UTC(2026, 10, 22, 5, 0, 0);
  assert.equal(
    getCancellationWindowStatus({ status: 'confirmed', preferredTimeAt: now + 59 * 60 * 1000 }, now).allowed,
    false,
  );
  assert.equal(
    getCancellationWindowStatus({ status: 'confirmed', preferredTimeAt: now + 61 * 60 * 1000 }, now).allowed,
    true,
  );
  const penalty = assessCancelAfterAccept({ status: 'out_of_warranty', preferredTimeAt: now + 3 * 3600 * 1000 }, now);
  assert.equal(penalty.tier, 'onway');
  assert.equal(penalty.free, false);
});

test('syncService: giữ nguyên khung giờ lẻ và không nhảy sang repairing khi needs_quotation = true', () => {
  assert.equal(sync.formatSlotFromIso('2026-11-22T01:00:00+07:00'), '01h00 - 03h00');
  assert.equal(sync.formatSlotFromIso('2026-11-22T09:00:00+07:00'), '09h00 - 11h00');
  assert.equal(sync.formatSlotFromIso('2026-11-22T15:00:00+07:00'), '15h00 - 17h00');
  assert.equal(sync.formatSlotFromIso('2026-11-22T19:00:00+07:00'), '19h00 - 21h00');
  assert.equal(sync.formatSlotFromIso('2026-11-22T22:30:00+07:00'), '22h30 - 24h00');

  const mapped = sync.mapBackendCustomerRequestToOrder({
    request_id: 950,
    request_code: 'REQ-950',
    request_status: 'IN_PROGRESS',
    preferred_payment_method: 'CASH',
    created_at: '2026-11-22T01:00:00Z',
    items: [{ request_service_id: 1, service_id: 1, service_name: 'Sửa máy lạnh', quantity: 1, selected_price: 200000 }],
    visits: [{ visit_status: 'IN_PROGRESS' }],
    quotations: [],
    diagnoses: [{ findings: 'Hỏng tụ', needs_quotation: true, recorded_at: '2026-11-22T02:00:00Z' }],
  });
  assert.equal(mapped.status, 'diagnosing');
});

test('viText: giữ thông báo tiếng Việt hợp lệ và chặn chuỗi Anh/Việt lẫn lộn chưa dịch', () => {
  const vnOk = 'Bạn thao tác quá nhanh, vui lòng thử lại sau';
  assert.equal(viServerMessage(vnOk, null, 429), vnOk);

  const mixedOut = viServerMessage('Unhandled glitch occurred khi server xu ly request', null, 400);
  assert.ok(!/glitch|Unhandled/i.test(mixedOut));
});

test('useQuoteDraft: phân biệt báo giá trước khi đi, out_of_warranty và tách tiền tố đề xuất tự động', () => {
  assert.equal(
    isOnSiteQuote({
      status: 'diagnosing',
      arrivedAt: null,
      checkIn: null,
      quote: { revisionRequested: true, isSupplemental: false },
    }),
    false,
  );
  assert.equal(isOnSiteQuote({ status: 'out_of_warranty' }), true);

  const draft = draftFromOrder({
    code: 'ORD-OOW',
    kind: 'warranty',
    status: 'out_of_warranty',
    outOfWarranty: true,
    items: [{ id: 'custom-1', name: 'Sửa board', qty: 1, price: 350000 }],
    evidence: [{ stage: 'diagnosis', note: '[Triệu chứng] Hỏng tụ (Sửa chữa)' }],
    quote: {
      symptoms: 'Hỏng tụ (Sửa chữa)',
      recommendation: 'Sửa chữa: Hỏng tụ. Kiểm tra lại nguồn cấp',
      lines: [],
    },
  });
  assert.equal(draft.lines[0].price, 350000);
  assert.equal(draft.recommendation, 'Kiểm tra lại nguồn cấp');
});
