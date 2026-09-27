# SPDX-License-Identifier: Apache-2.0
"""Render the tool-evaluation chart of the top-level README in the speed chart's design (bench/results/chart.py):
tool-eval-light.svg and tool-eval-dark.svg (current results), tool-eval-with-history-light.svg and -dark.svg (the
same, then the earlier release run in a separate section), the <picture> block between the tool-eval markers in
README.md and the per-round receipt table between the round markers in tool-eval-current.md.

    python3 -B bench/results/tool_eval_chart.py --write    # after every evidence export
    python3 -B bench/results/tool_eval_chart.py --check    # exit 1 if a generated file differs from what the data gives

Inputs (standard library only, no network): evidence/tool-eval-current.json (every completed round, its cohort and
receipt), evidence/tool-eval-bench.json with results.json (the earlier release run, for the history section) and the
exported receipts under tool-eval-logs/. Every completed round is drawn. A cohort gets a median and a range only when
all of its required rounds are complete; missing rounds are labelled pending, never estimated or drawn as zero.
"""
import argparse
import json
from pathlib import Path
import statistics
import textwrap
import sys
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import chart  # noqa: E402  the speed chart: same palette, type scale and drawing primitives

START, END = '<!-- tool-eval-chart:start -->', '<!-- tool-eval-chart:end -->'
ROUNDS_START, ROUNDS_END = '<!-- tool-eval-rounds:start -->', '<!-- tool-eval-rounds:end -->'
OUTPUTS = {theme: f'tool-eval-{theme}.svg' for theme in chart.THEMES}
HISTORY_OUTPUTS = {theme: f'tool-eval-with-history-{theme}.svg' for theme in chart.THEMES}
WIDTH, PAD = chart.WIDTH, 24
MODES = ('high', 'low', 'max')
MODE = {'high': 'High', 'low': 'Low', 'max': 'Max'}
TPS = (4, 2)                       # TP4 first, as in the speed chart
SLOT = {4: 'tp4', 2: 'tp2'}        # the speed chart's topology colours; RiNGSiDE marks use them
RECIPES = ('ringside', 'miaai')    # RiNGSiDE, then the comparison recipe (hollow, neutral grey)


# ------------------------------------------------------------------------------------------------------------ data

def load(root=ROOT):
    data = json.loads((root / 'bench/results/evidence/tool-eval-current.json').read_text())
    if data.get('schema_version') != 2:
        raise ValueError('tool-eval-current.json: unknown schema')
    seen = set()
    for r in data['rounds']:
        if (r['id'] in seen or r['scenarios'] != data['benchmark']['scenarios'] or r['seconds'] <= 0
                or not 0 <= r['score'] <= 100 or r['mode'] not in MODES or r['recipe'] not in data['recipes']):
            raise ValueError(f"invalid or duplicate round {r['id']}")
        seen.add(r['id'])
    for c in data['cohorts']:
        got = rounds_of(data, c)
        if (len(got) != c['completed'] or c['completed'] > c['required']
                or c['state'] not in ('complete', 'pending')
                or (c['state'] == 'complete' and c['completed'] != c['required'])):
            raise ValueError(f'cohort counts differ: {c}')
    if sum(c['completed'] for c in data['cohorts']) != len(data['rounds']):
        raise ValueError('a round belongs to no cohort')
    return data


def rounds_of(data, c):
    return sorted((r for r in data['rounds'] if (r['recipe'], r['tp'], r['mode'], r['parallel'])
                   == (c['recipe'], c['tp'], c['mode'], c['parallel'])), key=lambda r: r['round'])


def cohort(data, recipe, tp, mode, parallel=4):
    for c in data['cohorts']:
        if (c['recipe'], c['tp'], c['mode'], c['parallel']) == (recipe, tp, mode, parallel):
            return c
    return None


def stats(rows):
    scores, secs = [r['score'] for r in rows], [r['seconds'] for r in rows]
    return dict(score=statistics.median(scores), score_lo=min(scores), score_hi=max(scores),
                sec=statistics.median(secs), sec_lo=min(secs), sec_hi=max(secs))


def history(root=ROOT):
    res = root / 'bench/results'
    tool = json.loads((res / 'evidence/tool-eval-bench.json').read_text())
    window = {r['id']: r for r in json.loads((res / 'results.json').read_text())}['tp4-ringside']['lab_receipt']
    release = sorted((r for r in tool['runs'] if r['window'] == window), key=lambda r: r['round'])
    earlier = sorted((r for r in tool['runs'] if r['window'] != window), key=lambda r: r['started'])
    return tool, release, earlier


# --------------------------------------------------------------------------------------------------------- formats

def clock(seconds):
    seconds = int(round(seconds))
    return f'{seconds // 60}:{seconds % 60:02d}'


def num(v):
    return f'{v:g}'


def score_text(s):
    return num(s['score']) + (f" ({num(s['score_lo'])}–{num(s['score_hi'])})" if s['score_lo'] != s['score_hi'] else '')


def time_text(s):
    return clock(s['sec']) + (f" ({clock(s['sec_lo'])}–{clock(s['sec_hi'])})" if s['sec_lo'] != s['sec_hi'] else '')


