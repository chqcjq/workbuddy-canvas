# Cowart 画布（WorkBuddy 本地无限画布）

Cowart 是一个基于 **tldraw** 的本地无限画布应用，运行在本地网页服务中。它把「可视化构思 → AI 生图 → 标注迭代 → 文字/图片导出」串成一条连贯的工作流，适合做设计构思、商品图生成、海报草编、文档截图转文字等场景。

画布数据默认保存在用户项目目录的 `canvas/` 下，按页面分文件持久化，不会进入插件仓库。

> 本仓库是面向 WorkBuddy 客户端的适配版本，同时也可作为独立本地画布直接运行。

---

## 功能特性

### 画布与编辑
- **无限画布**：基于 tldraw v5，支持自由绘制、文字、形状、箭头、框选、缩放、平移。
- **按页持久化**：画布按页面拆分存储（`canvas/pages/<page-id>/cowart-canvas.json` + `assets/`），刷新/重开不丢失。
- **小地图**：右下角实时缩略图，快速定位画布位置。
- **智能排版**：一键把选中图形整理为网格 / 横向 / 纵向 / 紧凑布局，并自动连线。
- **版本历史**：本地快照（localStorage），可随时保存与回溯。
- **空白引导层**：画布为空时居中引导卡片，提示文生图 / 绘制 / 文字等入口。

### AI 生图
- **文生图对话框**：底部工具栏「✨文生图」或选中 AI 图片框时「✨生成」唤起，支持多候选（1–4 张）择优。
- **两种生图模型**（下拉切换）：
  - **Banana**：默认请求 pro 模型（Gemini `gemini-3-pro-image-preview`，经 Duomi `gemini/nano-banana` 接入）。`aspect_ratio` 枚举（auto / 1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 4:5 / 5:4 / 9:16 / 16:9 / 21:9），`image_size` 默认 4K。
  - **Image2**：`size` 枚举（auto 由模型决定 / 1024×1024 / 1792×1024 / 1024×1792 / 自定义宽×高，要求能被 16 整除且不超限），`quality` 默认 high。
- **参考图（图生图）**：提交时若画布恰好选中 1 张图片，会作为参考图传入，生成与原图相关的新图。
- **自动标注线**：用参考图生成的新图，落图后会自动画一条**蓝色虚线箭头**连回原图（带「参考图」标签），清晰体现衍生关系；连线为 tldraw 绑定，移动图形会跟随。

### 模板与提示词
- **办公 & 电商提示词模板库**：内置 14 个高价值模板，分 3 组（电商 5 / 品牌·办公 3 / 营销海报 6）。点击模板即把提示词载入文生图对话框，占位符可编辑后再提交；需要商品主图作参考的模板会自动提示先选中图片。

### 图片与文字工具
- **粘贴即落图**：直接 `Ctrl/Cmd + V` 粘贴或拖入图片，自动落为画布图片。
- **OCR 提取文字**：选中一张图片点「📷 提取文字」，用 tesseract.js 在浏览器本地识别中英文（无需服务端密钥）。内置预处理（白底铺满、智能放大、轻微对比增强）以提升准确率，识别结果生成可编辑文本块。
- **标注汇总**：评审标注列表化查看，支持导出 Markdown。
- **导出**：工具栏「📤导出」支持 PNG / SVG 下载，以及「复制为图片」到剪贴板（选中则导出选中，否则导出整页）。

---

## 系统要求

