# 省级体彩/福彩官网 URL 库

> 本文件记录全国省级行政区的体彩和福彩官网地址，用于每天全覆盖抓取各省活动/渠道信息。
>
> 数据来源：
> - 体彩：湖北体彩网底部友情链接（https://www.hbtycp.com/）— 2026年4月8日验证
> - 福彩：四川福彩网底部友情链接（https://www.scflcp.com.cn/）+ **用户提供准确URL** — 2026年4月9日验证
> - 补充验证：搜索引擎+web_fetch 实测可访问

---

## 📌 使用说明

### 抓取策略

- **每天全覆盖30省+深圳**（江苏除外，已在 Step 0 固定覆盖）
- 每个省份抓取 **体彩新闻/动态栏目** + **福彩新闻/动态栏目**
- 每个 URL 的 `fetchInfo` 应关注：活动、渠道创新、网点特色、公益宣传
- 约 30省 × 2（体彩+福彩）= **约44次 web_fetch 分6批并行**（每批≤8个，批间显式 `sleep 9`）
- 另有 **5省SPA福彩 + 4省体彩（山东/广西/贵州/青海）用Playwright串行抓取**（安徽/河南/重庆/云南/上海 + 山东/广西/贵州/青海），不计入并行次数
- 另有 **1省体彩用API串行抓取**（浙江体彩，体彩统一后端 websiteapi.sporttery.cn，脚本 fetch_tycai_api.js），不计入并行次数
- **南京/江苏已在 Step 0 覆盖，不在此重复**

> ⚠️ 部分网站为 SPA 架构（纯 JS 渲染），web_fetch 无法抓取内容，需通过 Playwright 脚本（`scripts/fetch_news.js`）抓取，具体见下方"不可用信源清单"。

---

## 🔵 华东地区

### 浙江省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 浙江体彩网 | API（体彩统一后端 websiteapi.sporttery.cn） | ✅ **改用 API 抓取**（fetch_tycai_api.js 330000ZJ-FFACD3FA 111，2026-07-06 实测有效，返回当天数据）；zjlottery.com 失效、zjtycp.cn/xxgk 非新闻源，唯一公开源即此 API |
| 福彩 | 浙江福彩网 | https://www.zjflcp.com/ | https://www.zjflcp.com/ch120/csdt/ （彩市动态）|

### 上海市
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 上海体彩网 | https://www.shsportslottery.com/ | 首页新闻列表 |
| 福彩 | 上海福彩网 | https://www.swlc.net.cn/ | https://www.swlc.net.cn/shsflcpfxzx/bszx/bszx.html （本市资讯，需JS加载更多）|

### 山东省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 山东体彩网 | http://www.sdticai.com/ | ✅ http://www.sdticai.com/wzgb/xinwen/ （新闻栏目，2026-07-06 实测：http协议可访问/https超时，Playwright抓取成功30条，静态HTML）；⚠️ 仅http，web_fetch不可用，须用Playwright |
| 福彩 | 山东福彩网 | https://www.sdcp.cn/ | https://www.sdcp.cn/article_list/fcxw （福彩新闻，⚠️数据JS渲染可能加载不完整）|

### 安徽省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 安徽体彩网 | https://www.ahtycp.com/ | 首页新闻列表 |
| 福彩 | 安徽福彩网 | https://www.ahflcp.com.cn/ | ✅ Vue SPA（#/index），需Playwright抓取，fetch_news.js已适配（27条新闻+开奖） |

### 福建省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 福建体彩网 | https://www.fjtc.com.cn/ | 首页新闻列表 |
| 福彩 | 福建福彩网 | https://www.fjcp.cn/ | https://www.fjcp.cn/fucaizixun/xinwenzixun/ （新闻资讯）|

### 江西省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 江西体彩网 | https://www.jxlottery.cn/ | 首页新闻列表 |
| 福彩 | 江西福彩网 | https://www.jxfczx.cn/ | https://www.jxfczx.cn/news/NewsList.aspx?TypeId=62 （公示公告）；备选：TypeId=31 |

---

## 🟢 华南地区

