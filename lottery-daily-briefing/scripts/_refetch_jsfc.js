/**
 * 江苏福失败条目重抓（兜底）：details 中 province=江苏 且正文为抓取空壳（<210字且中文<20）的条目，
 * href 为 SPA 相对路径 /articles/{uuid}，拼接 base https://www.jslottery.com 后 Playwright+nativeFallback 重抓。
 * 结果更新回 _details_YYYYMMDD.json 原位。stdout 仅元数据。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const DATE = process.argv[2] || '20261020';
const WS = 'E:\\.workbuddy\\每日彩票新闻';
const DETAILS = `${WS}/_details_${DATE}.json`;
const BASE = 'https://www.jslottery.com';

function isGarbage(s) {
  if (!s || s.length <= 20) return true;
  if (/:hover/.test(s)) return true;
  if (/网站首页|客服热线|您所在的位置|首页\s*>>/.test(s)) return true;
  if (/\{\s*[^}]*(?:width|height|background|margin|padding|border|display|color)\b/.test(s)) return true;
  const cn = (s.match(/[一-鿿]/g) || []).length;
  return cn / s.length < 0.15;
}

async function nativeFallback(href) {
  try {
    const r = await fetch(href, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    const buf = Buffer.from(await r.arrayBuffer());
    let html = buf.toString('utf8');
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
               .replace(/<(nav|header|footer|aside)[\s\S]*?<\/(nav|header|footer|aside)>/gi, '');
    const divs = [...html.matchAll(/<div[^>]*class=["'][^"']*(?:content|article|news|detail|text|main|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)];
    let best = '', bestCn = 0;
    for (const m of divs) {
      const txt = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const cn = (txt.match(/[一-鿿]/g) || []).length;
      if (cn > bestCn) { bestCn = cn; best = txt; }
    }
    if (!best) best = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return best.slice(0, 2000);
  } catch (e) { return ''; }
}

(async () => {
  const det = JSON.parse(fs.readFileSync(DETAILS, 'utf8'));
  const arr = Array.isArray(det) ? det : (det.items || det.list || []);
  const targets = arr.filter(it => it.province === '江苏' && (() => { const c = it.content || ''; const cn = (c.match(/[一-鿿]/g) || []).length; return c.length < 210 && cn < 20; })());
  console.log(`江苏空壳待重抓: ${targets.length}`);

  const chromePaths = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'];
  let cf = null; for (const p of chromePaths) { if (p && fs.existsSync(p)) { cf = p; break; } }
  const browser = await chromium.launch({ headless: true, executablePath: cf || undefined });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0' });

  let ok = 0;
  for (const t of targets) {
    const url = t.href.startsWith('http') ? t.href : BASE + t.href;
    let content = '';
    try {
      await page.goto(url, { timeout: 30000, waitUntil: 'load' });
      await page.waitForTimeout(3000);
      content = await page.evaluate(() => {
        const root = document.querySelector('.article, .content, .detail, .TRS_Editor, #content, .newscon, .art_content, .main') || document.body;
        return (root.textContent || '').replace(/\s+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 2000);
      });
      if (isGarbage(content)) {
        const fb = await nativeFallback(url);
        if (fb && !isGarbage(fb)) { content = fb; console.error(`  [兜底] ${t.province} 原生fetch重抓成功`); }
      }
    } catch (e) { content = '[抓取失败:' + e.message + ']'; }
    if (!isGarbage(content)) { t.content = content; t.href = url; ok++; }
    console.error(`[重抓] ${t.province} ${String(t.title).slice(0, 22)} -> ${content.length}字 garbage=${isGarbage(content)}`);
  }
  await browser.close();
  fs.writeFileSync(DETAILS, JSON.stringify(arr, null, 2), 'utf8');
  console.log(`完成: ${ok}/${targets.length} 重抓成功，已写回 ${DETAILS}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
