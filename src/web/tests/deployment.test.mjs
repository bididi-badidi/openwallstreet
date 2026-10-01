import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configureDeployment, verifyBuild } from '../scripts/configure-deployment.mjs';

const web = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const research = JSON.parse(await readFile(new URL('../research/wrangler.jsonc', import.meta.url), 'utf8'));
const account = 'a'.repeat(32), previewDB = '11111111-1111-1111-1111-111111111111';

test('preview configuration isolates storage, Workers, Workflow and email without changing production bindings', () => {
  const result = configureDeployment(web, research, 'preview', account, previewDB);
  assert.equal(result.research.env.preview.d1_databases[0].database_id, previewDB);
  assert.deepEqual(result.research.d1_databases, research.d1_databases);
  assert.deepEqual(result.web.services, web.services);
  assert.deepEqual(result.research.env.preview.send_email, []);
  assert.notEqual(research.env.preview.d1_databases[0].database_id, previewDB);
});

test('deployment rejects missing configuration, placeholder IDs and production storage in preview', () => {
  for (const [target, accountId, db] of [
    ['dev', account, previewDB], ['preview', '', previewDB], ['preview', account, ''],
    ['preview', account, '00000000-0000-0000-0000-000000000000'],
    ['preview', account, research.d1_databases[0].database_id],
  ]) assert.throws(() => configureDeployment(web, research, target, accountId, db));
});

test('production retains the existing service and resource names', () => {
  const result = configureDeployment(web, research, 'production', account, research.d1_databases[0].database_id);
  assert.equal(result.web.name, web.name);
  assert.deepEqual(result.web.services, web.services);
  assert.deepEqual(result.research.workflows, research.workflows);
});

test('a preview deployment cannot publish a production frontend build', () => {
  const result = configureDeployment(web, research, 'preview', account, previewDB);
  assert.throws(() => verifyBuild({ ...result.web }, result.web, 'preview'));
  const built = { ...result.web.env.preview, account_id: account };
  verifyBuild(built, result.web, 'preview');
  assert.throws(() => verifyBuild({ ...built, services: web.services }, result.web, 'preview'));
});