def short_name(data, recipe):
    return data['recipes'][recipe]['short']


def owner_folder(name):
    owner, _, folder = name.partition('/')
    return owner + '/', folder


def snapshot_text(data):
    snap = data['snapshot']
    off = snap['utc_offset']
    tz = 'UTC' + off[0] + str(int(off[1:3])) + (':' + off[4:] if off[4:] != '00' else '')
    return f"{snap['reviewed'][:16]} ({tz})"


def draft(data):
    return data['status'].startswith('LOCAL_DRAFT')


def receipt_href(r, name='result.json'):
    return f"{r['receipt']['folder']}/{name}"


# --------------------------------------------------------------------------------------------------------- drawing

class Svg(chart.Svg):
    """The speed chart's primitives plus tspans, links and the three effort marks."""

    def wrapped(self, x, y, text, size=11, width=None):
        width = WIDTH - PAD - x if width is None else width
        for line in textwrap.wrap(text, max(20, int(width / (size * .62))), break_long_words=False):
            self.text(x, y, line, size, fill='ink2')
            y += 16
        return y

    def rich(self, x, y, parts, size=11.5, anchor=None):
        attrs = f'x="{chart.n(x)}" y="{chart.n(y)}" font-size="{chart.n(size)}" fill="{self.t["ink2"]}"'
        if anchor:
            attrs += f' text-anchor="{anchor}"'
        spans = []
        for part in parts:   # (text, fill[, weight[, href]])
            s, fill = part[0], part[1]
            weight = part[2] if len(part) > 2 else None
            href = part[3] if len(part) > 3 else None
            w = f' font-weight="{weight}"' if weight else ''
            span = f'<tspan fill="{self.t[fill]}"{w}>{escape(s)}</tspan>'
            if href:
                span = f'<a href="{escape(href)}">{span}</a>'
            spans.append(span)
        self.parts.append(f'<text {attrs}>{"".join(spans)}</text>')

    def mark(self, mode, x, y, big, style, tip, href=None):
        """style: ('fill', slot) for RiNGSiDE, ('ring', None) for the comparison recipe."""
        kind, slot = style
        if kind == 'median':
            colour = self.t[slot] if slot else self.t['muted']
            paint = f'fill="none" stroke="{colour}" stroke-width="2"'
        elif kind == 'fill':
            paint = f'fill="{self.t[slot]}" stroke="{self.t["surface"]}" stroke-width="{2 if big else 1.5}"'
        elif kind == 'key':
            paint = f'fill="{self.t["ink2"]}"'
        else:
            paint = f'fill="{self.t["surface"]}" stroke="{self.t["muted"]}" stroke-width="{2 if big else 1.6}"'
        if not big and kind in ('fill', 'ring'): paint += ' opacity="0.55"'
        tip = f'<title>{escape(tip)}</title>'
        if mode == 'high':
            r = 6 if big else 3.4
            el = f'<circle cx="{chart.n(x)}" cy="{chart.n(y)}" r="{r}" {paint}>{tip}</circle>'
        elif mode == 'low':
            h = 5.4 if big else 3.1
            el = (f'<rect x="{chart.n(x - h)}" y="{chart.n(y - h)}" width="{chart.n(2 * h)}" height="{chart.n(2 * h)}" '
                  f'rx="1.5" {paint}>{tip}</rect>')
        else:
            h = 7.6 if big else 4.4
            el = (f'<path d="M{chart.n(x)} {chart.n(y - h)}L{chart.n(x + h)} {chart.n(y)}L{chart.n(x)} {chart.n(y + h)}'
                  f'L{chart.n(x - h)} {chart.n(y)}Z" {paint}>{tip}</path>')
        self.parts.append(f'<a href="{escape(href)}">{el}</a>' if href else el)

    def whisker(self, x1, y1, x2, y2, style):
        colour = self.t[style[1]] if style[0] == 'fill' else self.t['muted']
        self.parts.append(f'<line x1="{chart.n(x1)}" y1="{chart.n(y1)}" x2="{chart.n(x2)}" y2="{chart.n(y2)}" '
                          f'stroke="{colour}" stroke-width="1.5" stroke-linecap="round"/>')

    def ring_swatch(self, x, y):
        self.parts.append(f'<rect x="{chart.n(x + 0.75)}" y="{chart.n(y + 0.75)}" width="10.5" height="10.5" rx="2.5" '
                          f'fill="{self.t["surface"]}" stroke="{self.t["muted"]}" stroke-width="1.5"/>')

    def rule(self, x1, x2, y, width=1, stroke='grid'):
        self.line(x1, y, x2, y, stroke, width)


def style_of(recipe, tp):
    return ('fill', SLOT[tp]) if recipe == 'ringside' else ('ring', None)


def text_width(s, size):
    return len(s) * size * 0.56


