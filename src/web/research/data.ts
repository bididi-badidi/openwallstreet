import { z } from 'zod';
import archive from '../../credibility/examples/magnificent-seven.json';

export const issuers = archive.issuers;
export type Issuer = typeof issuers[number];
export type JobParams = { id: string; issuerId: string; asOf: string };
export type JobRow = {
  id: string; company: string; issuer_id: string; as_of: string;
  status: 'starting' | 'queued' | 'running' | 'completed' | 'failed';
  progress: number; message: string; error_code: string | null;
  created_at: number; updated_at: number;
};
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export function resolveIssuer(value: string) {
  const key = normalized(value);
  if (key === 'google') return issuers.find(i => i.id === 'alphabet');
  if (key === 'facebook') return issuers.find(i => i.id === 'meta');
  return issuers.find(i => [i.id, i.company, ...i.aliases].some(n => normalized(n) === key));
}
export const documentSchema = z.object({
  title: z.string().min(1).max(300), url: z.url().max(4000),
  company: z.string().max(200), report_type: z.literal('annual'),
  period_end: z.iso.date(), fiscal_year: z.number().int(),
  publication_date: z.iso.date().nullable(), identity: z.string().max(300),
}).strict();
export const discoverySchema = z.object({
  documents: z.array(documentSchema).max(2), gaps: z.array(z.string().max(600)).max(10),
}).strict();
export const claimSchema = z.object({
  category: z.enum(['measurable_promise','forecast','aspiration','reported_fact','challenge']),
  summary: z.string().min(1).max(300), excerpt: z.string().min(10).max(1800),
  page: z.number().int().positive(), section: z.string().min(1).max(200),
  target_date: z.string().max(200).nullable(), numeric_target: z.string().max(100).nullable(),
  unit: z.string().max(100).nullable(), attribution: z.string().max(200).nullable(),
  uncertainties: z.array(z.string().max(300)).max(5), is_highlight: z.boolean(),
}).strict();
export const extractionSchema = z.object({
  mda_sections: z.array(z.string().max(200)).max(10), claims: z.array(claimSchema).max(10),
  gaps: z.array(z.string().max(500)).max(10),
}).strict();
export type ReportDocument = z.infer<typeof documentSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Page = { page: number; text: string };
export type Snapshot = { url: string; sha256: string; retrieved_at: string; pages: Page[];
  method: string; total_pages: number; truncated: boolean };
export type Collected = { year: number; document: ReportDocument | null; snapshot: Snapshot | null;
  claims: Claim[]; gaps: string[]; extractedChunks: number; totalChunks: number };

export async function saveArtifact(db: D1Database, jobId: string, name: string, value: unknown) {
  const content = JSON.stringify(value);
  if (new TextEncoder().encode(content).length > 2_000_000) throw new Error('artifact_size_limit');
  const statements = [db.prepare('DELETE FROM artifacts WHERE job_id=? AND name=?').bind(jobId, name)];
  for (let offset = 0, part = 0; offset < content.length; offset += 80_000, part++) {
    statements.push(db.prepare('INSERT INTO artifacts(job_id,name,part,content) VALUES(?,?,?,?)')
      .bind(jobId, name, part, content.slice(offset, offset + 80_000)));
  }
  await db.batch(statements);
}
export async function readArtifact(db: D1Database, jobId: string, name: string): Promise<unknown> {
  const rows = await db.prepare('SELECT content FROM artifacts WHERE job_id=? AND name=? ORDER BY part')
    .bind(jobId, name).all<{ content: string }>();
  if (!rows.results.length) throw new Error('artifact_missing');
  return JSON.parse(rows.results.map(r => r.content).join(''));
}
export async function progress(db: D1Database, id: string, value: number, message: string) {
  await db.prepare("UPDATE jobs SET status='running', progress=MAX(progress,?), message=?, updated_at=unixepoch() WHERE id=? AND status NOT IN ('completed','failed')")
    .bind(value, message, id).run();
}
export function safeCode(error: unknown) {
  if (error instanceof Error && error.message.includes('exceeded CPU time limit')) return 'cloudflare_cpu_limit';
  return error instanceof Error && /^[a-z_]+(?:_\d{3})?$/.test(error.message)
    ? error.message : 'research_failed';
}
