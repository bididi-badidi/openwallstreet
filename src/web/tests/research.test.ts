import test from 'node:test';
import assert from 'node:assert/strict';
import { pageChunks, sourceSpan, sourceUrl, boundedBytes } from '../research/sources';
import { resolveIssuer, type Collected } from '../research/data';
import { buildReport } from '../research/report';
import { secureCompare, requestJob, ServiceError } from '../lib/job-service';

test('supported company resolution uses exact aliases', () => {
  assert.equal(resolveIssuer('MSFT')?.id, 'microsoft');
  assert.equal(resolveIssuer('Google')?.id, 'alphabet');
  assert.equal(resolveIssuer('Tesla')?.id, 'tesla');
  assert.equal(resolveIssuer('Microsoft competitor'), undefined);
});
test('source hosts and protocols cannot be broadened by model URLs', () => {
  assert.equal(sourceUrl('https://www.microsoft.com/report', ['www.microsoft.com']).hostname, 'www.microsoft.com');
  for (const url of ['http://www.microsoft.com/report', 'https://www.microsoft.com.evil.test/report',
    'https://www.microsoft.com@evil.test/', 'https://127.0.0.1/', 'https://www.microsoft.com:8000/']) {
    assert.throws(() => sourceUrl(url, ['www.microsoft.com']));
  }
});
test('chunks retain page numbers and only whitespace can change in quotations', () => {
  const pages = [{ page: 7, text: 'The revenue was $40 million.' }, { page: 8, text: 'A long page '.repeat(20) }];
  const chunks = pageChunks(pages, 50);
  assert.equal(chunks[0][0].page, 7);
  assert.equal(chunks.flat().filter(p => p.page === 8).map(p => p.text).join(''), pages[1].text);
  assert.equal(sourceSpan('revenue was $40 million', 'revenue\nwas $40  million'), 'revenue\nwas $40  million');
  assert.equal(sourceSpan('revenue was $41 million', pages[0].text), null);
  assert.equal(sourceSpan('', pages[0].text), null);
});
test('streaming reads enforce both declared and observed limits', async () => {
  await assert.rejects(() => boundedBytes(new Response('12345'), 4), /source_size_limit/);
  await assert.rejects(() => boundedBytes(new Response('1', { headers: { 'content-length': '100' } }), 4), /source_size_limit/);
});
test('secret comparison and service binding do not use public HTTP', async () => {
  assert.equal(await secureCompare('private-code', 'private-code'), true);
  assert.equal(await secureCompare('', 'private-code'), false);
  const calls: string[] = [];
  const binding = { async fetch(url: string, init: RequestInit) {
    calls.push(url);
    assert.equal(new Headers(init.headers).get('Idempotency-Key'), 'test-job-id');
    return Response.json({ id: 'test-job-id', status: 'queued' });
  } };
  const result = await requestJob({ binding, token: 'service-secret' }, undefined, 'Microsoft', 'test-job-id');
  assert.equal(result.status, 'queued');
  assert.deepEqual(calls, ['https://research.internal/jobs']);
});
test('capacity rejection remains actionable', async () => {
  const binding = { async fetch() { return Response.json({ error: 'private detail' }, { status: 429 }); } };
  await assert.rejects(() => requestJob({ binding, token: 'secret' }, undefined, 'Microsoft'),
    error => error instanceof ServiceError && error.status === 429 && !error.message.includes('private detail'));
});
test('report preserves partial coverage and avoids invented outcomes and dates', () => {
  const result: Collected = { year: 2024, document: { title: 'Annual report', url: 'https://www.microsoft.com/report',
    company: 'Microsoft Corporation', report_type: 'annual', period_end: '2024-06-30', fiscal_year: 2024,
    publication_date: null, identity: 'test' }, snapshot: { url: 'https://www.microsoft.com/report',
    sha256: 'test', retrieved_at: '2026-10-01', pages: [], method: 'PDF', total_pages: 3, truncated: false },
    claims: [{ category: 'measurable_promise', summary: 'Open 12 stores', excerpt: 'We commit to open 12 stores.',
      page: 3, section: 'MD&A', target_date: null, numeric_target: '12', unit: 'stores', attribution: null,
      uncertainties: ['No individual identified'], is_highlight: true }], gaps: ['Later chunk failed'], extractedChunks: 1, totalChunks: 2 };
  const failed: Collected = { year: 2023, document: null, snapshot: null, claims: [], gaps: ['Missing source'], extractedChunks: 0, totalChunks: 0 };
  const report = buildReport('Microsoft Corporation', '2026-10-01', [result, failed]);
  assert.equal(report.events[0].month, '2024-06');
  assert.equal(report.events[0].date_kind, 'Report period end');
  assert.equal(report.events[0].decision_by, 'unknown');
  assert.equal(report.assessments[1].value, 'Not assessed');
  assert.equal(report.coverage[0].status, 'report not retrieved');
  assert.equal(report.collection_gaps.length, 2);
  assert.throws(() => buildReport('Microsoft', '2026-10-01', [failed]), /no_verified_evidence/);
});
