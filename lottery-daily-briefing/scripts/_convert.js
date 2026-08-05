// 兜底转换器：将简报从 "- **子字段**"/"### 条目标题" 写法还原为散文体
// （对齐 format-template.md v2.1.19 + _audit.js），并顺带执行成品去噪。
// 用法：node _convert.js YYYYMMDD   （在简报所在工作区根目录运行）
// 设计目标：即使主任务某天回归到子字段格式，兜底产物也是可读散文体且过审计。
//          对已是散文体（08-04 风格）的输入保持幂等（只做去噪）。

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

function transformItem(itemLines, isKaijiang) {
  const head = itemLines[0];
  let m = head.match(/^###\s+(\d+)\.\s*(?:【[^】]+】\s*)?\*\*(.+?)\*\*/)
        || head.match(/^(\d+)\.\s*(?:【[^】]+】\s*)?\*\*(.+?)\*\*/)
        || head.match(/^###\s+(\d+)\.\s*(?:【[^】]+】\s*)?(.+)$/);
  let num = '', title = '';
  if (m) { num = m[1]; title = m[2].replace(/\*\*/g, '').trim(); }
  else { title = head.replace(/^###\s*/, '').replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim(); }

  const map = {};      // label -> [values]
  const raw = [];      // 表格/引用/来源/URL 原样保留
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

  // 开奖：子字段拼成一条数据行 + 保留奖项表
  if (isKaijiang) {
    const fields = [];
    ['开奖日期', '开奖号码', '奖池金额', '兑奖截止日期', '来源'].forEach(k => {
      if (map[k] && map[k].length) fields.push(`${k} ${map[k].join('；')}`);
    });
    const res = [`${num ? num + '. ' : ''}**${title}**`];
    if (fields.length) res.push('   ' + fields.join('；') + '。');
    raw.forEach(r => res.push(r));
    return res;
  }

  // 政策/活动/渠道/中奖：叙述 + 轻量元信息行 + 来源行
  const narrParts = [];
  ['案例说明', '创新点', '效果', '活动内容', '主要内容', '中奖详情', '公益属性', '影响分析'].forEach(k => {
    if (map[k] && map[k].length) narrParts.push(map[k].join('；'));
  });
  let narrative = narrParts.join('。');
  narrative = narrative.replace(/。；/g, '。').replace(/；。/g, '。').replace(/。。/g, '。').replace(/；；/g, '；');
  if (narrative && !narrative.endsWith('。')) narrative += '。';

  const meta = [];
  if (map['发布时间']) meta.push('发布时间：' + map['发布时间'].join('；'));
  if (map['活动时间']) meta.push('时间：' + map['活动时间'].join('；'));
  if (map['活动地点'] || map['地点/范围']) meta.push('地点：' + (map['活动地点'] || map['地点/范围']).join('；'));
  if (map['主办单位']) meta.push('主办：' + map['主办单位'].join('；'));
  if (map['参与方式']) meta.push('参与：' + map['参与方式'].join('；'));
  const metaLine = meta.join('｜');

  let srcLine = '';
  if (map['来源']) srcLine = '来源：' + map['来源'].join('；');

  const res = [`${num ? num + '. ' : ''}**${title}**`];
  if (narrative) res.push('   ' + narrative);
  if (metaLine) res.push('   ' + metaLine);
  if (srcLine) res.push('   ' + srcLine);
  raw.forEach(r => res.push(r));
  return res;
}

const out = [];
let curSection = '';
let i = 0;
while (i < lines.length) {
  const ln = lines[i];
  if (ln.startsWith('## ')) { curSection = ln; out.push(ln); i++; continue; }
  const isItem = /^(?:###\s+)?\d+\.\s/.test(ln);
  if (isItem) {
    const itemLines = [ln]; i++;
    while (i < lines.length && !/^##\s/.test(lines[i]) && !/^(?:###\s+)?\d+\.\s/.test(lines[i]) && !/^---+\s*$/.test(lines[i])) {
      itemLines.push(lines[i]); i++;
    }
    const isKaijiang = curSection.includes('最新开奖');
    out.push(...transformItem(itemLines, isKaijiang));
    out.push('');
    continue;
  }
  out.push(ln); i++;
}

const result = out.join('\n');
fs.writeFileSync(src, result);
console.log('CONVERTED', src);
console.log('remaining "### " count =', (result.match(/^### /gm) || []).length);
console.log('remaining "- **" count =', (result.match(/^- \*\*/gm) || []).length);
console.log('remaining 本地重点关注/综合转述/补发 note =',
  (result.match(/本地重点关注|综合转述|补发，原题/g) || []).length);
