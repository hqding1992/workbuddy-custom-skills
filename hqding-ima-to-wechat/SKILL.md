---
name: hqding-ima-to-wechat
description: 从 IMA 知识库读取笔记，AI 生成公众号文章，使用 AI 文生图生成精美手绘风格封面，调用 gzh-design 专业排版，自动发布到微信公众号草稿箱。支持 gzh-design 主题选择、自动封面生成。当用户说"发布公众号""IMA 笔记发公众号""把笔记转成公众号文章""自动发布到微信"时使用此技能。
metadata:
  openclaw:
    homepage: local
---

# hqding-ima-to-wechat

从 IMA 知识库读取笔记，AI 生成公众号文章，使用 AI 文生图生成精美手绘风格封面，自动发布到微信公众号草稿箱。

## 使用方式

**重要**：此技能需要在 **WorkBuddy 环境**中使用，因为需要调用以下工具：
- `mcp__ima-mcp` - 读取 IMA 知识库
- `connect_cloud_service` - 获取云端服务 token（用于 AI 文生图）
- `gzh-design` - 微信公众号排版引擎（Markdown → 合规 HTML，本 skill 的排版环节调用，**不复制打包，工作流组合**）
- `baoyu-post-to-wechat` - 发布到微信公众号（接收 gzh-design 产出的 HTML）

**触发方式**：
1. **命令触发**：用户输入 `/hqding-ima-to-wechat`（如果已注册为 slash 命令）
2. **自然语言触发**：用户输入"发布公众号""IMA 笔记发公众号"等
3. **手动触发**：在 WorkBuddy 中加载此技能，然后按照执行流程手动执行

**执行模式**：
- **自动模式**：AI 按照执行流程自动完成所有步骤
- **半自动模式**：AI 完成部分步骤，人工确认关键决策（如文章标题、封面风格）

---

## 使用场景

1. **随笔发布**：IMA 笔记（零散随笔）→ AI 提取重写 → 公众号草稿箱
2. **定期发布**：定时从 IMA 读取 → 生成 → 发布
3. **主题发布**：指定笔记标题 → 生成对应文章

## 核心功能

1. ✅ **IMA 知识库读取** - 自动搜索和读取笔记
2. ✅ **AI 生成文章** - 根据笔记内容智能扩展
3. ✅ **AI 文生图封面** - 手绘/水彩风格，设计感强
4. ✅ **gzh-design 专业排版** - 调用 gzh-design 将 Markdown 转公众号合规 HTML（章节编号/关键词下划线/引言卡/全角标点，6 套主题可选，以 gzh-design theme-index 为准）
5. ✅ **gzh-design 主题支持** - 摸鱼绿/红白色系/石墨极简/留白禅意/摸鱼票据风/橄榄手记（共 6 套，默认按题材自动选）
6. ✅ **自动发布** - baoyu 接收 HTML 一键发布到草稿箱

## 执行流程

### Step 1：读取 IMA 知识库笔记

**目标**：从 IMA 知识库读取指定笔记或最新笔记

**执行方式**：

```typescript
// 1. 获取知识库列表
const knowledgeBases = await ima-mcp.get_knowledge_base_list({ limit: 20 });

// 2. 找到目标知识库（例如："微信公众号知识库"）
const targetKB = knowledgeBases.find(kb => kb.name === "微信公众号知识库");

// 3. 获取知识库中的笔记列表
const notes = await ima-mcp.get_knowledge_list({
  knowledge_base_id: targetKB.id,
  limit: 20
});

// 4. 读取指定笔记内容（或最新笔记）
const noteContent = await ima-mcp.fetch_media_content({
  media_id: note.media_id
});
```

**关键参数**：
- `knowledge_base_id`: 知识库 ID（从 Step 1 获取）
- `media_id`: 笔记 ID（从 Step 2 获取）

---

### Step 2：AI 生成公众号文章

**目标**：根据笔记内容生成适合微信公众号的文章

**执行方式**：

```typescript
// 1. 分析笔记内容，提取核心信息
const noteAnalysis = `
笔记标题：${noteTitle}
笔记内容：${noteContent}
笔记描述：${noteDescription}
`;

// 2. 生成文章标题（吸引人、符合公众号风格）
const articleTitle = generateTitle(noteAnalysis);

// 3. 生成文章正文（扩展笔记内容，增加细节和故事性）
const articleBody = generateBody(noteAnalysis);

// 4. 生成文章描述（50-120字，用于分享卡片）
const articleDescription = generateDescription(noteAnalysis);

// 5. 组装 Markdown 文件
const markdownContent = `---
title: "${articleTitle}"
author: "翰桥"
date: "${today}"
description: "${articleDescription}"
---

