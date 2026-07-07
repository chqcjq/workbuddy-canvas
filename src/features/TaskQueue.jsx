import { useEffect, useState, useRef } from 'react'

/* =========================================================================
 * Cowart 生成任务队列
 * -------------------------------------------------------------------------
 * 一个进程内的轻量队列 store：支持同时提交多个「文生图 / 图生图」任务，
 * 在画布前端展示队列与每个任务的执行状态，最多排队 10 个。
 *
 * 设计要点：
 *  - store 为模块级单例，不依赖 React，纯数据 + 订阅。
 *  - 真正的网络请求与画布插入由 App 提供的 executor / inserter 完成，
 *    本模块不直接 import 任何画布 API，避免循环依赖。
 *  - 并发上限 MAX_CONCURRENT（默认 2），其余任务在队列中等待。
 * ========================================================================= */

const MAX_QUEUE = 10
const MAX_CONCURRENT = 2

let tasks = []
const listeners = new Set()
let running = 0
let executor = null // async (task) => { ok:true, candidates?:[] } | { ok:false, error }
let inserter = null // (task, candidate) => void
let inserterAll = null // (task, candidates[]) => void  批量插入（多张图全部落画布）

function emit() {
  const snapshot = tasks.slice()
  for (const l of listeners) l(snapshot)
}

export function subscribeQueue(cb) {
  listeners.add(cb)
  cb(tasks.slice())
  return () => listeners.delete(cb)
}

export function getQueueTasks() {
  return tasks.slice()
}

export function queueLength() {
  return tasks.length
}

export function canEnqueue() {
  return tasks.length < MAX_QUEUE
}

export function setQueueExecutor(fn) {
  executor = fn
}

export function setQueueInserter(fn) {
  inserter = fn
}

export function setQueueInserterAll(fn) {
  inserterAll = fn
}

/**
 * 提交一个生成任务。
 * @param {object} data
 *   type: 'text' | 'image'
 *   prompt, provider, providerLabel, genParams,
 *   referenceAssetSrc, referenceShapeId, anchorShapeId, count, pageId
 * @returns {{ok:boolean, id?:string, error?:string}}
 */
export function enqueueGenerationTask(data) {
  if (tasks.length >= MAX_QUEUE) {
    return { ok: false, error: `生成队列已满（最多 ${MAX_QUEUE} 个），请等待任务完成或先移除部分任务。` }
  }
  const id = 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  const task = {
    id,
    status: 'queued', // queued | running | done | error
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    progress: 0,
    error: null,
    candidates: null,
    ...data
  }
  tasks = [...tasks, task]
  emit()
  pump()
  return { ok: true, id }
}

function patchTask(id, patch) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
  emit()
}

async function pump() {
  if (running >= MAX_CONCURRENT) return
  const next = tasks.find((t) => t.status === 'queued')
  if (!next) return

  running++
  patchTask(next.id, { status: 'running', startedAt: Date.now() })
  try {
    if (!executor) throw new Error('队列执行器未初始化')
    const res = await executor(next)
    if (!res || !res.ok) throw new Error(res?.error || '执行失败')

    // 多张图：全部自动插入画布，状态直接置为完成（候选图保留用于预览）。
    if (res.candidates && res.candidates.length > 1) {
      if (!inserterAll) throw new Error('批量插入器未初始化')
      inserterAll(next, res.candidates)
      patchTask(next.id, {
        status: 'done',
        candidates: res.candidates,
        insertedAll: true,
        progress: 100,
        finishedAt: Date.now()
      })
    } else {
      patchTask(next.id, {
        status: 'done',
        progress: 100,
        finishedAt: Date.now(),
        candidates: res.candidates || null,
        insertedAll: !!(res.candidates && res.candidates.length > 1)
      })
    }
  } catch (err) {
    patchTask(next.id, { status: 'error', error: err.message || '生成失败', finishedAt: Date.now() })
  } finally {
    running--
    pump()
  }
}

/**
 * 取消 / 移除一个任务。仅允许移除非运行中的任务（运行中不可中断网络请求）。
 */
export function removeQueueTask(id) {
  const t = tasks.find((x) => x.id === id)
  if (!t) return
  if (t.status === 'running') return
  const wasQueued = t.status === 'queued'
  tasks = tasks.filter((x) => x.id !== id)
  emit()
  if (wasQueued) pump()
}

/** 清空已完成的任务（done / error / needs_choice 都算可清理）。 */
export function clearFinishedQueueTasks() {
  tasks = tasks.filter((t) => t.status === 'queued' || t.status === 'running')
  emit()
}

export const QUEUE_MAX = MAX_QUEUE