### 广东省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 广东体彩网 | https://www.gdlottery.cn/ | 首页新闻列表 |
| 福彩 | 广东福彩网 | https://www.gdfc.org.cn/ | https://www.gdfc.org.cn/news_list_13.html （彩票资讯）；备选：news_list_91.html （公告要闻）|

### 广西壮族自治区
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 广西体彩网 | http://www.lottery.gx.cn/ggtz/index.html | 公告通知栏目，静态HTML，**仅http（https超时）**，web_fetch无法抓取 → ✅ Playwright抓取（2026-07-06 实测30条）|
| 福彩 | 广西福彩网 | https://www.gxcaipiao.com.cn/ | https://www.gxcaipiao.com.cn/newslist-i/10_0_1.html （彩票新闻）|

### 海南省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 海南体彩网 | https://www.hainantc.com.cn/ | 首页新闻列表 |
| 福彩 | 海南福彩网 | https://www.hainancp.com/ | https://www.hainancp.com/list/12/ （福彩新闻）|

### 深圳市（计划单列市）
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 深圳体彩 | 待补充 | — |
| 福彩 | 深圳福彩 | https://www.szlottery.org/ | https://www.szlottery.org/fcw/fcxw/szfc/index.html （新闻资讯）|

---

## 🟠 华北地区

### 北京市
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 北京体彩网 | https://www.bjlot.com.cn/ | 首页新闻列表 |
| 福彩 | 北京福彩网 | 待补充 | — |

### 天津市
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 天津体彩网 | https://www.tjtc.org.cn/ | 首页新闻列表 |
| 福彩 | 天津福彩网 | https://www.tjflcpw.com/ | https://www.tjflcpw.com/news/NewsListLower.aspx?TypeId=1 （福彩新闻）|

### 河北省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 河北体彩网 | https://www.hbtcw.com/ | 首页新闻列表 |
| 福彩 | 河北福彩网 | https://www.yzfcw.com/ | https://www.yzfcw.com/lotteryNews/newsList?classficationId=3 （福彩要闻）|

### 山西省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 山西体彩网 | https://www.sxlottery.net/ | 首页新闻列表 |
| 福彩 | 山西福彩网 | http://www.sx.xinhuanet.com/ | http://www.sx.xinhuanet.com/2018zt/fcyw.htm （福彩要闻）；http://www.sx.xinhuanet.com/2018zt/xyfcxxgy.htm （福彩信息公告）|

### 内蒙古自治区
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 内蒙古体彩网 | https://www.nmtc.com.cn/ | 首页新闻列表 |
| 福彩 | 内蒙古福彩网 | 待补充 | — |

---

## 🔴 华中地区

### 河南省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 河南体彩网 | https://hnlottery.com.cn/ | 首页新闻列表 |
| 福彩 | 河南福彩网 | http://www.henanfucai.com/#/article/channel/list/1-9 | ✅ Vue SPA（福彩要闻栏目），需Playwright抓取，⚠️ 仅http不支持https；✅ 2026-07-06 实测抓取成功25条 |

### 湖北省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 湖北体彩网 | https://www.hbtycp.com/ | /tczx（体彩资讯）、/dfdt（地方动态）、/zrcp（责任彩票/公益活动） |
| 福彩 | 湖北福彩网 | https://www.hbfcw.cn/ | https://www.hbfcw.cn/csyw/ （彩市要闻）|

### 湖南省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 湖南体彩网 | https://www.hnticai.com/ | 首页新闻列表 |
| 福彩 | 湖南福彩网 | https://mzt.hunan.gov.cn/mzt/fc/index.html | https://mzt.hunan.gov.cn/mzt/fc/xwzxfc/fcywfc/index.html （业务动态）|

---

## 🟣 西南地区

### 四川省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 四川体彩网 | https://www.scticai.cn/ | 首页新闻列表 |
| 福彩 | 四川福彩网 | https://www.scflcp.com.cn/ | https://www.scflcp.com.cn/tzgg （通知公告）|

### 重庆市
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 重庆体彩网 | https://www.cqtcw.net/ | 首页新闻列表 |
| 福彩 | 重庆福彩网 | https://www.cqcp.net/ | https://www.cqcp.net/navigation/fczx （福彩资讯，⚠️ Nuxt.js SPA，需Playwright抓取）；备选：/navigation/notice （通知公告）|

