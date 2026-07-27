/**
 * 统一采集脚本（替代被网关拦截的 web_fetch）：单系统Chrome实例遍历全部列表页
 * 复用 fetch_news.js 的浏览器内提取逻辑，按时间窗口过滤，落盘 _collect_YYYYMMDD.jsonl
 * 用法: node collect_all.js <YYYYMMDD> <winStart> <winEnd>
 *   winStart/winEnd 形如 2026-07-26 12:00（含），用于窗口过滤
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATE = process.argv[2] || '20260727';
const WIN_START = process.argv[3] || '2026-07-26 12:00';
const WIN_END = process.argv[4] || '2026-07-27 12:00';

const WORKSPACE = 'E:\\.workbuddy\\每日彩票新闻';
const OUT = path.join(WORKSPACE, `_collect_${DATE}.jsonl`);
const STATE = path.join(WORKSPACE, `_state_${DATE}.json`);

// 解析窗口边界为时间戳
function parseWin(s) {
  // 支持 "2026-07-26 12:00"
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]).getTime();
}
const T0 = parseWin(WIN_START);
const T1 = parseWin(WIN_END);
// 窗口按"天"判定：日期只有天精度（无时分），取窗口起止日的整天范围
const T0_DAY = (() => { const d = new Date(T0); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime(); })();
const T1_DAY_END = (() => { const d = new Date(T1); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime(); })();
function inWindow(d) {
  if (!d) return false;
  const mm = d.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!mm) return false;
  const ts = new Date(+mm[1], +mm[2]-1, +mm[3]).getTime();
  return ts >= T0_DAY && ts <= T1_DAY_END;
}

// 全部列表页（来自 search-strategy.md）
const SITES = [
  // Step 0 江苏 + 中体彩 + 中福彩
  { key:'0.1', province:'江苏', type:'体彩', batch:'step0', url:'https://www.js-lottery.com/xwzx/tcdt' },
  { key:'0.2', province:'江苏', type:'体彩', batch:'step0', url:'https://www.js-lottery.com/tchd/pphd' },
  { key:'0.3', province:'江苏', type:'体彩', batch:'step0', url:'https://www.js-lottery.com/tchd/yxrd' },
  { key:'0.4', province:'江苏', type:'体彩', batch:'step0', url:'https://www.js-lottery.com/tzgg/tzgg' },
  { key:'0.5', province:'江苏', type:'福彩', batch:'step0', url:'https://www.jslottery.com/articles?article_type=' + encodeURIComponent('地市动态') + '&locale=zh-CN' },
  { key:'0.5b', province:'江苏', type:'福彩', batch:'step0', url:'https://www.jslottery.com/articles?article_type=' + encodeURIComponent('公益活动') + '&locale=zh-CN' },
  { key:'0.6', province:'江苏', type:'福彩', batch:'step0', url:'https://www.jslottery.com/articles?article_type=' + encodeURIComponent('营销活动') + '&locale=zh-CN' },
  { key:'0.7', province:'全国', type:'中体彩', batch:'step0', url:'https://www.lottery.gov.cn/xwzx/hy/index.html' },
  { key:'0.8', province:'全国', type:'中体彩', batch:'step0', url:'https://www.lottery.gov.cn/xwzx/mts/index.html' },
  { key:'0.9', province:'全国', type:'中福彩', batch:'step0', url:'https://www.cwl.gov.cn/gzdt/ywdt/index.shtml' },
  { key:'0.10', province:'全国', type:'中福彩', batch:'step0', url:'https://www.cwl.gov.cn/gzdt/gsld/index.shtml' },
  // Batch 1 华东
  { key:'b1-1', province:'浙江', type:'福彩', batch:'b1', url:'https://www.zjflcp.com/ch120/csdt/' },
  { key:'b1-2', province:'上海', type:'体彩', batch:'b1', url:'https://www.shsportslottery.com/' },
  { key:'b1-3', province:'山东', type:'福彩', batch:'b1', url:'https://www.sdcp.cn/article_list/fcxw' },
  { key:'b1-4', province:'安徽', type:'体彩', batch:'b1', url:'https://www.ahtycp.com/' },
  { key:'b1-5', province:'福建', type:'体彩', batch:'b1', url:'https://www.fjtc.com.cn/' },
  { key:'b1-6', province:'福建', type:'福彩', batch:'b1', url:'https://www.fjcp.cn/fucaizixun/xinwenzixun/' },
  // Batch 2 华南+华北
  { key:'b2-1', province:'江西', type:'体彩', batch:'b2', url:'https://www.jxlottery.cn/' },
  { key:'b2-2', province:'江西', type:'福彩', batch:'b2', url:'https://www.jxfczx.cn/news/NewsList.aspx?TypeId=62' },
  { key:'b2-3', province:'广东', type:'体彩', batch:'b2', url:'https://www.gdlottery.cn/' },
  { key:'b2-4', province:'广东', type:'福彩', batch:'b2', url:'https://www.gdfc.org.cn/news_list_13.html' },
  { key:'b2-5', province:'广西', type:'福彩', batch:'b2', url:'https://www.gxcaipiao.com.cn/newslist-i/10_0_1.html' },
  { key:'b2-6', province:'海南', type:'体彩', batch:'b2', url:'https://www.hainantc.com.cn/' },
  { key:'b2-7', province:'海南', type:'福彩', batch:'b2', url:'https://www.hainancp.com/list/12/' },
  // Batch 3 华北+华中+西南
  { key:'b3-1', province:'北京', type:'体彩', batch:'b3', url:'https://www.bjlot.com.cn/' },
  { key:'b3-2', province:'天津', type:'体彩', batch:'b3', url:'https://www.tjtc.org.cn/' },
  { key:'b3-3', province:'天津', type:'福彩', batch:'b3', url:'https://www.tjflcpw.com/news/NewsListLower.aspx?TypeId=1' },
  { key:'b3-4', province:'河北', type:'体彩', batch:'b3', url:'https://www.hbtcw.com/' },
  { key:'b3-5', province:'河北', type:'福彩', batch:'b3', url:'https://www.yzfcw.com/lotteryNews/newsList?classficationId=3' },
  { key:'b3-6', province:'山西', type:'体彩', batch:'b3', url:'https://www.sxlottery.net/' },
  { key:'b3-7', province:'湖北', type:'体彩', batch:'b3', url:'https://www.hbtycp.com/tczx' },
  { key:'b3-8', province:'湖北', type:'福彩', batch:'b3', url:'https://www.hbfcw.cn/csyw/' },
  // Batch 4 华中+西南+西北+东北+中彩网
  { key:'b4-1', province:'河南', type:'体彩', batch:'b4', url:'https://hnlottery.com.cn/' },
  { key:'b4-2', province:'湖南', type:'体彩', batch:'b4', url:'https://www.hnticai.com/' },
  { key:'b4-3', province:'湖南', type:'福彩', batch:'b4', url:'https://mzt.hunan.gov.cn/mzt/fc/xwzxfc/fcywfc/index.html' },
  { key:'b4-4', province:'四川', type:'体彩', batch:'b4', url:'https://www.scticai.cn/' },
  { key:'b4-5', province:'四川', type:'福彩', batch:'b4', url:'https://www.scflcp.com.cn/tzgg' },
  { key:'b4-6', province:'贵州', type:'福彩', batch:'b4', url:'https://www.gzfucai.cn/xinwenzhongxin/fucairedian/' },
  { key:'b4-7', province:'中彩网', type:'聚焦', batch:'b4', url:'https://www.zhcw.com/jj/tj/' },
  { key:'b4-8', province:'西藏', type:'体彩', batch:'b4', url:'https://www.xztycp.com/channels/23.html' },
  // Batch 5 西北+东北
  { key:'b5-1', province:'陕西', type:'体彩', batch:'b5', url:'https://www.sxtc.com.cn/tcxw/list/page.html' },
  { key:'b5-2', province:'陕西', type:'福彩', batch:'b5', url:'https://www.sxlotto.com.cn/xw/snxw/' },
  { key:'b5-3', province:'甘肃', type:'体彩', batch:'b5', url:'https://www.gstc.org.cn/' },
  { key:'b5-4', province:'甘肃', type:'福彩', batch:'b5', url:'https://www.gsflcp.com/xw/snxw/' },
  { key:'b5-5', province:'宁夏', type:'体彩', batch:'b5', url:'https://www.nxtcw.com.cn/' },
  { key:'b5-6', province:'新疆', type:'体彩', batch:'b5', url:'https://www.xjlottery.com.cn/' },
  { key:'b5-7', province:'新疆', type:'福彩', batch:'b5', url:'https://www.xjflcp.cn/root/n_139.htm' },
  { key:'b5-8', province:'青海', type:'福彩', batch:'b5', url:'https://www.qhflcp.cn/news/NewsList.aspx?TypeId=0' },
  // Batch 6 东北+华北+华南
  { key:'b6-1', province:'辽宁', type:'体彩', batch:'b6', url:'https://www.lntycp.com/' },
  { key:'b6-2', province:'辽宁', type:'福彩', batch:'b6', url:'https://www.lnlotto.com/View/NewsList.aspx?TypeId=47&CityID=-1' },
  { key:'b6-3', province:'吉林', type:'体彩', batch:'b6', url:'https://www.jlstycp.com/' },
  { key:'b6-4', province:'吉林', type:'福彩', batch:'b6', url:'https://www.jlfc.com.cn/View/Index.aspx' },
  { key:'b6-5', province:'黑龙江', type:'体彩', batch:'b6', url:'https://www.hljtycp.org.cn/' },
  { key:'b6-6', province:'黑龙江', type:'福彩', batch:'b6', url:'https://www.lottost.cn/xwzx/snxw/' },
  { key:'b6-7', province:'内蒙古', type:'体彩', batch:'b6', url:'https://www.nmtc.com.cn/' },
  { key:'b6-8', province:'深圳', type:'福彩', batch:'b6', url:'https://www.szlottery.org/fcw/fcxw/szfc/index.html' },
  // Playwright批 SPA/http-only 9站
  { key:'pw-1', province:'上海', type:'福彩', batch:'pw', url:'https://www.swlc.net.cn/shsflcpfxzx/bszx/bszx.html', wait:6000 },
  { key:'pw-2', province:'安徽', type:'福彩', batch:'pw', url:'https://www.ahflcp.com.cn/', wait:6000 },
  { key:'pw-3', province:'河南', type:'福彩', batch:'pw', url:'http://www.henanfucai.com/#/article/channel/list/1-9', wait:9000, gto:60000 },
  { key:'pw-4', province:'重庆', type:'福彩', batch:'pw', url:'https://www.cqcp.net/navigation/fczx', wait:6000 },
  { key:'pw-5', province:'云南', type:'福彩', batch:'pw', url:'https://www.ynflcp.cn/list/xwzx-2008880236425531393', wait:6000 },
  { key:'pw-6', province:'山东', type:'体彩', batch:'pw', url:'http://www.sdticai.com/wzgb/xinwen/', wait:4000 },
  { key:'pw-7', province:'广西', type:'体彩', batch:'pw', url:'http://www.lottery.gx.cn/ggtz/index.html', wait:4000 },
  { key:'pw-8', province:'贵州', type:'体彩', batch:'pw', url:'https://www.gzstycp.com/information/notice/index.html', wait:9000 },
  { key:'pw-9', province:'青海', type:'体彩', batch:'pw', url:'https://www.qhtycp.com/lst60?word=&page=1', wait:4000 },
];

const EXTRACT_FN = () => {
  const results = [];
  const datePattern = /\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}/;
  const skipTexts = ['首页','更多','下一页','上一页','尾页','联系我们','关于我们','搜索','登录'];
  const timeOnlyPattern = /^\d{1,2}:\d{2}:\d{2}$/;
  const hrefPattern = /show-\d+|detail[/-]\d+|news[/-]\d+|article[/-]\d+|\/\d+\.html|\.shtml|\.asp\b|\?id=\d+|\/view\d+|#\/article|#\/news|#.*channel|\.html/i;
  const normalizeDate = (d) => { if(!d) return d; return d.replace(/年|月/g,'-').replace(/日/g,'').replace(/[\/.]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''); };
  const elText = (el) => { if(!el) return ''; let t = el.textContent||''; if(el.querySelectorAll) el.querySelectorAll('img[src]').forEach(img=>{t+=' '+(img.getAttribute('src')||'');}); return t; };
  const links = document.querySelectorAll('a[href]');
  for (const a of links) {
    const href = a.getAttribute('href')||'';
    const rawText = a.textContent?.trim()||'';
    const title = (a.getAttribute('title')||rawText).replace(/^[\s·•\-–—]*[·•]?\s*/,'').replace(/\s+/g,' ').trim();
    if (title.length<4 || title.length>100) continue;
    if (skipTexts.some(s=>title===s) || timeOnlyPattern.test(title)) continue;
    if (/\/index\.\w+$/i.test(href)) continue;
    if (!hrefPattern.test(href)) continue;
    let date='';
    const parent = a.closest('li')||a.closest('tr')||a.closest('div')||a.parentElement;
    const rowEl = a.closest('tr')||a.closest('li')||(parent&&parent.parentElement)||parent;
    const candidates=[parent,rowEl,parent&&parent.parentElement].filter(Boolean);
    for (const el of candidates){ const dEl=el.querySelector('.sd_date, span, .date, .time, em, td'); if(dEl){const m=elText(dEl).match(datePattern); if(m){date=normalizeDate(m[0]); break;}} }
    if(!date){ for(const el of candidates){const m=elText(el).match(datePattern); if(m){date=normalizeDate(m[0]); break;}} }
    if(!date){ const m=title.match(datePattern); if(m) date=normalizeDate(m[0]); }
    let fullHref=href;
    try{ fullHref=new URL(href, location.href).href; }catch(e){}
    results.push({ title, href:fullHref, date, text:title });
  }
  if (results.length<3){
    const lis=document.querySelectorAll('li');
    for(const li of lis){ const a=li.querySelector('a'); const dateSpan=li.querySelector('span, .date, .time, em'); if(a&&dateSpan){ const text=a.textContent?.trim()||''; const dm=dateSpan.textContent?.match(datePattern); if(text.length>4&&dm){ results.push({title:text, href:a.getAttribute('href')||'', date:dm[0], text}); } } }
  }
  const seen=new Set();
  return results.filter(r=>{ if(seen.has(r.title)) return false; seen.add(r.title); return true; });
};

