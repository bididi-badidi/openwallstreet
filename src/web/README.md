# Web application

The deployed OpenWallstreet website uses vinext, React, and Cloudflare Workers. Saved examples and live research share validated report contracts.

- [Local development and checks](../../docs/development.md)
- [Architecture](../../docs/architecture.md)
- [Deployment, environments, and migrations](../../docs/deployment.md)
- [Repository conventions](../../docs/repository-layout.md)

## Main components

| Path | Responsibility |
| --- | --- |
| `app/` | Pages and browser-facing APIs |
| `components/ResearchWorkspace.tsx` | Research input and page composition |
| `components/Reception.tsx` | Reception, access codes, and explicit contact form |
| `components/ResearchResult.tsx` | Job progress, recovery, and report display |
| `components/report/` | Reusable report, evidence, and timeline views |
| `lib/report-schema.ts` | Runtime-validated input, job, and report contracts |
| `lib/job-service.ts` | Private service adapter and job access boundary |
| `research/` | Job API, durable research, providers, and source validation |
| `research/migrations/` | Ordered D1 schema changes, including reception tables |
| `reception/service.ts` | Backend reception capabilities and quotas |
| `data/` | Curated saved examples and portable schemas |
| `qa/` | Curated visual verification records |

## Commands

Run from this directory:

```sh
npm ci
npm run dev
npm run check
```

`npm run research:dev` starts the backend locally. `npm run build:preview` selects isolated preview bindings at build time. `npm run deploy:dry-run` validates the most recently built frontend. A frontend build is environment-specific: never deploy production output as preview or vice versa.

`npm run schema` regenerates the portable report/job schemas. `npm run sample:refresh` refreshes the Alphabet public sample after the original Python presentation has been recompiled. Review public evidence and provenance before committing it.

## Runtime scope

Supported companies are Apple, Microsoft, Alphabet, Amazon, NVIDIA, Meta, and Tesla. Live research attempts three preceding year labels, at most one annual report per year and six extraction chunks per report. It is an evidence inventory; the offline Python ledger has a different scope.

The private research service is reached through a service binding. Browser access uses signed cookies; reception can issue limited-use access codes. Shared limits are configured in Wrangler. Job evidence expires after seven days. Original PDF/HTML bytes are not retained. Missing sources and partial extraction are disclosed.

## Verification

Unit tests exercise contracts, access boundaries, source restrictions, reception limits, timeline behavior, and environment isolation. The Workflows/D1 test runs real workerd with deterministic provider responses. CI does not spend Nebius or Tavily credits.

Historical deployment verification is archived in [the October 1 record](../../docs/archive/verification/cloudflare-2026-10-01.md). It does not establish the state of a later deployment.
