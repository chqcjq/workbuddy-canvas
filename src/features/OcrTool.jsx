import { useCallback, useEffect, useState } from 'react'
import { useEditor, useValue, createShapeId, toRichText } from 'tldraw'
import Tesseract from 'tesseract.js'
import './OcrTool.css'

// P2: OCR / 图转文 —— 选中一张图片，提取其中文字并生成可编辑文本块。
// 用 tesseract.js 在浏览器本地识别（支持中英文），无需服务端密钥。
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

      const { data } = await Tesseract.recognize(src, 'chi_sim+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100))
        }
      })

      const text = (data.text || '').trim()
      if (!text) {
        setError('未识别到文字（可能是图片清晰度为题或不含文字）')
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
