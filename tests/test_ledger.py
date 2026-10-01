"""Offline economic-identity, time, comparability and immutable-history regressions."""
import copy
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import tempfile
import unittest

from credibility.ledger import LedgerError, bounds, build_ledger, main
from credibility.ledger_report import render_html


ROOT = Path(__file__).resolve().parents[1]


def review(status='reviewed', at='2026-09-30'):
    return dict(status=status, reviewer='Fictional test reviewer', reviewer_type='automated',
                at=at, rationale='Synthetic test interpretation; not investment evidence.')


def when(value, ref='s:c0', precision='day'):
    return dict(value=value, precision=precision, basis='Explicit fictional date.', evidence_refs=[ref])


def record(identifier, kind, amount, ref):
    outcome = kind == 'outcome'
    return dict(id=identifier, economic_id=identifier, kind=kind, change='original', supersedes=None,
                summary='FICTIONAL ' + identifier, dimension='delivery_credibility', evidence_refs=[ref],
                grouping_rationale='Distinct fictional economic statement.', metric_id='stores.v1',
                value=dict(operator='eq' if outcome else 'gte', amount=amount, upper=None, tolerance=None),
                dates=dict(statement=when('2026-02-01' if outcome else '2025-01-10', ref),
                           first_disclosure=when('2026-02-01' if outcome else '2025-01-10', ref),
                           event=when('2025-12-31', ref) if outcome else None,
                           completion=when('2025-12-31', ref) if outcome else None,
                           target_deadline=None if outcome else when('2025-12-31', ref),
                           measurement_period=dict(start='2025-01-01', end='2025-12-31', label='FY2025',
                                                   basis='Explicit fictional calendar year.', evidence_refs=[ref])),
                actors=dict(outcome_entity='FICTIONAL Company', statement_by='FICTIONAL Company',
                            decision_by='not_applicable' if outcome else 'management', individuals=[]),
                conditions=[], contrary_evidence_refs=[], limitations=[], review_history=[review()])


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.run = self.root / 'run'; self.run.mkdir()
        self.quotes = ['We plan to open at least 12 stores in 2025 by December 31.',
                       'We opened 12 stores in 2025.', 'We now plan 10 stores in 2025.',
                       'We opened 10 stores in 2025.', 'We opened 13 stores in 2025.',
                       'Store counts are disputed.', 'We withdraw the plan.', 'Earlier results were restated.']
        raw = '\n'.join(self.quotes).encode()
        self.source_hash = hashlib.sha256(raw).hexdigest()
        (self.run / 'doc.source').write_bytes(raw)
        self.snapshot = dict(sha256=self.source_hash, pages=[raw.decode()], extraction_method='fictional text')
        (self.run / 'doc.text.json').write_text(json.dumps(self.snapshot))
        claims = [dict(id=f'c{i}', document_id='doc', page=1, excerpt=q, summary=q,
                       category='reported_fact' if i else 'measurable_promise',
                       source_url='https://example.invalid/fictional.pdf', section='Fictional test',
                       target_date=None, numeric_target=None, unit=None, attribution=None,
                       uncertainties=[], is_highlight=False) for i, q in enumerate(self.quotes)]
        self.pack = dict(schema_version=1, company='FICTIONAL Company', status='complete', jobs=[],
                         documents=[dict(id='doc', title='Fictional report', sha256=self.source_hash,
                                         snapshot='doc.text.json', publication_date='2026-02-01')], claims=claims)
        self.evidence_path = self.run / 'evidence.json'
        self.evidence_path.write_text(json.dumps(self.pack))
        self.promise = record('original', 'promise', '12', 's:c0')
        self.outcome = record('result', 'outcome', '12', 's:c1')
        self.match = dict(id='m1', promise_id='original', outcome_id='result', rationale='Same store openings and year.',
                          contrary_evidence_refs=[], limitations=[], review_history=[review()])
        self.curation = dict(schema_version=1, company='FICTIONAL Company',
                            sources=[dict(id='s', path='run/evidence.json',
                                          sha256=hashlib.sha256(self.evidence_path.read_bytes()).hexdigest())],
                            metrics=[dict(id='stores.v1', definition='New physical store openings during the year.',
                                          unit='stores', accounting_basis='physical_openings',
                                          scope='FICTIONAL consolidated', measurement_basis='period_total')],
                            entries=[self.promise, self.outcome], matches=[self.match], limitations=[])
        self.path = self.root / 'curation.json'

    def build(self, as_of='2026-09-30', previous=None):
        self.path.write_text(json.dumps(self.curation))
        return build_ledger(self.path, as_of, previous)

    def status(self, **kwargs):
        return self.build(**kwargs)['entries'][0]['assessment']

    def test_comparable_delivery_and_precise_elapsed_time(self):
        result = self.build()
        self.assertEqual(result['entries'][0]['assessment'], 'achieved')
        self.assertEqual(result['comparisons'][0]['variance'], '0')
        self.assertEqual(result['comparisons'][0]['elapsed_days'], 355)
        self.assertEqual(result['evidence']['s:c0']['claim'], self.pack['claims'][0])

    def test_partial_numeric_delivery_is_missed_not_invented_partial_credit(self):
        self.outcome['value']['amount'] = '10'
        self.assertEqual(self.status(), 'missed')

    def test_each_metric_dimension_and_definition_must_align(self):
        for field in ('definition', 'unit', 'accounting_basis', 'scope', 'measurement_basis'):
            with self.subTest(field=field):
                other = dict(self.curation['metrics'][0], id='different.v1')
                other[field] = 'different'
                self.curation['metrics'] = [self.curation['metrics'][0], other]
                self.outcome['metric_id'] = 'different.v1'
                result = self.build()
                self.assertEqual(result['entries'][0]['assessment'], 'not_comparable')
                self.assertFalse(next(x['aligned'] for x in result['comparisons'][0]['checks'] if x['field'] == field))

    def test_unknown_basis_even_on_both_sides_cannot_match(self):
        self.curation['metrics'][0]['accounting_basis'] = None
        self.assertEqual(self.status(), 'not_comparable')

    def test_same_definition_text_different_ids_not_implicitly_equivalent(self):
        self.curation['metrics'].append(dict(self.curation['metrics'][0], id='new.v1'))
        self.outcome['metric_id'] = 'new.v1'
        self.assertEqual(self.status(), 'not_comparable')

    def test_quarter_and_year_not_comparable(self):
        self.outcome['dates']['measurement_period']['start'] = '2025-10-01'
        self.assertEqual(self.status(), 'not_comparable')

    def test_retrospective_statement_is_not_promise_delivery(self):
        self.promise['dates']['statement'] = when('2026-01-01')
        self.assertEqual(self.status(), 'not_comparable')

    def test_future_disclosure_cannot_leak_into_historical_cutoff(self):
        self.assertEqual(self.status(as_of='2026-01-15'), 'not_comparable')
        self.curation['matches'] = []
        self.assertEqual(self.status(as_of='2024-12-31'), 'not_available_as_of')

    def test_report_before_period_end_or_completion_cannot_be_a_final_result(self):
        self.outcome['dates']['first_disclosure'] = when('2025-11-01')
        self.assertEqual(self.status(), 'not_comparable')
        self.outcome['dates']['first_disclosure'] = when('2026-02-01')
        self.outcome['dates']['completion'] = when('2026-12-31')
        self.assertEqual(self.status(), 'not_comparable')

    def test_known_future_deadline_does_not_become_an_early_miss(self):
        self.promise['dates']['target_deadline'] = when('2026-12-31')
        self.outcome['value']['amount'] = '10'
        self.assertEqual(self.status(), 'not_yet_due')

    def test_unknown_dates_never_fall_back_to_container_publication(self):
        self.promise['dates']['statement'] = None
        self.promise['dates']['first_disclosure'] = None
        self.assertEqual(self.status(), 'not_comparable')

    def test_missing_outcome_is_not_missed_and_future_deadline_is_distinct(self):
        self.curation['matches'] = []
        self.assertEqual(self.status(), 'outcome_not_found')
        self.assertEqual(self.status(as_of='2025-06-01'), 'not_yet_due')

    def test_authorization_intention_and_forecast_are_not_delivery_promises(self):
        for kind in ('authorization', 'conditional_intention', 'forecast', 'obligation'):
            self.promise['kind'] = kind
            self.assertEqual(self.status(), 'not_a_delivery_promise')
            self.assertEqual(self.build()['comparisons'][0]['status'], 'not_comparable')

    def test_review_conditions_and_contrary_evidence_gate_delivery(self):
        self.match['review_history'] = [review('proposed')]
        self.assertEqual(self.status(), 'needs_review')
        self.match['review_history'] = [review()]
        self.promise['conditions'] = ['Subject to funding.']
        self.assertEqual(self.status(), 'not_comparable')
        self.promise['conditions'] = []
        self.match['contrary_evidence_refs'] = ['s:c5']
        self.assertEqual(self.status(), 'unresolved')
        self.assertEqual(self.build()['comparisons'][0]['contrary_evidence_refs'], ['s:c5'])

    def test_approximate_target_needs_explicit_tolerance(self):
        self.promise['value']['operator'] = 'approximate'
        self.assertEqual(self.status(), 'not_comparable')
        self.promise['value']['tolerance'] = '0.5'
        self.outcome['value']['amount'] = '12.25'
        self.assertEqual(self.status(), 'achieved')
        self.outcome['value']['amount'] = '12.50001'
        self.assertEqual(self.status(), 'missed')

    def test_range_and_ceiling_targets_use_decimal_comparison(self):
        self.promise['value'].update(operator='range', amount='11.9', upper='12.1')
        self.assertEqual(self.status(), 'achieved')
        self.promise['value'].update(operator='lte', amount='11.9', upper=None)
        self.assertEqual(self.status(), 'missed')

    def test_partial_date_precision_cannot_generate_elapsed_days(self):
        self.promise['dates']['statement'] = when('2025-01', precision='month')
        result = self.build()
        self.assertEqual(result['entries'][0]['assessment'], 'achieved')
        self.assertIsNone(result['comparisons'][0]['elapsed_days'])
        self.assertEqual(str(bounds(when('2024-02', precision='month'))[1]), '2024-02-29')

    def test_unknown_completion_date_does_not_substitute_measurement_end(self):
        self.outcome['dates']['completion'] = None
        self.assertEqual(self.status(), 'unresolved')

    def test_late_delivery_is_visible(self):
        self.promise['dates']['target_deadline'] = when('2025-11-30')
        self.assertEqual(self.status(), 'achieved_late')

    def test_revision_preserves_original_target_and_comparisons(self):
        revised = record('revised', 'promise', '10', 's:c2')
        revised.update(economic_id='original', change='revision', supersedes='original')
        revised['dates']['statement'] = when('2025-06-01', 's:c2')
        revised['dates']['first_disclosure'] = when('2025-06-01', 's:c2')
        self.curation['entries'].append(revised)
        self.outcome['value']['amount'] = '10'
        self.curation['matches'].append(dict(self.match, id='m2', promise_id='revised'))
        result = self.build()
        self.assertEqual(result['entries'][0]['assessment'], 'missed')
        self.assertEqual(result['entries'][0]['lifecycle'], 'changed')
        self.assertEqual(result['entries'][2]['assessment'], 'achieved')
        self.assertEqual(result['economic_groups']['original'], ['original', 'revised'])
        self.assertEqual(result['entries'][0]['value']['amount'], '12')

    def test_invalid_revision_graphs_rejected(self):
        revised = copy.deepcopy(self.promise)
        revised.update(id='revised', change='revision', supersedes='original')
        self.curation['entries'].append(revised)
        with self.assertRaisesRegex(LedgerError, 'unambiguous statement dates'):
            self.build()
        revised['dates']['statement'] = when('2025-06-01')
        revised['economic_id'] = 'wrong'
        with self.assertRaisesRegex(LedgerError, 'economic identity'):
            self.build()

    def test_withdrawal_is_preserved_not_a_miss(self):
        withdrawal = copy.deepcopy(self.promise)
        withdrawal.update(id='withdrawal', change='withdrawal', supersedes='original')
        withdrawal['dates']['statement'] = when('2025-06-01', 's:c6')
        withdrawal['evidence_refs'] = ['s:c6']
        self.curation['entries'].append(withdrawal)
        result = self.build()
        self.assertEqual(result['entries'][2]['assessment'], 'withdrawn')
        self.assertEqual(result['entries'][0]['value']['amount'], '12')
        withdrawal['dates']['first_disclosure'] = when('2026-10-01')
        self.assertEqual(self.build()['entries'][2]['assessment'], 'not_available_as_of')

    def test_multiple_evidence_packs_support_a_longitudinal_match(self):
        second = copy.deepcopy(self.pack)
        second['claims'] = [second['claims'][1]]
        later = self.run / 'later-evidence.json'
        later.write_text(json.dumps(second))
        self.curation['sources'].append(dict(id='later', path='run/later-evidence.json',
                                             sha256=hashlib.sha256(later.read_bytes()).hexdigest()))
        self.outcome['evidence_refs'] = ['later:c1']
        for value in self.outcome['dates'].values():
            if value:
                value['evidence_refs'] = ['later:c1']
        result = self.build()
        self.assertEqual(result['entries'][0]['assessment'], 'achieved')
        self.assertEqual(len(result['sources']), 2)
        self.assertIn('later:c1', result['evidence'])

    def test_conflicting_outcomes_cannot_be_cherry_picked(self):
        another = record('conflict', 'outcome', '13', 's:c4')
        self.curation['entries'].append(another)
        self.curation['matches'].append(dict(self.match, id='m2', outcome_id='conflict'))
        self.assertEqual(self.status(), 'unresolved')
        another['value']['amount'] = '10'
        self.assertEqual(self.status(), 'unresolved')

    def test_restatement_reopens_match_but_future_restatement_does_not_leak(self):
        restated = record('restated', 'outcome', '10', 's:c7')
        restated.update(economic_id='result', change='revision', supersedes='result')
        restated['dates']['statement'] = when('2026-03-01', 's:c7')
        restated['dates']['first_disclosure'] = when('2026-03-01', 's:c7')
        self.curation['entries'].append(restated)
        self.assertEqual(self.status(), 'unresolved')
        self.assertEqual(self.status(as_of='2026-02-15'), 'achieved')

    def test_previous_ledger_enforces_append_only_history(self):
        old = self.build(); previous = self.root / 'old.json'; previous.write_text(json.dumps(old))
        self.promise['review_history'].append(review('proposed', '2026-10-01'))
        updated = self.build(as_of='2026-10-01', previous=previous)
        self.assertIsNotNone(updated['previous_ledger_sha256'])
        self.promise['value']['amount'] = '10'
        with self.assertRaisesRegex(LedgerError, 'Cannot rewrite historical'):
            self.build(as_of='2026-10-01', previous=previous)

    def test_previous_ledger_prevents_source_snapshot_rewrite(self):
        old = self.build(); previous = self.root / 'old.json'; previous.write_text(json.dumps(old))
        self.snapshot['pages'][0] += '\nUnverified new table header'
        (self.run / 'doc.text.json').write_text(json.dumps(self.snapshot))
        with self.assertRaisesRegex(LedgerError, 'snapshot changed'):
            self.build(previous=previous)

    def test_source_hash_evidence_hash_and_exact_quote_fail_closed(self):
        raw = self.evidence_path.read_bytes()
        self.evidence_path.write_bytes(raw + b' ')
        with self.assertRaisesRegex(LedgerError, 'Evidence hash mismatch'):
            self.build()
        self.evidence_path.write_bytes(raw)
        (self.run / 'doc.source').write_bytes(b'changed')
        with self.assertRaisesRegex(LedgerError, 'Raw source hash mismatch'):
            self.build()
        (self.run / 'doc.source').write_bytes('\n'.join(self.quotes).encode())
        self.snapshot['pages'] = ['does not contain the quotation']
        (self.run / 'doc.text.json').write_text(json.dumps(self.snapshot))
        with self.assertRaisesRegex(LedgerError, 'Quotation no longer matches'):
            self.build()

    def test_bad_reference_duplicate_id_and_nonfinite_amount_rejected(self):
        self.promise['evidence_refs'] = ['missing']
        with self.assertRaisesRegex(LedgerError, 'unknown evidence'):
            self.build()
        self.promise['evidence_refs'] = ['s:c0']
        self.promise['value']['amount'] = 'NaN'
        with self.assertRaisesRegex(LedgerError, 'Non-finite'):
            self.build()
        self.promise['value']['amount'] = '12'
        self.curation['entries'].append(copy.deepcopy(self.promise))
        with self.assertRaisesRegex(LedgerError, 'Duplicate'):
            self.build()

    def test_schema_typo_does_not_silently_drop_dates(self):
        self.promise['dates']['target_date'] = '2025'
        with self.assertRaisesRegex(ValueError, 'missing or unknown fields'):
            self.build()

    def test_cli_is_offline_new_directory_only_and_does_not_mutate_inputs(self):
        self.build()
        before = {p: p.read_bytes() for p in self.run.iterdir()}
        output = self.root / 'output'
        main(['--curation', str(self.path), '--output', str(output), '--as-of', '2026-09-30'])
        self.assertEqual({p.name for p in output.iterdir()}, {'ledger.json', 'ledger.html', 'ledger.md'})
        with self.assertRaises(SystemExit) as error:
            main(['--curation', str(self.path), '--output', str(output)])
        self.assertEqual(error.exception.code, 2)
        self.assertEqual(before, {p: p.read_bytes() for p in self.run.iterdir()})

    def test_html_escapes_untrusted_content_and_has_resolvable_citation_links(self):
        self.promise['summary'] = '<script>alert(1)</script>'
        html = render_html(self.build())
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)
        class Links(HTMLParser):
            ids = set(); refs = set()
            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if 'id' in attrs: self.ids.add(attrs['id'])
                if attrs.get('href', '').startswith('#'): self.refs.add(attrs['href'][1:])
        parser = Links(); parser.feed(html)
        self.assertFalse(parser.refs - parser.ids)


class AlphabetRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = build_ledger(ROOT / 'src/credibility/examples/alphabet-ledger-v1.json', '2026-09-30')
        cls.entries = {entry['id']: entry for entry in cls.result['entries']}

    def test_three_dividend_claims_are_one_conditional_intention(self):
        entry = self.entries['future-dividend-intention']
        self.assertEqual(len(entry['evidence_refs']), 3)
        self.assertEqual(entry['kind'], 'conditional_intention')
        self.assertEqual(entry['assessment'], 'not_a_delivery_promise')
        kinds = [self.result['evidence'][ref]['claim']['category'] for ref in entry['evidence_refs']]
        self.assertEqual(kinds.count('measurable_promise'), 2)
        self.assertIn('aspiration', kinds)

    def test_composite_dates_and_missing_capex_outcome_remain_honest(self):
        capex = self.entries['capex-2025-plan']
        self.assertEqual(capex['dates']['statement']['value'], '2025-04')
        self.assertIsNone(capex['dates']['first_disclosure'])
        self.assertEqual(capex['dates']['measurement_period']['end'], '2025-12-31')
        self.assertEqual(capex['assessment'], 'outcome_not_found')
        authorization = self.entries['april-2024-buyback-authorization']
        self.assertEqual(authorization['dates']['event']['value'], '2024-04')
        self.assertIsNone(authorization['dates']['target_deadline'])
        dividends = self.entries['dividends-fy2024']
        self.assertEqual(dividends['dates']['event']['value'], '2024-06')
        self.assertEqual(dividends['dates']['measurement_period']['end'], '2024-12-31')

    def test_layout_snapshot_and_column_headers_are_retained(self):
        ref = self.entries['operating-margin-fy2024']['evidence_refs'][0]
        citation = self.result['evidence'][ref]
        page = self.result['source_pages'][citation['source_page_ref']]
        self.assertIn('supplied-layout', page['snapshot'])
        self.assertIn('2023', page['text']); self.assertIn('2024', page['text'])
        self.assertIn('in millions', page['text'])
        self.assertEqual(citation['quote_check'], 'exact_saved_page_substring')

    def test_coverage_attribution_and_dimensions_do_not_imply_ratings(self):
        self.assertEqual(self.result['coverage']['extraction_records'], 84)
        self.assertEqual(len(self.result['coverage']['uncurated_refs']), 66)
        self.assertEqual(len(self.result['dimensions']), 4)
        self.assertTrue(all(x['review_status'] == 'proposed' for x in self.entries.values()))
        self.assertTrue(all(x['actors']['outcome_entity'] == 'Alphabet Inc.' for x in self.entries.values()))
        person = self.entries['capex-2025-plan']['actors']['individuals'][0]
        self.assertEqual(person['relationship'], 'statement')
        self.assertIsNone(person['tenure_start'])
        self.assertNotIn('score', self.result)


if __name__ == '__main__':
    unittest.main()