# ${articleTitle}

${articleBody}
`;
```

**格式要求**：
- ✅ 标题吸引人，符合公众号风格
- ✅ 正文有故事性，不只是罗列事实
- ✅ 段落清晰，适合手机阅读
- ✅ 适当加入表情符号和分隔线

---

### Step 3：生成精美封面图（AI 文生图）🎨

**核心改进点**：使用 AI 文生图生成**手绘/水彩风格**封面，替代丑陋的 placeholder

**执行方式**：

```typescript
// 1. 根据文章标题和主题生成封面图提示词
const coverPrompt = `
微信公众号文章封面图，手绘插画风格，水彩色调
标题：《${articleTitle}》
主题：${theme}
颜色：${color}
要求：
- 16:9 比例（900x500）
- 适合微信公众号封面
- 艺术感强，设计感强
- 留白充足，优雅简约
- 不要包含文字（文字会在公众号后台添加）
`;

// 2. 调用 AI 文生图（需要 connect_cloud_service 获取 token）
const token = await connect_cloud_service();
const imageResult = await execute_command(`
  cd "D:\\WorkBuddy\\resources\\app.asar.unpacked\\resources\\builtin-skills\\buddy-multimodal-generation\\scripts"
  echo -n "${token}" | python buddy-cloud.py image "${coverPrompt}" --token-stdin
`);

// 3. 解析返回结果，获取图片 URL
const imageUrl = parseImageUrl(imageResult);

// 4. 下载图片到本地
const coverImagePath = `E:/.workbuddy/日常会话/cover_${Date.now()}.png`;
await downloadImage(imageUrl, coverImagePath);
```

**风格选项**：
- `手绘插画` - 温暖、艺术感强
- `水彩风格` - 清新、优雅
- `素描风格` - 简约、高级感
- `卡通风格` - 活泼、年轻化

**关键要求**：
- ✅ 封面图不要包含文字（文字会在公众号后台添加）
- ✅ 留白充足，避免视觉拥挤
- ✅ 风格与文章主题匹配

---

### Step 4：保存 Markdown 草稿（供 gzh-design 排版用）

**目标**：将生成的文章存为结构化 Markdown 草稿，封面图置顶，供 Step 5 的 gzh-design 排版读取

**执行方式**：

```typescript
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const slug = articleTitle
  .toLowerCase()
  .replace(/[^\w\s-]/g, '') // 移除特殊字符
  .replace(/\s+/g, '-') // 空格转连字符
  .slice(0, 50); // 限制长度

const draftMdPath = `E:/.workbuddy/日常会话/${today}_${slug}.md`;

// 封面图空 alt 置顶：gzh-design 不会硬造图片说明，baoyu 后续自动将其作为封面
const markdownWithCover = markdownContent.replace(
  `# ${articleTitle}`,
  `# ${articleTitle}\n\n![](${coverImagePath})`
);

fs.writeFileSync(draftMdPath, markdownWithCover);

// 供 Step 5/6 复用的统一文件名变量（排版产物路径，themeId 在 Step 5 由 gzh-design 选定后填入）
const gzhHtmlPath = `E:/.workbuddy/日常会话/${today}_${slug}_排版_{themeId}.html`;
```

**Markdown 文件格式要求**：

```markdown
---
title: "文章标题"
author: "翰桥"
date: "YYYY-MM-DD"
description: "文章摘要（50-120字）"
---

# 文章标题

![](E:/.workbuddy/日常会话/cover_xxx.png)