class Placer:
    """First free spot to the right, left, above or below a mark; boxes are (x0, y0, x1, y1)."""

    def __init__(self, bounds):
        self.bounds, self.boxes = bounds, []

    def block(self, box):
        self.boxes.append(box)

    def place(self, x, y, text, size, pad):
        w, h = text_width(text, size), size
        for dx, dy, anchor in ((pad, 4, 'start'), (-pad, 4, 'end'), (0, -pad - 2, 'middle'), (0, pad + h, 'middle'),
                               (pad, -pad, 'start'), (pad, pad + h - 2, 'start'), (-pad, -pad, 'end')):
            x0 = x + dx - (w if anchor == 'end' else w / 2 if anchor == 'middle' else 0)
            box = (x0 - 2, y + dy - h, x0 + w + 2, y + dy + 3)
            b = self.bounds
            if box[0] < b[0] or box[2] > b[2] or box[1] < b[1] or box[3] > b[3]:
                continue
            if all(box[2] <= o[0] or box[0] >= o[2] or box[3] <= o[1] or box[1] >= o[3] for o in self.boxes):
                self.boxes.append(box)
                return x + dx, y + dy, anchor
        self.boxes.append((x + pad, y - h, x + pad + w, y + 4))
        return x + pad, y + 4, 'start'


def score_scale(data):
    rows = data['rounds']
    lo = min(r['score'] for r in rows)
    hi = max(r['score'] for r in rows)
    import math
    lower = max(0, math.floor(lo) - 1)
    upper = min(100, math.ceil(hi) + 1)
    if upper == lower: upper = min(100, lower + 1)
    return lower, upper


def minute_scale(data, rows=None):
    rows = data['rounds'] if rows is None else rows
    return chart.scale_max(max(r['seconds'] for r in rows) / 60, ticks=5, head=1.04)


def legend(svg, data, y):
    """Series key in the speed chart's form: swatch, bold label, detail lines."""
    ring, mia = data['recipes']['ringside'], data['recipes']['miaai']
    svg.swatch(PAD, y - 10, 'tp4')
    svg.swatch(PAD + 15, y - 10, 'tp2')
    owner, folder = owner_folder(ring['name'])
    svg.rich(PAD + 34, y, [(owner, 'ink2', '600'), (folder, 'ink', '600')], 12.5)
    tp4, tp2 = ring['tp']['4'], ring['tp']['2']
    for line in (f"TP4 blue: plan {tp4['plan']} (release + A1e). TP2 orange: release plan {tp2['plan']}.",
                 f"{ring['checkpoint']} @ {ring['revision']} · measured lab image {ring['image']}; public rebuild unqualified."):
        y += 16
        svg.text(PAD + 34, y, line, 11.5, fill='ink2')
    y += 24
    svg.ring_swatch(PAD, y - 10)
    owner, folder = owner_folder(mia['name'])
    svg.rich(PAD + 34, y, [(owner, 'ink2', '600'), (folder, 'ink', '600')], 12.5)
    for line in (f"Hollow grey: commit {mia['commit']}, clean build. TP4 lab adaptation: compact KV off, K4. TP2: compact KV, K7.",
                 f"{mia['checkpoint']} @ {mia['revision']} · image mia-{mia['commit']}-20260926."):
        y += 16
        svg.text(PAD + 34, y, line, 11.5, fill='ink2')
    y += 24
    b, s = data['benchmark'], data['settings']
    svg.rich(PAD, y, [(b['repository'] + ' ', 'ink', '600'), (b['version'], 'ink', '600'),
                      (f"  commit {b['commit'][:8]}", 'ink2', None)], 12.5)
    out = s['output_tokens']
    lines = [f"{b['scenarios']} scenarios ({b['suite']}) · one trial per round · thinking on · {s['parallel']} scenarios in parallel",
             f"temperature {s['temperature']} · seed {s['seed']} · top_p {s['top_p']} · top_k {s['top_k']} · min_p {s['min_p']} · repetition penalty {s['repetition_penalty']}",
             f"max turns {s['max_turns']} · timeout {s['timeout_seconds']} s · reference date {s['reference_date']}",
             f"Output ceiling per turn: {out['high']:,} tokens (High, Low) · {out['max']:,} tokens (Max)"]
    for line in lines:
        y += 16
        svg.text(PAD, y, line, 11.5, fill='ink2')
    y += 22
    x = PAD
    for mode in MODES:
        svg.mark(mode, x + 6, y - 4, False, ('key', None), MODE[mode])
        svg.text(x + 15, y, MODE[mode], 11.5)
        x += 15 + text_width(MODE[mode], 11.5) + 16
    svg.text(x + 4, y, 'effort · faint mark: one round · outlined mark and bars: median and range', 11.5, fill='ink2')
    y += 16
    svg.text(PAD, y, 'Every round links to its receipt. A single Max run has no range estimate.', 11, fill='ink2')
    return y + 30


