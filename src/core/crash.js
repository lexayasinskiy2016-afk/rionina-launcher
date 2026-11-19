// Разбор вылета Minecraft: по журналу находим причину и предлагаем, как починить.
// Если подключена нейросеть (ключ Gemini), она дополнительно объясняет простыми словами.

/** Возвращает { title, explain, fixes: [{ type, label, ... }], details } */
function analyze(log) {
  const text = String(log || '');
  const fixes = [];
  const hit = (title, explain, more = []) => ({ title, explain, fixes: [...more, ...fixes], details: lastError(text) });

  if (/java\.lang\.OutOfMemoryError/.test(text)) {
    return hit('Игре не хватило памяти', 'Minecraft заполнил всю выделенную память и закрылся. Так бывает с модами и шейдерами.', [{ type: 'memory', label: 'Дать игре больше памяти' }]);
  }
  if (/Could not reserve enough space for object heap|Invalid maximum heap size|Could not create the Java Virtual Machine/.test(text)) {
    return hit('Слишком много памяти для этого компьютера', 'Игре выделено больше памяти, чем компьютер может дать прямо сейчас.', [{ type: 'memory-down', label: 'Уменьшить память до 4 ГБ' }]);
  }
  // Fabric: не хватает зависимости
  const fabricDep = text.match(/Mod '([^']+)' \(([\w.-]+)\) [^\s]+ requires (?:version [^\s]+ (?:or later )?of |any version of |)'?([\w.-]+)'?[^\n]*?(?:which is missing|, which is missing)/);
  if (fabricDep) {
    const [, modName, , dep] = fabricDep;
    return hit(`Моду «${modName}» не хватает «${dep}»`, `Мод «${modName}» не работает без мода «${dep}», а его нет в сборке.`,
      [{ type: 'install-mod', slug: dep, label: `Установить ${dep}` }]);
  }
  // Forge/NeoForge: не хватает зависимости
  const forgeDep = text.match(/Mod ID: '([\w.-]+)', Requested by: '([\w.-]+)'/);
  if (forgeDep) {
    const [, dep, by] = forgeDep;
    return hit(`Моду «${by}» не хватает «${dep}»`, `Мод «${by}» требует мод «${dep}», а его нет в сборке.`, [{ type: 'install-mod', slug: dep, label: `Установить ${dep}` }]);
  }
  // Несовместимые моды
  const incompat = text.match(/Mod '([^']+)' \(([\w.-]+)\)[^\n]*?is incompatible with[^\n]*?'?([\w.-]+)'?/) || text.match(/Incompatible mods? found![\s\S]{0,400}?Mod '([^']+)' \(([\w.-]+)\)/);
  if (incompat) {
    const [, modName, modId] = incompat;
    return hit('Моды не подходят друг к другу', `Мод «${modName}» конфликтует с другим модом или с этой версией Minecraft.`, [{ type: 'disable-mod', modId, label: `Выключить ${modName}` }]);
  }
  if (/Found duplicate mods|DuplicateModsFoundException|Duplicate mods? found/i.test(text)) {
    return hit('Один мод установлен дважды', 'В папке модов лежат две версии одного и того же мода. Удалите одну из них во вкладке «Моды» → «Установлено».');
  }
  if (/UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime/.test(text)) {
    const m = text.match(/(?:mods\/|mod )([\w.-]+\.jar)/);
    return hit('Мод сделан для другой версии игры', `Какой-то мод${m ? ` (${m[1]})` : ''} собран для более новой Minecraft и не работает в этой версии. Поставьте мод для своей версии или смените версию игры.`);
  }
  const mixin = text.match(/Mixin apply (?:for mod |failed for )([\w.-]+)/i) || text.match(/from mod ([\w.-]+)[^\n]*\n[^\n]*(?:MixinApplyError|InvalidMixinException)/i);
  if (mixin) {
    return hit(`Мод «${mixin[1]}» сломал игру`, `Мод «${mixin[1]}» не смог встроиться в Minecraft — скорее всего, он для другой версии игры или конфликтует с другим модом.`,
      [{ type: 'disable-mod', modId: mixin[1], label: `Выключить ${mixin[1]}` }]);
  }
  if (/GLFW error 65542|WGL: The driver does not appear to support OpenGL|Pixel format not accelerated|OpenGL 3\.2 core profile/i.test(text)) {
    return hit('Проблема с видеодрайвером', 'Видеокарта не поддерживает нужный OpenGL или устарел драйвер. Обновите драйвер видеокарты с сайта NVIDIA, AMD или Intel.');
  }
  if (/ClassNotFoundException: net\.minecraft|Could not find or load main class|NoClassDefFoundError: net\/minecraft/.test(text)) {
    return hit('Файлы игры повреждены', 'Часть файлов этой версии не скачалась или испорчена.', [{ type: 'reinstall', label: 'Переустановить версию' }]);
  }
  return hit('Игра неожиданно закрылась', 'Точную причину найти не удалось. Нейросеть может прочитать журнал и объяснить, что случилось.');
}

/** Последняя понятная строка ошибки — для подсказки и нейросети */
function lastError(text) {
  const lines = text.split(/\r?\n/);
  const idx = [...lines.keys()].reverse().find((i) => /(Exception|Error|Caused by|FATAL)/.test(lines[i]));
  return idx == null ? '' : lines.slice(Math.max(0, idx - 2), idx + 6).join('\n').slice(0, 1500);
}

/** Объяснение нейросетью (Gemini). Возвращает { title, explain, steps } */
async function explainWithAI(key, log, context) {
  const tail = String(log).split(/\r?\n/).slice(-150).join('\n').slice(-12000);
  const ask = `Ты — помощник лаунчера Minecraft. Игра вылетела. ${context}
Вот конец журнала игры:
\`\`\`
${tail}
\`\`\`
Объясни игроку 10–14 лет по-русски, простыми словами: что случилось и как починить. Верни ТОЛЬКО JSON:
{"title":"коротко, что случилось","explain":"1–3 предложения","steps":["шаг 1","шаг 2"]}`;
  for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: ask }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } }),
      signal: AbortSignal.timeout(60000),
    }).catch(() => null);
    if (!res) continue;
    if (res.status === 429) throw new Error('Лимит бесплатного ключа на сегодня исчерпан');
    if (!res.ok) continue;
    const data = await res.json();
    const out = JSON.parse(data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
    return { title: String(out.title || '').slice(0, 80), explain: String(out.explain || '').slice(0, 500), steps: (out.steps || []).map(String).slice(0, 6) };
  }
  throw new Error('Нейросеть не ответила');
}

module.exports = { analyze, explainWithAI };
