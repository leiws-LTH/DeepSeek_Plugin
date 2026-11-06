# @local/dsh-usage-stats

按天、按模型统计本机所有会话的 token 用量，并在侧边栏提供一个独立面板。
官方账号模型、API key 路由、pi-ai 接入的其他 provider 一视同仁——只要请求经过本机 Harness，就会记账。

> 适配 DeepSeek Harness `0.2.2-rc.1`。安装方式见仓库根目录的 [README](../README.md)；
> 设计取舍见 [设计稿](../docs/设计-用量统计面板.md)。

## 面板

侧边栏「插件 / 自动化任务」下面新增「用量」，点开是：

- 今日 / 近 7 天 / 近 30 天 / 累计 四张汇总卡（输入、缓存、输出）
- 每日柱状图（输入含缓存命中，与输出分色）
- 按 `provider / model` 归并的明细表（请求数、输入、缓存、输出、合计、占比）
- 范围切换（7 / 30 / 90 天 / 全部）、刷新、重建统计

## 接口

面板通过 Host 的本机只读接口取数（按页面同源相对路径访问）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/usage-stats/summary?days=30` | 汇总卡、每日序列、按模型明细；`days=0` 为全部 |
| POST | `/usage-stats/rebuild` | 全量重扫会话日志并替换账本（GET 兜底） |

响应只包含数字与 `provider/model`，不含会话标题、消息内容或任何凭据。

## 数据与存储

- 来源：会话日志里的 `assistant/message`（`data.usage`）与 `request/header`（`provider/model`）
- 账本：`%DSH_HOME%\storages\usage-stats\ledger.json`（只存聚合数，不存消息内容）
- 启动时回填历史会话；运行中按 `session/event` 实时追加；2s 去抖原子落盘
- fork 会话只统计 `seq >= inheritedEventCount` 的己有事件，避免把父会话用量重复计一遍
- 日期按配置时区切日（默认 `Asia/Shanghai`）

## 配置（cordis.patch.yml 的 config）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `timeZone` | `Asia/Shanghai` | 切日时区（IANA 名称） |
| `backfill` | `true` | 启动时回填历史会话 |
| `flushDelayMs` | `2000` | 落盘去抖 |
| `concurrency` | `2` | 回填并发会话数 |

改时区后旧账本仍按旧时区切日，面板会提示「需要重建」，点「重建统计」即可按新时区重算。

## 边界

- 只统计经过本机 Harness 的调用；在别的客户端直接调 API 不会出现在这里。
- 删除会话不会删除已记账的历史；重建时以现存日志为准。
- 没有落成 `assistant/message` 的失败尝试没有 usage 可读，统计不到。
- 账本是本机缓存，可随时重建；会话日志才是事实来源。

## 卸载

在「设置 → 插件」移除，或在 Harness 中 `remove_bundle`。本地目录安装是软链，先移除再删目录。
