import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, createShapeId, toRichText } from 'tldraw'
import './TemplateLibrary.css'
import { PROMPT_TEMPLATE_GROUPS, renderPromptTemplate } from './promptTemplates'

// ---------- 模板构建函数 ----------

function addRect(editor, ids, { x, y, w, h, text, color = 'black', fill = 'none' }) {
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'geo',
    x,
    y,
    props: {
      geo: 'rectangle',
      w,
      h,
      richText: toRichText(text || ''),
      color,
      fill,
      size: 'm',
      font: 'sans',
      align: 'middle',
      verticalAlign: 'middle',
    },
  })
  ids.push(id)
  return id
}

function addText(editor, ids, { x, y, text, color = 'black', size = 's' }) {
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'text',
    x,
    y,
    props: { richText: toRichText(text), color, size },
  })
  ids.push(id)
  return id
}

function addArrow(editor, ids, { ax, ay, bx, by, color = 'black' }) {
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'arrow',
    x: 0,
    y: 0,
    props: {
      start: { x: ax, y: ay },
      end: { x: bx, y: by },
      bend: 0,
      color,
      strokeWidth: 's',
    },
  })
  ids.push(id)
  return id
}

function buildMeeting(editor, c, ids) {
  const cx = c.x
  const cy = c.y
  addText(editor, ids, { x: cx - 130, y: cy - 170, text: '会议纪要', color: 'black', size: 'l' })
  const items = [
    { label: '议题', color: 'blue' },
    { label: '决策', color: 'green' },
    { label: '待办', color: 'orange' },
    { label: '参会人', color: 'violet' },
  ]
  items.forEach((it, i) => {
    addRect(editor, ids, {
      x: cx - 180,
      y: cy - 120 + i * 64,
      w: 360,
      h: 52,
      text: it.label,
      color: it.color,
      fill: 'none',
    })
  })
}

function buildSwot(editor, c, ids) {
  const cx = c.x
  const cy = c.y
  const bw = 170
  const bh = 120
  const gap = 16
  const ox = cx - bw - gap / 2
  const oy = cy - bh - gap / 2
  const cells = [
    { dx: 0, dy: 0, title: '优势', sub: 'Strengths', color: 'green' },
    { dx: bw + gap, dy: 0, title: '劣势', sub: 'Weaknesses', color: 'red' },
    { dx: 0, dy: bh + gap, title: '机会', sub: 'Opportunities', color: 'blue' },
    { dx: bw + gap, dy: bh + gap, title: '威胁', sub: 'Threats', color: 'orange' },
  ]
  cells.forEach((cell) => {
    const x = ox + cell.dx
    const y = oy + cell.dy
    addRect(editor, ids, { x, y, w: bw, h: bh, text: cell.title, color: cell.color, fill: 'none' })
    addText(editor, ids, { x: x + 12, y: y + bh - 26, text: cell.sub, color: cell.color, size: 's' })
  })
}

function buildFlow(editor, c, ids) {
  const cx = c.x
  const cy = c.y
  const steps = ['开始', '处理', '审核', '完成']
  const rw = 150
  const rh = 70
  const gap = 70
  const startX = cx - (steps.length * (rw + gap) - gap) / 2
  const y = cy - rh / 2
  const xs = steps.map((_, i) => startX + i * (rw + gap))
  steps.forEach((label, i) => {
    addRect(editor, ids, {
      x: xs[i],
      y,
      w: rw,
      h: rh,
      text: label,
      color: i % 2 === 0 ? 'blue' : 'green',
      fill: 'none',
    })
    if (i < steps.length - 1) {
      addArrow(editor, ids, {
        ax: xs[i] + rw,
        ay: y + rh / 2,
        bx: xs[i + 1],
        by: y + rh / 2,
        color: 'black',
      })
    }
  })
}

function buildQuadrant(editor, c, ids) {
  const cx = c.x
  const cy = c.y
  const halfW = 200
  const halfH = 150
  // 坐标轴（细矩形近似）
  addRect(editor, ids, { x: cx - halfW, y: cy - 2, w: halfW * 2, h: 4, text: '', color: 'black', fill: 'solid' })
  addRect(editor, ids, { x: cx - 2, y: cy - halfH, w: 4, h: halfH * 2, text: '', color: 'black', fill: 'solid' })
  const labels = [
    { x: cx - halfW + 12, y: cy - halfH + 12, text: '重要且紧急', color: 'red' },
    { x: cx + 12, y: cy - halfH + 12, text: '重要不紧急', color: 'green' },
    { x: cx - halfW + 12, y: cy + 12, text: '紧急不重要', color: 'orange' },
    { x: cx + 12, y: cy + 12, text: '不重要不紧急', color: 'blue' },
  ]
  labels.forEach((l) => {
    addRect(editor, ids, { x: l.x, y: l.y, w: 160, h: 100, text: l.text, color: l.color, fill: 'none' })
  })
}