def scatter_panel(svg, data, tp, x, y, w, sy, sx):
    """Score against round time for one topology: every round, then median and range per complete cohort."""
    lower, upper = sy
    top, step = sx
    chart.panel_title(svg, x, y, f'TP{tp}: score against round time',
                      f"{data['settings']['parallel']} scenarios in parallel · score axis from {lower} · "
                      f"higher / left is better")
    x0, x1 = x + 34, x + w - 94
    height, base = 196, y + 238
    v = lower
    while v <= upper + 1e-9:
        yy = base - height * (v - lower) / (upper - lower)
        svg.line(x0, yy, x1, yy, 'axis' if v == lower else 'grid')
        svg.text(x0 - 6, yy + 4, num(v), 11, fill='ink2', anchor='end')
        v += 2
    svg.text(x0 - 4, base - height - 10, 'score', 11, fill='ink2', anchor='end')
    m = 0
    while m <= top + 1e-9:
        xx = x0 + (x1 - x0) * m / top
        svg.text(xx, base + 16, num(m), 11, fill='ink2', anchor='middle')
        m += step
    svg.text(x1, base + 31, 'round time (min)', 11, fill='ink2', anchor='end')

    def px(sec):
        return x0 + (x1 - x0) * sec / 60 / top

    def py(score):
        return base - height * (score - lower) / (upper - lower)
    placer = Placer((x0 + 2, base - height - 4, x1 + 4, base - 4))
    pending, drawn = [], []
    for recipe in RECIPES:
        for mode in MODES:
            c = cohort(data, recipe, tp, mode)
            if c is None:
                continue
            rows = rounds_of(data, c)
            style = style_of(recipe, tp)
            if c['state'] != 'complete':
                pending.append((recipe, mode, c))
            if c['state'] == 'complete' and len(rows) > 1:
                s = stats(rows)
                svg.whisker(px(s['sec_lo']), py(s['score']), px(s['sec_hi']), py(s['score']), style)
                svg.whisker(px(s['sec']), py(s['score_lo']), px(s['sec']), py(s['score_hi']), style)
            for r in rows:
                if c['state'] == 'complete' and len(rows) == 1:
                    continue
                cx, cy = px(r['seconds']), py(r['score'])
                svg.mark(mode, cx, cy, False, style,
                         f"{short_name(data, recipe)} TP{tp} {MODE[mode]}, round {r['round']}: score {r['score']} "
                         f"({r['points']}/{r['max_points']} points), {clock(r['seconds'])}", receipt_href(r))
                placer.block((cx - 5, cy - 5, cx + 5, cy + 5))
            if c['state'] == 'complete':
                drawn.append((recipe, mode, rows))
    for recipe, mode, rows in drawn:
        s = stats(rows)
        cx, cy = px(s['sec']), py(s['score'])
        one = len(rows) == 1
        tip = (f"{short_name(data, recipe)} TP{tp} {MODE[mode]}: " +
               (f"score {rows[0]['score']} ({rows[0]['points']}/{rows[0]['max_points']} points), {clock(rows[0]['seconds'])}, one round"
                if one else f"median score {score_text(s)}, median time {time_text(s)}, {len(rows)} rounds"))
        svg.mark(mode, cx, cy, True, style_of(recipe, tp) if one else ('median', SLOT[tp] if recipe == 'ringside' else None), tip, receipt_href(rows[0]) if one else None)
        placer.block((cx - 8, cy - 8, cx + 8, cy + 8))
    # Labels live in a separate right-hand rail; their leaders never cross text or marks.
    labels = sorted(drawn, key=lambda item: py(stats(item[2])['score']))
    previous = base - height - 8
    for index, (recipe, mode, rows) in enumerate(labels):
        s = stats(rows)
        cx, cy = px(s['sec']), py(s['score'])
        ly = max(cy + 4, previous + 24)
        ly = min(ly, base - (len(labels) - 1 - index) * 24)
        previous = ly
        lx = x1 + 25
        svg.line(cx + 8, cy, x1 + 12, ly - 4, 'grid')
        svg.mark(mode, lx - 10, ly - 4, False, style_of(recipe, tp), short_name(data, recipe))
        svg.parts.append('<g data-label="scatter">')
        svg.text(lx, ly, f"{MODE[mode]} {num(s['score'])}", 11,
                 fill='ink' if recipe == 'ringside' else 'ink2', weight='600' if recipe == 'ringside' else None)
        svg.parts.append('</g>')
    yy = base + 48
    for recipe, mode, c in pending:
        who = 'RiNGSiDE' if recipe == 'ringside' else 'comparison recipe'
        svg.text(x0, yy, f"pending: {who}, {MODE[mode]} — {c['completed']} of {c['required']} rounds", 11.5,
                 fill='ink2')
        yy += 16
    return yy + (0 if pending else -16)


def mini_axes(svg, x0, x1, base, height, lower, upper, step, unit):
    v = lower
    while v <= upper + 1e-9:
        yy = base - height * (v - lower) / (upper - lower)
        svg.line(x0, yy, x1, yy, 'axis' if v == lower else 'grid')
        svg.text(x0 - 6, yy + 4, num(v), 11, fill='ink2', anchor='end')
        v += step
    svg.text(x0 - 4, base - height - 10, unit, 11, fill='ink2', anchor='end')


