import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChrome, tryConnectExisting, findExistingChromeDebugPort, getPageSession, waitForNewTab, clickElement, typeText, evaluate, sleep, getAccountProfileDir, type ChromeSession, type CdpConnection } from './cdp.ts';
import { loadWechatExtendConfig, resolveAccount } from './wechat-extend-config.ts';
import { prepareWechatBodyImageUpload } from './wechat-image-processor.ts';

const WECHAT_URL = 'https://mp.weixin.qq.com/';
const BODY_EDITOR_SELECTOR = '.rich_media_content .ProseMirror';

interface ImageInfo {
  placeholder: string;
  localPath: string;
  originalPath: string;
}

interface ArticleOptions {
  title: string;
  content?: string;
  htmlFile?: string;
  markdownFile?: string;
  theme?: string;
  color?: string;
  citeStatus?: boolean;
  author?: string;
  summary?: string;
  images?: string[];
  contentImages?: ImageInfo[];
  cover?: string;
  submit?: boolean;
  profileDir?: string;
  cdpPort?: number;
}

async function sendQrToTelegram(session: ChromeSession): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  // Wait for QR to render before extracting
  await sleep(2000);

  try {
    // Try to extract QR image from DOM first (avoids full-page screenshot noise)
    const domResult = await session.cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
      expression: `
        (function() {
          const selectors = [
            '.login__type__container__scan img',
            '.login_img img',
            '#login_container img',
            '.qrcode img',
            'img[src*="qrcode"]',
            'img[src*="login"]',
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el?.src && !el.src.startsWith('data:,')) return el.src.startsWith('data:') ? el.src : 'url:' + el.src;
          }
          const canvas = document.querySelector('canvas');
          if (canvas) try { return canvas.toDataURL('image/png'); } catch {}
          return '';
        })()
      `,
      returnByValue: true,
    }, { sessionId: session.sessionId });

    const raw = (domResult.result.value as string) ?? '';
    let imgBuffer: Buffer;

    if (raw.startsWith('data:image')) {
      imgBuffer = Buffer.from(raw.split(',')[1] ?? '', 'base64');
    } else if (raw.startsWith('url:')) {
      // Fetch inside Chrome to carry WeChat session cookies
      const imgUrl = raw.slice(4);
      const inBrowserFetch = await session.cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
        expression: `
          (async () => {
            const resp = await fetch(${JSON.stringify(imgUrl)}, { credentials: 'include' });
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let b = '';
            for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
            return btoa(b);
          })()
        `,
        returnByValue: true,
        awaitPromise: true,
      }, { sessionId: session.sessionId });
      imgBuffer = Buffer.from((inBrowserFetch.result.value as string) ?? '', 'base64');
    } else {
      // Fallback: viewport screenshot (smaller than full-page; QR is usually in viewport)
      const screenshotResp = await session.cdp.send<{ data: string }>(
        'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, { sessionId: session.sessionId }
      );
      imgBuffer = Buffer.from(screenshotResp.data ?? '', 'base64');
    }

    const boundary = `tgboundary${Date.now()}`;
    const parts: Buffer[] = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\nWeChat QR code — please scan to log in\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="qr.png"\r\nContent-Type: image/png\r\n\r\n`),
      imgBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat(parts),
      signal: AbortSignal.timeout(10_000),
    });
    const tgJson = await tgResp.json() as { ok: boolean; description?: string };
    if (tgJson.ok) {
      console.log('[wechat] QR code sent to Telegram.');
    } else {
      console.error('[wechat] Telegram send failed:', tgJson.description);
    }
  } catch (err) {
    console.error('[wechat] Failed to send QR to Telegram:', err);
  }
}

async function waitForLogin(session: ChromeSession, timeoutMs = 120_000): Promise<boolean> {
  // Notify via Telegram if configured (no-op when env vars absent)
  await sendQrToTelegram(session);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = await evaluate<string>(session, 'window.location.href');
    if (url.includes('/cgi-bin/home')) return true;
    await sleep(2000);
  }
  return false;
}

async function waitForElement(session: ChromeSession, selector: string, timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await evaluate<boolean>(session, `!!document.querySelector('${selector}')`);
    if (found) return true;
    await sleep(500);
  }
  return false;
}

async function clickMenuByText(session: ChromeSession, text: string, maxRetries = 5): Promise<void> {
  console.log(`[wechat] Clicking "${text}" menu...`);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const posResult = await session.cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
      expression: `
        (function() {
          const items = document.querySelectorAll('.new-creation__menu .new-creation__menu-item');
          for (const item of items) {
            const title = item.querySelector('.new-creation__menu-title');
            if (title && title.textContent?.trim() === '${text}') {
              item.scrollIntoView({ block: 'center' });
              const rect = item.getBoundingClientRect();
              return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
            }
          }
          return 'null';
        })()
      `,
      returnByValue: true,
    }, { sessionId: session.sessionId });

    if (posResult.result.value !== 'null') {
      const pos = JSON.parse(posResult.result.value);
      await session.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
      await sleep(100);
      await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
      return;
    }

    if (attempt < maxRetries) {
      const delay = Math.min(1000 * attempt, 3000);
      console.log(`[wechat] Menu "${text}" not found, retrying in ${delay}ms (${attempt}/${maxRetries})...`);
      await sleep(delay);
    }
  }
  throw new Error(`Menu "${text}" not found after ${maxRetries} attempts`);
}

async function copyImageToClipboard(imagePath: string): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const copyScript = path.join(__dirname, './copy-to-clipboard.ts');
  const result = spawnSync('npx', ['-y', 'bun', copyScript, 'image', imagePath], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Failed to copy image: ${imagePath}`);
}

async function pasteInEditor(session: ChromeSession): Promise<void> {
  const modifiers = process.platform === 'darwin' ? 4 : 2;
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId: session.sessionId });
  await sleep(50);
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId: session.sessionId });
}

async function sendCopy(cdp?: CdpConnection, sessionId?: string): Promise<void> {
  if (cdp && sessionId) {
    const modifiers = process.platform === 'darwin' ? 4 : 2;
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', modifiers, windowsVirtualKeyCode: 67 }, { sessionId });
    await sleep(50);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', modifiers, windowsVirtualKeyCode: 67 }, { sessionId });
  } else if (process.platform === 'darwin') {
    spawnSync('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down']);
  } else if (process.platform === 'linux') {
    spawnSync('xdotool', ['key', 'ctrl+c']);
  }
}

async function sendPaste(cdp?: CdpConnection, sessionId?: string): Promise<void> {
  if (!cdp || !sessionId) {
    throw new Error('Targeted paste requires a Chrome DevTools session');
  }

  const modifiers = process.platform === 'darwin' ? 4 : 2;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId });
  await sleep(50);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers, windowsVirtualKeyCode: 86 }, { sessionId });
}

