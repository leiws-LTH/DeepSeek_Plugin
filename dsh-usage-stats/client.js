window.__ModuleLoader__.load({
  id: '@local/dsh-usage-stats',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PLUGIN_ID = '@local/dsh-usage-stats'
    const PANEL_ID = 'usage-stats'
    const ENDPOINT = '/usage-stats/summary'
    const REBUILD_ENDPOINT = '/usage-stats/rebuild'
    const RANGES = [7, 30, 90, 0]

    const TEXT = {
      zh: {
        panel: '用量',
        title: '用量统计',
        subtitle: '本机所有会话的 token 消耗，按天、按模型统计',
        today: '今日',
        last7: '近 7 天',
        last30: '近 30 天',
        all: '累计',
        range7: '7 天',
        range30: '30 天',
        range90: '90 天',
        rangeAll: '全部',
        daily: '每日消耗',
        dailyHint: '输入（含缓存命中）与输出分色，单位 token',
        input: '输入',
        output: '输出',
        byModel: '按模型',
        byModelHint: '所有 provider 一视同仁，按 provider / model 归并',
        colModel: '模型',
        colRequests: '请求',
        colInput: '输入',
        colCache: '缓存',
        colOutput: '输出',
        colTotal: '合计',
        colShare: '占比',
        empty: '还没有用量记录。发一条消息后，这里会开始按天累计。',
        loading: '正在读取统计…',
        scanning: '正在统计历史会话 {done}/{total}…',
        errorTitle: '统计服务不可用',
        errorHint: '面板通过本机 HTTP 读取账本；检查插件是否已启用，或点重试。',
        originHint: '当前页面不是 HTTP 来源，无法读取本机统计接口。',
        retry: '重试',
        rebuild: '重建统计',
        rebuilding: '正在重建…',
        updated: '更新于 {time}',
        footer: '数据来自本机会话日志 · 按 {zone} 切日 · 仅统计经过本机 Harness 的调用',
        chartCap: '图表最多显示最近 90 天',
        requests: '{count} 次',
        cacheNote: '缓存读取 + 写入',
        refresh: '刷新',
      },
      en: {
        panel: 'Usage',
        title: 'Usage statistics',
        subtitle: 'Token usage of every local session, by day and by model',
        today: 'Today',
        last7: 'Last 7 days',
        last30: 'Last 30 days',
        all: 'All time',
        range7: '7d',
        range30: '30d',
        range90: '90d',
        rangeAll: 'All',
        daily: 'Daily usage',
        dailyHint: 'Input (cache included) and output, in tokens',
        input: 'Input',
        output: 'Output',
        byModel: 'By model',
        byModelHint: 'Every provider is treated the same, merged by provider / model',
        colModel: 'Model',
        colRequests: 'Requests',
        colInput: 'Input',
        colCache: 'Cache',
        colOutput: 'Output',
        colTotal: 'Total',
        colShare: 'Share',
        empty: 'No usage yet. Send a message and the ledger starts counting by day.',
        loading: 'Reading statistics…',
        scanning: 'Scanning history {done}/{total}…',
        errorTitle: 'Statistics service unavailable',
        errorHint: 'The panel reads the ledger over local HTTP. Check the plugin is enabled, then retry.',
        originHint: 'This page is not served over HTTP, so the local statistics endpoint cannot be read.',
        retry: 'Retry',
        rebuild: 'Rebuild',
        rebuilding: 'Rebuilding…',
        updated: 'Updated {time}',
        footer: 'From local session logs · days split by {zone} · only calls made through this Harness count',
        chartCap: 'Chart shows the latest 90 days',
        requests: '{count} requests',
        cacheNote: 'cache read + write',
        refresh: 'Refresh',
      },
    }

    const CSS = `
.dshus_page{box-sizing:border-box;height:100%;overflow:auto;padding:24px 28px 40px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
.dshus_shell{display:flex;flex-direction:column;gap:16px;max-width:1080px;margin:0 auto;min-width:0}
.dshus_head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dshus_titles{display:flex;flex-direction:column;gap:4px;min-width:0}
.dshus_title{margin:0;color:var(--dsw-alias-label-primary);font-size:20px;line-height:28px;font-weight:500}
.dshus_subtitle{color:var(--dsw-alias-label-secondary);opacity:.72;font-size:12px;line-height:18px}
.dshus_controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshus_segment{display:inline-flex;padding:2px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1)}
.dshus_seg{border:none;background:0 0;padding:5px 10px;border-radius:7px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:16px;cursor:pointer;white-space:nowrap}
.dshus_seg[aria-pressed="true"]{background:rgba(128,128,128,.16);color:var(--dsw-alias-label-primary)}
.dshus_seg:hover{color:var(--dsw-alias-label-primary)}
.dshus_button{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l1);background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dshus_button:hover{background:rgba(128,128,128,.12);color:var(--dsw-alias-label-primary)}
.dshus_button:disabled{opacity:.5;cursor:default}
.dshus_cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:900px){.dshus_cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.dshus_cards{grid-template-columns:minmax(0,1fr)}}
.dshus_card{box-sizing:border-box;padding:14px 16px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);min-width:0}
.dshus_cardLabel{color:var(--dsw-alias-label-secondary);opacity:.72;font-size:12px;line-height:18px}
.dshus_cardValue{margin-top:2px;color:var(--dsw-alias-label-primary);font-size:28px;line-height:36px;font-variant-numeric:tabular-nums}
.dshus_cardSub{margin-top:4px;color:var(--dsw-alias-label-secondary);opacity:.62;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}
.dshus_panel{box-sizing:border-box;padding:16px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);min-width:0}
.dshus_panelHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dshus_panelTitle{color:var(--dsw-alias-label-primary);font-size:15px;line-height:22px;font-weight:500}
.dshus_panelHint{color:var(--dsw-alias-label-secondary);opacity:.62;font-size:11px;line-height:16px}
.dshus_legend{display:flex;align-items:center;gap:12px;color:var(--dsw-alias-label-secondary);opacity:.78;font-size:11px}
.dshus_dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;vertical-align:middle}
.dshus_chart{margin-top:14px}
.dshus_bars{display:flex;align-items:flex-end;gap:3px;height:180px;padding-top:6px}
.dshus_bar{position:relative;display:flex;flex:1 1 0;flex-direction:column;justify-content:flex-end;height:100%;min-width:1px;border-radius:2px 2px 0 0;overflow:hidden}
.dshus_barIn{background:#5b8def;flex:none;min-height:0}
.dshus_barOut{background:#49c39b;flex:none;min-height:0}
.dshus_bar:hover{filter:brightness(1.12)}
.dshus_axis{display:flex;gap:3px;margin-top:6px;color:var(--dsw-alias-label-secondary);opacity:.62;font-size:10px;line-height:14px}
.dshus_axisCell{flex:1 1 0;min-width:0;text-align:center;white-space:nowrap;overflow:hidden}
.dshus_table{margin-top:12px;width:100%;border-collapse:collapse;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
.dshus_table th{color:var(--dsw-alias-label-secondary);opacity:.62;font-weight:400;text-align:right;padding:0 0 8px;white-space:nowrap}
.dshus_table th:first-child{text-align:left}
.dshus_table td{padding:7px 0;border-top:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);text-align:right;white-space:nowrap}
.dshus_table td:first-child{text-align:left;max-width:340px;overflow:hidden;text-overflow:ellipsis}
.dshus_model{display:inline-flex;align-items:baseline;gap:6px;max-width:100%;min-width:0}
.dshus_provider{color:var(--dsw-alias-label-secondary);opacity:.62;font-size:11px;overflow:hidden;text-overflow:ellipsis}
.dshus_modelName{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis}
.dshus_shareCell{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.dshus_shareTrack{width:56px;height:4px;border-radius:2px;background:rgba(128,128,128,.18);overflow:hidden;flex:none}
.dshus_shareFill{height:100%;background:var(--dsw-alias-brand-primary,#5b8def)}
.dshus_state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:64px 16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dshus_stateTitle{color:var(--dsw-alias-label-primary);font-size:15px}
.dshus_stateHint{color:var(--dsw-alias-label-secondary);opacity:.72;font-size:12px;max-width:420px}
.dshus_scan{display:flex;align-items:center;gap:10px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dshus_scanTrack{position:relative;flex:1;height:3px;border-radius:2px;background:rgba(128,128,128,.18);overflow:hidden;max-width:220px}
.dshus_scanFill{height:100%;background:#5b8def;transition:width .3s ease}
.dshus_footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);opacity:.62;font-size:11px;line-height:16px}
.dshus_link{border:none;background:0 0;padding:0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.dshus_link:hover{color:var(--dsw-alias-label-primary)}
.dshus_error{color:var(--dsw-alias-state-error-primary)}
`


    const TOKEN_FORMAT = new Intl.NumberFormat('en-US')
    const TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

    function formatExact(value) {
      return TOKEN_FORMAT.format(Math.max(0, Math.round(value)))
    }

    function formatCompact(value) {
      if (!Number.isFinite(value) || value <= 0) return '0'
      if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B'
      if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M'
      if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K'
      return String(Math.round(value))
    }

    function totalOf(buckets) {
      return buckets.in + buckets.cr + buckets.cw + buckets.out
    }

    function useLocaleId(ctx) {
      const subscribe = React.useCallback((notify) => ctx.locale.subscribe(notify), [ctx])
      const snapshot = React.useCallback(() => ctx.locale.getSnapshot().active, [ctx])
      return React.useSyncExternalStore(subscribe, snapshot, snapshot)
    }

    function messagesFor(localeId) {
      return String(localeId || '').toLowerCase().startsWith('zh') ? TEXT.zh : TEXT.en
    }

    function Icon({ size, active }) {
      const edge = typeof size === 'number' && size > 0 ? size : 16
      return h('svg', {
        viewBox: '0 0 16 16',
        width: edge,
        height: edge,
        'aria-hidden': true,
        fill: 'none',
      },
        h('rect', { x: 2.2, y: 9, width: 2.8, height: 4.4, rx: 1, fill: 'currentColor', opacity: active ? 1 : 0.85 }),
        h('rect', { x: 6.6, y: 6, width: 2.8, height: 7.4, rx: 1, fill: 'currentColor', opacity: active ? 1 : 0.85 }),
        h('rect', { x: 11, y: 3, width: 2.8, height: 10.4, rx: 1, fill: 'currentColor', opacity: active ? 1 : 0.85 }),
      )
    }

    function apply(ctx) {
      const style = document.createElement('style')
      style.dataset.plugin = PLUGIN_ID
      style.dataset.pluginCss = PLUGIN_ID + '/client.css'
      style.textContent = CSS
      document.head.appendChild(style)
      ctx.effect(() => () => {
        style.remove()
      }, 'usage-stats: stylesheet')

      const translate = (key, vars) => {
        const table = messagesFor(ctx.locale.getSnapshot().active)
        let text = table[key] === undefined ? key : table[key]
        if (vars !== undefined) {
          for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]))
        }
        return text
      }

      function useSummary(range) {
        const [state, setState] = React.useState({ status: 'loading', data: null, error: '' })
        const [nonce, setNonce] = React.useState(0)
        const refresh = React.useCallback(() => setNonce((value) => value + 1), [])
        React.useEffect(() => {
          const controller = new AbortController()
          setState((current) => (
            current.data === null
              ? { status: 'loading', data: null, error: '' }
              : { status: 'refreshing', data: current.data, error: '' }
          ))
          fetch(ENDPOINT + '?days=' + String(range), { signal: controller.signal, cache: 'no-store' })
            .then((response) => {
              if (!response.ok) throw new Error('HTTP ' + response.status)
              return response.json()
            })
            .then((data) => {
              if (!controller.signal.aborted) setState({ status: 'ready', data, error: '' })
            })
            .catch((error) => {
              if (controller.signal.aborted) return
              setState((current) => ({
                status: 'error',
                data: current.data,
                error: String(error && error.message ? error.message : error),
              }))
            })
          return () => controller.abort()
        }, [range, nonce])
        return [state, refresh]
      }

      function UsagePage() {
        const localeId = useLocaleId(ctx)
        const t = (key, vars) => {
          const table = messagesFor(localeId)
          let text = table[key] === undefined ? key : table[key]
          if (vars !== undefined) {
            for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]))
          }
          return text
        }
        const [range, setRange] = React.useState(30)
        const [summary, refresh] = useSummary(range)
        const [rebuilding, setRebuilding] = React.useState(false)
        const scanning = summary.data !== null && summary.data.status === 'scanning'

        React.useEffect(() => {
          const period = scanning ? 2000 : 10000
          const id = window.setInterval(() => {
            if (!document.hidden) refresh()
          }, period)
          return () => window.clearInterval(id)
        }, [scanning, refresh, range])

        const rebuild = () => {
          if (rebuilding) return
          setRebuilding(true)
          fetch(REBUILD_ENDPOINT, { method: 'POST', cache: 'no-store' })
            .catch(() => fetch(REBUILD_ENDPOINT, { cache: 'no-store' }))
            .catch(() => undefined)
            .then(() => {
              setRebuilding(false)
              refresh()
            })
        }

        const data = summary.data
        const totals = data === null ? null : data.totals
        const rangeData = data === null ? null : data.days.slice(-(range === 0 ? data.days.length : range))
        const chartDays = rangeData === null ? [] : (rangeData.length > 90 ? rangeData.slice(-90) : rangeData)
        const chartMax = chartDays.reduce((max, day) => Math.max(max, day.total), 1)
        const windowTotal = rangeData === null ? 0 : rangeData.reduce((sum, day) => sum + day.total, 0)
        const models = data === null ? [] : data.models
        const modelTotal = models.reduce((sum, model) => sum + model.total, 0)
        const axisStep = chartDays.length <= 10 ? 1 : Math.ceil(chartDays.length / 6)

        const header = h('div', { className: 'dshus_head' },
          h('div', { className: 'dshus_titles' },
            h('h1', { className: 'dshus_title' }, t('title')),
            h('div', { className: 'dshus_subtitle' }, t('subtitle'))),
          h('div', { className: 'dshus_controls' },
            h('div', { className: 'dshus_segment', role: 'group' },
              RANGES.map((value) => h('button', {
                key: value,
                type: 'button',
                className: 'dshus_seg',
                'aria-pressed': range === value,
                onClick: () => setRange(value),
              }, t(value === 7 ? 'range7' : value === 30 ? 'range30' : value === 90 ? 'range90' : 'rangeAll')))),
            h('button', {
              type: 'button',
              className: 'dshus_button',
              onClick: () => refresh(),
              disabled: summary.status === 'loading',
            }, t('refresh'))))

        let body
        if (summary.status === 'error' && data === null) {
          body = h('div', { className: 'dshus_state' },
            h('div', { className: 'dshus_stateTitle dshus_error' }, t('errorTitle')),
            h('div', { className: 'dshus_stateHint' }, summary.error === 'origin' ? t('originHint') : t('errorHint')),
            h('button', { type: 'button', className: 'dshus_button', onClick: () => refresh() }, t('retry')))
        } else if (data === null) {
          body = h('div', { className: 'dshus_state' }, t('loading'))
        } else {
          const cards = [
            ['today', t('today'), totals.today],
            ['last7', t('last7'), totals.last7],
            ['last30', t('last30'), totals.last30],
            ['all', t('all'), totals.all],
          ]
          const isEmpty = totals.all.total === 0 && !scanning
          const sections = []
          sections.push(h('div', { className: 'dshus_cards', key: 'cards' },
            cards.map(([key, label, bucket]) => h('div', { className: 'dshus_card', key },
              h('div', { className: 'dshus_cardLabel' }, label),
              h('div', { className: 'dshus_cardValue' }, formatCompact(totalOf(bucket))),
              h('div', { className: 'dshus_cardSub' },
                t('input') + ' ' + formatCompact(bucket.in)
                + ' · ' + t('colCache') + ' ' + formatCompact(bucket.cr + bucket.cw)
                + ' · ' + t('output') + ' ' + formatCompact(bucket.out))))))
          if (scanning) {
            sections.push(h('div', { className: 'dshus_scan', key: 'scan' },
              h('span', null, t('scanning', { done: data.progress.done, total: data.progress.total })),
              h('div', { className: 'dshus_scanTrack' },
                h('div', { className: 'dshus_scanFill', style: { width: (data.progress.total === 0 ? 0 : Math.round((data.progress.done / data.progress.total) * 100)) + '%' } }))))
          }
          if (isEmpty) {
            sections.push(h('div', { className: 'dshus_state', key: 'empty' }, t('empty')))
          } else {
            sections.push(h('div', { className: 'dshus_panel', key: 'panel' },
              h('div', { className: 'dshus_panelHead' },
                h('div', null,
                  h('div', { className: 'dshus_panelTitle' }, t('daily')),
                  h('div', { className: 'dshus_panelHint' }, t('dailyHint'))),
                h('div', { className: 'dshus_legend' },
                  h('span', null, h('span', { className: 'dshus_dot', style: { background: '#5b8def' } }), t('input')),
                  h('span', null, h('span', { className: 'dshus_dot', style: { background: '#49c39b' } }), t('output')))),
              h('div', { className: 'dshus_chart' },
                h('div', { className: 'dshus_bars' },
                  chartDays.map((day) => {
                    const input = day.in + day.cr + day.cw
                    const title = day.date + ' · ' + t('input') + ' ' + formatExact(input)
                      + ' · ' + t('output') + ' ' + formatExact(day.out)
                      + ' · ' + t('requests', { count: formatExact(day.req) })
                    return h('div', { className: 'dshus_bar', key: day.date, title },
                      h('div', { className: 'dshus_barIn', style: { height: (input / chartMax) * 100 + '%' } }),
                      h('div', { className: 'dshus_barOut', style: { height: (day.out / chartMax) * 100 + '%' } }))
                  })),
                h('div', { className: 'dshus_axis' },
                  chartDays.map((day, index) => h('div', { className: 'dshus_axisCell', key: day.date },
                    index % axisStep === 0 ? day.date.slice(5).replace('-', '/') : ''))),
                range === 0 && data.days.length > 90
                  ? h('div', { className: 'dshus_panelHint', style: { marginTop: '6px' } }, t('chartCap'))
                  : null),
              h('table', { className: 'dshus_table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, t('colModel')),
                    h('th', null, t('colRequests')),
                    h('th', null, t('colInput')),
                    h('th', null, t('colCache')),
                    h('th', null, t('colOutput')),
                    h('th', null, t('colTotal')),
                    h('th', null, t('colShare')))),
                h('tbody', null,
                  models.length === 0
                    ? h('tr', null, h('td', { colSpan: 7, style: { textAlign: 'center', color: 'var(--dsw-alias-label-caption)' } }, '—'))
                    : models.map((model) => {
                      const slash = model.key.indexOf('/')
                      const provider = slash >= 0 ? model.key.slice(0, slash) : ''
                      const name = slash >= 0 ? model.key.slice(slash + 1) : model.key
                      const share = modelTotal === 0 ? 0 : model.total / modelTotal
                      return h('tr', { key: model.key },
                        h('td', null,
                          h('span', { className: 'dshus_model' },
                            provider === '' ? null : h('span', { className: 'dshus_provider' }, provider),
                            h('span', { className: 'dshus_modelName' }, name))),
                        h('td', null, formatExact(model.req)),
                        h('td', null, formatCompact(model.in)),
                        h('td', null, formatCompact(model.cr + model.cw)),
                        h('td', null, formatCompact(model.out)),
                        h('td', null, formatCompact(model.total)),
                        h('td', null,
                          h('span', { className: 'dshus_shareCell' },
                            h('span', { className: 'dshus_shareTrack' },
                              h('span', { className: 'dshus_shareFill', style: { width: Math.round(share * 100) + '%' } })),
                            h('span', null, Math.round(share * 100) + '%'))))
                    })))))
            sections.push(h('div', { className: 'dshus_footer', key: 'footer' },
              h('span', null, t('footer', { zone: data.timeZone })
                + (data.updatedAt > 0 ? ' · ' + t('updated', { time: TIME_FORMAT.format(new Date(data.updatedAt)) }) : '')
                + (windowTotal > 0 ? ' · ' + t('requests', { count: formatExact(rangeData.reduce((sum, day) => sum + day.req, 0)) }) : '')),
              h('span', null,
                h('button', {
                  type: 'button',
                  className: 'dshus_link',
                  onClick: rebuild,
                  disabled: rebuilding || scanning,
                }, rebuilding || scanning ? t('rebuilding') : t('rebuild')))))
          }
          body = h(React.Fragment, null, sections)
        }

        return h('div', { className: 'dshus_page' },
          h('div', { className: 'dshus_shell' }, header, body))
      }

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: () => translate('panel'),
      }, Icon))

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
      }, UsagePage))



    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
