import { z } from "zod";

const text = z.string().min(1).max(50_000);
const httpsUrl = z
  .url()
  .refine((value) => value.startsWith("https://"), "Use an HTTPS URL");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateSupport = z.object({
  entry: text,
  role: text,
  value: text,
  basis: text,
});
const supported = {
  id: text,
  refs: z.array(text).min(1).max(100),
  meaning: text,
  limit: text,
  review_status: text,
  reference_roles: z.record(z.string(), z.array(text)),
  date_support: z.array(dateSupport),
};
const evidenceSchema = z.object({
  claim_id: text,
  page: z.number().int().positive(),
  section: text,
  excerpt: text,
  source_url: httpsUrl,
  attribution: z.string().nullable().optional(),
  report_year: z.number().int(),
  quote_verification: text,
  snapshot_method: text,
  origin: text,
  source_page_text: text,
});
export const reportSchema = z
  .object({
    schema_version: z.literal(1),
    company: z.string().min(1).max(200),
    scope: text,
    title: text,
    deck: text,
    as_of: z.iso.date(),
    review: text,
    source_documents: z.number().int().nonnegative(),
    extracted_claims: z.number().int().nonnegative(),
    ledger_entries: z.number().int().nonnegative(),
    uncurated_claims: z.number().int().nonnegative(),
    claim_count_is_quality_score: z.literal(false),
    coverage: z
      .array(
        z.object({
          year: z.number().int(),
          collector_excerpts: z.number().int().nonnegative(),
          supplemental_excerpts: z.number().int().nonnegative().optional(),
          status: text,
        }),
      )
      .min(1)
      .max(30),
    collection_gaps: z.array(text),
    limitations: z.array(text),
    assessments: z
      .array(
        z.object({
          ...supported,
          name: text,
          value: text,
          summary: text,
          caption: text,
        }),
      )
      .min(1)
      .max(12),
    events: z
      .array(
        z.object({
          ...supported,
          month,
          date: text,
          date_kind: text,
          type: text,
          owner: text,
          decision_by: text,
          title: text,
          summary: text,
          tile: text,
          label: text,
          target_period: z.string().nullable(),
        }),
      )
      .min(1)
      .max(250),
    evidence: z.record(z.string(), evidenceSchema),
    ledger_url: z
      .union([httpsUrl, z.string().regex(/^\/reports\/[a-zA-Z0-9._-]+\.html$/)])
      .optional(),
  })
  .superRefine((report, ctx) => {
    for (const key of ["events", "assessments"] as const) {
      const ids = new Set<string>();
      report[key].forEach((item, index) => {
        if (ids.has(item.id))
          ctx.addIssue({
            code: "custom",
            path: [key, index, "id"],
            message: "IDs must be unique",
          });
        ids.add(item.id);
        item.refs.forEach((ref) => {
          if (!report.evidence[ref])
            ctx.addIssue({
              code: "custom",
              path: [key, index, "refs"],
              message: `Missing evidence: ${ref}`,
            });
        });
      });
    }
    const dates = report.events.map((event) =>
      Date.parse(event.month + "-01T00:00:00Z"),
    );
    if (dates.some((date, index) => index > 0 && date < dates[index - 1])) {
      ctx.addIssue({
        code: "custom",
        path: ["events"],
        message: "Events must be in chronological order",
      });
    }
    if (dates.at(-1)! - dates[0] > 20 * 366 * 86_400_000) {
      ctx.addIssue({
        code: "custom",
        path: ["events"],
        message: "A report may span at most 20 years",
      });
    }
  });

export type LeadershipReport = z.infer<typeof reportSchema>;
export const companyInputSchema = z.object({
  company: z.string().trim().min(2).max(160),
});
export const jobIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/);
export const jobSchema = z.discriminatedUnion("status", [
  z.object({
    id: jobIdSchema,
    status: z.literal("queued"),
    message: text.optional(),
  }),
  z.object({
    id: jobIdSchema,
    status: z.literal("running"),
    message: text.optional(),
    progress: z.number().min(0).max(100).optional(),
  }),
  z.object({
    id: jobIdSchema,
    status: z.literal("completed"),
    report: reportSchema,
  }),
  z.object({
    id: jobIdSchema,
    status: z.literal("failed"),
    message: text.optional(),
  }),
]);
export type AnalysisJob = z.infer<typeof jobSchema>;