async function copyHtmlFromBrowser(cdp: CdpConnection, htmlFilePath: string, contentImages: ImageInfo[] = []): Promise<void> {
  const absolutePath = path.isAbsolute(htmlFilePath) ? htmlFilePath : path.resolve(process.cwd(), htmlFilePath);
  const fileUrl = `file://${absolutePath}`;

  console.log(`[wechat] Opening HTML file in new tab: ${fileUrl}`);

  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: fileUrl });
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });

  await cdp.send('Page.enable', {}, { sessionId });
  await cdp.send('Runtime.enable', {}, { sessionId });
  await sleep(2000);

  if (contentImages.length > 0) {
    console.log('[wechat] Replacing img tags with placeholders for browser paste...');
    const replacements = contentImages.map(img => ({ placeholder: img.placeholder, localPath: img.localPath }));
    await cdp.send<{ result: { value: unknown } }>('Runtime.evaluate', {
      expression: `
        (function() {
          const replacements = ${JSON.stringify(replacements)};
          for (const r of replacements) {
            const imgs = document.querySelectorAll('img[src="' + r.placeholder + '"], img[data-local-path="' + r.localPath + '"]');
            for (const img of imgs) {
              const text = document.createTextNode(r.placeholder);
              img.parentNode.replaceChild(text, img);
            }
          }
          return true;
        })()
      `,
      returnByValue: true,
    }, { sessionId });
    await sleep(500);
  }

  console.log('[wechat] Selecting #output content...');
  await cdp.send<{ result: { value: unknown } }>('Runtime.evaluate', {
    expression: `
      (function() {
        const output = document.querySelector('#output') || document.body;
        const range = document.createRange();
        range.selectNodeContents(output);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      })()
    `,
    returnByValue: true,
  }, { sessionId });
  await sleep(300);

  console.log('[wechat] Activating HTML tab for copy...');
  await cdp.send('Target.activateTarget', { targetId });
  await sleep(300);

  console.log('[wechat] Copying content...');
  await sendCopy(cdp, sessionId);
  await sleep(1000);

  console.log('[wechat] Closing HTML tab...');
  await cdp.send('Target.closeTarget', { targetId });
}

async function pasteFromClipboardInEditor(session: ChromeSession): Promise<void> {
  console.log('[wechat] Activating editor tab for paste...');
  if (session.targetId) {
    await session.cdp.send('Target.activateTarget', { targetId: session.targetId });
    await sleep(300);
  }
  console.log('[wechat] Pasting content...');
  await sendPaste(session.cdp, session.sessionId);
  await sleep(1000);
}