/* =========================================================================
 * 队列展示面板
 * ========================================================================= */

const STATUS_LABEL = {
  queued: '排队中',
  running: '生成中',
  needs_choice: '待选择',
  done: '已完成',
  error: '失败'
}

const TYPE_LABEL = {
  text: '文生图',
  image: '图生图'
}

function formatElapsed(ms) {
  if (ms == null) return '0s'
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m${s % 60}s`
}

export function TaskQueuePanel() {
  const [list, setList] = useState(() => getQueueTasks())
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(Date.now())
  const tickRef = useRef(null)

  useEffect(() => subscribeQueue(setList), [])

  // 有任何任务在跑时，每秒刷新一次以更新耗时显示
  useEffect(() => {
    const anyRunning = list.some((t) => t.status === 'running')
    if (anyRunning && !tickRef.current) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000)
    } else if (!anyRunning && tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [list])

  if (list.length === 0) return null

  const runningCount = list.filter((t) => t.status === 'running').length
  const queuedCount = list.filter((t) => t.status === 'queued').length

  return (
    <div className={`cowart-queue-panel${collapsed ? ' cowart-queue-collapsed' : ''}`} role="region" aria-label="生成任务队列">
      <div className="cowart-queue-header" onClick={() => setCollapsed((c) => !c)}>
        <span className="cowart-queue-title">
          🗂 生成队列 <b>{list.length}/{QUEUE_MAX}</b>
        </span>
        <span className="cowart-queue-sub">
          {runningCount > 0 ? `${runningCount} 执行中` : ''}
          {queuedCount > 0 ? ` · ${queuedCount} 等待` : ''}
        </span>
        <button
          className="cowart-queue-toggle"
          type="button"
          title={collapsed ? '展开' : '收起'}
          onClick={(e) => {
            e.stopPropagation()
            setCollapsed((c) => !c)
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed ? (
        <div className="cowart-queue-body">
          {list.map((t, idx) => {
            const elapsed =
              t.status === 'running' && t.startedAt
                ? formatElapsed(now - t.startedAt)
                : t.startedAt && t.finishedAt
                ? formatElapsed(t.finishedAt - t.startedAt)
                : t.status === 'queued'
                ? '—'
                : ''
            return (
              <div key={t.id} className={`cowart-queue-item cowart-queue-status-${t.status}`}>
                <div className="cowart-queue-item-top">
                  <span className="cowart-queue-index">#{idx + 1}</span>
                  <span className="cowart-queue-type">{TYPE_LABEL[t.type] || t.type}</span>
                  <span className="cowart-queue-provider">{t.providerLabel || t.provider}</span>
                  <span className="cowart-queue-status">{STATUS_LABEL[t.status]}</span>
                  <span className="cowart-queue-elapsed">{elapsed}</span>
                </div>
                <div className="cowart-queue-prompt" title={t.prompt}>
                  {t.prompt || '（无提示词）'}
                </div>

                {t.status === 'running' ? (
                  <div className="cowart-queue-progress">
                    <span className="cowart-queue-spinner" />
                  </div>
                ) : null}

                {t.status === 'done' && t.candidates && t.candidates.length > 1 && t.insertedAll ? (
                  <div className="cowart-queue-candidates cowart-queue-inserted">
                    <div className="cowart-queue-inserted-label">已插入 {t.candidates.length} 张</div>
                    <div className="cowart-queue-candidates-grid">
                      {t.candidates.map((c, i) => (
                        <div key={i} className="cowart-queue-candidate" title={`候选 ${i + 1}`}>
                          <img src={c.src} alt={`候选 ${i + 1}`} />
                          <span>候选 {i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {t.status === 'error' ? (
                  <div className="cowart-queue-error">❌ {t.error || '生成失败'}</div>
                ) : null}

                <div className="cowart-queue-actions">
                  {t.status === 'queued' ? (
                    <button type="button" className="cowart-queue-remove" onClick={() => removeQueueTask(t.id)}>
                      取消
                    </button>
                  ) : null}
                  {t.status === 'error' ? (
                    <button type="button" className="cowart-queue-remove" onClick={() => removeQueueTask(t.id)}>
                      移除
                    </button>
                  ) : null}
                  {t.status === 'done' ? (
                    <button type="button" className="cowart-queue-remove" onClick={() => removeQueueTask(t.id)}>
                      移除
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}

          <div className="cowart-queue-footer">
            <button
              type="button"
              className="cowart-queue-clear"
              onClick={clearFinishedQueueTasks}
              disabled={!list.some((t) => t.status !== 'queued' && t.status !== 'running')}
            >
              清理已完成
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
