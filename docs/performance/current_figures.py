"""
Render figures from separately recorded animation and historical raster measurements
"""

from dataclasses import dataclass
from html import escape
from io import StringIO
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
from xml.etree import ElementTree

import matplotlib
from matplotlib import pyplot as plt
from matplotlib.lines import Line2D


PALETTE = {
    "ink": "#17334a",
    "muted": "#476176",
    "grid": "#dce7ee",
    "previous": "#687f93",
    "current": "#126ed0",
    "paper": "#f8fbfd",
}
WIDTH = 640
STYLE = {
    "font.family": ["Arial", "DejaVu Sans", "sans-serif"],
    "font.size": 24,
    "svg.fonttype": "none",
    "axes.facecolor": "none",
    "figure.facecolor": "none",
    "text.color": PALETTE["ink"],
}


@dataclass(frozen=True)
class Row:
    label: str
    previous: float
    current: float
    previous_range: tuple[float, float]
    current_range: tuple[float, float]

    def validate(self):
        for value, bounds in ((self.previous, self.previous_range), (self.current, self.current_range)):
            if not all(math.isfinite(number) for number in (value, *bounds)):
                raise ValueError(f"Non-finite measurement: {self.label}")
            if bounds[0] < 0 or bounds[0] > value + 1e-9 or value > bounds[1] + 1e-9:
                raise ValueError(f"Median outside its recorded range: {self.label}")
        if self.previous <= 0:
            raise ValueError(f"Previous median must be positive: {self.label}")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_measurements(root):
    repository = root.parent.parent
    raster_path = root / "raster-spans-results.json"
    animation_path = root / "fps-cpu-canvas-results.json"
    raster = json.loads(raster_path.read_text())
    animation = json.loads(animation_path.read_text())
    current = animation["manifest"]["builds"]["current"]["sha256"]
    for filename in ("liquid-glass.js", "glass-webgl.js"):
        recorded_hash = current[filename]
        if digest(repository / "lib" / filename) != recorded_hash:
            raise ValueError(f"Recorded current-engine data is stale: lib/{filename}")
    for variant, revision in (("previous", "938df92e98d935c5fc61c3c7e0953a216bf831ce"), ("new", "a863784")):
        source = subprocess.check_output(["git", "show", f"{revision}:lib/liquid-glass.js"], cwd=repository)
        if hashlib.sha256(source).hexdigest() != raster["sourceSHA256"][variant]:
            raise ValueError(f"Historical raster {variant} does not match {revision}")
    provenance = {
        "measuredDate": raster["date"],
        "animationMeasuredDate": animation["date"],
        "sources": {
            "raster-spans-results.json": digest(raster_path),
            "fps-cpu-canvas-results.json": digest(animation_path),
        },
        "rasterRevisions": {"previous": raster["sourceRevisions"]["previous"], "new": "a863784"},
        "animationBaselineSourceSHA256": animation["manifest"]["builds"]["previous"]["sha256"],
        "currentSourceSHA256": current,
        "recordedRunnerSHA256": animation["fixtureSHA256"]["review/measure-fps.mjs"],
        "presentRunnerMatchesRecorded": digest(repository / "review/measure-fps.mjs") == animation["fixtureSHA256"]["review/measure-fps.mjs"],
        "regenerationRerunsBenchmarks": False,
    }
    return raster, animation, provenance


def milliseconds(value):
    return f"{value:.3f}" if value < 10 else f"{value:.2f}"


