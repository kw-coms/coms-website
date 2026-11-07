#!/usr/bin/env python3
"""Measures the numbers behind src/styles/font-fallback.css (dev-time only; needs `pip install fonttools brotli`).

  python3 scripts/measure-font-fallback.py Pretendard=PretendardVariable.ttf@wght=400 Malgun=malgun.ttf WQY=wqy-zenhei.ttc#0

Argument form: label=path[#ttc-index][@wght=N]. For every font it prints the unit-less hhea ascent/descent/lineGap and the
average advance of the Hangul syllables, of the Latin letters/digits, and of the spaces and punctuation ' .,:;!' that occur in the user-visible strings of
src/**/*.ts(x) (string literals and JSX text with Hangul, or prose of several words), weighted by how often each occurs. A fallback's size-adjust is then target_avg / fallback_avg and its ascent/descent overrides are
target_metric / size-adjust (the override percentages are relative to the already size-adjusted font).
"""
import collections, glob, os, re, sys
from fontTools.ttLib import TTCollection, TTFont
from fontTools.varLib import instancer

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')
source = ''.join(open(f, encoding='utf-8', errors='ignore').read() for f in glob.glob(root + '/**/*.ts*', recursive=True))
# What a reader sees, not what is typed: string literals and JSX text that contain Hangul or are prose (several words, letters
# and spaces only - this drops identifiers, class names, paths and import specifiers). Latin counts come from those only.
literal = re.compile(r"""'([^'\\\n]{2,})'|"([^"\\\n]{2,})"|`([^`\\]{2,})`|>([^<>{}\n]{2,})<""")
prose = re.compile(r"^[A-Za-z0-9 ,.'’!?()&+·-]+$")
visible = []
for m in literal.finditer(source):
    t = next(g for g in m.groups() if g is not None).strip()
    if re.search('[\uac00-\ud7a3]', t) or (' ' in t and prose.match(t)):
        visible.append(t)
text = '\n'.join(visible)
hangul = collections.Counter(c for c in text if '\uac00' <= c <= '\ud7a3')
SPACING = ' .,:;!'  # one third of every Korean sentence; Arial sets these ~9% wider than Pretendard, so they get their own face
latin = collections.Counter(c for c in text if c.isascii() and (c.isalnum() or c in SPACING) and c not in SPACING)
spacing = collections.Counter(c for c in text if c in SPACING)
print(f"corpus: {sum(hangul.values())} Hangul syllables, {sum(latin.values())} Latin letters/digits/spaces in {len(visible)} visible strings")

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
          f"hangul_avg={avg(font, hangul):.4f} latin_avg={avg(font, latin):.4f} spacing_avg={avg(font, spacing):.4f}")