def concurrency_panel(svg, data, x, y, w, sy):
    """RiNGSiDE High by scenarios in parallel: the comparison High cohort at 4, the separate cohorts above it."""
    extra = [c for c in data['cohorts'] if c['group'] == 'concurrency']
    if not extra:
        return y
    if not any(c['state'] == 'complete' for c in extra):
        svg.text(x, y, 'RiNGSiDE High: more scenarios in parallel', 12.5, weight='600')
        labels = ' · '.join(f"TP{c['tp']} at {c['parallel']}: {c['completed']} of {c['required']} rounds" for c in extra)
        svg.text(x, y + 19, 'Pending — ' + labels, 11.5, fill='ink2')
        return y + 26
    levels = sorted({4} | {c['parallel'] for c in extra})
    tps = [tp for tp in TPS if any(c['tp'] == tp for c in extra)]
    series = {}
    for tp in tps:
        cells = {}
        for level in levels:
            c = cohort(data, 'ringside', tp, 'high', level)
            if c is not None:
                cells[level] = (c, rounds_of(data, c))
        series[tp] = cells
    planned = '; '.join(f"TP{tp} at " + ' and '.join(str(level) for level in levels
                                                        if level != 4 and level in series[tp]) for tp in tps)
    chart.panel_title(svg, x, y, 'RiNGSiDE High by scenarios in parallel',
                      f"separate cohorts, never pooled with the comparison · 4 = the comparison High cohort "
                      f"· planned: {planned}, {extra[0]['required']} rounds each")
    gap = 32
    cw = (w - gap) / 2
    lower, upper = sy
    measured = [r for cells in series.values() for c, rows in cells.values() for r in rows]
    ttop, tstep = chart.scale_max(max(r['seconds'] for r in measured) / 60, ticks=4, head=1.15)
    height, base = 104, y + 162
    for i, (name, unit) in enumerate((('median score, with range', 'score'), ('median round time, with range', 'min'))):
        cx0 = x + i * (cw + gap)
        svg.text(cx0 + 34, y + 46, name, 12.5, weight='600')
        x0, x1 = cx0 + 34, cx0 + cw - 8
        if i == 0:
            mini_axes(svg, x0, x1, base, height, lower, upper, 5, unit)
        else:
            mini_axes(svg, x0, x1, base, height, 0, ttop, tstep, unit)

        def px(level):
            return x0 + 24 + (x1 - x0 - 48) * levels.index(level) / max(1, len(levels) - 1)

        def py(v):
            return (base - height * (v - lower) / (upper - lower)) if i == 0 else base - height * v / ttop
        for level in levels:
            svg.text(px(level), base + 16, str(level), 11, fill='ink2', anchor='middle')
        for k, tp in enumerate(tps):
            pts = []
            for level in levels:
                cell = series[tp].get(level)
                if cell is None:
                    continue
                c, rows = cell
                # Plot actual rounds, including partial cohorts; never place a pending symbol
                # at an arbitrary score/time coordinate.
                for r in rows:
                    value = r['score'] if i == 0 else r['seconds'] / 60
                    svg.mark('high', px(level), py(value), False, ('fill', SLOT[tp]),
                             f"TP{tp} C{level} round {r['round']}: {r['score']}, {clock(r['seconds'])}",
                             receipt_href(r))
                if c['state'] != 'complete':
                    continue
                s = stats(rows)
                v, lo, hi = (s['score'], s['score_lo'], s['score_hi']) if i == 0 else \
                    (s['sec'] / 60, s['sec_lo'] / 60, s['sec_hi'] / 60)
                if lo != hi:
                    svg.whisker(px(level), py(lo), px(level), py(hi), ('fill', SLOT[tp]))
                pts.append((level, v, rows))
            if len(pts) > 1:
                svg.polyline([(px(level), py(v)) for level, v, _ in pts], SLOT[tp])
            for level, v, rows in pts:
                text = num(v) if i == 0 else clock(v * 60)
                svg.mark('high', px(level), py(v), True, ('median', SLOT[tp]), f"RiNGSiDE TP{tp} High, {level} in parallel: "
                        + (f"median score {score_text(stats(rows))}" if i == 0 else f"median time {time_text(stats(rows))}")
                        + f", {len(rows)} rounds")
                left_label = tp == 2 or level == levels[-1]
                svg.parts.append('<g data-label="concurrency">')
                svg.text(px(level) + (-10 if left_label else 10), py(v) + 4, text, 11,
                         weight='600', halo=True, anchor='end' if left_label else 'start')
                svg.parts.append('</g>')
        svg.text(x0, base + 32, 'scenarios in parallel', 11, fill='ink2')
    pending = [c for c in extra if c['state'] != 'complete']
    if pending:
        labels = ', '.join(f"TP{c['tp']} C{c['parallel']} ({c['completed']}/{c['required']})" for c in pending)
        svg.text(x + 34, base + 52, 'Pending cohorts: ' + labels, 11, fill='ink2')
    return base + (60 if pending else 40)


