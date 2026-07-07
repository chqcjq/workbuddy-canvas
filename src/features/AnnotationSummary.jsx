import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, useValue, createShapeId, toRichText } from 'tldraw'
import './AnnotationSummary.css'

// 安全读取标注文字
function safeText(editor, id) {
  try {
    return editor.getShapePlainText(id) || ''
  } catch {
    return ''
  }
}

// 转义 Markdown 表格中的竖线与换行
function escapeCell(text) {
  return String(text)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim()
}

export default function AnnotationSummary() {
  const editor = useEditor()
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState('')
  const hintTimer = useRef(null)

  // 随画布变化自动刷新
  const annotations = useValue(
    'cowart-annotation-summary',
    () =>
      editor
        .getCurrentPageShapes()
        .filter((s) => s.meta && s.meta.cowartAnnotationArrow === true)
        .map((s, i) => ({
          id: s.id,
          index: i + 1,
          text: safeText(editor, s.id),
          resolved: !!s.meta.cowartAnnotationResolved,
          x: Math.round(s.x),
          y: Math.round(s.y),
        })),
    [editor],
  )

  const flash = useCallback((msg) => {
    setHint(msg)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(''), 2200)
  }, [])

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  const focusAnnotation = useCallback(
    (id) => {
      try {
        editor.setSelectedShapes([id])
        editor.zoomToSelection()
      } catch {
        /* 忽略定位异常 */
      }
    },
    [editor],
  )

  const toggleResolve = useCallback(
    (id) => {
      const s = editor.getShape(id)
      if (!s) return
      const next = !s.meta?.cowartAnnotationResolved
      editor.updateShape({
        id,
        meta: { ...s.meta, cowartAnnotationResolved: next },
      })
    },
    [editor],
  )

  const addBubble = useCallback(() => {
    const selIds = editor.getSelectedShapeIds()
    const target = selIds
      .map((id) => editor.getShape(id))
      .find((s) => s && s.meta && s.meta.cowartAnnotationArrow === true)

    if (!target) {
      flash('请先选择一个标注箭头')
      return
    }

    let x = target.x + 160
    let y = target.y
    try {
      const b = editor.getShapePageBounds(target.id)
      if (b) {
        x = b.x + b.width + 16
        y = b.y
      }
    } catch {
      /* 使用兜底坐标 */
    }

    editor.createShape({
      id: createShapeId(),
      type: 'note',
      x,
      y,
      props: {
        richText: toRichText('批注'),
        color: 'yellow',
      },
    })
    flash('已添加批注气泡')
  }, [editor, flash])

  const buildMarkdown = useCallback(
    (list) => {
      const lines = [
        '# 评审表',
        '',
        '| 序号 | 意见 | 状态 | 位置(近似 x,y) |',
        '| --- | --- | --- | --- |',
      ]
      if (!list.length) {
        lines.push('| - | （暂无标注） | - | - |')
      } else {
        for (const a of list) {
          lines.push(
            `| ${a.index} | ${escapeCell(a.text) || '（无意见）'} | ${
              a.resolved ? '已解决' : '待处理'
            } | (${a.x}, ${a.y}) |`,
          )
        }
      }
      lines.push('')
      return lines.join('\n')
    },
    [],
  )

  const exportMarkdown = useCallback(() => {
    const md = buildMarkdown(annotations)
    try {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '评审表.md'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      flash('已导出 评审表.md')
    } catch {
      flash('导出失败')
    }
  }, [annotations, buildMarkdown, flash])

  const copyMarkdown = useCallback(async () => {
    const md = buildMarkdown(annotations)
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(md)
      } else {
        const ta = document.createElement('textarea')
        ta.value = md
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      flash('已复制到剪贴板')
    } catch {
      flash('复制失败')
    }
  }, [annotations, buildMarkdown, flash])

  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          className="cowart-as-fab"
          onClick={() => setOpen(true)}
          title="评审标注"
        >
          💬 标注
        </button>
      )}

      {open && (
        <aside
          className="cowart-as-panel"
          role="dialog"
          aria-label="评审标注面板"
        >
          <header className="cowart-as-head">
            <span className="cowart-as-title">评审标注（{annotations.length}）</span>
            <button
              type="button"
              className="cowart-as-close"
              onClick={() => setOpen(false)}
              title="关闭"
            >
              ✕
            </button>
          </header>

          <div className="cowart-as-actions">
            <button
              type="button"
              className="cowart-as-btn"
              onClick={addBubble}
              title="在选中标注箭头旁添加便签"
            >
              + 批注气泡
            </button>
            <button
              type="button"
              className="cowart-as-btn"
              onClick={exportMarkdown}
              title="导出 Markdown 评审表"
            >
              导出评审表
            </button>
            <button
              type="button"
              className="cowart-as-btn"
              onClick={copyMarkdown}
              title="复制 Markdown 到剪贴板"
            >
              复制
            </button>
          </div>

          <div className="cowart-as-list">
            {annotations.length === 0 && (
              <div className="cowart-as-empty">当前页面暂无标注箭头</div>
            )}

            {annotations.map((a) => (
              <div
                key={String(a.id)}
                className={`cowart-as-item${a.resolved ? ' is-resolved' : ''}`}
              >
                <button
                  type="button"
                  className="cowart-as-item-main"
                  onClick={() => focusAnnotation(a.id)}
                  title="定位到该标注"
                >
                  <span className="cowart-as-index">{a.index}</span>
                  <span className="cowart-as-text">{a.text || '（无意见）'}</span>
                  <span
                    className={`cowart-as-badge${a.resolved ? ' resolved' : ''}`}
                  >
                    {a.resolved ? '已解决' : '待处理'}
                  </span>
                </button>
                <button
                  type="button"
                  className="cowart-as-toggle"
                  onClick={() => toggleResolve(a.id)}
                  title={a.resolved ? '标记为待处理' : '标记为已解决'}
                >
                  {a.resolved ? '标记待处理' : '标记已解决'}
                </button>
              </div>
            ))}
          </div>

          {hint && <div className="cowart-as-hint">{hint}</div>}
        </aside>
      )}
    </>,
    document.body,
  )
}
