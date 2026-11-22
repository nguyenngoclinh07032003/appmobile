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