async function insertHtmlIntoEditorFromFile(
  session: ChromeSession,
  htmlFilePath: string,
  contentImages: ImageInfo[] = [],
): Promise<void> {
  const absolutePath = path.isAbsolute(htmlFilePath) ? htmlFilePath : path.resolve(process.cwd(), htmlFilePath);
  const html = fs.readFileSync(absolutePath, 'utf8');
  const replacements = contentImages.map(img => ({ placeholder: img.placeholder, localPath: img.localPath }));

  const result = await session.cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
    expression: `
      (function() {
        const editor = document.querySelector(${JSON.stringify(BODY_EDITOR_SELECTOR)});
        if (!editor) return JSON.stringify({ ok: false, reason: 'editor-missing' });

        const template = document.createElement('template');
        template.innerHTML = ${JSON.stringify(html)};
        const replacements = ${JSON.stringify(replacements)};

        for (const img of Array.from(template.content.querySelectorAll('img'))) {
          const src = img.getAttribute('src') || '';
          const localPath = img.getAttribute('data-local-path') || '';
          const replacement = replacements.find((item) => item.placeholder === src || item.localPath === localPath);
          if (replacement) {
            img.replaceWith(document.createTextNode(replacement.placeholder));
          }
        }

        const output = template.content.querySelector('#output');
        const wrapper = document.createElement('div');
        if (output) {
          wrapper.innerHTML = output.innerHTML;
        } else {
          wrapper.appendChild(template.content.cloneNode(true));
        }

        editor.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.deleteContents();
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        const inserted = document.execCommand('insertHTML', false, wrapper.innerHTML);
        editor.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertHTML',
          data: wrapper.innerText || ''
        }));

        return JSON.stringify({
          ok: inserted || (editor.innerText || '').trim().length > 0,
          textLength: (editor.innerText || '').trim().length
        });
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });

  const parsed = JSON.parse(result.result.value || '{}') as { ok?: boolean; reason?: string; textLength?: number };
  if (!parsed.ok) {
    throw new Error(`Failed to insert HTML into body editor${parsed.reason ? `: ${parsed.reason}` : ''}`);
  }
}

async function verifyTitleUnchangedBeforeSave(session: ChromeSession, expectedTitle: string): Promise<void> {
  if (!expectedTitle) return;

  const actualTitle = await evaluate<string>(session, `document.querySelector('#title')?.value || ''`);
  if (actualTitle !== expectedTitle) {
    throw new Error(`Title was modified during paste. Expected: "${expectedTitle}", got: "${actualTitle}"`);
  }
}

// Auto-set the draft cover thumbnail via the editor's cover UI.
// WeChat's browser (CDP) publish path previously had NO cover handling
// (unlike the API path which sets thumb_media_id), causing drafts to save
// without a cover thumbnail. This aligns the two paths. Selectors are
// best-effort/candidate-based because WeChat's DOM may change; on any
// failure it degrades gracefully to a warning (manual cover pick).
async function setCover(session: ChromeSession, coverPath: string): Promise<boolean> {
  const localPath = path.isAbsolute(coverPath) ? coverPath : path.resolve(process.cwd(), coverPath);
  if (!fs.existsSync(localPath)) {
    console.warn(`[wechat] Cover file not found: ${localPath}; skipping auto cover.`);
    return false;
  }
  try {
    // Helper: click an element (or the first matching element) using a realistic
    // mouse event sequence so WeChat's React editor registers the interaction.
    // --- Reliable clicking via REAL CDP mouse input (not synthetic events). ---
    // Synthetic dispatchEvent often fails to trigger WeChat's React handlers,
    // which is exactly why earlier attempts showed "clicked but no reaction".
    const activateTab = async () => {
      await session.cdp.send('Target.activateTarget', { targetId: session.targetId }).catch(() => {});
      await sleep(120);
    };
    const locate = async (finderSrc: string): Promise<{ x: number; y: number } | null> => {
      const res = await evaluate<string>(session, `(function(){${finderSrc}})()`);
      if (!res || res === 'null') return null;
      try { const p = JSON.parse(res); if (typeof p.x === 'number') return p; } catch {}
      return null;
    };
    const clickBy = async (finderSrc: string): Promise<boolean> => {
      const pos = await locate(finderSrc);
      if (!pos) return false;
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      // Move cursor to the target first so the browser registers the hover/enter
      // events, then press and release at the same coordinates.
      await session.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y,
      }, { sessionId: session.sessionId });
      await sleep(80);
      await session.cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x, y, button: 'left', clickCount: 1,
      }, { sessionId: session.sessionId });
      await sleep(80);
      await session.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
      }, { sessionId: session.sessionId });
      await sleep(80);
      return true;
    };
    const selFinder = (sel: string) => {
      const s = JSON.stringify(sel);
      return `var el=document.querySelector(${s});if(!el)return 'null';var r0=el.getBoundingClientRect();if(r0.width<=0||r0.height<=0)return 'null';el.scrollIntoView({block:'center',behavior:'instant'});var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});`;
    };
    const textFinder = (txt: string, exact: boolean) => {
      const t = JSON.stringify(txt);
      const cmp = exact ? `t===${t}` : `t.indexOf(${t})>=0`;
      return `var els=Array.from(document.querySelectorAll('*')).filter(function(e){var t=(e.textContent||'').trim();var r=e.getBoundingClientRect();return ${cmp}&&r.width>0&&r.height>0;});if(!els.length)return 'null';els.sort(function(a,b){var ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return ra.width*ra.height-rb.width*rb.height;});var el=els[0];var leaf=els.find(function(e){return e.children.length===0;});if(leaf)el=leaf;el.scrollIntoView({block:'center',behavior:'instant'});var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});`;
    };
    const clickableTextFinder = (txt: string, exact: boolean) => {
      const t = JSON.stringify(txt);
      const cmp = exact ? `t===${t}` : `t.indexOf(${t})>=0`;
      return `var els=Array.from(document.querySelectorAll('*')).filter(function(e){var t=(e.textContent||'').trim();var r=e.getBoundingClientRect();return ${cmp}&&r.width>0&&r.height>0;});if(!els.length)return 'null';els.sort(function(a,b){var ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return ra.width*ra.height-rb.width*rb.height;});var target=els[0];while(target&&target.parentElement){var tag=target.tagName.toLowerCase();var cls=(''+target.className);if(tag==='a'||tag==='button'||target.getAttribute('role')==='button'||cls.indexOf('button')>=0||cls.indexOf('btn')>=0||target.onclick)break;target=target.parentElement;}if(!target)return 'null';target.scrollIntoView({block:'center',behavior:'instant'});var r=target.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});`;
    };
    const imageItemFinder = () => {
      return `var titleEl=Array.from(document.querySelectorAll('*')).find(function(e){return (e.textContent||'').trim()==='选择图片';});var dialog=titleEl?titleEl.closest('.weui-desktop-dialog'):null;var bd=dialog?dialog.querySelector('.weui-desktop-dialog__bd'):null;if(!bd){var panels=document.querySelectorAll('[class*="dialog"],[class*="Dialog"],[class*="panel"],[class*="Panel"],[class*="pop"],[class*="Pop"]');for(var i=0;i<panels.length;i++){var rp=panels[i].getBoundingClientRect();if(rp.width>0&&rp.height>0){bd=panels[i];break;}}}if(!bd)return 'null';var all=Array.from(bd.querySelectorAll('*'));var target=all.find(function(e){var cn=(''+e.className);var r=e.getBoundingClientRect();var bg=window.getComputedStyle(e).backgroundImage;return r.width>50&&r.height>50&&bg&&bg!=='none'&&bg.indexOf('url(')>=0&&(cn.indexOf('content_img')>=0||cn.indexOf('img_item')>=0);});if(!target){target=all.find(function(e){var cn=(''+e.className);var r=e.getBoundingClientRect();return r.width>50&&r.height>50&&(cn.indexOf('content_img_item')>=0||cn.indexOf('content_img')>=0);});}if(!target)return 'null';target.scrollIntoView({block:'center',behavior:'instant'});var r=target.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});`;
    };

    await activateTab();

    // 1. Click the cover trigger to open the dropdown menu.
    // Do NOT assume the menu is already open; always click the cover area first
    // to avoid false-positive text matches elsewhere in the editor.
    const coverSelectors = [
      '.js_cover_btn_area',
      '.select-cover__btn',
      '#js_cover',
      '.js_cover_area',
      '.cover_area',
      '.appmsg_cover',
      '[id*="cover"]',
      'img[id*="cover"]',
    ];
    let triggerClicked = false;
    for (const sel of coverSelectors) {
      if (await clickBy(selFinder(sel))) { triggerClicked = true; console.log(`[wechat] Cover trigger clicked: ${sel}`); break; }
    }
    if (!triggerClicked) {
      // Fallback: click placeholder area above title.
      const fb = `var title=document.querySelector('input[placeholder*="标题"],#title');var all=Array.from(document.querySelectorAll('div,span,img,button,a'));var cand=all.filter(function(el){var r1=el.getBoundingClientRect();if(r1.width<=0||r1.height<=0)return false;if(title&&title.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)return false;var rect=el.getBoundingClientRect();if(rect.width<40||rect.height<40)return false;var text=(el.textContent||'').trim();return text==='+'||text===''||/封面|cover|添加封面|点击添加/.test(text);});if(!cand.length)return 'null';cand.sort(function(a,b){return a.getBoundingClientRect().top-b.getBoundingClientRect().top;});var el=cand[0];el.scrollIntoView({block:'center',behavior:'instant'});var r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});`;
      if (await clickBy(fb)) { triggerClicked = true; console.log('[wechat] Cover trigger clicked via fallback.'); }
    }
    if (!triggerClicked) {
      console.warn('[wechat] Cover trigger not found; please set cover manually.');
      return false;
    }
    await sleep(2500);

    // 2. Wait for and click the "从正文选择" menu item.
    // The menu item is sometimes flaky: the dropdown closes but the picker dialog does not open.
    // We verify the dialog actually opens; if not, we try a JS click fallback and then retry.
    const checkFromBodyDialogOpen = () => {
      return `var titleEl=Array.from(document.querySelectorAll('*')).find(function(e){return (e.textContent||'').trim()==='选择图片';});var dialog=titleEl?titleEl.closest('.weui-desktop-dialog'):null;if(dialog){var r=dialog.getBoundingClientRect();if(r.width>0&&r.height>0){var sub=(dialog.textContent||'').replace(/\\s+/g,' ');if(sub.indexOf('从正文插入')>=0||sub.indexOf('视频封面')>=0||sub.indexOf('本地封面')>=0)return 'open';}}var bodyList=Array.from(document.querySelectorAll('*')).find(function(e){var cn=(''+e.className);var r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(cn.indexOf('content_img_list')>=0||cn.indexOf('content_img_item')>=0);});if(bodyList)return 'open';return 'null';`;
    };
    // Diagnostic: dump the DOM structure around the "从正文选择" menu item before clicking.
    let fromBodyClicked = false;
    let menuAttempts = 0;
    const maxMenuAttempts = 3;
    while (!fromBodyClicked && menuAttempts < maxMenuAttempts) {
      menuAttempts++;
      if (menuAttempts > 1) {
        console.log(`[wechat] Re-opening cover menu (attempt ${menuAttempts})...`);
        await clickBy(selFinder('.js_cover_btn_area'));
        await sleep(2500);
      }
      const startWaitMenu = Date.now();
      while (Date.now() - startWaitMenu < 6000) {
        // Primary: WeChat's exact menu button class for "从正文选择".
        if (await clickBy(selFinder('.js_selectCoverFromContent'))) {
          await sleep(3000);
          if (await locate(imageItemFinder()) !== null) {
            fromBodyClicked = true;
            break;
          }
        }
        // Fallback: text-based clickable finder.
        if (await clickBy(clickableTextFinder('从正文选择', false))) {
          await sleep(3000);
          if (await locate(imageItemFinder()) !== null) {
            fromBodyClicked = true;
            break;
          }
          console.log('[wechat] CDP click did not reveal a pickable image; trying JS fallback on exact class...');
          try {
            await evaluate(session, `(function(){var el=document.querySelector('.js_selectCoverFromContent');if(el){el.click();return 'clicked';}return 'not-found';})()`);
          } catch (e) {}
          await sleep(3000);
          if (await locate(imageItemFinder()) !== null) {
            fromBodyClicked = true;
            break;
          }
          console.log('[wechat] JS fallback also did not reveal a pickable image; will retry.');
        }
        await sleep(400);
      }
      if (fromBodyClicked) break;
    }
    if (!fromBodyClicked) {
      console.warn('[wechat] Cover dropdown menu item 从正文选择 not found or picker dialog did not open; please set cover manually.');
      return false;
    }
    console.log('[wechat] Clicked 从正文选择.');
    await sleep(1500);

    // 4. Wait for the image picker panel and select the first body image.
    let picked = false;
    const startWaitPick = Date.now();
    while (Date.now() - startWaitPick < 10000) {
      picked = await clickBy(imageItemFinder());
      if (picked) break;
      await sleep(500);
    }
    if (!picked) {
      console.warn('[wechat] No cover image to pick; please set cover manually.');
      return false;
    }
    console.log('[wechat] Selected cover image from body.');
    await sleep(1500);

    // 5. Click the "下一步" (Next) button on the picker panel.
    // We wait for the text to appear because WeChat renders it asynchronously.
    let nextFound = false;
    const startWaitNext = Date.now();
    while (Date.now() - startWaitNext < 12000) {
      nextFound = await clickBy(clickableTextFinder('下一步', true));
      if (nextFound) break;
      await sleep(500);
    }
    if (!nextFound) {
      console.warn('[wechat] 下一步 button not found after waiting; please set cover manually.');
      return false;
    }
    console.log('[wechat] Clicked 下一步.');
    // 5.5 Wait for the "编辑封面" crop dialog to finish loading (image visible, spinner gone).
    const cropReadyFinder = () => {
      return `var titleEl=Array.from(document.querySelectorAll('*')).find(function(e){return (e.textContent||'').trim()==='编辑封面';});var dialog=titleEl?titleEl.closest('.weui-desktop-dialog'):null;var bd=dialog?dialog.querySelector('.weui-desktop-dialog__bd'):null;if(!bd)return 'null';var all=Array.from(bd.querySelectorAll('*'));var img=all.find(function(e){if(e.tagName==='IMG'){var r=e.getBoundingClientRect();return r.width>50&&r.height>50;}var r=e.getBoundingClientRect();var bg=window.getComputedStyle(e).backgroundImage;return r.width>50&&r.height>50&&bg&&bg!=='none'&&bg.indexOf('url(')>=0;});if(!img)return 'null';img.scrollIntoView({block:'center',behavior:'instant'});var r=img.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});`;
    };
    let cropReady = false;
    const startWaitCrop = Date.now();
    while (Date.now() - startWaitCrop < 15000) {
      cropReady = await locate(cropReadyFinder()) !== null;
      if (cropReady) break;
      await sleep(500);
    }
    if (!cropReady) {
      console.warn('[wechat] Crop dialog still loading after 15s; proceeding to confirm anyway.');
    } else {
      console.log('[wechat] Crop dialog loaded.');
    }

    // 6. Handle the edit-cover crop dialog: click "确认" in the crop dialog footer,
    // then verify the dialog actually closes before saving.
    const cropDialogOpen = () => {
      return `var dialogs=Array.from(document.querySelectorAll('.weui-desktop-dialog'));var cropDialog=dialogs.find(function(d){var t=(d.textContent||'').replace(/\\s+/g,' ');return t.indexOf('编辑封面')>=0&&t.indexOf('确认')>=0&&d.getBoundingClientRect().height>50;});if(!cropDialog)return 'closed';var btn=cropDialog.querySelector('.weui-desktop-btn_primary');if(!btn)return 'closed';var r=btn.getBoundingClientRect();return (r.width>0&&r.height>0)?'open':'closed';`;
    };
    const cropConfirmFinder = () => {
      // Return the CENTER of the primary 确认 button (more reliable than a corner offset).
      return `var titleEl=Array.from(document.querySelectorAll('*')).find(function(e){return (e.textContent||'').trim()==='编辑封面';});var dialog=titleEl?titleEl.closest('.weui-desktop-dialog'):null;if(!dialog)return 'null';var ft=dialog.querySelector('.weui-desktop-dialog__ft');if(!ft)return 'null';var btn=ft.querySelector('.weui-desktop-btn_primary');if(!btn){btn=Array.from(ft.querySelectorAll('.weui-desktop-btn, button, a')).find(function(e){return (e.textContent||'').trim().indexOf('确认')>=0;});}if(!btn)return 'null';btn.scrollIntoView({block:'center',behavior:'instant'});var r=btn.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});`;
    };

    // Click 确认 once via a real CDP mouse event at the button center (the reliable
    // fix for WeChat's React handler), then poll until the crop dialog unmounts.
    // WeChat closes it asynchronously, so a missing/unmounted dialog is the success
    // signal — not an immediate 'closed' right after the click.
    let confirmClosed = false;
    let strategy = '';
    const startWaitConfirm = Date.now();

    const pos0 = await locate(cropConfirmFinder());
    if (pos0) {
      await clickBy(cropConfirmFinder());
      console.log('[wechat] Clicked 确认 (crop dialog).');
    }
    while (Date.now() - startWaitConfirm < 20000) {
      await sleep(1500);
      const state = await evaluate<string>(session, cropDialogOpen());
      if (state === 'closed') { confirmClosed = true; strategy = 'CDP-center'; break; }
      // If the 确认 button itself is gone, the dialog has unmounted -> success.
      const stillThere = await locate(cropConfirmFinder());
      if (!stillThere) { confirmClosed = true; strategy = 'unmounted'; break; }
    }

    // Silent fallback (no diagnostics): JS .click() on the primary button if still open.
    if (!confirmClosed) {
      try {
        await evaluate(session, `var b=document.querySelector('.weui-desktop-dialog__ft .weui-desktop-btn_primary');if(b){b.focus();b.click();}`);
      } catch (e) {}
      await sleep(2000);
      const state = await evaluate<string>(session, cropDialogOpen());
      if (state === 'closed') { confirmClosed = true; strategy = 'js-fallback'; }
    }
    if (confirmClosed) console.log('[wechat] Crop dialog closed via: ' + strategy);

    if (!confirmClosed) {
      console.warn('[wechat] 确认 button did not close crop dialog; please set cover manually.');
      return false;
    }

    console.log('[wechat] Cover auto-set completed.');
    return true;
  } catch (e) {
    console.warn(`[wechat] Auto cover failed: ${e}; please set cover manually in editor.`);
    return false;
  }
}

async function prepareEditorPasteTarget(
  session: ChromeSession,
  context: string,
  options: { clickEditor?: boolean } = {},
): Promise<void> {
  await session.cdp.send('Target.activateTarget', { targetId: session.targetId }).catch(() => {});
  await sleep(100);

  if (options.clickEditor) {
    await clickElement(session, BODY_EDITOR_SELECTOR);
    await sleep(200);
  }

  const ready = await evaluate<boolean>(session, `
    (function() {
      const editor = document.querySelector(${JSON.stringify(BODY_EDITOR_SELECTOR)});
      if (!editor) return false;

      const active = document.activeElement;
      const selection = window.getSelection();
      const selectionInEditor = !!selection && selection.rangeCount > 0 && !!selection.anchorNode && editor.contains(selection.anchorNode);
      const focusInEditor = !!active && (active === editor || editor.contains(active));
      const activeIsUnsafeInput = !!active && (
        active.matches?.('#title, #author, #js_description') ||
        ((active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !editor.contains(active))
      );
      if (activeIsUnsafeInput) return false;
      if (selectionInEditor || focusInEditor) return true;

      if (${JSON.stringify(Boolean(options.clickEditor))}) {
        editor.focus();
        const nextActive = document.activeElement;
        return nextActive === editor || editor.contains(nextActive);
      }

      return false;
    })()
  `);

  if (ready) return;

  const activeElement = await evaluate<string>(session, `
    (function() {
      const el = document.activeElement;
      if (!el) return '(none)';
      const id = el.id ? '#' + el.id : '';
      const className = typeof el.className === 'string' && el.className ? '.' + el.className.split(/\\s+/).join('.') : '';
      return el.tagName.toLowerCase() + id + className;
    })()
  `);
  throw new Error(`Body editor is not focused before ${context}; active element: ${activeElement}`);
}

async function parseMarkdownWithPlaceholders(
  markdownPath: string,
  theme?: string,
  color?: string,
  citeStatus: boolean = true
): Promise<{ title: string; author: string; summary: string; htmlPath: string; contentImages: ImageInfo[] }> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const mdToWechatScript = path.join(__dirname, 'md-to-wechat.ts');
  const args = ['-y', 'bun', mdToWechatScript, markdownPath];
  if (theme) args.push('--theme', theme);
  if (color) args.push('--color', color);
  if (!citeStatus) args.push('--no-cite');

  const result = spawnSync('npx', args, { stdio: ['inherit', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    throw new Error(`Failed to parse markdown: ${stderr}`);
  }

  const output = result.stdout.toString();
  return JSON.parse(output);
}

function parseHtmlMeta(htmlPath: string): { title: string; author: string; summary: string; contentImages: ImageInfo[] } {
  const content = fs.readFileSync(htmlPath, 'utf-8');

  let title = '';
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1]!;

  let author = '';
  const authorMatch = content.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i)
    || content.match(/<meta\s+content=["']([^"']+)["']\s+name=["']author["']/i);
  if (authorMatch) author = authorMatch[1]!;

  let summary = '';
  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
    || content.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  if (descMatch) summary = descMatch[1]!;

  if (!summary) {
    const firstPMatch = content.match(/<p[^>]*>([^<]+)<\/p>/i);
    if (firstPMatch) {
      const text = firstPMatch[1]!.replace(/<[^>]+>/g, '').trim();
      if (text.length > 20) {
        summary = text.length > 120 ? text.slice(0, 117) + '...' : text;
      }
    }
  }

  const mdPath = htmlPath.replace(/\.html$/i, '.md');
  if (fs.existsSync(mdPath)) {
    const mdContent = fs.readFileSync(mdPath, 'utf-8');
    const fmMatch = mdContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      const lines = fmMatch[1]!.split('\n');
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          let value = line.slice(colonIdx + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (key === 'title' && !title) title = value;
          if (key === 'author' && !author) author = value;
          if ((key === 'description' || key === 'summary') && !summary) summary = value;
        }
      }
    }
  }

  const contentImages: ImageInfo[] = [];
  const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  const matches = [...content.matchAll(imgRegex)];
  for (const match of matches) {
    const [fullTag, src] = match;
    if (!src || src.startsWith('http')) continue;
    const localPathMatch = fullTag.match(/data-local-path=["']([^"']+)["']/);
    if (localPathMatch) {
      contentImages.push({
        placeholder: src,
        localPath: localPathMatch[1]!,
        originalPath: src,
      });
    }
  }

  return { title, author, summary, contentImages };
}

async function selectAndReplacePlaceholder(session: ChromeSession, placeholder: string): Promise<boolean> {
  const result = await session.cdp.send<{ result: { value: boolean } }>('Runtime.evaluate', {
    expression: `
      (function() {
        const editor = document.querySelector(${JSON.stringify(BODY_EDITOR_SELECTOR)});
        if (!editor) return false;

        const placeholder = ${JSON.stringify(placeholder)};
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        let node;

        while ((node = walker.nextNode())) {
          const text = node.textContent || '';
          let searchStart = 0;
          let idx;
          // Search for exact match (not prefix of longer placeholder like XIMGPH_1 in XIMGPH_10)
          while ((idx = text.indexOf(placeholder, searchStart)) !== -1) {
            const afterIdx = idx + placeholder.length;
            const charAfter = text[afterIdx];
            // Exact match if next char is not a digit
            if (charAfter === undefined || !/\\d/.test(charAfter)) {
              node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              editor.focus();

              const range = document.createRange();
              range.setStart(node, idx);
              range.setEnd(node, idx + placeholder.length);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              return true;
            }
            searchStart = afterIdx;
          }
        }
        return false;
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });

  return result.result.value;
}

