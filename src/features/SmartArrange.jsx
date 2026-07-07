import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, useValue, createShapeId } from 'tldraw'
import './SmartArrange.css'

const GAP = 24

const LAYOUTS = [
  { value: 'h', label: '横向排列' },
  { value: 'v', label: '纵向排列' },
  { value: 'grid', label: '网格对齐' },
  { value: 'dist', label: '等距分布' },
]

export default function SmartArrange() {
  const editor = useEditor()
  const [mode, setMode] = useState('h')
  const [autoLink, setAutoLink] = useState(false)

  const selectedCount = useValue(
    'smart-arrange-sel-count',
    () => editor.getSelectedShapeIds().length,
    [editor],
  )

  const arrange = useCallback(
    (layoutMode) => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length < 2) return

      const items = ids.map((id) => {
        const b = editor.getShapePageBounds(id)
        return {
          id,
          x: b.x,
          y: b.y,
          w: b.width,
          h: b.height,
          cx: b.x + b.width / 2,
          cy: b.y + b.height / 2,
        }
      })

      const newPos = {}

      if (layoutMode === 'h') {
        const sorted = [...items].sort((a, b) => a.x - b.x)
        const top = Math.min(...items.map((i) => i.y))
        let cursor = sorted[0].x
        sorted.forEach((it) => {
          newPos[it.id] = { x: cursor, y: top }
          cursor += it.w + GAP
        })
      } else if (layoutMode === 'v') {
        const sorted = [...items].sort((a, b) => a.y - b.y)
        const left = Math.min(...items.map((i) => i.x))
        let cursor = sorted[0].y
        sorted.forEach((it) => {
          newPos[it.id] = { x: left, y: cursor }
          cursor += it.h + GAP
        })
      } else if (layoutMode === 'grid') {
        const cols = Math.max(1, Math.ceil(Math.sqrt(items.length)))
        const maxW = Math.max(...items.map((i) => i.w))
        const maxH = Math.max(...items.map((i) => i.h))
        const cellW = maxW + GAP
        const cellH = maxH + GAP
        const ox = Math.min(...items.map((i) => i.x))
        const oy = Math.min(...items.map((i) => i.y))
        items.forEach((it, idx) => {
          const r = Math.floor(idx / cols)
          const c = idx % cols
          newPos[it.id] = { x: ox + c * cellW, y: oy + r * cellH }
        })
      } else if (layoutMode === 'dist') {
        const minX = Math.min(...items.map((i) => i.x))
        const minY = Math.min(...items.map((i) => i.y))
        const maxX = Math.max(...items.map((i) => i.x + i.w))
        const maxY = Math.max(...items.map((i) => i.y + i.h))
        const ow = Math.max(0, maxX - minX)
        const oh = Math.max(0, maxY - minY)
        const horizontal = ow >= oh
        const sorted = [...items].sort((a, b) =>
          horizontal ? a.x - b.x : a.y - b.y,
        )
        sorted.forEach((it, idx) => {
          const t = sorted.length > 1 ? idx / (sorted.length - 1) : 0
          if (horizontal) {
            const cx = minX + t * ow
            const cy = (minY + maxY) / 2
            newPos[it.id] = { x: cx - it.w / 2, y: cy - it.h / 2 }
          } else {
            const cy = minY + t * oh
            const cx = (minX + maxX) / 2
            newPos[it.id] = { x: cx - it.w / 2, y: cy - it.h / 2 }
          }
        })
      }

      editor.batch(() => {
        for (const id of Object.keys(newPos)) {
          editor.updateShape({ id, ...newPos[id] })
        }

        if (autoLink) {
          const order = [...items].sort((a, b) => {
            const pa = newPos[a.id]
            const pb = newPos[b.id]
            if (Math.abs(pa.y - pb.y) > 1) return pa.y - pb.y
            return pa.x - pb.x
          })
          for (let i = 0; i < order.length - 1; i++) {
            const a = order[i]
            const b = order[i + 1]
            const na = newPos[a.id]
            const nb = newPos[b.id]
            editor.createShape({
              id: createShapeId(),
              type: 'arrow',
              x: 0,
              y: 0,
              props: {
                start: { x: na.x + a.w / 2, y: na.y + a.h / 2 },
                end: { x: nb.x + b.w / 2, y: nb.y + b.h / 2 },
                bend: 0,
                color: 'blue',
                strokeWidth: 's',
              },
            })
          }
        }
      })

      editor.setSelectedShapes(ids)
      editor.zoomToSelection()
    },
    [editor, autoLink],
  )

  if (selectedCount < 2) return null

  return createPortal(
    <div className="cowart-sa-bar" role="toolbar" aria-label="智能排版">
      <button
        className="cowart-sa-btn"
        type="button"
        onClick={() => arrange(mode)}
        title="按所选布局整理所选图形"
      >
        ✨ 一键整理
      </button>

      <select
        className="cowart-sa-select"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        title="选择布局方式"
      >
        {LAYOUTS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>

      <label className="cowart-sa-check" title="整理后自动用箭头连接相邻图形">
        <input
          type="checkbox"
          checked={autoLink}
          onChange={(e) => setAutoLink(e.target.checked)}
        />
        自动连线
      </label>
    </div>,
    document.body,
  )
}
