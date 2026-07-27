/**
 * 开奖数据采集（渲染版，保证JS填充字段如奖池被取到）
 * 渲染 5 个开奖页，提取主体文本 + 关键字段，落盘 _kaijiang_YYYYMMDD.txt
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DATE = process.argv[2] || '20260727';
const WORKSPACE = 'E:\\.workbuddy\\每日彩票新闻';
const OUT = path.join(WORKSPACE, `_kaijiang_${DATE}.txt`);

const PAGES = [
  { game:'福彩开奖公告(双色球/3D/七乐彩/快乐8)', url:'https://www.cwl.gov.cn/ygkj/kjgg/' },
  { game:'大乐透', url:'https://www.js-lottery.com/wfzq/dlt' },
  { game:'7星彩', url:'https://www.js-lottery.com/wfzq/sevenstar' },
  { game:'排列3/排列5', url:'https://www.js-lottery.com/wfzq/p3p5' },
  { game:'7位数(江苏)', url:'https://www.js-lottery.com/wfzq/seven' },
];

const EXTRACT = () => {
  const body = document.body;
  if (!body) return { text:'' };
  // 尝试定位主体内容区
  const candidates = [
    document.querySelector('.kjgg'), document.querySelector('#kjgg'),
    document.querySelector('.main'), document.querySelector('.content'),
    document.querySelector('table'), body
  ].filter(Boolean);
  const main = candidates[0];
  let text = (main.textContent || '').replace(/\s+/g, ' ').trim();
  // 抓取开奖号码球
  const balls = Array.from(document.querySelectorAll('.lottNums li, .kjNum li, .num li')).map(li=>li.textContent.trim()).filter(Boolean);
  // 期号
  const issueM = text.match(/第?\s*(\d{6,7})\s*期/);
  // 奖池
  const poolM = text.match(/奖池[：:]\s*([\d.]+亿?|\￥?\d[\d,]*元)/);
  return { text, balls, issue: issueM?issueM[1]:'', pool: poolM?poolM[1]:'' };
};

(async()=>{
  const chromePaths=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',process.env.LOCALAPPDATA+'\\Google\\Chrome\\Application\\chrome.exe'];
  let cf=null; for(const p of chromePaths){ if(p&&fs.existsSync(p)){cf=p;break;} }
  const browser = await chromium.launch({ headless:true, executablePath: cf||undefined });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'User-Agent':'Mozilla/5.0' });
  let out = `开奖数据采集 ${DATE}\n生成时间 ${new Date().toISOString()}\n\n`;
  for(const p of PAGES){
    try{
      await page.goto(p.url,{timeout:30000,waitUntil:'load'});
      await page.waitForTimeout(3000);
      const r = await page.evaluate(EXTRACT);
      out += `========== ${p.game} (${p.url}) ==========\n`;
      out += `期号: ${r.issue}\n奖池: ${r.pool}\n号码球: ${JSON.stringify(r.balls)}\n`;
      out += `正文(截取前1500字):\n${r.text.slice(0,1500)}\n\n`;
      console.error(`[OK] ${p.game}`);
    }catch(e){ console.error(`[ERR] ${p.game} :: ${e.message}`); out+=`========== ${p.game} 失败: ${e.message} ==========\n\n`; }
  }
  await browser.close();
  fs.writeFileSync(OUT, out, 'utf8');
  console.error(`已落盘 ${OUT}`);
})().catch(e=>{ console.error('FATAL',e); process.exit(1); });
