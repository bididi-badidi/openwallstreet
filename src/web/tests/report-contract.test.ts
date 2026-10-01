import test from "node:test";
import assert from "node:assert/strict";
import sample from "../data/alphabet.json";
import {
  reportSchema,
  jobSchema,
  companyInputSchema,
} from "../lib/report-schema";

test("the original Alphabet evidence renders through the reusable contract", () => {
  const report = reportSchema.parse(sample);
  assert.equal(report.company, "Alphabet Inc.");
  assert.equal(report.events.length, 15);
  assert.equal(report.assessments.length, 4);
  assert.equal(Object.keys(report.evidence).length, 28);
});
test("reject reports with missing sources, duplicate IDs, unsafe links, or invalid timeline bounds", () => {
  const mutations = [
    (r: typeof sample) => {
      r.events[0].refs = ["missing"];
    },
    (r: typeof sample) => {
      r.events[1].id = r.events[0].id;
    },
    (r: typeof sample) => {
      Object.values(r.evidence)[0].source_url = "javascript:alert(1)";
    },
    (r: typeof sample) => {
      r.events[0].month = "2021-99";
    },
    (r: typeof sample) => {
      r.events[0].month = "2099-01";
    },
    (r: typeof sample) => {
      r.events[0].month = "1900-01";
    },
    (r: typeof sample) => {
      r.events = [];
    },
    (r: typeof sample) => {
      r.ledger_url = "//evil.example/ledger.html";
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(sample);
    mutate(copy);
    assert.equal(reportSchema.safeParse(copy).success, false);
  }
});
test("completed jobs must contain a valid report and progress stays within bounds", () => {
  assert.equal(
    jobSchema.safeParse({ id: "job_test_123", status: "completed" }).success,
    false,
  );
  assert.equal(
    jobSchema.safeParse({
      id: "job_test_123",
      status: "running",
      progress: 110,
    }).success,
    false,
  );
  assert.equal(
    jobSchema.safeParse({ id: "../traverse", status: "queued" }).success,
    false,
  );
  assert.equal(
    jobSchema.safeParse({
      id: "job_test_123",
      status: "completed",
      report: sample,
    }).success,
    true,
  );
  assert.equal(companyInputSchema.safeParse({ company: "   " }).success, false);
  assert.deepEqual(companyInputSchema.parse({ company: " Alphabet " }), {
    company: "Alphabet",
  });
});