### 贵州省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 贵州体彩网 | https://www.gzstycp.com/information/notice/index.html | 通知公告栏目，Vue SPA，**需Playwright（domcontentloaded+9秒）**，✅ 2026-07-06 实测16条（日期在img src）|
| 福彩 | 贵州福彩网 | https://www.gzfucai.cn/ | https://www.gzfucai.cn/xinwenzhongxin/fucairedian/ （福彩热点）|

### 云南省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 云南体彩网 | https://www.yntc8.cn/ | 首页新闻列表 |
| 福彩 | 云南福彩网 | https://www.ynflcp.cn/ | https://www.ynflcp.cn/list/xwzx-2008880236425531393 （福彩资讯栏目）；⚠️ web_fetch不兼容，需Playwright抓取；✅ 2026-07-06 实测抓取成功10条 |

### 西藏自治区
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 西藏体彩网 | 待补充 | — |
| 福彩 | 西藏福彩网 | 待补充 | — |

---

## 🔵 西北地区

### 陕西省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 陕西体彩网 | https://www.sxtc.com.cn/ | /tcxw/list/page.html（体彩新闻列表）；✅ 2026-07-06 实测 web_fetch 抓取成功 |
| 福彩 | 陕西福彩网 | https://www.sxlotto.com.cn/ | https://www.sxlotto.com.cn/xw/snxw/ （省内新闻）；https://www.sxlotto.com.cn/xw/yxhd/ （营销活动）|

### 甘肃省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 甘肃体彩网 | https://www.gstc.org.cn/ | 首页新闻列表 |
| 福彩 | 甘肃福彩网 | https://www.gsflcp.com/ | https://www.gsflcp.com/xw/snxw/ （省内新闻）|

### 青海省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 青海体彩网 | https://www.qhtycp.com/lst60?word=&page=1 | 通知公告栏目，老ASP静态表格站，✅ 2026-07-06 实测Playwright抓取36条（/view\d+ 链接，日期在兄弟td）|
| 福彩 | 青海福彩网 | https://www.qhflcp.cn/ | ✅ https://www.qhflcp.cn/news/NewsList.aspx?TypeId=0（新闻中心聚合页，含活动/渠道/公益/公告，用户2026-07-06确认，web_fetch实测可抓取）；备选：TypeId=17（营销活动）、TypeId=13（福彩新闻）、TypeId=19（通知公告）|

### 宁夏回族自治区
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 宁夏体彩网 | https://www.nxtcw.com.cn/ | 首页新闻列表 |
| 福彩 | 宁夏福彩网 | 待补充 | — |

### 新疆维吾尔自治区
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 新疆体彩网 | https://www.xjlottery.com.cn/ | 首页新闻列表 |
| 福彩 | 新疆福彩网 | https://www.xjflcp.cn/ | https://www.xjflcp.cn/root/n_139.htm （疆内彩闻）；备选：root/n_226.htm （重要公告）|

---

## 🔵 东北地区

### 辽宁省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 辽宁体彩网 | https://www.lntycp.com/ | 首页新闻列表 |
| 福彩 | 辽宁福彩网 | https://www.lnlotto.com/ | https://www.lnlotto.com/View/NewsList.aspx?TypeId=47&CityID=-1 （地市资讯）|

### 吉林省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 吉林体彩网 | https://www.jlstycp.com/ | 首页新闻列表 |
| 福彩 | 吉林福彩网 | https://www.jlfc.com.cn/ | https://www.jlfc.com.cn/View/Index.aspx （首页，含新闻资讯板块）|

### 黑龙江省
| 类型 | 名称 | 官网 | 新闻/动态栏目 |
|------|------|------|-------------|
| 体彩 | 黑龙江体彩网 | https://www.hljtycp.org.cn/ | 首页新闻列表 |
| 福彩 | 黑龙江福彩网 | https://www.lottost.cn/ | https://www.lottost.cn/xwzx/snxw/ （省内新闻）|

---

## 📊 统计

> 总计 31 个省级行政区（30 省 + 深圳计划单列市），江苏已在 Step 0 固定覆盖不计入。

