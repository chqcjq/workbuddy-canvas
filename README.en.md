# Cowart Canvas (WorkBuddy Local Infinite Canvas)

Cowart is a local infinite-canvas application built on **tldraw**, running as a local web service. It connects "visual thinking → AI image generation → annotation iteration → text/image export" into a coherent workflow, ideal for design ideation, product-image generation, poster drafting, and extracting text from document screenshots.

Canvas data is persisted per page under the user project directory's `canvas/` folder and never enters the plugin repository.

> This repository is the WorkBuddy-adapted version, and can also run standalone as a local canvas.

中文说明: [README.md](README.md)

---

## Features

### Canvas & Editing
- **Infinite canvas**: Based on tldraw v5 — freehand drawing, text, shapes, arrows, marquee selection, zoom, and pan.
- **Per-page persistence**: Canvas is stored per page (`canvas/pages/<page-id>/cowart-canvas.json` + `assets/`), surviving refresh/reopen.
- **Minimap**: Live thumbnail in the bottom-right corner for quick canvas navigation.
- **Smart arrange**: One click organizes selected shapes into grid / horizontal / vertical / compact layouts and auto-connects them.
- **Version history**: Local snapshots (localStorage) — save and roll back anytime.
- **Empty-state onboarding**: A centered guide card appears when the canvas is empty, pointing to text-to-image / drawing / text entries.

