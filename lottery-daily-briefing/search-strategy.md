# 搜索策略 — 固定栏目抓取 + 结构化多步搜索法

> 本文件定义彩票新闻简报信息采集的标准化流程。每次生成简报时严格按此策略执行，确保高效、全面、无遗漏。
> 
> 📂 **路径说明**：本文档所有脚本路径均相对于 workspace 根目录（`e:\.workbuddy\每日彩票新闻\`）执行。

---

## 📋 前置准备

- 设 **TODAY** 为当前日期（如 2026-04-03）
- 设 **YESTERDAY** 为昨日（如 2026-04-02）
- **搜索时间窗口**：`YESTERDAY 12:00 至 TODAY 12:00`（24 小时窗口）

---

## Step 0：官方固定栏目抓取（分两批执行）

**🎯 目的**：直接从官网固定栏目抓取信息。**这是活动/渠道信息的主力信源。**
**分工说明**：
- **政策动态 / 通知公告类信息（0.4）** → 官网唯一主力信源
- **开奖数据 → Step 2 独立处理**
- **活动 / 渠道 / 营销类信息（0.1~0.3, 0.5~0.6, 0.7~0.8）** → **官网为主力信源**，微信公众号（Step 3，2026-07-08 起废止默认跳过）原作补充，现由 Step 0 官网 + Step 3.4 搜索引擎覆盖，无需公众号补充。

> **执行方式（v1.9.0 变更）**：
> - **第1批（8次并行）**：0.1~0.8，全部非 cwl.gov.cn 域名，无反爬风险
> - **第2批（2次串行，间隔5-10秒）**：0.9 和 0.10 为 cwl.gov.cn 域名，必须串行执行以避免触发 IP 频率限制。先抓 0.9，等待 5-10 秒后再抓 0.10
> - 0.9/0.10 失败时等待 5-10 秒重试 1 次，仍失败则跳过（Step 2.5 各省官网已覆盖）

### 抓取 0.1 — 江苏体彩·体彩动态 ⭐

```
url: https://www.js-lottery.com/xwzx/tcdt
fetch_info: 最新体彩动态标题、日期、链接（重点关注：网点特色探店、主题活动、公益宣传、南京等城市相关）
用途: 江苏体彩全省网点特色和活动，每日更新，内容丰富
筛选: 按日期筛选时间窗口内内容，特别关注南京地区
```

### 抓取 0.2 — 江苏体彩·品牌活动

```
url: https://www.js-lottery.com/tchd/pphd
fetch_info: 最新品牌活动列表（活动名称、时间、内容描述、参与方式）
用途: 全省品牌活动（赛事联动、公益宣传、渠道推广等）
筛选: 按日期筛选时间窗口内内容，持续进行的品牌活动纳入追踪
```

### 抓取 0.3 — 江苏体彩·营销热点

```
url: https://www.js-lottery.com/tchd/yxrd
fetch_info: 最新营销活动列表（活动名称、时间、促销内容）
用途: 全省营销促销（派奖、赠票、新票上市等）
筛选: 按日期筛选时间窗口内内容，持续进行的营销活动纳入追踪
```

### 抓取 0.4 — 江苏体彩·通知公告

```
url: https://www.js-lottery.com/tzgg/tzgg
fetch_info: 最新通知公告列表（标题、日期、链接，重点关注：游戏规则变更、派奖活动、新票上市/停售、兑奖截止调整）
用途: 官方公告，涵盖规则变更和重大销售安排
特别关注: 政策动态类信息（规则变更、休市安排、兑奖期限调整）
```

### 抓取 0.5 — 江苏福彩·地市动态 ⭐

```
url: https://www.jslottery.com/articles?article_type=地市动态&locale=zh-CN
fetch_info: 最新地市动态列表（标题、日期、链接，重点关注：各地市工作会议、公益活动、渠道合作、网点建设、南京相关）
用途: 江苏福彩各地市动态，更新频率高，覆盖全省13个地市
筛选: 按日期筛选时间窗口内内容
备注: 替代原"主页热点新闻"栏目（该URL连续超时不可用）
```

### 抓取 0.5b — 江苏福彩·公益活动

```
url: https://www.jslottery.com/articles?article_type=公益活动&locale=zh-CN
fetch_info: 最新公益活动列表（标题、日期、链接，重点关注：公益金项目、品牌活动、南京相关）
用途: 江苏福彩公益活动专用栏目，补充地市动态未覆盖的公益类信息
筛选: 按日期筛选时间窗口内内容
备注: ⭐ 本省/南京强制深抓——0.5（地市动态）、本栏目（公益活动）、0.6（营销活动）三栏目的本省/南京条目 URL 必须全部进入 Step 4 深抓队列，不得因漏栏（如只抓地市动态漏本栏目）降级为简讯
```

### 抓取 0.6 — 江苏福彩·营销活动

```
url: https://www.jslottery.com/articles?article_type=营销活动&locale=zh-CN
fetch_info: 最新营销活动列表（活动名称、时间、内容描述）
用途: 江苏福彩全省营销促销（赠票、赠券、派奖、新票上市等）
筛选: 按日期筛选时间窗口内内容，持续进行的营销活动纳入追踪
```

### 抓取 0.7 — 中体彩·行业新闻

```
url: https://www.lottery.gov.cn/xwzx/hy/index.html
fetch_info: 最新行业新闻标题、日期、链接（重点关注活动、渠道创新、公益项目）
用途: 获取全国体彩活动/渠道/公益信息，按日期筛选时间窗口内内容
```

### 抓取 0.8 — 中体彩·媒体说

```
url: https://www.lottery.gov.cn/xwzx/mts/index.html
fetch_info: 最新媒体报道标题、日期、链接（重点关注：公益项目案例、责任彩票实践、渠道创新深度报道、具体落地活动）
用途: 媒体视角的深度报道，覆盖"快乐操场"、社区捐赠、体彩公园等具体案例，补充各地活动和渠道信息
筛选: 按日期筛选时间窗口内内容
```

### 抓取 0.9 — 中福彩·业务动态 ⭐（第2批，串行执行）

```
url: https://www.cwl.gov.cn/gzdt/ywdt/index.shtml
fetch_info: 最新业务动态标题、日期、链接（重点关注：公益活动、渠道创新、责任彩票、政策解读、全国性活动）
用途: 全国福彩业务动态，覆盖公益金项目、渠道转型、责任彩票等，信息量大且更新频繁
筛选: 按日期筛选时间窗口内内容
注意: ⚠️ cwl.gov.cn 受反爬策略管控，必须串行执行（先于 0.10），与其他 cwl.gov.cn 请求间隔 5-10 秒
```

### 抓取 0.10 — 中福彩·各省亮点（第2批，串行执行）

```
url: https://www.cwl.gov.cn/gzdt/gsld/index.shtml
fetch_info: 最新各省亮点动态标题、日期、链接（重点关注江苏/南京相关）
用途: 获取各省福彩公益活动、渠道创新案例，按日期筛选时间窗口内内容
注意: ⚠️ 必须在 0.9 完成后等待 5-10 秒再执行，与其他 cwl.gov.cn 请求间隔 5-10 秒
```

> ⚠️ **Step 0 的 cwl.gov.cn 请求管控（v1.9.0 更新）**：0.9（业务动态）和 0.10（各省亮点）均为 cwl.gov.cn 域名，**已从并行改为串行执行**（间隔 5-10 秒）。加上 Step 2 的福彩开奖请求，单次简报对 cwl.gov.cn 的总请求量为 3 次，全部串行执行。

---

## Step 1：综合搜索（3 次并行）

**🎯 目的**：覆盖政策动态、江苏南京本地动态、全国中奖与渠道新闻。

> 3 次搜索可**全部并行执行**。
> ⚠️ **语法注意**：当前搜索引擎不支持 `OR` 和 `site:` 操作符，请使用自然语言关键词组合。

### 搜索 1.1 — 全国政策与行业动态

```
query: 彩票 {TODAY完整日期}
示例: 彩票 2026年4月7日
language: zh-CN | max_results: 10
```

### 搜索 1.2 — 江苏南京本地动态（补充官网盲区）

> 本搜索用于覆盖官网 Step 0 和公众号 Step 3 可能遗漏的本地信息（如南京市民政局官网等官方渠道）。

```
query: 南京福彩 民政局
language: zh-CN | max_results: 10
```

### 搜索 1.3 — 全国中奖与公益新闻（补充）

> 本搜索聚焦**中奖信息**和**公益项目报道**，补充官网 Step 0 的全国层面信息。

```
query: 体彩 福彩 中奖 一等奖 {TODAY月份日期}
示例: 体彩 福彩 中奖 一等奖 4月7日
language: zh-CN | max_results: 10
```

---

## Step 2：开奖数据采集（一站式优先）

**🎯 目的**：获取最新开奖号码、奖池信息。开奖信息不限时间范围，按日期倒序排列。

### ⚠️ cwl.gov.cn 反爬策略（v1.9.0 全链路串行）

> cwl.gov.cn 存在临时性IP频率限制，自动化执行时可能触发403。**v1.9.0 起全链路串行化**：

1. **Step 0 第2批**：0.9（业务动态）→ 等待 5-10 秒 → 0.10（各省亮点）
2. **Step 1 搜索缓冲**：Step 0 与 Step 2 之间有 Step 1 的搜索请求作为自然间隔
3. **Step 2 第2批**：体彩4个专区页并行完成后 → 等待 5-10 秒 → 福彩开奖公告页
4. **Step 2.2 按需补充**：如需抓取 cwl.gov.cn 详情页，每次间隔 5-10 秒
5. **403 重试**：如首次请求返回 403，等待 5-10 秒后重试 1 次
6. **降级兜底**：如重试仍 403，则降级到第三方渠道获取开奖数据，并在简报中添加信源降级声明

> 📌 **核心原则**：同一 IP 对 cwl.gov.cn 的所有请求（Step 0 第2批 + Step 2 + Step 2.2），均串行执行，每次间隔 5-10 秒，确保不触发频率限制。

### 第 1 步：开奖页面抓取（5 次并行，覆盖全部 9 个彩种）

| 官网页面 | URL | 覆盖彩种 | 执行顺序 |
|---------|-----|---------|---------|
| 江苏体彩网·大乐透专区 | `https://www.js-lottery.com/wfzq/dlt` | 大乐透 | 第1批（并行） |
| 江苏体彩网·7星彩专区 | `https://www.js-lottery.com/wfzq/sevenstar` | 7星彩 | 第1批（并行） |
| 江苏体彩网·排列3/5专区 | `https://www.js-lottery.com/wfzq/p3p5` | 排列3、排列5 | 第1批（并行） |
| 江苏体彩网·7位数专区 | `https://www.js-lottery.com/wfzq/seven` | 7位数（江苏本地） | 第1批（并行） |
| 中国福彩网开奖公告页 | `https://www.cwl.gov.cn/ygkj/kjgg/` | 双色球、快乐8、福彩3D、七乐彩 | 第2批（串行，间隔5-10秒） |