| 类别 | 数量 | 明细 |
|------|------|------|
| 体彩官网（已确认有URL） | 29/31 | 缺：西藏体彩、深圳体彩 |
| 福彩官网（已确认有URL） | 27/31 | 缺：北京、内蒙古、西藏、宁夏 |
| 福彩（web_fetch可直接抓取） | 22个 | 27有URL − 5需Playwright − 0 fetch failed |
| 福彩（需Playwright抓取） | 5个 | 上海（JS加载）、安徽（Vue）、河南（Vue，仅http）、重庆（Nuxt.js）、云南（web_fetch不兼容） |
| 福彩（fetch failed） | 0个 | — |
| 待补充 | 6个 | 北京福彩、内蒙古福彩、西藏体彩、西藏福彩、宁夏福彩、深圳体彩 |

### 不可用信源清单（需Playwright或用户核实）

| 省 | 网站 | 问题 | 解决方案 |
|----|------|------|---------|
| 上海 | swlc.net.cn | 需JS加载更多，列表不完整 | ✅ Playwright可抓取 |
| 安徽 | ahflcp.com.cn | Vue SPA | ✅ Playwright可抓取（fetch_news.js已适配） |
| 河南 | henanfucai.com | Vue SPA（仅http） | ✅ Playwright可抓取（#/article/channel/list/1-9） |
| 重庆 | cqcp.net | Nuxt.js SPA | ✅ Playwright可抓取（/navigation/fczx） |
| 云南 | ynflcp.cn | web_fetch失败 | ✅ Playwright可抓取（/list/xwzx-2008880236425531393，福彩资讯栏目） |
| 山东 | sdticai.com | 仅http（https超时），web_fetch自动升级https后失败 | ✅ Playwright可抓取（http://www.sdticai.com/wzgb/xinwen/，新闻栏目，静态HTML，2026-07-06 实测30条） |
| 广西 | lottery.gx.cn | 仅http（https超时），web_fetch自动升级https后失败 | ✅ Playwright可抓取（http://www.lottery.gx.cn/ggtz/index.html，公告栏目，静态HTML，2026-07-06 实测30条） |
| 贵州 | gzstycp.com | Vue SPA，web_fetch/默认load均超时 | ✅ Playwright可抓取（https://www.gzstycp.com/information/notice/index.html，需 domcontentloaded+9秒，2026-07-06 实测16条） |
| 青海（体彩） | qhtycp.com | 老ASP表格站，链接为 /view\d+ 非标准，web_fetch正则未命中 | ✅ Playwright可抓取（https://www.qhtycp.com/lst60?word=&page=1，2026-07-06 实测36条） |
| 浙江 | zjlottery.com | 原官网失效、zjtycp.cn/xxgk 非新闻源，web_fetch/Playwright均无法抓 | ✅ API抓取（fetch_tycai_api.js，体彩统一后端，Tenant-Id 330000ZJ-FFACD3FA，2026-07-06 实测有效，返回当天数据） |

### 待核实URL

请翰桥确认以下URL是否正确，或提供替代链接：

（暂无待核实URL — 青海福彩已于2026-07-06修复，改用新闻中心聚合页 TypeId=0，web_fetch直抓）

---

## ⚠️ 注意事项

1. **URL 可变性**：省级官网可能因改版而更换域名，建议每季度验证一次
2. **SPA 站点**：部分官网为 SPA 架构（安徽、河南、重庆、云南、上海），web_fetch 无法抓取，已通过 Playwright 脚本（`scripts/fetch_news.js`）解决，详见下方"不可用信源清单"
3. **失败兜底**：web_fetch 失败（超时/403/JS渲染）的省份，先尝试 Playwright 脚本抓取（`scripts/fetch_news.js`），再失败则跳过不重试
4. **江苏豁免**：江苏省体彩（js-lottery.com）和福彩（jslottery.com）已在 Step 0 固定覆盖，不重复抓取
5. **深圳纳入**：深圳为计划单列市，福彩独立于广东省，已纳入华南地区
6. **多栏目省份**：山西（福彩2个新华网栏目）、湖北（体彩3个栏目）、陕西（福彩2个）、广东（福彩2个）、新疆（福彩2个）

