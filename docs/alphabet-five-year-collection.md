# Alphabet five-year collection and presentation

The FY2021–FY2025 annual-report baseline is saved. The interface presents **15 major moments**, supported by a **30-entry ledger**, with full quotations and source-page context available in disclosures. The original 2024 collection and v1 ledger are preserved.

## Collected evidence

| Report | Accepted extraction records | Chunks processed | Rejected quotations |
|---|---:|---:|---:|
| FY2021 | 80 | 3/3 | 9 |
| FY2022 | 68 | 3/3 | 10 |
| FY2023 | 71 | 3/3 | 17 |
| FY2024 | 84 | 3/3 | 6 |
| FY2025 | 83 | 3/3 | 13 |

There are **386 accepted collector records**, plus **one separate offline source-review passage**. Quotation acceptance checks source presence, not semantic correctness, independence, promise fulfillment or review approval. Collector runs remain `partial` because they retain rejected quotations and metadata uncertainty even though all five reports had every chunk processed. There are 353 records outside normalized ledger curation. The remaining FY2024 review inventory proposes 65 groups for its 66 previously uncurated records; it does not approve or automatically import them.

FY2021–2023 required recovery of obsolete or blocked issuer URLs. Exact replacement links were observed on issuer listings and checked with the existing bounded retriever. See [source recovery](alphabet-report-source-recovery.md). The failed initial attempts remain saved. The collector stayed on `gpt-5.6-luna` / `xhigh`, with its custom per-worker sandbox verified; no runtime-model, billing, account or security-setting change was made.

The separate FY2025 legal passage includes an appeal sentence omitted by the rejected automated candidate. It was independently copied as a contiguous exact saved-page quotation into `data/derived/alphabet-source-supplement-v1`, with its origin explicitly retained. No rejected response was rewritten or quietly admitted as verified.

## Presentation and ledger

- [UI and preview instructions](../src/leadership-ui/README.md)
- [Versioned ledger](../data/derived/alphabet-five-year-v2/ledger.html)
- [Ledger JSON](../data/derived/alphabet-five-year-v2/ledger.json)
- [Reproducible presentation workflow](../src/credibility/PRESENTATION.md)
- [Explicit milestone selection](../src/credibility/examples/alphabet-five-year-presentation.json)
- [Machine-readable verification](../data/derived/alphabet-five-year-v2/verification.json)

The design uses off-white `#f7f6f2`, neutral gray cards/rail and charcoal `#27272a`. Four separate views cover delivery, disclosure/accountability, operating efficiency and capital stewardship. Year navigation, staged interruptible movement, keyboard navigation and existing reduced-motion behavior are retained. Quotes include original date precision, attribution support, contrary evidence and full saved pages for table headers. New presentation prose always remains proposed.

The April 2025 approximately $75B capex plan is retained alongside reported FY2025 spending of $91.4B. Its candidate comparison remains **not comparable**, because canonical definition/basis, tolerance, first-disclosure dates and semantic review are unresolved. Neither exceeding a spending plan nor distributing cash establishes value creation. The historical sustainability commitment remains unresolved; missing evidence is not a missed promise.

The annual reports are composite documents in some years. Meeting/listing dates, letter dates, filing dates, event dates, target deadlines and measurement periods remain distinct. Discovery publication metadata is retained as agent-reported and is not substituted for first-disclosure dates. FY2026 statements in the latest annual report are retained in source evidence but excluded from the completed-year timeline.

## Validation and limits

**Passed:** 71 Python tests, six geometry tests, production build, source/quotation revalidation, v1 append-only-history check, exact reproduction of the UI model and generated ledger, and SHA-256 preservation of all **74 existing data files** in the task baseline. The final UI was checked in the in-app browser at desktop and 390px widths: year navigation, source disclosure, one settled card, no horizontal overflow and no console errors. Reduced-motion handling was preserved; current-turn browser emulation of that preference was not performed.

**Repository checker:** three pre-existing missing vertical-skill sources for `meeting-prep-agent`: `client-report`, `client-review`, `investment-proposal`. Those unrelated plugin files were left unchanged. No separate frontend lint or TypeScript check is configured.

**Review:** the first agent review produced six concrete fixes, now addressed and regression-tested. The optional follow-up review agent hit its usage limit. The parent continued its own checks; the already-running collector completed. No review-agent success, model substitution or billing change is claimed.

**Still open:** complete semantic review, original announcements, within-year guidance revisions, accounting/metric bridges, independent corroboration, and individual attribution/tenure evidence. This is a five-year annual-source baseline, not an exhaustive history or a universal management rating. The requested `/private/tmp/nebius-timeline-handoff-2026-09-30.md` was unavailable; the existing project’s Nebius v4 implementation was retained.
