"""Select an engine without exporting .env secrets into subprocess environments."""
import os
from pathlib import Path
import re
import shlex


def read_environment(env_file=None):
    """Read single-line KEY=value assignments; the process environment wins.

    Quotes, comments and optional `export` are supported. No expansion or shell
    execution takes place. An explicit missing file is an error.
    """
    path = Path(env_file) if env_file is not None else Path('.env')
    values = {}
    if path.exists() or env_file is not None:
        try:
            lines = path.read_text(encoding='utf-8-sig').splitlines()
        except OSError:
            raise ValueError('Cannot read the environment file') from None
        for number, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            line = line.removeprefix('export ')
            key, separator, raw = line.partition('=')
            if not separator or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key.strip()):
                raise ValueError(f'Invalid environment assignment on line {number}')
            try:
                parts = shlex.split(raw, comments=True, posix=True)
            except ValueError:
                raise ValueError(f'Invalid environment value on line {number}') from None
            if len(parts) > 1:
                raise ValueError(f'Quote environment values containing spaces on line {number}')
            values[key.strip()] = parts[0] if parts else ''
    return dict(values, **os.environ)


def add_engine_arguments(parser):
    parser.add_argument('--engine', choices=('codex', 'nebius'),
                        help='Model engine (default: CREDIBILITY_ENGINE or codex)')
    parser.add_argument('--env-file', type=Path,
                        help='Environment file (default: .env in the current directory)')


def create_engine(name=None, env_file=None):
    # Explicit Codex runs do not need to read an API credential file.
    values = {} if name == 'codex' else read_environment(env_file)
    selected = name or values.get('CREDIBILITY_ENGINE') or 'codex'
    if selected == 'codex':
        from .runtime import CodexRuntime
        return CodexRuntime()
    if selected == 'nebius':
        from .nebius_runtime import NebiusRuntime
        options = {}
        for variable, option in (
            ('NEBIUS_TIMEOUT_SECONDS', 'timeout_s'),
            ('NEBIUS_MAX_TOKENS', 'max_tokens'),
            ('NEBIUS_MAX_SEARCH_CALLS', 'max_search_calls'),
        ):
            if values.get(variable):
                try:
                    options[option] = int(values[variable])
                except ValueError:
                    raise ValueError(f'{variable} must be an integer') from None
        return NebiusRuntime(
            api_key=values.get('NEBIUS_API_KEY', ''),
            tavily_api_key=values.get('TAVILY_API_KEY', ''),
            model=values.get('NEBIUS_MODEL', ''),
            base_url=values.get('NEBIUS_BASE_URL') or 'https://api.tokenfactory.nebius.com/v1',
            **options,
        )
    raise ValueError('CREDIBILITY_ENGINE must be codex or nebius')