---

*创建日期：2026-04-08*
*数据来源：湖北体彩网 + 四川福彩网友情链接 + 搜索引擎验证 + 用户提供的准确URL*
*更新记录：*
*- v1.6.0 改为每天全覆盖30省（原轮换制）*
*- v1.6.2（2026-04-09）第二轮信源审计：统计数字重算（体彩29→福彩27→web_fetch可用21）；SPA描述更新5省+Playwright；不可用清单补上海/重庆；多栏目补山西/湖北；待核实精简为仅青海*
*- v1.6.7（2026-04-09）失败兜底策略统一为"先Playwright再跳过"；版本号统一*
*- v2.0.0（2026-04-21）Step 2.5改为分6批并行（每批≤8个，批次间隔3-5秒），Playwright独立串行批*
*- v2.1.0（2026-04-23）描述更新：48次web_fetch分6批并行+5次Playwright串行；超时重试规则新增*
*- v2.1.1（2026-07-06）URL修正（用户2026-07-06提供）：陕西体彩→/tcxw/list/page.html；河南福彩→/#/article/channel/list/1-9（福彩要闻）；云南福彩→/list/xwzx-2008880236425531393（福彩资讯）；A类5省体彩（浙江/山东/广西/贵州/青海）标注疑似/确认失效（web_fetch+curl+用户本机均无法访问）*
*- v2.1.2（2026-07-06）山东体彩URL修正：http://www.sdticai.com/wzgb/xinwen/（http-only静态，https超时），从A类失效移至Playwright批（实测抓取30条）；fetch_news.js修复静态站.html链接匹配与sd_date日期提取；A类失效剩余4省：浙江（API方案存MEMORY，未改Skill）/广西/贵州/青海*
*- v2.1.3（2026-07-06）浙江体彩改用体彩统一API抓取：新增通用脚本 fetch_tycai_api.js（参数化Tenant-Id，浙江 330000ZJ-FFACD3FA / 栏目111），从A类失效移除并配入API批；同平台省份（广西/贵州/青海）可复用本脚本*
*- v2.1.4（2026-07-06）广西/贵州/青海体彩URL修正并配入Playwright批：广西 http://www.lottery.gx.cn/ggtz/index.html（静态http-only，实测30条）、贵州 https://www.gzstycp.com/information/notice/index.html（Vue SPA需domcontentloaded 9000，实测16条）、青海 https://www.qhtycp.com/lst60?word=&page=1（老ASP表格站，实测36条）；fetch_news.js 增强：waitUntil参数化、链接正则扩至 /view\d+/.shtml/.asp、表格行兄弟td日期提取、标题清洗、img src日期提取、相对URL补全；Playwright批 6→9个，基础请求量约58次/天*
*- v2.1.5（2026-07-06）审计整改：清理 web_fetch 批次中广西/贵州/青海体彩 3 条旧失效 URL（已配入 Playwright 批，避免每日重复无效请求），web_fetch 47→43、Step 2.5 总量 58→53 次/天；批次间隔改显式 sleep 9（原 8-10 秒软等待）；Playwright 批明确 9 个站点严禁并行、逐条 sleep 9；fetch_tycai_api.js 的 source 改入参（默认浙江体彩网）并加 15s 超时；fetch_news.js 注释 [wait_selector]→[wait_until]*
*- v2.1.6（2026-07-06）青海福彩修复：用户确认新闻中心聚合页 TypeId=0（https://www.qhflcp.cn/news/NewsList.aspx?TypeId=0）web_fetch实测可抓取，从fetch failed待核实移入Step 2.5第5批web_fetch（西北），web_fetch 43→44、Step 2.5 53→54、基础请求量约77-87→约78-88次/天；福彩web_fetch直抓21→22、fetch failed 1→0；移除不可用清单与待核实URL中的青海福彩*
*- v2.1.7（2026-07-06）运行风险加固：新增批次进度硬核对（每批输出计数+收尾校验）、web_fetch快速失败（单条仅重试1次立即跳过）、Playwright单站90s硬超时兜底（fetch_news.js）*
