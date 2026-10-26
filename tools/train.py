"""Train the on-phone tile reader from the saved, player-confirmed photos.

    pip install ultralytics onnx onnxruntime pillow
    node tools/export-training.mjs data/raw          # download photos + confirmed numbers
    python tools/train.py data/raw                   # build dataset, train, test, export model/

What it learns: every tile END as an object whose class is its value (0..max). Each confirmed tile
box is split in half along its long side; ends[0] is the top half (upright tile) or left half
(sideways tile), which is the order the AI reader is asked to use. Near-square boxes (diagonal
tiles) are left out of training because their halves can't be told apart from the box alone.

After training it checks the held-out photos the way the phone will use the model: a photo counts
only if every end is found, paired and above the score bar. It picks the lowest bar that keeps
those photos >= 99% right, writes model/reader.onnx + model/meta.json, and starts in "shadow" mode
(the phone reads, the AI still decides, and the two are compared). Switch meta.json "mode" to "on"
once the shadow results agree.
"""
import json, random, shutil, sys
from pathlib import Path

RAW = Path(sys.argv[1] if len(sys.argv) > 1 else 'data/raw')
WORK = Path('data/yolo')
MODEL_DIR = Path('model')
MAX_VALUE = 18                      # double-18 is the largest common set
CLASSES = list(range(MAX_VALUE + 1))
SEED = 7


def halves(box, ends):
    """Split a tile box [l,t,r,b] (0..1) into two end boxes, ordered like ends."""
    l, t, r, b = box
    w, h = r - l, b - t
    if w <= 0 or h <= 0 or 0.75 < w / h < 1.33:
        return None
    if w > h:
        m = (l + r) / 2
        return [((l, t, m, b), ends[0]), ((m, t, r, b), ends[1])]
    m = (t + b) / 2
    return [((l, t, r, m), ends[0]), ((l, m, r, b), ends[1])]


def load():
    items = []
    for js in sorted(RAW.glob('*.json')):
        img = js.with_suffix('.jpg')
        if not img.exists():
            continue
        rec = json.loads(js.read_text())
        labels = []
        for tile in rec.get('tiles', []):
            if not tile.get('box') or any(v > MAX_VALUE for v in tile['ends']):
                continue
            hv = halves(tile['box'], tile['ends'])
            if hv:
                labels += hv
        items.append((img, rec, labels))
    return items


def write_dataset(items):
    if WORK.exists():
        shutil.rmtree(WORK)
    random.Random(SEED).shuffle(items)
    cut = max(1, int(len(items) * 0.15))
    split = {'val': items[:cut], 'train': items[cut:]}
    for name, part in split.items():
        (WORK / 'images' / name).mkdir(parents=True)
        (WORK / 'labels' / name).mkdir(parents=True)
        for img, _, labels in part:
            shutil.copy(img, WORK / 'images' / name / img.name)
            lines = [f'{v} {(l + r) / 2:.6f} {(t + b) / 2:.6f} {r - l:.6f} {b - t:.6f}' for (l, t, r, b), v in labels]
            (WORK / 'labels' / name / img.with_suffix('.txt').name).write_text('\n'.join(lines))
    (WORK / 'data.yaml').write_text(
        f'path: {WORK.resolve()}\ntrain: images/train\nval: images/val\nnames: {json.dumps({c: str(c) for c in CLASSES})}\n')
    return split


def pair(ends):
    """Same pairing as localreader.js: mutual nearest neighbours within 1.6x end size."""
    c = lambda e: ((e[0] + e[2]) / 2, (e[1] + e[3]) / 2)
    size = lambda e: max(e[2] - e[0], e[3] - e[1])
    near = []
    for i, e in enumerate(ends):
        best, d = -1, float('inf')
        for j, f in enumerate(ends):
            if i == j:
                continue
            (ax, ay), (bx, by) = c(e), c(f)
            dd = ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5
            if dd < d:
                best, d = j, dd
        near.append((best, d))
    tiles, used = [], set()
    for i, e in enumerate(ends):
        j, d = near[i]
        if i in used or j < 0 or near[j][0] != i or d > 1.6 * max(size(e), size(ends[j])):
            continue
        used |= {i, j}
        tiles.append((sorted([e[4], ends[j][4]]), min(e[5], ends[j][5])))
    return tiles, len(ends) - len(used)


def evaluate(model, val):
    """Per held-out photo: phone answer (score of weakest end) vs the confirmed tiles."""
    rows = []
    for img, rec, _ in val:
        res = model.predict(str(img), imgsz=640, conf=0.25, iou=0.5, verbose=False)[0]
        ends = [(*b.xyxy[0].tolist(), int(b.cls), float(b.conf)) for b in res.boxes]
        tiles, loose = pair(ends)
        truth = sorted(sorted(t['ends']) for t in rec['tiles'])
        got = sorted(t for t, _ in tiles)
        weakest = min((s for _, s in tiles), default=0.0)
        rows.append({'ok': got == truth, 'complete': loose == 0 and bool(tiles), 'weakest': weakest})
    return rows


def pick_bar(rows, target=0.99):
    for bar in [x / 100 for x in range(50, 100)]:
        used = [r for r in rows if r['complete'] and r['weakest'] >= bar]
        if used and sum(r['ok'] for r in used) / len(used) >= target:
            return bar, len(used) / len(rows), sum(r['ok'] for r in used) / len(used)
    return None, 0.0, 0.0


def main():
    items = load()
    print(f'{len(items)} confirmed photos, {sum(len(l) for *_, l in items)} labelled ends')
    if len(items) < 100:
        print('Not enough yet: aim for 300+ photos (3-5 game nights). Nothing trained.')
        return
    split = write_dataset(items)
    from ultralytics import YOLO
    model = YOLO('yolov8n.pt')
    model.train(data=str(WORK / 'data.yaml'), imgsz=640, epochs=120, batch=16, seed=SEED,
                degrees=180, flipud=0.0, fliplr=0.0, hsv_v=0.4, mosaic=1.0, patience=30, project='data/runs', name='reader', exist_ok=True)
    best = YOLO('data/runs/reader/weights/best.pt')
    bar, coverage, precision = pick_bar(evaluate(best, split['val']))
    if bar is None:
        print('Held-out photos are not reliable enough at any score bar. Keep collecting; model not exported.')
        return
    onnx = Path(best.export(format='onnx', imgsz=640, opset=12, simplify=True))
    MODEL_DIR.mkdir(exist_ok=True)
    shutil.copy(onnx, MODEL_DIR / 'reader.onnx')
    meta = {'file': 'reader.onnx', 'input': 640, 'classes': CLASSES, 'minScore': bar, 'mode': 'shadow',
            'trainedOn': len(split['train']), 'heldOut': len(split['val']),
            'heldOutCoverage': round(coverage, 3), 'heldOutPrecision': round(precision, 3)}
    (MODEL_DIR / 'meta.json').write_text(json.dumps(meta, indent=2) + '\n')
    print(f'Phone answers {coverage:.0%} of held-out photos on its own at {precision:.1%} accuracy (bar {bar}).')
    print('Wrote model/reader.onnx and model/meta.json (mode "shadow"). Commit them to ship.')


if __name__ == '__main__':
    main()
