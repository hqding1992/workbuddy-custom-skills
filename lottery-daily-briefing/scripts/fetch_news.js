/**
 * Playwright JS渲染页面抓取 + 新闻提取脚本
 * 用法: node fetch_news.js <url> [wait_until] [wait_ms] [goto_timeout_ms]
 * 在浏览器中执行JS提取新闻标题/日期/链接
 */
const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const url = process.argv[2];
  const waitUntil = process.argv[3] || 'load';
  const waitMs = parseInt(process.argv[4]) || 3000;
  const gotoTimeout = parseInt(process.argv[5]) || 30000; // 🆕 v2.1.8：可覆盖导航超时（http-only 慢站如河南福彩用 60000）

  if (!url) {
    console.error('Usage: node fetch_news.js <url> [wait_until] [wait_ms]');
    process.exit(1);
  }

  // Try system Chrome first
  let browser;
  // 🆕 v2.1.7: 单站抓取硬超时兜底（防止某 SPA/http 站点卡死拖垮整批 9 站串行）
  const HARD_TIMEOUT_MS = 90000;
  const hardTimer = setTimeout(async () => {
    console.error(`[TIMEOUT] 单站抓取超过 ${HARD_TIMEOUT_MS}ms，强制跳过: ${process.argv[2] || ''}`);
    try { if (browser) await browser.close(); } catch (e) {}
    console.log(JSON.stringify({ url: process.argv[2] || '', error: 'HARD_TIMEOUT', newsCount: 0, news: [] }));
    process.exit(7);
  }, HARD_TIMEOUT_MS);
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  let chromeFound = null;
  for (const p of chromePaths) {
    if (p && fs.existsSync(p)) { chromeFound = p; break; }
  }

  if (chromeFound) {
    console.error(`Using system Chrome: ${chromeFound}`);
    browser = await chromium.launch({ headless: true, executablePath: chromeFound });
  } else {
    console.error('Using Playwright bundled Chromium');
    browser = await chromium.launch({ headless: true });
  }

  const page = await browser.newPage();

  try {
    console.error(`Navigating to: ${url}`);
    await page.goto(url, { timeout: gotoTimeout, waitUntil });
    await page.waitForTimeout(waitMs);

    // Extract news items from the page using in-browser JS
    const newsItems = await page.evaluate(() => {
      const results = [];
      const datePattern = /\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}/;
      const skipTexts = ['首页', '更多', '下一页', '上一页', '尾页', '联系我们', '关于我们', '搜索', '登录'];
      const timeOnlyPattern = /^\d{1,2}:\d{2}:\d{2}$/;
      
      // Strategy 1: 通用新闻列表（传统<a>标签 + 老ASP表格行 + SPA渲染的<a>）
      // 文章详情页 href 模式（含老ASP的 /view\d+、.shtml、.asp、?id= 等）
      const hrefPattern = /show-\d+|detail[/-]\d+|news[/-]\d+|article[/-]\d+|\/\d+\.html|\.shtml|\.asp\b|\?id=\d+|\/view\d+|#\/article|#\/news|#.*channel|\.html/i;
      // 统一日期格式：2026/06/11、2026.06.11、2026年06月11日 → 2026-06-11
      const normalizeDate = (d) => {
        if (!d) return d;
        return d.replace(/年|月/g, '-').replace(/日/g, '').replace(/[\/.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      };
      // 文本提取（含 img src，贵州 CMS 日期藏在图片路径 2026/06/11）
      const elText = (el) => {
        if (!el) return '';
        let t = el.textContent || '';
        if (el.querySelectorAll) el.querySelectorAll('img[src]').forEach(img => { t += ' ' + (img.getAttribute('src') || ''); });
        return t;
      };
      const links = document.querySelectorAll('a[href]');
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const rawText = a.textContent?.trim() || '';
        // 清洗标题：去 "· " 前缀、换行、多余空白（青海等站）
        const title = (a.getAttribute('title') || rawText).replace(/^[\s·•\-–—]*[·•]?\s*/, '').replace(/\s+/g, ' ').trim();

        if (title.length < 4 || title.length > 100) continue;
        if (skipTexts.some(s => title === s) || timeOnlyPattern.test(title)) continue;
        if (/\/index\.\w+$/i.test(href)) continue; // 排除栏目首页（如 tcxwpd/index.html）
        if (!hrefPattern.test(href)) continue;

        let date = '';
        const parent = a.closest('li') || a.closest('tr') || a.closest('div') || a.parentElement;
        const rowEl = a.closest('tr') || a.closest('li') || (parent && parent.parentElement) || parent;
        const candidates = [parent, rowEl, parent && parent.parentElement].filter(Boolean);
        // 1) 容器内日期元素（span/.date/.time/em/td/.sd_date，覆盖表格行兄弟td）
        for (const el of candidates) {
          const dEl = el.querySelector('.sd_date, span, .date, .time, em, td');
          if (dEl) { const m = elText(dEl).match(datePattern); if (m) { date = normalizeDate(m[0]); break; } }
        }
        // 2) 容器文本兜底（含 img src，整行/父级文本含日期）
        if (!date) { for (const el of candidates) { const m = elText(el).match(datePattern); if (m) { date = normalizeDate(m[0]); break; } } }
        // 3) 标题文本兜底（广西: 标题内 "(2026-06-11)"）
        if (!date) { const m = title.match(datePattern); if (m) date = normalizeDate(m[0]); }

        let fullHref = href;
        try { fullHref = new URL(href, location.href).href; } catch (e) {}
        results.push({ title, href: fullHref, date, text: title });
      }
      
      // Strategy 2: Look for list items with dates
      if (results.length < 3) {
        const lis = document.querySelectorAll('li');
        for (const li of lis) {
          const a = li.querySelector('a');
          const dateSpan = li.querySelector('span, .date, .time, em');
          if (a && dateSpan) {
            const text = a.textContent?.trim() || '';
            const dateMatch = dateSpan.textContent?.match(datePattern);
            if (text.length > 4 && dateMatch) {
              results.push({ 
                title: text, 
                href: a.getAttribute('href') || '', 
                date: dateMatch[0],
                text 
              });
            }
          }
        }
      }
      
      // Strategy 3: Vue/React SPA — extract from data-v-* components (no <a> tags)
      // Find subtitle/headline spans and date-containing elements
      if (results.length < 3) {
        // Subtitle items (carousel/slider news)
        const subtitleItems = document.querySelectorAll('.subtitle_item span, .headline');
        for (const el of subtitleItems) {
          const text = el.textContent?.trim() || '';
          if (text.length > 6 && text.length < 100 && !skipTexts.some(s => text === s) && !timeOnlyPattern.test(text)) {
            let date = '';
            const parent = el.closest('div[class]');
            if (parent) {
              const allText = parent.textContent || '';
              const dateMatch = allText.match(datePattern);
              if (dateMatch) date = dateMatch[0];
            }
            results.push({ title: text, href: '', date, source: 'spa-subtitle' });
          }
        }
        
        // Data-v-* elements containing both title and date
        const vueEls = document.querySelectorAll('[data-v-4ed53a84], [data-v-]');
        for (const el of vueEls) {
          const text = el.textContent?.trim() || '';
          const dateMatch = text.match(datePattern);
          if (dateMatch && text.length > 10 && text.length < 120) {
            const title = text.replace(datePattern, '').replace(/\s*\d{1,2}:\d{2}:\d{2}/, '').replace(/\s+/g, ' ').trim();
            if (title.length > 6 && title.length < 80 && !timeOnlyPattern.test(title)) {
              results.push({ title, href: '', date: dateMatch[0], source: 'spa-datav' });
            }
          }
        }
        
        // Generic: find all spans/divs with reasonable text + nearby date
        const allEls = document.querySelectorAll('div, span, p');
        for (const el of allEls) {
          if (el.children.length > 2) continue; // Skip container elements
          const text = el.textContent?.trim() || '';
          const dateMatch = text.match(datePattern);
          if (dateMatch && text.length > 10 && text.length < 120) {
            const title = text.replace(datePattern, '').replace(/\s*\d{1,2}:\d{2}:\d{2}/, '').replace(/\s+/g, ' ').trim();
            if (title.length > 6 && title.length < 80 && !skipTexts.some(s => title === s) && !timeOnlyPattern.test(title)) {
              results.push({ title, href: '', date: dateMatch[0], source: 'spa-generic' });
            }
          }
        }
      }
      
      // Deduplicate by title
      const seen = new Set();
      return results.filter(r => {
        if (seen.has(r.title)) return false;
        seen.add(r.title);
        return true;
      });
    });

    // Output as JSON
    console.log(JSON.stringify({
      url,
      title: await page.title(),
      newsCount: newsItems.length,
      news: newsItems.slice(0, 30)
    }, null, 2));

  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.log(JSON.stringify({ url, error: err.message, newsCount: 0, news: [] }));
  } finally {
    clearTimeout(hardTimer);
    await browser.close();
  }
}

main();
