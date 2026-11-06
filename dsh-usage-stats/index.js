/**
 * Usage statistics host half.
 *
 * Reads the durable session log once (backfill) and then every committed event,
 * folding `assistant/message` usage into a per-day, per-route ledger. The client
 * panel reads it through one read-only HTTP route, because a hand-written plugin
 * cannot add a Remote namespace (those are fixed at build time).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const LEDGER_VERSION = 1
const DEFAULT_ZONE = 'Asia/Shanghai'
const SUMMARY_PATH = '/usage-stats/summary'
const REBUILD_PATH = '/usage-stats/rebuild'
const UNKNOWN_ROUTE = 'unknown/unknown'

export const inject = ['sessionQuery', 'webServer']

export async function apply(ctx, config) {
  const options = normalizeConfig(config)
  const zoneFormat = createZoneFormat(options.timeZone)
  const ledger = {
    version: LEDGER_VERSION,
    timeZone: options.timeZone,
    updatedAt: 0,
    days: Object.create(null),
    sessions: Object.create(null),
  }
  const state = {
    scanning: false,
    done: 0,
    total: 0,
    needsRebuild: false,
    lastError: '',
  }
  const pending = new Map()
  let scanReady = options.backfill === false
  let flushTimer = null
  let writing = Promise.resolve()
  let disposed = false

  const file = path.join(homeDirectory(), 'storages', 'usage-stats', 'ledger.json')

  // ---------------------------------------------------------------------
  // Ledger IO
  // ---------------------------------------------------------------------

  function scheduleFlush() {
    if (disposed || flushTimer !== null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush()
    }, options.flushDelayMs)
  }

  function flush() {
    const sessions = Object.create(null)
    for (const id of Object.keys(ledger.sessions)) {
      const record = ledger.sessions[id]
      sessions[id] = {
        seq: record.seq,
        inherited: record.inherited,
        rev: record.rev,
        route: record.route,
      }
    }
    const snapshot = JSON.stringify({
      version: ledger.version,
      timeZone: ledger.timeZone,
      updatedAt: ledger.updatedAt,
      days: ledger.days,
      sessions,
    })
    writing = writing.then(async () => {
      try {
        await fs.mkdir(path.dirname(file), { recursive: true })
        const temporary = file + '.tmp'
        await fs.writeFile(temporary, snapshot, 'utf8')
        await fs.rename(temporary, file)
      } catch (error) {
        log('ledger write failed', error)
      }
    })
    return writing
  }

  async function load() {
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      if (
        parsed
        && parsed.version === LEDGER_VERSION
        && parsed.days && typeof parsed.days === 'object'
        && parsed.sessions && typeof parsed.sessions === 'object'
      ) {
        ledger.days = parsed.days
        ledger.sessions = parsed.sessions
        ledger.updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
        if (parsed.timeZone !== options.timeZone) state.needsRebuild = true
        return
      }
      state.needsRebuild = true
    } catch (error) {
      if (error && error.code !== 'ENOENT') log('ledger read failed', error)
    }
  }

  function log(message, error) {
    try {
      console.warn('[usage-stats] ' + message, error === undefined ? '' : error)
    } catch (ignored) {
      // logging must never take the statistics down
    }
  }

  // ---------------------------------------------------------------------
  // Folding
  // ---------------------------------------------------------------------

  function num(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  }

  function dateKey(ms) {
    const parts = zoneFormat.formatToParts(new Date(ms))
    const pick = (type) => {
      const found = parts.find((part) => part.type === type)
      return found === undefined ? '00' : found.value
    }
    return pick('year') + '-' + pick('month') + '-' + pick('day')
  }

  function routeOf(event) {
    const config = event && event.data && event.data.header && event.data.header.config
    if (!config || typeof config !== 'object') return ''
    const provider = typeof config.provider === 'string' ? config.provider : ''
    const model = typeof config.model === 'string' ? config.model : ''
    if (provider === '' && model === '') return ''
    return (provider === '' ? 'unknown' : provider) + '/' + (model === '' ? 'unknown' : model)
  }

  function sessionRecord(id) {
    let record = ledger.sessions[id]
    if (!record || typeof record !== 'object') {
      record = {
        seq: -1,
        inherited: 0,
        rev: '',
        route: '',
        backfilled: true,
      }
      ledger.sessions[id] = record
    } else {
      if (typeof record.seq !== 'number') record.seq = -1
      if (typeof record.inherited !== 'number') record.inherited = 0
      if (typeof record.rev !== 'string') record.rev = ''
      if (typeof record.route !== 'string') record.route = ''
      if (record.backfilled !== false) record.backfilled = true
    }
    return record
  }

  function addUsage(date, route, buckets) {
    let day = ledger.days[date]
    if (!day || typeof day !== 'object') {
      day = Object.create(null)
      ledger.days[date] = day
    }
    let entry = day[route]
    if (!entry || typeof entry !== 'object') {
      entry = { req: 0, in: 0, cr: 0, cw: 0, out: 0 }
      day[route] = entry
    }
    entry.req += 1
    entry.in += buckets.in
    entry.cr += buckets.cr
    entry.cw += buckets.cw
    entry.out += buckets.out
    ledger.updatedAt = Date.now()
  }

  /** Fold one committed event. Returns true when the ledger changed. */
  function foldEvent(sessionId, event) {
    if (typeof sessionId !== 'string' || sessionId === '' || !event || typeof event !== 'object') return false
    const record = sessionRecord(sessionId)
    const seq = typeof event.seq === 'number' ? event.seq : -1
    // Inherited head of a forked session: remember its route, never count it twice.
    if (seq >= 0 && seq < record.inherited) {
      if (event.type === 'request/header') {
        const route = routeOf(event)
        if (route !== '') record.route = route
        return false
      }
      return false
    }
    if (seq >= 0 && seq <= record.seq) return false

    if (event.type === 'request/header') {
      const route = routeOf(event)
      if (route !== '') record.route = route
      if (seq >= 0) record.seq = seq
      return true
    }
    if (event.type === 'assistant/message') {
      const usage = event.data && event.data.usage
      if (usage && typeof usage === 'object') {
        addUsage(
          dateKey(typeof event.time === 'number' ? event.time : Date.now()),
          record.route === '' ? UNKNOWN_ROUTE : record.route,
          {
            in: num(usage.inputTokens),
            cr: num(usage.cacheReadTokens),
            cw: num(usage.cacheWriteTokens),
            out: num(usage.outputTokens),
          },
        )
      }
      if (seq >= 0) record.seq = seq
      return true
    }
    if (seq >= 0) record.seq = seq
    return false
  }

  function drainAllPending() {
    for (const id of Array.from(pending.keys())) {
      const record = sessionRecord(id)
      if (record.backfilled) drainPending(id)
    }
  }

  function drainPending(sessionId) {
    const buffered = pending.get(sessionId)
    if (buffered === undefined || buffered.length === 0) return
    pending.delete(sessionId)
    buffered.sort((a, b) => (a.seq || 0) - (b.seq || 0))
    for (const event of buffered) foldEvent(sessionId, event)
    scheduleFlush()
  }

  // ---------------------------------------------------------------------
  // Live feed
  // ---------------------------------------------------------------------

  const offEvent = ctx.on('session/event', (session, event) => {
    if (disposed) return
    const id = session && (session.id || (session.header && session.header.id))
    if (typeof id !== 'string' || id === '') return
    const record = sessionRecord(id)
    if (!scanReady || !record.backfilled) {
      let buffered = pending.get(id)
      if (buffered === undefined) {
        buffered = []
        pending.set(id, buffered)
      }
      buffered.push(event)
      return
    }
    if (foldEvent(id, event)) scheduleFlush()
  })

  // ---------------------------------------------------------------------
  // Backfill
  // ---------------------------------------------------------------------

  function persistenceService() {
    try {
      return typeof ctx.get === 'function' ? ctx.get('sessionPersistence') : undefined
    } catch (error) {
      return undefined
    }
  }

  async function syncSession(id) {
    const record = sessionRecord(id)
    try {
      const persistence = persistenceService()
      let revision = ''
      if (persistence !== undefined && persistence !== null && typeof persistence.stat === 'function') {
        try {
          const snapshot = await persistence.stat(id)
          if (snapshot && snapshot.revision !== undefined && snapshot.revision !== null) revision = String(snapshot.revision)
        } catch (error) {
          revision = ''
        }
      }
      if (revision !== '' && revision === record.rev && record.seq >= 0) {
        return
      }
      const loaded = await ctx.sessionQuery.readSession(id)
      const inherited = loaded && typeof loaded.inheritedEventCount === 'number' ? loaded.inheritedEventCount : 0
      record.inherited = Math.max(record.inherited, inherited)
      if (loaded && Array.isArray(loaded.events)) {
        for (const event of loaded.events) foldEvent(id, event)
      }
      if (revision !== '') record.rev = revision
    } catch (error) {
      state.lastError = String(error && error.message ? error.message : error)
      log('session sync failed: ' + id, error)
    } finally {
      record.backfilled = true
      drainPending(id)
    }
  }

  async function scan() {
    let records = []
    try {
      records = await ctx.sessionQuery.listSessions()
    } catch (error) {
      state.lastError = String(error && error.message ? error.message : error)
      log('session listing failed', error)
    }
    state.total = records.length
    state.done = 0
    state.scanning = true
    const work = records.slice()
    const worker = async () => {
      while (work.length > 0 && !disposed) {
        const record = work.shift()
        const id = record && record.header && record.header.id
        if (typeof id === 'string') {
          sessionRecord(id).backfilled = false
          await syncSession(id)
        }
        state.done += 1
      }
    }
    const workers = []
    for (let index = 0; index < options.concurrency; index += 1) workers.push(worker())
    await Promise.all(workers)
    state.scanning = false
    scanReady = true
    drainAllPending()
    scheduleFlush()
  }

  async function rebuild() {
    if (state.scanning) return false
    scanReady = false
    ledger.days = Object.create(null)
    ledger.sessions = Object.create(null)
    ledger.timeZone = options.timeZone
    ledger.updatedAt = Date.now()
    state.needsRebuild = false
    await scan()
    return true
  }

  // ---------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------

  function emptyTotals() {
    return { req: 0, in: 0, cr: 0, cw: 0, out: 0, total: 0 }
  }

  function addTotals(target, source) {
    target.req += source.req
    target.in += source.in
    target.cr += source.cr
    target.cw += source.cw
    target.out += source.out
    target.total = target.in + target.cr + target.cw + target.out
  }

  function aggregateDay(day) {
    const totals = emptyTotals()
    for (const route of Object.keys(day)) {
      const entry = day[route]
      if (!entry || typeof entry !== 'object') continue
      totals.req += num(entry.req)
      totals.in += num(entry.in)
      totals.cr += num(entry.cr)
      totals.cw += num(entry.cw)
      totals.out += num(entry.out)
    }
    totals.total = totals.in + totals.cr + totals.cw + totals.out
    return totals
  }

  function shiftKey(key, deltaDays) {
    const parts = key.split('-').map(Number)
    if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) return key
    const time = Date.UTC(parts[0], parts[1] - 1, parts[2]) + deltaDays * 86400000
    const date = new Date(time)
    const pad = (value) => (value < 10 ? '0' + value : String(value))
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate())
  }

  function summarize(windowDays) {
    const today = dateKey(Date.now())
    const last7 = shiftKey(today, -6)
    const last30 = shiftKey(today, -29)
    const windowStart = windowDays > 0 ? shiftKey(today, -(windowDays - 1)) : null
    const totals = { today: emptyTotals(), last7: emptyTotals(), last30: emptyTotals(), all: emptyTotals() }
    const dates = Object.keys(ledger.days).sort()
    const days = []
    const models = new Map()

    for (const date of dates) {
      const day = ledger.days[date]
      if (!day || typeof day !== 'object') continue
      const aggregate = aggregateDay(day)
      addTotals(totals.all, aggregate)
      if (date === today) addTotals(totals.today, aggregate)
      if (date >= last7) addTotals(totals.last7, aggregate)
      if (date >= last30) addTotals(totals.last30, aggregate)
      if (windowStart !== null && date < windowStart) continue
      days.push({
        date,
        req: aggregate.req,
        in: aggregate.in,
        cr: aggregate.cr,
        cw: aggregate.cw,
        out: aggregate.out,
        total: aggregate.total,
      })
      for (const route of Object.keys(day)) {
        const entry = day[route]
        if (!entry || typeof entry !== 'object') continue
        let model = models.get(route)
        if (model === undefined) {
          model = { key: route, req: 0, in: 0, cr: 0, cw: 0, out: 0, total: 0 }
          models.set(route, model)
        }
        model.req += num(entry.req)
        model.in += num(entry.in)
        model.cr += num(entry.cr)
        model.cw += num(entry.cw)
        model.out += num(entry.out)
        model.total = model.in + model.cr + model.cw + model.out
      }
    }

    const modelList = Array.from(models.values())
      .sort((left, right) => right.total - left.total)
      .map((model) => ({
        key: model.key,
        req: model.req,
        in: model.in,
        cr: model.cr,
        cw: model.cw,
        out: model.out,
        total: model.total,
      }))

    return {
      generatedAt: Date.now(),
      timeZone: ledger.timeZone,
      today,
      status: state.scanning ? 'scanning' : 'ready',
      progress: { done: state.done, total: state.total },
      needsRebuild: state.needsRebuild,
      lastError: state.lastError,
      totals,
      days,
      models: modelList,
      updatedAt: ledger.updatedAt,
    }
  }

  // ---------------------------------------------------------------------
  // HTTP bridge
  // ---------------------------------------------------------------------

  function json(body, status) {
    return new Response(JSON.stringify(body), {
      status: status === undefined ? 200 : status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  function disposeRoute(dispose) {
    return () => {
      try {
        dispose()
      } catch (error) {
        log('route dispose failed', error)
      }
    }
  }

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'exact',
      path: SUMMARY_PATH,
      resource: (request) => {
        const url = new URL(request.url, 'http://usage-stats.invalid')
        const raw = Number(url.searchParams.get('days'))
        const windowDays = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 3650) : 0
        return json(summarize(windowDays))
      },
    })
    return disposeRoute(dispose)
  }, 'usage-stats: summary route')

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'exact',
      path: REBUILD_PATH,
      handler: (request, response) => {
        if (request.method !== 'POST' && request.method !== 'GET') {
          response.writeHead(405, { allow: 'POST, GET' })
          response.end()
          return
        }
        if (state.scanning) {
          response.writeHead(202, { 'content-type': 'application/json; charset=utf-8' })
          response.end(JSON.stringify({ started: false, reason: 'scanning' }))
          return
        }
        response.writeHead(202, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ started: true }))
        void rebuild().catch((error) => log('rebuild failed', error))
      },
    })
    return disposeRoute(dispose)
  }, 'usage-stats: rebuild route')

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  await load()
  ctx.effect(() => () => {
    disposed = true
    offEvent()
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    void flush()
  }, 'usage-stats: ledger lifetime')

  // Register the routes before the (possibly slow) backfill so the panel can show progress.
  if (options.backfill !== false) {
    state.scanning = true
    void scan().catch((error) => {
      state.scanning = false
      scanReady = true
      drainAllPending()
      log('initial scan failed', error)
    })
  }
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function homeDirectory() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured !== '') return configured
  return path.join(os.homedir(), '.dsh')
}

function normalizeConfig(input) {
  const raw = input && typeof input === 'object' ? input : {}
  const requested = typeof raw.timeZone === 'string' ? raw.timeZone.trim() : ''
  const timeZone = requested !== '' && isValidTimeZone(requested) ? requested : DEFAULT_ZONE
  return {
    timeZone,
    backfill: raw.backfill !== false,
    flushDelayMs: Number.isFinite(raw.flushDelayMs) && raw.flushDelayMs >= 0
      ? Math.min(Number(raw.flushDelayMs), 60000)
      : 2000,
    concurrency: Number.isFinite(raw.concurrency) && raw.concurrency >= 1
      ? Math.min(Math.floor(Number(raw.concurrency)), 8)
      : 2,
  }
}

function isValidTimeZone(zone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch (error) {
    return false
  }
}

function createZoneFormat(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
// ledger restart check