def export_svg(figure, title, description, provenance, height):
    stream = StringIO()
    figure.savefig(stream, format="svg", transparent=True, metadata={"Date": None, "Creator": f"Liquid Glass / Matplotlib {matplotlib.__version__}"})
    plt.close(figure)
    rendered = stream.getvalue()
    header = (
        f'<title id="chart-title">{escape(title)}</title>\n'
        f'<desc id="chart-description">{escape(description)}</desc>\n'
        f'<metadata id="measurement-provenance">{escape(json.dumps(provenance, sort_keys=True))}</metadata>\n'
        '<style>:root{color-scheme:light}</style>\n'
        f'<rect width="{WIDTH}" height="{height}" fill="{PALETTE["paper"]}" fill-opacity=".97"/>\n'
    )
    rendered = re.sub(r"<svg\b[^>]*>", lambda match: match[0][:-1] + ' role="img" aria-labelledby="chart-title chart-description">\n' + header, rendered, count=1)
    rendered = "\n".join(line.rstrip() for line in rendered.splitlines()) + "\n"
    ElementTree.fromstring(rendered)
    return rendered


def comparison_chart(rows, *, title, fps, sample_note, limit_note, provenance, identifier, comparison):
    for row in rows:
        row.validate()
    ink, muted, grid, previous, current = (PALETTE[key] for key in ("ink", "muted", "grid", "previous", "current"))
    unit = "FPS" if fps else "ms"
    height = 1160 + max(0, len(rows) - 4) * 210
    footer = 1000 + max(0, len(rows) - 4) * 210
    with matplotlib.rc_context({**STYLE, "svg.hashsalt": f"liquidglass-current-{identifier}"}):
        figure = plt.figure(figsize=(WIDTH / 72, height / 72))
        text_artists = []

        def text(x, y, value, *, size=24, color=ink, weight="normal", align="left"):
            artist = figure.text(x / WIDTH, 1 - y / height, value, fontsize=size, color=color, weight=weight, ha=align, va="top")
            text_artists.append(artist)
            return artist

        text(36, 35, title, size=32, weight="bold")
        text(36, 88, "rAF cadence · higher is better" if fps else "Milliseconds · lower is better", color=muted)
        descriptions = []
        for index, row in enumerate(rows):
            top = 156 + index * 210
            text(36, top, row.label, weight="bold")
            maximum = max(row.previous_range[1], row.current_range[1]) * 1.12
            if fps:
                maximum = 65
            else:
                magnitude = 10 ** math.floor(math.log10(maximum))
                maximum = math.ceil(maximum / magnitude * 2) / 2 * magnitude
            axis = figure.add_axes((206 / WIDTH, (height - top - 152) / height, 230 / WIDTH, 91 / height))
            axis.set_xlim(0, maximum)
            axis.set_ylim(-.55, 1.55)
            axis.set_axis_off()
            axis.vlines([0, maximum], -.22, 1.22, color=grid, linewidth=.8)
            for value, bounds, color, marker, y, label in (
                (row.previous, row.previous_range, previous, "o", 1, "Previous"),
                (row.current, row.current_range, current, "s", 0, "Current"),
            ):
                baseline = top + (65 if y else 108)
                text(36, baseline, label, color=color)
                value_label = f"{value:.2f}" if fps else milliseconds(value)
                text(604, baseline, f"{value_label} {unit}", color=color, weight="bold", align="right")
                axis.hlines(y, 0, maximum, color=grid, linewidth=.8, zorder=0)
                axis.errorbar(value, y, xerr=[[value - bounds[0]], [bounds[1] - value]], fmt=marker, markersize=7, color=color, capsize=5, elinewidth=2, capthick=1.8, zorder=2)
            text(206, top + 158, "0", size=22, color=muted)
            text(436, top + 158, f"{maximum:g} {unit}", size=22, color=muted, align="right")
            if index < len(rows) - 1:
                figure.add_artist(Line2D([36 / WIDTH, 604 / WIDTH], [1 - (top + 195) / height] * 2, transform=figure.transFigure, color=grid, linewidth=.8))
            descriptions.append(f"{row.label}: previous median {row.previous:.6g} {unit}, range {row.previous_range[0]:.6g} to {row.previous_range[1]:.6g}; current median {row.current:.6g} {unit}, range {row.current_range[0]:.6g} to {row.current_range[1]:.6g}")
        text(36, footer, sample_note, size=22, color=muted)
        text(36, footer + 37, limit_note, size=22, color=muted)
        text(36, footer + 74, "Points: medians · whiskers: min–max", size=22, color=muted)
        text(36, footer + 111, "Scales differ by workload" if not fps else "Headless cadence, not displayed frames", size=22, color=muted)
        figure.canvas.draw()
        renderer = figure.canvas.get_renderer()
        for artist in text_artists:
            bounds = artist.get_window_extent(renderer)
            if bounds.x0 < 0 or bounds.y0 < 0 or bounds.x1 > figure.bbox.width or bounds.y1 > figure.bbox.height:
                raise ValueError(f"Chart text exceeds the canvas: {artist.get_text()}")
        description = (
            comparison + " "
            "Each workload uses a separate zero-based absolute scale, with endpoints printed below its marks. "
            "Whiskers show recorded minimum and maximum, not confidence intervals. "
            + ". ".join(descriptions) + ". " + sample_note + ". " + limit_note
        )
        return export_svg(figure, title, description, provenance, height)


