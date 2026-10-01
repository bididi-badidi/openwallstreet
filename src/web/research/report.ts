import { reportSchema, type LeadershipReport } from '../lib/report-schema';
import type { Collected, Claim } from './data';

export function buildReport(company: string, asOf: string, collected: Collected[]): LeadershipReport {
  const successful = collected.filter(c => c.document && c.snapshot && c.claims.length);
  if (!successful.length) throw new Error('no_verified_evidence');
  const evidence: LeadershipReport['evidence'] = {};
  const events: LeadershipReport['events'] = [];
  const groups: Record<Claim['category'], string[]> = {
    measurable_promise: [], forecast: [], aspiration: [], reported_fact: [], challenge: [],
  };
  let count = 0;
  for (const item of successful) {
    const doc = item.document!, snapshot = item.snapshot!;
    const selected = [...item.claims].sort((a, b) => Number(b.is_highlight) - Number(a.is_highlight)).slice(0, 5);
    for (const claim of selected) {
      const id = `fy${item.year}-claim-${count++}`;
      groups[claim.category].push(id);
      evidence[id] = { claim_id: id, page: claim.page, section: claim.section, excerpt: claim.excerpt,
        source_url: doc.url, attribution: claim.attribution, report_year: item.year,
        quote_verification: 'Exact source text matched; semantic interpretation requires review',
        snapshot_method: snapshot.method + '; cited excerpt shown here; full text is in the evidence download',
        origin: 'Live Nebius extraction, source validated by Cloudflare Workflow', source_page_text: claim.excerpt };
      const date = doc.period_end;
      const limit = ['The timeline date is the report period end, not a verified statement or decision date.',
        'No promise-to-outcome comparison or individual contribution has been verified.', ...claim.uncertainties].join(' ');
      events.push({ id, refs: [id], month: date.slice(0, 7), date: `FY${item.year}`,
        date_kind: 'Report period end', type: claim.category.replaceAll('_', ' '),
        owner: claim.attribution || 'Company report; individual attribution unknown', decision_by: 'unknown',
        title: claim.summary, summary: claim.excerpt.slice(0, 320),
        tile: claim.numeric_target?.slice(0, 14) || String(item.year), label: claim.unit?.slice(0, 25) || 'REPORT',
        target_period: claim.target_date, meaning: claim.summary, limit,
        review_status: 'Proposed interpretation; human review required',
        reference_roles: { [id]: ['source statement'] },
        date_support: [{ entry: id, role: 'report_period_end', value: date,
          basis: 'Agent-reported document metadata; not an independently verified statement date' }],
      });
    }
  }
  events.sort((a, b) => a.month.localeCompare(b.month));
  const definitions = [
    { id: 'promises', name: 'Management promises', refs: [...groups.measurable_promise, ...groups.aspiration],
      limit: 'Targets and aspirations are recorded without concluding delivery.' },
    { id: 'outcomes', name: 'Reported performance', refs: groups.reported_fact,
      limit: 'Reported facts have not been matched to prior promises or independently audited.' },
    { id: 'outlook', name: 'Forward outlook', refs: groups.forecast,
      limit: 'Forecasts are uncertain and are not treated as achieved outcomes.' },
    { id: 'challenges', name: 'Management challenges', refs: groups.challenge,
      limit: 'A reported challenge does not establish responsibility, resolution or personal conduct.' },
  ];
  const allRefs = Object.keys(evidence);
  const assessments = definitions.map(d => ({ id: d.id, name: d.name,
    refs: d.refs.length ? d.refs : [allRefs[0]], value: d.refs.length ? 'Evidence collected' : 'Not assessed',
    summary: d.refs.length ? `${d.refs.length} selected source statements. Interpretation remains open.`
      : 'No selected statement supports an assessment of this area.',
    caption: d.refs.length ? 'Review source evidence' : 'Review scope and limits',
    meaning: 'Evidence inventory, not a management-quality score.', limit: d.limit,
    review_status: 'Human review required', reference_roles: Object.fromEntries(
      (d.refs.length ? d.refs : [allRefs[0]]).map(ref => [ref, [d.refs.length ? 'source statement' : 'scope context only']])),
    date_support: [],
  }));
  const claimCount = collected.reduce((n, c) => n + c.claims.length, 0);
  return reportSchema.parse({ schema_version: 1, company, as_of: asOf,
    scope: `${Math.min(...collected.map(c => c.year))} to ${Math.max(...collected.map(c => c.year))} fiscal annual reports; bounded live research`,
    title: 'What the company put on record',
    deck: 'Source-backed statements from annual reports. Dates, attribution and interpretation remain subject to review.',
    review: 'Live research; proposed interpretation. No management credibility score.',
    source_documents: successful.length, extracted_claims: claimCount, ledger_entries: events.length,
    uncurated_claims: Math.max(0, claimCount - events.length), claim_count_is_quality_score: false,
    coverage: [...collected].sort((a, b) => a.year - b.year).map(c => ({ year: c.year,
      collector_excerpts: c.claims.length, status: !c.document ? 'report not retrieved' :
        c.gaps.length ? 'partial collection; review pending' : 'collected; review pending' })),
    collection_gaps: collected.flatMap(c => c.gaps.map(g => `FY${c.year}: ${g}`)),
    limitations: ['Three fiscal years and one annual report per year are attempted; coverage is not exhaustive.',
      'Up to six text chunks and ten candidate claims per chunk are analyzed. Five milestones per report are selected.',
      'Exact quotation presence is checked. Metadata, classification and semantic accuracy require human review.',
      'No director contribution, promise fulfillment or challenge resolution has been established.',
      'Source text and SHA-256 fingerprints are retained privately for seven days; original PDF/HTML bytes are not retained.',
      'Timeline positions use report period ends. They must not be read as exact decision dates.'],
    assessments, events, evidence });
}