- Windows / macOS / Linux
- Node.js 22 及以上（推荐 22.22+）
- 现代浏览器（Chrome / Edge / Firefox 最新版）
- 如需 AI 生图：一个 [Duomi（多米）](https://duomiapi.com) API Key

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

> 依赖包含 `tesseract.js`（OCR，体积较大）、`cos-nodejs-sdk-v5`、`tldraw`、`react` 等，首次安装稍慢属正常。

### 2. 启动画布

```bash
npm run dev
```

默认访问 **http://localhost:43217**；端口被占用时 vite 会自动迁移到 `43218`、`43219`……以终端输出的 `Local:` 实际 URL 为准。

也可使用封装脚本（自动设置项目目录、处理扩展属性兜底）：

```bash
./scripts/start-canvas.sh /path/to/user/project
```

### 3. 配置生图 API Key

打开画布后，点击底部工具栏的 **「API」** 按钮，填入你的 Duomi API Key。Key 仅保存在**浏览器 localStorage**，不会写入代码或上传到任何仓库。

> 不配置 Key 也能使用画布编辑、OCR、模板浏览、导出等本地功能；只有 AI 生图需要 Key。

---

## 使用指南

### 生成图片
1. 点击底部「✨文生图」（或选中画布上的 AI 图片框后点「✨生成」）。
2. 选择生图模型与尺寸/质量参数，输入提示词，可选「数量」出多张候选。
3. 点击生成，图片异步产出后自动插入画布。

### 参考图生成（图生图）
1. 在画布中**选中 1 张图片**作为参考。
2. 打开文生图对话框输入提示词并提交（或对该图点「重生成」）。
3. 新图生成后会落在参考图旁，并用蓝色虚线标注线连回原图。

### 使用提示词模板
1. 点击「📋 模板库」，展开「办公 & 电商 提示词」分区。
2. 选择模板，提示词自动载入文生图对话框（占位符可编辑）。
3. 需要商品图的模板会提示你先选中一张图片作为参考图。

### 提取图片文字（OCR）
1. 选中一张图片。
2. 画布左下出现「📷 提取文字」按钮，点击即可识别。
3. 识别结果作为可编辑文本块插入图片右侧。

### 版本历史
- 左下「🕘 历史」按钮：手动保存快照、查看并回溯历史版本（存于浏览器 localStorage）。

### 标注汇总与导出
- 左下「📝 标注」按钮：查看评审标注列表，导出为 Markdown。
- 工具栏「📤导出」：导出 PNG / SVG 或复制为图片。

### 智能排版
- 选中多个图形，使用智能排版把元素规整为网格 / 横纵 / 紧凑布局并自动连线。

---

## 项目结构（简要）

```
cowart/
├─ src/
│  ├─ App.jsx                 # 主前端：画布、对话框、落图、标注线
│  ├─ styles.css
│  └─ features/               # 功能模块
│     ├─ OcrTool.jsx          # OCR 提取文字（tesseract.js）
│     ├─ VersionHistory.jsx   # 版本历史
│     ├─ AnnotationSummary.jsx# 标注汇总
│     ├─ TemplateLibrary.jsx  # 提示词模板库
│     ├─ SmartArrange.jsx     # 智能排版
│     ├─ MinimapFeature.jsx   # 小地图
│     ├─ PasteToImage.jsx     # 粘贴即落图
│     └─ promptTemplates.js   # 模板数据（来自 ai-hand 提取）
├─ vite.config.js             # vite + 本地后端（/api/regenerate、画布资源服务）
├─ scripts/                   # 安装 / 启动 / 卸载脚本
├─ docs/INSTALL-WORKBUDDY.md
└─ README.md
```

---

## 环境变量

- `COWART_PORT`：本地服务首选端口，默认 `43217`（被占用自动迁移）。
- `COWART_PROJECT_DIR`：画布数据所属的用户项目目录。
- `COWART_CANVAS_DIR`：画布数据目录，默认 `$COWART_PROJECT_DIR/canvas`。

---

## 技术栈

- **前端**：React 19、tldraw ^5.1.1、Vite ^7
- **OCR**：tesseract.js ^7（浏览器端本地识别，中英文）
- **后端**：Vite 中间件（`/api/regenerate` 等），Node 原生
- **存储**：本地文件系统（按页 JSON + 资源目录）

---

## 致谢

Cowart 的画布能力基于 [tldraw/tldraw](https://github.com/tldraw/tldraw) 实现。

WorkBuddy 的画布参考 [morningddy/cowart-workbuddy](https://github.com/morningddy/cowart-workbuddy) 实现。

- 原版作者：ZHONG XIN（[https://www.jiqiren.ai](https://www.jiqiren.ai)）
- WorkBuddy 适配：田琳 (Lynn)

---

## 许可证

本项目仅供学习与交流使用。
