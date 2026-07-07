---
name: hqding-ima-to-wechat
description: 从 IMA 知识库读取笔记，AI 生成公众号文章，使用 AI 文生图生成精美手绘风格封面，自动发布到微信公众号草稿箱。支持主题/颜色选择、格式优化、自动封面生成。当用户说"发布公众号""IMA 笔记发公众号""把笔记转成公众号文章""自动发布到微信"时使用此技能。
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
- `baoyu-post-to-wechat` - 发布到微信公众号

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
3. ✅ **AI 文生图封面** - 手绘/水彩风格，设计感强（**核心改进点**）
4. ✅ **格式优化** - 符合公众号排版规范
5. ✅ **主题/颜色支持** - grace/modern/simple + 12种颜色
6. ✅ **自动发布** - 一键发布到草稿箱

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
author: "小丁师傅"
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
const coverImagePath = `/e/.workbuddy/日常会话/cover_${Date.now()}.png`;
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

### Step 4：保存 Markdown 文件

**目标**：将生成的文章保存为 Markdown 文件

**执行方式**：

```typescript
// 1. 生成文件名
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const slug = articleTitle
  .toLowerCase()
  .replace(/[^\w\s-]/g, '') // 移除特殊字符
  .replace(/\s+/g, '-') // 空格转连字符
  .slice(0, 50); // 限制长度

const fileName = `/e/.workbuddy/日常会话/${today}_${slug}.md`;

// 2. 在正文开头插入封面图（第一张图会自动用作封面）
const markdownWithCover = markdownContent.replace(
  `# ${articleTitle}`,
  `# ${articleTitle}\n\n![封面](${coverImagePath})`
);

// 3. 保存文件
fs.writeFileSync(fileName, markdownWithCover);
```

**Markdown 文件格式要求**：

```markdown
---
title: "文章标题"
author: "小丁师傅"
date: "YYYY-MM-DD"
description: "文章摘要（50-120字）"
---

# 文章标题

![封面](cover_image_path.png)

正文内容...
```

**关键要求**：
1. ✅ 正文中必须包含至少一张图片（第一张会自动用作封面）
2. ❌ 不要在 frontmatter 写 `cover` 字段（会让 skill 困惑）
3. ❌ 不要使用 `--cover` 命令行参数
4. ✅ 让 `baoyu-post-to-wechat` skill 自动处理封面

---

### Step 5：发布到微信公众号草稿箱

**目标**：使用 `baoyu-post-to-wechat` skill 发布文章

**执行方式**：

```typescript
// 1. 构建命令
const command = `
  cd /e/.workbuddy/日常会话
  bun "C:/Users/jsfc_02/.workbuddy/skills/baoyu-post-to-wechat/scripts/wechat-api.ts"
  -f "${fileName}"
  --theme ${theme}
  --color ${color}
`;

// 2. 执行命令
const result = await execute_command(command, { timeout: 60000 });

// 3. 解析返回结果
const mediaId = parseMediaId(result);
```

**命令参数说明**：
- `-f <file>` - Markdown 文件路径（必需）
- `--theme <theme>` - 主题风格（可选，默认：grace）
  - 选项：`default, grace, simple, modern`
- `--color <color>` - 主题颜色（可选，默认：blue）
  - 选项：`blue, green, vermilion, yellow, purple, sky, rose, olive, black, gray, pink, red, orange`

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
4. 保存为 Markdown 文件：`2026-07-01_南京今日天气.md`
5. 发布到微信公众号草稿箱（主题：grace，颜色：blue）

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
用 hqding-ima-to-wechat 发布 IMA 笔记"南京天气随笔"，主题用 modern，颜色用 green
```

**执行流程**：
1. 读取笔记"南京天气随笔"
2. 生成文章
3. 生成封面图（提示词中加入"modern 风格，绿色系"）
4. 发布到草稿箱（--theme modern --color green）

---

## 参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `noteTitle` | string | 否 | 笔记标题（不提供则读取最新笔记） |
| `theme` | string | 否 | 主题风格（默认：grace） |
| `color` | string | 否 | 主题颜色（默认：blue） |
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
// 正确的参数格式
await ima-mcp.get_knowledge_base_list({
  params: [{ limit: 20 }]
});

await ima-mcp.get_knowledge_list({
  params: [{ knowledge_base_id: "7477994624936006", limit: 20 }]
});

await ima-mcp.fetch_media_content({
  params: [{ media_id: "note_38be541dea9ff7902f186e1c519703e5_..." }]
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

### 3. baoyu-post-to-wechat 调用

```typescript
// 正确的命令格式
await execute_command(`
  cd /e/.workbuddy/日常会话
  bun "C:/Users/jsfc_02/.workbuddy/skills/baoyu-post-to-wechat/scripts/wechat-api.ts"
  -f "${fileName}"
  --theme grace
  --color blue
`, { timeout: 60000 });
```

---

## 更新日志

### v1.0.0 (2026-07-01)

- ✅ 初始版本
- ✅ 支持 IMA 知识库读取
- ✅ 支持 AI 生成文章
- ✅ **支持 AI 文生图生成封面（手绘/水彩风格）**
- ✅ 支持发布到微信公众号草稿箱
- ✅ 支持主题/颜色参数

---

## 作者

翰桥 (hqding)

---

**END OF SKILL.md**
