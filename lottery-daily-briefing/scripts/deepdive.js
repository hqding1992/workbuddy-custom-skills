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
