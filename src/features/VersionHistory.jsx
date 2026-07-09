import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditor } from 'tldraw'
import './VersionHistory.css'

const STORAGE_KEY = 'cowart-versions'
const MAX_VERSIONS = 20
const AUTO_INTERVAL_MS = 30_000

function fmtTime(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function readVersions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export default function VersionHistory() {
  const editor = useEditor()
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState(() => readVersions())
  const [label, setLabel] = useState('')

  // 落盘，遇到配额不足时丢弃最旧一条后重试
  const persist = useCallback((arr) => {
    const write = (list) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
        return true
      } catch {
        return false
      }
    }
    if (write(arr)) return
    if (arr.length > 1) {
      const trimmed = arr.slice(1)
      write(trimmed)
      setVersions(trimmed)
    }
  }, [])

  // 保存当前画布为一条快照
  const saveSnapshot = useCallback(
    (snapLabel) => {
      let snap
      try {
        snap = editor.store.getStoreSnapshot()
      } catch {
        return
      }
      const item = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        label: (snapLabel || '').trim(),
        snapshot: snap,
      }
      setVersions((prev) => {
        const next = [...prev, item]
        while (next.length > MAX_VERSIONS) next.shift()
        persist(next)
        return next
      })
    },
    [editor, persist],
  )

  // 自动快照：挂载后每 30s 存一次，卸载清除
  useEffect(() => {
    const timer = window.setInterval(() => {
      saveSnapshot('自动')
    }, AUTO_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [saveSnapshot])

  const deleteVersion = useCallback(
    (id) => {
      setVersions((prev) => {
        const next = prev.filter((v) => v.id !== id)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const restoreVersion = useCallback(
    (item) => {
      const ok = window.confirm(
        `确定恢复「${item.label || fmtTime(item.ts)}」的快照吗？当前画布会先自动备份到历史。`,
      )
      if (!ok) return
      // 先存一份当前整盘到历史，避免覆盖丢失
      let current
      try {
        current = editor.store.getStoreSnapshot()
      } catch {
        current = null
      }
      if (current) {
        const backup = {
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ts: Date.now(),
          label: '恢复前备份',
          snapshot: current,
        }
        setVersions((prev) => {
          const next = [...prev, backup]
          while (next.length > MAX_VERSIONS) next.shift()
          persist(next)
          return next
        })
      }
      try {
        editor.store.loadSnapshot(item.snapshot)
      } catch {
        window.alert('恢复失败：快照数据可能已损坏。')
      }
    },
    [editor, persist],
  )

  const list = [...versions].reverse() // 最新在前

  return createPortal(
    <>
      <button
        type="button"
        className="cowart-vh-trigger"
        onClick={() => setOpen((v) => !v)}
        title="版本历史"
      >
        🕑 版本历史
      </button>

      {open && (
        <div className="cowart-vh-drawer" role="dialog" aria-label="版本历史">
          <div className="cowart-vh-head">
            <span className="cowart-vh-title">版本历史</span>
            <button
              type="button"
              className="cowart-vh-close"
              onClick={() => setOpen(false)}
              title="关闭"
            >
              ✕
            </button>
          </div>

          <div className="cowart-vh-save">
            <input
              className="cowart-vh-input"
              type="text"
              value={label}
              placeholder="快照标签（可选）"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveSnapshot(label)
                  setLabel('')
                }
              }}
            />
            <button
              type="button"
              className="cowart-vh-savebtn"
              onClick={() => {
                saveSnapshot(label)
                setLabel('')
              }}
            >
              保存快照
            </button>
          </div>

          <div className="cowart-vh-list">
            {list.length === 0 && (
              <div className="cowart-vh-empty">暂无快照，可手动保存或等待自动快照。</div>
            )}
            {list.map((v) => (
              <div className="cowart-vh-item" key={v.id}>
                <div className="cowart-vh-meta">
                  <span className="cowart-vh-time">{fmtTime(v.ts)}</span>
                  {v.label && <span className="cowart-vh-tag">{v.label}</span>}
                </div>
                <div className="cowart-vh-actions">
                  <button
                    type="button"
                    className="cowart-vh-btn cowart-vh-restore"
                    onClick={() => restoreVersion(v)}
                  >
                    恢复
                  </button>
                  <button
                    type="button"
                    className="cowart-vh-btn cowart-vh-del"
                    onClick={() => deleteVersion(v.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
