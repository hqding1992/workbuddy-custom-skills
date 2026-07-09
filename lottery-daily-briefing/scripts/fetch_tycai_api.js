#!/usr/bin/env node
/**
 * 体彩全国统一前端内容 API 抓取器
 * -------------------------------------------------------------
 * 适用站点：各省体彩官网使用 websiteapi.sporttery.cn 统一后端的站点
 *           （目前仅浙江体彩经核实：zjlottery.com 失效、zjtycp.cn/xxgk 非新闻源，
 *            唯一公开新闻源即此 API）
 * 用法：node fetch_tycai_api.js <Tenant-Id> <topClusterIdList> [pageSize] [sourceName]
 *   - Tenant-Id        : 省标识，如 330000ZJ-FFACD3FA（浙江）
 *   - topClusterIdList : 栏目聚类 ID，浙江新闻用 111
 *   - pageSize         : 返回条数（默认 10）
 *   - sourceName       : 来源名（默认“浙江体彩网”；复用其他省时务必传入正确省名）
 * 输出：标准 JSON 数组 [{ title, date, href, source }]
 *       href 取自 multiDimensionAttr.link（多数省份为空，留空即可）
 * ⚠️ 复用提示：仅当某省确为 websiteapi.sporttery.cn 后端时才可复用（不同 Tenant-Id + sourceName）。
 *    广西/贵州/青海体彩已用 Playwright 修复，勿套用本脚本。
 * -------------------------------------------------------------
 */
const tenantId = process.argv[2] || '330000ZJ-FFACD3FA';
const clusterId = process.argv[3] || '111';
const pageSize = process.argv[4] || '10';
const sourceName = process.argv[5] || '浙江体彩网';

const api = 'https://websiteapi.sporttery.cn/frontApi/website/content/v1.0/getInfoListByClusterV1.inf'
  + '?accessId=1'
  + '&topClusterIdList=' + encodeURIComponent(clusterId)
  + '&pageSize=' + encodeURIComponent(pageSize)
  + '&pageNo=1'
  + '&province='
  + '&Tenant-Id=' + encodeURIComponent(tenantId);

const TIMEOUT_MS = 15000;

(async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(api, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: controller.signal
    });
    if (!res.ok) {
      console.error('HTTP ' + res.status);
      process.exit(1);
    }
    const json = await res.json();
    if (json.code !== 200 || !json.success) {
      console.error('API error: ' + JSON.stringify(json).slice(0, 300));
      process.exit(1);
    }
    const records = (json.data && json.data.records) || [];
    const out = records.map(r => {
      let link = '';
      try { link = (JSON.parse(r.multiDimensionAttr || '{}').link) || ''; } catch (e) {}
      return {
        title: r.title || '',
        date: (r.putawayTime || '').slice(0, 10),
        href: link,
        source: sourceName
      };
    });
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('Fetch failed: ' + e.message);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
})();