> ⚠️ 福彩开奖数据**必须使用开奖公告页** `ygkj/kjgg/`（⚠️ 不能带 index.shtml 后缀，否则返回403）。往期开奖页 `ygkj/wqkjgg/index.shtml` 为空白查询界面，无实际数据。
> ⚠️ **体彩开奖数据分布在4个独立子页面**，`/wfzq/dlt` 仅包含大乐透数据，7星彩/排列3/5/7位数需分别访问各自专区页面。
> ⚠️ 排列3、排列5为固定设奖玩法，**无浮动奖池**，页面不显示奖池余额，简报中标注"固定设奖"即可。
> ⚠️ **执行顺序**：体彩4个专区页并行抓取（第1批）→ 等待5-10秒 → 福彩开奖公告页（第2批），避免 cwl.gov.cn 并行请求触发反爬。

### 第 2 步：按需补充（仅在页面数据不完整时执行）

| 缺失内容 | 补充方式 |
|---------|---------|
| 福彩兑奖截止日期/中奖地区 | 搜索 `"游戏名 第{期号}期 开奖"` → 从搜索结果中筛选 cwl.gov.cn 来源的公告页抓取 |
| 福彩销售额/完整数据 | 抓取中福彩开奖公告页 `cwl.gov.cn/ygkj/kjgg/`（注意：不能带 index.shtml 后缀，否则返回403） |
| 体彩历史数据验证 | 抓取江苏体彩历史数据页 `js-lottery.com/wfzq/{游戏}/data`（大乐透/dlt、7星彩/sevenstar、排列3/p3p5/p3data、排列5/p3p5/p5data、7位数/seven） |

