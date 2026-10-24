"""Repeatable local route, asset, anchor and HTML checks (standard library only)."""
import json
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path, self.ids, self.refs, self.images, self.buttons, self.forms = path, [], [], [], 0, 0
        self.feed(path.read_text(encoding="utf-8-sig"))
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs: self.ids.append(attrs["id"])
        for key in ("href", "src"):
            if key in attrs: self.refs.append((tag, key, attrs[key]))
        if tag == "img": self.images.append(attrs)
        if tag == "button": self.buttons += 1
        if tag == "form": self.forms += 1

pages = {p.relative_to(ROOT).as_posix(): Page(p) for p in sorted(ROOT.rglob("*.html")) if ".git" not in p.parts}
report = {"pages": list(pages), "pageCount": len(pages), "links": 0, "images": 0, "buttons": 0, "forms": 0, "issues": [], "http": []}
for name, page in pages.items():
    report["links"] += sum(tag == "a" for tag, _, _ in page.refs)
    report["images"] += len(page.images)
    report["buttons"] += page.buttons
    report["forms"] += page.forms
    for item, count in Counter(page.ids).items():
        if count > 1: report["issues"].append([name, "duplicate-id", item])
    for image in page.images:
        if "alt" not in image: report["issues"].append([name, "missing-alt", image.get("src")])
    for tag, key, ref in page.refs:
        parsed = urlparse(urljoin("http://local/" + name, ref))
        if parsed.netloc != "local" or parsed.scheme not in ("http", "https"): continue
        target = unquote(parsed.path).lstrip("/") or "index.html"
        if not (ROOT / target).is_file(): report["issues"].append([name, "missing-file", ref])
        elif parsed.fragment and target in pages and unquote(parsed.fragment) not in pages[target].ids:
            report["issues"].append([name, "missing-anchor", ref])
    try:
        with urlopen("http://127.0.0.1:8000/" + name) as response:
            report["http"].append({"page": name, "status": response.status})
    except Exception as exc: report["http"].append({"page": name, "error": str(exc)})
output = ROOT / "qa" / "static-results.json"
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({key: value for key, value in report.items() if key not in ("pages", "http")}, indent=2))
print(f"HTTP routes checked: {len(report['http'])}; results: {output}")
