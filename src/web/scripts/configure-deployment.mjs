import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Wrangler files deliberately use strict JSON so deployment needs no extra parser.
export function configureDeployment(web, research, target, accountId, databaseId) {
  assert.ok(['preview', 'production'].includes(target), 'Unknown deployment environment');
  assert.match(accountId || '', /^[a-f0-9]{32}$/, 'Set CLOUDFLARE_ACCOUNT_ID');
  assert.match(databaseId || '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, 'Set CLOUDFLARE_D1_DATABASE_ID');
  assert.notEqual(databaseId, '00000000-0000-0000-0000-000000000000', 'Provision a real D1 database first');
  const nextWeb = structuredClone(web), nextResearch = structuredClone(research);
  nextWeb.account_id = nextResearch.account_id = accountId;
  const selectedWeb = target === 'preview' ? nextWeb.env.preview : nextWeb;
  const selectedResearch = target === 'preview' ? nextResearch.env.preview : nextResearch;
  assert.equal(selectedWeb.services[0].service, selectedResearch.name, 'Service binding must target the matching research Worker');
  if (target === 'preview') {
    assert.notEqual(databaseId, research.d1_databases[0].database_id, 'Preview cannot use the production database');
    assert.notEqual(selectedWeb.name, web.name, 'Preview needs its own web Worker');
    assert.notEqual(selectedResearch.name, research.name, 'Preview needs its own research Worker');
    assert.notEqual(selectedResearch.workflows[0].name, research.workflows[0].name, 'Preview needs its own Workflow');
    assert.equal(selectedResearch.send_email.length, 0, 'Preview must not send real contact email');
  }
  selectedResearch.d1_databases[0].database_id = databaseId;
  return { web: nextWeb, research: nextResearch };
}

export function verifyBuild(built, web, target) {
  assert.ok(['preview', 'production'].includes(target), 'Unknown deployment environment');
  const expected = target === 'preview' ? web.env.preview : web;
  assert.equal(built.name, expected.name, 'Build was produced for the wrong environment');
  assert.equal(built.services.find(s => s.binding === 'RESEARCH_SERVICE')?.service,
    expected.services[0].service, 'Built frontend points at the wrong backend');
  assert.equal(built.account_id, web.account_id, 'Build targets the wrong Cloudflare account');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const web = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  const target = process.env.DEPLOY_ENVIRONMENT;
  if (process.argv[2] === '--verify-build') {
    verifyBuild(JSON.parse(await readFile('dist/server/wrangler.json', 'utf8')), web, target);
  } else {
    const research = JSON.parse(await readFile('research/wrangler.jsonc', 'utf8'));
    const result = configureDeployment(web, research, target,
      process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_D1_DATABASE_ID);
    await writeFile('wrangler.jsonc', JSON.stringify(result.web, null, 2) + '\n');
    await writeFile('research/wrangler.jsonc', JSON.stringify(result.research, null, 2) + '\n');
  }
  console.log(`Deployment configuration verified for ${target}.`);
}
