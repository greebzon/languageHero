/* Every section of the interface texts. A new section is a file here plus a line below. */
import type { Locale } from '@lingvohero/contracts';
import type { Widen } from '../define';
import { friends } from './friends';
import { app } from './app';
import { audio } from './audio';
import { catalog } from './catalog';
import { common } from './common';
import { exercise } from './exercise';
import { course, home, words } from './home';
import { lesson } from './lesson';
import { languages, menu } from './nav';
import { profile } from './profile';
import { result } from './result';
import { rewards } from './rewards';
import { settings } from './settings';
import { shop } from './shop';
import { stats } from './stats';
import { wardrobe } from './wardrobe';
import { welcome } from './welcome';

const SECTIONS = {
  friends,
  app,
  audio,
  catalog,
  common,
  course,
  exercise,
  home,
  languages,
  lesson,
  menu,
  profile,
  result,
  rewards,
  settings,
  shop,
  stats,
  wardrobe,
  welcome,
  words,
};
type Sections = typeof SECTIONS;
/** The Russian dictionary: the source of every key. */
export type RuDictionary = { [K in keyof Sections]: Sections[K]['ru'] };
export type Dictionary = Widen<RuDictionary>;

function pick(locale: Locale): Dictionary {
  return Object.fromEntries(
    Object.entries(SECTIONS).map(([name, texts]) => [name, texts[locale]]),
  ) as Dictionary;
}
export const DICTIONARIES: Record<Locale, Dictionary> = {
  ru: pick('ru'),
  en: pick('en'),
  he: pick('he'),
};
