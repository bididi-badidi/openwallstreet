"""Protect source identity, date roles and missing-year disclosure in the UI view."""
import copy
import json
from pathlib import Path
import unittest

from credibility.ledger import build_ledger, LedgerError
from credibility.presentation import anchor, compile_presentation

ROOT = Path(__file__).resolve().parents[1]


class PresentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = build_ledger(ROOT / 'src/credibility/examples/alphabet-ledger-v1.json', '2026-09-30')

    def setUp(self):
        self.ledger = copy.deepcopy(self.original)
        self.selection = dict(schema_version=1, company='Alphabet Inc.', fiscal_years=[2021, 2025],
                              title='Test selection', deck='Test', limitations=[], events=[dict(
                                  id='capex', entry_ids=['capex-2025-plan'], anchor_entry='capex-2025-plan',
                                  anchor_kind='statement', title='Plan', summary='Test', tile='$75B', label='Plan',
                                  meaning='Test', limit='Test', materiality_reason='Material spending plan')], assessments=[])
        entries = {'delivery_credibility': 'capex-2025-plan',
                   'disclosure_accountability': 'controls-conclusion-2024',
                   'operating_efficiency': 'operating-margin-fy2024',
                   'capital_stewardship': 'dividends-fy2024'}
        for dimension, entry in entries.items():
            self.selection['assessments'].append(dict(id=dimension, entry_ids=[entry], value='Test',
                                                      summary='Test', caption='Test', meaning='Test', limit='Test'))

    def build(self):
        return compile_presentation(self.ledger, self.selection)

    def test_statement_month_does_not_become_report_year_or_deadline(self):
        event = self.build()['events'][0]
        self.assertEqual(event['month'], '2025-04')
        self.assertEqual(event['date_precision'], 'month')
        self.assertEqual(event['target_period'], 'FY2025')
        self.assertNotIn('event_date', event)

    def test_annual_period_is_not_a_december_event(self):
        entry = next(e for e in self.ledger['entries'] if e['id'] == 'operating-margin-fy2024')
        result = anchor(entry, 'measurement_period')
        self.assertEqual(result['date'], 'FY2024')
        self.assertEqual(result['month'], '2024-12')
        self.assertEqual(result['period_start'], '2024-01-01')
        self.assertNotIn('event_date', result)

    def test_missing_years_remain_missing_despite_events_in_2025(self):
        years = {r['year']:r for r in self.build()['coverage']}
        self.assertEqual(years[2024]['documents'], 1)
        self.assertEqual(years[2025]['status'], 'not collected')
        self.assertEqual(years[2021]['accepted_excerpts'], 0)

    def test_citations_keep_page_context_and_stable_ids(self):
        view = self.build()
        ref = view['events'][0]['refs'][0]
        quote = view['evidence'][ref]
        self.assertTrue(quote['source_url'].endswith('#page=4'))
        self.assertIn(quote['excerpt'], quote['source_page_text'])
        self.assertEqual(ref.split(':')[1], quote['claim_id'])
        self.assertEqual(view['events'][0]['review_status'], 'proposed')

    def test_date_and_contrary_support_are_visible_with_roles(self):
        event = self.build()['events'][0]
        date_ref = self.ledger['entries'][0]['dates']['statement']['evidence_refs'][0]
        self.assertIn(date_ref, event['refs'])
        self.assertIn('Statement support', event['reference_roles'][date_ref])
        contrary_ref = self.ledger['entries'][-1]['evidence_refs'][0]
        self.ledger['entries'][0]['contrary_evidence_refs'] = [contrary_ref]
        event = self.build()['events'][0]
        self.assertIn('Contrary evidence', event['reference_roles'][contrary_ref])

    def test_unsupported_event_date_fails_instead_of_using_publication(self):
        self.selection['events'][0]['anchor_kind'] = 'event'
        with self.assertRaisesRegex(LedgerError, 'no supported event date'):
            self.build()

    def test_same_month_must_be_grouped_not_given_invented_days(self):
        extra = copy.deepcopy(self.selection['events'][0]); extra['id'] = 'duplicate'
        self.selection['events'].append(extra)
        with self.assertRaisesRegex(LedgerError, 'sharing a month'):
            self.build()

    def test_dimension_blending_rejected(self):
        self.selection['assessments'][0]['entry_ids'].append('dividends-fy2024')
        with self.assertRaisesRegex(LedgerError, 'blend'):
            self.build()

    def test_missing_or_rejected_entry_rejected(self):
        self.selection['events'][0]['entry_ids'].append('not-a-record')
        with self.assertRaisesRegex(LedgerError, 'Unknown ledger entry'):
            self.build()
        self.selection['events'][0]['entry_ids'].pop()
        self.ledger['entries'][0]['review_status'] = 'rejected'
        with self.assertRaisesRegex(LedgerError, 'Rejected'):
            self.build()

    def test_tampered_quote_rejected(self):
        self.ledger['evidence'][self.ledger['entries'][0]['evidence_refs'][0]]['claim']['excerpt'] = 'Not in source'
        with self.assertRaisesRegex(LedgerError, 'quote no longer matches'):
            self.build()

    def test_unavailable_evidence_rejected_at_cutoff(self):
        self.ledger['entries'][0]['assessment'] = 'not_available_as_of'
        with self.assertRaisesRegex(LedgerError, 'unavailable'):
            self.build()
        self.ledger['entries'][0]['assessment'] = 'outcome_not_found'
        next(iter(self.ledger['documents'].values()))['publication_date'] = '2026-12-01'
        with self.assertRaisesRegex(LedgerError, 'Document unavailable'):
            self.build()

    def test_reviewed_entries_do_not_approve_new_presentation_prose(self):
        for e in self.ledger['entries']:
            e['review_status'] = 'reviewed'
        self.assertEqual(self.build()['events'][0]['review_status'], 'proposed')

    def test_partial_extraction_is_not_complete_coverage(self):
        doc = next(iter(self.ledger['documents'].values()))
        doc['extracted_chunks'] = 0
        self.assertEqual(self.build()['coverage'][3]['status'], 'partial')

    def test_supplement_does_not_count_one_pdf_as_two_reports(self):
        key, doc = next(iter(self.ledger['documents'].items()))
        self.ledger['documents'][key + '-supplement'] = copy.deepcopy(doc)
        view = self.build()
        self.assertEqual(view['source_documents'], 1)
        self.assertEqual(view['coverage'][3]['documents'], 1)

    def test_offline_source_review_keeps_its_origin_and_separate_count(self):
        ref = self.ledger['entries'][0]['evidence_refs'][0]
        self.ledger['evidence'][ref]['claim']['origin'] = 'separate_offline_source_review'
        view = self.build()
        self.assertEqual(view['supplemental_excerpts'], 1)
        self.assertEqual(view['collector_extracted_claims'], 83)
        self.assertEqual(view['evidence'][ref]['origin'], 'separate_offline_source_review')

    def test_current_year_cannot_silently_enter_completed_year_window(self):
        self.selection['fiscal_years'] = [2022, 2026]
        with self.assertRaisesRegex(LedgerError, 'Current fiscal year'):
            self.build()


if __name__ == '__main__':
    unittest.main()
