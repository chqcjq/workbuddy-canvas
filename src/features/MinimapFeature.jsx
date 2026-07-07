import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, useValue } from 'tldraw'
import './MinimapFeature.css'

const W = 180
const H = 130
const PAD = 10

export default function MinimapFeature() {
  const editor = useEditor()
  const canvasRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)

  // 监听图形数量与相机变化，触发重绘
  const trigger = useValue(
    'cowart-mm-trigger',
    () => {
      const cam = editor.getCamera()
      let count = 0
      try {
        count = editor.getCurrentPageShapes().length
      } catch {
        count = 0
      }
      return `${count}|${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(3)}`
    },
    [editor],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    // 收集所有图形 bounds
    let shapes = []
    try {
      shapes = editor.getCurrentPageShapes()
    } catch {
      shapes = []
    }

    const shapeRects = []
    for (const s of shapes) {
      let b
      try {
        b = editor.getShapePageBounds(s.id)
      } catch {
        continue
      }
      if (!b) continue
      shapeRects.push({ x: b.x, y: b.y, w: b.width, h: b.height })
    }

    // 视口 bounds（页面坐标）
    let vp
    try {
      vp = editor.getViewportPageBounds()
    } catch {
      vp = null
    }

    // 包围盒：图形与视口取并集，确保蓝色视口框始终可见
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const r of shapeRects) {
      minX = Math.min(minX, r.x)
      minY = Math.min(minY, r.y)
      maxX = Math.max(maxX, r.x + r.w)
      maxY = Math.max(maxY, r.y + r.h)
    }
    if (vp) {
      minX = Math.min(minX, vp.x)
      minY = Math.min(minY, vp.y)
      maxX = Math.max(maxX, vp.x + vp.width)
      maxY = Math.max(maxY, vp.y + vp.height)
    }

    if (!isFinite(minX)) {
      // 无内容，画个空底
      minX = 0
      minY = 0
      maxX = W
      maxY = H
    }

    const worldW = Math.max(1, maxX - minX)
    const worldH = Math.max(1, maxY - minY)
    const scale = Math.min((W - 2 * PAD) / worldW, (H - 2 * PAD) / worldH)

    const toX = (x) => PAD + (x - minX) * scale
    const toY = (y) => PAD + (y - minY) * scale

    // 图形缩略矩形（半透明灰）
    ctx.fillStyle = 'rgba(100, 116, 139, 0.45)'
    for (const r of shapeRects) {
      const x = toX(r.x)
      const y = toY(r.y)
      const w = Math.max(1, r.w * scale)
      const h = Math.max(1, r.h * scale)
      ctx.fillRect(x, y, w, h)
    }

    // 视口矩形（蓝色描边）
    if (vp) {
      const vx = toX(vp.x)
      const vy = toY(vp.y)
      const vw = Math.max(2, vp.width * scale)
      const vh = Math.max(2, vp.height * scale)
      ctx.strokeStyle = '#2c7ef0'
      ctx.lineWidth = 1.5
      ctx.strokeRect(vx, vy, vw, vh)
    }
  }, [editor])

  // trigger 变化即重绘
  useEffect(() => {
    draw()
  }, [trigger, draw, collapsed])

  const handleClick = useCallback(
    (e) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      // 鼠标在 minimap 内的位置 -> 归一化到逻辑画布坐标
      const mx = (e.clientX - rect.left) * (W / rect.width)
      const my = (e.clientY - rect.top) * (H / rect.height)

      // 反推包围盒（与 draw 中一致）
      let shapes = []
      try {
        shapes = editor.getCurrentPageShapes()
      } catch {
        shapes = []
      }
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const s of shapes) {
        let b
        try {
          b = editor.getShapePageBounds(s.id)
        } catch {
          continue
        }
        if (!b) continue
        minX = Math.min(minX, b.x)
        minY = Math.min(minY, b.y)
        maxX = Math.max(maxX, b.x + b.width)
        maxY = Math.max(maxY, b.y + b.height)
      }
      let vp
      try {
        vp = editor.getViewportPageBounds()
      } catch {
        vp = null
      }
      if (vp) {
        minX = Math.min(minX, vp.x)
        minY = Math.min(minY, vp.y)
        maxX = Math.max(maxX, vp.x + vp.width)
        maxY = Math.max(maxY, vp.y + vp.height)
      }
      if (!isFinite(minX)) {
        minX = 0
        minY = 0
        maxX = W
        maxY = H
      }
      const worldW = Math.max(1, maxX - minX)
      const worldH = Math.max(1, maxY - minY)
      const scale = Math.min((W - 2 * PAD) / worldW, (H - 2 * PAD) / worldH)

      // minimap 点击点 -> 页面坐标
      const worldX = minX + (mx - PAD) / scale
      const worldY = minY + (my - PAD) / scale

      // 以该点为中心设置相机（保持当前 zoom）
      let z = 1
      try {
        const cam = editor.getCamera()
        z = cam.z
      } catch {
        z = 1
      }
      let vw = 0
      let vh = 0
      if (vp) {
        vw = vp.width
        vh = vp.height
      } else {
        const vb = editor.getViewportPageBounds()
        vw = vb.width
        vh = vb.height
      }
      editor.setCamera(
        { x: worldX - vw / 2, y: worldY - vh / 2, z },
        { immediate: true },
      )
    },
    [editor],
  )

  return createPortal(
    <div className="cowart-mm-panel" aria-label="缩略图导航">
      <div className="cowart-mm-head">
        <span className="cowart-mm-title">缩略图</span>
        <button
          type="button"
          className="cowart-mm-toggle"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? '展开' : '收起'}
        >
          {collapsed ? '⊞' : '−'}
        </button>
      </div>
      {!collapsed && (
        <canvas
          ref={canvasRef}
          className="cowart-mm-canvas"
          style={{ width: W, height: H }}
          onClick={handleClick}
          title="点击定位到该区域"
        />
      )}
    </div>,
    document.body,
  )
}
