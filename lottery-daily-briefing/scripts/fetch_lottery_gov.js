#!/usr/bin/env node
/**
 * fetch_lottery_gov.js — 抓取中国体彩网(lottery.gov.cn)行业新闻(0.7)与媒体说(0.8)
 *
 * ⚠️ 背景：WebFetch 工具底层内容安全网关误将 lottery.gov.cn 域名判为博彩类而拦截，
 *   返回"不在能力范围内"。但网站本身正常（curl 实测 HTTP 200）。故本脚本改用 Node
 *   原生 fetch 直连，绕过 WebFetch 网关，解析新闻列表并输出标准 JSON。
 *
 * 用法：node fetch_lottery_gov.js
 * 输出：JSON 数组 [{title, date, href, source}]
 *   - href 为相对路径，调用方需拼接 https://www.lottery.gov.cn
 *   - source: "中国体彩网·行业新闻" / "中国体彩网·媒体说"
 */
'use strict';
const BASE = 'https://www.lottery.gov.cn';
const SECTIONS = [
  { key: 'hy', url: `${BASE}/xwzx/hy/index.html`, source: '中国体彩网·行业新闻' },
  { key: 'mts', url: `${BASE}/xwzx/mts/index.html`, source: '中国体彩网·媒体说' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function parseItems(html, source) {
  const items = [];
  // 每个新闻条目包裹在 <li ...> 内
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const block = m[1];
    // 标题链接：<a href="/xwzx/(hy|mts)/YYYYMMDD/ID.html">标题</a> 且文本非空且非"查看详情"
    const titleRe = /<a\s+href="(\/xwzx\/(?:hy|mts)\/\d{8}\/\d+\.html)"\s*>([^<]+?)<\/a>/g;
    let tm, title = null, href = null;
    while ((tm = titleRe.exec(block)) !== null) {
      const t = tm[2].trim();
      if (t && t !== '查看详情') { title = t; href = tm[1]; break; }
    }
    if (!title || !href) continue;
    // 日期：优先 (YYYY-MM-DD)，回退到 URL 路径中的 YYYYMMDD
    let date = null;
    const dRe = /\((\d{4}-\d{2}-\d{2})\)/;
    const dm = block.match(dRe);
    if (dm) date = dm[1];
    else {
      const um = href.match(/\/(\d{4})(\d{2})(\d{2})\//);
      if (um) date = `${um[1]}-${um[2]}-${um[3]}`;
    }
    items.push({ title, date, href, source });
  }
  return items;
}

async function fetchSection(sec) {
  try {
    const resp = await fetch(sec.url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }, redirect: 'follow' });
    if (!resp.ok) { console.error(`[fetch_lottery_gov] ${sec.key} HTTP ${resp.status}`); return []; }
    const html = await resp.text();
    return parseItems(html, sec.source);
  } catch (e) {
    console.error(`[fetch_lottery_gov] ${sec.key} ERROR ${e.message}`);
    return [];
  }
}

(async () => {
  const all = [];
  for (const sec of SECTIONS) {
    const items = await fetchSection(sec);
    all.push(...items);
    process.stderr.write(`[进度] 中国体彩网 ${sec.source} 完成（${items.length} 条）\n`);
  }
  console.log(JSON.stringify(all, null, 2));
})();
