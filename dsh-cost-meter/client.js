window.__ModuleLoader__.load({
  id: '@local/dsh-cost-meter',
  factory(require) {
    const React = require('react')
    let createPortal = null
    try {
      const reactDom = require('react-dom')
      createPortal = typeof reactDom.createPortal === 'function' ? reactDom.createPortal : null
    } catch (error) {
      createPortal = null
    }
    const h = React.createElement
    const Fragment = React.Fragment

    const PLUGIN_ID = '@local/dsh-cost-meter'
    const BUILD_VERSION = '0.2.2-rc.1'
    const BALANCE_THROTTLE_MS = 30000

    /**
     * Official DeepSeek price book, CNY per 1,000,000 tokens.
     * idle = off-peak (half of peak). Source: api-docs.deepseek.com/quick_start/pricing
     * Edit this table when prices change; unknown models show tokens only.
     */
    const PRICES = {
      'deepseek-flash': {
        hit: { idle: 0.02, peak: 0.04 },
        miss: { idle: 1, peak: 2 },
        out: { idle: 4, peak: 8 },
      },
      'deepseek-v4-pro': {
        hit: { idle: 0.15, peak: 0.3 },
        miss: { idle: 4.5, peak: 9 },
        out: { idle: 13.5, peak: 27 },
      },
    }

    /**
     * Chinese statutory holidays in Asia/Shanghai local dates (YYYY-MM-DD).
     * Peak pricing is skipped on these days. Unknown dates count as working days,
     * which can only overstate the spend, never understate it.
     */
    const HOLIDAYS = new Set([])

    const TEXT = {
      zh: {
        title: '用量与花费',
        pillSpeed: '{tps} tok/s',
        inputUncached: '未缓存输入',
        cacheRead: '缓存读取',
        cacheWrite: '缓存写入',
        output: '输出',
        cacheHit: '缓存命中率',
        speed: '速度',
        ttft: '首字',
        turnCost: '本轮花费',
        sessionCost: '会话累计',
        model: '实时单价',
        unit: '单价 / 百万',
        nextSwitch: '下一次切换',
        peak: '高峰时段',
        idle: '空闲时段',
        perMillion: '元/百万',
        balance: '剩余金额',
        balanceSub: '充值 {recharge} · 赠送 {bonus}',
        rechargeOnly: '充值 {recharge}',
        balanceFailed: '读取失败',
        retry: '重试',
        updated: '更新于 {time}',
        noPrice: '该模型未配置价目',
        footer: '按官方价目表本地估算，最终以平台账单为准',
        turnToPeak: '{time} 转入高峰',
        turnToIdle: '{time} 转入空闲',
      },
      en: {
        title: 'Usage and spend',
        pillSpeed: '{tps} tok/s',
        inputUncached: 'Uncached input',
        cacheRead: 'Cached input',
        cacheWrite: 'Cache write',
        output: 'Output',
        cacheHit: 'Cache hit',
        speed: 'Speed',
        ttft: 'First token',
        turnCost: 'This turn',
        sessionCost: 'Session total',
        model: 'Live pricing',
        unit: 'Price / 1M',
        nextSwitch: 'Next change',
        peak: 'peak',
        idle: 'idle',
        perMillion: 'CNY / 1M',
        balance: 'Balance',
        balanceSub: 'Top-up {recharge} · Bonus {bonus}',
        rechargeOnly: 'Top-up {recharge}',
        balanceFailed: 'Read failed',
        retry: 'Retry',
        updated: 'Updated {time}',
        noPrice: 'No price entry for this model',
        footer: 'Estimated locally from the official price book; the platform bill wins',
        turnToPeak: '{time} → peak',
        turnToIdle: '{time} → idle',
      },
    }

    // ---------------------------------------------------------------------
    // Tariff clock (Asia/Shanghai, weekday 09-12 / 14-18, holidays are idle)
    // ---------------------------------------------------------------------

    const WEEKDAY_PARTS = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const CLOCK = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const SWITCH_CLOCK = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    function shanghai(ms) {
      const parts = WEEKDAY_PARTS.formatToParts(new Date(ms))
      const read = (type) => {
        const found = parts.find((part) => part.type === type)
        return found === undefined ? '' : found.value
      }
      return {
        weekday: read('weekday'),
        hour: Number(read('hour')) % 24,
        minute: Number(read('minute')),
        date: DATE_PARTS.format(new Date(ms)),
      }
    }

    function isPeak(ms) {
      const now = shanghai(ms)
      if (now.weekday === 'Sat' || now.weekday === 'Sun') return false
      if (HOLIDAYS.has(now.date)) return false
      const minutes = now.hour * 60 + now.minute
      return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60)
    }

    function nextSwitch(ms) {
      const peak = isPeak(ms)
      const step = 15 * 60 * 1000
      let cursor = Math.ceil(ms / step) * step
      for (let index = 0; index < 500; index += 1) {
        cursor += step
        if (isPeak(cursor) !== peak) return cursor
      }
      return null
    }

    function formatSwitch(ms, t) {
      if (ms === null) return '—'
      const target = shanghai(ms)
      const today = shanghai(Date.now()).date
      const time = target.date === today
        ? CLOCK.format(new Date(ms))
        : SWITCH_CLOCK.format(new Date(ms)).replace(',', '')
      return isPeak(ms) ? t.turnToPeak.replace('{time}', time) : t.turnToIdle.replace('{time}', time)
    }

    // ---------------------------------------------------------------------
    // Formatting
    // ---------------------------------------------------------------------

    const TOKEN_FORMAT = new Intl.NumberFormat('en-US')

    function num(value) {
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
    }

    function formatTokens(value) {
      return TOKEN_FORMAT.format(Math.max(0, Math.round(value)))
    }

    function formatMoney(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      if (value < 1) return '¥' + value.toFixed(4)
      return '¥' + value.toFixed(2)
    }

    function formatWallet(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      if (value > 0 && value < 0.01) return '<0.01'
      return value.toFixed(2)
    }

    function currencySymbol(currency) {
      if (currency === 'CNY') return '¥'
      if (currency === 'USD') return '$'
      return String(currency) + ' '
    }

    function formatSpeed(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
      const text = value >= 100 ? String(Math.round(value)) : value.toFixed(1)
      return text.endsWith('.0') ? text.slice(0, -2) : text
    }

    function hitPercent(hit, input) {
      if (!(input > 0)) return null
      if (hit >= input) return '100'
      const percent = (hit / input) * 100
      const rounded = Math.round(percent)
      if (rounded >= 100) return '99.9'
      if (rounded >= 10) return String(rounded)
      return percent.toFixed(1)
    }

    // ---------------------------------------------------------------------
    // Pricing
    // ---------------------------------------------------------------------

    function priceAt(model, time) {
      const book = model === null ? undefined : PRICES[model]
      if (!book) return null
      const band = isPeak(time) ? 'peak' : 'idle'
      return {
        band,
        hit: book.hit[band],
        miss: book.miss[band],
        out: book.out[band],
      }
    }

    function costOf(buckets, price) {
      if (price === null) return null
      const miss = buckets.miss + buckets.write
      return (miss * price.miss + buckets.hit * price.hit + buckets.out * price.out) / 1e6
    }

    function summarizeTurn(nodes, model) {
      if (!Array.isArray(nodes) || nodes.length === 0) return null
      let turn = -1
      for (const node of nodes) {
        if (node && node.kind === 'assistant' && typeof node.turn === 'number' && node.turn > turn) turn = node.turn
      }
      if (turn < 0) return null
      const buckets = { miss: 0, hit: 0, write: 0, out: 0 }
      let cost = 0
      let priced = true
      let decodeMs = 0
      let decodeTokens = 0
      let ttftMs = 0
      let ttftCount = 0
      for (const node of nodes) {
        if (!node || node.kind !== 'assistant' || node.turn !== turn) continue
        const usage = node.usage
        const timing = node.timing
        if (!usage || typeof usage !== 'object' || !timing || typeof timing !== 'object') {
          priced = false
          continue
        }
        const own = {
          miss: num(usage.inputTokens),
          hit: num(usage.cacheReadTokens),
          write: num(usage.cacheWriteTokens),
          out: num(usage.outputTokens),
        }
        buckets.miss += own.miss
        buckets.hit += own.hit
        buckets.write += own.write
        buckets.out += own.out
        const completed = typeof timing.completedTime === 'number' ? timing.completedTime : num(node.time)
        const price = priceAt(model, completed)
        const entry = price === null ? null : costOf(own, price)
        if (entry === null) priced = false
        else cost += entry
        if (typeof timing.firstTokenTime === 'number' && typeof timing.completedTime === 'number') {
          decodeMs += Math.max(0, timing.completedTime - timing.firstTokenTime)
          decodeTokens += own.out
          if (typeof timing.stepStartTime === 'number') {
            ttftMs += Math.max(0, timing.firstTokenTime - timing.stepStartTime)
            ttftCount += 1
          }
        }
      }
      return {
        turn,
        buckets,
        cost: priced ? cost : null,
        decodeMs,
        decodeTokens,
        ttftMs: ttftCount > 0 ? ttftMs / ttftCount : null,
      }
    }

    function sumWallets(wallets) {
      const totals = new Map()
      if (!Array.isArray(wallets)) return []
      for (const wallet of wallets) {
        if (!wallet) continue
        const currency = typeof wallet.currency === 'string' && wallet.currency !== '' ? wallet.currency : 'CNY'
        const amount = Number(wallet.balance)
        if (!Number.isFinite(amount)) continue
        totals.set(currency, (totals.get(currency) || 0) + amount)
      }
      return Array.from(totals.entries())
    }

    // ---------------------------------------------------------------------
    // Hooks
    // ---------------------------------------------------------------------

    function useLocaleId(ctx) {
      const subscribe = React.useCallback((notify) => ctx.locale.subscribe(notify), [ctx])
      const snapshot = React.useCallback(() => ctx.locale.getSnapshot().active, [ctx])
      return React.useSyncExternalStore(subscribe, snapshot, snapshot)
    }

    function useClock(period) {
      const [now, setNow] = React.useState(() => Date.now())
      React.useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), period)
        return () => window.clearInterval(id)
      }, [period])
      return now
    }

    function resolveAccount(ctx) {
      try {
        if (typeof ctx.get === 'function') {
          const direct = ctx.get('remote.account')
          if (direct !== undefined && direct !== null) return direct
        }
      } catch (error) {
        // service lookup is optional; fall through to the namespace proxy
      }
      try {
        if (ctx.remote === undefined) return undefined
        return ctx.remote.account
      } catch (error) {
        return undefined
      }
    }

    function useBalance(ctx, localeId) {
      const [state, setState] = React.useState({ status: 'idle', wallets: [], bonus: [], at: 0 })
      const lastRead = React.useRef(0)
      const alive = React.useRef(true)
      React.useEffect(() => () => {
        alive.current = false
      }, [])
      const read = React.useCallback((force) => {
        const fail = () => {
          if (!alive.current) return
          setState((current) => ({ ...current, status: 'failed', at: Date.now() }))
        }
        try {
          const account = resolveAccount(ctx)
          if (account === undefined || account === null || typeof account.getBalance !== 'function') {
            setState((current) => (current.status === 'unavailable' ? current : { ...current, status: 'unavailable' }))
            return
          }
          const now = Date.now()
          if (force !== true && now - lastRead.current < BALANCE_THROTTLE_MS) return
          lastRead.current = now
          const metadata = {
            version: BUILD_VERSION,
            locale: localeId,
            timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
          }
          const pending = account.getBalance(metadata)
          Promise.resolve(pending).then((result) => {
            try {
              if (!alive.current) return
              if (!result || result.ok !== true || !result.value) {
                fail()
                return
              }
              const value = result.value
              if (value.status !== 'ready') {
                setState({ status: value.status === 'empty' ? 'empty' : 'failed', wallets: [], bonus: [], at: now })
                return
              }
              setState({
                status: 'ready',
                wallets: Array.isArray(value.value) ? value.value : [],
                bonus: Array.isArray(value.bonusWallets) ? value.bonusWallets : [],
                at: now,
              })
            } catch (error) {
              fail()
            }
          }).catch(fail)
        } catch (error) {
          fail()
        }
      }, [ctx, localeId])
      React.useEffect(() => {
        read(true)
        const id = window.setInterval(() => read(false), 60000)
        const onVisibility = () => {
          if (!document.hidden) read(false)
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          window.clearInterval(id)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [read])
      return [state, read]
    }

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------

    const CSS = `
.dshcm_row{box-sizing:border-box;display:flex;justify-content:flex-end;flex:none;width:calc(100% - var(--dsh-composer-side-clearance,0px) - var(--dsh-composer-side-clearance,0px));max-width:var(--dsh-composer-card-max-width,760px);margin:0 auto;padding:0 2px}
.dshcm_anchor{position:relative;display:inline-flex;min-width:0;max-width:100%}
.dshcm_pill{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-tertiary,#8b8b8b);font:inherit;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer}
.dshcm_pill:hover,.dshcm_pill[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#b9b9b9)}
.dshcm_pill svg{flex:none;width:14px;height:14px}
.dshcm_label{min-width:0;overflow:hidden;text-overflow:ellipsis}
.dshcm_sep{color:var(--dsw-alias-separator-primary,rgba(128,128,128,.4))}
.dshcm_panel{position:fixed;z-index:1100;box-sizing:border-box;padding:14px 16px;border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.22));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,#242424);-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(18px));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(18px));box-shadow:var(--dsw-elevation-prominent,0 10px 28px rgba(0,0,0,.35));color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:12px;line-height:18px;cursor:default;max-height:min(70vh,520px);overflow:hidden auto;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dshcm_title{display:flex;justify-content:space-between;gap:16px;margin-bottom:8px;color:var(--dsw-alias-label-primary,#eaeaea);font-weight:500}
.dshcm_titleValue{font-variant-numeric:tabular-nums}
.dshcm_titleLabel{display:inline-flex;align-items:center;gap:6px;min-width:0}
.dshcm_titleLabel svg{flex:none;width:14px;height:14px}
.dshcm_rule{grid-column:1/-1;border-top:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));margin:3px 0}
.dshcm_rows{display:grid;grid-template-columns:minmax(84px,auto) minmax(0,1fr);gap:6px 16px;margin:0;color:var(--dsw-alias-label-tertiary,#8b8b8b)}
.dshcm_rows dt,.dshcm_rows dd{min-width:0;margin:0}
.dshcm_rows dd{color:var(--dsw-alias-label-secondary,#b9b9b9);font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}
.dshcm_rows dd.dshcm_muted{color:var(--dsw-alias-label-tertiary,#8b8b8b)}
.dshcm_retry{padding:0;border:none;background:0 0;color:var(--dsw-alias-label-link,#6f8cff);font:inherit;cursor:pointer}
.dshcm_note{margin-top:10px;color:var(--dsw-alias-label-caption,#6f6f6f);font-size:11px;line-height:16px}
`

    function icon(size) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        'aria-hidden': true,
        fill: 'none',
      },
        h('path', { d: 'M2.4 12.2a6.2 6.2 0 1 1 11.2 0', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
        h('path', { d: 'M8 8.6 10.9 6.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
        h('circle', { cx: 8, cy: 8.6, r: 1.05, fill: 'currentColor' }),
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
      }, 'cost meter: stylesheet')

      function CostDock(props) {
        const localeId = useLocaleId(ctx)
        const t = TEXT[String(localeId).toLowerCase().startsWith('zh') ? 'zh' : 'en']
        const now = useClock(30000)

        const useProjection = typeof props.useProjection === 'function' ? props.useProjection : () => undefined
        const useChat = typeof props.useChat === 'function' ? props.useChat : null

        const usage = useProjection('tokenUsage')
        const stats = useProjection('sessionStats')
        const selection = useProjection('modelSelection')
        const nodes = useChat === null ? null : useChat((state) => state.legacy.nodes)

        const model = React.useMemo(() => {
          if (!selection || typeof selection !== 'object') return null
          const chosen = selection.next || selection.lastUsed
          return chosen && typeof chosen.model === 'string' && chosen.model !== '' ? chosen.model : null
        }, [selection])

        const turn = React.useMemo(() => summarizeTurn(nodes, model), [nodes, model])

        const sessionBuckets = usage && typeof usage === 'object'
          ? {
              miss: num(usage.uncachedInputTokens),
              hit: num(usage.cacheReadTokens),
              write: num(usage.cacheWriteTokens),
              out: num(usage.outputTokens),
            }
          : null
        const nowPrice = priceAt(model, now)
        const sessionCost = sessionBuckets === null || nowPrice === null ? null : costOf(sessionBuckets, nowPrice)
        const sessionSpeed = stats && typeof stats.decodeMs === 'number' && stats.decodeMs > 0 && typeof stats.decodeTokens === 'number'
          ? stats.decodeTokens / (stats.decodeMs / 1000)
          : null

        const [balance, readBalance] = useBalance(ctx, localeId)
        const steps = stats && typeof stats.steps === 'number' ? stats.steps : 0
        React.useEffect(() => {
          if (steps > 0) readBalance(false)
        }, [steps, readBalance])

        const [open, setOpen] = React.useState(false)
        const [pos, setPos] = React.useState(null)
        const rootRef = React.useRef(null)
        const panelRef = React.useRef(null)

        React.useLayoutEffect(() => {
          if (!open) {
            setPos(null)
            return undefined
          }
          const anchor = rootRef.current
          const panel = panelRef.current
          if (!anchor || !panel) return undefined
          const place = () => {
            const rect = anchor.getBoundingClientRect()
            const width = Math.min(340, Math.max(240, window.innerWidth - 24))
            panel.style.width = width + 'px'
            const size = panel.getBoundingClientRect()
            const left = Math.min(Math.max(12, rect.right - width), Math.max(12, window.innerWidth - width - 12))
            let top = rect.top - size.height - 8
            if (top < 12) top = Math.min(rect.bottom + 8, window.innerHeight - size.height - 12)
            top = Math.max(12, top)
            setPos({ left, top, width })
          }
          place()
          const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null
          if (observer !== null) observer.observe(panel)
          window.addEventListener('resize', place)
          window.addEventListener('scroll', place, true)
          return () => {
            if (observer !== null) observer.disconnect()
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
          }
        }, [open])

        React.useEffect(() => {
          if (!open) return undefined
          const onKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false)
          }
          const onPointerDown = (event) => {
            const target = event.target
            if (rootRef.current && target instanceof Node && rootRef.current.contains(target)) return
            if (panelRef.current && target instanceof Node && panelRef.current.contains(target)) return
            setOpen(false)
          }
          document.addEventListener('keydown', onKeyDown)
          document.addEventListener('pointerdown', onPointerDown, true)
          return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('pointerdown', onPointerDown, true)
          }
        }, [open])

                const speedText = formatSpeed(sessionSpeed)
        const pillSpeed = speedText === null ? '—' : t.pillSpeed.replace('{tps}', speedText)
        const pillCost = sessionCost === null ? '—' : '≈' + formatMoney(sessionCost)
        const fullReading = pillSpeed + ' · ' + pillCost

        const items = []
        const push = (label, value, muted) => items.push({ label, value, muted })
        const rule = () => items.push({ rule: true })

        if (turn !== null) {
          push(t.inputUncached, formatTokens(turn.buckets.miss))
          push(t.cacheRead, formatTokens(turn.buckets.hit))
          if (turn.buckets.write > 0) push(t.cacheWrite, formatTokens(turn.buckets.write))
          push(t.output, formatTokens(turn.buckets.out))
          const percent = hitPercent(turn.buckets.hit, turn.buckets.miss + turn.buckets.hit + turn.buckets.write)
          push(t.cacheHit, percent === null ? '—' : percent + '%')
          const turnSpeed = turn.decodeMs > 0 && turn.decodeTokens > 0 ? formatSpeed(turn.decodeTokens / (turn.decodeMs / 1000)) : null
          push(t.speed, turnSpeed === null ? '—' : turnSpeed + ' tok/s')
          push(t.ttft, turn.ttftMs === null ? '—' : (turn.ttftMs / 1000).toFixed(2) + 's')
          push(t.turnCost, turn.cost === null ? '—' : formatMoney(turn.cost))
        } else {
          push(t.turnCost, '—', true)
        }
        push(t.sessionCost, sessionCost === null ? '—' : '≈' + formatMoney(sessionCost))

        rule()
        push(t.model, (model === null ? '—' : model) + ' · ' + (nowPrice === null ? '—' : (nowPrice.band === 'peak' ? t.peak : t.idle)))
        push(t.unit, nowPrice === null
          ? t.noPrice
          : nowPrice.hit + ' / ' + nowPrice.miss + ' / ' + nowPrice.out + ' ' + t.perMillion, nowPrice === null)
        push(t.nextSwitch, formatSwitch(nextSwitch(now), t))

        const wallets = sumWallets(balance.wallets)
        const bonusWallets = sumWallets(balance.bonus)
        if (balance.status !== 'unavailable' && balance.status !== 'idle') {
          rule()
          if (balance.status === 'ready') {
            const totalText = wallets.length === 0
              ? '—'
              : wallets.map(([currency, amount]) => currencySymbol(currency) + formatWallet(amount)).join(' · ')
            push(t.balance, totalText)
            const rechargeText = wallets.map(([currency, amount]) => currencySymbol(currency) + formatWallet(amount)).join(' · ') || '—'
            const bonusText = bonusWallets.map(([currency, amount]) => currencySymbol(currency) + formatWallet(amount)).join(' · ')
            const bonusPositive = bonusWallets.some(([, amount]) => amount > 0)
            push('', bonusPositive
              ? t.balanceSub.replace('{recharge}', rechargeText).replace('{bonus}', bonusText)
              : t.rechargeOnly.replace('{recharge}', rechargeText), true)
          } else if (balance.status === 'failed') {
            items.push({ label: t.balance, node: h('button', {
              type: 'button',
              className: 'dshcm_retry',
              onClick: () => readBalance(true),
            }, t.balanceFailed + ' · ' + t.retry) })
          }
          if (balance.at > 0) push('', t.updated.replace('{time}', CLOCK.format(new Date(balance.at))), true)
        }

        const rows = items.map((item, index) => {
          if (item.rule) return h('div', { key: 'rule' + index, className: 'dshcm_rule', 'aria-hidden': true })
          if (item.node) {
            return h(Fragment, { key: 'row' + index },
              h('dt', null, item.label),
              h('dd', null, item.node))
          }
          return h(Fragment, { key: 'row' + index },
            h('dt', null, item.label),
            h('dd', { className: item.muted ? 'dshcm_muted' : undefined }, item.value))
        })

        const panelContent = h('div', {
          ref: panelRef,
          className: 'dshcm_panel',
          role: 'dialog',
          'aria-label': t.title,
          style: pos === null
            ? { visibility: 'hidden', left: '0px', top: '0px', width: Math.min(340, Math.max(240, window.innerWidth - 24)) + 'px' }
            : { left: pos.left + 'px', top: pos.top + 'px', width: pos.width + 'px' },
        },
          h('div', { className: 'dshcm_title' },
            h('span', { className: 'dshcm_titleLabel' }, icon(14), t.title),
            h('span', { className: 'dshcm_titleValue' }, (turn === null || turn.cost === null ? '—' : formatMoney(turn.cost)))),
          h('dl', { className: 'dshcm_rows' }, rows),
          h('div', { className: 'dshcm_note' }, t.footer))

        const panel = open
          ? (createPortal === null ? panelContent : createPortal(panelContent, document.body))
          : null

        return h('div', { className: 'dshcm_row' },
          h('div', { className: 'dshcm_anchor', ref: rootRef },
            h('button', {
              type: 'button',
              className: 'dshcm_pill',
              title: fullReading,
              'aria-haspopup': 'dialog',
              'aria-expanded': open,
              onClick: () => setOpen((value) => !value),
            },
              icon(14),
              h('span', { className: 'dshcm_label' }, pillSpeed),
              h('span', { className: 'dshcm_sep', 'aria-hidden': true }, '·'),
              h('span', { className: 'dshcm_label' }, pillCost)),
            panel))
      }

      class CostGuard extends React.Component {
        constructor(props) {
          super(props)
          this.state = { failed: false }
        }
        static getDerivedStateFromError() {
          return { failed: true }
        }
        componentDidCatch(error) {
          try {
            console.error('[dsh-cost-meter] composer meter failed', error)
          } catch (ignored) {
            // console may be unavailable; the fallback pill still renders
          }
        }
        render() {
          if (this.state.failed) {
            return h('div', { className: 'dshcm_row' },
              h('span', { className: 'dshcm_pill', title: 'usage cost meter unavailable' }, '用量 ⚠'))
          }
          return h(CostDock, this.props)
        }
      }

      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'cost',
        order: 30,
      }, CostGuard))
    }

    return {
      inject: ['slots', 'locale', 'remote'],
      apply,
    }
  },
})