async function pressDeleteKey(session: ChromeSession): Promise<void> {
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId: session.sessionId });
  await sleep(50);
  await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, { sessionId: session.sessionId });
}

async function removeExtraEmptyLineAfterImage(session: ChromeSession): Promise<boolean> {
  const removed = await evaluate<boolean>(session, `
    (function() {
      const editor = document.querySelector(${JSON.stringify(BODY_EDITOR_SELECTOR)});
      if (!editor) return false;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;

      let node = sel.anchorNode;
      if (!node) return false;
      let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!element || !editor.contains(element)) return false;

      const isEmptyParagraph = (el) => {
        if (!el || el.tagName !== 'P') return false;
        const text = (el.textContent || '').trim();
        if (text.length > 0) return false;
        return el.querySelectorAll('img, figure, video, iframe').length === 0;
      };

      const hasImage = (el) => {
        if (!el) return false;
        return !!el.querySelector('img, figure img, picture img');
      };

      const placeCursorAfter = (el) => {
        if (!el) return;
        const range = document.createRange();
        range.setStartAfter(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      };

      // Case 1: caret is inside an empty paragraph right after an image block.
      const emptyPara = element.closest('p');
      if (emptyPara && editor.contains(emptyPara) && isEmptyParagraph(emptyPara)) {
        const prev = emptyPara.previousElementSibling;
        if (prev && hasImage(prev)) {
          emptyPara.remove();
          placeCursorAfter(prev);
          return true;
        }
      }

      // Case 2: caret is on the image block itself; remove the next empty paragraph.
      const imageBlock = element.closest('figure, p');
      if (imageBlock && editor.contains(imageBlock) && hasImage(imageBlock)) {
        const next = imageBlock.nextElementSibling;
        if (next && isEmptyParagraph(next)) {
          next.remove();
          placeCursorAfter(imageBlock);
          return true;
        }
      }

      return false;
    })()
  `);

  if (removed) console.log('[wechat] Removed extra empty line after image.');
  return removed;
}

