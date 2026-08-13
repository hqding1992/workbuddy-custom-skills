#!/usr/bin/env node
/**
 * 兜底幂等锁判定脚本（2026-08-13 方案 B 固化）
 *
 * 取代"AI 复刻 prompt 的软判定"——把分发锁的读取与判定逻辑固化为确定性脚本，
 * 彻底消除 AI 对 prompt 的理解偏差，并堵上场景 D 漏洞（半成功锁不再误判跳过）。
 *
 * 用法: node _check_distributed.js [YYYYMMDD]
 *   - 不传日期 → 用今天（兜底自动化应显式传 ${YYYYMMDD}）
 *
 * 输出（单行，供调用方解析）:
 *   DECISION=SKIP <原因> note_id=xxx
 *   DECISION=INTERVENE <原因>
 *
 * 退出码: SKIP=0, INTERVENE=1（仅作信息，主判定看 stdout 的 DECISION 字符串）
 *
 * ⚠️ 路径同步义务：PROJ / SKILL 须与 ima_distribute.js 的 STATE_DIR 及兜底 prompt
 *    描述三处保持一致。工作区迁移（换盘/换电脑）时须同步改这三处。
 */
const fs = require('fs');
const path = require('path');

// 与 ima_distribute.js STATE_DIR（修复后固定路径）及兜底约定保持一致
const PROJ  = 'E:\\.workbuddy\\每日彩票新闻\\scripts';
const SKILL = 'C:\\Users\\jsfc_02\\.workbuddy\\skills\\lottery-daily-briefing\\scripts';

function dateArg() {
  if (process.argv[2]) return process.argv[2];
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function readJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

const date = dateArg();
const projFile  = path.join(PROJ,  `.distributed_${date}.json`);
const skillFile = path.join(SKILL, `.distributed_${date}.json`);

const projSt  = readJson(projFile);
const skillSt = readJson(skillFile);

// —— 判定（场景 D 修复：半成功锁 added_to_kb:false 一律 INTERVENE，绝不误判 SKIP）——
if (projSt && projSt.added_to_kb) {
  console.log(`DECISION=SKIP 主锁已完整分发 note_id=${projSt.note_id || '-'} file=${projFile}`);
  process.exit(0);
}
if (skillSt && skillSt.added_to_kb) {
  console.log(`DECISION=SKIP 兼容锁已完整分发 note_id=${skillSt.note_id || '-'} file=${skillFile}`);
  process.exit(0);
}
// 锁存在但 added_to_kb:false（import 成功 / add 失败的半成功残留）→ 必须补发，不能跳过
if (projSt || skillSt) {
  const where = projSt ? projFile : skillFile;
  console.log(`DECISION=INTERVENE 存在半成功锁(added_to_kb:false)，需补发重试 file=${where}`);
  process.exit(1);
}
console.log(`DECISION=INTERVENE 无分发锁，需介入补全 date=${date}`);
process.exit(1);
