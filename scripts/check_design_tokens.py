"""Check the colour tokens in frontend/src/styles.css for accessibility.

For the light and the dark theme:
- text colours must reach WCAG AA contrast (4.5:1) on every background;
- chart colours must reach 3:1 on the panel background (WCAG non-text contrast);
- chart colours must stay distinguishable (CIELAB distance >= 10) with normal vision
  and under simulated protanopia, deuteranopia and tritanopia.

Run from the repository root: python3 scripts/check_design_tokens.py
"""

from __future__ import annotations

import itertools
import math
import re
import sys
from pathlib import Path

STYLES = Path(__file__).resolve().parent.parent / "frontend" / "src" / "styles.css"

TEXT_TOKENS = [
    "--color-text",
    "--color-text-muted",
    "--color-text-subtle",
    "--color-accent",
    "--color-positive",
    "--color-negative",
]
BACKGROUND_TOKENS = ["--color-bg", "--color-surface", "--color-surface-muted"]
PAIRS = [("--color-warning", "--color-warning-soft"), ("--color-accent-contrast", "--color-accent")]
CHART_TOKENS = [f"--chart-{n}" for n in range(1, 7)]
MIN_TEXT_CONTRAST = 4.5
MIN_GRAPHIC_CONTRAST = 3.0
MIN_DISTANCE = 10.0

# Machado, Oliveira and Fernandes (2009) full-severity matrices, applied in linear RGB.
CVD_MATRICES: dict[str, list[list[float]]] = {
    "protanopia": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    "deuteranopia": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    "tritanopia": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}

Lab = tuple[float, float, float]


def read_themes(css: str) -> dict[str, dict[str, str]]:
    """Light tokens from the first :root block; dark tokens override them in the dark media query."""
    light_block = re.search(r":root\s*{(.*?)}", css, re.DOTALL)
    dark_block = re.search(r"prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{(.*?)}", css, re.DOTALL)
    if not light_block or not dark_block:
        raise SystemExit(f"Could not find the light and dark :root blocks in {STYLES}")

    def tokens(block: str) -> dict[str, str]:
        return dict(re.findall(r"(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b", block))

    light = tokens(light_block.group(1))
    return {"light": light, "dark": {**light, **tokens(dark_block.group(1))}}


def channels(hex_colour: str) -> list[float]:
    value = hex_colour.lstrip("#")
    return [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]


def linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def luminance(hex_colour: str) -> float:
    r, g, b = (linear(c) for c in channels(hex_colour))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    high, low = sorted([luminance(a), luminance(b)], reverse=True)
    return (high + 0.05) / (low + 0.05)


def lab(linear_rgb: list[float]) -> Lab:
    r, g, b = linear_rgb
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))


def simulate(hex_colour: str, matrix: list[list[float]] | None) -> Lab:
    rgb = [linear(c) for c in channels(hex_colour)]
    if matrix is not None:
        rgb = [max(0.0, min(1.0, sum(row[j] * rgb[j] for j in range(3)))) for row in matrix]
    return lab(rgb)


def check_theme(name: str, tokens: dict[str, str]) -> list[str]:
    failures: list[str] = []
    for fg, bg in [*itertools.product(TEXT_TOKENS, BACKGROUND_TOKENS), *PAIRS]:
        ratio = contrast(tokens[fg], tokens[bg])
        if ratio < MIN_TEXT_CONTRAST:
            failures.append(f"{name}: {fg} on {bg} is {ratio:.2f}:1 (needs {MIN_TEXT_CONTRAST}:1)")
    worst_text = min(contrast(tokens[fg], tokens[bg]) for fg, bg in itertools.product(TEXT_TOKENS, BACKGROUND_TOKENS))

    for token in CHART_TOKENS:
        ratio = contrast(tokens[token], tokens["--color-surface"])
        if ratio < MIN_GRAPHIC_CONTRAST:
            failures.append(f"{name}: {token} on --color-surface is {ratio:.2f}:1 (needs {MIN_GRAPHIC_CONTRAST}:1)")

    distances: list[str] = []
    for vision, matrix in [("normal vision", None), *CVD_MATRICES.items()]:
        colours = {token: simulate(tokens[token], matrix) for token in CHART_TOKENS}
        distance, a, b = min((math.dist(colours[a], colours[b]), a, b) for a, b in itertools.combinations(colours, 2))
        distances.append(f"{vision} {distance:.1f}")
        if distance < MIN_DISTANCE:
            failures.append(f"{name}: {a} and {b} are too close under {vision} (distance {distance:.1f})")

    print(f"{name}: lowest text contrast {worst_text:.2f}:1; closest chart colours: {', '.join(distances)}")
    return failures


def main() -> int:
    failures = [f for name, tokens in read_themes(STYLES.read_text()).items() for f in check_theme(name, tokens)]
    for failure in failures:
        print(f"FAIL {failure}")
    print("Design tokens pass." if not failures else f"{len(failures)} problem(s) found.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
