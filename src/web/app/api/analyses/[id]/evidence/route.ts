import { env } from 'cloudflare:workers';
import { canReadJob, jsonResponse } from '../../../../../lib/job-service';
import { jobIdSchema } from '../../../../../lib/report-schema';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!jobIdSchema.safeParse(id).success) return jsonResponse({ error: 'Invalid analysis reference.' }, 400);
  if (!env.NEBIUS_JOB_SERVICE_TOKEN || !(await canReadJob(request, id, env.NEBIUS_JOB_SERVICE_TOKEN)))
    return jsonResponse({ error: 'Start an analysis in this browser to download its evidence.' }, 403);
  try {
    return await env.RESEARCH_SERVICE.fetch(`https://research.internal/jobs/${id}/evidence`, {
      headers: { Authorization: `Bearer ${env.NEBIUS_JOB_SERVICE_TOKEN}` },
    });
  } catch { return jsonResponse({ error: 'Evidence is temporarily unavailable.' }, 503); }
}