async function getBodyImageCount(session: ChromeSession): Promise<number> {
  return await evaluate<number>(session, `
    (function() {
      const editor = document.querySelector(${JSON.stringify(BODY_EDITOR_SELECTOR)});
      if (!editor) return 0;
      return Array.from(editor.querySelectorAll('img')).filter((img) => !img.classList.contains('ProseMirror-separator')).length;
    })()
  `);
}

async function waitForBodyImageCount(session: ChromeSession, minimumCount: number, timeoutMs = 45_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await getBodyImageCount(session);
    if (count >= minimumCount) return true;
    await sleep(500);
  }
  return false;
}

function inferImageContentType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function uploadImagePathThroughFileInput(
  session: ChromeSession,
  absolutePath: string,
  beforeCount: number,
): Promise<void> {
  const documentNode = await session.cdp.send<{ root: { nodeId: number } }>('DOM.getDocument', {
    depth: -1,
    pierce: true,
  }, { sessionId: session.sessionId });
  const inputNode = await session.cdp.send<{ nodeId: number }>('DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector: 'input[type="file"][accept*="image"]',
  }, { sessionId: session.sessionId });

  if (!inputNode.nodeId) throw new Error('WeChat local image upload input not found');

  await session.cdp.send('DOM.setFileInputFiles', {
    nodeId: inputNode.nodeId,
    files: [absolutePath],
  }, { sessionId: session.sessionId });

  const inserted = await waitForBodyImageCount(session, beforeCount + 1);
  if (!inserted) {
    const afterCount = await getBodyImageCount(session);
    throw new Error(`Image upload did not insert into editor: ${path.basename(absolutePath)} (${beforeCount} -> ${afterCount})`);
  }
}

