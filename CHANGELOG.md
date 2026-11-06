# Changelog

## v1.0.0 — 2026-11-06

首个版本，包含两个插件与配套文档。

### dsh-cost-meter 1.0.0

- 输入框右上方常驻胶囊：token 速度 + 会话累计花费，点击展开明细面板。
- 面板包含本轮/会话的未缓存输入、缓存读取、缓存写入、输出、命中率、速度、首字延迟、
  本轮花费、会话累计、实时单价（高峰/空闲）、下一次切换时间与账户余额。
- 官方价目表（`deepseek-flash` / `deepseek-v4-pro`，元/百万 token，空闲价 = 高峰价一半），
  高峰时段按北京时间工作日 9:00–12:00、14:00–18:00 判断。
- 余额来自 `ctx.remote.account.getBalance`，失败降级为可重试提示。
- 本轮花费按每个 step 完成时刻计价，会话累计为当前时段估算（带 `≈`）。

### dsh-usage-stats 1.0.0

- 侧边栏「用量」入口与独立统计面板：汇总卡、每日柱状图、按 `provider/model` 明细表。
- Host 侧账本：启动回填历史会话 + `session/event` 实时追加 + 2s 去抖原子落盘。
- 正确处理 fork 继承（`seq >= inheritedEventCount` 才计数）、重试与压缩摘要。
- 只读接口 `GET /usage-stats/summary`，重建接口 `POST /usage-stats/rebuild`（GET 兜底）。
- 默认按 `Asia/Shanghai` 切日，可配置时区与回填开关。

### 文档与工具

- `README.md`：安装、目录结构、配置、更新/卸载、兼容性。
- `docs/`：两份设计稿、界面示意、换电脑迁移说明。
- `docs/换电脑使用说明.md`：目录安装、历史账本迁移、跨电脑同步方案。
