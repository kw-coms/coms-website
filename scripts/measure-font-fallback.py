#!/usr/bin/env python3
"""Measures the numbers behind src/styles/font-fallback.css (dev-time only; needs `pip install fonttools brotli`).

  python3 scripts/measure-font-fallback.py Pretendard=PretendardVariable.ttf@wght=400 Malgun=malgun.ttf WQY=wqy-zenhei.ttc#0

Argument form: label=path[#ttc-index][@wght=N]. For every font it prints the unit-less hhea ascent/descent/lineGap and the
average advance of the Hangul syllables and of the Latin letters/digits/spaces that occur in src/**/*.ts(x), weighted by
how often each occurs. A fallback's size-adjust is then target_avg / fallback_avg and its ascent/descent overrides are
target_metric / size-adjust (the override percentages are relative to the already size-adjusted font).
"""
import collections, glob, os, sys
from fontTools.ttLib import TTCollection, TTFont
from fontTools.varLib import instancer

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')
text = ''.join(open(f, encoding='utf-8', errors='ignore').read() for f in glob.glob(root + '/**/*.ts*', recursive=True))
hangul = collections.Counter(c for c in text if '가' <= c <= '힣')
latin = collections.Counter(c for c in text if c.isascii() and (c.isalnum() or c == ' '))

def load(spec):
    label, rest = spec.split('=', 1)
    wght = None
    if '@wght=' in rest:
        rest, w = rest.split('@wght=')
        wght = float(w)
    index = 0
    if '#' in rest:
        rest, i = rest.split('#')
        index = int(i)
    font = TTCollection(rest).fonts[index] if rest.endswith('.ttc') else TTFont(rest)
    if 'fvar' in font:
        font = instancer.instantiateVariableFont(font, {'wght': wght or 400})
    return label, font

def avg(font, counts):
    cmap, hmtx, upm = font.getBestCmap(), font['hmtx'], font['head'].unitsPerEm
    pairs = [(hmtx[cmap[ord(c)]][0], n) for c, n in counts.items() if ord(c) in cmap]
    return sum(a * n for a, n in pairs) / sum(n for _, n in pairs) / upm if pairs else float('nan')

for spec in sys.argv[1:]:
    label, font = load(spec)
    upm, hhea = font['head'].unitsPerEm, font['hhea']
    print(f"{label:14} ascent={hhea.ascent / upm:.4f} descent={-hhea.descent / upm:.4f} lineGap={hhea.lineGap / upm:.4f} "
          f"hangul_avg={avg(font, hangul):.4f} latin_avg={avg(font, latin):.4f}")