### 第 3 步：搜索验证（仅在信源数据仍不足时，按需对单个彩种执行 1 次搜索）

```
query: "{游戏名} 第{最新期号}期 开奖"
示例: "双色球 第2026036期 开奖" / "大乐透 第26035期 开奖"
```

> 📌 **期号计算**：所有彩种每年从 001 开始计数（第 26035 期 = 2026 年第 35 期）。

---

## Step 2.5：省级官网全覆盖抓取（⭐ 全国覆盖核心）

**🎯 目的**：每天抓取全国30个省的体彩/福彩官网新闻动态，确保活动和渠道信息的时效性（当天发布当天抓到）。

> ⚠️ **这是解决"各地活动/渠道覆盖不全"问题的核心方案。**
> **每天全覆盖30省**（江苏除外，已在 Step 0 固定覆盖），每个省抓取体彩+福彩两个官网。

### 🚨 Step 2.5 强制纪律（v2.1.8 新增，违反即视为严重错误）

> **根因教训（2026-07-07）**：曾因 Agent 凭记忆/旧缓存执行，使用了与 Skill 不符的过期 URL，导致整批 7 站全败；又因"报告型"校验未拦截，提前生成了带"约70%完整性"声明的简报。**以下两条为硬规则，不可绕过**：

1. **每批前必须复读最新 URL（禁止凭记忆）**：
   - 进入 Step 2.5 前，必须完整 Read 本文件 Step 2.5 全部批次 URL 表（本次会话内已读可复用；**若距上次读取已超过 1 个工具调用轮次、或本任务曾发生任何错误，必须重新 Read**）。
   - **执行每一批之前，必须先用一句话复述该批将抓取的 URL 清单（逐条引用文件中的 URL，不得改写）**，确认与文件一致后才可执行。这强制把"文件最新 URL"作为唯一数据源，消除人为漂移。
2. **收尾校验升级为硬拦截门禁（禁止静默放行）**：
   - Step 2.5 的 **8 批全部跑完** = 6 批 web_fetch + 1 批 API（浙江体彩）+ 1 批 Playwright（9 站串行）。
   - **若任一关键批次缺失 → 禁止进入 Phase 3/4 生成简报**。必须立即输出失败报告（列出缺失批次/站点）并尝试补齐（失败站点重试 1 次）；仍无法补齐则**终止本次简报并明确报告"因 X 批次缺失，简报未生成"**。
   - 简报文件中**不得出现"约 X% 完整性""部分省份暂未覆盖"等模糊免责**，要么全量、要么明确失败。

### 执行方式（v2.1.0 分批并行 + 执行完整性保障）

> ⚠️ **v2.1.0 变更**：批次间隔改为显式 **sleep 9（约9秒）**，增加执行完整性要求（6批+Playwright批必须全部完成），失败重试间隔统一为 sleep 9。

> ⚠️ **v2.0.0 变更**：原"全部并行"策略因 web_fetch 并发限制导致大量超时（实测并行18+个时超时率>80%），
> 改为**分6批并行**，每批≤8个 web_fetch，批次间隔 sleep 9（约9秒）。另加1批 Playwright 串行抓取5省SPA。

每个省抓取 **2 个 web_fetch**（体彩官网 + 福彩官网），**分6批并行 + 1批Playwright串行执行**：

```
fetchInfo: 提取时间窗口内（昨日12:00至今天12:00）发布的新闻标题、日期、链接。重点关注：公益活动、品牌推广、网点创新、渠道拓展、营销活动。按日期倒序排列。
```

#### 第1批：华东地区（6个 web_fetch）

| # | 省份 | 类型 | URL |
|---|------|------|-----|
| 1 | 浙江 | 福彩 | https://www.zjflcp.com/ch120/csdt/ |
| 2 | 上海 | 体彩 | https://www.shsportslottery.com/ |
| 3 | 山东 | 福彩 | https://www.sdcp.cn/article_list/fcxw |
| 4 | 安徽 | 体彩 | https://www.ahtycp.com/ |
| 5 | 福建 | 体彩 | https://www.fjtc.com.cn/ |
| 6 | 福建 | 福彩 | https://www.fjcp.cn/fucaizixun/xinwenzixun/ |

> 📌 浙江体彩已改用下方 **API 批**（`fetch_tycai_api.js`）抓取；山东体彩（http-only 静态，https 超时）已移至下方 Playwright 批，均不在此 web_fetch 批次。
> ⏳ 第1批完成后执行 `sleep 9`，再执行第2批

#### 第2批：华南+华北（7个 web_fetch）

| # | 省份 | 类型 | URL |
|---|------|------|-----|
| 1 | 江西 | 体彩 | https://www.jxlottery.cn/ |
| 2 | 江西 | 福彩 | https://www.jxfczx.cn/news/NewsList.aspx?TypeId=62 |
| 3 | 广东 | 体彩 | https://www.gdlottery.cn/ |
| 4 | 广东 | 福彩 | https://www.gdfc.org.cn/news_list_13.html |
| 5 | 广西 | 福彩 | https://www.gxcaipiao.com.cn/newslist-i/10_0_1.html |
| 6 | 海南 | 体彩 | https://www.hainantc.com.cn/ |
| 7 | 海南 | 福彩 | https://www.hainancp.com/list/12/ |

