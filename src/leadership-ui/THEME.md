# Off-white timeline appearance

The presentation uses a fixed light appearance, including when embedded in a dark
host. The requested off-white background is `#f7f6f2`; cards are neutral grey
`#f0efec`, with `#e7e6e2` thumbnail and selected-assessment material. Event types
remain stated in text, rather than using green, amber or blue card backgrounds.

The four assessment columns become two below 850px and one below 600px. Existing
compact phone card structure is retained. No timeline geometry, animation timing,
interaction orchestration, evidence or source disclosures were changed for the
theme. Motion remains the owner of card transforms and staged reveals; the
Transitions.dev accordion stylesheet remains unchanged.

Press feedback changes material immediately with `:active`, including when motion
is reduced. Keyboard focus outlines the full visible event-card surface rather
than only its compact button box. Other buttons and links receive an explicit
focus outline. Hover styling cannot override pressed material.

Reduced transparency removes toolbar blur and uses a solid surface. Increased
contrast darkens secondary text, rail and borders. Forced-colour mode uses system
colour tokens, with explicit rail/dot fills so the timeline remains visible.

## Numerical contrast

WCAG relative-luminance calculation on opaque, settled colours:

| Pair | Contrast |
| --- | --- |
| Charcoal text / off-white | 13.77:1 |
| Charcoal text / grey card | 12.95:1 |
| Secondary text / off-white | 6.05:1 |
| Secondary text / grey card | 5.69:1 |
| Secondary text / selected material | 5.24:1 |
| Secondary text / pressed material | 4.76:1 |
| Rail, stems and minor ticks / off-white | 3.44:1 |
| Focus outline / off-white | 8.42:1 |
| Increased-contrast secondary text / grey card | 9.12:1 |
| Increased-contrast rail / off-white | 6.05:1 |
| Increased-contrast border / grey card | 3.93:1 |

Normal card/divider borders are decorative light-grey separators. Text, focus,
timeline rail and interactive icon colours have their own stronger contrast.
These calculations do not certify antialiased pixels, animation frames or host
rendering.

## Verification for this change

`npm run build` and all six `node --test timeline-geometry.test.js` checks passed.
No browser inspection was performed for this change: the previous file-URL
browser policy block was respected, and no workaround was attempted. The current
build is a checkpoint; rebuild after presentation-content integration. No new
dependencies, network calls or deployments were used.