def table_panel(svg, data, x, y, w):
    """Every round of the comparison cohorts, then median and range where a cohort is complete."""
    chart.panel_title(svg, x, y, 'Every round: score and round time, with median and range',
                      f"rounds in run order; median (min–max) only for complete cohorts · "
                      f"{data['settings']['parallel']} scenarios in parallel")
    c1, c2 = x + 104, x + 104 + (w - 104) / 2 + 4
    yy = y + 44
    for cx, recipe in ((c1, 'ringside'), (c2, 'miaai')):
        svg.text(cx, yy, short_name(data, recipe), 12, weight='600')
    yy += 10
    svg.rule(x, x + w, yy, 1, 'axis')
    for tp in TPS:
        for mode in MODES:
            yy += 20
            svg.swatch(x, yy - 10, SLOT[tp])
            svg.text(x + 18, yy, f'TP{tp} {MODE[mode]}', 12, weight='600')
            svg.text(x + 18, yy + 16, f"{data['settings']['output_tokens'][mode]:,} tokens", 11, fill='ink2')
            for cx, recipe in ((c1, 'ringside'), (c2, 'miaai')):
                c = cohort(data, recipe, tp, mode)
                rows = rounds_of(data, c) if c else []
                if c is None:
                    svg.text(cx, yy, 'not run', 12, fill='ink2')
                    continue
                if c['state'] != 'complete':
                    svg.text(cx, yy, f"pending — {c['completed']} of {c['required']} rounds", 12, fill='ink2')
                else:
                    s = stats(rows)
                    svg.rich(cx, yy, [('score ', 'ink2', None), (score_text(s), 'ink', '600'),
                                      ('   time ', 'ink2', None), (time_text(s), 'ink', '600')], 12)
                parts = []
                for i, r in enumerate(rows):
                    parts.append(((' · ' if i else 'scores ') + str(r['score']), 'ink2', None, receipt_href(r)))
                if rows:
                    parts.append((' | time ' + ' · '.join(clock(r['seconds']) for r in rows), 'ink2', None))
                    svg.rich(cx, yy + 16, parts, 11)
            yy += 22
            svg.rule(x, x + w, yy)
    return yy + 6


def history_section(svg, data, x, y, w, root):
    """The earlier release run: another benchmark version and scenario set, so it gets no shared axis."""
    tool, release, earlier = history(root)
    meta = tool['tool']
    svg.line(x, y, x + w, y, 'axis', 2)
    y += 30
    chart.panel_title(svg, x, y, 'Earlier results — separate: another benchmark version and scenario set')
    svg.text(x, y + 17, f"{meta['repository']} {meta['version']} · {meta['scenarios']} core scenarios · "
             f"Hard Mode off · {release[0]['max_points']} points", 11.5, fill='ink2')
    svg.text(x, y + 33, 'Release: default Max · 16,384 output tokens · 4 in parallel · temperature 0 · seed 42; full settings in protocol.',
             11.5, fill='ink2')
    svg.text(x, y + 49, 'Round time not archived. No shared time axis or direct comparison.', 11.5, fill='ink2')
    y += 78
    run = release[0]
    svg.swatch(x, y - 10, 'tp4')
    svg.text(x + 18, y, f"RiNGSiDE TP4, release window of lab plan {run['lab_plan']}", 11.5, fill='ink2')
    same = len({(r['final_score'], r['points']) for r in release}) == 1
    big = str(run['final_score']) if same else ' / '.join(str(r['final_score']) for r in release)
    svg.text(x, y + 52, big, 46, weight='700')
    off = 64 if same else 28 * len(big) // 2 + 20
    svg.text(x + off, y + 34, 'score' + (f', all {len(release)} rounds' if same and len(release) > 1 else ''), 11.5,
             fill='ink2')
    svg.text(x + off, y + 52, (f"{run['points']} / {run['max_points']} points" + (' each' if len(release) > 1 else ''))
             if same else ' / '.join(str(r['points']) for r in release) + f" of {run['max_points']} points", 13,
             weight='600')
    yy = y + 78
    for r in release:
        c = r['counts']
        started = r['started']
        tz = started[19:]
        tz = ' (UTC' + tz[0] + str(int(tz[1:3])) + (':' + tz[4:] if tz[4:] != '00' else '') + ')' if tz else ''
        svg.rich(x, yy, [(f"round {r['round']}: {c['passed']} passed, {c['partial']} partial, {c['failed']} failed "
                          f"· {started[:10]} {started[11:16]}{tz} · ", 'ink', None),
                         ('receipt', 'ink2', None, f"tool-eval-logs/historical/release-tp4-{r['round']}/result.json")], 12)
        yy += 18
    failed = sorted(set.intersection(*(set(r['failed_scenarios']) for r in release)))
    if failed:
        svg.text(x, yy, 'failed in every round: ' + ', '.join(failed), 11.5, fill='ink2')
        yy += 18
    rx = x
    ry = yy + 20
    svg.text(rx, ry, 'Earlier single runs, same version', 12.5, weight='600')
    for r in earlier:
        ry += 20
        who = 'RiNGSiDE TP4' if r['recipe'].endswith('-RiNGSiDE') else r['recipe'] + ' TP4'
        owner, folder = owner_folder(who) if '/' in who else ('', who)
        svg.rich(rx, ry, [(owner, 'ink2', None), (folder, 'ink', None),
                          (f"  {r['final_score']} ({r['points']}/{r['max_points']})", 'ink', '600')], 12)
        ry += 15
        svg.text(rx, ry, f"lab plan {r['lab_plan']} · {r['started'][:10]} · summary record only", 11,
                 fill='ink2')
    return max(yy, ry + 8) + 8