> ⏳ 第2批完成后执行 `sleep 9`，再执行第3批

#### 第3批：华北+华中+西南（8个 web_fetch）

| # | 省份 | 类型 | URL |
|---|------|------|-----|
| 1 | 北京 | 体彩 | https://www.bjlot.com.cn/ |
| 2 | 天津 | 体彩 | https://www.tjtc.org.cn/ |
| 3 | 天津 | 福彩 | https://www.tjflcpw.com/news/NewsListLower.aspx?TypeId=1 |
| 4 | 河北 | 体彩 | https://www.hbtcw.com/ |
| 5 | 河北 | 福彩 | https://www.yzfcw.com/lotteryNews/newsList?classficationId=3 |
| 6 | 山西 | 体彩 | https://www.sxlottery.net/ |
| 7 | 湖北 | 体彩 | https://www.hbtycp.com/tczx |
| 8 | 湖北 | 福彩 | https://www.hbfcw.cn/csyw/ |

> ⏳ 第3批完成后执行 `sleep 9`，再执行第4批

#### 第4批：华中+西南+西北+东北+中彩网（8个 web_fetch）

| # | 省份 | 类型 | URL |
|---|------|------|-----|
| 1 | 河南 | 体彩 | https://hnlottery.com.cn/ |
| 2 | 湖南 | 体彩 | https://www.hnticai.com/ |
| 3 | 湖南 | 福彩 | https://mzt.hunan.gov.cn/mzt/fc/xwzxfc/fcywfc/index.html |
| 4 | 四川 | 体彩 | https://www.scticai.cn/ |
| 5 | 四川 | 福彩 | https://www.scflcp.com.cn/tzgg |
| 6 | 贵州 | 福彩 | https://www.gzfucai.cn/xinwenzhongxin/fucairedian/ |
| 7 | 中彩网 | 聚焦 | https://www.zhcw.com/jj/tj/ |
| 8 | 西藏 | 体彩 | https://www.xztycp.com/channels/23.html | 新闻资讯（静态HTML/web_fetch可抓，2026-07-10补入；原待补充经核验为真实官网 xztycp.com）|

> ⏳ 第4批完成后执行 `sleep 9`，再执行第5批

#### 第5批：西北+东北（7个 web_fetch）

| # | 省份 | 类型 | URL |
|---|------|------|-----|
| 1 | 陕西 | 体彩 | https://www.sxtc.com.cn/tcxw/list/page.html |
| 2 | 陕西 | 福彩 | https://www.sxlotto.com.cn/xw/snxw/ |
| 3 | 甘肃 | 体彩 | https://www.gstc.org.cn/ |
| 4 | 甘肃 | 福彩 | https://www.gsflcp.com/xw/snxw/ |
| 5 | 宁夏 | 体彩 | https://www.nxtcw.com.cn/ |
| 6 | 新疆 | 体彩 | https://www.xjlottery.com.cn/ |
| 7 | 新疆 | 福彩 | https://www.xjflcp.cn/root/n_139.htm |
| 8 | 青海 | 福彩 | https://www.qhflcp.cn/news/NewsList.aspx?TypeId=0 | 新闻中心聚合页，web_fetch实测可抓取（2026-07-06 用户确认，含活动/渠道/公益/公告），从fetch failed待核实移入本批 |

> ⏳ 第5批完成后执行 `sleep 9`，再执行第6批

#### 第6批：东北+华北+华南补充（8个 web_fetch）

| # | 省份 | 类型 | URL |
|---|------|------|-----|
| 1 | 辽宁 | 体彩 | https://www.lntycp.com/ |
| 2 | 辽宁 | 福彩 | https://www.lnlotto.com/View/NewsList.aspx?TypeId=47&CityID=-1 |
| 3 | 吉林 | 体彩 | https://www.jlstycp.com/ |
| 4 | 吉林 | 福彩 | https://www.jlfc.com.cn/View/Index.aspx |
| 5 | 黑龙江 | 体彩 | https://www.hljtycp.org.cn/ |
| 6 | 黑龙江 | 福彩 | https://www.lottost.cn/xwzx/snxw/ |
| 7 | 内蒙古 | 体彩 | https://www.nmtc.com.cn/ |
| 8 | 深圳 | 福彩 | https://www.szlottery.org/fcw/fcxw/szfc/index.html |

> ⏳ 第6批完成后执行 `sleep 9`，再执行 Playwright 批

#### Playwright批：5省SPA福彩 + 4省体彩（山东/广西/贵州/青海，http-only或SPA）（9个串行执行，严禁并行，必须执行）

| # | 省份 | 类型 | URL | 说明 |
|---|------|------|-----|------|
| 1 | 上海 | 福彩 | https://www.swlc.net.cn/shsflcpfxzx/bszx/bszx.html | 需JS加载更多 |
| 2 | 安徽 | 福彩 | https://www.ahflcp.com.cn/ | Vue SPA |
| 3 | 河南 | 福彩 | http://www.henanfucai.com/#/article/channel/list/1-9 | Vue SPA（福彩要闻），仅http |
| 4 | 重庆 | 福彩 | https://www.cqcp.net/navigation/fczx | Nuxt.js SPA |
| 5 | 云南 | 福彩 | https://www.ynflcp.cn/list/xwzx-2008880236425531393 | web_fetch不兼容 |
| 6 | 山东 | 体彩 | http://www.sdticai.com/wzgb/xinwen/ | 静态HTML，仅http（https超时），✅ 实测Playwright抓取30条 |
| 7 | 广西 | 体彩 | http://www.lottery.gx.cn/ggtz/index.html | 静态HTML，仅http（https超时），✅ 2026-07-06 实测Playwright抓取30条（公告栏目）|
| 8 | 贵州 | 体彩 | https://www.gzstycp.com/information/notice/index.html | Vue SPA，需 `domcontentloaded`+等待9秒，✅ 实测抓取16条（日期在img src路径）|
| 9 | 青海 | 体彩 | https://www.qhtycp.com/lst60?word=&page=1 | 老ASP静态表格站，✅ 2026-07-06 实测Playwright抓取36条（/view\d+ 链接）|

