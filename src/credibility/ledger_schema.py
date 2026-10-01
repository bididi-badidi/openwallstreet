"""Version-one, deliberately explicit analyst curation contract.

Decimal amounts are strings. Unknown values are null, never empty strings or zero.
This schema is separate from the immutable collector schema.
"""
from .schema import N, S, arr, obj


def enum(*values):
    return {'type': 'string', 'enum': list(values)}


def nullable(schema):
    return dict(schema, type=[schema['type'], 'null'])


REFS = arr(S)
REVIEW = obj(dict(status=enum('proposed', 'reviewed', 'rejected'), reviewer=S,
                  reviewer_type=enum('human', 'automated'), at=S, rationale=S))
DATE = obj(dict(value=S, precision=enum('day', 'month', 'year'),
                basis=S, evidence_refs=REFS))
PERIOD = obj(dict(start=S, end=S, label=S, basis=S, evidence_refs=REFS))
DATES = obj(dict(statement=nullable(DATE), event=nullable(DATE), completion=nullable(DATE),
                 first_disclosure=nullable(DATE), target_deadline=nullable(DATE),
                 measurement_period=nullable(PERIOD)))
METRIC = obj(dict(id=S, definition=S, unit=N, accounting_basis=N, scope=N,
                  measurement_basis=N))
VALUE = obj(dict(operator=enum('eq', 'gte', 'lte', 'range', 'approximate'),
                 amount=S, upper=N, tolerance=N))
PERSON = obj(dict(name=S, role=S, tenure_start=nullable(DATE), tenure_end=nullable(DATE),
                  relationship=enum('statement', 'decision', 'documented_contribution', 'tenure_context'),
                  evidence_refs=REFS, rationale=S))
ACTORS = obj(dict(outcome_entity=S, statement_by=N,
                  decision_by=enum('company', 'management', 'board', 'unknown', 'not_applicable'),
                  individuals=arr(PERSON)))
DIMENSIONS = ('delivery_credibility', 'disclosure_accountability',
              'operating_efficiency', 'capital_stewardship')
ENTRY = obj(dict(
    id=S, economic_id=S, kind=enum('promise', 'conditional_intention', 'authorization',
                                  'obligation', 'forecast', 'outcome', 'decision', 'challenge', 'context'),
    change=enum('original', 'revision', 'reaffirmation', 'withdrawal', 'progress'), supersedes=N,
    summary=S, dimension=enum(*DIMENSIONS), evidence_refs=REFS, grouping_rationale=S,
    metric_id=N, value=nullable(VALUE), dates=DATES, actors=ACTORS,
    conditions=arr(S), contrary_evidence_refs=REFS, limitations=arr(S), review_history=arr(REVIEW)))
MATCH = obj(dict(id=S, promise_id=S, outcome_id=S, rationale=S,
                 contrary_evidence_refs=REFS, limitations=arr(S), review_history=arr(REVIEW)))
CURATION = obj(dict(
    schema_version={'type': 'integer'}, company=S,
    sources=arr(obj(dict(id=S, path=S, sha256=S))), metrics=arr(METRIC),
    entries=arr(ENTRY), matches=arr(MATCH), limitations=arr(S)))
