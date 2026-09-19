"""Native smoke test. Targets only an emulator, never a connected phone."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--serial', default='emulator-5554')
parser.add_argument('--course', action='store_true')
args = parser.parse_args()
if not args.serial.startswith('emulator-'):
    raise SystemExit('This script only runs on an emulator.')
adb = Path(os.environ['ANDROID_HOME']) / 'platform-tools' / 'adb.exe'
root = Path(__file__).resolve().parents[1]
output = root / '.cache' / 'android-smoke'
output.mkdir(parents=True, exist_ok=True)

def run(*command):
    return subprocess.check_output([str(adb), '-s', args.serial, *command], timeout=20)

def nodes():
    run('shell', 'uiautomator', 'dump', '/sdcard/lingvohero-smoke.xml')
    return list(ET.fromstring(run('shell', 'cat', '/sdcard/lingvohero-smoke.xml')).iter('node'))

def find(label, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for node in nodes():
            if label in (node.get('text'), node.get('content-desc'), node.get('resource-id')):
                return node
        time.sleep(0.4)
    raise AssertionError('Not visible: ' + label)

def tap(label, snapshot=None):
    node = next((n for n in (snapshot or []) if label in (n.get('text'), n.get('content-desc'), n.get('resource-id'))), None)
    if node is None:
        node = find(label)
    coords = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
    assert len(coords) == 4, node.attrib
    run('shell', 'input', 'tap', str((coords[0] + coords[2]) // 2), str((coords[1] + coords[3]) // 2))
    time.sleep(0.1)

def screenshot(name):
    (output / name).write_bytes(run('exec-out', 'screencap', '-p'))

def open_lesson(title):
    label = 'Начать урок ' + title
    for _ in range(8):
        for node in nodes():
            if label == node.get('content-desc'):
                coords = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
                if len(coords) == 4 and coords[1] > 300 and coords[3] < 2100 and coords[3] - coords[1] > 80:
                    tap(label)
                    return
        run('shell', 'input', 'swipe', '900', '1850', '900', '800', '350')
    raise AssertionError('Lesson is not visible: ' + title)

run('reverse', 'tcp:8081', 'tcp:8081')
run('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:8081', '-p', 'host.exp.exponent')
# A child learning several languages picks one at every start; a new one picks the first.
deadline = time.monotonic() + 60
while time.monotonic() < deadline:
    labels = {(n.get('text'), n.get('resource-id')) for n in nodes()}
    if any(text == 'Сеты уроков' for text, _ in labels):
        break
    if any(rid == 'language-en' for _, rid in labels):
        screenshot('android-language.png')
        tap('language-en')
    time.sleep(0.5)
find('Сеты уроков', timeout=30)
screenshot('android-map.png')
seed = json.loads((root / 'content' / 'seed.json').read_text(encoding='utf-8'))
for lesson in seed['lessons'] if args.course else seed['lessons'][:1]:
    for _ in range(6):
        snapshot = nodes()
        if any(n.get('resource-id') == 'open-en-forest' for n in snapshot):
            tap('open-en-forest', snapshot)
            break
        run('shell', 'input', 'swipe', '900', '1850', '900', '800', '350')
    else:
        raise AssertionError('Forest set is not visible')
    open_lesson(lesson['title'])
    find('1 / ' + str(len(lesson['exercises'])))
    for exercise in lesson['exercises']:
        kind = exercise['type']
        snapshot = nodes()
        if kind == 'listen-and-select':
            tap('choice-' + exercise['wordId'], snapshot)
        elif kind == 'match-pairs':
            for word_id in exercise['wordIds']:
                tap('pair-word-' + word_id, snapshot)
                tap('pair-image-' + word_id, snapshot)
        else:
            word = next(w for w in lesson['words'] if w['id'] == exercise['wordId'])
            available = list(exercise['tiles'])
            for letter in word['spelling']:
                tile = next(t for t in available if t['letter'] == letter)
                available.remove(tile)
                tap('letter-' + tile['id'], snapshot)
        screenshot('android-' + kind + '.png')
        tap('check-answer', snapshot)
        find('Здорово! Получилось!')
        tap('next-question')
    find(lesson.get('presentation', {}).get('completionTitle', 'Ты — друг леса!'))
    screenshot('android-result.png')
    tap('back-to-map')
    run('shell', 'input', 'swipe', '950', '700', '950', '1900', '300')
    run('shell', 'input', 'swipe', '950', '700', '950', '1900', '300')
    print('Android completed: ' + lesson['id'], flush=True)