```bash
# ⚠️ 9个站点必须【逐条串行】执行，严禁在同一条消息里并行启动多个 Chromium（避免内存/CPU尖峰崩溃）
# 每个站点抓取完成后，等待 9 秒再抓下一个；贵州体彩需加参数 domcontentloaded 9000
cd scripts && node fetch_news.js "<url>" [wait_until=load] [wait_ms=3000] && sleep 9
#   贵州体彩（Vue SPA）：node fetch_news.js "https://www.gzstycp.com/information/notice/index.html" domcontentloaded 9000 && sleep 9
#   河南福彩（http-only Vue SPA，连接易超时）：node fetch_news.js "http://www.henanfucai.com/#/article/channel/list/1-9" domcontentloaded 9000 60000 && sleep 9
```

> ⚠️ **执行确认**：Playwright批是 SPA 站点（贵州体彩/安徽福彩等）及 http-only 静态站点（山东/广西体彩）的唯一抓取方式，**必须执行**。**9 个站点必须逐条串行**（每条间 `sleep 9`），严禁并行启动多个 Chromium，否则易内存/CPU 尖峰导致崩溃。如因脚本依赖缺失导致失败，先修复依赖再执行，不得以"今天跳过"为由遗漏。贵州体彩需加参数 `domcontentloaded 9000`。

#### API批：体彩统一前端（浙江体彩，串行执行，必须执行）

| # | 省份 | 类型 | 调用方式 | 说明 |
|---|------|------|---------|------|
| 1 | 浙江 | 体彩 | `node scripts/fetch_tycai_api.js 330000ZJ-FFACD3FA 111` | 体彩全国统一后端（websiteapi.sporttery.cn），web_fetch/Playwright 均无法抓（zjlottery.com 失效、zjtycp.cn/xxgk 非新闻源），唯一公开源即此 API。✅ 2026-07-06 实测返回当天数据 |

```bash
# 串行执行（API 调用轻量，可与 Playwright 批连续执行）
cd scripts && node fetch_tycai_api.js 330000ZJ-FFACD3FA 111
```

> ⚠️ **调用说明**：脚本输出标准 JSON 数组 `[{title, date, href, source}]`，Agent 直接读取解析，提取时间窗口内（YESTERDAY 12:00 至 TODAY 12:00）的新闻。
> **复用提示**：仅当某省体彩官网确为 websiteapi.sporttery.cn 统一后端（目前仅浙江经核实）时，才用本脚本——找到其 `Tenant-Id`（+栏目 `topClusterIdList`）即可复用，新增一行即可。⚠️ 广西/贵州/青海体彩已用 Playwright 修复（非此 API），勿套用本脚本。

### 未覆盖省份（靠中彩网+搜索引擎补充）

| 省份 | 缺失类型 | 补充方式 |
|------|---------|---------|
| 北京 | 福彩 | 中彩网聚焦 + Step 3.4 搜索引擎 |
| 内蒙古 | 福彩 | 中彩网聚焦 + Step 3.4 搜索引擎 |
| 西藏 | 福彩 | 中彩网聚焦 + Step 3.4 搜索引擎（体彩已于2026-07-10补入第4批 xztycp.com）|
| 宁夏 | 福彩 | 中彩网聚焦 + Step 3.4 搜索引擎 |
| 深圳 | 体彩 | 归广东体彩网（gdlottery.cn）覆盖，不单列 |

### 执行要点

| 要点 | 说明 |
|------|------|
| **分批并行** | 6批 web_fetch，每批最多8个并行；1批 Playwright 串行（9个）；1批 API 串行（浙江体彩）。web_fetch 批间显式 `sleep 9` |
| **批次间隔** | 每批完成后**显式执行 `sleep 9`** 再发下一批（不要用"软等待"），避免触发 web_fetch 并发限制和目标服务器频率限制；Playwright 9个站点逐条串行，每条间隔 `sleep 9` |
| **超时重试（快速失败）** | web_fetch 单条返回超时/连接失败，**等待 `sleep 9` 后仅重试 1 次**；重试仍失败立即标记并跳过该条、进入下一条，**严禁无限重试，也不得因个别URL卡死让单批停滞超过约30s**（单批整体不得被个别失败URL阻塞）。预计可挽回约50%的临时超时 |
| **URL兜底** | 如某个官网 web_fetch 失败（超时/403/JS渲染），尝试用 Playwright 脚本抓取（`node scripts/fetch_news.js <url>`），再失败则跳过不重试 |
| **SPA兜底** | 5省福彩web_fetch不可用 + 山东体彩（http-only静态，https超时），**必须用Playwright串行抓取**，不得跳过：安徽/河南（Vue，河南仅http）、重庆（Nuxt.js）、云南（web_fetch不兼容）、上海（JS加载不完整）、山东（http://www.sdticai.com/wzgb/xinwen/，静态HTML） |
| **API兜底** | 浙江体彩（zjlottery.com 失效、zjtycp.cn/xxgk 非新闻源）**必须用 fetch_tycai_api.js 脚本抓取**，不得跳过；仅当某省确认同为 websiteapi.sporttery.cn 后端时才复用本脚本（目前仅浙江） |
| **中彩网补充（省份归并）** | 中彩网"聚焦"栏目（https://www.zhcw.com/jj/tj/）在第4批并行抓取，作为北京福彩/内蒙古福彩/西藏福彩/宁夏福彩/深圳体彩（无独立官网）的补充源。生成五大类时须主动识别聚焦内容中带"西藏、宁夏、内蒙古、北京、深圳"地域关键词的地方动态并归并到对应省份分类；无明确地域归属的作全国新闻处理（2026-07-10 v2.1.13 翰桥拍板方案1） |
| **去重** | 与 Step 0（江苏）结果去重（原 Step 3.1 公众号去重随 Step 3 废止已失效，无需处理） |
| **时效过滤** | 仅提取时间窗口内的新闻（YESTERDAY 12:00 至 TODAY 12:00） |
| **分类** | 活动类→各地活动，渠道类→渠道拓展 |
| **江苏豁免** | 江苏省（体彩 js-lottery.com + 福彩 jslottery.com）已在 Step 0 覆盖，不重复抓取 |
| **深圳纳入** | 深圳为计划单列市，福彩独立于广东，已纳入华南地区 |