正文内容...
```

**关键要求**：
1. ✅ 正文中必须包含至少一张图片（封面大图已在顶部置顶）
2. ❌ 不要在 frontmatter 写 `cover` 字段（会让 skill 困惑）
3. ✅ 封面在 Step 6 通过 `--cover "${coverImagePath}"` 显式传给 browser 方法，由其自动在编辑器设好封面缩略图（**不再依赖微信"自动提取首图"**——实测不可靠，会导致草稿箱封面空白）
4. ✅ `coverImagePath` 即 Step 3 生成的封面本地路径，全程复用

---

### Step 5：gzh-design 专业排版（Markdown → 公众号 HTML）

**目标**：调用 `gzh-design` skill 将 Step 4 的 Markdown 草稿转为合规公众号 HTML

**流程定位（两阶段）**：本步骤本质是「**gzh-design 生成全文 + hqding 微信兼容适配**」两段式，不是一步到位——
- **阶段A（gzh-design 职责）**：按它的组件规范生成**样式正确**的公众号 HTML（组件库基于 `display:flex`）。这一步「调用 skill 生成全文」即完成。
- **阶段B（hqding 适配层职责，本流程核心）**：对微信公众号 **API 发布路径**做兼容性适配，让样式在草稿箱 / 手机端**不变样**。原因：gzh-design 为「复制粘贴」路径优化（浏览器已把 flex 渲染固化，粘贴时 flex 不存在），而我们的发布走 API 提交**原始 HTML 源码**，微信服务端会 flatten flex、强加 `<table>` 默认边框 / 居中。适配层就是解决这个错配——它是发布链路的设计职责，不是临时补丁或 bug 修复。

**执行方式**（读取 gzh-design 的 SKILL.md 按其工作流执行；组件库路径 `C:/Users/jsfc_02/.workbuddy/skills/gzh-design/references/`）：

> ⚠️ **全自动触发**：调用 gzh-design 时必须明确声明「直接排 / 一键 / 不用问」进入其**全自动模式**，否则 gzh-design 默认走用户选择制会停下来问你选主题，违背本流程「不要停」原则。

1. **选主题（全自动）**：沿用 Step 4 的 `today`/`slug` 变量。向 gzh-design 声明全自动，由其按题材自动选最契合主题（默认第一行摸鱼绿），不提问。需在请求里指定固定主题时写清（如"用摸鱼绿"）。题材→主题契合参考 `theme-index.md`（仅 6 套已注册主题）。
2. **读组件库**：Read 所选主题的 `references/theme-{标识}.md` + `references/common-components.md`（通用增量库）。英文标识来自 `theme-index.md` 第5行（去 `theme-`/`.md`），如 `moyu-green`→`theme-moyu-green.md`。
3. **装配 HTML**：按 gzh-design 配方把 Markdown 元素替换为组件，**HTML 一律从组件库取，不手写**。产出纯 `<section>…</section>` 片段（无 DOCTYPE/html/head/body）。
4. **校验（强制）**：
   ```bash
   python "C:/Users/jsfc_02/.workbuddy/skills/gzh-design/scripts/validate_gzh_html.py" "<生成的.html 路径>"
   ```
   ERROR 与半角标点 WARNING 都必须清零。
5. **保存**：沿用 Step 4 的 `gzhHtmlPath` 变量（即 `${today}_${slug}_排版_${themeId}.html`），将 `${themeId}` 替换为 gzh-design 实际选定的英文标识，如 `2026-07-01_nanjing-tianqi_排版_moyu-green.html`。

**关键要求**：
- 封面图已在 Step 4 置顶（空 alt），gzh-design 将其作为首图，baoyu 后续自动当封面
- 正文关键词下划线、章节编号、全角标点由 gzh-design 自动处理
- **微信兼容铁律（2026-07-10 实测，仅 A 方案兜底用）**：⚠️ 若按 Step 6 默认走 **B 方案（browser 方法）**，flex 原版 HTML 由编辑器内部渲染层完整保留，**本铁律的 flex→table 转换不需执行**。以下规则**仅在降级为 A 方案（api 路径，无 Chrome/远程环境）时强制适用**。根因：公众号 `draft/add` API 接口的清洗比编辑器内部激进——会把 flex 整体 flatten 成独立段落（章节标题 `01/PART` 与中文标题被拆成上下两行、编号列表圆圈与文字间出现巨大空白、封面顶/底条与三连错位），并给 `<table>` 强制加默认边框。——实测表现：章节标题 `01/PART` 与中文标题被拆成上下两行、编号列表圆圈与文字间出现巨大空白且文字右移、封面顶/底条与三连错位。同时，**微信公众号编辑器会给 `<table>` 强制加默认边框（深色线），并可能把 table 整体居中**。因此装配时必须遵守以下微信稳定写法：
  - **所有非数据表格必须加 HTML 属性**：`border="0" cellpadding="0" cellspacing="0"`（不要写 `align="left"`，避免微信把 table 当作浮动块导致后续内容环绕/位置偏移），且每个 `<td>` 的 style 必须显式写 `border:0;`（仅写 `border-collapse:collapse` 不够）。
  - **章节标题**：用 `<table>` 三列，中间单独一列画竖线（不要用 `td border-left`，也不要把竖线 span 和标题 p 塞同一个 td——微信里 inline-block 和 block 元素会错位）。标准模板：
    ```html
    <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:16px(首章)/48px(后续);margin-bottom:32px;">
      <tr>
        <td style="border:0;width:60px;vertical-align:middle;text-align:center;padding:0 16px 0 20px;">
          <p style="margin:0;font-size:28px;font-weight:900;color:#059669;line-height:1;"><span leaf="">01</span></p>
          <p style="margin:0;font-size:8px;font-weight:700;color:#D1D5DB;letter-spacing:2px;"><span leaf="">PART</span></p>
        </td>
        <td style="border:0;width:1px;vertical-align:middle;background:#E5E7EB;padding:0;">
          <span style="display:block;width:1px;height:36px;"><span leaf=""><br></span></span>
        </td>
        <td style="border:0;vertical-align:middle;padding:0 20px 0 16px;">
          <p style="margin:0 0 1px;font-size:17px;font-weight:900;color:#111827;"><span leaf="">中文标题</span></p>
          <p style="margin:0;font-size:11px;font-weight:600;color:#9CA3AF;letter-spacing:1.5px;"><span leaf="">EN · 副标题</span></p>
        </td>
      </tr>
    </table>
    ```
  - **编号列表**：`<table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;"><tr><td style="border:0;width:32px;vertical-align:top;padding:2px 0 12px 20px;"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#059669;color:#fff;font-size:11px;font-weight:700;border-radius:50%;"><span leaf="">1</span></span></td><td style="border:0;vertical-align:top;padding:2px 20px 12px 12px;font-size:14px;color:#374151;line-height:1.9;"><span leaf="">列表项内容</span></td></tr>…重复</table>`
  - **封面顶/底条、目录（4列网格）、三连（3列）**：同样用 `<table>` 多列布局，**都必须加 `border="0" cellpadding="0" cellspacing="0"`，且 td 加 `border:0;`**。目录去掉 `overflow-x:scroll` 横滑（微信不支持），改固定 4 列网格。
  - 装饰性空元素（圆点/渐变线/短横）内部仍须放 `<span leaf=""><br></span>` 占位，否则微信剥样式。
  - 加固后必须重新跑 `validate_gzh_html.py` 清零 ERROR 与半角标点 WARNING。
- **图片 `data-local-path` 后处理（B 方案必需，最易遗漏）**：gzh-design 产出的 `<img>` 的 `src` 是本地绝对路径（如 `src="E:/.workbuddy/日常会话/cover_xxx.png"`），但 browser 方法要求「`src="XIMGPH_n"` 占位符 + `data-local-path="本地路径"`」格式才能识别并上传本地图（见 Step 6 说明）。所以 Step 6 调 `wechat-article.ts` **之前**，必须对 `${gzhHtmlPath}` 做一遍后处理：遍历所有 `src` 为非 `http(s)://` 的 `<img>`，将 `src` 改写为唯一占位符 `XIMGPH_<n>`（n 从 1 自增），并补 `data-local-path="<原 src 本地路径>"` 属性；正文原图与封面图（Step 4 置顶的那张）都需处理。处理后再跑一次 `validate_gzh_html.py` 确认无新增 ERROR。（上一轮为临时手改 flex-b.html 才跑通，此步骤必须固化进流程，否则换一篇笔记会重犯。）
- 作者名由 frontmatter 的 `author` 字段驱动（Step 2 已填「翰桥」），不另写死

