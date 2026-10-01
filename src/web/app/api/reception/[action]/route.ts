import { env } from "cloudflare:workers";
import { jsonResponse, readBoundedJson } from "../../../../lib/job-service";
import { receptionSession, hmac } from "../../../../lib/reception-session";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  if (!["session", "chat", "code", "contact"].includes(action))
    return jsonResponse({ error: "Not found." }, 404);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return jsonResponse({ error: "Use reception on this website." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return jsonResponse({ error: "Expected JSON." }, 415);
  if (!env.NEBIUS_JOB_SERVICE_TOKEN || !env.RESEARCH_SERVICE)
    return jsonResponse(
      { error: "Reception is temporarily unavailable." },
      503,
    );
  let body: unknown;
  try {
    body = await readBoundedJson(request, 7000);
  } catch {
    return jsonResponse({ error: "The message is too large or invalid." }, 400);
  }
  const session = await receptionSession(request, env.NEBIUS_JOB_SERVICE_TOKEN);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const ipHash = await hmac(
    env.NEBIUS_JOB_SERVICE_TOKEN,
    `reception-ip:${new Date().toISOString().slice(0, 10)}:${ip}`,
  );
  try {
    const response = await env.RESEARCH_SERVICE.fetch(
      `https://research.internal/reception/${action}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.NEBIUS_JOB_SERVICE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: session.id, ipHash, body }),
        signal: AbortSignal.timeout(40000),
        redirect: "manual",
      },
    );
    const data = await readBoundedJson(response, 100_000);
    return jsonResponse(
      data,
      response.status,
      session.cookie ? { "Set-Cookie": session.cookie } : {},
    );
  } catch {
    return jsonResponse(
      { error: "Reception could not be reached. Please try again." },
      503,
      session.cookie ? { "Set-Cookie": session.cookie } : {},
    );
  }
}
