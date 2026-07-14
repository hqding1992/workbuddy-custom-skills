/**
 * fetch_details.js —— 文章详情页深抓器（Playwright 版，用于 http-only / JS渲染站）
 *
 * 解决的问题：
 *   - web_fetch 工具会自动把 http 升级 https，对 http-only 站（如山东体彩 sdticai.com）直连必败；
 *   - fetch_news.js 是"列表提取器"，不抓详情页正文。
 *   本脚本用 Playwright 直接抓详情页正文（支持 http/https），供 Step 4 深取结构化字段。
 *
 * 用法（在 scripts/ 目录下执行）：
 *   node fetch_details.js <input_urls.json> [output.json]
 *   - input_urls.json : JSON 数组，元素为详情页 URL 字符串
 *   - output.json     : 输出路径（默认 stdout）。建议用 ../_details_YYYYMMDD.json
 * 例：
 *   cd scripts && node fetch_details.js ../_sd_urls.json ../_details_20260714.json
 *
 * 退避策略：单页 goto 失败自动重试 1 次（换 waitUntil=domcontentloaded）；整体不做长 sleep，
 *           避免拖慢（对应"太慢"问题修复：深抓用并发+退避，不固定 sleep 20）。
 */
const { chromium } = require('playwright');
const fs = require('fs');

function resolve(p) {
  // Git Bash 传 /e/... 会被 Windows Node 误解为 E:\e\...，统一转成 E:/... 绝对路径
  if (p && p.startsWith('/') && /^\/[a-zA-Z]\//.test(p)) {
    return p.replace(/^\/([a-zA-Z])\//, '$1:/');
  }
  return p;
}

async function main() {
  const inFile = resolve(process.argv[2]);
  const outFile = process.argv[3] ? resolve(process.argv[3]) : null;
  if (!inFile) { console.error('Usage: node fetch_details.js <input_urls.json> [output.json]'); process.exit(1); }
  const urls = JSON.parse(fs.readFileSync(inFile, 'utf-8'));
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  let chromeFound = null;
  for (const p of chromePaths) { if (p && fs.existsSync(p)) { chromeFound = p; break; } }
  const browser = await chromium.launch({ headless: true, executablePath: chromeFound || undefined });
  const out = [];
  for (const url of urls) {
    let page;
    let ok = false;
    for (const waitUntil of ['load', 'domcontentloaded']) {
      try {
        page = await browser.newPage();
        await page.goto(url, { timeout: 60000, waitUntil });
        await page.waitForTimeout(2500);
        const data = await page.evaluate(() => {
          const title = document.title;
          const sels = ['.article-content','.content','#content','.TRS_Editor','.news-content','.article','.detail-content','.text','.article-text','.news-text','.article-body','.entry-content'];
          let body = '';
          for (const s of sels) { const el = document.querySelector(s); if (el && el.innerText.trim()) { body = el.innerText; break; } }
          if (!body) { const ps = Array.from(document.querySelectorAll('p')).map(p => p.innerText.trim()).filter(t => t.length > 5); body = ps.join('\n'); }
          return { title: title.trim(), body: (body || '').slice(0, 4000) };
        });
        out.push({ url, ...data });
        ok = true;
        break;
      } catch (e) {
        if (page) { try { await page.close(); } catch (_) {} page = null; }
        if (waitUntil === 'domcontentloaded') out.push({ url, error: e.message });
      }
    }
    if (page) { try { await page.close(); } catch (_) {} }
  }
  await browser.close();
  const json = JSON.stringify(out, null, 2);
  if (outFile) fs.writeFileSync(outFile, json, 'utf-8');
  else console.log(json);
}
main();
