"""Compatibility entry point for the current custom-profile sandbox check."""
import json
from pathlib import Path
import tempfile
from .engine import AgentDirectories
from .permissions import verify

def check():
    with tempfile.TemporaryDirectory(prefix='credibility-permission-check-') as temp:
        root=Path(temp)
        return verify(AgentDirectories(root/'inputs',root/'work',root/'outputs'))

if __name__=='__main__':
    result=check(); print(json.dumps(result,indent=2)); raise SystemExit(0 if result['verified'] else 2)
