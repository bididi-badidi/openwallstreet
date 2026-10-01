import test from "node:test";
import assert from "node:assert/strict";
import sample from "../data/alphabet.json";
import {
  requestJob,
  ServiceError,
  jobCookie,
  canReadJob,
  readBoundedJson,
} from "../lib/job-service";

const config = {
  url: "https://research.example/service",
  token: "test-only-service-token",
};
test("missing Nebius configuration produces an explicit unavailable response", async () => {
  await assert.rejects(
    () => requestJob({}),
    (error) => error instanceof ServiceError && error.status === 503,
  );
});
test("submits an asynchronous job, then validates completed results", async (t) => {
  let call = 0;
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    assert.equal(
      new Headers(init.headers).get("authorization"),
      "Bearer test-only-service-token",
    );
    assert.equal(init.redirect, "manual");
    if (call++ === 0) {
      assert.equal(url.toString(), "https://research.example/service/jobs");
      assert.deepEqual(JSON.parse(init.body as string), {
        company: "Alphabet",
        report_schema_version: 1,
      });
      return Response.json(
        { id: "job_test_123", status: "queued" },
        { status: 202 },
      );
    }
    assert.equal(init.method, "GET");
    assert.equal(
      url.toString(),
      "https://research.example/service/jobs/job_test_123",
    );
    return Response.json({
      id: "job_test_123",
      status: "completed",
      report: sample,
    });
  });
  const queued = await requestJob(config, undefined, "Alphabet");
  assert.equal(queued.status, "queued");
  const done = await requestJob(config, queued.id);
  assert.equal(done.status, "completed");
});
test("rejects wrong-job and malformed results without exposing upstream details", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ id: "another_job", status: "completed", report: sample }),
  );
  await assert.rejects(
    () => requestJob(config, "job_test_123"),
    (error) => error instanceof ServiceError && error.status === 502,
  );
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ secret: "must not leak" }, { status: 500 }),
  );
  await assert.rejects(
    () => requestJob(config, "job_test_123"),
    (error) =>
      error instanceof ServiceError && !error.message.includes("must not leak"),
  );
});
test("capability cookie is bound to the job and cannot be altered", async () => {
  const cookie = await jobCookie(
    new Request("https://wallstreet.example/api/analyses"),
    "job_test_123",
    config.token,
  );
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  assert.match(cookie, /; Secure$/);
  const request = new Request(
    "https://wallstreet.example/api/analyses/job_test_123",
    { headers: { cookie: cookie.split(";")[0] } },
  );
  assert.equal(await canReadJob(request, "job_test_123", config.token), true);
  assert.equal(await canReadJob(request, "another_job", config.token), false);
  assert.equal(
    await canReadJob(request, "job_test_123", "wrong-secret"),
    false,
  );
  const expired = new Request(request, {
    headers: { cookie: cookie.split(";")[0].replace(/=\d+/, "=1000000000") },
  });
  assert.equal(await canReadJob(expired, "job_test_123", config.token), false);
});
test("bounds response bytes before parsing", async () => {
  await assert.rejects(() =>
    readBoundedJson(
      new Response(JSON.stringify({ huge: "x".repeat(1000) })),
      100,
    ),
  );
});
