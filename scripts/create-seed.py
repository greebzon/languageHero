"""Recreate the starter content from the project's existing, credited media."""
from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[1]
media_dir = root / 'content' / 'store' / 'media'
media_dir.mkdir(parents=True, exist_ok=True)

def media_path(source):
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    name = digest + source.suffix
    shutil.copyfile(source, media_dir / name)
    return '/v1/media/' + name

atlas = media_path(root / 'apps/mobile/assets/images/animals.png')
ids = ['fox', 'bear', 'rabbit', 'owl']
translations = ['Лиса', 'Медведь', 'Кролик', 'Сова']
words, media = [], []
for i, animal in enumerate(ids):
    words.append(dict(id=animal, text=('An ' if animal == 'owl' else 'A ') + animal, spelling=animal, translation=translations[i], imageId=animal+'-image', audioId=animal+'-audio'))
    media.append(dict(id=animal+'-image', kind='image', path=atlas, region=dict(columns=2, rows=2, column=i%2, row=i//2)))
    media.append(dict(id=animal+'-audio', kind='audio', path=media_path(root / ('apps/mobile/assets/audio/'+animal+'.wav'))))
hints = dict(fox='У этого зверька рыжая шубка и пушистый хвост.', bear='Большой лесной зверь с круглыми ушами.', rabbit='У этого зверька длинные ушки. Он умеет прыгать!', owl='Эта птица с большими глазами хорошо видит в темноте.')

def listen(animal, n):
    return dict(id=f'listen-{n}', type='listen-and-select', prompt='Послушай и найди зверька', hint=hints[animal], wordId=animal, choices=ids[n%4:]+ids[:n%4])

def match(selected, n):
    return dict(id=f'match-{n}', type='match-pairs', prompt='Найди пару каждому слову', hint='Нажми на слово слева, затем на его картинку справа. Можно поменять любую пару.', wordIds=selected, imageOrder=selected[1:]+selected[:1])

def spell(animal, n):
    letters = list(animal)
    order = list(range(len(letters)))[::-1]
    return dict(id=f'spell-{n}', type='build-word', prompt='Собери название зверька', hint='Слово пишется так: '+animal+'. Нажми на выбранную букву, чтобы вернуть её.', wordId=animal, tiles=[dict(id=f'tile-{i}', letter=letters[i]) for i in order])

def invitation(animal, n, order, extras, prompt):
    exercise = spell(animal, n)
    tiles = exercise['tiles']
    exercise['tiles'] = [next(t for t in tiles if t['id'] == f'tile-{i}') for i in order]
    exercise['tiles'] += [dict(id=f'extra-{i}', letter=letter) for i, letter in enumerate(extras)]
    exercise['prompt'] = prompt
    exercise['hint'] = f'На приглашении нужно написать {animal}. Не все буквы пригодятся. Нажми на выбранную букву, чтобы вернуть её.'
    return exercise

guest_list = match(['fox', 'owl', 'rabbit'], 0)
guest_list.update(prompt='Проверь список гостей', hint='В списке три гостя. Соедини каждое английское имя с его владельцем.', imageOrder=['rabbit', 'fox', 'owl'])
invitations = match(['bear', 'rabbit', 'owl', 'fox'], 3)
invitations.update(prompt='Раздай именные приглашения', hint='На приглашениях написаны английские имена. Найди владельца каждого приглашения.', imageOrder=['owl', 'fox', 'bear', 'rabbit'])
party = [
    guest_list,
    invitation('bear', 1, [2, 0, 3, 1], ['f', 'o'], 'Подпиши приглашение медведю'),
    invitation('rabbit', 2, [3, 0, 5, 1, 4, 2], ['o', 'w'], 'Пригласи кролика на праздник'),
    invitations,
    invitation('owl', 4, [1, 0, 2], ['a', 'r'], 'Подпиши приглашение сове'),
    invitation('fox', 5, [1, 0, 2], ['b', 'l'], 'Осталось пригласить лису!'),
]
definitions = [
    ('Лесные друзья', [listen(a,i) for i,a in enumerate(['fox','bear','rabbit','owl','bear','fox'])]),
    ('Кто спрятался?', [listen(a,i) for i,a in enumerate(['owl','rabbit','fox','bear'])]),
    ('Найди пары', [match(ids[:2],0), match(ids[1:],1), match(ids,2)]),
    ('Собери слова', [spell(a,i) for i,a in enumerate(ids)]),
    ('Праздник в лесу', party),
]
lessons = [dict(schemaVersion=2, id=f'en-animals-{i+1:02}', version=1, language='en', title=title, words=words, media=media, exercises=exercises) for i,(title,exercises) in enumerate(definitions)]
lessons[4]['version'] = 2
lessons[4]['presentation'] = dict(intro='Помоги Тиму устроить праздник: проверь гостей и подпиши приглашения!', completionTitle='Праздник удался!', completionMessage='Все приглашения подписаны, и лесные друзья собрались вместе. Ты помог Тиму устроить праздник!')
catalog = dict(schemaVersion=2, revision=4, languages=[dict(code='en', title='Английский', direction='ltr')], courses=[dict(id='en-forest', language='en', title='Загадочный лес', lessons=[dict(id=l['id'],version=l['version'], title=l['title'], exerciseCount=len(l['exercises']), requiredTypes=list(dict.fromkeys(e['type'] for e in l['exercises']))) for l in lessons])])
catalog['courses'][0]['description'] = 'Слушаем, играем и учим слова'
catalog['courses'][0]['cover'] = dict(id='forest-cover', kind='image', path=media_path(root/'apps/mobile/assets/images/worlds/forest.png'))
catalog['previews'] = [
    dict(id='en-underwater', language='en', title='Подводный мир: Морские обитатели', description='Глубоководные тайны и новые слова', cover=dict(id='underwater-cover', kind='image', path=media_path(root/'apps/mobile/assets/images/worlds/underwater.png'))),
    dict(id='en-space', language='en', title='Космос: Планеты и звёзды', description='Галактические приключения на английском', cover=dict(id='space-cover', kind='image', path=media_path(root/'apps/mobile/assets/images/worlds/space.png'))),
]
(root/'content/seed.json').write_text(json.dumps(dict(catalog=catalog, lessons=lessons),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Created content/seed.json and content-addressed media. Publish with pnpm content:publish content/seed.json.')
