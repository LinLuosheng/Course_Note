# CourseNote - AI 课程笔记生成器

基于 Electron + React + Vite 的桌面应用，自动将课程视频转化为图文并茂的智能笔记。

## 功能特性

- **语音转录** — 基于 Whisper 自动识别视频语音，生成带时间戳的文字稿
- **幻灯片提取** — 智能检测 PPT 切换，提取关键帧（pHash 去重，避免重复图片）
- **AI 笔记生成** — 调用大模型（OpenAI / DeepSeek / Claude 等）将转录 + 截图整理成结构化 Markdown 笔记
- **时间戳跳转** — 笔记中点击时间标记，视频自动跳转到对应位置
- **在线课程下载** — 支持 YouTube、B站 等平台，自动识别单视频/合集，边下载边分析
- **多视频合集** — 创建合集项目，批量管理系列课程，逐个分析、逐个学习
- **知识卡片** — 自动提取知识点生成闪卡，支持记忆曲线复习
- **题库管理** — AI 自动生成练习题，支持从 PDF/图片导入题库
- **PPT 导出** — 将笔记一键导出为 PowerPoint
- **TTS 语音合成** — 基于 VoxCPM2 将笔记转为语音
- **学习统计** — 记录学习时长、连续打卡天数

## 项目结构

```
├── app/                        # Electron 应用
│   ├── src/main/               # 主进程
│   │   ├── main.ts             # 入口，窗口管理，媒体服务器
│   │   ├── ipc-handlers.ts     # IPC 通信处理
│   │   ├── pipeline.ts         # 视频处理流水线编排
│   │   ├── python-bridge.ts    # Python 子进程通信
│   │   ├── video-downloader.ts # yt-dlp 在线视频下载
│   │   ├── pptx-exporter.ts    # PPT 导出
│   │   └── project-exporter.ts # 项目导入导出
│   ├── src/preload/            # 预加载脚本
│   ├── src/renderer/           # 渲染进程（React）
│   │   ├── App.tsx             # 主界面
│   │   ├── components/         # UI 组件
│   │   └── store/              # Zustand 状态管理
│   └── src/shared/             # 共享类型定义
├── engine/                     # Python 处理引擎
│   ├── main.py                 # 引擎入口
│   ├── transcriber.py          # 语音转录
│   ├── slide_extractor.py      # 幻灯片提取
│   ├── summarizer.py           # AI 笔记生成
│   ├── flashcard_generator.py  # 知识卡片生成
│   └── question_engine.py      # 题库引擎
└── scripts/                    # 启动脚本
```

## 安装与运行

### 环境要求

- Node.js >= 18
- Python >= 3.10
- FFmpeg（已包含在 `bin/` 目录）
- yt-dlp（在线下载功能需要）

### 安装依赖

```bash
cd app
npm install

# Python 依赖
cd ../engine
pip install -r requirements.txt
```

### 开发模式

```bash
# 一键启动（编译 + 运行）
scripts\start.bat

# 或手动启动
cd app
npm run build        # 编译主进程 + 渲染进程
npm start            # 启动 Electron
```

### 前端开发（热更新）

```bash
cd app
npm run dev:renderer  # Vite 开发服务器 http://localhost:5180
# 另一个终端
npm run build:main && npm start  # 启动 Electron
```

## 配置

首次运行后，在应用内点击 **设置** 按钮配置：

- **LLM 提供商** — OpenAI / DeepSeek / Claude / Ollama / LM Studio
- **API Key** — 对应提供商的密钥
- **模型选择** — 自动拉取可用模型列表
- **Whisper 模型** — 语音转录模型大小
- **项目存储路径** — 默认为 `课程总结/projects/`

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron |
| 前端 | React + TypeScript |
| 构建 | Vite + electron-builder |
| 状态管理 | Zustand |
| 笔记编辑 | Markdown 编辑器 |
| 语音转录 | OpenAI Whisper |
| 幻灯片提取 | OpenCV (pHash 去重) |
| AI 总结 | OpenAI 兼容 API |
| 视频下载 | yt-dlp |

## License

MIT
