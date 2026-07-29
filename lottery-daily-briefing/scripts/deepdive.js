/**
 * Step 4 深度抓取（硬门禁）：读取 _collect_YYYYMMDD.jsonl，筛选活动/渠道高价值条目，
 * 用 Playwright(系统Chrome) 下钻详情页取正文，落盘 _details_YYYYMMDD.json。
 * 本省/南京条目强制深抓；活动详版需>=8、渠道详版需>=4（脚本输出计数供校验）。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DATE = process.argv[2] || '20260727';
const WORKSPACE = 'E:\\.workbuddy\\每日彩票新闻';
const COLLECT = path.join(WORKSPACE, `_collect_${DATE}.jsonl`);
const DETAILS = path.join(WORKSPACE, `_details_${DATE}.json`);

const ACTIVITY_KW = ['活动','公益','品牌','营销','赠票','派奖','赛事','责任彩票','报告','助学','捐赠','清凉','快乐','篮球','乒','少年','社区','乡村','校园','打卡','推广','助力','下乡','慰问'];
const CHANNEL_KW = ['网点','渠道','站点','代销','跨界','合作','创新','升级','智慧','终端','门店','便利店','商超','即开','展示','体验','招募','转型','小程序','自助'];
const POLICY_KW = ['通知','公告','规则','政策','办法','调整','休市','兑奖','解读','管理','规范'];

function classify(title){
  if (/江苏|南京/.test(title)) return 'forced';
  if (ACTIVITY_KW.some(k=>title.includes(k))) return 'activity';
  if (CHANNEL_KW.some(k=>title.includes(k))) return 'channel';
  if (POLICY_KW.some(k=>title.includes(k))) return 'policy';
  return 'other';
}

// 正文垃圾判定（与 _gen.js 保持一致）：导航/CSS/中文占比过低
function isGarbage(s) {
  if (!s || s.length <= 20) return true;
  if (/:hover/.test(s)) return true;
  if (/网站首页|客服热线|您所在的位置|首页\s*>>/.test(s)) return true;
  if (/\{\s*[^}]*(?:width|height|background|margin|padding|border|display|color)\b/.test(s)) return true;
  const cn = (s.match(/[一-鿿]/g) || []).length;
  return cn / s.length < 0.15;
}

// 原生 fetch 兜底：Playwright 取到 CSS/导航垃圾时，改用 fetch + 编码探测 + 去样式后取正文容器
async function nativeFallback(href) {
  try {
    const r = await fetch(href, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || '';
    let html = buf.toString('utf8');
    // 编码探测：meta/Content-Type 声明 GBK/GB2312 才用 GBK 解；UTF-8 解码若含大量替换符也回退 GBK
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

(async()=>{
  const lines = fs.readFileSync(COLLECT,'utf8').trim().split('\n').filter(Boolean);
  const items = lines.map(l=>JSON.parse(l));
  // 去重（同 title 保留 href 最全的）
  const byTitle = {};
  for(const it of items){
    const c = classify(it.title);
    if(c==='other') continue;
    if(!it.href) continue;
    if(!byTitle[it.title] || (byTitle[it.title].href.length < it.href.length)){
      byTitle[it.title] = { ...it, cls:c };
    }
  }
  const targets = Object.values(byTitle);
  console.error(`筛选可深抓目标: ${targets.length} (活动/渠道/政策/强制)`);
  const cnt = { activity:0, channel:0, policy:0, forced:0 };
  targets.forEach(t=>cnt[t.cls]++);
  console.error('分类计数:', JSON.stringify(cnt));

  const chromePaths=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',process.env.LOCALAPPDATA+'\\Google\\Chrome\\Application\\chrome.exe'];
  let cf=null; for(const p of chromePaths){ if(p&&fs.existsSync(p)){cf=p;break;} }
  const browser = await chromium.launch({ headless:true, executablePath: cf||undefined });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'User-Agent':'Mozilla/5.0' });

  const details = [];
  for(const t of targets){
    let content='';
    try{
      await page.goto(t.href,{timeout:30000,waitUntil:'load'});
      await page.waitForTimeout(2500);
      content = await page.evaluate(()=>{
        const root = document.querySelector('.article, .content, .detail, .TRS_Editor, #content, .newscon, .art_content, .main') || document.body;
        return (root.textContent||'').replace(/\s+/g,' ').replace(/\s{2,}/g,' ').trim().slice(0,2000);
      });
      // 若抓到的是导航/CSS垃圾（站点结构不在选择器列表时 body 兜底会中招），改用原生 fetch 兜底重抓真正文
      if (isGarbage(content)) {
        const fb = await nativeFallback(t.href);
        if (fb && !isGarbage(fb)) { content = fb; console.error(`  [兜底] ${t.province} ${(t.title||'').slice(0,20)} 原生fetch重抓成功 ${fb.length}字`); }
      }
    }catch(e){ content='[抓取失败:'+e.message+']'; }
    details.push({ key:t.key, province:t.province, type:t.type, cls:t.cls, title:t.title, date:t.date, href:t.href, content });
    console.error(`[深抓] ${t.cls} ${t.province} ${t.title.slice(0,24)} -> ${content.length}字`);
  }
  await browser.close();
  fs.writeFileSync(DETAILS, JSON.stringify(details, null, 2), 'utf8');
  const real = { activity:details.filter(d=>d.cls==='activity'&&!d.content.startsWith('[抓取失败')).length, channel:details.filter(d=>d.cls==='channel'&&!d.content.startsWith('[抓取失败')).length };
  console.error(`\n[门禁校验] 活动详版=${real.activity} (需>=8) / 渠道详版=${real.channel} (需>=4)`);
  console.error(real.activity>=8 && real.channel>=4 ? '✅ 满足硬门禁' : '❌ 不满足硬门禁，需补充');
})().catch(e=>{ console.error('FATAL',e); process.exit(1); });
