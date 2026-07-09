import {
  ArrowDownToolbarItem,
  ArrowLeftToolbarItem,
  ArrowRightToolbarItem,
  ArrowToolbarItem,
  ArrowUpToolbarItem,
  AssetToolbarItem,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DefaultToolbar,
  DefaultColorStyle,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HeartToolbarItem,
  HexagonToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  OvalToolbarItem,
  RectangleToolbarItem,
  RhombusToolbarItem,
  SelectToolbarItem,
  StateNode,
  StarToolbarItem,
  TextToolbarItem,
  Tldraw,
  TldrawUiMenuToolItem,
  exportAs,
  TriangleToolbarItem,
  XBoxToolbarItem,
  createBindingId,
  createShapeId,
  onDragFromToolbarToCreateShape,
  startEditingShapeWithRichText,
  toRichText,
  useEditor,
  useValue
} from 'tldraw'
import { AllSelection } from '@tiptap/pm/state'
import 'tldraw/tldraw.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import annotationToolIconRaw from './assets/tool-comment.svg?raw'
import CowartFeatures from './features/index.jsx'
import {
  enqueueGenerationTask,
  setQueueExecutor,
  setQueueInserter,
  setQueueInserterAll,
  TaskQueuePanel
} from './features/TaskQueue.jsx'

const CANVAS_ENDPOINT = '/api/canvas'
const CANVAS_EVENTS_ENDPOINT = '/api/canvas-events'
const SELECTION_ENDPOINT = '/api/selection'
const VIEW_STATE_ENDPOINT = '/api/view-state'
const SELECTION_STATE_ELEMENT_ID = 'cowart-selection-state'
const AI_IMAGE_TOOL_ID = 'ai-image'
const AI_IMAGE_HOLDER_LABEL = 'AI 图片'
const AI_IMAGE_HOLDER_DEFAULT_W = 320
const AI_IMAGE_HOLDER_DEFAULT_H = 220
const IMAGE_PROVIDER_BANANA = 'banana'
const IMAGE_PROVIDER_IMAGE2 = 'image2'
const IMAGE_PROVIDER_NANO = 'nano'
const DEFAULT_IMAGE_PROVIDER = IMAGE_PROVIDER_BANANA
const IMAGE_PROVIDER_STORAGE_KEY = 'cowart-image-provider'
const IMAGE_API_CONFIG_STORAGE_KEY = 'cowart-image-api-config'
const COS_CONFIG_STORAGE_KEY = 'cowart-cos-config'
const COS_DEFAULT_BUCKET = 'zip-1301894149'
const COS_DEFAULT_REGION = 'ap-shanghai'
const COS_DEFAULT_DOMAIN = 'https://zip-1301894149.cos.ap-shanghai.myqcloud.com'
const IMAGE_PROVIDER_OPTIONS = [
  { id: IMAGE_PROVIDER_IMAGE2, label: 'Image2' },
  { id: IMAGE_PROVIDER_BANANA, label: 'Banana' }
]
const DEFAULT_IMAGE_API_BASE_URL = 'https://duomiapi.com'
// Per-model endpoint paths (appended to the shared API base URL).
// Users can customize these to match different aggregators' route layouts.
const DEFAULT_IMAGE2_PATH = '/v1/images/generations'
const DEFAULT_BANANA_PATH = '/api/gemini/nano-banana'
const ANNOTATION_TOOL_ID = 'cowart-annotation'
const ANNOTATION_TOOL_LABEL = '标注'
const ANNOTATION_DEFAULT_COLOR = 'red'
const ANNOTATION_MIN_LENGTH = 8
const ANNOTATION_BEND_RATIO = 0.12
const ANNOTATION_MIN_BEND = 16
const ANNOTATION_MAX_BEND = 48
const ANNOTATION_LABEL_POSITION = 0
const ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS = 8
const ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS = 4
const annotationToolIconSvg = annotationToolIconRaw.replaceAll('black', 'currentColor')
const annotationToolIcon = (
  <div
    className="cowart-annotation-tool-icon"
    dangerouslySetInnerHTML={{ __html: annotationToolIconSvg }}
  />
)

function isCanvasSnapshot(value) {
  return value && typeof value === 'object' && value.store && value.schema
}

function recordsAreEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function storeChangedSinceSnapshot(editor, baselineStore) {
  const currentStore = editor.store.getStoreSnapshot().store
  const baselineIds = new Set(Object.keys(baselineStore))

  for (const [id, baselineRecord] of Object.entries(baselineStore)) {
    const currentRecord = currentStore[id]
    if (!currentRecord) return true
    if (!recordsAreEqual(currentRecord, baselineRecord)) return true
  }

  for (const id of Object.keys(currentStore)) {
    if (!baselineIds.has(id)) return true
  }

  return false
}

function applyRemoteCanvasSnapshot(editor, snapshot, { preserveLocalChanges = false } = {}) {
  if (!isCanvasSnapshot(snapshot)) return 0

  const migratedSnapshot = editor.store.migrateSnapshot(snapshot)
  const recordsToPut = Object.values(migratedSnapshot.store).filter((record) => {
    const localRecord = editor.store.get(record.id)
    if (!localRecord) return true
    if (preserveLocalChanges) return false
    return !recordsAreEqual(localRecord, record)
  })

  if (recordsToPut.length === 0) return 0

  editor.store.mergeRemoteChanges(() => {
    editor.store.put(recordsToPut)
  })

  return recordsToPut.length
}

function isValidImageProvider(value) {
  return (
    value === IMAGE_PROVIDER_BANANA ||
    value === IMAGE_PROVIDER_IMAGE2 ||
    value === IMAGE_PROVIDER_NANO
  )
}

function getStoredImageProvider() {
  try {
    const value = window.localStorage.getItem(IMAGE_PROVIDER_STORAGE_KEY)
    // Backward-compat: the old "Banana Pro" (nano) option was merged into
    // "Banana", which now requests the pro model by default.
    if (value === IMAGE_PROVIDER_NANO) return IMAGE_PROVIDER_BANANA
    return isValidImageProvider(value) ? value : DEFAULT_IMAGE_PROVIDER
  } catch {
    return DEFAULT_IMAGE_PROVIDER
  }
}

function setStoredImageProvider(provider) {
  try {
    window.localStorage.setItem(IMAGE_PROVIDER_STORAGE_KEY, provider)
  } catch {
    // Ignore storage failures; selected holder metadata remains authoritative.
  }
}

function normalizeApiPath(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const path = value.trim()
  return path.startsWith('/') ? path : `/${path}`
}

function getStoredImageApiConfig() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IMAGE_API_CONFIG_STORAGE_KEY) ?? '{}')
    // Backward-compat: prefer the new apiBaseUrl; fall back to legacy per-provider URLs.
    const legacyBase =
      (typeof parsed.image2ApiBaseUrl === 'string' && parsed.image2ApiBaseUrl.trim()
        ? parsed.image2ApiBaseUrl.trim().replace(/\/+$/, '')
        : null) ||
      (typeof parsed.bananaApiBaseUrl === 'string' && parsed.bananaApiBaseUrl.trim()
        ? parsed.bananaApiBaseUrl.trim().replace(/\/+$/, '')
        : null)
    const apiBaseUrl =
      (typeof parsed.apiBaseUrl === 'string' && parsed.apiBaseUrl.trim()
        ? parsed.apiBaseUrl.trim().replace(/\/+$/, '')
        : null) || legacyBase || DEFAULT_IMAGE_API_BASE_URL
    return {
      apiBaseUrl,
      image2Path: normalizeApiPath(parsed.image2Path, DEFAULT_IMAGE2_PATH),
      bananaPath: normalizeApiPath(parsed.bananaPath, DEFAULT_BANANA_PATH),
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : ''
    }
  } catch {
    return {
      apiBaseUrl: DEFAULT_IMAGE_API_BASE_URL,
      image2Path: DEFAULT_IMAGE2_PATH,
      bananaPath: DEFAULT_BANANA_PATH,
      apiKey: ''
    }
  }
}

function setStoredImageApiConfig(config) {
  window.localStorage.setItem(
    IMAGE_API_CONFIG_STORAGE_KEY,
    JSON.stringify({
      apiBaseUrl: (config.apiBaseUrl || DEFAULT_IMAGE_API_BASE_URL).trim().replace(/\/+$/, ''),
      image2Path: normalizeApiPath(config.image2Path, DEFAULT_IMAGE2_PATH),
      bananaPath: normalizeApiPath(config.bananaPath, DEFAULT_BANANA_PATH),
      apiKey: config.apiKey || ''
    })
  )
  window.dispatchEvent(new CustomEvent('cowart-image-api-config-change'))
}

function getStoredCosConfig() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COS_CONFIG_STORAGE_KEY) ?? '{}')
    return {
      secretId: typeof parsed.secretId === 'string' ? parsed.secretId : '',
      secretKey: typeof parsed.secretKey === 'string' ? parsed.secretKey : '',
      bucket: typeof parsed.bucket === 'string' && parsed.bucket.trim() ? parsed.bucket.trim() : COS_DEFAULT_BUCKET,
      region: typeof parsed.region === 'string' && parsed.region.trim() ? parsed.region.trim() : COS_DEFAULT_REGION,
      domain: typeof parsed.domain === 'string' && parsed.domain.trim() ? parsed.domain.trim().replace(/\/+$/, '') : COS_DEFAULT_DOMAIN
    }
  } catch {
    return { secretId: '', secretKey: '', bucket: COS_DEFAULT_BUCKET, region: COS_DEFAULT_REGION, domain: COS_DEFAULT_DOMAIN }
  }
}