### Step 6：发布到微信公众号草稿箱（baoyu 吃 HTML）

**目标**：用 `baoyu-post-to-wechat` 发布 gzh-design 产出的 HTML

**执行方式**：

```bash
# 默认 B 方案（browser 方法）：Chrome 渲染后注入编辑器，保留 flex 原版观感
cd "C:/Users/jsfc_02/.workbuddy/skills/baoyu-post-to-wechat/scripts" && \
  C:/Users/jsfc_02/.workbuddy/binaries/node/versions/22.22.2/bun wechat-article.ts \
    --html "${gzhHtmlPath}" \
    --title "${articleTitle}" \
    --author "翰桥" \
    --cover "${coverImagePath}"
```
> 注：`--cover` 必须传封面**本地路径**，browser 方法据此自动在编辑器里设好封面缩略图（baoyu 原版 browser 方法无此能力，已为本流程补 `--cover` 支持；若 baoyu 更新覆盖了脚本，需重新打此补丁）。

**说明（B 方案 = 默认，已实测验证 2026-07-10）**：
- 走 `wechat-article.ts` 的 **browser 方法**（CDP 驱动本机 Chrome），用 `execCommand('insertHTML')` 注入编辑器——**走的是编辑器内部渲染层（实测支持 flex/gap），gzh-design 的 flex 原版观感被完整保留，无需 Step 5 的 flex→table 兼容层**。不再重复造轮子。
- **图片必须标注 `data-local-path`**（见 Step 5），browser 方法据此收集本地图、上传并替换占位符；未标注的 `<img>` 无法上传。
- **首次需扫码登录**公众号后台（手机微信扫电脑屏二维码），session 存于 `AppData/Roaming/baoyu-skills/chrome-profile` 可复用，后续免扫。
- 不传 `--submit` → 仅存草稿，不群发。

