#!/usr/bin/env python3
"""
Plot the retained performance measurements with Matplotlib
"""

import argparse
import hashlib
from io import StringIO
import json
import math
from pathlib import Path
import re
from statistics import median
from xml.etree import ElementTree
from html import escape

try:
    import matplotlib
except ModuleNotFoundError as error:
    raise SystemExit("Install docs/performance/requirements.txt in your plotting environment") from error

matplotlib.use("Agg")
from matplotlib import pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
from matplotlib.ticker import FuncFormatter


ROOT = Path(__file__).resolve().parent
COLORS = {
    "paper": ("#ffffff", "#111b27"),
    "ink": ("#243247", "#edf2f8"),
    "muted": ("#5d6e83", "#aabbd0"),
    "grid": ("#e0e6ee", "#304052"),
    "axis": ("#a6b3c3", "#70859d"),
    "original": ("#1171be", "#79bcf5"),
    "candidate": ("#dd5400", "#ffa56b"),
}
PAPER, INK, MUTED, GRID, AXIS, ORIGINAL, CANDIDATE = (values[0] for values in COLORS.values())
STYLE = {
    "font.family": ["DejaVu Sans", "Arial", "Helvetica", "sans-serif"],
    "font.size": 16,
    "axes.labelsize": 16,
    "axes.labelcolor": MUTED,
    "axes.edgecolor": AXIS,
    "axes.linewidth": 0.8,
    "axes.facecolor": PAPER,
    "figure.facecolor": PAPER,
    "text.color": INK,
    "xtick.color": MUTED,
    "ytick.color": INK,
    "xtick.labelsize": 15,
    "ytick.labelsize": 17,
    "svg.fonttype": "none",
    "svg.hashsalt": "liquidglass-performance",
}


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


def render_svg(figure, title, description, evidence_hash):
    output = StringIO()
    figure.savefig(output, format="svg", metadata={
        "Date": None,
        "Creator": f"Liquid Glass performance figures / Matplotlib {matplotlib.__version__}",
    })
    plt.close(figure)
    rendered = output.getvalue()
    # Let the exported SVG follow the reader's light or dark theme
    for name, (light, _) in COLORS.items():
        rendered = rendered.replace(light, f"var(--plot-{name})")
    light = ";".join(f"--plot-{key}:{value[0]}" for key, value in COLORS.items())
    dark = ";".join(f"--plot-{key}:{value[1]}" for key, value in COLORS.items())
    header = (
        f'<title id="chart-title">{escape(title)}</title>\n'
        f'<desc id="chart-description">{escape(description)} Source: evidence.json; SHA-256: {evidence_hash}</desc>\n'
        f'<style>:root{{{light};color-scheme:light dark}}'
        f'@media(prefers-color-scheme:dark){{:root{{{dark}}}}}</style>'
    )
    rendered = re.sub(r"<svg\b[^>]*>", lambda match:
        match[0][:-1] + ' role="img" aria-labelledby="chart-title chart-description">\n' + header,
        rendered, count=1)
    rendered = "\n".join(line.rstrip() for line in rendered.splitlines()) + "\n"
    ElementTree.fromstring(rendered)
    return rendered


def style_axis(axis, ticks):
    axis.set_axisbelow(True)
    axis.grid(axis="x", color=GRID, linewidth=0.8)
    axis.set_xticks(ticks)
    axis.tick_params(axis="both", length=0, pad=9)
    for side in ("top", "left", "right"):
        axis.spines[side].set_visible(False)