function setStoredCosConfig(config) {
  window.localStorage.setItem(
    COS_CONFIG_STORAGE_KEY,
    JSON.stringify({
      secretId: config.secretId || '',
      secretKey: config.secretKey || '',
      bucket: config.bucket || COS_DEFAULT_BUCKET,
      region: config.region || COS_DEFAULT_REGION,
      domain: (config.domain || COS_DEFAULT_DOMAIN).trim().replace(/\/+$/, '')
    })
  )
  window.dispatchEvent(new CustomEvent('cowart-image-api-config-change'))
}

function getAiImageHolderMeta(provider = getStoredImageProvider()) {
  return {
    cowartAiImageHolder: true,
    cowartAiImageHolderVersion: 1,
    cowartImageProvider: isValidImageProvider(provider) ? provider : DEFAULT_IMAGE_PROVIDER
  }
}

function createAiImageHolderShape(editor, id, shapeOverrides = {}) {
  const scale = editor.getResizeScaleFactor()
  const { meta, props, ...shapeRecordOverrides } = shapeOverrides
  const { scale: _scale, ...frameProps } = props ?? {}

  return editor.createShape({
    ...shapeRecordOverrides,
    id,
    type: 'frame',
    meta: {
      ...getAiImageHolderMeta(),
      ...meta
    },
    props: {
      w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
      h: AI_IMAGE_HOLDER_DEFAULT_H * scale,
      name: AI_IMAGE_HOLDER_LABEL,
      color: 'blue',
      ...frameProps
    }
  })
}

function createAiImageHolderAtViewportCenter(editor) {
  const scale = editor.getResizeScaleFactor()
  const w = AI_IMAGE_HOLDER_DEFAULT_W * scale
  const h = AI_IMAGE_HOLDER_DEFAULT_H * scale
  const center = editor.getViewportPageBounds().center
  const id = createShapeId()

  createAiImageHolderShape(editor, id, {
    x: center.x - w / 2,
    y: center.y - h / 2,
    props: { w, h }
  })
  editor.select(id)
  editor.setCurrentTool('select.idle')
}

function startEditingAnnotationArrowLabel(editor, arrowId) {
  const shape = editor.getShape(arrowId)
  if (!shape || !editor.canEditShape(shape)) {
    return
  }

  editor.select(arrowId)
  startEditingShapeWithRichText(editor, arrowId, { selectAll: true })
  pinAnnotationArrowLabelPosition(editor, arrowId)
  editor.getCurrentTool().setCurrentToolIdMask(ANNOTATION_TOOL_ID)
  selectAnnotationTextWhenReady(editor, arrowId)
}

function pinAnnotationArrowLabelPosition(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const shape = editor.getShape(arrowId)
    if (!shape || shape.meta?.cowartAnnotationArrow !== true) return
    if (shape.props.labelPosition !== ANNOTATION_LABEL_POSITION) {
      editor.updateShapes([
        {
          id: arrowId,
          type: 'arrow',
          props: {
            labelPosition: ANNOTATION_LABEL_POSITION
          }
        }
      ])
    }

    if (attempt < 2 && editor.getEditingShapeId() === arrowId) {
      pinAnnotationArrowLabelPosition(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function unlockGlobalToolLock(editor) {
  if (!editor.getInstanceState().isToolLocked) return
  editor.updateInstanceState({ isToolLocked: false })
}

function selectAnnotationTextWhenReady(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const editingShapeId = editor.getEditingShapeId()
    if (editingShapeId !== arrowId) return

    const textEditor = editor.getRichTextEditor()
    if (textEditor) {
      textEditor.view.focus()
      textEditor.view.dispatch(
        textEditor.state.tr.setSelection(new AllSelection(textEditor.state.doc)).scrollIntoView()
      )
    }

    const didSelectText = selectAnnotationTextRange(editor, arrowId)
    if (didSelectText && attempt >= ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS) {
      return
    }

    if (attempt < ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS) {
      selectAnnotationTextWhenReady(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function selectAnnotationTextRange(editor, arrowId) {
  const doc = editor.getContainerDocument()
  const shapeElement = Array.from(doc.querySelectorAll('[data-shape-id]')).find(
    (element) => element.getAttribute('data-shape-id') === arrowId
  )
  const editable = shapeElement?.querySelector('[contenteditable="true"]')

  if (!editable || typeof editable.focus !== 'function') {
    return false
  }

  editable.focus()

  const textNodes = getTextNodes(editable)
  if (textNodes.length === 0) {
    return doc.activeElement === editable || editable.contains(doc.activeElement)
  }

  const range = doc.createRange()
  const firstTextNode = textNodes[0]
  const lastTextNode = textNodes[textNodes.length - 1]
  range.setStart(firstTextNode, 0)
  range.setEnd(lastTextNode, lastTextNode.textContent?.length ?? 0)

  const selection = doc.getSelection()
  if (!selection) return false

  selection.removeAllRanges()
  selection.addRange(range)
  doc.execCommand?.('selectAll')

  return selection.rangeCount > 0 && selection.toString() === editable.textContent
}

function getTextNodes(node, textNodes = []) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent) {
      textNodes.push(child)
    } else {
      getTextNodes(child, textNodes)
    }
  }

  return textNodes
}

function getDefaultAnnotationArrowBend(dx, dy, scale) {
  const length = Math.hypot(dx, dy)
  if (length === 0) return 0

  const bend = Math.min(
    Math.max(length * ANNOTATION_BEND_RATIO, ANNOTATION_MIN_BEND * scale),
    ANNOTATION_MAX_BEND * scale
  )

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? -bend : bend
  }

  return bend
}

function getAnnotationColor(editor) {
  const color = editor.getStyleForNextShape(DefaultColorStyle)
  return color === DefaultColorStyle.defaultValue ? ANNOTATION_DEFAULT_COLOR : color
}

class CowartAnnotationTool extends StateNode {
  static id = ANNOTATION_TOOL_ID
  static initial = 'idle'

  static children() {
    return [CowartAnnotationIdle, CowartAnnotationPointing]
  }

  onEnter() {
    unlockGlobalToolLock(this.editor)
  }
}

class CowartAnnotationIdle extends StateNode {
  static id = 'idle'

  onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  onPointerDown(info) {
    this.parent.transition('pointing', info)
  }

  onCancel() {
    this.editor.setCurrentTool('select')
  }
}

class CowartAnnotationPointing extends StateNode {
  static id = 'pointing'

  arrowId = null
  markId = ''
  origin = null

  onEnter() {
    const origin = this.editor.inputs.getOriginPagePoint()
    const scale = this.editor.getResizeScaleFactor()
    const color = getAnnotationColor(this.editor)
    const arrowId = createShapeId()

    this.arrowId = arrowId
    this.origin = { x: origin.x, y: origin.y }
    this.markId = this.editor.markHistoryStoppingPoint(`creating_annotation:${arrowId}`)

    this.editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: origin.x,
      y: origin.y,
      meta: {
        cowartAnnotationArrow: true
      },
      props: {
        kind: 'arc',
        dash: 'draw',
        size: 'm',
        fill: 'none',
        color,
        labelColor: color,
        bend: 0,
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
        richText: toRichText(''),
        labelPosition: ANNOTATION_LABEL_POSITION,
        font: 'draw',
        scale
      }
    })
  }

  onPointerMove() {
    this.updateArrowEnd()
  }

  onPointerUp() {
    this.complete()
  }

  onCancel() {
    this.cancel()
  }

  onInterrupt() {
    this.cancel()
  }

  updateArrowEnd() {
    if (!this.arrowId || !this.origin) return

    const point = this.editor.inputs.getCurrentPagePoint()
    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          end: {
            x: point.x - this.origin.x,
            y: point.y - this.origin.y
          }
        }
      }
    ])
  }

  complete() {
    if (!this.arrowId || !this.origin) {
      this.editor.setCurrentTool(ANNOTATION_TOOL_ID)
      return
    }

    this.updateArrowEnd()

    const point = this.editor.inputs.getCurrentPagePoint()
    const dx = point.x - this.origin.x
    const dy = point.y - this.origin.y
    const length = Math.hypot(dx, dy)

    if (length < ANNOTATION_MIN_LENGTH / this.editor.getZoomLevel()) {
      this.editor.bailToMark(this.markId)
      this.parent.transition('idle')
      return
    }

    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          bend: getDefaultAnnotationArrowBend(dx, dy, this.editor.getResizeScaleFactor())
        }
      }
    ])

    startEditingAnnotationArrowLabel(this.editor, this.arrowId)
  }

  cancel() {
    if (this.arrowId) {
      this.editor.bailToMark(this.markId)
    }
    this.parent.transition('idle')
  }
}

const cowartUiOverrides = {
  translations: {
    en: {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.cowart-annotation': ANNOTATION_TOOL_LABEL
    },
    'zh-cn': {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.cowart-annotation': ANNOTATION_TOOL_LABEL
    }
  },
  tools(editor, tools) {
    return {
      ...tools,
      arrow: {
        ...tools.arrow,
        kbd: undefined
      },
      [AI_IMAGE_TOOL_ID]: {
        id: AI_IMAGE_TOOL_ID,
        label: 'tool.ai-image',
        icon: 'tool-frame',
        kbd: 'a',
        onSelect() {
          createAiImageHolderAtViewportCenter(editor)
        },
        onDragStart(source, info) {
          const scale = editor.getResizeScaleFactor()
          onDragFromToolbarToCreateShape(editor, info, {
            createShape: (id) =>
              createAiImageHolderShape(editor, id, {
                props: {
                  w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
                  h: AI_IMAGE_HOLDER_DEFAULT_H * scale
                }
              }),
            onDragEnd: (id) => editor.select(id)
          })
        },
        meta: {
          cowartTool: 'ai-image-holder'
        }
      },
      [ANNOTATION_TOOL_ID]: {
        id: ANNOTATION_TOOL_ID,
        label: 'tool.cowart-annotation',
        icon: annotationToolIcon,
        kbd: 'c',
        onSelect() {
          unlockGlobalToolLock(editor)
          editor.setCurrentTool(ANNOTATION_TOOL_ID)
        },
        meta: {
          cowartTool: 'annotation'
        }
      }
    }
  }
}