**兜底 A 方案（无 Chrome / 远程环境）**：用 `wechat-api.ts -f "${gzhHtmlPath}" --title "${articleTitle}"`（api 路径）。⚠️ api 路径会扁平化 flex，发布前**必须先按 Step 5「微信兼容铁律」把 flex 转 table**，否则草稿箱变形。此路径仅作降级兜底，优先用 B 方案。

**成功返回示例**：
```
✅ 发布成功！
   media_id: rJe_q6XWSyRZvyMdc3SmeuOejXHs-ktlGDQBDc9zA11E422ZbRkI3D9hmEre-b-p
```

---

## 完整流程示例

### 示例 1：发布指定笔记

**用户输入**：
```
用 hqding-ima-to-wechat 发布 IMA 笔记"南京天气随笔"
```

**执行流程**：
1. 从 IMA 知识库读取标题为"南京天气随笔"的笔记
2. 根据笔记内容生成公众号文章《南京今日天气：夏日晴好，气温宜人》
3. 使用 AI 文生图生成手绘风格封面图
4. 保存为 Markdown 草稿：`2026-07-01_南京今日天气.md`
5. gzh-design 排版（默认按题材选主题）→ 产出 HTML
6. 发布到微信公众号草稿箱（baoyu 吃 HTML，首图当封面）

---

### 示例 2：发布最新笔记

**用户输入**：
```
用 hqding-ima-to-wechat 发布 IMA 最新笔记
```

**执行流程**：
1. 从 IMA 知识库读取最新添加的笔记
2. 根据笔记内容生成公众号文章
3. 使用 AI 文生图生成封面图
4. 保存并发布到公众号草稿箱

---

### 示例 3：指定主题和颜色

**用户输入**：
```
用 hqding-ima-to-wechat 发布 IMA 笔记"南京天气随笔"，排版用摸鱼绿
```

**执行流程**：
1. 读取笔记"南京天气随笔"
2. 生成文章
3. 生成封面图（提示词可加入色调提示）
4. gzh-design 排版（摸鱼绿）→ 发布到草稿箱（baoyu 吃 HTML）

---

## 参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `noteTitle` | string | 否 | 笔记标题（不提供则读取最新笔记） |
| `theme` | string | 否 | AI 封面图风格提示（如 modern/手绘；可选），仅用于文生图，不参与排版 |
| `color` | string | 否 | AI 封面图色调提示（如 green/blue；可选），仅用于文生图 |
| `gzhTheme` | string | 否 | gzh-design 排版主题标识（如 moyu-green/red-white/graphite-minimal；默认按题材自动选） |
| `coverStyle` | string | 否 | 封面图风格（默认：手绘插画） |

---

## 常见问题

### Q1：封面图生成失败怎么办？

**A**：如果 AI 文生图失败，会自动降级到备用方案：
1. 使用正文第一张图作为封面
2. 如果正文没有图片，则报错提示

### Q2：如何指定知识库？

**A**：默认读取名为"微信公众号知识库"的知识库。如果要指定其他知识库，请在输入中明确说明。

### Q3：发布后在哪里查看？

**A**：登录微信公众号后台 → **草稿箱** → 查看刚发布的文章

### Q4：可以自动群发吗？

**A**：不支持自动群发（需要人工审核）。本 skill 只发布到草稿箱，需要你在公众号后台手动点击"群发"。

---

## 技术实现细节

### 1. IMA MCP 工具调用

```typescript
// 参数格式以 IMA MCP 运行时 schema 为准；若报错提示参数结构不符，
// 可能是 { params: [{...}] } 包装形式，按报错信息调整即可。
await ima-mcp.get_knowledge_base_list({ limit: 20 });

await ima-mcp.get_knowledge_list({
  knowledge_base_id: targetKB.id,
  limit: 20
});

await ima-mcp.fetch_media_content({
  media_id: note.media_id
});
```

