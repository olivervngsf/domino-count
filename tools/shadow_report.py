"""How often does the on-phone reader match what players confirmed?   python tools/shadow_report.py data/raw

Uses the saves made while model/meta.json is in "shadow" mode (the phone reads, the AI decides).
Switch meta.json "mode" to "on" when, over a few game nights, the phone's confident answers are
right ~99% of the time. Photos the phone wasn't sure about go to the AI either way.
"""
import json, sys
from pathlib import Path

rows = [json.loads(p.read_text()) for p in Path(sys.argv[1] if len(sys.argv) > 1 else 'data/raw').glob('*.json')]
rows = [r for r in rows if r.get('phone')]
if not rows:
    sys.exit('No shadow-mode saves yet.')
conf = [r for r in rows if r['phone']['confident']]
match = lambda r: sorted(sorted(t) for t in r['phone']['tiles']) == sorted(sorted(t['ends']) for t in r['tiles'])
ok = sum(match(r) for r in conf)
print(f'{len(rows)} photos read by the phone; it was sure on {len(conf)} ({len(conf) / len(rows):.0%}).')
if conf:
    print(f'When sure, it matched the confirmed numbers {ok}/{len(conf)} = {ok / len(conf):.1%}.')
    print('Ready to switch to "on".' if len(conf) >= 100 and ok / len(conf) >= 0.99 else 'Keep in shadow mode for now.')
