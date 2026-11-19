// Фильтр мата: проверяет каждое слово целиком — ловит корни с приставками
// («нахуй», «заебал», «долбоёб»), но не трогает обычные слова («хулиган», «хлебать», «требовать»).

// Латинские буквы, похожие на русские (обход «xyй», «пuзда»)
const LOOKALIKE = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в', u: 'и', '3': 'з', '0': 'о', '6': 'б' };
const PREFIX = '(?:на|по|за|от|ото|у|вы|до|при|раз|рас|об|обо|пере|недо|съ|въ|из|ис|изъ|про|под|подъ|о|в|вз|воз|с|долбо|мудо|разъ)?';

const RU_ROOTS = [
  /ху[йеёяюи]/, // хуй, нахуй, хуёвый, хуйня, хуило
  /пизд/, /пезд/,
  new RegExp(`^${PREFIX}[её]б(?:а|ан|ат|ал|ля|ли|уч|ыв|ись|ет|ёт|ут|у|н|л|о|$)`), // ебать, заебал, уёбок, выебываться
  /[её]бл[ао]н/, /^бля/, /^су[кч](?:а|и|у|ой|ам|ами|ах|ин|ка|ки|ке|ару|ары)$/, /пид[оа]?р/,
  /^муда[кч]/, /^мудил/, /^мудо/, /залуп/, /гандон/, /шлюх/, /^манд[аеуы]/, /дроч/,
];
const RU_ALLOW = [/страху/, /^хул[иа]г/, /^худ/, /^хутор/, /^психу/, /^тихую/, /^блю/, /^сукно/, /^сукр/, /^мудр/];
const EN_ROOTS = [/fuck/, /shit/, /bitch/, /cunt/, /nigg/, /whore/, /dick/, /pussy/];

function normalize(word) {
  const w = word.toLowerCase().replace(/ё/g, 'е');
  if (!/[а-я]/.test(w)) return { ru: null, en: w };
  return { ru: [...w].map((c) => LOOKALIKE[c] || c).join(''), en: null };
}

function isBadWord(word) {
  const { ru, en } = normalize(word);
  if (en) return EN_ROOTS.some((r) => r.test(en));
  if (RU_ALLOW.some((r) => r.test(ru))) return false;
  return RU_ROOTS.some((r) => r.test(ru));
}

const WORD = /[\p{L}\p{N}]+/gu;
/** Заменяет плохие слова звёздочками */
function censor(text) {
  return String(text).replace(WORD, (w) => (isBadWord(w) ? '*'.repeat(w.length) : w));
}
/** Есть ли в тексте мат */
function hasProfanity(text) {
  return (String(text).match(WORD) || []).some(isBadWord);
}

module.exports = { censor, hasProfanity, isBadWord };