interface FallbackUploadImage {
  uploadPath: string;
  wasProcessed: boolean;
  processingNotes: string[];
  cleanup: () => void;
}

async function prepareFallbackWechatBodyImageUpload(absolutePath: string): Promise<FallbackUploadImage> {
  const buffer = fs.readFileSync(absolutePath);
  const prepared = await prepareWechatBodyImageUpload({
    buffer,
    filename: path.basename(absolutePath),
    contentType: inferImageContentType(absolutePath),
    fileExt: path.extname(absolutePath).toLowerCase(),
    fileSize: buffer.length,
  });

  if (!prepared.wasProcessed) {
    return {
      uploadPath: absolutePath,
      wasProcessed: false,
      processingNotes: [],
      cleanup: () => {},
    };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-body-image-'));
  const uploadPath = path.join(tempDir, prepared.filename);
  fs.writeFileSync(uploadPath, prepared.buffer);

  return {
    uploadPath,
    wasProcessed: true,
    processingNotes: prepared.processingNotes,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

async function uploadImageThroughFileInput(session: ChromeSession, imagePath: string): Promise<void> {
  const absolutePath = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Image file not found: ${absolutePath}`);

  const beforeCount = await getBodyImageCount(session);
  try {
    await uploadImagePathThroughFileInput(session, absolutePath, beforeCount);
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('local image upload input not found')) throw err;

    const currentCount = await getBodyImageCount(session);
    if (currentCount > beforeCount) return;

    console.warn(`[wechat] Raw image upload failed, retrying with fallback processing: ${message}`);
    const fallback = await prepareFallbackWechatBodyImageUpload(absolutePath);
    const notes = fallback.processingNotes.length > 0 ? ` (${fallback.processingNotes.join('; ')})` : '';
    console.log(`[wechat] Retrying image upload with ${fallback.wasProcessed ? 'processed' : 'original'} file: ${path.basename(fallback.uploadPath)}${notes}`);

    try {
      await uploadImagePathThroughFileInput(session, fallback.uploadPath, currentCount);
    } finally {
      fallback.cleanup();
    }
  }
}

interface DraftSaveStatus {
  appmsgid: string;
  isLoading: boolean;
  submitText: string;
  url: string;
  messages: string[];
}

async function getDraftSaveStatus(session: ChromeSession): Promise<DraftSaveStatus> {
  const raw = await evaluate<string>(session, `
    (function() {
      const submit = document.querySelector('#js_submit');
      const button = submit?.querySelector('button');
      const url = location.href;
      const appmsgid = new URL(url).searchParams.get('appmsgid') || '';
      const messages = Array.from(document.querySelectorAll('.weui-desktop-toast, .weui-desktop-toptips, .js_tips'))
        .map((el) => (el.innerText || el.textContent || '').trim())
        .filter(Boolean);
      return JSON.stringify({
        appmsgid,
        isLoading: !!submit?.classList.contains('btn_loading') || !!button?.disabled,
        submitText: (submit?.innerText || '').trim(),
        url,
        messages
      });
    })()
  `);
  return JSON.parse(raw || '{}') as DraftSaveStatus;
}

async function waitForDraftSaved(session: ChromeSession, timeoutMs = 60_000): Promise<string> {
  const start = Date.now();
  let lastStatus: DraftSaveStatus | null = null;

  while (Date.now() - start < timeoutMs) {
    lastStatus = await getDraftSaveStatus(session);
    if (lastStatus.appmsgid && !lastStatus.isLoading) return lastStatus.appmsgid;

    const relevantFailure = lastStatus.messages.find((message) => /保存.*失败|草稿.*失败|save.*fail/i.test(message));
    if (relevantFailure) throw new Error(`Draft save failed: ${relevantFailure}`);

    await sleep(1000);
  }

  throw new Error(`Draft save did not complete${lastStatus ? `: ${JSON.stringify(lastStatus)}` : ''}`);
}

export async function postArticle(options: ArticleOptions): Promise<void> {
  const { title, content, htmlFile, markdownFile, theme, color, citeStatus = true, author, summary, images = [], submit = false, profileDir, cdpPort, cover } = options;
  let { contentImages = [] } = options;
  let effectiveTitle = title || '';
  let effectiveAuthor = author || '';
  let effectiveSummary = summary || '';
  let effectiveHtmlFile = htmlFile;

  if (markdownFile) {
    console.log(`[wechat] Parsing markdown: ${markdownFile}`);
    const parsed = await parseMarkdownWithPlaceholders(markdownFile, theme, color, citeStatus);
    effectiveTitle = effectiveTitle || parsed.title;
    effectiveAuthor = effectiveAuthor || parsed.author;
    effectiveSummary = effectiveSummary || parsed.summary;
    effectiveHtmlFile = parsed.htmlPath;
    contentImages = parsed.contentImages;
    console.log(`[wechat] Title: ${effectiveTitle || '(empty)'}`);
    console.log(`[wechat] Author: ${effectiveAuthor || '(empty)'}`);
    console.log(`[wechat] Summary: ${effectiveSummary || '(empty)'}`);
    console.log(`[wechat] Found ${contentImages.length} images to insert`);
  } else if (htmlFile && fs.existsSync(htmlFile)) {
    console.log(`[wechat] Parsing HTML: ${htmlFile}`);
    const meta = parseHtmlMeta(htmlFile);
    effectiveTitle = effectiveTitle || meta.title;
    effectiveAuthor = effectiveAuthor || meta.author;
    effectiveSummary = effectiveSummary || meta.summary;
    effectiveHtmlFile = htmlFile;
    if (meta.contentImages.length > 0) {
      contentImages = meta.contentImages;
    }
    console.log(`[wechat] Title: ${effectiveTitle || '(empty)'}`);
    console.log(`[wechat] Author: ${effectiveAuthor || '(empty)'}`);
    console.log(`[wechat] Summary: ${effectiveSummary || '(empty)'}`);
    console.log(`[wechat] Found ${contentImages.length} images to insert`);
  }

  if (effectiveTitle && effectiveTitle.length > 64) throw new Error(`Title too long: ${effectiveTitle.length} chars (max 64)`);
  if (!content && !effectiveHtmlFile) throw new Error('Either --content, --html, or --markdown is required');

  let cdp: CdpConnection;
  let chrome: ReturnType<typeof import('node:child_process').spawn> | null = null;

  // Try connecting to existing Chrome: explicit port > auto-detect > launch new
  const portToTry = cdpPort ?? await findExistingChromeDebugPort(profileDir);
  if (portToTry) {
    const existing = await tryConnectExisting(portToTry);
    if (existing) {
      console.log(`[cdp] Connected to existing Chrome on port ${portToTry}`);
      cdp = existing;
    } else {
      console.log(`[cdp] Port ${portToTry} not available, launching new Chrome...`);
      const launched = await launchChrome(WECHAT_URL, profileDir);
      cdp = launched.cdp;
      chrome = launched.chrome;
    }
  } else {
    const launched = await launchChrome(WECHAT_URL, profileDir);
    cdp = launched.cdp;
    chrome = launched.chrome;
  }

  try {
    console.log('[wechat] Waiting for page load...');
    await sleep(3000);

    let session: ChromeSession;
    if (!chrome) {
      // Reusing existing Chrome: find an already-logged-in tab (has token in URL)
      const allTargets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
      const loggedInTab = allTargets.targetInfos.find(t => t.type === 'page' && t.url.includes('mp.weixin.qq.com') && t.url.includes('token='));
      const wechatTab = loggedInTab || allTargets.targetInfos.find(t => t.type === 'page' && t.url.includes('mp.weixin.qq.com'));

      if (wechatTab) {
        console.log(`[wechat] Reusing existing tab: ${wechatTab.url.substring(0, 80)}...`);
        const { sessionId: reuseSid } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: wechatTab.targetId, flatten: true });
        await cdp.send('Page.enable', {}, { sessionId: reuseSid });
        await cdp.send('Runtime.enable', {}, { sessionId: reuseSid });
        await cdp.send('DOM.enable', {}, { sessionId: reuseSid });
        session = { cdp, sessionId: reuseSid, targetId: wechatTab.targetId };

        // Navigate to home if not already there
        const currentUrl = await evaluate<string>(session, 'window.location.href');
        if (!currentUrl.includes('/cgi-bin/home')) {
          console.log('[wechat] Navigating to home...');
          await evaluate(session, `window.location.href = '${WECHAT_URL}cgi-bin/home?t=home/index'`);
          await sleep(5000);
        }
      } else {
        // No WeChat tab found, create one
        console.log('[wechat] No WeChat tab found, opening...');
        await cdp.send('Target.createTarget', { url: WECHAT_URL });
        await sleep(5000);
        session = await getPageSession(cdp, 'mp.weixin.qq.com');
      }
    } else {
      session = await getPageSession(cdp, 'mp.weixin.qq.com');
    }

    const url = await evaluate<string>(session, 'window.location.href');
    if (!url.includes('/cgi-bin/')) {
      const hasTelegram = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
      console.log(`[wechat] Not logged in. Please scan QR code...${hasTelegram ? ' (sending to Telegram)' : ''}`);
      const loggedIn = await waitForLogin(session);
      if (!loggedIn) throw new Error('Login timeout');
    }
    console.log('[wechat] Logged in.');
    await sleep(5000);

    // Wait for menu to be ready
    const menuReady = await waitForElement(session, '.new-creation__menu', 40_000);
    if (!menuReady) throw new Error('Home page menu did not load');

    const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
    const initialIds = new Set(targets.targetInfos.map(t => t.targetId));

    await clickMenuByText(session, '文章');
    await sleep(3000);

    const editorTargetId = await waitForNewTab(cdp, initialIds, 'mp.weixin.qq.com');
    console.log('[wechat] Editor tab opened.');

    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: editorTargetId, flatten: true });
    session = { cdp, sessionId, targetId: editorTargetId };

    await cdp.send('Page.enable', {}, { sessionId });
    await cdp.send('Runtime.enable', {}, { sessionId });
    await cdp.send('DOM.enable', {}, { sessionId });

    // Wait for editor elements to fully load
    console.log('[wechat] Waiting for editor to load...');
    const editorLoaded = await waitForElement(session, '#title', 30_000);
    if (!editorLoaded) throw new Error('Editor did not load (#title not found)');
    await waitForElement(session, BODY_EDITOR_SELECTOR, 15_000);
    await sleep(2000);

    if (effectiveTitle) {
      console.log('[wechat] Filling title...');
      await evaluate(session, `(function() { const el = document.querySelector('#title'); el.focus(); el.value = ${JSON.stringify(effectiveTitle)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }

    if (effectiveAuthor) {
      console.log('[wechat] Filling author...');
      await evaluate(session, `(function() { const el = document.querySelector('#author'); el.focus(); el.value = ${JSON.stringify(effectiveAuthor)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }

    await sleep(500);

    if (effectiveTitle) {
      const actualTitle = await evaluate<string>(session, `document.querySelector('#title')?.value || ''`);
      if (actualTitle === effectiveTitle) {
        console.log('[wechat] Title verified OK.');
      } else {
        console.warn(`[wechat] Title verification failed. Expected: "${effectiveTitle}", got: "${actualTitle}"`);
      }
    }

    console.log('[wechat] Clicking on editor...');
    await clickElement(session, BODY_EDITOR_SELECTOR);
    await sleep(1000);

    console.log('[wechat] Ensuring editor focus...');
    await clickElement(session, BODY_EDITOR_SELECTOR);
    await sleep(500);

    if (effectiveHtmlFile && fs.existsSync(effectiveHtmlFile)) {
      console.log(`[wechat] Inserting HTML content from: ${effectiveHtmlFile}`);
      await prepareEditorPasteTarget(session, 'body content paste', { clickEditor: true });
      await insertHtmlIntoEditorFromFile(session, effectiveHtmlFile, contentImages);
      await sleep(3000);
      await verifyTitleUnchangedBeforeSave(session, effectiveTitle);

      const editorHasContent = await evaluate<boolean>(session, `
        (function() {
          const editor = document.querySelector(${JSON.stringify(BODY_EDITOR_SELECTOR)});
          if (!editor) return false;
          const text = editor.innerText?.trim() || '';
          return text.length > 0;
        })()
      `);
      if (editorHasContent) {
        console.log('[wechat] Body content verified OK.');
      } else {
        console.warn('[wechat] Body content verification failed: editor appears empty after paste.');
      }

      if (contentImages.length > 0) {
        console.log(`[wechat] Inserting ${contentImages.length} images...`);
        for (let i = 0; i < contentImages.length; i++) {
          const img = contentImages[i]!;
          console.log(`[wechat] [${i + 1}/${contentImages.length}] Processing: ${img.placeholder}`);

          const found = await selectAndReplacePlaceholder(session, img.placeholder);
          if (!found) {
            console.warn(`[wechat] Placeholder not found: ${img.placeholder}`);
            continue;
          }

          await sleep(500);

          console.log('[wechat] Deleting placeholder with Backspace...');
          await pressDeleteKey(session);
          await sleep(200);

          console.log(`[wechat] Uploading image: ${path.basename(img.localPath)}`);
          await prepareEditorPasteTarget(session, 'inline image upload');
          await uploadImageThroughFileInput(session, img.localPath);
          await sleep(1000);
          await verifyTitleUnchangedBeforeSave(session, effectiveTitle);
          await removeExtraEmptyLineAfterImage(session);
        }
        console.log('[wechat] All images inserted.');
      }
    } else if (content) {
      for (const img of images) {
        if (fs.existsSync(img)) {
          console.log(`[wechat] Uploading image: ${img}`);
          await prepareEditorPasteTarget(session, 'leading image upload');
          await uploadImageThroughFileInput(session, img);
          await sleep(1000);
          await removeExtraEmptyLineAfterImage(session);
        }
      }

      console.log('[wechat] Typing content...');
      await prepareEditorPasteTarget(session, 'content typing');
      await typeText(session, content);
      await sleep(1000);

      const editorHasContent = await evaluate<boolean>(session, `
        (function() {
          const editor = document.querySelector(${JSON.stringify(BODY_EDITOR_SELECTOR)});
          if (!editor) return false;
          const text = editor.innerText?.trim() || '';
          return text.length > 0;
        })()
      `);
      if (editorHasContent) {
        console.log('[wechat] Body content verified OK.');
      } else {
        console.warn('[wechat] Body content verification failed: editor appears empty after typing.');
      }
    }

    if (effectiveSummary) {
      console.log(`[wechat] Filling summary (after content paste): ${effectiveSummary}`);
      await evaluate(session, `
        (function() {
          const el = document.querySelector('#js_description');
          if (!el) return;
          el.focus();
          el.select();
          el.value = ${JSON.stringify(effectiveSummary)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        })()
      `);
      await sleep(500);

      const actualSummary = await evaluate<string>(session, `document.querySelector('#js_description')?.value || ''`);
      if (actualSummary === effectiveSummary) {
        console.log('[wechat] Summary verified OK.');
      } else {
        console.warn(`[wechat] Summary verification failed. Expected: "${effectiveSummary}", got: "${actualSummary}"`);
      }
    }

    await verifyTitleUnchangedBeforeSave(session, effectiveTitle);

    if (cover && fs.existsSync(cover)) {
      console.log(`[wechat] Auto-setting cover from: ${cover}`);
      await setCover(session, cover);
      await sleep(1000);
    }

    console.log('[wechat] Saving as draft...');
    try {
      // Use a real CDP mouse click on the save draft button; synthetic .click()
      // sometimes does not trigger WeChat's React save handler.
      await clickElement(session, '#js_submit button');
      console.log('[wechat] Clicked save draft button.');
    } catch (e) {
      console.warn('[wechat] Real click on save draft failed; falling back to synthetic click.');
      await evaluate(session, `document.querySelector('#js_submit button').click()`);
    }
    const appmsgid = await waitForDraftSaved(session);
    console.log(`[wechat] Draft saved successfully! appmsgid: ${appmsgid}`);

    console.log('[wechat] Done. Closing browser...');
    await cdp.send('Browser.close').catch((e) => console.warn('[wechat] Browser.close failed:', e));
    await sleep(500);
    console.log('[wechat] Browser closed.');
  } finally {
    cdp.close();
  }
}

function printUsage(): never {
  console.log(`Post article to WeChat Official Account

Usage:
  npx -y bun wechat-article.ts [options]

Options:
  --title <text>     Article title (auto-extracted from markdown)
  --content <text>   Article content (use with --image)
  --html <path>      HTML file to paste (alternative to --content)
  --markdown <path>  Markdown file to convert and post (recommended)
  --theme <name>     Theme for markdown (default, grace, simple, modern)
  --color <name|hex> Primary color (blue, green, vermilion, etc. or hex)
  --no-cite          Disable bottom citations for ordinary external links in markdown mode
  --author <name>    Author name
  --summary <text>   Article summary
  --image <path>     Content image, can repeat (only with --content)
  --submit           Save as draft
  --profile <dir>    Chrome profile directory
  --account <alias>  Select account by alias (for multi-account setups)
  --cdp-port <port>  Connect to existing Chrome debug port instead of launching new instance

Examples:
  npx -y bun wechat-article.ts --markdown article.md
  npx -y bun wechat-article.ts --markdown article.md --theme grace --submit
  npx -y bun wechat-article.ts --markdown article.md --no-cite
  npx -y bun wechat-article.ts --title "标题" --content "内容" --image img.png
  npx -y bun wechat-article.ts --title "标题" --html article.html --submit

Markdown mode:
  Images in markdown are converted to placeholders. After pasting HTML,
  each placeholder is selected, scrolled into view, deleted, and replaced
  with the actual image via paste. Ordinary external links are converted to
  bottom citations by default.
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  const images: string[] = [];
  let title: string | undefined;
  let content: string | undefined;
  let htmlFile: string | undefined;
  let markdownFile: string | undefined;
  let theme: string | undefined;
  let color: string | undefined;
  let citeStatus = true;
  let author: string | undefined;
  let summary: string | undefined;
  let cover: string | undefined;
  let submit = false;
  let profileDir: string | undefined;
  let cdpPort: number | undefined;
  let accountAlias: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--title' && args[i + 1]) title = args[++i];
    else if (arg === '--content' && args[i + 1]) content = args[++i];
    else if (arg === '--html' && args[i + 1]) htmlFile = args[++i];
    else if (arg === '--markdown' && args[i + 1]) markdownFile = args[++i];
    else if (arg === '--theme' && args[i + 1]) theme = args[++i];
    else if (arg === '--color' && args[i + 1]) color = args[++i];
    else if (arg === '--cite') citeStatus = true;
    else if (arg === '--no-cite') citeStatus = false;
    else if (arg === '--author' && args[i + 1]) author = args[++i];
    else if (arg === '--summary' && args[i + 1]) summary = args[++i];
    else if (arg === '--image' && args[i + 1]) images.push(args[++i]!);
    else if (arg === '--cover' && args[i + 1]) cover = args[++i];
    else if (arg === '--submit') submit = true;
    else if (arg === '--profile' && args[i + 1]) profileDir = args[++i];
    else if (arg === '--account' && args[i + 1]) accountAlias = args[++i];
    else if (arg === '--cdp-port' && args[i + 1]) cdpPort = parseInt(args[++i]!, 10);
  }

  const extConfig = loadWechatExtendConfig();
  const resolved = resolveAccount(extConfig, accountAlias);
  if (resolved.name) console.log(`[wechat] Account: ${resolved.name} (${resolved.alias})`);

  if (!author && resolved.default_author) author = resolved.default_author;

  if (!profileDir && resolved.alias) {
    profileDir = resolved.chrome_profile_path || getAccountProfileDir(resolved.alias);
  }

  if (!markdownFile && !htmlFile && !title) { console.error('Error: --title is required (or use --markdown/--html)'); process.exit(1); }
  if (!markdownFile && !htmlFile && !content) { console.error('Error: --content, --html, or --markdown is required'); process.exit(1); }

  await postArticle({ title: title || '', content, htmlFile, markdownFile, theme, color, citeStatus, author, summary, images, submit, profileDir, cdpPort, cover });
}

await main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});