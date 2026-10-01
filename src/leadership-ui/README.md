# Alphabet five-year leadership record

A compact stakeholder timeline over Alphabet FY2021–FY2025 evidence, with an off-white background, neutral gray rail/cards and charcoal text. Raw collection, normalized ledger entries and presentation selection remain separate. There is no universal management score or individual director rating.

## Build and preview

From this directory:

```sh
npm run build
node --test timeline-geometry.test.js
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. Dependencies are already installed in this workspace; on a fresh checkout use `npm ci --ignore-scripts` first. The app uses local bundled assets and inline SVG icons, without a conversation-host icon dependency.

To create a portable HTML fragment, run `python3 build-fragment.py`. It writes `build/fragment.html` by default; `--output PATH` chooses another authorized destination. It no longer writes into an unrelated conversation directory. `preview.html` is the older conversation prototype, not the rebuilt five-year view.

## Evidence model

Do not manually edit `evidence-model.json`. Rebuild it from the [presentation compiler](../credibility/PRESENTATION.md), the pinned [ledger curation](../credibility/examples/alphabet-ledger-five-year-v2.json) and the [milestone selection](../credibility/examples/alphabet-five-year-presentation.json).

The compiler rechecks source bytes, accepted quotations and preserved v1 ledger history. It retains date and attribution citations, contrary evidence, full source pages including table headers, and proposed review states. Source links use physical PDF page anchors. The coverage disclosure links to `build/ledger.html`, a copy of the current versioned ledger. After regenerating the ledger, refresh it from the repository root with `cp data/derived/alphabet-five-year-v2/ledger.html src/leadership-ui/build/ledger.html`. A separately identified offline source supplement preserves a contiguous legal passage that an automated extraction elided; the original rejected response and all collected files remain unchanged.

Four independent views cover delivery credibility, disclosure/accountability, operating efficiency and capital stewardship. Major events link to their support and limits. Year buttons jump through the timeline; previous/next, arrow keys and Home/End remain available. Missing or partly processed years are visible beside the timeline and in coverage. Completed chunk processing is not comprehensive semantic review.

## Motion and dates

The existing Nebius v4 geometry and staged Motion sequence are preserved: an upright card follows the 26-degree rail, travel uses a 1.8-second spring, then a cancellable 450ms pause, then surface expansion before copy appears. Repeated navigation interrupts from current values. Reduced motion skips travel, pause, expansion and blur. Transitions.dev owns the accordion disclosure behavior, not rail motion.

Rail anchors are for layout. Month-only evidence retains month precision; annual outcomes retain their full measurement period and use the period-end month. When several distinct entries share a month anchor, one milestone retains each entry and its date rationale. Collapsed numeric tiles keep period/meaning qualifiers visible. Collision visibility sets are computed once per frame for the five-year range.

## Verification

See [THEME.md](THEME.md) for color and contrast checks. Unit tests cover geometry and thinning; Python presentation tests cover missing years, immutable citations, date roles, cutoff availability, separate dimensions and review-state boundaries. The [collection and verification report](../../docs/alphabet-five-year-collection.md) records the completed run and its limitations.

The current turn verified the desktop and 390px mobile interface in the in-app browser over a loopback-only preview server: navigation, interruption, source expansion, one settled card and no horizontal overflow. Reduced-motion logic and CSS are preserved; current-turn browser emulation of that setting is not claimed. The requested `/private/tmp/nebius-timeline-handoff-2026-09-30.md` was unavailable, so the existing project reference was retained.
