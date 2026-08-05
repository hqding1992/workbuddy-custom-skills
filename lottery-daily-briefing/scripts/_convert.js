// 兜底转换器：将简报从 "- **子字段**" 写法还原为新闻体（### 条目标题 + 完整叙述段落 + 段尾来源）
// 对齐 format-template.md v2.1.20 + _audit.js。顺带执行成品去噪。
// 用法：node _convert.js YYYYMMDD   （在简报所在工作区根目录运行）
// 设计目标：即使主任务某天回归到子字段格式，兜底产物也是可读新闻体且过审计。
//          对已是新闻体（### 风格，如 07-30）的输入保持幂等（只做去噪与轻微规范化）。

const fs = require('fs');
const D = process.argv[2];
if (!D || !/^\d{8}/.test(D)) { console.error('usage: node _convert.js YYYYMMDD'); process.exit(1); }
const src = `今日彩票新闻简报_${D}.md`;
if (!fs.existsSync(src)) { console.error('NO FILE', src); process.exit(1); }

// ---- B: 成品去噪 ----
function cleanText(s) {
  return s
    .replace(/（[^）]*(?:特别关注|重点关注)[^）]*）/g, '')
    .replace(/（综合转述[^）]*）/g, '')
    .replace(/（2026年[^）]*补发[^）]*）/g, '')
    .replace(/（原文[^）]*）/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// 删除独立的"政策剔除说明"整段（行首为 （注：）
const lines = fs.readFileSync(src, 'utf8').split('\n').filter(l => {
  const t = l.trim();
  return !(t.startsWith('（注：') && t.endsWith('）'));
});

function transformItem(itemLines) {
  const head = itemLines[0].trim();

  // ---- 解析标题行：### N. 【状态】标题（日期｜地区） / ### 标题 / - **标题**：
  let num = '', status = '', title = head, date = '', region = '';
  let h = head.replace(/^###\s*/, '').replace(/^-\s+\*\*/, '').replace(/\*\*$/, '');
  const nm = h.match(/^(\d+)\.\s*(.*)$/);
  if (nm) { num = nm[1]; h = nm[2]; }
  const sm = h.match(/^【([^】]+)】\s*(.*)$/);
  if (sm) { status = sm[1]; h = sm[2]; }
  const pm = h.match(/^(.*?)（(\d{4}年\d{2}月\d{2}日)(?:[｜|]([^）]+))?）\s*$/);
  if (pm) { h = pm[1].trim(); date = pm[2]; region = (pm[3] || '').trim(); }
  else { const pm2 = h.match(/^(.*?)（([^）]+)）\s*$/); if (pm2) { h = pm2[1].trim(); region = pm2[2].trim(); } }
  title = h.replace(/\*\*/g, '').replace(/[:：]\s*$/, '').trim();

  // ---- 收集子字段 / 叙述 ----
  const map = {};      // label -> [values]
  const raw = [];      // 表格/引用/独立来源行 原样保留
  let curLabel = null;
  for (let k = 1; k < itemLines.length; k++) {
    const line = itemLines[k].trim();
    if (!line) continue;
    if (line.startsWith('|')) { raw.push(itemLines[k]); continue; }
    if (line.startsWith('>')) { raw.push(itemLines[k]); continue; }
    if (/^来源[：:]/.test(line) || /^https?:\/\//.test(line) || /^数据来源/.test(line)) { raw.push(itemLines[k]); continue; }
    let fm = line.match(/^-\s+\*\*(.+?)\*\*[：:]\s*(.+)$/);
    if (fm) { curLabel = fm[1]; (map[curLabel] = map[curLabel] || []).push(cleanText(fm[2])); continue; }
    let lm = line.match(/^\*\*(.+?)\*\*[：:]\s*$/);
    if (lm) { curLabel = lm[1]; (map[curLabel] = map[curLabel] || []); continue; }
    let im = line.match(/^\*\*(.+?)\*\*[：:]\s*(.+)$/);
    if (im) { curLabel = im[1]; (map[curLabel] = map[curLabel] || []).push(cleanText(im[2])); continue; }
    let bm = line.match(/^-\s+(.+)$/);
    if (bm) { if (curLabel) (map[curLabel] = map[curLabel] || []).push(cleanText(bm[1])); continue; }
    if (!curLabel) (map['活动内容'] = map['活动内容'] || []).push(cleanText(line));
  }

  // ---- 组装叙述 / 元信息 / 影响分析 / 来源 ----
  const NARR_KEYS = ['案例说明', '创新点', '效果', '活动内容', '主要内容', '中奖详情', '公益属性', '影响分析'];
  const META_KEYS = ['发布时间', '活动时间', '活动地点', '地点/范围', '主办单位', '参与方式'];
  const META_LABEL = { '发布时间': '发布时间', '活动时间': '时间', '活动地点': '地点', '地点/范围': '地点', '主办单位': '主办', '参与方式': '参与' };
  const narrParts = [], extra = [], metaParts = [], inflParts = [];
  let srcVals = [];
  for (const k of Object.keys(map)) {
    const vals = map[k].join('；');
    if (k === '来源') { srcVals.push(vals); continue; }
    if (k === '影响分析') { inflParts.push(vals); continue; }
    if (META_KEYS.includes(k)) {
      metaParts.push(META_LABEL[k] + '：' + vals);
      if (k === '活动时间' && !date) date = vals;
      if ((k === '活动地点' || k === '地点/范围') && !region) region = vals;
      continue;
    }
    if (NARR_KEYS.includes(k)) { narrParts.push(vals); continue; }
    extra.push(`${k}：${vals}`); // 未识别字段（如中奖游戏/期号/金额/地区/单注奖金）一律保留
  }
  // 标题/元信息行缺日期地区时，从子字段补
  if (!date && map['发布时间']) date = map['发布时间'].join('；');
  if (!date && map['开奖日期']) date = map['开奖日期'].join('；');
  if (!region && map['中奖地区']) region = map['中奖地区'].join('；');
  if (!region && (map['活动地点'] || map['地点/范围'])) region = (map['活动地点'] || map['地点/范围']).join('；');

  let narrative = [...narrParts, ...extra].join('。');
  narrative = narrative.replace(/。；/g, '。').replace(/；。/g, '。').replace(/。。/g, '。').replace(/；；/g, '；');
  if (narrative && !narrative.endsWith('。')) narrative += '。';
  const metaLine = metaParts.join('｜');

  // ---- 重建标题行 ----
  const statusP = status ? `【${status}】` : '';
  const paren = (date || region) ? `（${[date, region].filter(Boolean).join('｜')}）` : '';
  const numP = num ? `${num}. ` : '';
  const newHead = `### ${numP}${statusP}${title}${paren}`;

  // ---- 组装输出 ----
  const res = [newHead, ''];
  if (narrative) res.push(narrative);
  if (metaLine) res.push(metaLine);
  if (inflParts.length) res.push('', '**影响分析**：' + inflParts.join('。'));
  // 来源融入段尾（附加到最后一个文本行）
  const srcStr = srcVals.length ? srcVals.join('；') : (map['来源'] ? map['来源'].join('；') : '');
  const srcLine = srcStr ? `（来源：${srcStr}）` : '';
  if (srcLine) {
    for (let i = res.length - 1; i >= 0; i--) {
      if (res[i] && !res[i].startsWith('##') && !res[i].startsWith('>')) { res[i] = res[i] + srcLine; break; }
    }
  }
  raw.forEach(r => res.push(r));
  return res;
}

// 开奖条目 → 一行表格数据（彩种/期号/开奖号码/奖池备注）
function parseKaijiang(itemLines) {
  const head = itemLines[0].trim().replace(/^###\s*/, '').replace(/\*\*/g, '');
  let title = head, issue = '';
  const nm = head.match(/^(\d+)\.\s*(.*)$/); if (nm) title = nm[2];
  const im = title.match(/^(.+?)\s*(?:第)?(\d+)\s*期\s*$/);
  if (im) { title = im[1].trim(); issue = '第' + im[2] + '期'; }
  const map = {};
  for (let k = 1; k < itemLines.length; k++) {
    const line = itemLines[k].trim(); if (!line) continue;
    if (line.startsWith('|') || line.startsWith('>')) continue;
    const fm = line.match(/^-\s+\*\*(.+?)\*\*[：:]\s*(.+)$/);
    if (fm) { map[fm[1]] = cleanText(fm[2]); continue; }
    const im2 = line.match(/^\*\*(.+?)\*\*[：:]\s*(.+)$/);
    if (im2) { map[im2[1]] = cleanText(im2[2]); continue; }
  }
  const 期号 = issue || (map['期号'] || '—');
  const 号码 = map['开奖号码'] || '—';
  let 奖池 = map['奖池金额'] || '—';
  if (map['兑奖截止日期']) 奖池 += '（兑奖截止 ' + map['兑奖截止日期'] + '）';
  return { 彩种: title, 期号, 号码, 奖池 };
}

const out = [];
let curSection = '';
let kaijiangBuf = [];
const flushKaijiang = () => {
  if (!kaijiangBuf.length) return;
  out.push('| 彩种 | 期号 | 开奖号码 | 奖池/备注 |');
  out.push('|------|------|----------|-----------|');
  for (const r of kaijiangBuf) out.push(`| ${r.彩种} | ${r.期号} | ${r.号码} | ${r.奖池} |`);
  out.push('');
  out.push('数据来源：中国体彩网（js-lottery.com）、中国福彩网（cwl.gov.cn）。');
  out.push('');
  kaijiangBuf = [];
};

let i = 0;
while (i < lines.length) {
  const ln = lines[i];
  if (ln.startsWith('## ')) { flushKaijiang(); curSection = ln; out.push(ln); i++; continue; }
  // 开奖段：缓冲为表格
  if (/最新开奖/.test(curSection)) {
    if (/^---+\s*$/.test(ln)) { i++; continue; }
    if (/^(?:###\s+)/.test(ln) || /^\d+\.\s+\*\*/.test(ln)) {
      const itemLines = [ln]; i++;
      while (i < lines.length &&
             !/^##\s/.test(lines[i]) &&
             !/^(?:###\s+)/.test(lines[i]) &&
             !/^\d+\.\s+\*\*/.test(lines[i]) &&
             !/^---+\s*$/.test(lines[i])) {
        itemLines.push(lines[i]); i++;
      }
      kaijiangBuf.push(parseKaijiang(itemLines));
      continue;
    }
    out.push(ln); i++; continue;
  }
  // 其他段：条目头 = ### 三级标题 / 旧散文体 N. **标题**
  // 条目内部的 - **子字段** 折叠进当前条目；顶层 - **标题**：（如 07-30 中奖 bullet）透传
  const isItem = /^(?:###\s+)/.test(ln) || /^\d+\.\s+\*\*/.test(ln);
  if (isItem) {
    const itemLines = [ln]; i++;
    while (i < lines.length &&
           !/^##\s/.test(lines[i]) &&
           !/^(?:###\s+)/.test(lines[i]) &&
           !/^\d+\.\s+\*\*/.test(lines[i]) &&
           !/^---+\s*$/.test(lines[i])) {
      itemLines.push(lines[i]); i++;
    }
    out.push(...transformItem(itemLines));
    out.push('');
    continue;
  }
  out.push(ln); i++;
}
flushKaijiang();

const result = out.join('\n');
fs.writeFileSync(src, result);
console.log('CONVERTED', src);
console.log('remaining "### " count =', (result.match(/^### /gm) || []).length);
console.log('remaining "- **" count =', (result.match(/^- \*\*/gm) || []).length);
console.log('remaining 子字段(- **xxx**：) count =',
  (result.match(/^-\s+\*\*.+?\*\*[：:]/gm) || []).length);
console.log('remaining 本地重点关注/综合转述/补发 note =',
  (result.match(/本地重点关注|综合转述|补发，原题/g) || []).length);