def truncation_notes(data):
    rows = [r for r in data['rounds'] if r.get('reported_truncation_cases')]
    if not rows:
        return ['No exported round reported truncation. Per-turn finish reasons are not retained, so this cannot be proved independently.']
    return [f"Reported output-limit truncation: {data['recipes'][r['recipe']]['short']} TP{r['tp']} {MODE[r['mode']]}, "
            f"{r['parallel']} in parallel, round {r['round']} ({', '.join(r['reported_truncation_cases'])})."
            for r in rows] + ['Per-turn finish reasons are not fully retained; absence of a report does not prove absence of truncation.']


def footer(svg, data, y):
    spreads = []
    for c in data['cohorts']:
        rows = rounds_of(data, c)
        if c['state'] == 'complete' and len(rows) > 1:
            spreads.append(max(r['score'] for r in rows) - min(r['score'] for r in rows))
    spread = max(spreads)
    notes = [
        'Round time covers one 92-scenario round. Model boot, preparation, hardware queue waits and admission probes are excluded.',
        'Recipes differ in quantization, runtime and speculative settings. These are complete-recipe comparisons.',
        f'Observed score range within a complete cohort: up to {spread} points.',
        *truncation_notes(data),
        'Reproduce: python3 bench/results/reproduce_tool_eval.py',
        '  --base-url URL --model ALIAS --effort high|low|max [--parallel N] --output DIR',
    ]
    for line in notes:
        y = svg.wrapped(PAD, y, line)
    y += 6
    status = 'local draft; ' if draft(data) else ''
    for line in [f"Data: bench/results/evidence/tool-eval-current.json · reviewed {snapshot_text(data)} · {status.rstrip('; ')}",
                 'Pending rounds are labelled, never estimated. Greedy and sampled cohorts remain separate.',
                 'Receipts: bench/results/tool-eval-logs · result.json, report and console per round · SHA-256 in manifest.json',
                 'Renderer: bench/results/tool_eval_chart.py · complete settings and recipe provenance in tool-eval-current.md']:
        svg.text(PAD, y, line, 11, fill='ink2')
        y += 16
    return y


def render_svg(theme, root=ROOT, history_shown=False):
    data = load(root)
    svg = Svg(theme)
    t = svg.t
    title = 'RiNGSiDE: tool calling, score against round time'
    svg.text(PAD, 36, title, 17, weight='700')
    y = legend(svg, data, 64)
    sy, sx = score_scale(data), minute_scale(data)
    left = WIDTH - 2 * PAD
    wb = (left - 32) / 2
    end_a = scatter_panel(svg, data, TPS[0], PAD, y, wb, sy, sx)
    end_b = scatter_panel(svg, data, TPS[1], PAD + wb + 32, y, wb, sy, sx)
    y = max(end_a, end_b) + 26
    y = concurrency_panel(svg, data, PAD, y, left, sy) + 22
    y = table_panel(svg, data, PAD, y, left) + 20
    if history_shown:
        y = history_section(svg, data, PAD, y, left, root) + 22
    y = footer(svg, data, y)
    height = int(y + 18)
    desc = alt_text(root, history_shown)
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}" '
            f'viewBox="0 0 {WIDTH} {height}" role="img" aria-labelledby="tool-title tool-desc" '
            f'font-family="{chart.FONT}">\n'
            f'<title id="tool-title">{escape(title)}</title>\n<desc id="tool-desc">{escape(desc)}</desc>\n'
            f'<rect x="0.5" y="0.5" width="{WIDTH - 1}" height="{height - 1}" rx="10" fill="{t["surface"]}" '
            f'stroke="{t["border"]}"/>\n')
    return head + '\n'.join(svg.parts) + '\n</svg>\n'


# ------------------------------------------------------------------------------------------------ README and tables

def alt_text(root=ROOT, history_shown=False):
    data = load(root)
    b = data['benchmark']
    out = [f"RiNGSiDE tool calling with {b['repository']} {b['version']}, {b['scenarios']} scenarios per round, "
           f"lab review snapshot {snapshot_text(data)}" + (', local draft' if draft(data) else '')]
    for tp in TPS:
        parts = []
        for recipe in RECIPES:
            name = data['recipes'][recipe]['short'] if recipe == 'ringside' else data['recipes'][recipe]['name']
            cells = []
            for mode in MODES:
                c = cohort(data, recipe, tp, mode)
                if c is None:
                    continue
                if c['state'] != 'complete':
                    cells.append(f"{MODE[mode]} pending ({c['completed']} of {c['required']} rounds)")
                else:
                    s = stats(rounds_of(data, c))
                    cells.append(f"{MODE[mode]} {score_text(s)} in {time_text(s)}")
            parts.append(name + ' ' + ', '.join(cells))
        out.append(f"TP{tp}: " + '; '.join(parts))
    extra = [c for c in data['cohorts'] if c['group'] == 'concurrency']
    if extra:
        out.append('RiNGSiDE High with more scenarios in parallel: ' + ', '.join(
            f"TP{c['tp']} at {c['parallel']} " + (score_text(stats(rounds_of(data, c))) if c['state'] == 'complete'
                                                  else f"pending ({c['completed']} of {c['required']} rounds)")
            for c in extra))
    if history_shown:
        tool, release, _ = history(root)
        out.append(f"Separately, the earlier release run with {tool['tool']['version']} and "
                   f"{tool['tool']['scenarios']} scenarios scored " + ' and '.join(str(r['final_score']) for r in release)
                   + ', not comparable with the current results')
    return '. '.join(out) + '.'


