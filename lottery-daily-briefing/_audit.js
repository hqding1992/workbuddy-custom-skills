// 审计简报：量化无效数据（窗口外/JS垃圾/相关新闻链接/空正文/导航残留/跨节重复）
const fs = require('fs');
const mdPath = process.argv[2] || '今日彩票新闻简报_20260728.md';
// 窗口从简报文件名日期自动推导：前一日12:00 → 当日12:00（避免硬编码导致次日审计误拦截分发）
const dM = mdPath.match(/(\d{4})(\d{2})(\d{2})/);
let WIN_START = '2026-07-28', WIN_END = '2026-07-29';
if (dM) {
  const y=+dM[1], mo=+dM[2]-1, d=+dM[3];
  const fmt = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  WIN_END = fmt(new Date(y,mo,d,12,0,0));
  WIN_START = fmt(new Date(y,mo,d-1,12,0,0));
}
const md = fs.readFileSync(mdPath, 'utf8');
const lines = md.split('\n');
let section = '', cur = null, items = [];
const flush = () => { if (cur) items.push(cur); cur = null; };
for (const ln of lines) {
  if (ln.startsWith('## ')) { flush(); section = ln.slice(3).trim(); continue; }
  // 条目头：① 子字段格式 ### / - ** ；② 散文体 N. **标题**（2026-08-05 起统一散文体，恢复真实审计）
  const isItemHead = ln.startsWith('### ') || ln.startsWith('- **') ||
    /^\d+\.\s+\*\*.+\*\*/.test(ln.trim());
  if (isItemHead) { flush(); cur = { section, head: ln.trim(), body: '' }; continue; }
  if (cur) cur.body += ln + ' ';
}
flush();
const issues = [];
for (const it of items) {
  const body = it.body || '';
  const m = body.match(/(?:发布日期|发布时间|时间)[：:]\s*(\d{4}-\d{2}-\d{2})/);
  const real = m ? m[1] : null;
  const flags = [];
  if (real && (real < WIN_START || real > WIN_END)) flags.push('窗口外(' + real + ')');
  if (/2009|2008/.test(it.head) && !/2026/.test(it.head)) flags.push('旧年份标题');
  if (/var appendix|document\.getElementById|style\.display|\$\(function/.test(body)) flags.push('JS垃圾');
  if (/相关新闻|大奖一览表|一览表/.test(body)) flags.push('相关新闻链接块');
  if (/您的位置|首页\s*>|新闻中心\s*>|客服热线|官方网站\s*搜索/.test(body)) flags.push('面包屑导航');
  if (/点击图片了解更多/.test(body)) flags.push('推广残留');
  if (/添加中彩网抖音号|关注中彩网公众号|下载中彩网客户端|©\d{4}|京ICP/.test(body)) flags.push('页脚残留');
  if (/[\uFFFD]|\?\?/.test(body)) flags.push('乱码字符');
  if (/_[^_]+_中彩网/.test(it.head)) flags.push('标题带分类后缀');
  if (body.replace(/\s/g, '').length < 6 && it.section !== '一、政策动态' && it.section !== '五、重大中奖') flags.push('空正文');
  if (flags.length) issues.push('[' + it.section + '] ' + it.head.slice(0, 38) + ' => ' + flags.join(','));
}
// 跨节重复（标题去标点后指纹）
const fp = s => s.replace(/[^\u4e00-\u9fa5\d]/g, '').slice(0, 18); // 保留数字，避免排列3/排列5等同中文前缀误判重复
const seen = {}, dups = [];
for (const it of items) { const k = fp(it.head); if (seen[k]) dups.push('[' + seen[k] + ']≈[' + it.section + ']' + it.head.slice(0, 24)); else seen[k] = it.section; }
fs.writeFileSync('_audit.txt',
  '=== 无效数据问题 (' + issues.length + ' 条) ===\n' + (issues.join('\n') || '无') +
  '\n\n=== 跨节重复 (' + dups.length + ' 条) ===\n' + (dups.join('\n') || '无') + '\n');
console.log('AUDIT_DONE issues=' + issues.length + ' dups=' + dups.length);
