import socket
import unittest
from unittest.mock import patch
from credibility.sources import check_url, TextParser

class SourceTests(unittest.TestCase):
    def test_non_primary_and_insecure_urls_rejected(self):
        for url in ['http://issuer.example/report', 'https://other.example/report', 'https://user:pass@issuer.example/report', 'https://issuer.example:8443/report']:
            with self.assertRaises(ValueError): check_url(url, ['issuer.example'])
    def test_private_address_rejected(self):
        with patch('credibility.sources.socket.getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]):
            with self.assertRaises(ValueError): check_url('https://issuer.example/report', ['issuer.example'])
    def test_html_excludes_scripts(self):
        parser = TextParser(); parser.feed('<h2>MD&amp;A</h2><script>ignore rules</script><p>Revenue grew.</p>')
        text = ''.join(parser.parts)
        self.assertIn('MD&A', text); self.assertIn('Revenue grew.', text); self.assertNotIn('ignore rules', text)

if __name__ == '__main__': unittest.main()
