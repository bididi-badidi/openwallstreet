import {
  jsonResponse,
  readBoundedJson,
  secureCompare,
} from "../lib/job-service";
import {
  companyInputSchema,
  jobIdSchema,
  reportSchema,
} from "../lib/report-schema";
import {
  readArtifact,
  resolveIssuer,
  safeCode,
  type JobRow,
  type JobParams,
} from "./data";
export { ResearchWorkflow } from "./workflow";
import { reception } from "../reception/service";
import { hashCode } from "../lib/reception-session";

async function getJob(env: ResearchEnv, id: string) {
  return env.DB.prepare("SELECT * FROM jobs WHERE id=?")
    .bind(id)
    .first<JobRow>();
}
async function ensureStarted(env: ResearchEnv, job: JobRow) {
  if (job.status !== "starting") return;
  const params: JobParams = {
    id: job.id,
    issuerId: job.issuer_id,
    asOf: job.as_of,
  };
  try {
    await env.RESEARCH_WORKFLOW.create({ id: job.id, params });
  } catch {
    // Creation can succeed before the response is lost. Verify the same ID before retrying.
    const instance = await env.RESEARCH_WORKFLOW.get(job.id);
    await instance.status();
  }
  await env.DB.prepare(
    "UPDATE jobs SET status='queued',updated_at=unixepoch() WHERE id=? AND status='starting'",
  )
    .bind(job.id)
    .run();
}
async function status(env: ResearchEnv, job: JobRow) {
  if (job.status === "starting") await ensureStarted(env, job);
  if (["starting", "queued", "running"].includes(job.status)) {
    try {
      const instance = await env.RESEARCH_WORKFLOW.get(job.id);
      const state = await instance.status();
      if (["errored", "terminated"].includes(state.status)) {
        await env.DB.prepare(
          "UPDATE jobs SET status='failed',error_code='workflow_stopped',updated_at=unixepoch() WHERE id=? AND status NOT IN ('completed','failed')",
        )
          .bind(job.id)
          .run();
      }
    } catch {
      /* Keep the persisted state on a transient platform lookup failure. */
    }
    job = (await getJob(env, job.id))!;
  }
  if (job.status === "completed")
    return {
      id: job.id,
      status: "completed",
      report: reportSchema.parse(await readArtifact(env.DB, job.id, "report")),
    };
  if (job.status === "failed")
    return {
      id: job.id,
      status: "failed",
      message: "The research could not be completed.",
    };
  return {
    id: job.id,
    status: job.status === "running" ? "running" : "queued",
    progress: job.progress,
    message: job.message,
  };
}

