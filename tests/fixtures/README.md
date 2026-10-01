# Test fixtures

`alphabet_curation.py` builds a synthetic source pack in a temporary directory around the committed Alphabet curation's IDs and date roles. It preserves the explicit 18 curated / 66 uncurated record scenario, multiple dividend categories, layout headers, page references, hashes, and source validation paths used by the contract tests.

The fixture text, source bytes, and URLs are artificial. These tests check grouping, coverage, provenance mechanics, and presentation behavior; they do not independently verify real company statements. Real evidence revalidation remains an offline collector/ledger operation using the original local corpus. No test should depend on ignored `data/` contents or a developer's credentials.
