# Alphabet annual-report source recovery

Verified on 2026-09-30. This record documents source discovery and harmless retrieval only. No model extraction or collector run was performed, and no collected data or core code was changed.

Read `src/credibility/sources.py` before verification. All three preferred URLs below passed the existing `retrieve()` function: HTTPS/public-host checks, the 25 MB bound, PDF header validation, and `pdftotext` extraction. Downloads and small metadata files were saved under `/tmp/alphabet-<year>-recovery.*`.

## Preferred verified sources

| Fiscal year | Document identity and period | Exact working URL | Official linkage |
| --- | --- | --- | --- |
| 2023 | Alphabet 2023 Annual Report; embedded Form 10-K identifies Alphabet Inc. and fiscal year ended December 31, 2023 on physical PDF page 7 | [Annual PDF](https://s206.q4cdn.com/479360582/files/doc_financials/2023/q4/goog023-alphabet-2023-annual-report-web-1.pdf) | [Issuer earnings listing](https://abc.xyz/investor/earnings/), 2023 → Q4 & Fiscal Year → Annual Report (PDF) |
| 2022 | Alphabet Inc. Form 10-K; fiscal year ended December 31, 2022 on physical PDF page 1 | [10-K PDF](https://s206.q4cdn.com/479360582/files/doc_financials/2022/q4/goog-10-k-q4-2022.pdf) | [Issuer earnings listing](https://abc.xyz/investor/earnings/), 2022 → Q4 & Fiscal Year → 10-K → PDF |
| 2021 | Alphabet Inc. Form 10-K; fiscal year ended December 31, 2021 on physical PDF page 1 | [10-K PDF](https://d18rn0p25nwr6d.cloudfront.net/CIK-0001652044/287eecc5-a885-4a20-8d15-a6847ee5086f.pdf) | [Issuer SEC-filings listing](https://abc.xyz/investor/sec-filings/default.aspx): select Annual Filings, year 2022, Submit; row Feb 2, 2022 / Form 10-K / Annual Report → PDF |

The exact hrefs were read from the official issuer page's browser DOM, not inferred from filename patterns. FY2021 requires adding `d18rn0p25nwr6d.cloudfront.net` to the configured primary-host allowlist for that issuer-linked source. The existing Q4 CDN host is `s206.q4cdn.com`.

| Fiscal year | PDF byte count | SHA-256 of downloaded bytes | Verification user agent |
| --- | ---: | --- | --- |
| 2023 | 2,233,228 | `437c0598a9f621233bc85673ca18c3e72e153f06f98315a6940f63cba7b9e41f` | `WallstreetResearch/1.0 (public annual report retrieval)` |
| 2022 | 901,604 | `caebdc3a1f6032dc4c76e7f5dd94961906f15faebbebe0912505340ac8251526` | `WallstreetResearch/1.0 (public annual report retrieval)` |
| 2021 | 1,408,037 | `6af9ae70cbcf033df26331a5094846b0825dc4260916481b9c5abf4d7c98faa2` | `ManagementEvidenceResearch/1.0` |

## Dates and remaining limits

The [SEC FY2021 filing index](https://www.sec.gov/Archives/edgar/data/1652044/000165204422000019/0001652044-22-000019-index.htm) corroborates report period 2021-12-31 and filing date 2022-02-02. This filing date does not date every statement in the report. FY2023 is the combined annual report, so do not give later shareholder-letter statements the embedded 10-K filing date. This recovery did not establish separate issuer PDF publication dates for FY2022 or FY2023; preserve independently verified metadata and statement dates or leave unknowns null.

The FY2021 original issuer URL with `?cache=fc81690` navigated to the issuer site map in the browser. The direct SEC FY2021 HTML annual report returned HTTP 403 through `retrieve()`. These are source-access failures, not evidence that the annual report is missing. The three verified PDFs above remove the retrieval blocker; extraction and curation remain for the parent task.
