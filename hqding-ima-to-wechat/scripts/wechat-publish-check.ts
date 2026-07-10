#!/usr/bin/env bun
/**
 * wechat-publish-check.ts —— 发布前标题/作者检查薄封装（自研，不改动 baoyu 第三方 skill）
 *
 * 职责：
 *   1. 接收 HTML（gzh-design 或任意生成器产出）及可选的 --title/--author/--cover/--submit
 *   2. 按优先级解析标题：
 *        --title
 *          > 同名 .md frontmatter 的 title
 *          > HTML <title> / <meta name="title">
 *          > 正文首个 <h1>
 *          > 【兜底】LLM 一句话总结首段（未配置 LLM 时降级为本地首段提取）
 *   3. 解析作者：--author > 固定默认 "翰桥"
 *   4. 以 --title/--author（及透传 --html/--cover/--submit）显式调用 baoyu 的 wechat-article.ts
 *      —— baoyu 永远拿不到空标题，从源头消灭"未命名文章"
 *
 * LLM 配置（可选）：在 ~/.workbuddy/.secrets/llm.env 写入
 *   LLM_API_KEY=sk-xxx
 *   LLM_BASE_URL=https://api.openai.com/v1
 *   LLM_MODEL=gpt-4o-mini
 * 未配置或调用失败时自动降级为本地首段提取，绝不报错中断。
 *
 * 用法：
 *   bun wechat-publish-check.ts --html "文章.html" --cover "封面.png" --submit
 *   bun wechat-publish-check.ts --html "文章.html" --dry-run        # 只解析标题/作者，不发布
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const HOME = process.env.HOME || process.env.USERPROFILE || '';
const SECRETS_DIR = join(HOME, '.workbuddy', '.secrets');
const BAOYU_SCRIPT = 'C:/Users/jsfc_02/.workbuddy/skills/baoyu-post-to-wechat/scripts/wechat-article.ts';
// NOTE: the managed runtime's `bun` / `bun.cmd` are launcher SHIMS (a 283-byte
// shell script / batch). Running them via execFileSync (no shell) fails with
// ENOENT because Windows cannot execute an extensionless shell script directly.
// Use the actual bun binary: prefer process.execPath (the bun running THIS
// script — the shim exec-replaces into the real exe), then an explicit path.
const BUN = process.env.WECHAT_PUBLISH_BUN
  || process.execPath
  || 'C:/Users/jsfc_02/.workbuddy/binaries/node/versions/22.22.2/node_modules/bun/bin/bun.exe';
const DEFAULT_AUTHOR = '翰桥';

function parseArgs(argv: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { o[key] = next; i += 2; }
      else { o[key] = 'true'; i += 1; }
    } else { i += 1; }
  }
  return o;
}

const args = parseArgs(process.argv.slice(2));
const htmlPath = args['html'];
if (!htmlPath) { console.error('[check] 缺少 --html <path>'); process.exit(1); }
if (!existsSync(htmlPath)) { console.error('[check] HTML 不存在: ' + htmlPath); process.exit(1); }

function readHtml(): string {
  try { return readFileSync(htmlPath, 'utf8'); } catch { return ''; }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// ① 同名 .md frontmatter 的 title
function titleFromMd(): string | null {
  const mdPath = htmlPath.replace(/\.html?$/i, '.md');
  if (!existsSync(mdPath)) return null;
  const txt = readFileSync(mdPath, 'utf8');
  const fm = txt.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const tm = fm[1].match(/title\s*[:：]\s*(.+)/);
  return tm ? tm[1].trim().replace(/^["']|["']$/g, '') : null;
}

// ② HTML <title> / <meta name="title">
function titleFromHtml(html: string): string | null {
  let m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m && m[1].trim()) return m[1].trim();
  m = html.match(/<meta\s+name=["']title["'][^>]*content=["']([^"']+)["']/i);
  if (m) return m[1].trim();
  m = html.match(/<meta\s+content=["']([^"']+)["'][^>]*name=["']title["']/i);
  if (m) return m[1].trim();
  return null;
}

// ③ 首个 <h1>
function firstH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) { const t = stripTags(m[1]).trim(); if (t) return t; }
  return null;
}

// ④ 首段文本（兜底总结用）
function firstParagraph(html: string): string {
  const text = stripTags(html);
  const cut = text.search(/[。！？\n]/);
  const para = cut > 0 ? text.slice(0, cut) : text.slice(0, 60);
  return para.trim();
}

// ④b 本地确定性兜底：首段前 N 字
function localSummary(para: string): string {
  const clean = para.replace(/[#*>`\-]/g, '').trim();
  if (!clean) return '未命名文章';
  if (clean.length <= 20) return clean;
  return clean.slice(0, 20) + '…';
}

// ④a LLM 一句话总结（可选）
async function llmSummary(para: string): Promise<string | null> {
  const envPath = join(SECRETS_DIR, 'llm.env');
  if (!existsSync(envPath)) return null;
  const envTxt = readFileSync(envPath, 'utf8');
  const get = (k: string): string => {
    const m = envTxt.match(new RegExp(k + '\\s*=\\s*(.+)'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  const key = get('LLM_API_KEY');
  const base = get('LLM_BASE_URL') || 'https://api.openai.com/v1';
  const model = get('LLM_MODEL') || 'gpt-4o-mini';
  if (!key) return null;
  try {
    const resp = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个公众号标题生成器。只返回标题本身，不要解释，不超过20个汉字。' },
          { role: 'user', content: '用一句话总结下面这段文章开头作为标题：\n\n' + para }
        ],
        temperature: 0.3,
        max_tokens: 40
      })
    });
    const j = await resp.json() as any;
    const t = j?.choices?.[0]?.message?.content?.trim();
    return t ? t.replace(/^["'【]|["'】]$/g, '') : null;
  } catch (e) {
    console.warn('[check] LLM 调用失败，降级本地提取: ' + e);
    return null;
  }
}

async function resolveTitle(html: string): Promise<string> {
  const fromArg = args['title'];
  const t = fromArg || titleFromMd() || titleFromHtml(html) || firstH1(html);
  if (t) return t;
  const para = firstParagraph(html);
  console.log('[check] 未找到显式标题，进入兜底（首段: ' + (para.slice(0, 30) + (para.length > 30 ? '…' : '')) + '）');
  const llm = await llmSummary(para);
  if (llm) { console.log('[check] 使用 LLM 一句话总结标题: ' + llm); return llm; }
  const local = localSummary(para);
  console.log('[check] 未配置/不可用 LLM，使用本地首段提取: ' + local);
  return local;
}

async function main() {
  const html = readHtml();
  const title = await resolveTitle(html);
  const author = args['author'] || DEFAULT_AUTHOR;
  console.log('[check] 最终标题: ' + title + ' | 作者: ' + author);

  if (args['dry-run']) {
    console.log('[check] --dry-run：仅解析，未调用 baoyu。');
    return;
  }

  const baoyuArgs: string[] = ['--title', title, '--author', author, '--html', htmlPath];
  if (args['cover']) baoyuArgs.push('--cover', args['cover']);
  if (args['submit']) baoyuArgs.push('--submit');

  console.log('[check] 调用 baoyu: ' + BUN + ' ' + BAOYU_SCRIPT + ' ' +
    baoyuArgs.map(a => (a.includes(' ') ? '"' + a + '"' : a)).join(' '));
  execFileSync(BUN, [BAOYU_SCRIPT, ...baoyuArgs], { stdio: 'inherit' });
}

main().catch(e => { console.error('[check] 失败: ' + e); process.exit(1); });