### ⚠️ 执行完整性要求（v2.1.0 新增）

> **核心原则**：Step 2.5 的 6 批 web_fetch + 1 批 Playwright 串行 + 1 批 API 串行**必须全部完成**，不得因"前期请求量较大"或"部分完成"而提前进入下一阶段。

| 要求 | 说明 |
|------|------|
| **完整执行** | 6批 web_fetch 全部执行完毕，每批失败后重试1次，仍失败则记录到失败列表，继续下一批 |
| **Playwright批必须执行（串行）** | 5省SPA福彩 + 4省体彩（山东/广西/贵州/青海，http-only或SPA）共9个，**必须逐条串行、每条间隔 sleep 9，严禁并行**，不得跳过，即使前期执行时间较长 |
| **失败记录** | 所有失败URL记录到执行日志，简报中标注"部分省份因网络原因暂未覆盖" |
| **禁止提前截断** | Agent 不得以"请求量较大"为由提前结束 Step 2.5，必须完成全部8批（6批web_fetch + 1批Playwright + 1批API） |
| **🆕 批次进度硬核对（v2.1.7）** | **每批完成后必须输出进度计数**：`[进度] 第 X/6 批 web_fetch 完成（本批 N 条，累计 M 条）`；API 批输出 `[进度] 浙江体彩 API 批完成（N 条）`；Playwright 批每站输出 `[进度] Playwright 第 k/9 站 <站点名> 完成（N 条）`。Step 2.5 全部 8 批跑完后做**收尾校验**：若 6 批 web_fetch 有缺失批次 / Playwright 9 站有缺失 / API 批未执行，必须**明确报错并列出缺失项**，不得静默结束或假装成功 |
| **🆕 收尾硬拦截门禁（v2.1.8）** | 8 批（6 web_fetch + 1 API + 1 Playwright9站）全部完成才能解除拦截。**判定清单**：① 6 批 web_fetch 每批均有输出且计数为预期条数（失败需重试 1 次后仍记失败，不得假装成功）；② 浙江体彩 API 批已执行并输出条数；③ Playwright 9 站每站均有输出（含"0条/超时跳过"也须显式记录，不得静默缺失）。**三者缺一 → 禁止生成简报，输出缺失报告并终止**。 |
| **🆕 Playwright 单站超时兜底（v2.1.7）** | 每个站点抓取由 `fetch_news.js` 内置单站硬超时（默认 90s），超时强制输出空结果并跳过该站，**不中断整批 9 站串行**；逐条串行 + 每条 `sleep 9` 不变 |

---

## Step 3：微信公众号内容搜索（补充信源）

**🎯 目的**：从微信公众号补充搜索"各地活动"和"渠道拓展"类信息，填补官网（Step 0/2.5）和搜索引擎（Step 1）的覆盖盲区。

> ⚠️ **适用范围**：Step 3 搜索结果**仅用于填充"各地活动"和"渠道拓展"两大分类**。
> 政策动态、开奖数据、中奖信息仍以官网/监管机构信源为主（Step 0 / Step 2），不在此重复。

> ⚠️ **重要限制**：搜狗微信搜索索引更新严重滞后（2026年实测返回多为2022-2023年旧文章），时效性极差，**已确认无实用价值**。
> **公众号搜索已废止（2026-07-08 起默认不执行）**：搜狗4条必搜（南京体彩/福彩、江苏体彩/福彩）索引滞后至2020-2023，无实用价值，已不再纳入自动流程。
> **执行规则**：Step 3 公众号搜索**已废止，默认不执行**（搜狗索引滞后至2020-2023，返回结果几乎全为>7天旧文，空耗且易误导入）。江苏本地最新动态已由 Step 0 官网（江苏体彩/福彩网）与 Step 3.4 搜索引擎转载覆盖，无需公众号补充。如用户单独提供具体文章链接需求，按通用 `web_fetch` 处理，不纳入本步骤自动流程。

### 📌 工具说明

使用 `wechat-toolkit` Skill 的搜狗微信搜索脚本（新版，带 UA 池和重试机制）：

```bash
# 基础搜索（返回标题、摘要、时间、来源）
node C:/Users/jsfc_02/.workbuddy/skills/wechat-toolkit/scripts/search/search_wechat.js "关键词" -n 3

# 搜索 + 解析真实微信链接（可配合 web_fetch 抓全文）
node C:/Users/jsfc_02/.workbuddy/skills/wechat-toolkit/scripts/search/search_wechat.js "关键词" -n 3 -r
```

> **`{SCRIPT}`** = `C:/Users/jsfc_02/.workbuddy/skills/wechat-toolkit/scripts/search/search_wechat.js`
>
> ⚠️ **依赖**：需要 `cheerio` npm 包（已安装在 wechat-toolkit 目录下）。
> 如遇 `Cannot find module 'cheerio'` 错误，执行：
> ```bash
> cd C:/Users/jsfc_02/.workbuddy/skills/wechat-toolkit && npm install cheerio
> ```

### 搜索 3.1 — 南京本地公众号（可选，默认跳过）

