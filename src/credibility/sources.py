"""Bounded primary-source retrieval with redirects checked at each hop."""
import hashlib
import ipaddress
import socket
import subprocess
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

class TextParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('p', 'div', 'br', 'h1', 'h2', 'h3', 'tr'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.hidden = max(0, self.hidden - 1)
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)

def check_url(url, hosts):
    p = urlparse(url)
    if p.scheme != 'https' or p.username or p.password or p.port not in (None, 443) or p.hostname not in hosts:
        raise ValueError('Source must use HTTPS on an explicitly approved primary-source host')
    addresses = socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Source resolves to a non-public address')

class Redirects(HTTPRedirectHandler):
    def __init__(self, hosts): self.hosts = hosts
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl, self.hosts)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def retrieve(url, hosts, user_agent):
    check_url(url, hosts)
    with build_opener(Redirects(hosts)).open(Request(url, headers={'User-Agent': user_agent}), timeout=45) as response:
        raw = response.read(25_000_001)
        final_url = response.url
    if len(raw) > 25_000_000: raise ValueError('Source exceeds 25 MB limit')
    if urlparse(url).path.lower().endswith('.pdf') and not raw.startswith(b'%PDF'):
        raise ValueError('Expected PDF but source returned another content type')
    if raw.startswith(b'%PDF'):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source.pdf'; source.write_bytes(raw)
            try:
                result = subprocess.run(['pdftotext', str(source), '-'], capture_output=True, timeout=60, check=True)
            except FileNotFoundError:
                raise ValueError('PDF extraction requires pdftotext') from None
            pages = result.stdout.decode('utf-8').split('\f')
    else:
        parser = TextParser(); parser.feed(raw.decode('utf-8', errors='replace'))
        pages = [''.join(parser.parts)]
    if not any(p.strip() for p in pages): raise ValueError('No extractable text; scanned document may require OCR')
    return {'url': final_url, 'sha256': hashlib.sha256(raw).hexdigest(), 'pages': pages}, raw
