"""Build a portable local fragment; never write to an unrelated conversation."""
import argparse
from pathlib import Path

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=here / 'build/fragment.html')
args = parser.parse_args()
fragment = (here / 'fragment.template.html').read_text()
fragment = fragment.replace('/*__BUNDLED_STYLES__*/', (here / 'build/app.css').read_text())
fragment = fragment.replace('/*__BUNDLED_APP__*/', (here / 'build/app.js').read_text().replace('</script', '<\\/script'))
args.output.write_text(fragment)
print(f'Wrote {args.output} ({len(fragment.encode()):,} bytes)')
