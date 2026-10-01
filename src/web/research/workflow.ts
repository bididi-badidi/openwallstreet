import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { issuers, discoverySchema, extractionSchema, readArtifact, saveArtifact, progress,
  safeCode, type Issuer, type JobParams, type Collected, type Snapshot } from './data';
import { nebius, structured, tavily, policy, searchTool, querySchema, type Message } from './providers';
import { retrieve, sourceUrl, sourceSpan, pageChunks } from './sources';
import { buildReport } from './report';

const apiStep = { retries: { limit: 1, delay: '10 seconds', backoff: 'exponential' }, timeout: '3 minutes' } as const;
const quickStep = { retries: { limit: 2, delay: '2 seconds', backoff: 'exponential' }, timeout: '1 minute' } as const;

export class ResearchWorkflow extends WorkflowEntrypoint<ResearchEnv, JobParams> {
  async discover(step: WorkflowStep, issuer: Issuer, year: number, params: JobParams) {
    const prefix = `fy${year}`;
    const messages: Message[] = [{ role: 'system', content: policy }, { role: 'user', content:
      `Find the ${issuer.company} fiscal ${year} annual report. Search the web. As of ${params.asOf}.
Prefer issuer-hosted report PDF or full annual-report HTML over SEC pages when available.
Only use these exact source hosts: ${issuer.primary_hosts.join(', ')}.
Return up to two alternative copies of the same fiscal annual report. No landing pages.
Verify company and fiscal period from source evidence. Use gaps when uncertain.` }];
    let searches = 0;
    const searchRecords: Awaited<ReturnType<typeof tavily>>[] = [];
    for (let round = 0; round < 2 && searches < 2; round++) {
      const answer = await step.do(`${prefix}-discover-model-${round}`, apiStep, () => nebius(this.env, messages, {
        tools: [searchTool], tool_choice: round === 0
          ? { type: 'function', function: { name: 'web_search' } } : 'auto',
      }));
      if (!answer.tool_calls?.length) {
        if (!searches) throw new Error('search_not_called');
        break;
      }
      if (answer.tool_calls.length > 2 - searches) throw new Error('search_limit');
      messages.push({ role: 'assistant', content: answer.content, tool_calls: answer.tool_calls,
        reasoning_content: answer.reasoning_content });
      for (const [index, call] of answer.tool_calls.entries()) {
        const { query } = querySchema.parse(JSON.parse(call.function.arguments));
        const result = await step.do(`${prefix}-search-${round}-${index}`, apiStep,
          () => tavily(this.env, query, issuer.primary_hosts));
        searches++;
        searchRecords.push(result);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    const discovery = await step.do(`${prefix}-discover-final`, apiStep,
      () => structured(this.env, messages, discoverySchema));
    await step.do(`${prefix}-save-discovery`, quickStep, () => saveArtifact(this.env.DB, params.id,
      `${prefix}/discovery`, { discovery, searches: searchRecords, provider: 'nebius', model: this.env.NEBIUS_MODEL }));
    return discovery;
  }

  async collectYear(step: WorkflowStep, issuer: Issuer, year: number, params: JobParams): Promise<Collected> {
    const prefix = `fy${year}`;
    const collected: Collected = { year, document: null, snapshot: null, claims: [], gaps: [], extractedChunks: 0, totalChunks: 0 };
    try {
      const discovery = await this.discover(step, issuer, year, params);
      collected.gaps.push(...discovery.gaps);
      for (const [candidate, doc] of discovery.documents.entries()) {
        try {
          if (doc.company !== issuer.company || doc.fiscal_year !== year ||
              doc.period_end > params.asOf || (doc.publication_date && doc.publication_date > params.asOf))
            throw new Error('document_identity_mismatch');
          sourceUrl(doc.url, issuer.primary_hosts);
          const metadata = await step.do(`${prefix}-source-${candidate}`, apiStep, async () => {
            const snapshot = await retrieve(doc.url, issuer.primary_hosts);
            await saveArtifact(this.env.DB, params.id, `${prefix}/source`, snapshot);
            return { ...snapshot, pages: [], chunks: pageChunks(snapshot.pages).length };
          });
          collected.document = doc; collected.snapshot = metadata; collected.totalChunks = metadata.chunks;
          if (metadata.truncated) collected.gaps.push('Source text exceeded the saved-text limit; later pages were not analyzed.');
          break;
        } catch (error) {
          collected.gaps.push(`Candidate ${candidate + 1} could not be retrieved or validated (${safeCode(error)}).`);
        }
      }
      if (!collected.document) { collected.gaps.push('No usable primary annual report was collected.'); return collected; }
      for (let index = 0; index < Math.min(collected.totalChunks, 6); index++) {
        try {
          const extracted = await step.do(`${prefix}-extract-${index}`, apiStep, async () => {
            const snapshot = await readArtifact(this.env.DB, params.id, `${prefix}/source`) as Snapshot;
            const pages = pageChunks(snapshot.pages)[index];
            const extraction = await structured(this.env, [{ role: 'system', content: policy }, { role: 'user', content:
              'Extract at most ten material management statements and MD&A highlights from this chunk only. '
              + 'Prefer specific commitments, forecasts, financial facts and challenges. Preserve supplied physical page numbers. '
              + 'Do not infer individual responsibility. A chunk without MD&A is normal. All excerpts must match the supplied text.\n'
              + JSON.stringify({ document: collected.document, pages }) }], extractionSchema);
            const claims = extraction.claims.flatMap(claim => {
              const page = pages.find(p => p.page === claim.page);
              const span = page && sourceSpan(claim.excerpt, page.text);
              return span ? [{ ...claim, excerpt: span }] : [];
            });
            return { claims, rejected: extraction.claims.length - claims.length, notes: extraction.gaps };
          });
          await step.do(`${prefix}-save-extraction-${index}`, quickStep, () => saveArtifact(
            this.env.DB, params.id, `${prefix}/extraction-${index}`, extracted));
          collected.extractedChunks++;
          collected.claims.push(...extracted.claims);
          if (extracted.rejected) collected.gaps.push(`${extracted.rejected} claims had unsupported quotations or page numbers and were rejected.`);
          collected.gaps.push(...extracted.notes);
        } catch (error) { collected.gaps.push(`Chunk ${index + 1} failed (${safeCode(error)}); completed chunks were retained.`); }
      }
      if (collected.totalChunks > 6) collected.gaps.push('The six-chunk analysis limit was reached.');
      const seen = new Set<string>();
      collected.claims = collected.claims.filter(c => {
        const key = JSON.stringify([c.category, c.excerpt, c.target_date]);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      if (!collected.claims.length) collected.gaps.push('No source-verified claims were extracted.');
    } catch (error) { collected.gaps.push(`Annual-report worker failed (${safeCode(error)}).`); }
    return collected;
  }

  async run(event: WorkflowEvent<JobParams>, step: WorkflowStep) {
    const params = event.payload;
    try {
      const issuer = issuers.find(i => i.id === params.issuerId);
      if (!issuer) throw new Error('unsupported_company');
      await step.do('mark-running', quickStep, () => progress(this.env.DB, params.id, 5, 'Finding primary annual reports'));
      const latestYear = Number(params.asOf.slice(0, 4)) - 1;
      const years = [latestYear - 2, latestYear - 1, latestYear];
      const collected = await Promise.all(years.map(async year => {
        const result = await this.collectYear(step, issuer, year, params);
        await step.do(`fy${year}-save-evidence`, quickStep, () => saveArtifact(this.env.DB, params.id, `fy${year}/evidence`, result));
        await step.do(`fy${year}-progress`, quickStep, () => progress(this.env.DB, params.id, 55, 'Checking quotations and preparing the report'));
        return result;
      }));
      const report = await step.do('compile-report', quickStep, async () => buildReport(issuer.company, params.asOf, collected));
      await step.do('save-report', quickStep, () => saveArtifact(this.env.DB, params.id, 'report', report));
      await step.do('mark-complete', quickStep, async () => {
        await this.env.DB.prepare("UPDATE jobs SET status='completed',progress=100,message='Report ready',updated_at=unixepoch() WHERE id=?")
          .bind(params.id).run();
        console.log(JSON.stringify({ event: 'research_completed', job: params.id, documents: report.source_documents, claims: report.extracted_claims }));
      });
      return { job: params.id, documents: report.source_documents, claims: report.extracted_claims };
    } catch (error) {
      await step.do('mark-failed', quickStep, async () => {
        await this.env.DB.prepare("UPDATE jobs SET status='failed',error_code=?,message='The research could not be completed',updated_at=unixepoch() WHERE id=?")
          .bind(safeCode(error), params.id).run();
        console.error(JSON.stringify({ event: 'research_failed', job: params.id, code: safeCode(error) }));
      });
      throw new Error(safeCode(error));
    }
  }
}
