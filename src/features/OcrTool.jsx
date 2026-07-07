import { useCallback, useEffect, useState } from 'react'
import { useEditor, useValue, createShapeId, toRichText } from 'tldraw'
import Tesseract from 'tesseract.js'
import './OcrTool.css'

// P2: OCR / 图转文 —— 选中一张图片，提取其中文字并生成可编辑文本块。
// 用 tesseract.js 在浏览器本地识别（支持中英文），无需服务端密钥。

// 把图片重绘到 canvas 做预处理，再交给 tesseract：
//  - 填白底：解决透明 PNG（AI 生成图常见）被当成黑色、文字被「吃掉」的问题
//  - 智能放大：小图 / 截图放大到 ~1600px 最长边，显著提升细小文字识别率
//  - 高质量采样 + 轻微对比增强：让边缘更清晰
// 返回 HTMLCanvasElement，直接喂给 Tesseract.recognize，避免 worker 跨域 / 缩放问题。
function preprocessForOcr(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const nw = img.naturalWidth || 1024
      const nh = img.naturalHeight || 1024
      const maxDim = Math.max(nw, nh)
      const target = 1600
      // 只放大、不缩小：原图已足够大时保持原分辨率，避免无谓的插值模糊
      const scale = maxDim < target ? target / maxDim : 1
      const w = Math.max(1, Math.round(nw * scale))
      const h = Math.max(1, Math.round(nh * scale))

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      // 白底铺满（覆盖透明区域）
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      // 轻微提升对比，让文字边缘更分明
      ctx.filter = 'contrast(1.15)'
      ctx.drawImage(img, 0, 0, w, h)
      ctx.filter = 'none'
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('图片加载失败，无法提取文字'))
    img.src = src
  })
}

export default function OcrTool() {
  const editor = useEditor()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  const selectedImage = useValue(
    'selected-image',
    () => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return null
      const shape = editor.getShape(ids[0])
      if (!shape || shape.type !== 'image') return null
      return shape
    },
    [editor]
  )

  const runOcr = useCallback(async () => {
    if (!selectedImage || busy) return
    setBusy(true)
    setError(null)
    setProgress(0)
    try {
      const assetId = selectedImage.props.assetId
      const asset = assetId ? editor.getAsset(assetId) : null
      const src = asset?.props?.src
      if (!src) throw new Error('无法读取图片源')

      // 预处理：白底 + 放大 + 对比增强，得到可直接识别的 canvas
      const canvas = await preprocessForOcr(src)

      const { data } = await Tesseract.recognize(canvas, 'chi_sim+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100))
        }
      })

      let text = (data.text || '').trim()
      // 去掉纯空白行，压缩连续空行，让落图文本更干净
      text = text
        .split('\n')
        .map((l) => l.replace(/\s+$/, ''))
        .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
        .join('\n')
        .trim()

      if (!text) {
        setError('未识别到文字（可能是图片清晰度不足或不含文字）')
        return
      }

      const b = editor.getShapePageBounds(selectedImage.id)
      const shapeId = createShapeId()
      editor.createShape({
        id: shapeId,
        type: 'text',
        x: b.maxX + 24,
        y: b.y,
        props: {
          richText: toRichText(text),
          size: 's',
          color: 'black'
        }
      })
      editor.setSelectedShapes([shapeId])
    } catch (err) {
      setError(`OCR 失败：${err.message || err}`)
    } finally {
      setBusy(false)
    }
  }, [selectedImage, busy, editor])

  useEffect(() => {
    if (!busy) setProgress(0)
  }, [busy])

  if (!selectedImage) return null

  return (
    <div className="cowart-ocr-bar" role="status">
      {!busy ? (
        <button className="cowart-ocr-btn" onClick={runOcr} type="button" title="提取图片中的文字">
          📷 提取文字
        </button>
      ) : (
        <div className="cowart-ocr-busy">
          <span className="cowart-ocr-spinner" />
          识别中 {progress}%
        </div>
      )}
      {error ? <div className="cowart-ocr-err">{error}</div> : null}
    </div>
  )
}