(async () => {
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  let chromeFound=null;
  for(const p of chromePaths){ if(p && fs.existsSync(p)){ chromeFound=p; break; } }
  console.error('Chrome:', chromeFound || 'bundled');
  const browser = await chromium.launch({ headless:true, executablePath: chromeFound || undefined });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });

  let total=0;
  const batchCount = {};
  const failed = [];
  const outStream = fs.createWriteStream(OUT, { flags:'w', encoding:'utf8' });

  for (const site of SITES) {
    const wait = site.wait || 3500;
    const gto = site.gto || 30000;
    let items=[];
    try {
      await page.goto(site.url, { timeout:gto, waitUntil:'load' });
      await page.waitForTimeout(wait);
      const raw = await page.evaluate(EXTRACT_FN);
      // 过滤窗口内
      items = (raw||[]).filter(r => inWindow(r.date));
      console.error(`[进度] ${site.key} ${site.province}${site.type} 命中=${items.length} (窗口内) / 总${raw?raw.length:0}`);
    } catch(e){
      console.error(`[失败] ${site.key} ${site.url} :: ${e.message}`);
      failed.push({ key:site.key, url:site.url, err:e.message });
    }
    for (const it of items){
      const rec = { batch:site.batch, key:site.key, province:site.province, type:site.type, source_url:site.url, title:it.title, date:it.date, href:it.href };
      outStream.write(JSON.stringify(rec) + '\n');
      total++;
      batchCount[site.batch]=(batchCount[site.batch]||0)+1;
    }
  }

  await browser.close();
  outStream.end();

  const state = {
    date: DATE, win_start: WIN_START, win_end: WIN_END,
    collected_at: new Date().toISOString(),
    collect_count: total,
    batch_count: batchCount,
    failed,
    batches: { step0:'done', b1:'done', b2:'done', b3:'done', b4:'done', b5:'done', b6:'done', pw:'done', api_zj:'pending', kaijiang:'pending' }
  };
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.error(`\n[完成] 总命中=${total}，分桶=${JSON.stringify(batchCount)}，失败=${failed.length}`);
  if (failed.length) console.error('失败站点:', JSON.stringify(failed));
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
