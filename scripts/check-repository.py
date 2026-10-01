"""Check active documentation links and the tracked repository's hygiene."""
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
GUIDES = {"README.md", "architecture.md", "development.md", "deployment.md", "repository-layout.md"}
DOC_DIRS = {"plans", "archive", "assets"}


def main():
    errors = []
    for path in (ROOT / "docs").iterdir():
        if path.is_dir() and path.name in DOC_DIRS:
            continue
        if path.is_file() and path.name in GUIDES:
            continue
        errors.append(f"Move docs/{path.name} into its owning guide, plans/, archive/, or assets/.")

    active = [ROOT / "README.md", ROOT / "AGENTS.md", ROOT / "src/web/README.md"]
    active += [ROOT / "docs" / name for name in GUIDES]
    for path in active:
        if not path.is_file():
            errors.append(f"Missing guide: {path.relative_to(ROOT)}")
            continue
        for href in re.findall(r"\[[^\]]*\]\(([^\s)]+)\)", path.read_text()):
            parsed = urlsplit(href.strip("<>"))
            if parsed.scheme or not parsed.path:
                continue
            target = (path.parent / unquote(parsed.path)).resolve()
            if not target.is_relative_to(ROOT) or not target.exists():
                errors.append(f"Broken local link in {path.relative_to(ROOT)}: {href}")

    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    generated = {"node_modules", ".wrangler", ".next", ".vinext", "__pycache__", "dist", "build"}
    for filename in filter(None, tracked):
        path = Path(filename)
        name = path.name
        secret = (name.startswith(".env") or name.startswith(".dev.vars")) and not name.endswith(".example")
        private_run = path.parts[0] == "data" and filename != "data/README.md"
        if secret or private_run or generated.intersection(path.parts) or path.parts[0] == "artifacts":
            errors.append(f"Do not track credentials, private runs, or generated output: {filename}")

    if errors:
        raise SystemExit("\n".join(errors))
    print("Repository hygiene and active documentation links passed.")


if __name__ == "__main__":
    main()
