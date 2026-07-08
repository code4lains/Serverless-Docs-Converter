# Serverless Docs Converter ⚡

A pure frontend document conversion web app built with **Vue 3 + TypeScript**. All processing runs entirely in the browser — no server required. Designed for one-click deployment to **Cloudflare Pages**.

![License](https://img.shields.io/badge/license-MIT-blue)
![Vue](https://img.shields.io/badge/Vue-3-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## ✨ Features

### Supported Conversions

| From | To | Key Library | Notes |
|------|----|-------------|-------|
| DOCX | Markdown | mammoth + turndown | Images can be uploaded to S3 |
| CSV | Markdown | Built-in parser | Handles quoted fields, escaped quotes |
| XLSX | Markdown | SheetJS | Multi-sheet support, each sheet becomes a section |
| Markdown | DOCX | marked + docx | Headings, bold, italic, tables, lists, code blocks |
| Markdown | CSV | Built-in parser | Extracts tables, strips formatting |
| Markdown | XLSX | SheetJS | Each table becomes a separate sheet |

### S3-Compatible Object Storage (Optional)

When converting documents containing images or media files:

- Supports any **S3-compatible** storage: Cloudflare R2, AWS S3, MinIO, Backblaze B2, etc.
- Images are automatically uploaded and embedded as Markdown links
- Configuration is saved locally in `localStorage`
- **If not configured**, embedded media is simply discarded — no error, no interruption

### Code Splitting & Performance

Each converter module is **lazy-loaded on demand** via dynamic `import()`. The main app bundle is only ~67 KB gzipped. Heavy libraries (mammoth, docx, xlsx, AWS SDK) are downloaded **only when the user clicks convert**.

| Chunk | Gzip Size | Loaded When |
|-------|-----------|-------------|
| Main app (Vue + UI) | ~67 KB | Always |
| DOCX → MD | ~130 KB | User converts DOCX to MD |
| MD → DOCX | ~115 KB | User converts MD to DOCX |
| XLSX (SheetJS) | ~140 KB | User converts XLSX ↔ MD |
| S3 Client | ~64 KB | S3 config is present during conversion |
| CSV ↔ MD | < 1 KB | User converts CSV ↔ MD |

### Internationalization (i18n)

- 🌐 English / 中文 toggle in the top-right corner
- Auto-detects browser language on first visit
- Language preference persisted in `localStorage`

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will be available at `http://localhost:5173/`.

### Build

```bash
npm run build
```

Output goes to the `dist/` directory, ready for static hosting.

## ☁️ Deploy to Cloudflare Pages

### Option A: Git Integration

1. Push this repository to GitHub or GitLab
2. Go to [Cloudflare Dashboard → Pages](https://dash.cloudflare.com/?to=/:account/pages)
3. Create a new project and connect your repository
4. Configure build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Deploy

### Option B: Direct Upload

```bash
# Install Wrangler CLI if not already installed
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
npx wrangler pages deploy dist
```
## 🛠️ Tech Stack

| Library | Purpose |
|---------|---------|
| [Vue 3](https://vuejs.org/) | UI framework |
| [Vite](https://vite.dev/) | Build tool & dev server |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [vue-i18n](https://vue-i18n.intlify.dev/) | Internationalization |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | DOCX → HTML extraction |
| [turndown](https://github.com/mixmark-io/turndown) | HTML → Markdown |
| [docx](https://github.com/dolanmiri/docx) | Programmatic DOCX creation |
| [marked](https://github.com/markedjs/marked) | Markdown parsing |
| [xlsx (SheetJS)](https://sheetjs.com/) | Excel read/write |
| [@aws-sdk/client-s3](https://github.com/aws/aws-sdk-js-v3) | S3-compatible uploads |
