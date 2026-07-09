#!/usr/bin/env node
/**
 * 稳定 IMA 知识库分发脚本（彩票简报专用）— 两步法
 *
 * 正确流程（参考 ima-knowledge-upload skill 方法A）：
 *   Step1: import_doc 创建笔记 —— 只传 {title, content, content_format}，【不传】任何知识库/文件夹 ID
 *   Step2: add_knowledge 把笔记关联到目标知识库 —— {knowledge_base_id, media_type:11, note_info:{content_id:note_id}}
 *
 * 关键教训（2026-07-08 深挖到底）：
 *   1. import_doc 是「笔记创建」接口，硬塞 knowledge_base_id / folder_id 会导致 IMA 校验变数大、
 *      不稳定返回 200002（msg=skill auth failed，有严重误导性，实际是参数/目标错误）。
 *   2. 知识库 ID 必须来自 OpenAPI 凭证视角（get_addable_knowledge_base_list，name="微信公众号知识库"），
 *      不能用 MCP 通道看到的 ID（MCP 的 7477994624936006 ≠ OpenAPI 的 5SYGbnFrd8VLhQColV0YxNKWh3u4FCeSwbSjVjKC3Vs=，
 *      传错 ID 会 220004 invalid knowledge_base_id）。
 *   3. 凭证钉死 ~/.workbuddy/.secrets/ima.env（凭证安全铁律）；绕过 ima-skill 的每日版本检查实现稳定。
 *
 * 用法: node ima_distribute.js <markdown_file_path> [title] [kb_id]
 *   title 可选；kb_id 可选，默认 DEFAULT_KB_ID。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const IMA_BASE = 'https://ima.qq.com';
const IMPORT_PATH = 'openapi/note/v1/import_doc';
const ADD_PATH = 'openapi/wiki/v1/add_knowledge';
// 注：两步法无需 ctx 头；凭证严格只读 ima.env 文件（见 loadCredentials），不使用 process.env。
const SECRETS_ENV = path.join(os.homedir(), '.workbuddy/.secrets/ima.env');
const MAX_RETRY = 3;
// 「微信公众号知识库」的 OpenAPI 正确 ID（来自 get_addable_knowledge_base_list，name="微信公众号知识库"）
// ⚠️ 不是 MCP 通道的 7477994624936006（那是另一套身份体系下的 ID，传它会 220004 invalid）
const DEFAULT_KB_ID = '5SYGbnFrd8VLhQColV0YxNKWh3u4FCeSwbSjVjKC3Vs=';
const STATE_DIR = __dirname;

// 幂等：按日期记录已分发状态，防止同一天重复产生多份简报
function stateFileFor(today) {
  return path.join(STATE_DIR, `.distributed_${today}.json`);
}
function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function loadCredentials() {
  // 主来源：集中式密钥文件（凭证安全铁律）—— 直接读取，不使用 process.env
  // ⚠️ 教训：process.env 可能被环境注入其他/默认的 IMA 凭证（如 eb46077c...），
  //    与 ima.env 文件里的正确 clientId（3c5874...）不一致，会导致 import_doc 返回 200002 权限错。
  //    故此处只信 ima.env 文件，忽略 process.env，确保用翰桥专用凭证。
  let clientId, apiKey;
  if (fs.existsSync(SECRETS_ENV)) {
    const txt = fs.readFileSync(SECRETS_ENV, 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      if (m[1] === 'IMA_OPENAPI_CLIENTID') clientId = m[2];
      if (m[1] === 'IMA_OPENAPI_APIKEY') apiKey = m[2];
    }
  }
  // fallback：~/.config/ima（仅当文件不存在时）
  if (!clientId || !apiKey) {
    const cid = path.join(os.homedir(), '.config/ima/client_id');
    const ckey = path.join(os.homedir(), '.config/ima/api_key');
    if (fs.existsSync(cid)) clientId = fs.readFileSync(cid, 'utf8').trim();
    if (fs.existsSync(ckey)) apiKey = fs.readFileSync(ckey, 'utf8').trim();
  }

  if (!clientId || !apiKey) {
    throw new Error('未找到 IMA 凭证，请检查 ~/.workbuddy/.secrets/ima.env');
  }
  return { clientId, apiKey };
}

async function callApi(apiPath, body, creds) {
  const res = await fetch(`${IMA_BASE}/${apiPath}`, {
    method: 'POST',
    headers: {
      'ima-openapi-clientid': creds.clientId,
      'ima-openapi-apikey': creds.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
  return { status: res.status, data };
}

// Step1：纯建笔记（不传任何知识库/文件夹 ID）
async function importDoc(title, content, creds) {
  return callApi(IMPORT_PATH, { title, content, content_format: 1 }, creds);
}

// Step2：关联到知识库（media_type=11 表示笔记）
async function addToKb(noteId, title, kbId, creds) {
  return callApi(ADD_PATH, {
    title,
    knowledge_base_id: kbId,
    media_type: 11,
    note_info: { content_id: noteId },
  }, creds);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node ima_distribute.js <md_file> [title] [kb_id]');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error('文件不存在: ' + file);
    process.exit(1);
  }

  const content = fs.readFileSync(file, 'utf8'); // 已是 UTF-8
  const title = process.argv[3] || path.basename(file, path.extname(file));
  const kbId = process.argv[4] || process.env.IMA_KB_ID || DEFAULT_KB_ID;
  const creds = loadCredentials();

  // —— 幂等防重发：今日已完整分发（两步都成功）则直接跳过 ——
  const today = todayStamp();
  const stateFile = stateFileFor(today);
  if (fs.existsSync(stateFile)) {
    try {
      const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (st && st.added_to_kb) {
        console.log(JSON.stringify({
          ok: true, skipped: true, reason: '今日已分发，跳过',
          note_id: st.note_id, title, stateFile,
        }));
        return;
      }
    } catch { /* 状态文件损坏则忽略，继续正常分发 */ }
  }
  // 半成功锁：import 成功但 add 失败 → 复用 note_id 重试 add，不再重新 import（避免孤立笔记堆积）
  let reuseNoteId = null;
  if (fs.existsSync(stateFile)) {
    try {
      const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (st && st.note_id && !st.added_to_kb) reuseNoteId = st.note_id;
    } catch { /* ignore */ }
  }

  let lastErr = null;
  let noteId = reuseNoteId;

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      // Step1：仅当无复用 note_id 时建笔记
      if (!noteId) {
        console.error(`[IMA] 第 ${attempt}/${MAX_RETRY} 次：import_doc 建笔记《${title}》...`);
        const r1 = await importDoc(title, content, creds);
        if (r1.status === 200 && r1.data && r1.data.code === 0 && r1.data.data && r1.data.data.note_id) {
          noteId = r1.data.data.note_id;
        } else {
          const code = (r1.data && r1.data.code) != null ? r1.data.code : '?';
          lastErr = `import_doc HTTP ${r1.status}/code=${code}/msg=${(r1.data && r1.data.msg) || ''}`;
          console.error('[IMA] import_doc 失败: ' + lastErr);
          if (attempt < MAX_RETRY) { await new Promise((r) => setTimeout(r, 5000)); continue; }
          else break;
        }
      }
      // Step2：add_knowledge 关联知识库
      console.error(`[IMA] 第 ${attempt}/${MAX_RETRY} 次：add_knowledge 关联知识库 ${kbId}...`);
      const r2 = await addToKb(noteId, title, kbId, creds);
      if (r2.status === 200 && r2.data && r2.data.code === 0) {
        // 两步成功，写完整状态锁
        try {
          fs.writeFileSync(stateFile, JSON.stringify({
            date: today, title, note_id: noteId, added_to_kb: true, kb_id: kbId, ts: Date.now(),
          }, null, 2), 'utf8');
        } catch { /* 状态锁写入失败不影响本次成功，仅失去防重发保护 */ }
        console.log(JSON.stringify({ ok: true, note_id: noteId, kb_id: kbId, title, attempt }));
        return;
      } else {
        const code = (r2.data && r2.data.code) != null ? r2.data.code : '?';
        lastErr = `add_knowledge HTTP ${r2.status}/code=${code}/msg=${(r2.data && r2.data.msg) || ''}`;
        console.error('[IMA] add_knowledge 失败: ' + lastErr);
        if (code === 220004) {
          console.error('[IMA] 220004=知识库ID无效或无权访问。请确认 kbId 来自 get_addable_knowledge_base_list（OpenAPI 视角），勿用 MCP 通道 ID');
        }
        if (attempt < MAX_RETRY) { await new Promise((r) => setTimeout(r, 5000)); continue; }
        else break;
      }
    } catch (e) {
      lastErr = e.message;
      if (attempt < MAX_RETRY) await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // 失败时若已建笔记，写半成功锁（含 note_id）以便重试 add 而不重复 import
  if (noteId) {
    try {
      fs.writeFileSync(stateFile, JSON.stringify({
        date: today, title, note_id: noteId, added_to_kb: false, kb_id: kbId, ts: Date.now(),
      }, null, 2), 'utf8');
    } catch { /* ignore */ }
  }
  console.error('[IMA] 分发失败: ' + lastErr);
  process.exit(1);
}

main();
