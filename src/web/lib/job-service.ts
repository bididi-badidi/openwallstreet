import { jobSchema, type AnalysisJob } from "./report-schema";
import { timingSafeEqual } from "node:crypto";

export interface JobServiceConfig {
  url?: string;
  token?: string;
  accessCode?: string;
  ownerAccess?: boolean;
  binding?: Pick<Fetcher, "fetch">;
}
export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function serviceReady(config: JobServiceConfig) {
  return Boolean((config.binding || config.url) && config.token);
}

// This is the application's asynchronous job-service contract, not the Nebius inference API.
export async function requestJob(
  config: JobServiceConfig,
  id?: string,
  company?: string,
  idempotencyKey?: string,
): Promise<AnalysisJob> {
  if (!serviceReady(config))
    throw new ServiceError(
      503,
      "Live analysis is not connected yet. Explore the Alphabet sample while the research service is being prepared.",
    );
  const base = new URL(
    config.binding ? "https://research.internal" : config.url!,
  );
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new ServiceError(
      503,
      "The research service configuration needs attention.",
    );
  const url = new URL(
    base.toString().replace(/\/$/, "") +
      "/jobs" +
      (id ? "/" + encodeURIComponent(id) : ""),
  );
  let response: Response;
  try {
    const init: RequestInit = {
      method: id ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(config.ownerAccess ? { "X-Owner-Access": "1" } : {}),
        ...(config.accessCode
          ? { "X-Research-Access": config.accessCode }
          : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: id
        ? undefined
        : JSON.stringify({ company, report_schema_version: 1 }),
      signal: AbortSignal.timeout(15_000),
      redirect: "manual",
      cache: "no-store",
    };
    response = config.binding
      ? await config.binding.fetch(url.toString(), init)
      : await fetch(url, init);
  } catch {
    throw new ServiceError(
      502,
      "The research service could not be reached. Please try again.",
    );
  }
  if (!response.ok)
    throw new ServiceError(
      [400, 403, 404, 409, 429].includes(response.status)
        ? response.status
        : 502,
      response.status === 403
        ? "This access code is invalid, expired, or has used both research runs. Reception can issue one code per session."
        : response.status === 404
          ? "This analysis could not be found."
          : response.status === 400
            ? "Choose Apple, Microsoft, Alphabet, Amazon, NVIDIA, Meta, or Tesla."
            : response.status === 429
              ? "Research capacity has been reached. Please try again later."
              : response.status === 409
                ? "This request reference belongs to another company. Please start a new analysis."
                : "The research service could not process this request. Please try again.",
    );
  try {
    const raw = await readBoundedJson(response, 2_000_000);
    const job = jobSchema.parse(raw);
    if (id && job.id !== id) throw new Error("Mismatched job");
    // Do not expose operational details or raw errors from the compute service.
    if (job.status === "failed")
      return {
        id: job.id,
        status: "failed",
        message: "The analysis could not be completed. Please try again.",
      };
    return job;
  } catch {
    throw new ServiceError(
      502,
      "The research service returned an incomplete or unsupported report.",
    );
  }
}

export async function secureCompare(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}

export async function readBoundedJson(
  message: Request | Response,
  maxBytes: number,
): Promise<unknown> {
  const reader = message.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Body too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

export function jsonResponse(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}
export function serviceErrorResponse(error: unknown) {
  return jsonResponse(
    {
      error:
        error instanceof ServiceError
          ? error.message
          : "Something went wrong. Please try again.",
    },
    error instanceof ServiceError ? error.status : 500,
  );
}

// A signed, per-job HttpOnly cookie prevents unauthenticated enumeration of job results.
async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function jobCookie(request: Request, id: string, secret: string) {
  const expires = Math.floor(Date.now() / 1000) + 604_800;
  const message = `${id}.${expires}`;
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await signingKey(secret),
      new TextEncoder().encode(message),
    ),
  );
  const signature = Array.from(bytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `analysis_access=${expires}.${signature}; Path=/api/analyses/${id}; HttpOnly; SameSite=Strict; Max-Age=604800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function canReadJob(request: Request, id: string, secret: string) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("analysis_access="))
    ?.slice(16);
  if (!cookie || !/^\d{10}\.[a-f0-9]{64}$/.test(cookie)) return false;
  const [expires, signature] = cookie.split(".");
  if (Number(expires) < Date.now() / 1000) return false;
  const bytes = Uint8Array.from(signature.match(/../g)!, (b) =>
    parseInt(b, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    await signingKey(secret),
    bytes,
    new TextEncoder().encode(`${id}.${expires}`),
  );
}