def block(root=ROOT):
    data = load(root)
    b = data['benchmark']
    alt = escape(alt_text(root), {'"': '&quot;'})
    return '\n'.join([
        START,
        '### Tool calling' + (' (local draft)' if draft(data) else ''),
        '',
        '<picture>',
        '  <source media="(prefers-color-scheme: dark)" srcset="bench/results/tool-eval-dark.svg">',
        '  <source media="(prefers-color-scheme: light)" srcset="bench/results/tool-eval-light.svg">',
        f'  <img alt="{alt}" src="bench/results/tool-eval-light.svg" width="{WIDTH}">',
        '</picture>',
        '',
        f"Measured with [{b['repository']}](https://github.com/{b['repository']}) {b['version']}: every round, and the "
        f"median with its range for complete cohorts, for RiNGSiDE and the comparison recipe",
        f"{data['recipes']['miaai']['name']}. Pending rounds are labelled, never estimated. Protocol, settings, every "
        'round with its receipt and the reproduction commands:',
        '[bench/results/tool-eval-current.md](bench/results/tool-eval-current.md). With the earlier release run in a '
        'separate section: [light](bench/results/tool-eval-with-history-light.svg),',
        '[dark](bench/results/tool-eval-with-history-dark.svg).',
        END,
    ])


def rounds_table(root=ROOT):
    data = load(root)
    lines = [ROUNDS_START, '',
             f"Snapshot {snapshot_text(data)}. Receipts are redacted copies; SHA-256 of every file in "
             '[tool-eval-logs/manifest.json](tool-eval-logs/manifest.json).', '',
             '| Recipe | TP | Effort | In parallel | Round | Score | Points | Round time | Receipt |',
             '|---|---|---|---|---|---|---|---|---|']
    order = {(r, tp, m): i for i, (r, tp, m) in enumerate((r, tp, m) for tp in TPS for r in RECIPES for m in MODES)}
    rows = sorted(data['rounds'], key=lambda r: (r['parallel'], order[(r['recipe'], r['tp'], r['mode'])], r['round']))
    for r in rows:
        name = data['recipes'][r['recipe']]['short'] if r['recipe'] == 'ringside' else data['recipes'][r['recipe']]['name']
        links = ' · '.join(f'[{label}]({receipt_href(r, f)})' for label, f in
                                (('result', 'result.json'), ('report', 'report-1.md'), ('console', 'console.log'))
                                if f in r['receipt']['files'])
        lines.append(f"| {name} | TP{r['tp']} | {MODE[r['mode']]} | {r['parallel']} | {r['round']} | {r['score']} | "
                     f"{r['points']}/{r['max_points']} | {clock(r['seconds'])} | {links} |")
    pending = [c for c in data['cohorts'] if c['state'] != 'complete']
    if pending:
        lines += ['', 'Pending, not estimated: ' + '; '.join(
            (data['recipes'][c['recipe']]['short'] if c['recipe'] == 'ringside' else data['recipes'][c['recipe']]['name'])
            + f" TP{c['tp']} {MODE[c['mode']]}" + (f" at {c['parallel']} in parallel" if c['parallel'] != 4 else '')
            + f" ({c['completed']} of {c['required']} rounds)" for c in pending) + '.']
    lines += ['', *truncation_notes(data), '', ROUNDS_END]
    return '\n'.join(lines)


def replace_block(text, start, end, new, where):
    if start in text and end in text:
        a = text.index(start)
        b = text.index(end, a) + len(end)
        return text[:a] + new + text[b:]
    i = text.index(where) + len(where)
    return text[:i] + '\n\n' + new + text[i:]


def expected(root=ROOT):
    out = {}
    for theme in chart.THEMES:
        out[f'bench/results/{OUTPUTS[theme]}'] = render_svg(theme, root)
        out[f'bench/results/{HISTORY_OUTPUTS[theme]}'] = render_svg(theme, root, history_shown=True)
    readme = (root / 'README.md').read_text()
    out['README.md'] = replace_block(readme, START, END, block(root), chart.END)
    doc = (root / 'bench/results/tool-eval-current.md').read_text()
    out['bench/results/tool-eval-current.md'] = replace_block(doc, ROUNDS_START, ROUNDS_END, rounds_table(root),
                                                              '## Every round and its receipt')
    return out


def check(root=ROOT):
    return [rel for rel, text in expected(root).items()
            if not (root / rel).exists() or (root / rel).read_text() != text]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true', help='write the SVGs, the README block and the round table')
    mode.add_argument('--check', action='store_true', help='exit 1 if a generated file differs from the data')
    args = ap.parse_args(argv)
    if args.check:
        stale = check()
        for rel in stale:
            print(f'{rel}: differs from what the data gives; run python3 bench/results/tool_eval_chart.py --write')
        return 1 if stale else 0
    for rel, text in expected().items():
        path = ROOT / rel
        if not path.exists() or path.read_text() != text:
            path.write_text(text)
            print('wrote', rel)
    return 0


if __name__ == '__main__':
    sys.exit(main())
