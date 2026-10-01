import unittest
from credibility.citations import source_span,verify_claim

class CitationTests(unittest.TestCase):
    def test_only_whitespace_alignment_is_permitted(self):
        self.assertEqual(source_span('We plan 12 stores.', 'We  plan\n12 stores.'),'We  plan\n12 stores.')
        self.assertIsNone(source_span('We plan 13 stores.','We plan 12 stores.'))
        self.assertIsNone(source_span('We plan 12 stores!','We plan 12 stores.'))
    def test_exact_source_and_model_quote_both_preserved(self):
        result=verify_claim({'excerpt':'We plan 12 stores.','page':1},['We plan\n12 stores.'])
        self.assertEqual(result['excerpt'],'We plan\n12 stores.')
        self.assertEqual(result['model_excerpt'],'We plan 12 stores.')
        self.assertIsNone(verify_claim({'excerpt':'fake','page':3},['real']))

if __name__=='__main__':unittest.main()