```bash
# 南京体彩
node C:/Users/jsfc_02/.workbuddy/skills/wechat-toolkit/scripts/search/search_wechat.js "南京体彩" -n 3 -r
# 南京福彩
node C:/Users/jsfc_02/.workbuddy/skills/wechat-toolkit/scripts/search/search_wechat.js "南京福彩" -n 3 -r
# 江苏体彩
node C:/Users/jsfc_02/.workbuddy/skills/wechat-toolkit/scripts/search/search_wechat.js "江苏体彩" -n 3 -r
# 江苏福彩
node C:/Users/jsfc_02/.workbuddy/skills/wechat-toolkit/scripts/search/search_wechat.js "江苏福彩" -n 3 -r
```

**用途**：南京/江苏体彩/福彩微信公众号发布的本地活动、网点动态、公益宣传。

> ⚠️ **时效检查（仅手动执行时）**：若手动触发本搜索，检查返回文章发布日期，>7 天立即丢弃（说明搜狗索引未更新，无价值）；默认状态下本搜索不执行。

### ~~搜索 3.2~3.3 — 全国各省公众号搜索~~（已取消）

> ~~以下全国30省搜索已于 2026-04-07 取消。~~
> 原因：搜狗微信搜索索引严重滞后，60 条搜索无法获取时效性内容，性价比极低。
> 替代方案：通过 Step 1 的 web_search 搜索引擎和 Step 0 的全国官网栏目（0.7~0.10）覆盖全国信息。

### 搜索 3.4 — 搜索引擎补充

当公众号搜索结果不足或搜狗索引滞后时，用 web_search 补充（**实际效果优于搜狗**）：

```web_search
query: 体彩 福彩 活动 渠道 网点 公益 {TODAY月份日期}
示例: 体彩 福彩 活动 渠道 网点 公益 4月8日
language: zh-CN | max_results: 10
```

> 搜索引擎可抓取到转载自公众号的新闻报道，时效性远优于搜狗微信搜索。
> **搜索结果**：仅提取时间窗口内的活动/渠道信息，排除开奖/中奖新闻。

### 搜索 3.5 — 微信文章全文抓取

> ⚠️ 本节仅在**手动触发 Step 3**（用户明确要求补抓某公众号）时适用；自动流程已跳过本步骤。对于其中 `-r` 解析成功且**发布时间在7天内**的文章，使用 `web_fetch` 抓取全文：

- **活动类文章**：重点提取活动名称、时间、地点、参与方式、公益属性
- **渠道类文章**：重点提取网点位置、创新点、效果数据、官方解读
- **每篇文章必须标注**：来源公众号名称、发布日期、原文链接

### Step 3 执行要点

| 要点 | 说明 |
|------|------|
| **默认跳过（2026-07-08 起）** | Step 3 公众号搜索已废止，默认不执行（搜狗索引滞后至2020-2023无价值）；江苏本地最新动态由 Step 0 官网 + Step 3.4 搜索引擎覆盖，无需公众号补充 |
| **取消强制必搜** | 原"南京/江苏 4 条必搜每次必须执行"已废止，改为按需可选；全国 30 省 60 条搜索更早前已取消 |
| **失败处理** | 如搜狗脚本被反爬拦截，跳过，直接降级为 3.4 搜索引擎方案 |

---

## Step 4：深度抓取（web_fetch）

**🎯 目的**：对 Step 1-3 搜索结果中高价值链接进行全文抓取，获取详细信息。

### 抓取优先级

| 优先级 | 抓取目标 | 说明 |
|--------|---------|------|
| 1 | 财政部/民政部/国家体育总局官网政策文件 | 权威性最高 |
| 2 | 中福彩具体公告页（`cwl.gov.cn/c/...`） | 开奖数据最全 |
| 3 | 江苏体彩网/江苏福彩网活动详情页 | 本地信息最相关 |
| 4 | 南京本地媒体报道（搜狐/腾讯新闻/新浪转载） | 补充本地视角 |
| 5 | 中国江苏网体彩频道（lottery.jschina.com.cn） | 官方合作媒体 |

### 抓取规则

- 每个 `web_fetch` 请求需明确指定 `fetchInfo`（要提取的具体信息）
- 优先抓取开奖公告页面，确保号码和奖池数据准确
- 活动类页面重点抓取：时间、地点、内容、参与方式
- 政策类页面重点抓取：文号、发布时间、核心内容、影响分析

### ⭐ 本省/南京强制深抓规则（2026-07-21 落地，呼应 07-14 复盘"采集阶段防漏"精神）
- **适用范围**：江苏省（含 13 地市）+ 南京市发布的全部条目。
- **强制入队**：本省/南京条目不论来自哪个栏目、列表页是否带详情页 URL，均**强制进入 Step 4 深抓队列**，区别于其他省"有链接才深抓"的默认逻辑。
- **采集兜底（防漏栏）**：Step 0/2.5 采集本省时，须同时覆盖江苏福彩「地市动态」「公益活动」「营销活动」三栏目与江苏体彩网对应栏目，三栏目 URL **并集**全部落入 `_urls_YYYYMMDD.txt`。反面案例：07-21 连云港东海"清凉一夏"仅在"公益活动"栏目，采集只抓"地市动态"致漏抓、降级简讯。
- **降级条件**：仅当官方确实仅发短讯、且主动 web 下钻（江苏福彩/江苏体彩官网 + 搜索引擎转载）仍无法获得详情时，方可标"官方仅发短讯"入简讯。
- **南京空窗核查**：南京当天若无条目，须先核查江苏福彩网南京最新发布日期是否超出窗口，确认"真无发布"而非抓取失败，方可在简报标注"本期南京无官方更新"。

---

## Step 5：交叉验证

**🎯 目的**：确保所有采集到的信息来源可靠，对照信源白名单排除不合规来源。

### 验证步骤

1. 将所有采集到的信息来源与 `source-whitelist.md` 对照
2. 白名单内的来源 → 标记"已验证"，直接采用
3. 非白名单但为主流媒体转载 → 追溯原始来源，确认为官方发布后采用，标注原始来源
4. 无法确认来源的内容 → 排除

