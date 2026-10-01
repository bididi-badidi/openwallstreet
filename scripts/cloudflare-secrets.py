"""Provision only the secrets each Worker needs, through Wrangler stdin."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from credibility.engine_factory import read_environment

parser = argparse.ArgumentParser()
parser.add_argument('--prepare-only', action='store_true')
args = parser.parse_args()
values = read_environment(ROOT / '.env')
local = ROOT / '.env.cloudflare'
if local.exists():
    values.update(read_environment(local))
for name in ('NEBIUS_API_KEY', 'TAVILY_API_KEY'):
    if not values.get(name):
        raise SystemExit(f'Missing {name} in .env')
for name in ('NEBIUS_JOB_SERVICE_TOKEN', 'RESEARCH_ACCESS_CODE'):
    values.setdefault(name, secrets.token_urlsafe(32))
    if not values[name]: values[name] = secrets.token_urlsafe(32)
fd = os.open(local, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as handle:
    handle.write(''.join(f'{name}={values[name]}\n' for name in ('NEBIUS_JOB_SERVICE_TOKEN', 'RESEARCH_ACCESS_CODE')))
os.chmod(local, 0o600)
print('Private access code and service token are saved in .env.cloudflare (not printed).')
if not args.prepare_only:
    for config, names in (
        ('research/wrangler.jsonc', ('NEBIUS_API_KEY', 'TAVILY_API_KEY', 'NEBIUS_JOB_SERVICE_TOKEN')),
        ('wrangler.jsonc', ('NEBIUS_JOB_SERVICE_TOKEN', 'RESEARCH_ACCESS_CODE')),
    ):
        subprocess.run(['node', 'node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk', '--config', config],
            cwd=ROOT / 'src/web', input=json.dumps({name: values[name] for name in names}), text=True, check=True)