def operation_chart(data, evidence_hash):
    figure = plt.figure(figsize=(7.2, 7.6))
    figure.text(0.07, 0.945, "Rendering operations", fontsize=25, weight="bold")
    figure.text(0.07, 0.899, "Four changes, measured separately", color=MUTED, fontsize=16)
    figure.legend(handles=[Patch(color=ORIGINAL, label="Original"), Patch(color=CANDIDATE, label="Optimized")],
                  loc="upper left", bbox_to_anchor=(0.055, 0.87), ncol=2,
                  frameon=False, fontsize=16, handlelength=1.2, columnspacing=1.8)
    axis = figure.add_axes((0.075, 0.16, 0.68, 0.59))
    axis.set_xlim(0, 100)
    axis.set_ylim(-0.7, 7.1)
    axis.set_yticks([])
    style_axis(axis, [0, 50, 100])
    axis.xaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value:.0f}%"))
    description = ["Each optimization was measured separately against upstream 068ad22. Each row has its own unit; its original count is normalized to 100%. Counts are not CPU savings."]
    figure.text(0.92, 0.783, "Count", ha="right", color=MUTED, fontsize=14)
    for index, row in enumerate(data["operations"]):
        original, candidate = (resolve(data, row[key]) for key in ("original", "candidate"))
        if not 0 <= candidate <= original or original == 0:
            raise ValueError("Operation chart requires nonnegative counts up to the original")
        y = 6 - 2 * index
        axis.text(0, y + 0.62, row["label"], fontsize=17, weight="bold")
        for value, offset, color in ((original, 0.18, ORIGINAL), (candidate, -0.18, CANDIDATE)):
            axis.barh(y + offset, 100 * value / original, height=0.22, color=color, clip_on=False)
            if value == 0:
                axis.plot(0, y + offset, "o", color=color, markerfacecolor=PAPER,
                          markersize=5, markeredgewidth=1.4, clip_on=False)
            axis.text(1.24, y + offset, f"{value:,}", transform=axis.get_yaxis_transform(),
                      ha="right", va="center", color=color, fontsize=17, weight="bold")
        description.append(f'{row["label"]}: {original:,} original to {candidate:,} optimized {row["unit"]}. {row["detail"]}.')
    figure.text(0.075, 0.075, "Original = 100% within each row", fontsize=15, color=MUTED)
    figure.text(0.075, 0.028, "Upstream 068ad22 · operation counts, not CPU savings", fontsize=12.5, color=MUTED)
    return render_svg(figure, "Rendering operation counts", " ".join(description), evidence_hash)


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
    figure = plt.figure(figsize=(7.2, 9.6))
    figure.text(0.07, 0.952, "CPU time during map replay", fontsize=23, weight="bold")
    figure.text(0.07, 0.913, "Accelerated replay · three trials per variant", fontsize=15, color=MUTED)
    figure.legend(handles=[Line2D([], [], marker="o", color=ORIGINAL, linestyle="none", label="Original", markersize=7),
                           Line2D([], [], marker="s", color=CANDIDATE, linestyle="none", label="Map reuse", markersize=7)],
                  loc="upper left", bbox_to_anchor=(0.045, 0.89), ncol=2,
                  frameon=False, fontsize=16, handletextpad=0.3, columnspacing=1.6)
    description = ["Accumulated browser and descendant CPU time, not utilization or real-time frame cost. Both engines use a zero-based 0 to 5,000 ms axis. Circles and squares are medians; whiskers span the min and max of three trials. This measures only map-cache reuse, separately from the other optimizations."]
    workloads = [("button", "Button"), ("segmented", "Segmented"), ("mostly-unique", "Mostly new")]
    for engine, label, bottom in (("Blink", "Chrome / Blink", 0.54), ("Gecko", "Firefox / Gecko", 0.20)):
        figure.text(0.07, bottom + 0.255, label, fontsize=19, weight="bold")
        figure.text(0.94, bottom + 0.255, "Median (ms)", ha="right", fontsize=13, color=MUTED)
        axis = figure.add_axes((0.29, bottom, 0.51, 0.22))
        axis.set_xlim(0, 5000)
        axis.set_ylim(-0.55, 2.55)
        axis.set_yticks([2, 1, 0], [label for _, label in workloads])
        style_axis(axis, [0, 2500, 5000])
        axis.xaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value:,.0f}"))
        for index, (workload, _) in enumerate(workloads):
            row = next(r for r in rows if r["engine"] == engine and r["workload"] == workload)
            for variant, offset, marker, color in (("original", 0.19, "o", ORIGINAL), ("candidate", -0.19, "s", CANDIDATE)):
                value = row[variant]["median"]
                lo, hi = row[variant]["range"]
                y = 2 - index + offset
                axis.errorbar(value, y, xerr=[[value - lo], [hi - value]], fmt=marker,
                              color=color, markersize=6.5, capsize=3.5, capthick=1.4, elinewidth=1.6)
                axis.text(1.28, y, f"{value:,.0f}", transform=axis.get_yaxis_transform(),
                          ha="right", va="center", color=color, fontsize=16, weight="bold")
            description.append(f'{row["browser"]}, {workload}: ' + "; ".join(
                f'{variant} median {row[variant]["median"]:,.0f}, range {row[variant]["range"][0]:,.0f}–{row[variant]["range"][1]:,.0f} ms'
                for variant in ("original", "candidate")) + ".")
    figure.text(0.55, 0.139, "Accumulated CPU time (ms)", ha="center", fontsize=16, color=MUTED)
    figure.text(0.07, 0.086, "Markers: median · bars: min–max (3 trials)", fontsize=13, color=MUTED)
    increases = {row["engine"]: row["overhead"] for row in rows if row["workload"] == "mostly-unique"}
    note = f'New-map median: +{increases["Blink"]:.1f}% Chrome · +{increases["Gecko"]:.1f}% Firefox'
    figure.text(0.07, 0.050, note, fontsize=13, color=MUTED)
    figure.text(0.07, 0.020, "Ranges overlap; no statistical significance claim", fontsize=13, color=MUTED)
    description.append("Button and segmented workloads used twelve cycles; the mostly-unique workload used 1,200 updates. " + note + ". Ranges overlap; no statistical significance is claimed.")
    return render_svg(figure, "Map-cache CPU time", " ".join(description), evidence_hash)


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
    with matplotlib.rc_context(STYLE):
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