### 2. AI 文生图调用

```typescript
// 1. 获取云端服务 token
const token = await connect_cloud_service();

// 2. 生成图片
const result = await execute_command(`
  cd "D:\\WorkBuddy\\resources\\app.asar.unpacked\\resources\\builtin-skills\\buddy-multimodal-generation\\scripts"
  echo -n "${token}" | python buddy-cloud.py image "提示词" --token-stdin
`);

// 3. 解析结果
const imageUrl = result.match(/https?:\/\/[^\s]+/)[0];

// 4. 下载图片
await execute_command(`curl -sS -L -o "${coverImagePath}" "${imageUrl}"`);
```

### 3. baoyu-post-to-wechat 调用（接收 gzh-design 的 HTML）

> ⚠️ **与 Step 6 一致：默认 B 方案（browser 方法 `wechat-article.ts`）**。下方仅作参数说明；不要照抄成 A 方案 `wechat-api.ts -f`（api 路径会 flatten flex，除非先按 Step 5「微信兼容铁律」转 table，否则变形）。

```typescript
// 默认 B 方案命令（与 Step 6 同）：传 HTML + 标题 + 作者 + 封面本地路径
// gzhHtmlPath / coverImagePath 沿用前文统一变量
await execute_command(`
  cd "C:/Users/jsfc_02/.workbuddy/skills/baoyu-post-to-wechat/scripts" && \
  C:/Users/jsfc_02/.workbuddy/binaries/node/versions/22.22.2/bun wechat-article.ts \
    --html "${gzhHtmlPath}" --title "${articleTitle}" --author "翰桥" --cover "${coverImagePath}"
`, { timeout: 120000 });

// 兜底 A 方案（仅当本机无 Chrome / 远程环境，且已按 Step 5 铁律把 flex 转成 table 后）：
//   bun ".../wechat-api.ts" -f "${gzhHtmlPath}" --title "${articleTitle}" --cover "${coverImagePath}"
```