### 判断规则

| 来源类型 | 处理方式 |
|---------|---------|
| 官方网站 / 官方公众号 | ✅ 直接采用 |
| 主流媒体转载官方内容 | ✅ 追溯原始来源，确认后采用 |
| 行业媒体（信息时报等）报道 | ⚠️ 需有具体信息来源方可采用 |
| 自媒体 / 营销号 / 不明来源 | ❌ 排除 |

---

## Step 6：补充搜索（按需触发，0-4 次）

**仅在以下情况执行**，根据缺失内容定向补充：

| 缺失内容 | 补充搜索关键词 |
|---------|--------------|
| 政策动态为空 | `"财政部 彩票 公告 {月份}"` 或 `"体育总局 彩票 {月份}"` |
| 各地活动为空 | `"体彩 活动 {TODAY日期}"` 或 `"福彩 公益 {TODAY日期}"` |
| 渠道拓展为空 | `"彩票 渠道 创新 {月份}"` 或 `"福彩 体彩 网点 招募"` |
| 重大中奖为空 | `"体彩 中奖 一等奖 {TODAY日期}"` 或 `"福彩 中奖 大奖"` |

---

## 📊 搜索效率规范

| 规范 | 说明 |
|------|------|
| **基础请求量** | Step 0（11抓取：第1批8并行+第2批2串行）+ Step 1（3搜索）+ Step 2（5抓取：福彩1串行+体彩4并行）+ **Step 2.5（44 web_fetch 分6批（含中彩网）+ 1 API + 9 Playwright串行 =约54次）** + Step 3 公众号（默认跳过，0次）+ Step 3.4 搜索引擎（1条）= **约74-84 次/天** |
| **补充请求量** | Step 6 按需 0-4 次 |
| **并行执行** | Step 0 第1批（8次）/Step 1/Step 2 体彩4页/Step 2.5 分6批每批≤8次并行；Step 0 第2批（cwl.gov.cn 2次串行）/Step 2 福彩开奖页串行/Step 2.5 Playwright批串行 |
| **Step 2.5 分批策略** | 6批 web_fetch（每批≤8个并行，批间显式 `sleep 9`）+ 1批 API（浙江体彩，1个串行）+ 1批 Playwright（9个串行：5福彩+4体彩，逐条间隔 `sleep 9`，严禁并行）= 总计约54次请求 |
| **cwl.gov.cn 串行** | Step 0 第2批（0.9→间隔5-10秒→0.10）+ Step 1 缓冲 + Step 2 福彩开奖页（串行，延后执行）+ Step 2.2 详情页（按需，间隔5-10秒） |
| **避免重复** | Step 2.5 已覆盖的省份不在 Step 3.4 重复搜索 |
| **语言设置** | 所有搜索必须设置 `language: zh-CN` |
| **全国覆盖** | 每天全覆盖30省，当天发布的活动/渠道信息当天抓取 |

---

*最后更新：2026-07-06（v2.1.0：Step 2.5批次间隔8-10秒，增加执行完整性要求，失败重试间隔统一为8-10秒，禁止提前截断；v2.1.1：陕西体彩→/tcxw/list/page.html，河南福彩→/#/article/channel/list/1-9，云南福彩→/list/xwzx-2008880236425531393，A类5省体彩标注疑似/确认失效；v2.1.2：山东体彩URL修正为 http://www.sdticai.com/wzgb/xinwen/（http-only静态，https超时），从web_fetch第1批移至Playwright批（实测抓取30条），fetch_news.js修复静态站.html链接匹配与sd_date日期提取；v2.1.3：浙江体彩改用体彩统一API抓取——新增通用脚本 fetch_tycai_api.js（参数化Tenant-Id，浙江 330000ZJ-FFACD3FA / 栏目111），从web_fetch第1批移除并新增API批；同平台省份可复用本脚本；v2.1.4：广西/贵州/青海体彩URL修正并配入Playwright批——广西 http://www.lottery.gx.cn/ggtz/index.html（静态http-only，实测30条）、贵州 https://www.gzstycp.com/information/notice/index.html（Vue SPA需domcontentloaded 9000，实测16条）、青海 https://www.qhtycp.com/lst60?word=&page=1（老ASP表格站，实测36条）；fetch_news.js 增强：waitUntil参数化、链接正则扩至 /view\d+/.shtml/.asp、表格行兄弟td日期提取、标题清洗、img src日期提取、相对URL补全；Playwright批 6→9个，基础请求量约58次/天；v2.1.5：清理web_fetch批次中广西/贵州/青海体彩3条旧失效URL（已移入Playwright批），web_fetch计数47→43、Step 2.5总量58→53次/天；批次间隔改为显式 sleep 9；Playwright批明确9个严禁并行、逐条sleep 9；fetch_tycai_api.js 的 source 改为入参（默认浙江体彩网）并加15s超时；修正fetch_news.js注释[wait_selector]→[wait_until]）；v2.1.6（2026-07-06）青海福彩修复：用户确认新闻中心聚合页 TypeId=0（https://www.qhflcp.cn/news/NewsList.aspx?TypeId=0）web_fetch实测可抓取，从fetch failed待核实移入Step 2.5第5批web_fetch（西北），web_fetch 43→44、Step 2.5 53→54、基础请求量约77-87→约78-88次/天；福彩web_fetch直抓21→22、fetch failed 1→0；移除不可用清单与待核实URL中的青海福彩）；v2.1.8（2026-07-07）根因修复：新增"Step 2.5 强制纪律"（每批前复读最新URL禁止凭记忆 + 收尾校验升级为硬拦截门禁）；fetch_news.js 增加 gotoTimeout 参数（河南福彩http连接超时用60000）；新增 scripts/ima_distribute.js 稳定分发脚本（绕过ima_api.cjs版本检查、钉死content_format=1、重试3次））*
