#!/usr/bin/env python3
"""
Render the retained performance measurements with Python's standard library
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
from statistics import median
from xml.etree import ElementTree
from html import escape


ROOT = Path(__file__).resolve().parent
STYLE = "\n".join((
    "svg{--lg-paper:#fbfaf7;--lg-ink:#21313a;--lg-muted:#52616a;--lg-old:#687b87;--lg-new:#087d6a;--lg-rule:#dce1df;color-scheme:light dark}",
    "@media(prefers-color-scheme:dark){svg{--lg-paper:#142027;--lg-ink:#edf1ec;--lg-muted:#b5c1c5;--lg-old:#a2b2bd;--lg-new:#72d6be;--lg-rule:#35464e}}",
    "text{font-family:Arial,Helvetica,sans-serif;font-size:22px;fill:var(--lg-ink);font-variant-numeric:tabular-nums}",
    ".paper{fill:var(--lg-paper)}.muted{fill:var(--lg-muted)}.old{fill:var(--lg-old)}.new{fill:var(--lg-new)}",
    ".old-line{stroke:var(--lg-old);fill:none}.new-line{stroke:var(--lg-new);fill:none}.rule{stroke:var(--lg-rule);fill:none}",
    ".title{font-size:32px;font-weight:700}.label{font-size:24px;font-weight:700}.value{font-size:26px;font-weight:700}",
))


def pointer(value, path):
    for part in path.lstrip("/").split("/") if path else []:
        key = part.replace("~1", "/").replace("~0", "~")
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value


def resolve(data, reference):
    excerpts = data["sources"][reference["source"]]["excerpts"]
    path = reference["pointer"]
    for root in sorted(excerpts, key=len, reverse=True):
        if path == root or path.startswith(root + "/"):
            return pointer(excerpts[root], path[len(root):])
    raise ValueError(f"No retained excerpt for {reference}")


def text(x, y, value, css="", anchor="start", size=None):
    extra = f' style="font-size:{size}px"' if size else ""
    return f'<text x="{x}" y="{y}" class="{css}" text-anchor="{anchor}"{extra}>{escape(str(value))}</text>'


def line(x1, y1, x2, y2, css="rule", width=1):
    return f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" class="{css}" stroke-width="{width}"/>'


def marker(x, y, css):
    if css == "old":
        return f'<circle cx="{x:g}" cy="{y:g}" r="6" class="old"/>'
    return f'<rect x="{x - 6:g}" y="{y - 6:g}" width="12" height="12" class="new"/>'


def svg(title, description, height, body, evidence_hash):
    result = f'''<svg xmlns="http://www.w3.org/2000/svg" width="760" height="{height}" viewBox="0 0 760 {height}" role="img" aria-labelledby="title description">
<title id="title">{escape(title)}</title>
<desc id="description">{escape(description)}</desc>
<metadata>Source: evidence.json; SHA-256: {evidence_hash}</metadata>
<style>{STYLE}</style>
<rect width="760" height="{height}" class="paper"/>
{''.join(body)}
</svg>
'''
    ElementTree.fromstring(result)
    return result


def operation_chart(data, evidence_hash):
    title = "Measured operation counts"
    body = [text(32, 48, title, "title"),
            text(32, 82, "Original = 100% in each row · absolute counts at right", "muted")]
    for x, css, label in ((32, "old", "Original"), (242, "new", "Individual change")):
        body += [f'<rect x="{x}" y="112" width="28" height="12" class="{css}"/>', text(x + 42, 126, label)]
    description = ["Each change was measured separately against upstream 068ad22. Bars show operation counts, not CPU savings. Each row has its own unit and original = 100% scale."]
    for i, row in enumerate(data["operations"]):
        original, candidate = (resolve(data, row[key]) for key in ("original", "candidate"))
        if not 0 <= candidate <= original or original == 0:
            raise ValueError("Operation chart requires nonnegative counts up to the original")
        top = 176 + 118 * i
        body += [text(32, top, row["label"], "label"), text(32, top + 28, row["detail"], "muted", size=21)]
        for x in (32, 314, 596):
            body.append(line(x, top + 43, x, top + 92))
        for j, (value, css) in enumerate(((original, "old"), (candidate, "new"))):
            y = top + 48 + 25 * j
            width = 564 * value / original
            if value:
                body.append(f'<rect x="32" y="{y}" width="{width:.3f}" height="12" class="{css}"/>')
            else:
                body.append(f'<circle cx="32" cy="{y + 6}" r="5" class="paper new-line" stroke-width="2"/>')
            body.append(text(728, y + 13, f"{value:,}", f"value {css}", "end"))
        description.append(f'{row["label"]}: {original:,} original to {candidate:,} candidate {row["unit"]}. {row["detail"]}.')
    body.append(line(32, 648, 596, 648))
    for x, value in ((32, "0%"), (314, "50%"), (596, "100%")):
        body += [line(x, 648, x, 654), text(x, 680, value, "muted", "middle" if x == 314 else "start" if x == 32 else "end")]
    body.append(text(32, 718, "Independent changes vs 068ad22 · counts do not measure CPU", "muted", size=21))
    return svg(title, " ".join(description), 744, body, evidence_hash)


def cpu_measurements(data):
    rows = []
    for entry in data["cpu"]:
        row = dict(entry)
        summary, ranges = (resolve(data, entry[key]) for key in ("summary", "range"))
        for variant in ("original", "candidate"):
            values = [resolve(data, reference) for reference in entry[variant]]
            if len(values) != 3 or not all(math.isfinite(v) and 0 <= v <= 5000 for v in values):
                raise ValueError("CPU chart requires three finite samples in the 0–5,000 ms axis")
            value = median(values)
            limits = [min(values), max(values)]
            if not math.isclose(value, summary[f"{variant}MedianCPUms"]):
                raise ValueError("Retained CPU samples disagree with the published median")
            if any(not math.isclose(a, b) for a, b in zip(limits, ranges[f"{variant}RangeMs"])):
                raise ValueError("Retained CPU samples disagree with the published range")
            row[variant] = {"median": value, "range": limits}
        row["overhead"] = (row["candidate"]["median"] / row["original"]["median"] - 1) * 100
        rows.append(row)
    return rows


def cpu_chart(data, evidence_hash):
    rows = cpu_measurements(data)
    title = "Map-cache CPU time vs 068ad22"
    body = [text(32, 48, title, "title"),
            text(32, 82, "Accelerated replay · 3 fresh-browser trials per variant", "muted")]
    for x, css, label in ((40, "old", "Original"), (250, "new", "Map reuse")):
        body += [marker(x, 118, css), text(x + 20, 126, label)]
    description = ["Accumulated browser-process and descendant CPU time in milliseconds, not CPU utilization or real-time frame cost. Each engine uses the same 0 to 5,000 ms axis. Values are medians, whiskers span the minimum and maximum of three fresh-browser trials. Original is a circle; map reuse is a square. These are independent map-cache measurements, not a benchmark of all four changes together."]
    body += [text(48, 170, "Chrome / Blink", "label"), text(416, 170, "Firefox / Gecko", "label")]
    workloads = (("button", "Button · 12 cycles"), ("segmented", "Segmented control · 12 cycles"), ("mostly-unique", "Mostly unique · 1,200 map updates"))
    for i, (workload, label) in enumerate(workloads):
        y = 210 + 128 * i
        body.append(text(32, y, label, "label"))
        for engine, start in (("Blink", 48), ("Gecko", 416)):
            row = next(r for r in rows if r["engine"] == engine and r["workload"] == workload)
            original, candidate = (row[key]["median"] for key in ("original", "candidate"))
            body.append(f'<text x="{start}" y="{y + 36}" class="value"><tspan class="old">{original:,.0f}</tspan><tspan class="muted"> → </tspan><tspan class="new">{candidate:,.0f}</tspan><tspan class="muted" style="font-size:22px"> ms</tspan></text>')
            for value in (0, 2500, 5000):
                x = start + 300 * value / 5000
                body.append(line(x, y + 46, x, y + 83))
            for j, (variant, css) in enumerate((("original", "old"), ("candidate", "new"))):
                center = y + 55 + 19 * j
                lo, hi = (start + 300 * v / 5000 for v in row[variant]["range"])
                middle = start + 300 * row[variant]["median"] / 5000
                body += [line(lo, center, hi, center, css + "-line", 3),
                         line(lo, center - 5, lo, center + 5, css + "-line", 2),
                         line(hi, center - 5, hi, center + 5, css + "-line", 2), marker(middle, center, css)]
            description.append(f'{row["browser"]}, {workload}: original median {original:,.0f}, range {row["original"]["range"][0]:,.0f}–{row["original"]["range"][1]:,.0f}; map reuse median {candidate:,.0f}, range {row["candidate"]["range"][0]:,.0f}–{row["candidate"]["range"][1]:,.0f} ms.')
    for start in (48, 416):
        body.append(line(start, 570, start + 300, 570))
        for value, anchor in ((0, "start"), (2500, "middle"), (5000, "end")):
            x = start + 300 * value / 5000
            body += [line(x, 570, x, 576), text(x, 602, f"{value:,}", "muted", anchor)]
    overhead = {r["engine"]: r["overhead"] for r in rows if r["workload"] == "mostly-unique"}
    note = f'Mostly-unique CPU overhead: +{overhead["Blink"]:.1f}% Chrome · +{overhead["Gecko"]:.1f}% Gecko'
    body += [text(32, 646, note, size=21),
             text(32, 682, "Dots / squares: medians · whiskers: three-trial min–max", "muted", size=21),
             text(32, 714, "Noisy ranges; no combined benchmark or significance claim", "muted", size=21)]
    description.append(note + ". Ranges are noisy; no statistical significance is claimed.")
    return svg(title, " ".join(description), 740, body, evidence_hash)


def verify_source(data, argument):
    source_id, path = argument.split("=", 1)
    source = data["sources"][source_id]
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError(f"Source hash mismatch: {source_id}")
    original = json.loads(raw)
    for path, value in source["excerpts"].items():
        if pointer(original, path) != value:
            raise ValueError(f"Source excerpt mismatch: {source_id} {path}")
    print(f"Verified source: {source_id}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check SVGs without changing files")
    parser.add_argument("--verify-source", action="append", default=[], metavar="ID=PATH", help="verify a complete original JSON artifact against its retained hash and excerpts")
    args = parser.parse_args()
    raw = (ROOT / "evidence.json").read_bytes()
    data = json.loads(raw)
    for source in args.verify_source:
        verify_source(data, source)
    digest = hashlib.sha256(raw).hexdigest()
    for name, chart in (("operation-counts.svg", operation_chart), ("cpu-time.svg", cpu_chart)):
        rendered = chart(data, digest)
        path = ROOT / name
        if args.check:
            if not path.exists() or path.read_text() != rendered:
                raise SystemExit(f"Out of date: {name}; run generate.py")
            print(f"Verified SVG: {name}")
        else:
            path.write_text(rendered)
            print(f"Generated: {name}")


if __name__ == "__main__":
    main()