> 💡 **标题兜底封装（推荐用于 ad-hoc / 防「未命名」）**：`scripts/wechat-publish-check.ts` 是我们的自研薄封装，**不改动 baoyu 第三方 skill**。它按优先级解析标题——
> `--title` > 同名 `.md` frontmatter `title` > HTML `<title>`/`<meta name="title">` > 首个 `<h1>` > **LLM 一句话总结首段（未配 LLM 密钥时降级为本地首段提取）**，作者缺省为 `翰桥`，再显式传给 baoyu，从源头杜绝「未命名文章」。
>
> ```bash
> cd "C:/Users/jsfc_02/.workbuddy/skills/hqding-ima-to-wechat/scripts" && \
> C:/Users/jsfc_02/.workbuddy/binaries/node/versions/22.22.2/bun wechat-publish-check.ts \
>   --html "${gzhHtmlPath}" --cover "${coverImagePath}" --submit
> ```
> 加 `--dry-run` 只解析并打印最终标题/作者、不发布；加 `--title "…"` / `--author "…"` 可手动覆盖。LLM 总结需在 `~/.workbuddy/.secrets/llm.env` 配置 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`（OpenAI 兼容接口），未配置自动走本地首段提取。

---

## 更新日志

### v1.0.0 (2026-07-01)

- ✅ 初始版本
- ✅ 支持 IMA 知识库读取
- ✅ 支持 AI 生成文章
- ✅ **支持 AI 文生图生成封面（手绘/水彩风格）**
- ✅ 支持发布到微信公众号草稿箱
- ✅ 支持主题/颜色参数

### v1.1.0 (2026-07-09)

- ✅ **排版环节改用 gzh-design 调用（方案 B：工作流组合，不复制打包）**
- ✅ 发布改为传 gzh-design 产出的 HTML（baoyu 直接提取 `<section>` + 首图当封面）
- ✅ 移除朴素「格式优化」，排版质感升级为公众号专业级（章节编号/关键词下划线/引言卡/全角标点）
- ✅ 主题控制权移交 gzh-design（6 套已注册主题，默认按题材自动选）

### v1.1.1 (2026-07-09) — 链路核查修复

- ✅ **修复 Step 5→Step 6 文件名不匹配**：统一为 `gzhHtmlPath` 变量（`${today}_${slug}_排版_${themeId}.html`），三处步骤共享，杜绝「找不到文件」
- ✅ **修复作者署名**：`author` 由写死「小丁师傅」改为「翰桥」（frontmatter 驱动，gzh-design 读取）
- ✅ **修正主题套数**：「11 套」改为「6 套」（以 gzh-design `theme-index.md` 为单一来源）
- ✅ **补全 gzh-design 全自动触发信号**：Step 5 明确声明「直接排/一键/不用问」，避免进入用户选择制卡住提问
- ✅ **统一 Step 4 封面图示例**：置顶图改为空 alt（`![]()`），与代码一致，避免 gzh-design 硬造「封面」说明
- ✅ **统一 IMA MCP 调用格式**：技术细节改为与 Step 1 一致的直接对象写法，并加 schema 容错注释

### v1.1.2 (2026-07-09) — 实测发布验证修复

- ✅ **修复路径格式（关键）**：Step 3/4 的 `/e/.workbuddy/...` 改为 `E:/.workbuddy/...`。bun/baoyu 无法解析 Git-Bash 风格 `/e/` 路径（fs.existsSync 返回 false），会导致封面图读取失败、发布报「找不到文件」。实测 `E:/.workbuddy/...` 形式可正常解析。
- ✅ **补全 Step 6 `--title` 参数**：gzh-design 产出纯 `<section>` 片段，无 `<title>`/`<h1>`，baoyu 必报 `No title found`。已补 `--title "${articleTitle}"`（实测通过，草稿箱 media_id 正常返回）。
- ✅ **实测全链路通过**：IMA 读取 → AI 成文 → AI 手绘封面 → gzh-design 摸鱼绿排版（校验 0 ERROR/0 WARNING）→ baoyu 发布草稿箱，首图自动当封面（`Using first body image as cover`）。

### v1.1.3 (2026-07-10) — 字歪修复 + 微信兼容加固

- ✅ 实测草稿箱文章在手机端部分字错位。根因 = 负字间距 `-2px` + 装饰 `<span>` 缺 `inline-block` + flex `gap` 老安卓不支持。Step 5 新增「微信兼容加固」强制约束（收负间距/装饰 inline-block/gap 转 margin），产出后重跑校验。已生成加固版 v2 HTML 校验通过。

### v1.1.4–v1.1.5 (2026-07-10) — A 方案（api 路径）打补丁历史（已弃用）

- ⚠️ 这期间（v1.1.3→v1.1.5）一直走 **A 方案（api 路径）**。因公众号 `draft/add` 接口会把 flex 整体 flatten，被迫手写 v3/v4/v5 共 3 版 `<table>` 兼容层打补丁（去负间距、装饰 inline-block、flex→table、去 table 边框、调三列布局）。**这是重复造轮子**——根因不在 skill 或语法，而在发布路径选错：gzh-design 为「复制粘贴/浏览器渲染」路径设计，而 api 路径提交的是原始 HTML 源码，微信服务端不渲染直接清洗。B 方案（见下）一次性解决，本段历史仅作记录。

### v1.1.6 (2026-07-10) — B 方案（browser 方法）验证成功 ✅

- ✅ **调研结论**：baoyu-post-to-wechat 自带 `wechat-article.ts` 的 **browser 方法**（CDP 驱动 Chrome → `execCommand('insertHTML')` 注入**编辑器内部渲染层**），flex 原版观感完整保留，无需任何 table 兼容层。市场对比：iamzifei 等第三方 skill 需授权中转、wenyan 系只吃 Markdown 自带主题，均不如 browser 方法（直连官方、保观感、零适配）。
- ✅ **实测验证通过**：本机 Chrome 自动探测命中 `Program Files\Google\Chrome`；扫码登录后成功注入 gzh-design 原版 flex HTML（仅修负字间距 `-2px`、封面图标注 `data-local-path`），封面图上传、存草稿成功（appmsgid 100000060）。删除旧 v5（table 版）仅留修复版。
- ✅ **Step 6 默认改为 B 方案**；Step 5「微信兼容铁律」降级为 **A 方案兜底**（无 Chrome/远程时使用），并明确「B 方案下 flex→table 转换不需执行」。

### v1.1.7 (2026-07-10) — 标题兜底封装 + BUN 调用修复 ✅

- ✅ **新增自研薄封装 `scripts/wechat-publish-check.ts`**（不改动第三方 baoyu）：按优先级解析标题（`--title` > 同名 `.md` frontmatter > HTML `<title>`/`<meta name="title">` > 首个 `<h1>` > **LLM 一句话总结首段（未配 `llm.env` 时降级本地首段前20字提取）**），作者缺省「翰桥」，再以 `--title/--author`（透传 `--html/--cover/--submit`）显式调 baoyu，从源头杜绝「未命名文章」。详见「技术实现细节 §3」说明；加 `--dry-run` 只解析不发布。
- ✅ **修复封装调起 baoyu 的 ENOENT bug**：managed runtime 的 `bun`/`bun.cmd` 是启动器外壳（sh 脚本），`execFileSync` 不经 shell 直接 CreateProcess 会因无扩展名失败。改 `BUN = process.env.WECHAT_PUBLISH_BUN || process.execPath || '…/node_modules/bun/bin/bun.exe'`（用当前运行封装的 bun 真二进制）。
- ✅ **setCover 调试探针清理（第三方 baoyu）**：删除排查期全部调试死代码（`snap`/`bodyText` 等 8 个辅助函数 + 调用点），重写确认逻辑——点一次真实 CDP 鼠标（落确认按钮中心）→ 轮询 `cropDialogOpen()`，弹窗卸载或确认按钮消失即判成功（修正此前"弹窗已卸载却误报未关闭"的误判）。
- ✅ **文档↔代码全量核对通过**：baoyu SKILL.md、hqding SKILL.md、封装、setCover 四方一致；无逻辑错误。
- ✅ **实跑验证 100000182 通过**：未带 `--title` 跑封装 → 自动填标题「天气预报 · 南京 2026.07.09…」+ 作者「翰桥」→ 封面全流程（触发器→从正文选择→选图→下一步→剪裁确认→`Crop dialog closed via: unmounted`）→ 存草稿成功。（注：baoyu 更新覆盖 `wechat-article.ts` 后，`setCover` 补丁与 `--cover` 需重打。）

### v1.1.8 (2026-07-10) — GitHub 同步 + 第三方补丁备份 ✅

- ✅ **GitHub 同步**：仓库 `hqding1992/workbuddy-custom-skills` 新增 / 更新 3 文件 —— `hqding-ima-to-wechat/SKILL.md`（更新）、`hqding-ima-to-wechat/scripts/wechat-publish-check.ts`（新增）、`baoyu-post-to-wechat/scripts/wechat-article.ts`（含封面补丁，作为第三方补丁恢复源备份入库）。
- ✅ **封面补丁纳入版本管理**：`wechat-article.ts` 的 `--cover` 参数 + `setCover()` 封面自动设置逻辑从此有备份，baoyu 更新后照本仓库版本覆盖即可恢复（重打步骤见下方专章）。
- ✅ **清理收尾**：删除 `E:/.workbuddy/日常会话/` 全部调试残留（`cover_dbg_*` 截图/DOM 探针、`cover_run_*.log`、`cover_ai_handdrawn.png`、`cover_handdrawn.png`、`cover_template*.html` 共约 44 个文件），保留回归夹具 `…_moyu-green-flex-b.html` 与 `cover_20260709.png`。

---

## 第三方补丁备份（baoyu-post-to-wechat）⚠️

> baoyu 是**第三方 marketplace skill，更新会被整体覆盖**。本仓库 `baoyu-post-to-wechat/scripts/wechat-article.ts` 是打了【封面自动设置补丁】的版本，**作为恢复源备份**。

### 补丁内容（wechat-article.ts）
- 新增 CLI 参数 `--cover <本地图片路径>`（`main()` 解析后触发 `setCover()`）
- 新增 `setCover()` 函数：browser 发布方法在「保存草稿」**之前**自动设封面缩略图，流程：点封面触发器 `.js_cover_btn_area` → 点「从正文选择」`.js_selectCoverFromContent` → 点选正文缩略图 `li.appmsg_content_img_item` → 点「下一步」→ 剪裁弹窗点「确认」（CDP 真实鼠标落按钮中心）→ 轮询 `cropDialogOpen()`，弹窗卸载 / 确认按钮消失即判成功
- 清理开发期调试死代码（62 行），确认判定改为「弹窗消失或确认按钮消失 = 成功」

### 重打步骤（baoyu 更新覆盖后）
1. 用本仓库 `baoyu-post-to-wechat/scripts/wechat-article.ts` **覆盖** `~/.workbuddy/skills/baoyu-post-to-wechat/scripts/wechat-article.ts`
2. 编译验证：`bun build --target=node wechat-article.ts --outfile=/tmp/wa_check.js`（应 Bundled 成功、无 error）
3. 回归发布：用 `wechat-publish-check.ts --html <测试文> --cover <封面> --submit` 验证封面缩略图 + 标题均落盘（后台草稿箱肉眼确认）

---

## 作者

翰桥 (hqding)

---

**END OF SKILL.md**
