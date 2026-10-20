/**
 * 兜底预处理：合并 _details + _wins，应用强清洗（垃圾拒收/历史归档/标题净化/去重/窗口），
 * 按五大类分组输出中间文件 _brief_input_YYYYMMDD.md 供简报生成使用。
 * stdout 仅输出元数据；正文只写文件不打印。
 */
const fs = require('fs');
const DATE = process.argv[2] || '20261020';
const WS = 'E:\\.workbuddy\\每日彩票新闻';

function isGarbage(s) {
  if (!s || s.length <= 20) return true;
  if (/:hover/.test(s)) return true;
  if (/网站首页|客服热线|您所在的位置|首页\s*>>/.test(s)) return true;
  if (/\{\s*[^}]*(?:width|height|background|margin|padding|border|display|color)\b/.test(s)) return true;
  const cn = (s.match(/[一-鿿]/g) || []).length;
  return cn / s.length < 0.15;
}

function cleanTitle(t) {
  return String(t || '')
    .replace(/_行业_中彩网/g, '').replace(/\|?\s*中彩网/g, '')
    .replace(/\|\s*(体彩|福彩|彩票).*$/, '')
    .replace(/[（(]\s*\d{4}[-年]\d{1,2}[-月]\d{1,2}[日)][）)]?\s*$/, '')
    .replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, '')
    .trim();
}

function isArchivePolicy(title, body) {
  if (/条例|办法|细则|暂行规定|印发/.test(title)) {
    if (!/2026/.test(body || '')) return true;
  }
  if (/\/0[0-9]-0000\d{3}/.test('')) return true;
  return false;
}

function cleanBody(s) {
  let b = String(s || '');
  b = b.replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  b = b.replace(/您所在的位置[^。]{0,60}?首页/,'').replace(/首页\s*[>>\s]*\s*新闻中心[^。]{0,40}/g,'').replace(/网站首页[^。]{0,30}/g,'');
  b = b.replace(/[（(]\s*(?:江苏本地重点关注|本地重点关注|特别关注)\s*[）)]/g, '');
  b = b.replace(/window\.slotbydup[\s\S]*?(?:];|]}|(?=下载|（来源|来源)|$)/g, '');
  b = b.replace(/(?:微博QQ空间微信|QQ空间微信|QQ空间)with \(document\)[\s\S]*?(];|]}|(?=下载|（来源|来源)|$)/g, '');
  b = b.replace(/20\d{2}-\d{1,2}-\d{1,2}\D{0,3}\d{1,2}:?\d{1,2}:\d{2}/g, ' ');
  b = b.replace(/相关新闻[\s\S]{0,200}$/g, '').replace(/©[\s\S]{0,60}$/g, '').replace(/京ICP[\s\S]{0,40}$/g, '');
  b = b.replace(/\s{2,}/g, ' ').trim();
  return b;
}

function capBody(s, cap) {
  if (s.length <= cap) return s;
  const cut = s.slice(0, cap);
  const lastStop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('!'), cut.lastIndexOf('！'));
  return lastStop > cap * 0.5 ? cut.slice(0, lastStop + 1) : cut;
}

// 加载
const det = JSON.parse(fs.readFileSync(`${WS}/_details_${DATE}.json`, 'utf8'));
const details = Array.isArray(det) ? det : (det.items || det.list || []);
let wins = [];
try { wins = JSON.parse(fs.readFileSync(`${WS}/_wins_${DATE}.json`, 'utf8')); } catch (e) {}
const all = [...details, ...wins];

// 语义重分类（铁律：DROP→WIN→POLICY→赛事ACTIVITY→CHANNEL→默认ACTIVITY）
function reclass(it) {
  const t = it.title || '';
  const c = it.content || '';
  if (/喜中|中出|一等奖|二等奖|中奖/.test(t) && /万元|亿元|元|注/.test(c)) return 'win';
  if (/培训|开班|会议/.test(t) && (it.cls === 'policy' || it.cls === 'channel')) return 'activity';
  return it.cls;
}

// 去重（同 cls 内标题前10字相同视为重复，保留正文更长者；win 独立成组不与其他组合池）
const byKey = {};
const dupDropped = [];
const groups0 = { policy: [], activity: [], channel: [], win: [] };
for (const it of all) {
  it.cls = reclass(it);
  groups0[it.cls] = groups0[it.cls] || [];
  groups0[it.cls].push(it);
}
for (const sec of Object.keys(groups0)) {
  const localByKey = {};
  for (const it of groups0[sec]) {
    const t = cleanTitle(it.title);
    const k = t.slice(0, 10);
    if (localByKey[k]) {
      const prev = localByKey[k];
      if ((it.content || '').length > (prev.content || '').length) { localByKey[k] = { ...it, title: t }; }
      dupDropped.push(t);
      continue;
    }
    localByKey[k] = { ...it, title: t };
  }
  groups0[sec] = Object.values(localByKey);
}

// 清洗+分组（复用已分好组的 groups0）
const groups = { policy: [], activity: [], channel: [], win: [], dropped: [] };
for (const sec of ['policy', 'activity', 'channel', 'win']) {
  for (const it of (groups0[sec] || [])) {
    const reasons = [];
    if (isGarbage(it.content)) reasons.push('垃圾正文');
    if (isArchivePolicy(it.title, it.content)) reasons.push('历史归档');
    if (/GDP|进出口|旅游收入|消费数据/.test(it.title)) reasons.push('宏观无关');
    if (reasons.length) { groups.dropped.push({ title: it.title, reason: reasons.join('/') }); continue; }
    const body = capBody(cleanBody(it.content), it.cls === 'channel' ? 200 : (it.cls === 'win' ? 400 : 480));
    if (body.length < 30) { groups.dropped.push({ title: it.title, reason: '正文过短' }); continue; }
    groups[sec].push({ province: it.province, date: it.date, href: it.href, title: it.title, body });
  }
}

// 输出中间文件
let out = `# 简报输入中间文件 ${DATE}\n\n`;
const secNames = { policy: '政策动态', activity: '各地活动', channel: '渠道拓展', win: '重大中奖' };
for (const sec of ['policy', 'activity', 'channel', 'win']) {
  const arr = groups[sec] || [];
  // 江苏优先，其余按日期倒序+省份
  arr.sort((a, b) => {
    const ja = /江苏|南京/.test(a.province) ? 0 : 1, jb = /江苏|南京/.test(b.province) ? 0 : 1;
    if (ja !== jb) return ja - jb;
    return String(b.date).localeCompare(String(a.date));
  });
  out += `\n## ${secNames[sec]}（${arr.length}条）\n\n`;
  for (const it of arr) {
    out += `### [${sec}] ${it.title}｜${it.province}｜${it.date}\nURL: ${it.href}\n${it.body}\n\n`;
  }
}
out += `\n## 剔除记录（${groups.dropped.length}条）\n`;
for (const d of groups.dropped) out += `- ${d.title} → ${d.reason}\n`;

fs.writeFileSync(`${WS}/_brief_input_${DATE}.md`, out, 'utf8');
console.log(`OK policy=${groups.policy.length} activity=${groups.activity.length} channel=${groups.channel.length} win=${groups.win.length} dropped=${groups.dropped.length} dup=${dupDropped.length} input=${WS}/_brief_input_${DATE}.md`);
