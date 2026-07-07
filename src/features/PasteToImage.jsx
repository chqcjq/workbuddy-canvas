import { useEffect } from 'react'
import { useEditor, createShapeId } from 'tldraw'

// P0: 粘贴即落图 —— 把剪贴板里的图片直接落成 image shape 到视口中心。
// 贴合办公"截图 → 粘贴 → 标注"的高频路径。
export default function PasteToImage() {
  const editor = useEditor()

  useEffect(() => {
    const onPaste = (e) => {
      const ae = document.activeElement
      if (
        ae &&
        (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
      ) {
        return
      }

      const items = e.clipboardData?.items
      if (!items) return

      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
          const file = it.getAsFile()
          if (!file) continue
          e.preventDefault()
          const reader = new FileReader()
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              insertImageFromDataUrl(editor, reader.result)
            }
          }
          reader.readAsDataURL(file)
          return
        }
      }
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [editor])

  return null
}

async function insertImageFromDataUrl(editor, dataUrl) {
  const img = new Image()
  img.onload = () => {
    const w = img.naturalWidth || 512
    const h = img.naturalHeight || 512
    const maxDim = 640
    const scale = Math.min(maxDim / w, maxDim / h, 1)
    const sw = w * scale
    const sh = h * scale
    const center = editor.getViewportPageBounds().center
    const assetId = `asset:paste_${Date.now()}`
    const shapeId = createShapeId()

    editor.store.put([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: 'pasted',
          src: dataUrl,
          w,
          h,
          fileSize: dataUrl.length,
          mimeType: 'image/png',
          isAnimated: false
        },
        meta: {}
      },
      {
        id: shapeId,
        type: 'image',
        typeName: 'shape',
        x: center.x - sw / 2,
        y: center.y - sh / 2,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        parentId: editor.getCurrentPageId(),
        props: {
          w: sw,
          h: sh,
          assetId,
          playing: true,
          url: '',
          crop: null,
          flipX: false,
          flipY: false,
          altText: ''
        },
        meta: { cowartPastedImage: true },
        index: 'a0'
      }
    ])

    editor.setSelectedShapes([shapeId])
  }
  img.src = dataUrl
}