function buildJourney(editor, c, ids) {
  const cx = c.x
  const cy = c.y
  const stages = [
    { name: '认知', mood: '😕 困惑', color: 'blue' },
    { name: '考虑', mood: '🙂 期待', color: 'green' },
    { name: '购买', mood: '😀 满意', color: 'violet' },
    { name: '留存', mood: '😍 忠诚', color: 'orange' },
  ]
  const rw = 140
  const rh = 64
  const gap = 56
  const startX = cx - (stages.length * (rw + gap) - gap) / 2
  const y = cy - rh / 2 - 20
  const xs = stages.map((_, i) => startX + i * (rw + gap))
  stages.forEach((st, i) => {
    addRect(editor, ids, { x: xs[i], y, w: rw, h: rh, text: st.name, color: st.color, fill: 'none' })
    addText(editor, ids, { x: xs[i], y: y + rh + 14, text: st.mood, color: st.color, size: 's' })
    if (i < stages.length - 1) {
      addArrow(editor, ids, {
        ax: xs[i] + rw,
        ay: y + rh / 2,
        bx: xs[i + 1],
        by: y + rh / 2,
        color: 'black',
      })
    }
  })
}

const TEMPLATES = [
  { key: 'meeting', name: '会议纪要', desc: '议题/决策/待办/参会人', build: buildMeeting },
  { key: 'swot', name: 'SWOT', desc: '优势/劣势/机会/威胁', build: buildSwot },
  { key: 'flow', name: '流程图', desc: '横向步骤 + 箭头连接', build: buildFlow },
  { key: 'quadrant', name: '四象限', desc: '重要/紧急坐标轴', build: buildQuadrant },
  { key: 'journey', name: '用户旅程', desc: '阶段 + 情绪标签', build: buildJourney },
]

export default function TemplateLibrary() {
  const editor = useEditor()
  const [open, setOpen] = useState(false)

  const handlePick = (tpl) => {
    const ids = []
    const center = editor.getViewportPageBounds().center
    tpl.build(editor, { x: center.x, y: center.y }, ids)
    if (ids.length) {
      editor.setSelectedShapes(ids)
      editor.zoomToSelection()
    }
    setOpen(false)
  }

  // Prompt templates: pick → load the rendered prompt into the text-to-image
  // dialog so the user can adjust it before submitting.
  const handlePickPrompt = (item) => {
    const rendered = renderPromptTemplate(item, {})
    window.dispatchEvent(
      new CustomEvent('cowart-open-textgen', {
        detail: {
          anchorShapeId: null,
          prompt: rendered,
          templateName: item.name,
          needUpload: item.needUpload,
        },
      })
    )
    setOpen(false)
  }

  return (
    <>
      <button
        className="cowart-tpl-btn"
        type="button"
        onClick={() => setOpen(true)}
        title="插入模板"
      >
        📁 模板
      </button>

      {open
        ? createPortal(
            <div className="cowart-tpl-overlay" onClick={() => setOpen(false)}>
              <div
                className="cowart-tpl-modal"
                role="dialog"
                aria-label="模板库"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="cowart-tpl-head">
                  <span className="cowart-tpl-title">模板库</span>
                  <button className="cowart-tpl-close" type="button" onClick={() => setOpen(false)}>
                    ✕
                  </button>
                </div>
                <div className="cowart-tpl-grid">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      className="cowart-tpl-card"
                      type="button"
                      onClick={() => handlePick(t)}
                    >
                      <span className="cowart-tpl-card-name">{t.name}</span>
                      <span className="cowart-tpl-card-desc">{t.desc}</span>
                    </button>
                  ))}
                </div>

                <div className="cowart-tpl-section">
                  <div className="cowart-tpl-section-title">
                    办公 &amp; 电商 提示词（点选后载入文生图对话框，可修改后提交）
                  </div>
                  {PROMPT_TEMPLATE_GROUPS.map((group) => (
                    <div key={group.group} className="cowart-tpl-group">
                      <div className="cowart-tpl-group-title">{group.group}</div>
                      <div className="cowart-tpl-grid">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            className="cowart-tpl-card"
                            type="button"
                            onClick={() => handlePickPrompt(item)}
                          >
                            <span className="cowart-tpl-card-name">
                              {item.icon} {item.name}
                              {item.needUpload ? ' 📎' : ''}
                            </span>
                            <span className="cowart-tpl-card-desc">{item.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
