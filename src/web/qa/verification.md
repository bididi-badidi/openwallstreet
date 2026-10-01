# OpenWallstreet interface verification

Verified October 1, 2026 at https://wallstreet-leadership.zishenchan.workers.dev.

- Frontend release: `b12aaffc-b31f-4118-8a05-05cef81c03e7`.
- Research and reception release: `48cf8f37-50c6-4900-9327-97e4fee22ea3`.
- Design concept: [concept.png](concept.png), originally generated at `/Users/user/.codex/generated_images/01a0f63a-fb82-7cc3-a4af-deff5636f6f8/exec-7e57c81e-c056-4a57-8eda-f185a192467d.png`.
- Rendered screenshots: [desktop](desktop.jpg), [phone](mobile.jpg), [contact validation](mobile-contact.jpg).

## Visual comparison

Browser/IAB was used directly through the computer-use tool, with DOM and accessibility inspection, actual clicks, and JPEG screenshots. No external browser driver or fallback was needed. The concept and latest desktop render were both inspected with `view_image` in the same QA pass. Phone captures were also inspected with `view_image`.

The native concept viewport, 1435 x 1096, was checked at scroll position zero. Responsive checks covered 390 x 844 and 320 x 740. The normal browser viewport was restored and checked at 516 x 853. None had horizontal overflow. The desktop screenshot retains browser focus indicators and its native scrollbar; these are functional browser states, not decorative design elements.

| Comparison | Concept and render evidence | Resolution |
| --- | --- | --- |
| Brand and navigation | OpenWallstreet with coral period on left, Home and arrow on right | Matches; former global navigation labels removed |
| Hero typography | Large bold two-line heading and two-line introduction | Increased heading from 72 to 84 px and adjusted family, weight, tracking, and mobile scale; phone heading remains two lines |
| Palette | Off-white paper, dark ink, coral accent, pale borders, white inputs and chat surface; no gradients | Implemented with shared tokens; no hero image, background overlay, or generated raster UI |
| Page geometry | Approximately 90 px left gutter, paired controls, two example cards under a divider | Corrected initially narrow container and smaller control typography; example grid is 920 px wide and no longer sits under the open desktop chat |
| Copy and hierarchy | Hero, company form, access code, samples, footer | Copy order preserved; fixed missing whitespace between introductory sentences on mobile |
| Card assets | Alphabet A and Microsoft mark in pale tiles | Uses native A and M monograms intentionally, consistent with the report component, rather than reproducing the concept's Microsoft logo |
| Icons and controls | Thin outline arrows, close control, paper-plane send icon | Native SVG icons with consistent stroke; empty composer disables Send and keyboard focus remains visible |
| Reception placement | White rounded panel at bottom right; examples and footer remain visible at native desktop size | Raised desktop panel above footer, aligned width to 360 px; phone panel constrained to viewport with internal scrolling |
| Responsive behavior | Same visual system extended to smaller screens | Inputs and buttons stack, cards become one column, heading scales fluidly; fixed three-line phone heading and contact form opening at its bottom |

Above-the-fold copy diff: brand, Home, headline, introduction, field labels, primary CTA, agent CTA, helper note, sample heading, card labels, and reception greeting match the concept. Intentional additions are the empty access-code placeholder, collapsed "Ask reception" launcher, AI scope disclosure, and functional response/contact states. The empty form has a real placeholder rather than seeded password dots. The removed long supported-company list remains available through the input suggestions and reception. No unapproved marketing sections or copy were added.

The implementation was faithfully verified against the generated design, with the intentional monogram and functional-state differences recorded above. No material visual mismatches remain.

## Functional evidence

- TypeScript check and production build passed. All 23 tests passed; the two reception tests were rerun after the final cache-privacy changes.
- Real workerd and D1 tests completed the existing research Workflow and checked private evidence export, job idempotency, provider bounds, and capacity limits.
- Concurrent code requests produced one code. Three concurrent job requests using it admitted exactly two, consumed exactly two uses, and rejected the third. A capacity rejection consumed no use; a replay consumed no extra use. Expired and unrelated codes were rejected.
- Reception tests cover signed cookie reload/tampering/expiry, bounded actions, out-of-scope replies, arbitrary navigation rejection, chat limits, code redaction, and cached replies without plaintext code storage.
- Live browser checks confirmed a project answer from Nebius, refusal of a prompt-override request and an unrelated recipe request, code creation and form autofill, the same code after reload, and successful Microsoft navigation through an approved link.
- Homepage has exactly two example cards and zero inline report components. Alphabet and Microsoft cards lead to their report pages. Microsoft timeline navigation and evidence disclosure work.
- The Microsoft public evidence download returned HTTP 200 and includes the report, three source texts, and accepted claim collections. Private job reads and cross-origin reception requests returned the application's HTTP 403 responses.
- Contact form requires all four fields and shows the fixed destination before submission. Mock delivery tests enforce that destination, reject recipient overrides and header injection, require explicit confirmation, avoid duplicate sends, and refuse automatic resend after an ambiguous provider error.
- Cloudflare Email Sending is enabled for `openwallstreet.zishenchan.com`; SPF, DKIM, return-path MX, and DMARC records were checked in public DNS. The deployed binding restricts sender and recipient. No live test message was sent, so actual inbox receipt is unverified.
- Browser console contained no warnings or errors at completion. Temporary viewport overrides were reset.
