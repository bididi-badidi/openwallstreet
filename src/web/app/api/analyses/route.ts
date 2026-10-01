import { env } from "cloudflare:workers";
import { companyInputSchema } from "../../../lib/report-schema";
import {
  jsonResponse,
  jobCookie,
  readBoundedJson,
  requestJob,
  serviceErrorResponse,
  secureCompare,
} from "../../../lib/job-service";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return jsonResponse({ error: "Submit the form from this website." }, 403);
  const accessCode = request.headers.get("x-research-access") || "";
  if (!accessCode || accessCode.length > 200)
    return jsonResponse(
      { error: "Enter a research access code, or create one with Reception." },
      403,
    );
  const ownerAccess = Boolean(
    env.RESEARCH_ACCESS_CODE &&
    (await secureCompare(accessCode, env.RESEARCH_ACCESS_CODE)),
  );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return jsonResponse({ error: "Expected a JSON request." }, 415);
  let input;
  try {
    input = companyInputSchema.parse(await readBoundedJson(request, 2048));
  } catch {
    return jsonResponse(
      { error: "Enter a company name between 2 and 160 characters." },
      400,
    );
  }
  try {
    const job = await requestJob(
      {
        binding: env.RESEARCH_SERVICE,
        url: env.NEBIUS_JOB_SERVICE_URL,
        token: env.NEBIUS_JOB_SERVICE_TOKEN,
        accessCode: ownerAccess ? undefined : accessCode,
        ownerAccess,
      },
      undefined,
      input.company,
      request.headers.get("idempotency-key") || undefined,
    );
    const cookie = await jobCookie(
      request,
      job.id,
      env.NEBIUS_JOB_SERVICE_TOKEN!,
    );
    return jsonResponse(job, job.status === "completed" ? 200 : 202, {
      "Set-Cookie": cookie,
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
