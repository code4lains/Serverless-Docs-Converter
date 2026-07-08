# Serverless Docs Converter ⚡

基于 **Vue 3 + TypeScript** 的纯前端文档转换 Web 应用。所有处理均在浏览器中完成，无需后端服务器。可一键部署到 **Cloudflare Pages**。

![License](https://img.shields.io/badge/license-MIT-blue)
![Vue](https://img.shields.io/badge/Vue-3-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## ✨ 功能特性

### 支持的转换类型

| 源格式 | 目标格式 | 核心依赖 | 说明 |
|--------|----------|----------|------|
| DOCX | Markdown | mammoth + turndown | 图片可上传至 S3 对象存储 |
| CSV | Markdown | 内置解析器 | 正确处理引号字段、转义引号 |
| XLSX | Markdown | SheetJS | 多工作表支持，每个 Sheet 生成独立章节 |
| Markdown | DOCX | marked + docx | 完整支持标题、加粗、斜体、表格、列表、代码块 |
| Markdown | CSV | 内置解析器 | 提取表格内容，自动去除格式标记 |
| Markdown | XLSX | SheetJS | 每个表格生成独立 Sheet |

### S3 兼容对象存储（可选）

转换包含图片或媒体文件的文档时：

- 支持任何 **S3 兼容**存储：Cloudflare R2、AWS S3、MinIO、Backblaze B2 等
- 图片自动上传并以 Markdown 链接形式嵌入
- 配置信息保存在浏览器 `localStorage` 中
- **如果未配置**，文档中的媒体文件将被静默丢弃，不会报错或中断转换

### 代码分割与性能

每个转换模块通过 `import()` 动态导入实现**按需加载**。主应用包仅约 67 KB（gzip 压缩后），大型依赖库（mammoth、docx、xlsx、AWS SDK）**仅在用户点击转换按钮时才下载**。

| 分块 | Gzip 大小 | 加载时机 |
|------|-----------|----------|
| 主应用（Vue + UI） | ~67 KB | 始终加载 |
| DOCX → MD | ~130 KB | 用户转换 DOCX 为 MD 时 |
| MD → DOCX | ~115 KB | 用户转换 MD 为 DOCX 时 |
| XLSX（SheetJS） | ~140 KB | 用户转换 XLSX ↔ MD 时 |
| S3 客户端 | ~64 KB | 转换时存在 S3 配置 |
| CSV ↔ MD | < 1 KB | 用户转换 CSV ↔ MD 时 |

### 国际化（i18n）

- 🌐 右上角英文 / 中文切换按钮
- 首次访问自动检测浏览器语言
- 语言偏好持久化保存在 `localStorage` 中

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 18
- **npm** ≥ 9

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

应用将在 `http://localhost:5173/` 启动。

### 构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录，可直接用于静态托管。

## ☁️ 部署到 Cloudflare Pages

### 方式一：Git 集成

1. 将本仓库推送至 GitHub 或 GitLab
2. 前往 [Cloudflare 控制台 → Pages](https://dash.cloudflare.com/?to=/:account/pages)
3. 新建项目并关联你的仓库
4. 配置构建设置：
   - **构建命令：** `npm run build`
   - **构建输出目录：** `dist`
5. 点击部署

### 方式二：直接上传

```bash
# 安装 Wrangler CLI（如果尚未安装）
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署
npx wrangler pages deploy dist
```

## 🛠️ 技术栈

| 库 | 用途 |
|----|------|
| [Vue 3](https://vuejs.org/) | UI 框架 |
| [Vite](https://vite.dev/) | 构建工具与开发服务器 |
| [TypeScript](https://www.typescriptlang.org/) | 类型安全 |
| [vue-i18n](https://vue-i18n.intlify.dev/) | 国际化 |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | DOCX → HTML 提取 |
| [turndown](https://github.com/mixmark-io/turndown) | HTML → Markdown |
| [docx](https://github.com/dolanmiri/docx) | 编程式 DOCX 生成 |
| [marked](https://github.com/markedjs/marked) | Markdown 解析 |
| [xlsx (SheetJS)](https://sheetjs.com/) | Excel 读写 |
| [@aws-sdk/client-s3](https://github.com/aws/aws-sdk-js-v3) | S3 兼容存储上传 |