### AI Image Generation
- **Text-to-image dialog**: Triggered from the bottom toolbar "✨ Text-to-Image" or "✨ Generate" when an AI image holder is selected; supports multiple candidates (1–4) for selection.
- **Two generation models** (switch via dropdown):
  - **Banana**: Requests the pro model by default (Gemini `gemini-3-pro-image-preview`, via Duomi's `gemini/nano-banana`). `aspect_ratio` enum (auto / 1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 4:5 / 5:4 / 9:16 / 16:9 / 21:9), `image_size` defaults to 4K.
  - **Image2**: `size` enum (auto by model / 1024×1024 / 1792×1024 / 1024×1792 / custom width×height, must be divisible by 16 and within limits), `quality` defaults to high.
- **Reference image (image-to-image)**: When exactly one image is selected on the canvas at submit time, it is passed as a reference to generate a new image related to the original.
- **Auto annotation line**: A newly generated image from a reference is automatically connected back to the original with a **blue dashed arrow** (labeled "参考图" / reference) after insertion, clearly showing the derivation relationship; the line is a tldraw binding and follows when shapes move.

### Templates & Prompts
- **Office & e-commerce prompt template library**: 14 built-in high-value templates in 3 groups (e-commerce 5 / brand·office 3 / marketing poster 6). Clicking a template loads its prompt into the text-to-image dialog; placeholders are editable before submit; templates needing a product hero image auto-prompt you to select an image first.

### Image & Text Tools
- **Paste-to-image**: `Ctrl/Cmd + V` paste or drag in images to drop them onto the canvas automatically.
- **OCR text extraction**: Select an image and click "📷 Extract Text" — uses tesseract.js to recognize Chinese/English locally in the browser (no server key needed). Built-in preprocessing (white background fill, smart upscaling, slight contrast boost) improves accuracy; recognized text is inserted as an editable text block.
- **Annotation summary**: Review annotation lists and export to Markdown.
- **Export**: The toolbar "📤 Export" supports PNG / SVG download and "copy as image" to clipboard (exports selection if any, otherwise the whole page).

---

## Requirements

- Windows / macOS / Linux
- Node.js 22 or above (22.22+ recommended)
- A modern browser (latest Chrome / Edge / Firefox)
- For AI image generation: a [Duomi (多米)](https://duomiapi.com) API Key

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

> Dependencies include `tesseract.js` (OCR, large), `cos-nodejs-sdk-v5`, `tldraw`, `react`, etc. The first install being slow is normal.

### 2. Start the canvas

```bash
npm run dev
```

By default it is served at **http://localhost:43217**; if the port is taken, vite migrates to `43218`, `43219`…, following the actual `Local:` URL printed in the terminal.

You can also use the wrapper script (auto-sets the project directory and handles extended-attribute fallbacks):

```bash
./scripts/start-canvas.sh /path/to/user/project
```

### 3. Configure the generation API Key

After opening the canvas, click the bottom toolbar **"API"** button and enter your Duomi API Key. The key is stored only in **browser localStorage** — it is never written into code or uploaded to any repository.

> Canvas editing, OCR, template browsing, and export work without a key; only AI image generation requires one.

---

## Usage Guide

### Generate images
1. Click bottom "✨ Text-to-Image" (or "✨ Generate" after selecting an AI image holder on the canvas).
2. Choose the model and size/quality params, enter a prompt, optionally set a "count" for multiple candidates.
3. Click generate; images are inserted into the canvas automatically once produced asynchronously.

### Reference image generation (image-to-image)
1. **Select 1 image** on the canvas as the reference.
2. Open the text-to-image dialog, enter a prompt, and submit (or click "Regenerate" on that image).
3. The new image lands beside the reference and is connected back with a blue dashed annotation line.

### Use prompt templates
1. Click "📋 Template Library", expand the "Office & E-commerce Prompts" section.
2. Pick a template — its prompt loads into the text-to-image dialog (placeholders editable).
3. Templates that need a product image will prompt you to select an image as the reference first.

### Extract image text (OCR)
1. Select an image.
2. A "📷 Extract Text" button appears at the bottom-left of the canvas; click to recognize.
3. The recognized result is inserted as an editable text block to the right of the image.

### Version history
- Bottom-left "🕘 History" button: manually save snapshots, view and roll back historical versions (stored in browser localStorage).

### Annotation summary & export
- Bottom-left "📝 Annotation" button: view the annotation list and export to Markdown.
- Toolbar "📤 Export": export PNG / SVG or copy as image.

### Smart arrange
- Select multiple shapes and use smart arrange to organize them into grid / horizontal / vertical / compact layouts with auto-connections.

---

## Project Structure (brief)

```
cowart/
├─ src/
│  ├─ App.jsx                 # Main frontend: canvas, dialogs, image insertion, annotation lines
│  ├─ styles.css
│  └─ features/               # Feature modules
│     ├─ OcrTool.jsx          # OCR text extraction (tesseract.js)
│     ├─ VersionHistory.jsx   # Version history
│     ├─ AnnotationSummary.jsx# Annotation summary
│     ├─ TemplateLibrary.jsx  # Prompt template library
│     ├─ SmartArrange.jsx     # Smart arrange
│     ├─ MinimapFeature.jsx   # Minimap
│     ├─ PasteToImage.jsx     # Paste-to-image
│     └─ promptTemplates.js   # Template data (extracted from ai-hand)
├─ vite.config.js             # vite + local backend (/api/regenerate, canvas asset serving)
├─ scripts/                   # Install / start / uninstall scripts
├─ docs/INSTALL-WORKBUDDY.md
└─ README.md
```

---

## Environment Variables

- `COWART_PORT`: Preferred local port, default `43217` (auto-migrates if taken).
- `COWART_PROJECT_DIR`: The user project directory the canvas data belongs to.
- `COWART_CANVAS_DIR`: Canvas data directory, default `$COWART_PROJECT_DIR/canvas`.

---

## Tech Stack

- **Frontend**: React 19, tldraw ^5.1.1, Vite ^7
- **OCR**: tesseract.js ^7 (in-browser local recognition, Chinese/English)
- **Backend**: Vite middleware (`/api/regenerate`, etc.), Node native
- **Storage**: Local filesystem (per-page JSON + asset directory)

---

## Acknowledgements

Cowart's canvas capability is built on [tldraw/tldraw](https://github.com/tldraw/tldraw).

WorkBuddy's canvas references [morningddy/cowart-workbuddy](https://github.com/morningddy/cowart-workbuddy).

- Original author: ZHONG XIN ([https://www.jiqiren.ai](https://www.jiqiren.ai))
- WorkBuddy adaptation: 田琳 (Lynn)

---

## License

This project is for learning and exchange purposes only.
