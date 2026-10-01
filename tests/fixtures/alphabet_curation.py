"""Exercise the committed curation contract without the private local corpus.

All quotation text, raw source bytes, URLs, and hashes here are synthetic. The
existing curation's IDs/date roles are retained so grouping and presentation
regressions remain covered. This fixture does not reverify real Alphabet claims.
"""
import hashlib
import json
from pathlib import Path
import tempfile

from credibility.ledger import build_ledger

ROOT = Path(__file__).resolve().parents[2]


def build_alphabet_fixture():
    curation = json.loads((ROOT / "src/credibility/examples/alphabet-ledger-v1.json").read_text())
    refs = set()

    def collect(value):
        if isinstance(value, dict):
            for item in value.values():
                collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif isinstance(value, str) and value.startswith("alphabet2024:"):
            refs.add(value)

    collect(curation["entries"])
    curated = {ref for entry in curation["entries"] for ref in entry["evidence_refs"]}
    assert len(curated) == 18, "Update the explicit fixture coverage when curation changes"
    assert len(refs) <= 84
    dividend = next(e for e in curation["entries"] if e["id"] == "future-dividend-intention")
    categories = dict(zip(dividend["evidence_refs"], ["measurable_promise", "measurable_promise", "aspiration"]))
    identifiers = [ref.split(":", 1)[1] for ref in sorted(refs)]
    identifiers += [f"synthetic-uncurated-{i}" for i in range(84 - len(refs))]
    claims = []
    for identifier in identifiers:
        text = f"SYNTHETIC TEST STATEMENT {identifier}. This is not company evidence."
        claims.append(dict(id=identifier, document_id="fixture-report", page=4,
                           quote_snapshot="fixture-report.supplied-layout.json",
                           excerpt=text, summary=text,
                           category=categories.get("alphabet2024:" + identifier, "reported_fact"),
                           source_url="https://example.invalid/synthetic-annual-report.pdf",
                           section="Synthetic fixture", target_date=None, numeric_target=None,
                           unit=None, attribution=None, uncertainties=[], is_highlight=False))
    pages = ["Synthetic page 1", "Synthetic page 2", "Synthetic page 3",
             "SYNTHETIC TABLE: 2023 2024 (in millions)\n" + "\n".join(c["excerpt"] for c in claims)]
    raw = "\n".join(pages).encode()
    digest = hashlib.sha256(raw).hexdigest()
    pack = dict(schema_version=1, company=curation["company"], status="complete", jobs=[],
                documents=[dict(id="fixture-report", title="Synthetic curation contract fixture",
                                sha256=digest, snapshot="fixture-report.supplied-layout.json",
                                url="https://example.invalid/synthetic-annual-report.pdf",
                                report_type="annual", fiscal_year=2024, period_end="2024-12-31",
                                publication_date="2025-04-01", extracted_chunks=1, total_chunks=1)],
                claims=claims)
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        (root / "fixture-report.source").write_bytes(raw)
        (root / "fixture-report.supplied-layout.json").write_text(json.dumps(dict(
            sha256=digest, pages=pages, extraction_method="Synthetic test text; no downloaded source")))
        evidence = json.dumps(pack).encode()
        (root / "evidence.json").write_bytes(evidence)
        curation["sources"] = [dict(id="alphabet2024", path="evidence.json",
                                    sha256=hashlib.sha256(evidence).hexdigest())]
        (root / "curation.json").write_text(json.dumps(curation))
        return build_ledger(root / "curation.json", "2026-09-30")
