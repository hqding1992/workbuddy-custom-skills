/**
 * 中奖条目补抓（兜底用）：主任务 deepdive 未覆盖 win 类（classify 返回 other）。
 * 从 _collect_YYYYMMDD.jsonl 筛出中奖条目，Playwright+nativeFallback 下钻详情，
 * 落盘 _wins_YYYYMMDD.json。stdout 仅输出元数据，正文不打印。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DATE = process.argv[2] || '20261020';
const WORKSPACE = 'E:\\.workbuddy\\每日彩票新闻';
const COLLECT = path.join(WORKSPACE, `_collect_${DATE}.jsonl`);
const OUT = path.join(WORKSPACE, `_wins_${DATE}.json`);

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
    const ct = r.headers.get('content-type') || '';
    let html = buf.toString('utf8');
    const meta = html.match(/<meta[^>]+charset=["']?\s*([\w\-]+)/i);
    const cs = (meta && meta[1] || (ct.match(/charset=([\w\-]+)/i) || [])[1] || 'utf-8').toLowerCase();
    if (cs.includes('gbk') || cs.includes('gb2312')) {
      try { html = new TextDecoder('gbk').decode(buf); } catch (e) {}
    } else if ((html.match(/�/g) || []).length > 5) {
      try { html = new TextDecoder('gbk').decode(buf); } catch (e) {}
    }
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
  const lines = fs.readFileSync(COLLECT, 'utf8').trim().split('\n').filter(Boolean);
  const items = lines.map(l => JSON.parse(l));
  const seen = new Set();
  const targets = [];
  for (const it of items) {
    if (!/中奖|一等奖/.test(it.title || '')) continue;
    if (/销售情况|统计|分析/.test(it.title || '')) continue;
    if (!it.href || seen.has(it.href)) continue;
    seen.add(it.href);
    targets.push(it);
  }
  console.log(`中奖目标: ${targets.length}`);

  const chromePaths = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'];
  let cf = null; for (const p of chromePaths) { if (p && fs.existsSync(p)) { cf = p; break; } }
  const browser = await chromium.launch({ headless: true, executablePath: cf || undefined });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0' });

  const wins = [];
  for (const t of targets) {
    let content = '';
    try {
      await page.goto(t.href, { timeout: 30000, waitUntil: 'load' });
      await page.waitForTimeout(2500);
      content = await page.evaluate(() => {
        const root = document.querySelector('.article, .content, .detail, .TRS_Editor, #content, .newscon, .art_content, .main') || document.body;
        return (root.textContent || '').replace(/\s+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 2000);
      });
      if (isGarbage(content)) {
        const fb = await nativeFallback(t.href);
        if (fb && !isGarbage(fb)) { content = fb; console.error(`  [兜底] ${t.province} 原生fetch重抓成功 ${fb.length}字`); }
      }
    } catch (e) { content = '[抓取失败:' + e.message + ']'; }
    wins.push({ key: t.key, province: t.province, type: t.type, cls: 'win', title: t.title, date: t.date, href: t.href, content });
    console.error(`[中奖深抓] ${t.province} ${String(t.title).slice(0, 24)} -> ${content.length}字`);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(wins, null, 2), 'utf8');
  console.log(`落盘: ${OUT} (${wins.length}条)`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