export default {
  async fetch(request, env) {
    if (
      !env.NEBIUS_JOB_SERVICE_TOKEN ||
      !(await secureCompare(
        request.headers.get("authorization") || "",
        `Bearer ${env.NEBIUS_JOB_SERVICE_TOKEN}`,
      ))
    )
      return jsonResponse({ error: "Unauthorized" }, 401);
    const url = new URL(request.url);
    try {
      const receptionPath = url.pathname.match(
        /^\/reception\/(session|chat|code|contact)$/,
      );
      if (request.method === "POST" && receptionPath)
        return reception(request, env, receptionPath[1]);
      if (request.method === "POST" && url.pathname === "/jobs") {
        const input = companyInputSchema.safeParse(
          await readBoundedJson(request, 2048),
        );
        const issuer = input.success && resolveIssuer(input.data.company);
        if (!issuer) return jsonResponse({ error: "unsupported_company" }, 400);
        const id =
          request.headers.get("idempotency-key") || crypto.randomUUID();
        if (
          !jobIdSchema.safeParse(id).success ||
          !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{7,99}$/.test(id)
        )
          return jsonResponse({ error: "invalid_idempotency_key" }, 400);
        const owner = request.headers.get("x-owner-access") === "1";
        const codeHash = owner
          ? null
          : await hashCode(request.headers.get("x-research-access") || "");
        const code = owner
          ? null
          : await env.DB.prepare(
              "SELECT uses FROM access_codes WHERE code_hash=? AND expires_at>unixepoch()",
            )
              .bind(codeHash)
              .first<{ uses: number }>();
        if (!owner && !code)
          return jsonResponse({ error: "invalid_access_code" }, 403);
        const existing = await getJob(env, id);
        if (existing && !owner) {
          const access = await env.DB.prepare(
            "SELECT code_hash FROM job_access WHERE job_id=?",
          )
            .bind(id)
            .first<{ code_hash: string }>();
          if (access?.code_hash !== codeHash)
            return jsonResponse({ error: "invalid_access_code" }, 403);
        }
        if (existing && existing.issuer_id !== issuer.id)
          return jsonResponse({ error: "idempotency_conflict" }, 409);
        if (!existing) {
          if (!owner && code!.uses >= 2)
            return jsonResponse({ error: "access_code_exhausted" }, 403);
          // D1 batches are atomic. The ownership insert triggers exactly one code use per admitted job.
          await env.DB.batch([
            env.DB.prepare(
              `INSERT OR IGNORE INTO jobs(id,company,issuer_id,as_of,status)
              SELECT ?,?,?,?,'starting' WHERE
              (SELECT COUNT(*) FROM jobs WHERE created_at >= unixepoch('now','start of day')) < ?
              AND (SELECT COUNT(*) FROM jobs WHERE status IN ('starting','queued','running')) < ?
              AND (? IS NULL OR EXISTS(SELECT 1 FROM access_codes WHERE code_hash=? AND uses<2 AND expires_at>unixepoch()))`,
            ).bind(
              id,
              issuer.company,
              issuer.id,
              new Date().toISOString().slice(0, 10),
              Number(env.MAX_DAILY_JOBS),
              Number(env.MAX_ACTIVE_JOBS),
              codeHash,
              codeHash,
            ),
            env.DB.prepare(
              "INSERT OR IGNORE INTO job_access(job_id,code_hash) SELECT id,? FROM jobs WHERE id=?",
            ).bind(codeHash, id),
          ]);
        }
        const job = await getJob(env, id);
        if (!job) {
          const remaining =
            codeHash &&
            (await env.DB.prepare(
              "SELECT uses FROM access_codes WHERE code_hash=?",
            )
              .bind(codeHash)
              .first<{ uses: number }>());
          return remaining && remaining.uses >= 2
            ? jsonResponse({ error: "access_code_exhausted" }, 403)
            : jsonResponse({ error: "capacity_reached" }, 429);
        }
        if (!owner) {
          const access = await env.DB.prepare(
            "SELECT code_hash FROM job_access WHERE job_id=?",
          )
            .bind(id)
            .first<{ code_hash: string }>();
          if (access?.code_hash !== codeHash)
            return jsonResponse({ error: "invalid_access_code" }, 403);
        }
        if (job.issuer_id !== issuer.id)
          return jsonResponse({ error: "idempotency_conflict" }, 409);
        await ensureStarted(env, job);
        return jsonResponse(
          await status(env, job),
          job.status === "completed" ? 200 : 202,
        );
      }
      const match = url.pathname.match(
        /^\/jobs\/([a-zA-Z0-9_-]{8,128})(\/evidence)?$/,
      );
      if (request.method === "GET" && match) {
        const job = await getJob(env, match[1]);
        if (!job) return jsonResponse({ error: "not_found" }, 404);
        if (!match[2]) return jsonResponse(await status(env, job));
        const rows = await env.DB.prepare(
          "SELECT name,part,content FROM artifacts WHERE job_id=? ORDER BY name,part",
        )
          .bind(job.id)
          .all<{ name: string; part: number; content: string }>();
        const documents: Record<string, string[]> = {};
        for (const row of rows.results)
          (documents[row.name] ??= []).push(row.content);
        // Stream the export so the endpoint does not allocate a second full bundle.
        const encoder = new TextEncoder();
        const entries = Object.entries(documents);
        let index = -1;
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (index === -1) {
                controller.enqueue(encoder.encode('{"artifacts":{'));
                index++;
                return;
              }
              if (index < entries.length) {
                const [name, pieces] = entries[index];
                controller.enqueue(
                  encoder.encode(
                    (index ? "," : "") +
                      JSON.stringify(name) +
                      ":" +
                      pieces.join(""),
                  ),
                );
                index++;
                return;
              }
              controller.enqueue(encoder.encode("}}"));
              controller.close();
            },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "Content-Disposition": `attachment; filename="research-${job.id}.json"`,
            },
          },
        );
      }
      return jsonResponse({ error: "not_found" }, 404);
    } catch (error) {
      console.error(
        JSON.stringify({ event: "job_api_failed", code: safeCode(error) }),
      );
      return jsonResponse({ error: "research_service_unavailable" }, 503);
    }
  },
  async scheduled(_event, env) {
    const old = await env.DB.prepare(
      "SELECT * FROM jobs WHERE status IN ('starting','queued','running') AND created_at < unixepoch()-3600",
    ).all<JobRow>();
    for (const job of old.results) {
      try {
        const instance = await env.RESEARCH_WORKFLOW.get(job.id);
        await instance.terminate();
      } catch {
        /* A failed startup has no instance to terminate. */
      }
      await env.DB.prepare(
        "UPDATE jobs SET status='failed',error_code='job_time_limit',updated_at=unixepoch() WHERE id=? AND status NOT IN ('completed','failed')",
      )
        .bind(job.id)
        .run();
    }
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM reception_sessions WHERE created_at<unixepoch()-604800",
      ),
      env.DB.prepare(
        "DELETE FROM access_codes WHERE expires_at<unixepoch()-604800",
      ),
      env.DB.prepare(
        "DELETE FROM contact_messages WHERE created_at<unixepoch()-604800",
      ),
    ]);
    await env.DB.prepare(
      "DELETE FROM jobs WHERE created_at < unixepoch()-604800 AND status IN ('completed','failed')",
    ).run();
  },
} satisfies ExportedHandler<ResearchEnv>;
