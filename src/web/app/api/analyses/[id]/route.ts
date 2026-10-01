import { env } from "cloudflare:workers";
import { jobIdSchema } from "../../../../lib/report-schema";
import {
  canReadJob,
  jsonResponse,
  requestJob,
  serviceErrorResponse,
} from "../../../../lib/job-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!jobIdSchema.safeParse(id).success)
    return jsonResponse({ error: "Invalid analysis reference." }, 400);
  if (
    !env.NEBIUS_JOB_SERVICE_TOKEN ||
    !(await canReadJob(request, id, env.NEBIUS_JOB_SERVICE_TOKEN))
  )
    return jsonResponse(
      { error: "Start an analysis in this browser to view its results." },
      403,
    );
  try {
    return jsonResponse(
      await requestJob(
        {
          binding: env.RESEARCH_SERVICE,
          url: env.NEBIUS_JOB_SERVICE_URL,
          token: env.NEBIUS_JOB_SERVICE_TOKEN,
        },
        id,
      ),
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
