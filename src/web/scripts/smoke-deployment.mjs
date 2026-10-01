import assert from 'node:assert/strict';

const base = new URL(process.env.DEPLOY_URL || '');
assert.equal(base.protocol, 'https:', 'DEPLOY_URL must use HTTPS');
assert.ok(!base.username && !base.password && base.pathname === '/' && !base.search && !base.hash,
  'DEPLOY_URL must be the public site origin');
// These checks never start a research job, send email, or consume provider credits.
for (const path of ['/', '/examples/microsoft', '/api/analyses/ci-smoke-test']) {
  const response = await fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  try {
    assert.equal(response.status, path.startsWith('/api/') ? 403 : 200, `Unexpected status for ${path}`);
    if (!path.startsWith('/api/')) assert.match(response.headers.get('content-type') || '', /text\/html/);
  } finally { await response.body?.cancel(); }
}
console.log('Deployed homepage, saved example, and private-report access boundary passed.');