def render_current_figures(root: Path):
    raster, animation, provenance = load_measurements(root)
    names = {"button map": "Button map · 120 × 64", "panel map": "Panel map · 640 × 360", "capsule map": "Capsule map · 240 × 64", "unique lens updates": "Unique lens update"}
    raster_rows = []
    for entry in raster["summary"]:
        reduction = (1 - entry["newMs"] / entry["previousMs"]) * 100
        if not math.isclose(reduction, entry["reductionPercent"], abs_tol=1e-8):
            raise ValueError(f"Recorded reduction is inconsistent: {entry['workload']}")
        raster_rows.append(Row(names[entry["workload"]], entry["previousMs"], entry["newMs"], tuple(entry["previousRangeMs"]), tuple(entry["newRangeMs"])))
    fps_rows, update_rows = [], []
    trials = set()
    for configuration in animation["configurations"]:
        settings, summary = configuration["settings"], configuration["summary"]
        activity = "cached movement" if settings["workload"] == "move" else "reshaping"
        renderer = "SVG" if settings["renderer"] == "svg" else "WebGL"
        label = f"{renderer} · {settings['count']} {activity} lenses"
        counts = [sum(trial["build"] == variant for trial in configuration["trials"]) for variant in ("previous", "current")]
        if counts[0] != counts[1] or not counts[0]:
            raise ValueError("Each animation workload needs paired trials")
        trials.add(counts[0])
        for rows, key, range_key in [(fps_rows, "fps", "fpsRange"), (update_rows, "meanUpdateMs", "meanUpdateMsRange")]:
            rows.append(Row(label, summary["previous"][key], summary["current"][key], tuple(summary["previous"][range_key]), tuple(summary["current"][range_key])))
    if len(trials) != 1:
        raise ValueError("Chart annotations require the same trial count for each scene")
    count = trials.pop()
    return {
        "current-map-time.svg": comparison_chart(raster_rows, title="Historical map times", fps=False,
            sample_note=f"{raster['samplesPerVariant']} paired samples/build · map scale 2",
            limit_note=f"{raster['correctness']['maps']} raw maps checked · {raster['correctness']['changedBytes']} changed bytes",
            provenance=provenance, identifier="maps", comparison="Historical raster comparison from revision 938df92 to revision a863784."),
        "current-animation-fps.svg": comparison_chart(fps_rows, title="Animation under load", fps=True,
            sample_note=f"Headless Chromium 157 · {count} trials/build",
            limit_note="Intermediate baseline · results vary by scene",
            provenance=provenance, identifier="fps", comparison="Current engine compared with the intermediate baseline used in the November 12 animation measurement."),
        "current-update-time.svg": comparison_chart(update_rows, title="Synchronous update time", fps=False,
            sample_note=f"{count} trials/build · median of trial means",
            limit_note="Async decode and GPU completion excluded",
            provenance=provenance, identifier="updates", comparison="Current engine compared with the intermediate baseline used in the November 12 animation measurement."),
    }
