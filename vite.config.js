import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'

// COS SDK — loaded lazily so build doesn't fail if not installed
let COS = null
try {
  COS = (await import('cos-nodejs-sdk-v5')).default
} catch {
  // cos-sdk not installed; COS upload will be skipped
}

const projectDir = resolve(process.env.COWART_PROJECT_DIR ?? process.cwd())
const canvasDir = resolve(process.env.COWART_CANVAS_DIR ?? join(projectDir, 'canvas'))
const canvasFile = join(canvasDir, 'cowart-canvas.json')
const selectionFile = join(canvasDir, 'cowart-selection.json')
const viewStateFile = join(canvasDir, 'cowart-view-state.json')
const canvasPagesDir = join(canvasDir, 'pages')
const canvasAssetsDir = join(canvasDir, 'assets')
const pagesManifestFile = join(canvasPagesDir, 'manifest.json')
const canvasFileName = 'cowart-canvas.json'
const pageIdPrefix = 'page:'
const globalAssetsRoute = '/assets/'
const pageAssetsRoute = '/page-assets/'
const canvasEventClients = new Set()
let canvasEventVersion = 0

const mimeTypes = new Map([
  ['.apng', 'image/apng'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
])

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(payload))
}

function sendCanvasEvent(res, payload) {
  res.write(`event: canvas-changed\n`)
  res.write(`id: ${payload.version}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcastCanvasChanged(result) {
  const payload = {
    version: ++canvasEventVersion,
    updatedAt: new Date().toISOString(),
    storage: result.storage,
    paths: result.paths
  }

  for (const client of canvasEventClients) {
    if (client.destroyed) {
      canvasEventClients.delete(client)
      continue
    }

    try {
      sendCanvasEvent(client, payload)
    } catch {
      canvasEventClients.delete(client)
    }
  }
}

function readRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 50 * 1024 * 1024) {
        rejectBody(new Error('Canvas payload is too large.'))
        req.destroy()
      }
    })
    req.on('end', () => resolveBody(body))
    req.on('error', rejectBody)
  })
}

function isSnapshot(value) {
  return value && typeof value === 'object' && value.store && value.schema
}

function isSelectionState(value) {
  return value && typeof value === 'object' && Array.isArray(value.selectedShapes)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isViewState(value) {
  return (
    value &&
    typeof value === 'object' &&
    value.version === 1 &&
    (value.currentPageId === null || typeof value.currentPageId === 'string') &&
    value.camera &&
    typeof value.camera === 'object' &&
    isFiniteNumber(value.camera.x) &&
    isFiniteNumber(value.camera.y) &&
    isFiniteNumber(value.camera.z)
  )
}

function isSafeChildPath(parent, child) {
  const pathToChild = relative(parent, child)
  return pathToChild && !pathToChild.startsWith('..') && !pathToChild.includes(`..${sep}`)
}

function pageDirName(pageId) {
  return encodeURIComponent(pageId.replace(pageIdPrefix, ''))
}

function pageFilePath(pageId) {
  return join(canvasPagesDir, pageDirName(pageId), canvasFileName)
}

function pageAssetsDir(pageId) {
  return join(canvasPagesDir, pageDirName(pageId), 'assets')
}

function pageAssetUrl(pageId, fileName) {
  return `${pageAssetsRoute}${pageDirName(pageId)}/${encodeURIComponent(fileName)}`
}

function getPageRecords(snapshot) {
  return Object.values(snapshot.store)
    .filter((record) => record?.typeName === 'page')
    .sort((a, b) => String(a.index ?? '').localeCompare(String(b.index ?? '')))
}

function getAssetIdsForShapes(shapes) {
  return new Set(
    shapes
      .map((shape) => shape?.props?.assetId)
      .filter((assetId) => typeof assetId === 'string')
  )
}

function getShapeRecordsForPage(snapshot, pageId) {
  const shapesByParent = new Map()
  for (const record of Object.values(snapshot.store)) {
    if (record?.typeName !== 'shape') continue
    const siblings = shapesByParent.get(record.parentId) ?? []
    siblings.push(record)
    shapesByParent.set(record.parentId, siblings)
  }

  const shapes = []
  const queue = [...(shapesByParent.get(pageId) ?? [])]
  while (queue.length > 0) {
    const shape = queue.shift()
    shapes.push(shape)
    queue.push(...(shapesByParent.get(shape.id) ?? []))
  }
  return shapes
}

function isBindingForShapes(record, shapeIds) {
  if (record?.typeName !== 'binding') return false
  const fromId = record.fromId ?? record.props?.fromId
  const toId = record.toId ?? record.props?.toId
  return shapeIds.has(fromId) || shapeIds.has(toId)
}

function snapshotForPage(snapshot, page) {
  const pageId = page.id
  const pageShapes = getShapeRecordsForPage(snapshot, pageId)
  const shapeIds = new Set(pageShapes.map((shape) => shape.id))
  const assetIds = getAssetIdsForShapes(pageShapes)
  const store = {}

  for (const record of Object.values(snapshot.store)) {
    if (!record?.id) continue
    if (record.typeName === 'page') {
      if (record.id === pageId) store[record.id] = record
      continue
    }
    if (record.typeName === 'shape') {
      if (shapeIds.has(record.id)) store[record.id] = record
      continue
    }
    if (record.typeName === 'asset') {
      if (assetIds.has(record.id)) store[record.id] = record
      continue
    }
    if (record.typeName === 'binding') {
      if (isBindingForShapes(record, shapeIds)) store[record.id] = record
      continue
    }
    store[record.id] = record
  }

  return {
    schema: snapshot.schema,
    store
  }
}

function extensionFromMimeType(mimeType) {
  switch (mimeType) {
    case 'image/apng':
      return '.apng'
    case 'image/avif':
      return '.avif'
    case 'image/gif':
      return '.gif'
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/svg+xml':
      return '.svg'
    case 'image/webp':
      return '.webp'
    default:
      return '.bin'
  }
}

function sanitizeAssetFileName(name, fallbackName, mimeType) {
  const rawName = basename(String(name || fallbackName || 'asset'))
  const extension = extname(rawName) || extensionFromMimeType(mimeType)
  const baseName = rawName
    .slice(0, rawName.length - extname(rawName).length)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${baseName || 'asset'}${extension}`
}

function parseDataUrl(src) {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s.exec(src)
  if (!match) return null
  const mimeType = match[1] || 'application/octet-stream'
  const encoded = match[2]
  const isBase64 = /^data:[^,]*;base64,/i.test(src)
  const buffer = isBase64 ? Buffer.from(encoded, 'base64') : Buffer.from(decodeURIComponent(encoded))
  return { buffer, mimeType }
}

function localAssetFilePathFromUrl(src) {
  let route = null
  let baseDir = null
  if (src.startsWith(globalAssetsRoute)) {
    route = globalAssetsRoute
    baseDir = canvasAssetsDir
  } else if (src.startsWith(pageAssetsRoute)) {
    const parts = src.slice(pageAssetsRoute.length).split('/')
    const pageDir = decodeURIComponent(parts.shift() ?? '')
    if (!pageDir || parts.length === 0) return null
    const filePath = resolve(join(canvasPagesDir, pageDir, 'assets'), ...parts.map(decodeURIComponent))
    return isSafeChildPath(join(canvasPagesDir, pageDir, 'assets'), filePath) ? filePath : null
  } else {
    return null
  }

  const requestedPath = decodeURIComponent(src.slice(route.length))
  const filePath = resolve(baseDir, requestedPath)
  return isSafeChildPath(baseDir, filePath) ? filePath : null
}

async function localizePageAsset(asset, pageId) {
  const src = asset?.props?.src
  if (!src || typeof src !== 'string' || /^https?:\/\//.test(src)) return asset

  const currentPagePrefix = `${pageAssetsRoute}${pageDirName(pageId)}/`
  if (src.startsWith(currentPagePrefix)) return asset

  const localizedAsset = structuredClone(asset)
  const dataUrl = src.startsWith('data:') ? parseDataUrl(src) : null
  const sourceFilePath = dataUrl ? null : localAssetFilePathFromUrl(src)
  if (!dataUrl && !sourceFilePath) return localizedAsset

  const fileName = sanitizeAssetFileName(
    dataUrl ? null : localizedAsset.props.name,
    sourceFilePath ? basename(sourceFilePath) : localizedAsset.id.replace(':', '-'),
    dataUrl?.mimeType ?? localizedAsset.props.mimeType
  )
  const destinationDir = pageAssetsDir(pageId)
  const destinationPath = join(destinationDir, fileName)

  await mkdir(destinationDir, { recursive: true })
  if (dataUrl) {
    await writeFile(destinationPath, dataUrl.buffer)
    localizedAsset.props.mimeType = localizedAsset.props.mimeType ?? dataUrl.mimeType
    localizedAsset.props.fileSize = dataUrl.buffer.length
  } else if (resolve(sourceFilePath) !== resolve(destinationPath)) {
    await copyFile(sourceFilePath, destinationPath)
    localizedAsset.props.fileSize = (await stat(destinationPath)).size
  }

  localizedAsset.props.name = fileName
  localizedAsset.props.src = pageAssetUrl(pageId, fileName)
  return localizedAsset
}

async function localizePageAssets(pageSnapshot, pageId) {
  const entries = await Promise.all(
    Object.entries(pageSnapshot.store).map(async ([id, record]) => {
      if (record?.typeName !== 'asset') return [id, record]
      return [id, await localizePageAsset(record, pageId)]
    })
  )
  return {
    ...pageSnapshot,
    store: Object.fromEntries(entries)
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function readPageSnapshots() {
  let entries
  try {
    entries = await readdir(canvasPagesDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const snapshots = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const filePath = join(canvasPagesDir, entry.name, canvasFileName)
    try {
      const snapshot = await readJsonFile(filePath)
      if (isSnapshot(snapshot)) snapshots.push({ filePath, snapshot })
    } catch (error) {
      if (error.code === 'ENOENT') continue
      // 单页快照损坏（如 JSON 被截断/全空字节）不应拖垮整张画布：告警并跳过该页
      console.warn(`[cowart] 跳过损坏的页面快照 ${filePath}：${error?.message || error}`)
    }
  }
  return snapshots
}

async function loadCanvasSnapshot() {
  const pageSnapshots = await readPageSnapshots()
  if (pageSnapshots.length > 0) {
    const [{ snapshot: firstSnapshot }] = pageSnapshots
    const mergedSnapshot = {
      schema: firstSnapshot.schema,
      store: {}
    }

    for (const { snapshot } of pageSnapshots) {
      Object.assign(mergedSnapshot.store, snapshot.store)
    }
    return {
      snapshot: mergedSnapshot,
      path: canvasPagesDir,
      storage: 'per-page'
    }
  }

  try {
    return {
      snapshot: await readJsonFile(canvasFile),
      path: canvasFile,
      storage: 'legacy-single-file'
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { snapshot: null, path: canvasPagesDir, storage: 'empty' }
    }
    // 旧版单文件损坏：回退空快照而非 500，避免画布整体无法加载（与 view-state 兜底一致）
    console.warn(`[cowart] 旧版画布文件损坏，已回退为空画布：${error?.message || error}`)
    return { snapshot: null, path: canvasPagesDir, storage: 'empty' }
  }
}

async function writeJsonAtomic(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true })
  const tempFile = `${filePath}.${process.pid}.tmp`
  await writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`)
  await rename(tempFile, filePath)
}

async function removeStalePageDirs(currentPageIds) {
  let entries
  try {
    entries = await readdir(canvasPagesDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }

  const currentDirNames = new Set([...currentPageIds].map(pageDirName))
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !currentDirNames.has(entry.name))
      .map((entry) => rm(join(canvasPagesDir, entry.name), { recursive: true, force: true }))
  )
}

async function saveCanvasSnapshot(snapshot) {
  const pages = getPageRecords(snapshot)
  if (pages.length === 0) {
    await writeJsonAtomic(canvasFile, snapshot)
    return { storage: 'legacy-single-file', paths: [canvasFile] }
  }

  const currentPageIds = new Set(pages.map((page) => page.id))
  await removeStalePageDirs(currentPageIds)

  const paths = []
  for (const page of pages) {
    const filePath = pageFilePath(page.id)
    const pageSnapshot = await localizePageAssets(snapshotForPage(snapshot, page), page.id)
    await writeJsonAtomic(filePath, pageSnapshot)
    paths.push(filePath)
  }

  const manifest = {
    version: 1,
    source: 'cowart',
    pages: pages.map((page) => ({
      id: page.id,
      name: page.name,
      index: page.index,
      path: relative(canvasDir, pageFilePath(page.id))
    }))
  }
  await writeJsonAtomic(pagesManifestFile, manifest)

  return { storage: 'per-page', paths }
}

async function serveCanvasAsset(req, res, next) {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (!url.pathname.startsWith(globalAssetsRoute) && !url.pathname.startsWith(pageAssetsRoute)) {
    next()
    return
  }

  const filePath = localAssetFilePathFromUrl(url.pathname)
  if (!filePath) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    res.statusCode = 200
    res.setHeader('content-type', mimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream')
    res.setHeader('content-length', String(fileStat.size))
    res.setHeader('cache-control', 'no-cache')
    createReadStream(filePath).pipe(res)
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    next(error)
  }
}

function canvasStoragePlugin() {
  return {
    name: 'cowart-canvas-storage',
    configureServer(server) {
      server.middlewares.use(serveCanvasAsset)

      server.middlewares.use('/api/canvas-events', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('allow', 'GET')
          res.end()
          return
        }

        res.statusCode = 200
        res.setHeader('content-type', 'text/event-stream')
        res.setHeader('cache-control', 'no-cache, no-transform')
        res.setHeader('connection', 'keep-alive')
        res.setHeader('x-accel-buffering', 'no')
        res.write(`: connected\n\n`)

        canvasEventClients.add(res)
        const heartbeat = setInterval(() => {
          res.write(`: heartbeat ${Date.now()}\n\n`)
        }, 25000)

        req.on('close', () => {
          clearInterval(heartbeat)
          canvasEventClients.delete(res)
        })
      })

      server.middlewares.use('/api/selection', async (req, res) => {
        try {
          if (req.method === 'GET') {
            try {
              sendJson(res, 200, {
                selection: await readJsonFile(selectionFile),
                path: selectionFile
              })
            } catch (error) {
              if (error.code === 'ENOENT') {
                sendJson(res, 200, {
                  selection: { selectedShapes: [], updatedAt: null },
                  path: selectionFile
                })
                return
              }
              throw error
            }
            return
          }

          if (req.method === 'PUT') {
            const body = await readRequestBody(req)
            const selection = JSON.parse(body)
            if (!isSelectionState(selection)) {
              sendJson(res, 400, { error: 'Expected a Cowart selection state.' })
              return
            }

            // Defense in depth: never persist the apiKey to disk.
            if (selection?.imageApi && typeof selection.imageApi === 'object') {
              delete selection.imageApi.apiKey
            }

            await writeJsonAtomic(selectionFile, selection)
            sendJson(res, 200, { ok: true, path: selectionFile })
            return
          }

          res.statusCode = 405
          res.setHeader('allow', 'GET, PUT')
          res.end()
        } catch (error) {
          sendJson(res, 500, { error: error.message })
        }
      })

      server.middlewares.use('/api/view-state', async (req, res) => {
        try {
          if (req.method === 'GET') {
            try {
              const viewState = await readJsonFile(viewStateFile)
              sendJson(res, 200, {
                viewState,
                path: viewStateFile
              })
            } catch (error) {
              if (error.code === 'ENOENT') {
                sendJson(res, 200, {
                  viewState: {
                    version: 1,
                    currentPageId: null,
                    camera: { x: 0, y: 0, z: 1 },
                    updatedAt: null
                  },
                  path: viewStateFile
                })
                return
              }
              // 文件损坏/JSON 解析失败时回退默认空状态，避免画布因非关键数据而无法加载
              console.error('[cowart] view-state 读取失败，已回退默认:', error.message)
              sendJson(res, 200, {
                viewState: {
                  version: 1,
                  currentPageId: null,
                  camera: { x: 0, y: 0, z: 1 },
                  updatedAt: null
                },
                path: viewStateFile,
                recovered: true
              })
              return
            }
            return
          }

          if (req.method === 'PUT') {
            const body = await readRequestBody(req)
            const viewState = JSON.parse(body)
            if (!isViewState(viewState)) {
              sendJson(res, 400, { error: 'Expected a Cowart view state.' })
              return
            }

            await writeJsonAtomic(viewStateFile, viewState)
            sendJson(res, 200, { ok: true, path: viewStateFile })
            return
          }

          res.statusCode = 405
          res.setHeader('allow', 'GET, PUT')
          res.end()
        } catch (error) {
          sendJson(res, 500, { error: error.message })
        }
      })

      // Generate a single image (submit task -> poll -> download).
      // Reused for both single and multi-candidate generation.
      async function generateOnce({ prompt, referenceUrl, referenceDataUri, size, apiKey, baseUrl, cos, pageId, image2Path }) {
        const headers = {
          authorization: apiKey,
          'content-type': 'application/json'
        }

        async function trySubmit(withRef, withSize = true) {
          const basePath = image2Path && typeof image2Path === 'string' ? image2Path : '/v1/images/generations'
          const submitPath = basePath.includes('?') ? `${basePath}&async=true` : `${basePath}?async=true`
          const submitBody = {
            model: 'gpt-image-2',
            prompt,
            oversea: false
          }
          if (withSize && size) submitBody.size = size
          if (withRef) {
            if (referenceUrl) {
              submitBody.image = [referenceUrl]
            } else if (referenceDataUri) {
              submitBody.image = [referenceDataUri]
            }
          }

          const baseUrls = [...new Set([baseUrl, 'https://api.wike.cc'])]
          let lastError = null
          for (const bu of baseUrls) {
            try {
              const resp = await fetch(`${bu}${submitPath}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(submitBody),
                signal: AbortSignal.timeout(60000)
              })
              const text = await resp.text()
              let parsed = null
              try { parsed = JSON.parse(text) } catch {}
              if (parsed && parsed.code && parsed.code !== 200 && parsed.code !== 0) {
                throw new Error(`API ${parsed.code}: ${parsed.msg || '错误'}`)
              }
              if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`)
              return { baseUrl: bu, payload: parsed || {} }
            } catch (err) {
              lastError = err
            }
          }
          throw lastError
        }

        let taskData = null
        let usedBaseUrl = null
        try {
          const result = await trySubmit(true)
          taskData = result.payload
          usedBaseUrl = result.baseUrl
        } catch (errWithRef) {
          if (referenceDataUri) {
            try {
              const result = await trySubmit(false)
              taskData = result.payload
              usedBaseUrl = result.baseUrl
            } catch (errWithoutRef) {
              throw new Error(`生成失败（带参考图: ${errWithRef.message}; 不带参考图: ${errWithoutRef.message}）`)
            }
          } else if (size) {
            try {
              const result = await trySubmit(false, false)
              taskData = result.payload
              usedBaseUrl = result.baseUrl
            } catch (errWithoutSize) {
              throw new Error(`生成失败（带尺寸: ${errWithRef.message}; 不带尺寸: ${errWithoutSize.message}）`)
            }
          } else {
            throw errWithRef
          }
        }

        const taskId = taskData?.id
        if (!taskId) throw new Error('API 未返回任务 ID')

        const pollPath = `/v1/tasks/${encodeURIComponent(taskId)}`
        let taskResult = null
        for (let attempt = 0; attempt < 120; attempt++) {
          await new Promise((r) => setTimeout(r, 2000))
          try {
            const resp = await fetch(`${usedBaseUrl}${pollPath}`, { headers, signal: AbortSignal.timeout(30000) })
            const text = await resp.text()
            if (!resp.ok) continue
            taskResult = text ? JSON.parse(text) : {}
          } catch {
            continue
          }

          const pollState = taskResult?.state
          if (pollState === 'succeeded') break
          if (pollState === 'error' || pollState === 'failed') {
            throw new Error(`任务失败: ${taskResult?.data?.description ?? taskResult?.msg ?? '未知错误'}`)
          }
        }

        if (!taskResult || taskResult.state !== 'succeeded') {
          throw new Error('生成超时，请稍后重试。')
        }

        const images = taskResult?.data?.images
        if (!Array.isArray(images) || images.length === 0) {
          throw new Error('API 返回中没有图片。')
        }

        const imageUrl = images[0]?.url || images[0]?.image_url
        if (!imageUrl) throw new Error('图片 URL 为空。')

        const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(60000) })
        if (!imgResp.ok) throw new Error(`下载图片失败: ${imgResp.status}`)
        const imgBuffer = Buffer.from(await imgResp.arrayBuffer())
        const imgMimeType = imgResp.headers.get('content-type') || 'image/png'
        const imgExt = extensionFromMimeType(imgMimeType)

        const ts = Date.now()
        const fileName = `regen_${ts}${imgExt}`
        const targetPageId = pageId || 'page:page'
        const destDir = pageAssetsDir(targetPageId)
        await mkdir(destDir, { recursive: true })
        const destPath = join(destDir, fileName)
        await writeFile(destPath, imgBuffer)

        const fileSize = (await stat(destPath)).size
        const assetSrc = pageAssetUrl(targetPageId, fileName)

        return {
          fileName,
          src: assetSrc,
          fileSize,
          mimeType: imgMimeType,
          taskId,
          usedReference: referenceUrl !== null || referenceDataUri !== null,
          referenceUrl
        }
      }

      // Nano Banana (Gemini) image generation via Duomi proxy.
      // Endpoint: {baseUrl}/api/gemini/nano-banana
      // The response shape varies across aggregators, so we parse several
      // common layouts (OpenAI-style data[].url / b64_json, and Gemini-style
      // candidates[].content.parts[].inlineData.data). If the endpoint answers
      // with a task id instead of an image, we poll /api/gemini/tasks/{id}.
      function extractNanoImage(parsed) {
        if (!parsed || typeof parsed !== 'object') return null
        const data = parsed.data
        const taskPayload = data && typeof data === 'object' && !Array.isArray(data) ? data : parsed
        const nestedData = taskPayload?.data && typeof taskPayload.data === 'object' && !Array.isArray(taskPayload.data) ? taskPayload.data : null
        // 兼容多种聚合器返回：嵌套 data.images / taskPayload.images / parsed.images / OpenAI 风格 data[]
        const arr =
          Array.isArray(nestedData?.images) ? nestedData.images
          : Array.isArray(taskPayload?.images) ? taskPayload.images
          : Array.isArray(parsed?.images) ? parsed.images
          : Array.isArray(data) ? data
          : null
        if (arr && arr.length) {
          const item = arr[0]
          if (item && item.url) return { url: item.url }
          if (item && item.b64_json) return { b64: item.b64_json }
          if (item && item.image) return { url: item.image }
          if (item && item.inlineData && item.inlineData.data) return { b64: item.inlineData.data }
        }
        if (parsed.url) return { url: parsed.url }
        if (parsed.image) return { url: parsed.image }
        if (parsed.b64_json) return { b64: parsed.b64_json }
        // Gemini-style candidates
        const candidates = parsed.candidates || taskPayload?.candidates || nestedData?.candidates
        if (Array.isArray(candidates)) {
          for (const c of candidates) {
            const parts = c?.content?.parts
            if (Array.isArray(parts)) {
              for (const p of parts) {
                if (p?.inlineData?.data) return { b64: p.inlineData.data }
              }
            }
          }
        }
        return null
      }

      async function generateNanoBanana({ prompt, referenceUrl, referenceDataUri, size, apiKey, baseUrl, pageId, model, genParams, bananaPath }) {
        const nanoPath = bananaPath && typeof bananaPath === 'string' && bananaPath.trim() ? bananaPath.trim() : '/api/gemini/nano-banana'
        // 图生图走 nano-banana-edit 端点 + image_urls（与 cowart MCP server 一致）；
        // 文生图走 nano-banana。edit 路径在 query 前插入 -edit。
        const isEdit = !!(referenceUrl || referenceDataUri)
        const submitPath = isEdit ? nanoPath.replace(/(\?.*)?$/, (m, q) => `-edit${q || ''}`) : nanoPath
        const endpoint = `${baseUrl}${submitPath}`
        const headers = {
          authorization: apiKey,
          'content-type': 'application/json'
        }
        const body = {
          model: model || 'gemini-3-pro-image-preview',
          prompt,
          oversea: false
        }
        if (size) body.size = size
        // Forward the per-model generation params (aspect_ratio / image_size).
        // These are best-effort: ignored by the endpoint if unsupported.
        if (genParams && typeof genParams === 'object') {
          if (genParams.aspect_ratio && genParams.aspect_ratio !== 'auto') body.aspect_ratio = genParams.aspect_ratio
          if (genParams.image_size) body.image_size = genParams.image_size
        }
        if (isEdit) {
          // edit 端点用 image_urls；URL 优先（配了 COS），无 COS 时回退 dataURI（尽力而为）
          body.image_urls = [referenceUrl || referenceDataUri]
        }

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000)
        })
        const text = await resp.text()
        if (!resp.ok) {
          throw new Error(`Nano Banana HTTP ${resp.status}: ${text.slice(0, 400)}`)
        }

        let parsed = null
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new Error(`Nano Banana 返回非 JSON: ${text.slice(0, 400)}`)
        }

        // nano-banana 为异步：返回 task id 后需轮询。轮询路径优先 MCP 风格
        // /api/gemini/nano-banana/{id}，回退 /api/gemini/tasks/{id}，兼容历史。
        const taskId = parsed?.id ?? parsed?.data?.task_id ?? parsed?.task_id
        let pollResult = null
        const needsPoll = !!(taskId && !extractNanoImage(parsed))
        if (needsPoll) {
          const idEnc = encodeURIComponent(taskId)
          const pollPaths = [
            `/api/gemini/nano-banana/${idEnc}`,
            `/api/gemini/tasks/${idEnc}`
          ]
          for (let attempt = 0; attempt < 120; attempt++) {
            await new Promise((r) => setTimeout(r, 2000))
            for (const pollPath of pollPaths) {
              try {
                const pr = await fetch(`${baseUrl}${pollPath}`, { headers, signal: AbortSignal.timeout(30000) })
                if (!pr.ok) continue
                const pt = await pr.text()
                pollResult = pt ? JSON.parse(pt) : {}
                break
              } catch {
                continue
              }
            }
            if (!pollResult) continue
            const st = pollResult?.state || pollResult?.status || pollResult?.data?.state || pollResult?.data?.status
            if (st === 'succeeded' || st === 'success' || st === 'completed') break
            if (st === 'error' || st === 'failed') {
              throw new Error(`Nano Banana 任务失败: ${pollResult?.data?.description ?? pollResult?.msg ?? pollResult?.message ?? '未知错误'}`)
            }
            // 若本轮已能取到图，提前结束
            if (extractNanoImage(pollResult)) break
          }
          if (pollResult) parsed = pollResult
        }

        const imageObj = extractNanoImage(parsed)
        if (!imageObj) {
          // 进入过轮询却仍无图：多半是任务长时间未完成，报明确超时
          if (needsPoll) {
            const lastState = pollResult?.state || pollResult?.status || pollResult?.data?.state || pollResult?.data?.status || '未知'
            throw new Error(`Nano Banana 生成超时（约 240 秒未完成），最后状态：${lastState}。可稍后重试。`)
          }
          throw new Error('Nano Banana 响应中未找到图片（期望 data[].url / b64_json / candidates[].inlineData）。原始返回: ' + text.slice(0, 200))
        }

        let buffer
        let mimeType
        if (imageObj.url) {
          const imgResp = await fetch(imageObj.url, { signal: AbortSignal.timeout(60000) })
          if (!imgResp.ok) throw new Error(`下载图片失败: ${imgResp.status}`)
          buffer = Buffer.from(await imgResp.arrayBuffer())
          mimeType = imgResp.headers.get('content-type') || 'image/png'
        } else {
          let b64 = imageObj.b64
          let detectedMime = 'image/png'
          const m = /^data:([^;]+);base64,(.*)$/s.exec(b64)
          if (m) {
            detectedMime = m[1]
            b64 = m[2]
          }
          buffer = Buffer.from(b64, 'base64')
          mimeType = detectedMime
        }

        const imgExt = extensionFromMimeType(mimeType)
        const ts = Date.now()
        const fileName = `nano_${ts}${imgExt}`
        const targetPageId = pageId || 'page:page'
        const destDir = pageAssetsDir(targetPageId)
        await mkdir(destDir, { recursive: true })
        const destPath = join(destDir, fileName)
        await writeFile(destPath, buffer)
        const fileSize = (await stat(destPath)).size
        const assetSrc = pageAssetUrl(targetPageId, fileName)

        return {
          fileName,
          src: assetSrc,
          fileSize,
          mimeType,
          taskId,
          usedReference: referenceUrl !== null || referenceDataUri !== null,
          referenceUrl
        }
      }

      server.middlewares.use('/api/regenerate', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('allow', 'POST')
          res.end()
          return
        }

        try {
          const body = JSON.parse(await readRequestBody(req))
          const { prompt, referenceAssetSrc, apiBaseUrl, image2Path, bananaPath, apiKey, provider, pageId, size, cos, count, model, genParams } = body

          if (!prompt || typeof prompt !== 'string') {
            sendJson(res, 400, { error: 'prompt is required.' })
            return
          }
          // 生图需要 API Key，来源优先级：
          // ① 用户在「配置」填入的 Duomi Key（优先）；
          // ② 环境注入的图像 Key（WIKE_API_KEY / DUOMI_API_KEY / COWART_IMAGE_API_KEY，部分部署环境会注入）。
          // 二者都没有时，给用户清晰可操作的提示（不再误称"WorkBuddy 自有生图免配置"——wike.cc 同样需要有效 Key）。
          const hasUserKey = apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0
          const envImageKey = (process.env.WIKE_API_KEY || process.env.DUOMI_API_KEY || process.env.COWART_IMAGE_API_KEY || '').trim()
          const effectiveApiKey = hasUserKey ? apiKey.trim() : envImageKey
          const effectiveBaseUrl = (hasUserKey
            ? ((apiBaseUrl || 'https://duomiapi.com') + '')
            : 'https://api.wike.cc'
          ).trim().replace(/\/+$/, '')

          if (!effectiveApiKey) {
            sendJson(res, 400, {
              error:
                '生图需要一个 Duomi（多米）API Key。\n' +
                '① 打开底部「配置」填入你的 Key（仅存本机浏览器，不上传）；\n' +
                '② 或直接让我（WorkBuddy 助手）帮你生图——把需求发给我即可，无需配置。\n' +
                '获取 Key：https://duomiapi.com'
            })
            return
          }

          // Shared API base URL; per-model endpoint paths are appended by the generators.
          const sharedBase = effectiveBaseUrl

          let referenceUrl = null
          let referenceDataUri = null

          if (referenceAssetSrc && typeof referenceAssetSrc === 'string') {
            if (referenceAssetSrc.startsWith('data:')) {
              // A data URL (e.g. a photo uploaded directly in the dialog, or a
              // canvas image whose asset src is a data URL) is used as-is.
              referenceDataUri = referenceAssetSrc
            } else {
              const filePath = localAssetFilePathFromUrl(referenceAssetSrc)
              if (filePath) {
                const fileBuffer = await readFile(filePath)
                const mimeType = mimeTypes.get(extname(filePath).toLowerCase()) || 'image/png'
                referenceDataUri = `data:${mimeType};base64,${fileBuffer.toString('base64')}`

                if (cos && cos.secretId && cos.secretKey && COS) {
                  try {
                    const cosClient = new COS({
                      SecretId: cos.secretId,
                      SecretKey: cos.secretKey
                    })
                    const cosKey = `cowart-ref/${Date.now()}-${basename(filePath)}`
                    const cosBucket = cos.bucket || 'zip-1301894149'
                    const cosRegion = cos.region || 'ap-shanghai'
                    const cosDomain = (cos.domain || 'https://zip-1301894149.cos.ap-shanghai.myqcloud.com').replace(/\/+$/, '')

                    await new Promise((resolve, reject) => {
                      cosClient.putObject({
                        Bucket: cosBucket,
                        Region: cosRegion,
                        Key: cosKey,
                        Body: fileBuffer,
                        ContentType: mimeType
                      }, (err) => err ? reject(err) : resolve())
                    })

                    referenceUrl = `${cosDomain}/${cosKey}`
                  } catch (cosErr) {
                    console.error('COS upload failed:', cosErr.message)
                  }
                }
              }
            }
          }

          const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 4)
          // "banana" now requests the pro (Gemini) model by default; "nano"
          // is kept only for backward-compatibility with stored tasks.
          const useNano = provider === 'banana' || provider === 'nano'
          const taskFn = () =>
            useNano
              ? generateNanoBanana({ prompt, referenceUrl, referenceDataUri, apiKey: effectiveApiKey, baseUrl: sharedBase, bananaPath, cos, pageId, model, genParams })
              : generateOnce({ prompt, referenceUrl, referenceDataUri, size: genParams?.size, apiKey: effectiveApiKey, baseUrl: sharedBase, image2Path, cos, pageId })
          // 多候选用 allSettled 隔离：单张失败不拖累其余；全部失败才抛错，部分成功仍返回
          const settled = await Promise.allSettled(Array.from({ length: n }, () => taskFn()))
          const candidates = []
          const errors = []
          for (const r of settled) {
            if (r.status === 'fulfilled') candidates.push(r.value)
            else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
          }
          if (candidates.length === 0) {
            throw new Error(errors[0] || '生成失败')
          }
          if (errors.length > 0) {
            console.warn(`[cowart] ${errors.length}/${n} 候选生成失败：${errors.join(' | ')}`)
          }
          const primary = candidates[0]

          sendJson(res, 200, {
            ok: true,
            candidates,
            src: primary.src,
            fileName: primary.fileName,
            fileSize: primary.fileSize,
            mimeType: primary.mimeType,
            taskId: primary.taskId,
            usedReference: referenceUrl !== null || referenceDataUri !== null
          })
        } catch (error) {
          sendJson(res, 500, { error: error.message })
        }
      })

      server.middlewares.use('/api/canvas', async (req, res) => {
        try {
          if (req.method === 'GET') {
            const result = await loadCanvasSnapshot()
            sendJson(res, 200, result)
            return
          }

          if (req.method === 'PUT') {
            const body = await readRequestBody(req)
            const snapshot = JSON.parse(body)
            if (!snapshot || typeof snapshot !== 'object' || !snapshot.store || !snapshot.schema) {
              sendJson(res, 400, { error: 'Expected a tldraw store snapshot.' })
              return
            }

            const result = await saveCanvasSnapshot(snapshot)
            sendJson(res, 200, { ok: true, ...result })
            broadcastCanvasChanged(result)
            return
          }

          res.statusCode = 405
          res.setHeader('allow', 'GET, PUT')
          res.end()
        } catch (error) {
          sendJson(res, 500, { error: error.message })
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), canvasStoragePlugin()],
  server: {
    host: '127.0.0.1',
    port: 43217
  }
})
