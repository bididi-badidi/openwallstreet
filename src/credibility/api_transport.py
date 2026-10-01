"""Small bounded JSON transport. Never surface provider bodies or auth headers."""
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class ApiRuntimeError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


def https_url(value):
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme == 'https' and parsed.hostname and not parsed.username
                 and not parsed.password and not parsed.query and not parsed.fragment
                 and parsed.port in (None, 443))
    except ValueError:
        valid = False
    if not valid:
        raise ValueError('API base URL must be HTTPS without credentials, query or fragment')
    return value.rstrip('/')


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class JsonTransport:
    def request(self, url, api_key, payload, *, deadline, provider):
        https_url(url)
        request = Request(url, data=None if payload is None else json.dumps(payload).encode(),
                          headers={'Authorization': 'Bearer ' + api_key,
                                   'Content-Type': 'application/json', 'Accept': 'application/json'})
        for attempt in range(3):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ApiRuntimeError('timeout', f'{provider} request deadline exceeded')
            try:
                with build_opener(NoRedirects()).open(request, timeout=remaining) as response:
                    raw = response.read(4_000_001)
                if len(raw) > 4_000_000:
                    raise ApiRuntimeError('response_too_large', f'{provider} response exceeded size limit')
                value = json.loads(raw)
                if not isinstance(value, dict):
                    raise ValueError()
                return value
            except HTTPError as exc:
                status = exc.code
                retry_after = exc.headers.get('Retry-After', '') if exc.headers else ''
                exc.close()
                if status in (429, 500, 502, 503, 504) and attempt < 2:
                    delay = min(float(retry_after), 10) if retry_after.isdigit() else 2 ** attempt
                    if time.monotonic() + delay >= deadline:
                        raise ApiRuntimeError('timeout', f'{provider} request deadline exceeded') from None
                    time.sleep(delay)
                    continue
                code = 'authentication_failed' if status in (401, 403) else 'rate_limited' if status == 429 else 'http_error'
                raise ApiRuntimeError(code, f'{provider} request failed (HTTP {status})') from None
            except (TimeoutError, URLError, OSError):
                raise ApiRuntimeError('network_error', f'{provider} request failed or timed out') from None
            except (ValueError, UnicodeError):
                raise ApiRuntimeError('invalid_response', f'{provider} returned invalid JSON') from None
        raise AssertionError('Unreachable retry state')
