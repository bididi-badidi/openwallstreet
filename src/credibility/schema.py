"""Strict structured outputs shared by workers and persisted evidence."""

def obj(properties):
    return {'type': 'object', 'properties': properties, 'required': list(properties), 'additionalProperties': False}

S = {'type': 'string'}
N = {'type': ['string', 'null']}
def arr(item):
    return {'type': 'array', 'items': item}

DOCUMENT = obj(dict(title=S, url=S, company=S, report_type={'enum': ['annual', 'quarterly'], 'type': 'string'},
                    period_end=S, fiscal_year={'type': 'integer'}, publication_date=N, identity=S))
DISCOVERY = obj(dict(documents=arr(DOCUMENT), gaps=arr(S)))
CLAIM = obj(dict(category={'type': 'string', 'enum': ['measurable_promise', 'forecast', 'aspiration', 'reported_fact', 'challenge']},
                 summary=S, excerpt=S, page={'type': 'integer'}, section=S,
                 target_date=N, numeric_target=N, unit=N, attribution=N,
                 uncertainties=arr(S), is_highlight={'type': 'boolean'}))
EXTRACTION = obj(dict(mda_sections=arr(S), claims=arr(CLAIM), gaps=arr(S)))

def validate(value, schema, path='result'):
    types = schema.get('type')
    types = types if isinstance(types, list) else [types]
    matches = {'object': isinstance(value, dict), 'array': isinstance(value, list),
               'string': isinstance(value, str), 'null': value is None,
               'integer': type(value) is int, 'boolean': type(value) is bool}
    if not any(matches.get(t, False) for t in types):
        raise ValueError(f'{path}: invalid type')
    if 'enum' in schema and value not in schema['enum']:
        raise ValueError(f'{path}: invalid enum')
    if isinstance(value, dict):
        if set(value) != set(schema['properties']):
            raise ValueError(f'{path}: missing or unknown fields')
        for key, item in value.items():
            validate(item, schema['properties'][key], f'{path}.{key}')
    if isinstance(value, list):
        for item in value:
            validate(item, schema['items'], f'{path}[]')
