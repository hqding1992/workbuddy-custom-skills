# 📝 hqding-ima-to-wechat

> 从 IMA 知识库读取笔记，AI 生成公众号文章，AI 文生图生成手绘封面，自动发布到微信公众号草稿箱

---

## ✨ 功能亮点

- 📚 **IMA 知识库读取** — 自动搜索和读取指定 / 最新笔记
- 🤖 **AI 生成文章** — 根据笔记内容智能扩展，符合公众号风格
- 🎨 **AI 文生图封面** — 手绘 / 水彩风格，设计感强（替代丑陋 placeholder）
- 📰 **gzh-design 专业排版** — 调用 gzh-design 将 Markdown 转公众号合规 HTML（章节编号 / 关键词下划线 / 引言卡 / 全角标点，6 套主题可选）
- 🚀 **自动发布草稿箱** — baoyu 接收 HTML 一键发布，首图自动当封面

---

## 🚀 快速开始

在 WorkBuddy 对话中输入以下任意关键词即可触发：

```
发布公众号 / IMA 笔记发公众号 / 把笔记转成公众号文章 / 自动发布到微信
```

**完整链路**：

```
IMA 笔记 → AI 成文 → AI 手绘封面 → gzh-design 排版 → baoyu 发布草稿箱
```

**手动触发（指定笔记标题）**：

```
用 hqding-ima-to-wechat 发布 IMA 笔记"南京天气随笔"
```

---

## 📁 文件结构

```
hqding-ima-to-wechat/
├── SKILL.md                      # 核心规则与执行流程（权威文档）
└── scripts/
    └── wechat-publish-check.ts   # 标题 / 作者兜底薄封装（不改动第三方 baoyu）
```

> 💡 `baoyu-post-to-wechat` 是第三方 skill，其带封面补丁的 `wechat-article.ts` 备份存于本仓库 `baoyu-post-to-wechat/scripts/`（baoyu 更新覆盖后照此恢复，详见 SKILL.md「第三方补丁备份」章）。

---

## 🔧 系统要求

| 项目 | 要求 |
|------|------|
| **运行环境** | WorkBuddy（需支持 MCP / 云端服务 / skill 调用） |
| **依赖 Skill** | `gzh-design`（排版）、`baoyu-post-to-wechat`（发布） |
| **依赖 MCP** | `ima-mcp`（读取 IMA 知识库） |
| **依赖工具** | `connect_cloud_service`（AI 文生图 token） |
| **可选配置** | `~/.workbuddy/.secrets/llm.env`（LLM 标题总结，未配则降级本地首段提取） |

---

## 📋 核心参数

| 参数 | 说明 | 默认 |
|------|------|------|
| `noteTitle` | 笔记标题（不提供则读最新笔记） | 最新笔记 |
| `gzhTheme` | gzh-design 排版主题（如 moyu-green / red-white） | 按题材自动选 |
| `theme` / `color` | AI 封面图风格 / 色调提示 | 手绘插画 |
| `coverStyle` | 封面图风格 | 手绘插画 |

---

## 📄 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0.0 | 2026-07-01 | 初始版本：IMA 读取 + AI 成文 + AI 手绘封面 + 发布草稿箱 |
| v1.1.0 | 2026-07-09 | 排版改用 gzh-design 调用（工作流组合，不复制打包） |
| v1.1.6 | 2026-07-10 | 发布默认改 B 方案（browser 方法），保留 flex 原版观感 |
| v1.1.7 | 2026-07-10 | 新增标题兜底封装 wechat-publish-check.ts + BUN 调用修复 |
| v1.1.8 | 2026-07-10 | GitHub 同步 + 第三方 baoyu 补丁备份纳入版本管理 |
| v1.1.9 | 2026-07-11 | 新增 README.md，对齐 skill 仓库展示标准 |

---

## ⚠️ 已知限制

- 仅发布到**草稿箱**，需人工在公众号后台点击「群发」（不支持自动群发）
- 首次发布需扫码登录公众号后台（session 可复用）

---

## 📜 声明

本 Skill 用于个人内容创作自动化，请遵守微信公众号平台规范。

---

**作者**：翰桥 (hqding)
**许可**：MIT
