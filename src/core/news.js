// Новости Minecraft из официальной ленты лаунчера Mojang.
const { fetchJson } = require('./net');

const BASE = 'https://launchercontent.mojang.com';
const abs = (u) => (!u ? null : u.startsWith('http') ? u : BASE + u);

async function getNews() {
  const [news, java, bedrock] = await Promise.allSettled([
    fetchJson(`${BASE}/v2/news.json`),
    fetchJson(`${BASE}/v2/javaPatchNotes.json`),
    fetchJson(`${BASE}/v2/bedrockPatchNotes.json`),
  ]);
  const items = [];

  if (news.status === 'fulfilled') {
    for (const n of news.value.entries || []) {
      items.push({
        id: `news-${n.id}`,
        kind: 'news',
        title: n.title,
        tag: n.tag || n.category,
        date: n.date,
        text: n.text,
        image: abs(n.newsPageImage?.url || n.playPageImage?.url),
        link: n.readMoreLink,
      });
    }
  }
  for (const [res, edition] of [[java, 'Java'], [bedrock, 'Bedrock']]) {
    if (res.status !== 'fulfilled') continue;
    for (const p of (res.value.entries || []).slice(0, 40)) {
      items.push({
        id: `${edition}-${p.id}`,
        kind: 'patch',
        title: p.title,
        tag: `${edition} · ${p.type === 'snapshot' || p.type === 'beta' || p.type === 'preview' ? 'Снапшот' : 'Обновление'}`,
        version: p.version,
        date: p.date,
        text: p.shortText,
        image: abs(p.image?.url),
        contentPath: p.contentPath,
      });
    }
  }
  if (!items.length) throw new Error('Не удалось загрузить новости. Проверьте интернет.');
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  return items.slice(0, 80);
}

async function getPatchBody(contentPath) {
  const data = await fetchJson(`${BASE}/v2/${contentPath}`);
  return data.body || '';
}

module.exports = { getNews, getPatchBody };
