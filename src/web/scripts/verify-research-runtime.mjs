import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, Response, convertV4MiniflareOptions } from "miniflare";

// Exercise real Workflows and D1 in workerd; external providers are deterministic.
const phrase = "We commit to open 12 stores by December 2027.";
function pdfFixture() {
  const lines = [phrase, ...Array(25).fill("Revenue was USD 40 million.")];
  const stream =
    "BT /F1 12 Tf 50 750 Td " +
    lines.map((line, i) => `${i ? "0 -18 Td " : ""}(${line}) Tj`).join("\n") +
    " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((obj, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("");
  return pdf + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}
let inferenceCalls = 0,
  searches = 0;
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: "research/.wrangler/research-test/index.js",
    compatibilityDate: "2026-10-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "test-research" },
    workflows: {
      RESEARCH_WORKFLOW: {
        name: "test-research-workflow",
        className: "ResearchWorkflow",
      },
    },
    bindings: {
      NEBIUS_API_KEY: "test-nebius",
      TAVILY_API_KEY: "test-tavily",
      NEBIUS_JOB_SERVICE_TOKEN: "test-service",
      NEBIUS_MODEL: "test-model",
      MAX_DAILY_JOBS: "2",
      MAX_ACTIVE_JOBS: "2",
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (
        url.hostname === "www.microsoft.com" &&
        url.pathname.endsWith("/2025")
      )
        return new Response(pdfFixture(), {
          headers: { "Content-Type": "application/pdf" },
        });
      if (url.hostname === "www.microsoft.com")
        return new Response(
          `<html><body><script>Fabricated script evidence must not appear.</script><h1>Management Discussion</h1><p>${phrase}</p><p>${"Revenue was USD 40 million. ".repeat(35)}</p></body></html>`,
          { headers: { "Content-Type": "text/html" } },
        );
      const body = await request.json();
      if (url.hostname === "api.tavily.com") {
        searches++;
        assert.deepEqual(body.include_domains, [
          "www.sec.gov",
          "www.microsoft.com",
        ]);
        return Response.json({
          results: [
            {
              url: "https://www.microsoft.com/report",
              title: "Annual report",
              content: phrase,
            },
          ],
        });
      }
      assert.equal(url.hostname, "api.tokenfactory.nebius.com");
      inferenceCalls++;
      const original = body.messages[1].content;
      const year = Number(original.match(/fiscal (\d{4})/)?.[1] || 2024);
      let message;
      if (body.tools) {
        message = body.messages.some((m) => m.role === "tool")
          ? { content: "Ready" }
          : {
              content: null,
              tool_calls: [
                {
                  id: `call-${year}`,
                  type: "function",
                  function: {
                    name: "web_search",
                    arguments: JSON.stringify({
                      query: `Microsoft fiscal ${year} annual report`,
                    }),
                  },
                },
              ],
            };
      } else if (body.response_format.json_schema.schema.properties.documents) {
        message = {
          content: JSON.stringify({
            documents: [
              {
                title: `Annual report ${year}`,
                url: `https://www.microsoft.com/report/${year}`,
                company: "Microsoft Corporation",
                report_type: "annual",
                period_end: `${year}-06-30`,
                fiscal_year: year,
                publication_date: null,
                identity: "Microsoft",
              },
            ],
            gaps: [],
          }),
        };
      } else {
        const claim = {
          category: "measurable_promise",
          summary: "Open 12 stores",
          excerpt: phrase,
          page: 1,
          section: "Management Discussion",
          target_date: "December 2027",
          numeric_target: "12",
          unit: "stores",
          attribution: null,
          uncertainties: [],
          is_highlight: true,
        };
        message = {
          content: JSON.stringify({
            mda_sections: ["Management Discussion"],
            claims: [
              claim,
              {
                ...claim,
                excerpt: "This quotation does not exist in the report.",
              },
            ],
            gaps: [],
          }),
        };
      }
      return Response.json({
        choices: [{ finish_reason: "stop", message }],
        usage: { prompt_tokens: 50, completion_tokens: 30 },
      });
    },
  }),
);
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("research/migrations")).filter(f => f.endsWith(".sql")).sort())
    await db.exec((await readFile(`research/migrations/${file}`, "utf8")).replace(/\n/g, " "));
  const request = (path, init = {}) =>
    mf.dispatchFetch("https://research.internal" + path, {
      ...init,
      headers: {
        Authorization: "Bearer test-service",
        "Content-Type": "application/json",
        "X-Owner-Access": "1",
        ...init.headers,
      },
    });
  assert.equal(
    (await mf.dispatchFetch("https://research.internal/jobs")).status,
    401,
  );
  assert.equal(
    (
      await request("/jobs", {
        method: "POST",
        body: JSON.stringify({ company: "Unknown" }),
      })
    ).status,
    400,
  );
  const payload = {
    method: "POST",
    headers: { "Idempotency-Key": "runtime-test-one" },
    body: JSON.stringify({ company: "Microsoft" }),
  };
  assert.equal((await request("/jobs", payload)).status, 202);
  assert.equal((await request("/jobs", payload)).status, 202);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM jobs").first()).n,
    1,
  );
  let job;
  for (let i = 0; i < 90; i++) {
    job = await (await request("/jobs/runtime-test-one")).json();
    if (["completed", "failed"].includes(job.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (job.status !== "completed") {
    console.log("Provider calls:", inferenceCalls, "Search calls:", searches);
    console.log(
      await db
        .prepare("SELECT name,content FROM artifacts ORDER BY name,part")
        .all(),
    );
  }
  assert.equal(job.status, "completed", JSON.stringify(job));
  assert.equal(job.report.source_documents, 3);
  assert.equal(job.report.extracted_claims, 3);
  assert.equal(job.report.events.length, 3);
  assert.equal(job.report.collection_gaps.length, 3);
  const dump = await (await request("/jobs/runtime-test-one/evidence")).json();
  assert.ok(dump.artifacts["fy2024/source"].pages[0].text.includes(phrase));
  assert.ok(
    !dump.artifacts["fy2024/source"].pages[0].text.includes(
      "Fabricated script evidence",
    ),
  );
  assert.match(dump.artifacts["fy2025/source"].method, /PDF text extraction/);
  assert.ok(dump.artifacts["fy2025/source"].pages[0].text.includes(phrase));
  assert.ok(!JSON.stringify(dump).includes("test-nebius"));
  assert.equal(searches, 3);
  assert.equal(inferenceCalls, 12);
  // Idempotent replay of a completed submission incurs no inference.
  assert.equal((await request("/jobs", payload)).status, 200);
  assert.equal(inferenceCalls, 12);
  await db
    .prepare(
      "INSERT INTO jobs(id,company,issuer_id,as_of,status) VALUES('quota-used','Microsoft','microsoft','2026-10-01','failed')",
    )
    .run();
  assert.equal(
    (
      await request("/jobs", {
        ...payload,
        headers: { "Idempotency-Key": "runtime-over-quota" },
      })
    ).status,
    429,
  );
  const sessionId = crypto.randomUUID(),
    ipHash = "a".repeat(64);
  const issue = () =>
    request("/reception/code", {
      method: "POST",
      body: JSON.stringify({ sessionId, ipHash, body: {} }),
    });
  const codes = await Promise.all(
    Array.from({ length: 4 }, async () => (await issue()).json()),
  );
  assert.equal(new Set(codes.map((c) => c.code)).size, 1);
  const code = codes[0].code;
  const submit = (id, access = code) =>
    request("/jobs", {
      ...payload,
      headers: {
        "Idempotency-Key": id,
        "X-Owner-Access": "0",
        "X-Research-Access": access,
      },
    });
  assert.equal((await submit("invalid-code-job", "wrong-code")).status, 403);
  assert.equal((await submit("quota-no-use-job")).status, 429);
  assert.equal(
    (await db.prepare("SELECT uses FROM access_codes").first()).uses,
    0,
  );
  await db.prepare("DELETE FROM jobs").run();
  const ids = ["code-race-one", "code-race-two", "code-race-three"];
  const admitted = await Promise.all(ids.map((id) => submit(id)));
  assert.equal(admitted.filter((r) => r.status === 202).length, 2);
  assert.equal(admitted.filter((r) => r.status === 403).length, 1);
  assert.equal(
    (await db.prepare("SELECT uses FROM access_codes").first()).uses,
    2,
  );
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM jobs").first()).n,
    2,
  );
  const replay = await submit(ids[admitted.findIndex((r) => r.status === 202)]);
  assert.ok([200, 202].includes(replay.status));
  assert.equal(
    (await db.prepare("SELECT uses FROM access_codes").first()).uses,
    2,
  );
  assert.equal((await (await issue()).json()).code, undefined);
  const anotherCode = await (
    await request("/reception/code", {
      method: "POST",
      body: JSON.stringify({
        sessionId: crypto.randomUUID(),
        ipHash,
        body: {},
      }),
    })
  ).json();
  assert.equal(
    (
      await submit(
        ids[admitted.findIndex((r) => r.status === 202)],
        anotherCode.code,
      )
    ).status,
    403,
  );
  await db.prepare("UPDATE access_codes SET expires_at=unixepoch()-1").run();
  assert.equal((await submit("expired-code-job")).status, 403);
  console.log(
    "Workerd verified: durable three-worker collection, D1 persistence, idempotency, quotas, exact quotes, private evidence export.",
  );
  console.log(
    "Workerd verified: one code per session, atomic two-use admission under concurrency, no consumption on capacity rejection, replay and ownership boundaries.",
  );
} finally {
  await mf.dispose();
}