const cowartComponents = {
  Toolbar: CowartToolbar
}

function CowartToolbarItem({ toolId }) {
  const editor = useEditor()
  const isSelected = useValue(
    `is ${toolId} selected`,
    () => editor.getCurrentToolId() === toolId,
    [editor, toolId]
  )

  return <TldrawUiMenuToolItem toolId={toolId} isSelected={isSelected} />
}

function CowartAnnotationToolbarItem() {
  const editor = useEditor()
  const isSelected = useValue(
    'is annotation selected',
    () => editor.getCurrentToolId() === ANNOTATION_TOOL_ID,
    [editor]
  )

  return (
    <button
      aria-label={ANNOTATION_TOOL_LABEL}
      aria-pressed={isSelected ? 'true' : 'false'}
      className="tlui-button tlui-button__tool cowart-annotation-toolbar-button"
      data-testid={`tools.${ANNOTATION_TOOL_ID}`}
      data-value={ANNOTATION_TOOL_ID}
      draggable={false}
      onClick={() => {
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      onTouchStart={(event) => {
        event.preventDefault()
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      title={ANNOTATION_TOOL_LABEL}
      type="button"
    >
      {annotationToolIcon}
      <span className="cowart-annotation-toolbar-label" draggable={false}>
        {ANNOTATION_TOOL_LABEL}
      </span>
    </button>
  )
}

function CowartToolbarDivider() {
  return <div aria-orientation="vertical" className="cowart-toolbar-divider" role="separator" />
}

function CowartImageProviderSelector() {
  const editor = useEditor()
  const selectedProvider = useValue(
    'selected Cowart image provider',
    () => {
      const holder = editor
        .getSelectedShapes()
        .find((shape) => shape?.meta?.cowartAiImageHolder === true && isValidImageProvider(shape.meta?.cowartImageProvider))
      return holder?.meta?.cowartImageProvider ?? getStoredImageProvider()
    },
    [editor]
  )
  const [provider, setProvider] = useState(selectedProvider)

  useEffect(() => {
    setProvider(selectedProvider)
  }, [selectedProvider])

  const chooseProvider = useCallback(
    (nextProvider) => {
      if (!isValidImageProvider(nextProvider)) return

      setStoredImageProvider(nextProvider)
      setProvider(nextProvider)

      const selectedHolders = editor
        .getSelectedShapes()
        .filter((shape) => shape?.meta?.cowartAiImageHolder === true)

      if (selectedHolders.length > 0) {
        editor.updateShapes(
          selectedHolders.map((shape) => ({
            id: shape.id,
            type: shape.type,
            meta: {
              ...shape.meta,
              cowartImageProvider: nextProvider
            }
          }))
        )
      }
    },
    [editor]
  )

  return (
    <label className="cowart-image-provider-selector" title="生图模型（单选）">
      <span className="cowart-image-provider-label">生图模型</span>
      <select
        className="cowart-image-provider-select"
        value={provider}
        onChange={(e) => chooseProvider(e.target.value)}
        aria-label="生图模型"
      >
        {IMAGE_PROVIDER_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function CowartImageApiConfigButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_IMAGE_API_BASE_URL)
  const [image2Path, setImage2Path] = useState(DEFAULT_IMAGE2_PATH)
  const [bananaPath, setBananaPath] = useState(DEFAULT_BANANA_PATH)
  const [apiKey, setApiKey] = useState('')
  const [cosSecretId, setCosSecretId] = useState('')
  const [cosSecretKey, setCosSecretKey] = useState('')
  const [cosBucket, setCosBucket] = useState(COS_DEFAULT_BUCKET)
  const [cosRegion, setCosRegion] = useState(COS_DEFAULT_REGION)
  const [cosDomain, setCosDomain] = useState(COS_DEFAULT_DOMAIN)

  useEffect(() => {
    const config = getStoredImageApiConfig()
    setApiBaseUrl(config.apiBaseUrl)
    setImage2Path(config.image2Path)
    setBananaPath(config.bananaPath)
    setApiKey(config.apiKey)
    const cos = getStoredCosConfig()
    setCosSecretId(cos.secretId)
    setCosSecretKey(cos.secretKey)
    setCosBucket(cos.bucket)
    setCosRegion(cos.region)
    setCosDomain(cos.domain)
  }, [isOpen])

  const saveConfig = useCallback(() => {
    setStoredImageApiConfig({ apiBaseUrl, image2Path, bananaPath, apiKey })
    setStoredCosConfig({ secretId: cosSecretId, secretKey: cosSecretKey, bucket: cosBucket, region: cosRegion, domain: cosDomain })
    setIsOpen(false)
  }, [apiBaseUrl, image2Path, bananaPath, apiKey, cosSecretId, cosSecretKey, cosBucket, cosRegion, cosDomain])

  return (
    <div className="cowart-api-config">
      <button
        className="cowart-api-config-button"
        onClick={() => setIsOpen((value) => !value)}
        title="配置 API 与图床"
        type="button"
      >
        <span>配置</span>
      </button>
      {isOpen ? createPortal(
        <div className="cowart-api-config-popover" role="dialog" aria-label="API 与图床配置">
          <div className="cowart-api-config-section-title">AI 生图 API</div>
          <label className="cowart-api-config-field">
            <span>API 请求 URL</span>
            <input
              autoComplete="off"
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder={DEFAULT_IMAGE_API_BASE_URL}
              spellCheck={false}
              type="url"
              value={apiBaseUrl}
            />
          </label>
          <label className="cowart-api-config-field">
            <span>Image2 URL 参数</span>
            <input
              autoComplete="off"
              onChange={(event) => setImage2Path(event.target.value)}
              placeholder={DEFAULT_IMAGE2_PATH}
              spellCheck={false}
              type="text"
              value={image2Path}
            />
          </label>
          <label className="cowart-api-config-field">
            <span>Banana Pro URL 参数</span>
            <input
              autoComplete="off"
              onChange={(event) => setBananaPath(event.target.value)}
              placeholder={DEFAULT_BANANA_PATH}
              spellCheck={false}
              type="text"
              value={bananaPath}
            />
          </label>
          <label className="cowart-api-config-field">
            <span>API 密钥</span>
            <input
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Authorization key"
              spellCheck={false}
              type="password"
              value={apiKey}
            />
          </label>
          <div className="cowart-api-config-section-title">图床（腾讯 COS）</div>
          <label className="cowart-api-config-field">
            <span>SecretId</span>
            <input
              autoComplete="off"
              onChange={(event) => setCosSecretId(event.target.value)}
              placeholder="腾讯云 SecretId"
              spellCheck={false}
              type="text"
              value={cosSecretId}
            />
          </label>
          <label className="cowart-api-config-field">
            <span>SecretKey</span>
            <input
              autoComplete="off"
              onChange={(event) => setCosSecretKey(event.target.value)}
              placeholder="腾讯云 SecretKey"
              spellCheck={false}
              type="password"
              value={cosSecretKey}
            />
          </label>
          <label className="cowart-api-config-field">
            <span>Bucket（存储桶）</span>
            <input
              autoComplete="off"
              onChange={(event) => setCosBucket(event.target.value)}
              placeholder={COS_DEFAULT_BUCKET}
              spellCheck={false}
              type="text"
              value={cosBucket}
            />
          </label>
          <label className="cowart-api-config-field">
            <span>Region（地域）</span>
            <input
              autoComplete="off"
              onChange={(event) => setCosRegion(event.target.value)}
              placeholder={COS_DEFAULT_REGION}
              spellCheck={false}
              type="text"
              value={cosRegion}
            />
          </label>
          <label className="cowart-api-config-field">
            <span>Domain（访问域名）</span>
            <input
              autoComplete="off"
              onChange={(event) => setCosDomain(event.target.value)}
              placeholder={COS_DEFAULT_DOMAIN}
              spellCheck={false}
              type="url"
              value={cosDomain}
            />
          </label>
          <div className="cowart-api-config-actions">
            <button onClick={() => setIsOpen(false)} type="button">
              取消
            </button>
            <button data-primary="true" onClick={saveConfig} type="button">
              保存
            </button>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  )
}

function CowartRegenerateButton() {
  const editor = useEditor()
  const [isOpen, setIsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState(null)
  const [count, setCount] = useState(1)
  const [gen, setGen] = useState(() => defaultGenState(getStoredImageProvider()))

  const selectedImage = useValue(
    'selected-image-shape',
    () => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return null
      const shape = editor.getShape(ids[0])
      if (!shape || shape.type !== 'image') return null
      const asset = shape.props?.assetId ? editor.getAsset(shape.props.assetId) : null
      return { shape, asset }
    },
    [editor]
  )

  // Submit to the shared generation queue (fire-and-forget, shown in panel)
  const handleRegenerate = useCallback(() => {
    if (!selectedImage || !prompt.trim()) return

    const refShape = selectedImage.shape
    const refAssetSrc = selectedImage.asset?.props?.src ?? null
    const promptText = prompt.trim()
    const provider = getStoredImageProvider()
    const providerLabel = IMAGE_PROVIDER_OPTIONS.find((o) => o.id === provider)?.label || provider
    const genParams = buildGenParams(provider, gen)
    const pageId = editor.getCurrentPageId()

    const res = enqueueGenerationTask({
      type: 'image',
      prompt: promptText,
      provider,
      providerLabel,
      genParams,
      referenceAssetSrc: refAssetSrc,
      referenceShapeId: refShape.id,
      anchorShapeId: null,
      count,
      pageId
    })

    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setIsOpen(false)
  }, [selectedImage, prompt, gen, editor, count])

  if (!selectedImage) return null

  return (
    <div className="cowart-regenerate">
      <button
        className="cowart-regenerate-button"
        onClick={() => { setIsOpen(true); setError(null); setPrompt(''); setGen(defaultGenState(getStoredImageProvider())) }}
        title="用选中图片作为参考，重新生成（可批量加入队列）"
        type="button"
      >
        <span>🔄 重生成</span>
      </button>
      {isOpen ? createPortal(
        <div className="cowart-regenerate-modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="cowart-regenerate-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="cowart-regenerate-modal-header">
              <span>重生成图片</span>
              <button className="cowart-regenerate-close" onClick={() => setIsOpen(false)}>×</button>
            </div>
            <div className="cowart-regenerate-modal-body">
              <div className="cowart-regenerate-reference">
                <img
                  src={selectedImage.asset?.props?.src}
                  alt="reference"
                  style={{ maxWidth: 120, maxHeight: 80, borderRadius: 4, border: '1px solid #d1d5db' }}
                />
                <span>参考图: {selectedImage.asset?.props?.name ?? 'unknown'}</span>
              </div>
              <textarea
                className="cowart-regenerate-prompt"
                placeholder="输入提示词，描述你想要生成的新图片…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                autoFocus
              />
              <label className="cowart-textgen-size-field">
                <span>数量</span>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n} 张</option>
                  ))}
                </select>
              </label>
              {error ? (
                <div className="cowart-regenerate-error">{error}</div>
              ) : null}
            </div>
          <div className="cowart-regenerate-modal-footer">
            <button onClick={() => setIsOpen(false)} type="button">
              取消
            </button>
            <button
              data-primary="true"
              onClick={handleRegenerate}
              type="button"
              disabled={!prompt.trim()}
              title="加入生成队列（最多 10 个）"
            >
              加入队列
            </button>
          </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared text-to-image (no reference image required)
// ---------------------------------------------------------------------------
const TEXTGEN_OPEN_EVENT = 'cowart-open-textgen'

// Per-model size / quality parameter schema.
// image2  → size field (auto / fixed / custom WxH, 16-aligned)
// banana  → aspect_ratio + image_size (requests the pro model by default)
// nano    → alias kept for backward-compat (maps to banana/pro)
const GEN_MODEL_SCHEMAS = {
  image2: {
    key: 'image2',
    label: 'Image2',
    sizeMode: 'size',
    sizeOptions: [
      { value: 'auto', label: 'auto（模型自动决定）' },
      { value: '1024x1024', label: '1024×1024 正方形' },
      { value: '1792x1024', label: '1792×1024 横版' },
      { value: '1024x1792', label: '1024×1792 竖版' },
      { value: '__custom__', label: '自定义宽×高（16 整除）' }
    ],
    defaultSize: 'auto'
  },
  banana: {
    key: 'banana',
    label: 'Banana',
    sizeMode: 'aspect',
    // "Banana" now requests the pro model by default, so it exposes the
    // full aspect-ratio set and the 4K image-size selector (formerly the
    // separate "Banana Pro" option).
    aspectOptions: [
      { value: 'auto', label: 'auto（自适应）' },
      { value: '1:1', label: '1:1 正方形' },
      { value: '2:3', label: '2:3 竖版' },
      { value: '3:2', label: '3:2 横版' },
      { value: '3:4', label: '3:4' },
      { value: '4:3', label: '4:3' },
      { value: '4:5', label: '4:5' },
      { value: '5:4', label: '5:4' },
      { value: '9:16', label: '9:16 竖版' },
      { value: '16:9', label: '16:9 横版' },
      { value: '21:9', label: '21:9 宽屏' }
    ],
    defaultAspect: 'auto',
    imageSizeOptions: [
      { value: '1K', label: '1K' },
      { value: '2K', label: '2K' },
      { value: '4K', label: '4K（默认）' }
    ],
    defaultImageSize: '4K'
  }
}

// Round to a multiple of 16 and clamp to a safe range for image models.
function clampTo16(n) {
  let v = Math.round(Number(n))
  if (!isFinite(v) || v < 16) v = 16
  if (v > 2048) v = 2048
  v = Math.floor(v / 16) * 16
  return v
}

function defaultGenState(provider) {
  const s = GEN_MODEL_SCHEMAS[provider] || GEN_MODEL_SCHEMAS.image2
  return {
    sizeSel: s.defaultSize || 'auto',
    customW: 1024,
    customH: 1024,
    aspectRatio: s.defaultAspect || '1:1',
    quality: s.defaultQuality || 'high',
    imageSize: s.defaultImageSize || '4K'
  }
}

function buildGenParams(provider, st) {
  if (provider === 'image2') {
    let size = st.sizeSel
    if (size === '__custom__') {
      size = `${clampTo16(st.customW)}x${clampTo16(st.customH)}`
    }
    return { size }
  }
  // "banana" requests the pro model by default → aspect_ratio + image_size.
  if (provider === 'banana' || provider === 'nano') {
    return { aspect_ratio: st.aspectRatio, image_size: st.imageSize }
  }
  return {}
}

// Shared size / quality selector. Renders different controls per selected model.
function GenSizeControl({ provider, gen, setGen }) {
  const schema = GEN_MODEL_SCHEMAS[provider] || GEN_MODEL_SCHEMAS.image2
  if (!schema) return null

  return (
    <>
      {schema.sizeMode === 'size' && (
        <label className="cowart-textgen-size-field">
          <span>尺寸</span>
          <select
            value={gen.sizeSel}
            onChange={(e) => setGen((g) => ({ ...g, sizeSel: e.target.value }))}
          >
            {schema.sizeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
      {schema.sizeMode === 'size' && gen.sizeSel === '__custom__' && (
        <div className="cowart-textgen-custom-size">
          <input
            type="number"
            min={16}
            step={16}
            value={gen.customW}
            onChange={(e) => setGen((g) => ({ ...g, customW: e.target.value }))}
            aria-label="自定义宽"
          />
          <span>×</span>
          <input
            type="number"
            min={16}
            step={16}
            value={gen.customH}
            onChange={(e) => setGen((g) => ({ ...g, customH: e.target.value }))}
            aria-label="自定义高"
          />
          <span className="cowart-textgen-custom-hint">需被 16 整除，≤2048</span>
        </div>
      )}
      {schema.sizeMode === 'aspect' && (
        <label className="cowart-textgen-size-field">
          <span>比例</span>
          <select
            value={gen.aspectRatio}
            onChange={(e) => setGen((g) => ({ ...g, aspectRatio: e.target.value }))}
          >
            {schema.aspectOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
      {provider === 'banana' && (
        <label className="cowart-textgen-size-field">
          <span>分辨率</span>
          <select
            value={gen.imageSize}
            onChange={(e) => setGen((g) => ({ ...g, imageSize: e.target.value }))}
          >
            {schema.imageSizeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}

function openTextGen(anchorShapeId) {
  window.dispatchEvent(new CustomEvent(TEXTGEN_OPEN_EVENT, { detail: { anchorShapeId: anchorShapeId || null } }))
}

// Draw a labeled arrow connecting a newly generated image back to the
// reference image it was derived from, so the relationship is visible on the
// canvas. The arrow is bound to both shapes and follows them when moved.
function connectReferenceArrow(editor, referenceShapeId, generatedShapeId) {
  if (!referenceShapeId || !generatedShapeId) return

  const refShape = editor.getShape(referenceShapeId)
  const genShape = editor.getShape(generatedShapeId)
  if (!refShape || !genShape) return

  const refCx = refShape.x + (refShape.props.w || 0) / 2
  const refCy = refShape.y + (refShape.props.h || 0) / 2
  const genCx = genShape.x + (genShape.props.w || 0) / 2
  const genCy = genShape.y + (genShape.props.h || 0) / 2
  const dx = genCx - refCx
  const dy = genCy - refCy

  let refAnchor
  let genAnchor
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      refAnchor = { x: 1, y: 0.5 }
      genAnchor = { x: 0, y: 0.5 }
    } else {
      refAnchor = { x: 0, y: 0.5 }
      genAnchor = { x: 1, y: 0.5 }
    }
  } else if (dy >= 0) {
    refAnchor = { x: 0.5, y: 1 }
    genAnchor = { x: 0.5, y: 0 }
  } else {
    refAnchor = { x: 0.5, y: 0 }
    genAnchor = { x: 0.5, y: 1 }
  }

  const arrowId = createShapeId()
  editor.createShape({
    id: arrowId,
    type: 'arrow',
    x: refCx,
    y: refCy,
    meta: { cowartReferenceArrow: true },
    props: {
      kind: 'arc',
      dash: 'dashed',
      size: 's',
      fill: 'none',
      color: 'blue',
      labelColor: 'blue',
      bend: 0,
      start: { x: 0, y: 0 },
      end: { x: genCx - refCx, y: genCy - refCy },
      arrowheadStart: 'none',
      arrowheadEnd: 'arrow',
      richText: toRichText('参考图'),
      labelPosition: 0.5,
      font: 'sans',
      scale: 1
    }
  })

  editor.createBindings([
    {
      id: createBindingId(),
      type: 'arrow',
      fromId: arrowId,
      toId: referenceShapeId,
      props: {
        terminal: 'start',
        normalizedAnchor: refAnchor,
        isExact: false,
        isPrecise: false,
        snap: 'none'
      },
      meta: {}
    },
    {
      id: createBindingId(),
      type: 'arrow',
      fromId: arrowId,
      toId: generatedShapeId,
      props: {
        terminal: 'end',
        normalizedAnchor: genAnchor,
        isExact: false,
        isPrecise: false,
        snap: 'none'
      },
      meta: {}
    }
  ])
}

// Insert a generated image result onto the canvas.
// If anchorShapeId points to an existing AI-image holder, the generated image
// replaces the holder (fit inside its bounds). Otherwise it is dropped at the
// center of the current viewport. When referenceShapeId is provided, a labeled
// arrow is drawn back to the reference image.
async function insertGeneratedImageFromResult(editor, result, anchorShapeId, promptText, referenceShapeId) {
  const natural = await new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 512, h: img.naturalHeight || 512 })
    img.onerror = () => resolve({ w: 512, h: 512 })
    img.src = result.src
  })

  let x
  let y
  let w
  let h
  const anchor = anchorShapeId ? editor.getShape(anchorShapeId) : null
  if (anchor && anchor.meta?.cowartAiImageHolder === true) {
    const scale = Math.min(anchor.props.w / natural.w, anchor.props.h / natural.h)
    w = natural.w * scale
    h = natural.h * scale
    x = anchor.props.x + (anchor.props.w - w) / 2
    y = anchor.props.y + (anchor.props.h - h) / 2
    editor.deleteShapes([anchor.id])
  } else {
    const maxDim = 640
    const scale = Math.min(maxDim / natural.w, maxDim / natural.h, 1)
    w = natural.w * scale
    h = natural.h * scale
    const center = editor.getViewportPageBounds().center
    x = center.x - w / 2
    y = center.y - h / 2
  }

  const assetId = `asset:gen_${Date.now()}`
  const shapeId = createShapeId()
  const newAsset = {
    id: assetId,
    type: 'image',
    typeName: 'asset',
    props: {
      name: result.fileName,
      src: result.src,
      w,
      h,
      fileSize: result.fileSize,
      mimeType: result.mimeType,
      isAnimated: false
    },
    meta: {}
  }
  const newShape = {
    id: shapeId,
    type: 'image',
    typeName: 'shape',
    x,
    y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    parentId: anchor && anchor.parentId ? anchor.parentId : editor.getCurrentPageId(),
    props: {
      w,
      h,
      assetId,
      playing: true,
      url: '',
      crop: null,
      flipX: false,
      flipY: false,
      altText: promptText || ''
    },
    meta: {
      cowartGeneratedStandalone: true
    },
    index: 'a0'
  }

  editor.store.put([newAsset, newShape])
  editor.setSelectedShapes([shapeId])

  connectReferenceArrow(editor, referenceShapeId, shapeId)
}

// Insert a regenerated image to the right of the reference shape, keeping its size.
function insertRegeneratedCandidate(editor, result, refShape, promptText) {
  const displayW = refShape.props.w
  const displayH = refShape.props.h
  const assetId = `asset:regen_${Date.now()}`
  const shapeId = createShapeId()

  const newAsset = {
    id: assetId,
    type: 'image',
    typeName: 'asset',
    props: {
      name: result.fileName,
      src: result.src,
      w: displayW,
      h: displayH,
      fileSize: result.fileSize,
      mimeType: result.mimeType,
      isAnimated: false
    },
    meta: {}
  }

  const newShape = {
    id: shapeId,
    type: 'image',
    typeName: 'shape',
    x: refShape.x + displayW + 60,
    y: refShape.y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    parentId: refShape.parentId,
    props: {
      w: displayW,
      h: displayH,
      assetId,
      playing: true,
      url: '',
      crop: null,
      flipX: false,
      flipY: false,
      altText: promptText
    },
    meta: {
      cowartGeneratedStandalone: true,
      cowartRegeneratedFrom: refShape.id
    },
    index: 'a0'
  }

  editor.store.put([newAsset, newShape])
  editor.setSelectedShapes([shapeId])

  connectReferenceArrow(editor, refShape.id, shapeId)
}

// Bridges the in-memory generation queue to the canvas: provides the executor
// (network request + auto-insert) and inserter (chosen candidate) used by the
// queue store. Lives in App.jsx so it can call the module-level insert helpers
// directly without creating a circular import.
function CowartQueueBridge() {
  const editor = useEditor()

  useEffect(() => {
    setQueueExecutor(async (task) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 360000)
      try {
        const config = getStoredImageApiConfig()
        const cosConfig = getStoredCosConfig()
        const response = await fetch('/api/regenerate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            prompt: task.prompt,
            referenceAssetSrc: task.referenceAssetSrc,
            apiBaseUrl: config.apiBaseUrl,
            image2Path: config.image2Path,
            bananaPath: config.bananaPath,
            apiKey: config.apiKey,
            provider: task.provider,
            pageId: task.pageId,
            genParams: task.genParams,
            cos: cosConfig.secretId && cosConfig.secretKey ? cosConfig : null,
            count: task.count
          })
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`)

        if (result.candidates && result.candidates.length > 1) {
          // Insert all candidates now; return them so the queue panel can show
          // the "已插入 N 张" preview.
          await insertAllQueueCandidates(editor, task, result.candidates)
          return { ok: true, candidates: result.candidates }
        }

        await insertQueueResult(editor, task, result)
        return { ok: true }
      } catch (err) {
        if (err.name === 'AbortError') return { ok: false, error: '请求超时（6 分钟未响应），请重试' }
        return { ok: false, error: err.message || '生成失败' }
      } finally {
        clearTimeout(timeoutId)
      }
    })

    setQueueInserter((task, candidate) => {
      insertQueueResult(editor, task, candidate)
    })

    setQueueInserterAll((task, candidates) => {
      insertAllQueueCandidates(editor, task, candidates)
    })

    return () => {
      setQueueExecutor(null)
      setQueueInserter(null)
      setQueueInserterAll(null)
    }
  }, [editor])

  return null
}

// Shared insert logic for both executor result and chosen candidate.
async function insertQueueResult(editor, task, result) {
  if (task.type === 'image' && task.referenceShapeId) {
    const refShape = editor.getShape(task.referenceShapeId)
    if (refShape) {
      insertRegeneratedCandidate(editor, result, refShape, task.prompt)
      return
    }
  }
  await insertGeneratedImageFromResult(editor, result, task.anchorShapeId, task.prompt, task.referenceShapeId)
}

// Insert ALL generated candidates onto the canvas, laid out in a horizontal row.
// - image-to-image: arranged to the right of the reference shape, each linked
//   back to the source via a reference annotation arrow.
// - text-to-image: arranged centered at the current viewport, read from left.
async function insertAllQueueCandidates(editor, task, candidates) {
  if (!candidates || candidates.length === 0) return

  // --- image-to-image: row to the right of the reference shape ---
  if (task.type === 'image' && task.referenceShapeId) {
    const refShape = editor.getShape(task.referenceShapeId)
    if (refShape) {
      const displayW = refShape.props.w
      const displayH = refShape.props.h
      const gap = 40
      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i]
        const assetId = `asset:regen_${Date.now()}_${i}`
        const shapeId = createShapeId()
        const newAsset = {
          id: assetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: cand.fileName,
            src: cand.src,
            w: displayW,
            h: displayH,
            fileSize: cand.fileSize,
            mimeType: cand.mimeType,
            isAnimated: false
          },
          meta: {}
        }
        const newShape = {
          id: shapeId,
          type: 'image',
          typeName: 'shape',
          x: refShape.x + displayW + 60 + i * (displayW + gap),
          y: refShape.y,
          rotation: 0,
          isLocked: false,
          opacity: 1,
          parentId: refShape.parentId,
          props: {
            w: displayW,
            h: displayH,
            assetId,
            playing: true,
            url: '',
            crop: null,
            flipX: false,
            flipY: false,
            altText: task.prompt || ''
          },
          meta: {
            cowartGeneratedStandalone: true,
            cowartRegeneratedFrom: refShape.id
          },
          index: 'a0'
        }
        editor.store.put([newAsset, newShape])
        connectReferenceArrow(editor, refShape.id, shapeId)
        if (i === candidates.length - 1) editor.setSelectedShapes([shapeId])
      }
      return
    }
  }

  // --- text-to-image (or image without a live reference): centered row ---
  const infos = await Promise.all(
    candidates.map(
      (c) =>
        new Promise((resolve) => {
          const img = new Image()
          img.onload = () => resolve({ w: img.naturalWidth || 512, h: img.naturalHeight || 512 })
          img.onerror = () => resolve({ w: 512, h: 512 })
          img.src = c.src
        })
    )
  )

  const maxDim = 640
  const gap = 30
  const sizes = infos.map((n) => {
    const scale = Math.min(maxDim / n.w, maxDim / n.h, 1)
    return { w: n.w * scale, h: n.h * scale }
  })
  const totalW = sizes.reduce((s, sz) => s + sz.w, 0) + gap * (candidates.length - 1)
  const center = editor.getViewportPageBounds().center
  let x = center.x - totalW / 2
  const y = center.y - (sizes[0]?.h || maxDim) / 2

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i]
    const sz = sizes[i]
    const assetId = `asset:gen_${Date.now()}_${i}`
    const shapeId = createShapeId()
    const newAsset = {
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name: cand.fileName,
        src: cand.src,
        w: sz.w,
        h: sz.h,
        fileSize: cand.fileSize,
        mimeType: cand.mimeType,
        isAnimated: false
      },
      meta: {}
    }
    const newShape = {
      id: shapeId,
      type: 'image',
      typeName: 'shape',
      x,
      y,
      rotation: 0,
      isLocked: false,
      opacity: 1,
      parentId: editor.getCurrentPageId(),
      props: {
        w: sz.w,
        h: sz.h,
        assetId,
        playing: true,
        url: '',
        crop: null,
        flipX: false,
        flipY: false,
        altText: task.prompt || ''
      },
      meta: {
        cowartGeneratedStandalone: true
      },
      index: 'a0'
    }
    editor.store.put([newAsset, newShape])
    connectReferenceArrow(editor, task.referenceShapeId, shapeId)
    x += sz.w + gap
    if (i === candidates.length - 1) editor.setSelectedShapes([shapeId])
  }
}

function CowartTextToImageDialog() {
  const editor = useEditor()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [gen, setGen] = useState(() => defaultGenState(getStoredImageProvider()))
  const [anchorShapeId, setAnchorShapeId] = useState(null)
  const [error, setError] = useState(null)
  const [count, setCount] = useState(1)
  const [templateName, setTemplateName] = useState(null)
  const [templateNeedsRef, setTemplateNeedsRef] = useState(false)
  const [uploadedRef, setUploadedRef] = useState(null) // { src, name } from a user-uploaded reference photo
  const fileInputRef = useRef(null)
  const openGuardRef = useRef(false)

  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail || {}
      setAnchorShapeId(detail.anchorShapeId || null)
      setPrompt(detail.prompt && typeof detail.prompt === 'string' ? detail.prompt : '')
      setTemplateName(detail.templateName || null)
      setTemplateNeedsRef(!!detail.needUpload)
      setUploadedRef(null)
      setGen(defaultGenState(getStoredImageProvider()))
      setError(null)
      setOpen(true)
      // Block the overlay's click-to-close for a short window so the very
      // click that opened the dialog cannot bubble up and immediately close it.
      openGuardRef.current = true
      setTimeout(() => {
        openGuardRef.current = false
      }, 350)
    }
    window.addEventListener(TEXTGEN_OPEN_EVENT, handler)
    return () => window.removeEventListener(TEXTGEN_OPEN_EVENT, handler)
  }, [])

  // Track whether a single image shape is selected (used as reference image hint)
  const hasRefImage = useValue(
    'textgen-ref-image',
    () => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return false
      const sh = editor.getShape(ids[0])
      return !!(sh && sh.type === 'image')
    },
    [editor]
  )

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return
    const promptText = prompt.trim()
    const anchorId = anchorShapeId

    // Reference image priority:
    //   1. a photo explicitly uploaded inside the dialog (templates that need a photo)
    //   2. a single image shape selected on the canvas
    // For an uploaded photo we materialize it as a real canvas shape so the
    // result can be placed beside it with a reference arrow — i.e. the full
    // image-to-image (图生图) path, not the plain text-to-image layout.
    let referenceAssetSrc = null
    let referenceShapeId = null
    if (uploadedRef && uploadedRef.src) {
      const nat = { w: uploadedRef.w || 512, h: uploadedRef.h || 512 }
      const maxDim = 360
      const scale = Math.min(maxDim / nat.w, maxDim / nat.h, 1)
      const w = Math.round(nat.w * scale)
      const h = Math.round(nat.h * scale)
      const center = editor.getViewportPageBounds().center
      const refAssetId = `asset:refupload_${Date.now()}`
      const refShapeId = createShapeId()
      const refAsset = {
        id: refAssetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: uploadedRef.name || 'reference',
          src: uploadedRef.src,
          w: nat.w,
          h: nat.h,
          fileSize: 0,
          mimeType: (uploadedRef.src.split(';')[0].split(':')[1]) || 'image/png',
          isAnimated: false
        },
        meta: {}
      }
      const refShape = {
        id: refShapeId,
        type: 'image',
        typeName: 'shape',
        x: center.x - w / 2,
        y: center.y - h / 2,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        parentId: editor.getCurrentPageId(),
        props: {
          w,
          h,
          assetId: refAssetId,
          playing: true,
          url: '',
          crop: null,
          flipX: false,
          flipY: false,
          altText: '参考图（用户上传）'
        },
        meta: { cowartReferenceUpload: true },
        index: 'a0'
      }
      editor.store.put([refAsset, refShape])
      referenceAssetSrc = uploadedRef.src
      referenceShapeId = refShapeId
    } else {
      const selIds = editor.getSelectedShapeIds()
      if (selIds.length === 1) {
        const sh = editor.getShape(selIds[0])
        if (sh && sh.type === 'image') {
          const asset = sh.props?.assetId ? editor.getAsset(sh.props.assetId) : null
          referenceAssetSrc = asset?.props?.src ?? null
          referenceShapeId = sh.id
        }
      }
    }

    const provider = getStoredImageProvider()
    const providerLabel = IMAGE_PROVIDER_OPTIONS.find((o) => o.id === provider)?.label || provider
    const genParams = buildGenParams(provider, gen)
    const pageId = editor.getCurrentPageId()

    setError(null)
    const res = enqueueGenerationTask({
      type: referenceShapeId ? 'image' : 'text',
      prompt: promptText,
      provider,
      providerLabel,
      genParams,
      referenceAssetSrc,
      referenceShapeId,
      anchorShapeId: anchorId,
      count,
      pageId
    })

    if (!res.ok) {
      setError(res.error)
      return
    }
    setOpen(false)
  }, [prompt, gen, anchorShapeId, editor, count, uploadedRef])

  return (
    <>
      {open ? createPortal(
        <div className="cowart-textgen-modal-overlay" onClick={() => { if (openGuardRef.current) return; setOpen(false) }}>
          <div className="cowart-textgen-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="cowart-textgen-modal-header">
              <span>✨ 文生图</span>
              <button className="cowart-textgen-close" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="cowart-textgen-modal-body">
              {templateName ? (
                <div className="cowart-textgen-template-chip">
                  <span>📋 模板：{templateName}</span>
                  <button
                    type="button"
                    className="cowart-textgen-template-clear"
                    onClick={() => setTemplateName(null)}
                    title="清除模板标记"
                  >×</button>
                </div>
              ) : null}
              {templateNeedsRef ? (
                <div className="cowart-textgen-refbox">
                  <div className="cowart-textgen-refhint">
                    {uploadedRef ? (
                      <span>✅ 已上传参考图：{uploadedRef.name}（走图生图路径，参考图将放入画布，生成结果排在右侧并连标注线）</span>
                    ) : hasRefImage ? (
                      <span>✅ 已选中画布上的图片，将作为图生图输入。</span>
                    ) : (
                      <span>💡 该模板需要一张参考照片：点击下方「上传图片」选择本地照片，或在画布中选中一张图片，生成时会作为图生图输入；不选也可直接生成。</span>
                    )}
                  </div>
                  <div className="cowart-textgen-refupload">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files && e.target.files[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          const dataUrl = String(reader.result)
                          const img = new Image()
                          img.onload = () => {
                            // 压缩到 ≤1024px（jpeg 0.85），避免大图 base64 过大引发 Failed to fetch
                            const MAX = 1024
                            let w = img.naturalWidth || 512
                            let h = img.naturalHeight || 512
                            if (w > MAX || h > MAX) {
                              const scale = Math.min(MAX / w, MAX / h)
                              w = Math.round(w * scale)
                              h = Math.round(h * scale)
                            }
                            try {
                              const canvas = document.createElement('canvas')
                              canvas.width = w
                              canvas.height = h
                              const ctx = canvas.getContext('2d')
                              ctx.drawImage(img, 0, 0, w, h)
                              const compressed = canvas.toDataURL('image/jpeg', 0.85)
                              setUploadedRef({ src: compressed, name: file.name, w, h })
                            } catch {
                              setUploadedRef({ src: dataUrl, name: file.name, w, h })
                            }
                          }
                          img.onerror = () => setUploadedRef({ src: dataUrl, name: file.name, w: 512, h: 512 })
                          img.src = dataUrl
                        }
                        reader.readAsDataURL(file)
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      className="cowart-textgen-upload-btn"
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    >
                      📷 上传图片
                    </button>
                    {uploadedRef ? (
                      <div className="cowart-textgen-refpreview">
                        <img src={uploadedRef.src} alt="参考图预览" />
                        <button
                          type="button"
                          className="cowart-textgen-refremove"
                          onClick={() => setUploadedRef(null)}
                          title="移除上传的参考图"
                        >移除</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <textarea
                className="cowart-textgen-prompt"
                placeholder="用文字描述你想生成的图片，例如：一只戴着安全帽的卡通小猫，扁平插画风格，蓝色主调"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                autoFocus
              />
              <GenSizeControl
                provider={getStoredImageProvider()}
                gen={gen}
                setGen={setGen}
              />
              <label className="cowart-textgen-size-field">
                <span>数量</span>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n} 张</option>
                  ))}
                </select>
              </label>
              {error ? (
                <div className="cowart-textgen-error">{error}</div>
              ) : null}
            </div>
            <div className="cowart-textgen-modal-footer">
              <button onClick={() => setOpen(false)} type="button">
                取消
              </button>
              <button
                data-primary="true"
                onClick={handleGenerate}
                type="button"
                disabled={!prompt.trim()}
                title="加入生成队列（最多 10 个）"
              >
                加入队列
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  )
}

function CowartTextToImageToolbarButton() {
  return (
    <button
      className="cowart-toolbar-button cowart-textgen-toolbar-button"
      onClick={() => openTextGen(null)}
      title="用文字生成图片（无需参考图）"
      type="button"
    >
      <span>✨ 文生图</span>
    </button>
  )
}

function CowartHolderGenerateButton() {
  const editor = useEditor()
  const holderId = useValue(
    'selected-ai-holder',
    () => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length !== 1) return null
      const shape = editor.getShape(ids[0])
      if (!shape || shape.meta?.cowartAiImageHolder !== true) return null
      return shape.id
    },
    [editor]
  )

  if (!holderId) return null

  return (
    <button
      className="cowart-toolbar-button cowart-textgen-toolbar-button"
      onClick={() => openTextGen(holderId)}
      title="用这个框生成 AI 图片"
      type="button"
    >
      <span>✨ 生成</span>
    </button>
  )
}

function CowartExportButton() {
  const editor = useEditor()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const [busy, setBusy] = useState(false)
  const btnRef = useRef(null)

  const closeMenu = useCallback(() => {
    setOpen(false)
    setMenuPos(null)
  }, [])

  const toggleMenu = useCallback(() => {
    if (open) {
      closeMenu()
      return
    }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      // Open upward (button sits in the bottom toolbar) so the menu stays on-screen
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 190))
      const bottom = window.innerHeight - rect.top + 6
      setMenuPos({ bottom, left })
    }
    setOpen(true)
  }, [open, closeMenu])

  const targetIds = useCallback(() => {
    const ids = editor.getSelectedShapeIds()
    return ids.length > 0 ? ids : [...editor.getCurrentPageShapeIds()]
  }, [editor])

  const doExport = useCallback(async (format) => {
    closeMenu()
    setBusy(true)
    try {
      const ids = targetIds()
      if (ids.length === 0) {
        alert('画布是空的，先画点东西吧～')
        return
      }
      await exportAs(editor, ids, { format, background: true, name: 'cowart' })
    } catch (err) {
      console.error(err)
      alert('导出失败：' + (err?.message || err))
    } finally {
      setBusy(false)
    }
  }, [editor, targetIds, closeMenu])

  const copyImage = useCallback(async () => {
    closeMenu()
    setBusy(true)
    try {
      const ids = targetIds()
      if (ids.length === 0) {
        alert('画布是空的，先画点东西吧～')
        return
      }
      const { blob } = await editor.toImage(ids, { format: 'png', background: true })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setTimeout(() => {}, 0)
    } catch (err) {
      console.error(err)
      alert('复制失败：' + (err?.message || err))
    } finally {
      setBusy(false)
    }
  }, [editor, targetIds, closeMenu])

  return (
    <div className="cowart-export">
      <button
        ref={btnRef}
        className="cowart-toolbar-button"
        onClick={toggleMenu}
        title="导出 / 复制画布"
        type="button"
        disabled={busy}
      >
        <span>📤 导出{busy ? '…' : ' ▾'}</span>
      </button>
      {open && menuPos ? createPortal(
        <>
          <div className="cowart-export-overlay" onClick={closeMenu} />
          <div
            className="cowart-export-menu"
            role="menu"
            style={{ position: 'fixed', bottom: menuPos.bottom, left: menuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => doExport('png')} type="button">🖼️ PNG 图片</button>
            <button onClick={() => doExport('svg')} type="button">📐 SVG 矢量</button>
            <button onClick={copyImage} type="button">📋 复制为图片</button>
          </div>
        </>,
        document.body
      ) : null}
    </div>
  )
}

function CowartEmptyState() {
  const editor = useEditor()
  const isEmpty = useValue(
    'canvas-empty',
    () => editor.getCurrentPageShapeIds().size === 0,
    [editor]
  )
  // Hide the guide once the user has picked any tool other than the default
  // select/hand. Otherwise the centered card keeps covering the canvas and
  // drawing/editing appears to "do nothing".
  const isDefaultTool = useValue(
    'canvas-default-tool',
    () => {
      const tool = editor.getCurrentToolId()
      return (
        tool === 'select' ||
        tool === 'hand' ||
        tool === 'select.idle' ||
        tool === 'hand.idle'
      )
    },
    [editor]
  )

  if (!isEmpty || !isDefaultTool) return null

  return createPortal(
    <div className="cowart-empty-state">
      <div className="cowart-empty-card">
        <div className="cowart-empty-emoji">🎨</div>
        <div className="cowart-empty-title">开始你的画布</div>
        <div className="cowart-empty-sub">无限白板 · AI 出图 · 评审标注，三合一</div>
        <div className="cowart-empty-actions">
          <button onClick={() => openTextGen(null)} type="button">✨ 文生图</button>
          <button onClick={() => editor.setCurrentTool('draw')} type="button">✏️ 自由绘制</button>
          <button onClick={() => editor.setCurrentTool('text')} type="button">🔤 加文字</button>
        </div>
        <div className="cowart-empty-hint">也可以直接 Ctrl+V 粘贴图片，或把图片文件拖进画布</div>
      </div>
    </div>,
    document.body
  )
}

function CowartToolbar(props) {
  return (
    <DefaultToolbar {...props} maxItems={12}>
      <CowartAnnotationToolbarItem />
      <CowartToolbarDivider />
      <CowartTextToImageToolbarButton />
      <CowartImageProviderSelector />
      <CowartImageApiConfigButton />
      <CowartHolderGenerateButton />
      <CowartRegenerateButton />
      <CowartToolbarDivider />
      <SelectToolbarItem />
      <HandToolbarItem />
      <CowartToolbarItem toolId={AI_IMAGE_TOOL_ID} />
      <CowartToolbarDivider />
      <CowartExportButton />
      <CowartToolbarDivider />
      <AssetToolbarItem />
      <DrawToolbarItem />
      <EraserToolbarItem />
      <TextToolbarItem />
      <ArrowToolbarItem />
      <NoteToolbarItem />
      <RectangleToolbarItem />
      <EllipseToolbarItem />
      <TriangleToolbarItem />
      <DiamondToolbarItem />
      <HexagonToolbarItem />
      <OvalToolbarItem />
      <RhombusToolbarItem />
      <StarToolbarItem />
      <CloudToolbarItem />
      <HeartToolbarItem />
      <XBoxToolbarItem />
      <CheckBoxToolbarItem />
      <ArrowLeftToolbarItem />
      <ArrowUpToolbarItem />
      <ArrowDownToolbarItem />
      <ArrowRightToolbarItem />
      <LineToolbarItem />
      <HighlightToolbarItem />
      <LaserToolbarItem />
      <FrameToolbarItem />
    </DefaultToolbar>
  )
}

function getCowartSelection(editor) {
  const selectedShapeIds = editor.getSelectedShapeIds()
  return selectedShapeIds.map((id) => {
    const shape = editor.getShape(id)
    const asset = shape?.props?.assetId ? editor.getAsset(shape.props.assetId) : null
    return {
      id,
      type: shape?.type ?? null,
      parentId: shape?.parentId ?? null,
      x: shape?.x ?? null,
      y: shape?.y ?? null,
      rotation: shape?.rotation ?? null,
      meta: shape?.meta ?? null,
      isAiImageHolder: shape?.meta?.cowartAiImageHolder === true,
      props: shape?.props ?? null,
      asset: asset
        ? {
            id: asset.id,
            type: asset.type,
            name: asset.props?.name ?? null,
            src: asset.props?.src ?? null,
            w: asset.props?.w ?? null,
            h: asset.props?.h ?? null,
            mimeType: asset.props?.mimeType ?? null,
            fileSize: asset.props?.fileSize ?? null
          }
        : null
    }
  })
}

function getCowartSelectionSnapshot(editor) {
  const imageApi = getStoredImageApiConfig()
  // IMPORTANT: never persist the apiKey to disk. The selection snapshot is
  // written to canvas/cowart-selection.json which may be shared or committed.
  // Only expose whether a key is configured, never the secret itself.
  return {
    selectedShapes: getCowartSelection(editor),
    imageApi: {
      apiBaseUrl: imageApi.apiBaseUrl,
      hasApiKey: imageApi.apiKey.trim().length > 0
    }
  }
}

function getCowartViewState(editor) {
  const camera = editor.getCamera()
  return {
    version: 1,
    currentPageId: editor.getCurrentPageId(),
    camera: {
      x: camera.x,
      y: camera.y,
      z: camera.z
    }
  }
}

function isRestorableViewState(viewState) {
  return (
    viewState &&
    typeof viewState === 'object' &&
    typeof viewState.currentPageId === 'string' &&
    viewState.camera &&
    Number.isFinite(viewState.camera.x) &&
    Number.isFinite(viewState.camera.y) &&
    Number.isFinite(viewState.camera.z)
  )
}

function restoreCowartViewState(editor, viewState) {
  if (!isRestorableViewState(viewState)) return
  if (!editor.getPage(viewState.currentPageId)) return

  editor.setCurrentPage(viewState.currentPageId)
  editor.setCamera(viewState.camera, { immediate: true, force: true })
}

function writeCowartSelectionState(selectionSnapshot) {
  let stateElement = document.getElementById(SELECTION_STATE_ELEMENT_ID)
  if (!stateElement) {
    stateElement = document.createElement('script')
    stateElement.id = SELECTION_STATE_ELEMENT_ID
    stateElement.type = 'application/json'
    document.body.append(stateElement)
  }

  stateElement.textContent = JSON.stringify({
    ...selectionSnapshot,
    updatedAt: new Date().toISOString()
  })
}

export default function App() {
  const [snapshot, setSnapshot] = useState()
  const [viewState, setViewState] = useState()
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCanvas() {
      try {
        const [canvasResponse, viewStateResponse] = await Promise.all([
          fetch(CANVAS_ENDPOINT, { signal: controller.signal }),
          fetch(VIEW_STATE_ENDPOINT, { signal: controller.signal })
        ])
        if (!canvasResponse.ok) {
          throw new Error(`Failed to load canvas: ${canvasResponse.status}`)
        }
        if (!viewStateResponse.ok) {
          throw new Error(`Failed to load canvas view state: ${viewStateResponse.status}`)
        }
        const [canvasData, viewStateData] = await Promise.all([
          canvasResponse.json(),
          viewStateResponse.json()
        ])
        setSnapshot(canvasData.snapshot ?? null)
        setViewState(viewStateData.viewState ?? null)
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(error)
        setSnapshot(null)
        setViewState(null)
      }
    }

    loadCanvas()

    return () => controller.abort()
  }, [])

  const handleMount = useCallback((editor) => {
    window.__cowartEditor = editor
    window.__cowartSelection = () => getCowartSelection(editor)
    window.__cowartViewState = () => getCowartViewState(editor)
    let lastSyncedSelectionState = ''
    let isSelectionStateSaving = false
    let hasPendingSelectionState = false
    let lastSyncedViewState = ''
    let isViewStateSaving = false
    let hasPendingViewState = false

    editor.timers.requestAnimationFrame(() => {
      restoreCowartViewState(editor, viewState)
    })

    async function syncSelectionState() {
      const selectionSnapshot = getCowartSelectionSnapshot(editor)
      writeCowartSelectionState(selectionSnapshot)

      const selectionState = JSON.stringify(selectionSnapshot)
      if (selectionState === lastSyncedSelectionState) return
      lastSyncedSelectionState = selectionState

      if (isSelectionStateSaving) {
        hasPendingSelectionState = true
        return
      }

      isSelectionStateSaving = true
      try {
        const response = await fetch(SELECTION_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...selectionSnapshot,
            updatedAt: new Date().toISOString()
          })
        })
        if (!response.ok) {
          throw new Error(`Failed to save selection: ${response.status}`)
        }
      } catch (error) {
        console.error(error)
      } finally {
        isSelectionStateSaving = false
        if (hasPendingSelectionState) {
          hasPendingSelectionState = false
          syncSelectionState()
        }
      }
    }

    syncSelectionState()
    const selectionStateTimer = window.setInterval(syncSelectionState, 250)
    window.addEventListener('cowart-image-api-config-change', syncSelectionState)

    async function syncViewState() {
      const viewStateSnapshot = {
        ...getCowartViewState(editor),
        updatedAt: new Date().toISOString()
      }

      const nextViewState = JSON.stringify(viewStateSnapshot)
      if (nextViewState === lastSyncedViewState) return
      lastSyncedViewState = nextViewState

      if (isViewStateSaving) {
        hasPendingViewState = true
        return
      }

      isViewStateSaving = true
      try {
        const response = await fetch(VIEW_STATE_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: nextViewState
        })
        if (!response.ok) {
          throw new Error(`Failed to save view state: ${response.status}`)
        }
      } catch (error) {
        console.error(error)
      } finally {
        isViewStateSaving = false
        if (hasPendingViewState) {
          hasPendingViewState = false
          syncViewState()
        }
      }
    }

    const viewStateTimer = window.setInterval(syncViewState, 500)
    editor.timers.setTimeout(syncViewState, 100)

    let saveTimer = null
    let isSaving = false
    let hasPendingSave = false
    let hasUnsavedChanges = false
    let isSyncingAnnotationShape = false
    let remoteLoadController = null

    async function saveCanvas() {
      if (!hasUnsavedChanges) return

      if (isSaving) {
        hasPendingSave = true
        return
      }

      isSaving = true
      try {
        const body = JSON.stringify(editor.store.getStoreSnapshot())
        const response = await fetch(CANVAS_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body
        })
        if (!response.ok) {
          throw new Error(`Failed to save canvas: ${response.status}`)
        }
        hasUnsavedChanges = false
      } catch (error) {
        console.error(error)
      } finally {
        isSaving = false
        if (hasPendingSave) {
          hasPendingSave = false
          scheduleSave()
        }
      }
    }

    function scheduleSave() {
      hasUnsavedChanges = true
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(saveCanvas, 500)
    }

    async function loadRemoteCanvasSnapshot() {
      remoteLoadController?.abort()
      const controller = new AbortController()
      remoteLoadController = controller

      const preserveLocalChanges = hasUnsavedChanges || isSaving
      const preFetchStore = preserveLocalChanges ? null : editor.store.getStoreSnapshot().store

      try {
        const response = await fetch(CANVAS_ENDPOINT, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to refresh canvas: ${response.status}`)
        }

        const canvasData = await response.json()
        const effectivePreserve =
          preserveLocalChanges || (preFetchStore && storeChangedSinceSnapshot(editor, preFetchStore))
        const changedRecords = applyRemoteCanvasSnapshot(editor, canvasData.snapshot, {
          preserveLocalChanges: effectivePreserve
        })

        if (changedRecords > 0 && effectivePreserve) {
          hasUnsavedChanges = true
          if (isSaving) {
            hasPendingSave = true
          } else {
            scheduleSave()
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') return
        console.error(error)
      } finally {
        if (remoteLoadController === controller) {
          remoteLoadController = null
        }
      }
    }

    const unsubscribe = editor.store.listen(scheduleSave, {
      source: 'user',
      scope: 'document'
    })

    let canvasEvents = null
    if ('EventSource' in window) {
      canvasEvents = new EventSource(CANVAS_EVENTS_ENDPOINT)
      canvasEvents.addEventListener('canvas-changed', loadRemoteCanvasSnapshot)
      canvasEvents.onerror = (error) => {
        console.warn('Cowart canvas live refresh disconnected.', error)
      }
    }

    const unsubscribeAnnotationEditingToolLock = editor.store.listen(
      ({ changes }) => {
        for (const [previous, next] of Object.values(changes.updated)) {
          if (previous?.typeName !== 'instance_page_state') continue
          if (!previous.editingShapeId || next.editingShapeId) continue

          const shape = editor.getShape(previous.editingShapeId)
          if (shape?.meta?.cowartAnnotationArrow !== true) continue

          editor.timers.requestAnimationFrame(() => {
            if (editor.getEditingShapeId()) return
            if (editor.getCurrentToolId() !== 'select') return
            editor.setCurrentTool(ANNOTATION_TOOL_ID)
          })
        }
      },
      {
        source: 'all',
        scope: 'session'
      }
    )

    const unsubscribeAnnotationShapeSync = editor.store.listen(
      ({ changes }) => {
        if (isSyncingAnnotationShape) return

        const updates = []
        for (const [_previous, next] of Object.values(changes.updated)) {
          if (next?.typeName !== 'shape') continue
          if (next.type !== 'arrow') continue
          if (next.meta?.cowartAnnotationArrow !== true) continue

          const props = {}
          if (next.props?.color !== next.props?.labelColor) {
            props.labelColor = next.props.color
          }
          if (next.props?.labelPosition !== ANNOTATION_LABEL_POSITION) {
            props.labelPosition = ANNOTATION_LABEL_POSITION
          }

          if (Object.keys(props).length === 0) continue

          updates.push({
            id: next.id,
            type: 'arrow',
            props
          })
        }

        if (updates.length === 0) return

        isSyncingAnnotationShape = true
        try {
          editor.updateShapes(updates)
        } finally {
          isSyncingAnnotationShape = false
        }
      },
      {
        source: 'all',
        scope: 'document'
      }
    )

    return () => {
      window.clearTimeout(saveTimer)
      window.clearInterval(selectionStateTimer)
      window.clearInterval(viewStateTimer)
      window.removeEventListener('cowart-image-api-config-change', syncSelectionState)
      remoteLoadController?.abort()
      canvasEvents?.close()
      if (window.__cowartEditor === editor) {
        delete window.__cowartEditor
        delete window.__cowartSelection
        delete window.__cowartViewState
      }
      document.getElementById(SELECTION_STATE_ELEMENT_ID)?.remove()
      unsubscribe()
      unsubscribeAnnotationEditingToolLock()
      unsubscribeAnnotationShapeSync()
      syncViewState()
      saveCanvas()
    }
  }, [viewState])

  if (snapshot === undefined || viewState === undefined) {
    return (
      <main className="cowart-status" aria-live="polite">
        Loading canvas...
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="cowart-status" aria-live="polite">
        Canvas file could not be loaded.
      </main>
    )
  }

  return (
    <main className="cowart-canvas" aria-label="Cowart infinite canvas">
      <Tldraw
        snapshot={snapshot ?? undefined}
        inferDarkMode
        onMount={handleMount}
        overrides={cowartUiOverrides}
        components={cowartComponents}
        tools={[CowartAnnotationTool]}
      >
        <CowartTextToImageDialog />
        <CowartEmptyState />
        <CowartQueueBridge />
        <TaskQueuePanel />
        <CowartFeatures />
      </Tldraw>
    </main>
  )
}
