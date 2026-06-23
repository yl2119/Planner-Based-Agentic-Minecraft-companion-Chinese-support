# Janet 中文版 — 我的世界 AI 伙伴 🏯

> *Janet Chinese Edition — Minecraft AI Companion*

基于 [Planner-Based Agentic Minecraft Companion](https://github.com/Ing-Ji/Planner-Based-Agentic-Minecraft-companion) 的中文本地化优化版本。本仓库：`yl2119/Planner-Based-Agentic-Minecraft-companion-Chinese-support`。

> *A Chinese-localized fork. Lets Janet listen, speak, and think in Chinese — no overseas services required.*

---

## ✨ 特性 / Features

| 组件 Component | 原版 Original | 中文版 Chinese Edition |
|------|------|--------|
| 🎤 **语音输入 ASR** | faster-whisper (English) | faster-whisper → **中文普通话 Mandarin** |
| 🔊 **语音输出 TTS** | Kokoro (English only) | **MOSS-TTS-Nano** → 中文语音克隆 (本地捆绑，无需 GitHub) |
| 🧠 **大语言模型 LLM** | GPT-4o-mini (overseas) | **DeepSeek-V4-Flash** → 国内直接可用，快速响应 |

- MOSS-TTS-Nano 仅 **0.1B 参数**，CPU 即可运行 / *runs on CPU*
- TTS 源码**捆绑在项目中**，安装时不需要访问 GitHub
- 首次运行自动从 HuggingFace 下载 ONNX 模型（~500MB，仅一次）
- 支持 **20 种语言**，中文效果优秀 / *20 languages supported*
- 语音克隆：提供参考音频即可自定义音色 / *Voice cloning via reference audio*
- 自动检测 MC 版本 / *Auto-detects Minecraft version* for recipe data

---

## 环境要求 / Prerequisites

| 依赖 Dependency | 版本/说明 Version |
|------|-----------|
| Node.js | v18–22 (LTS) |
| Python | **3.11+** (MOSS-TTS-Nano 需要 / required) |
| Minecraft | Java Edition (auto-detect version) |
| ffmpeg | provides ffplay for TTS playback |

### 安装 ffmpeg / Install ffmpeg

```bash
# Ubuntu/Debian
sudo apt install ffmpeg
sudo apt install -y python3.11 python3.11-venv

# macOS
brew install ffmpeg python@3.11

# Windows
# Download ffmpeg from https://ffmpeg.org/download.html, add to PATH
# Install Python 3.11+ from https://www.python.org/downloads/
```

---

## 快速开始 / Quick Start

### 1. 配置 API Key / Configure API Key

```bash
cp keys.example.json keys.json
```

编辑 `keys.json`，填入你的 DeepSeek API Key / *Edit and fill in your DeepSeek API Key*：

```json
{
    "DEEPSEEK_API_KEY": "sk-your-api-key-here",
    ...
}
```

> 💡 申请 API Key / *Get an API key*: [platform.deepseek.com](https://platform.deepseek.com)

### 2. 安装依赖 / Install Dependencies

```bash
npm install
```

> 首次运行时会自动创建 Python 虚拟环境并安装 TTS 依赖（包括 PyTorch ~2.5GB）。TTS 源码已捆绑在项目中，无需 GitHub 访问。
> *First run auto-creates a Python venv and installs TTS deps (incl. PyTorch ~2.5GB). TTS source is bundled — no GitHub needed.*

### 3. 国内用户设置 HuggingFace 镜像 / China Users: Set HF Mirror

TTS 模型首次运行需从 HuggingFace 下载（~500MB，仅一次）：

```bash
export HF_ENDPOINT=https://hf-mirror.com
```

### 4. TTS 参考音频 / TTS Reference Audio

MOSS-TTS-Nano 使用**语音克隆技术**，需要一段参考音频决定输出音色。
> *MOSS-TTS-Nano uses voice cloning — a reference audio clip determines the output voice.*

#### 默认配置 / Default (plug-and-play)

项目自带中文女声参考音频 `assets/audio/zh_1.wav`。
> *A default Chinese female voice reference is bundled at `assets/audio/zh_1.wav`.*

#### 自定义参考音频 / Custom Reference Audio

**方法一 / Method 1 — 环境变量 / Environment Variable：**

```bash
export MOSS_REF_AUDIO=assets/audio/your_voice.wav
node main.js
```

**方法二 / Method 2 — 修改 Profile / Edit Profile (`profiles/deepseek.json`)：**

```json
{
    "speak_model": "moss_tts/your_voice_filename"
}
```

文件名会自动在 `assets/audio/` 下查找。

> 💡 **参考音频建议 / Tips**: 5–15 秒清晰语音，WAV 格式，单人说话，背景安静。

### 5. 启动 Minecraft / Launch Minecraft

- 打开 Minecraft Java 版 / *Open Minecraft Java Edition*
- 进入世界 → ESC → **对局域网开放 / Open to LAN** → 端口设为 / *port* **55916**

### 6. 启动 Janet / Launch Janet

```bash
# 正常启动（GPU 加速 TTS）
node main.js

# 强制 CPU 模式（GPU 不可用时）
node main.js --tts-cpu

# 切换世界（清除旧任务和记忆）
node main.js --clean

# 组合使用
node main.js --clean --tts-cpu
```

首次启动自动完成 / *First launch will automatically*：
- 创建 Python 3.11 虚拟环境 (~3 min，安装 PyTorch 等)
- 下载 ASR 模型 faster-whisper small (~500MB)
- 下载 MOSS-TTS-Nano ONNX 模型 (~500MB，仅一次)
- 国内用户先设 `export HF_ENDPOINT=https://hf-mirror.com` 加速下载

> ⏳ 首次启动 8–15 分钟，后续秒级。首次启动被强制关闭无副作用，下次运行从断点继续。

> 💡 **切换世界？** 记得用 `node main.js --clean` 清除旧任务和记忆，否则 Janet 会带着上一世界的任务状态进入新世界。

浏览器自动打开管理界面 `http://localhost:8080`。

---

## 语音交互 / Voice Interaction

### 🎤 语音输入 ASR (Speech-to-Text)

- **按住 `V` 键**说话，松开自动识别发送
- 默认 **中文普通话**
- 切换语言 / *Switch language*：

```bash
export ASR_LANGUAGE=zh    # 中文 Mandarin (default)
export ASR_LANGUAGE=en    # 英文 English
```

### 🔊 语音输出 TTS (Text-to-Speech)

- Janet 的回复通过 MOSS-TTS-Nano 合成中文语音播放
- `ffplay` 播放音频
- 设置 `"speak": false` 关闭语音 / *disable TTS*

---

## 配置说明 / Configuration

### settings.js

| 配置项 Key | 默认值 Default | 说明 Description |
|--------|--------|------|
| `language` | `"zh-CN"` | 翻译语言 / Translation language |
| `profiles` | `["./profiles/deepseek.json"]` | 模型配置 / Model profile |
| `asr_enabled` | `true` | 启用语音输入 / Enable ASR |
| `asr_port` | `8090` | ASR 服务端口 |
| `asr_key` | `"v"` | 按键 / Push-to-talk key |
| `speak` | `true` | 启用语音输出 / Enable TTS |
| `minecraft_version` | `"auto"` | MC 版本自动检测 / Auto-detect |
| `host` | `"localhost"` | MC 服务器地址 |
| `port` | `55916` | MC 端口 |

### 切换 LLM / Switch LLM

修改 `settings.js` → `profiles` 数组：

| Profile | 模型 Model |
|---------|-----------|
| `deepseek.json` | DeepSeek-V4-Flash **(default, fast & affordable)** |
| `deepseek.json` (改 model) | DeepSeek-V4-Pro (旗舰 / flagship) |
| `gpt.json` | OpenAI GPT |
| `claude.json` | Anthropic Claude |
| `qwen.json` | Qwen (通义千问) |
| `llama.json` | Llama (Ollama local) |

### TTS 模型存储 / TTS Model Storage

ONNX 模型默认下载到 `models/moss_tts/`（已在 `.gitignore` 中）。可通过环境变量自定义：

```bash
export MOSS_MODEL_DIR=/your/custom/path
```

### 跨 MC 版本 / Multi-Version Support

`"minecraft_version": "auto"` 自动检测服务器版本并加载对应配方。支持 1.18–1.21+。

---

## 项目结构 / Project Structure

```
janet_chinese_support/
├── main.js                 # 入口 / Entry point
├── settings.js             # 配置 / Runtime config
├── keys.json               # API 密钥 (自行创建 / create from example)
├── profiles/
│   └── deepseek.json       # DeepSeek-V4-Flash profile (中文 prompt)
├── src/
│   ├── agent/
│   │   ├── speak.js        # TTS 语音输出逻辑 (moss_tts + remote)
│   │   └── moss_tts/       # MOSS-TTS-Nano 服务 (NEW)
│   │       ├── MOSS-TTS-Nano/  # 捆绑的 TTS 源码 (无需 GitHub)
│   │       ├── moss-tts-server.py  # Python FastAPI (:8001)
│   │       ├── tts_launcher.js     # Node.js 生命周期管理
│   │       └── requirements.txt    # Python 依赖
│   ├── asr/
│   │   ├── asr_server/     # faster-whisper ASR (:8090)
│   │   ├── voice_bridge/   # Push-to-talk bridge
│   │   └── launcher.js     # ASR 生命周期管理
│   └── models/
│       └── deepseek.js     # DeepSeek API client
├── assets/audio/
│   └── zh_1.wav            # 默认中文女声参考音频
├── models/moss_tts/        # ONNX 模型缓存 (首次自动下载，gitignore)
└── tasks/                  # 预定义任务 / Task definitions
```

---

## 常见问题 / FAQ

### TTS 启动失败 / TTS Startup Failure

```bash
# Python 版本不对？确认 3.11+
python3 --version  # 应该 >= 3.11

# 缺少 tn 模块？
# 确认 WeTextProcessing 已安装
/home/.../moss_tts/.venv/bin/pip list | grep WeTextProcessing

# 模型下载失败？国内用镜像
export HF_ENDPOINT=https://hf-mirror.com
# 然后删除 models/moss_tts/ 重新下载
```

### ASR 不识别中文 / ASR Not Recognizing Chinese

```bash
export ASR_LANGUAGE=zh
# 检查麦克风
python3 -c "import sounddevice; print(sounddevice.query_devices())"
```

### DeepSeek API 失败 / API Failure

- 确认 `keys.json` 中 `DEEPSEEK_API_KEY` 已正确填写
- 检查网络是否能访问 `https://api.deepseek.com`
- 确认账户余额充足
- 如需切换 Pro 模型：修改 `profiles/deepseek.json` 中 `"model"` 为 `"deepseek-v4-pro"`

### Janet 回复是英文 / Janet Responds in English

- 确认 `profiles/deepseek.json` 的 `conversing` 字段包含中文系统提示
- 确认 `settings.js` 的 `init_message` 使用中文

### 切换世界后 Janet 行为异常 / Janet Acts Weird After Switching Worlds

任务和记忆持久化在 `bots/<agent>/tasks/` 和 `bots/<agent>/memory.json`。换世界后旧任务状态仍在，导致 Janet 执行不存在的任务。

```bash
# 换世界时使用 --clean 清除
node main.js --clean

# 或手动清除
rm -rf bots/deepseek/tasks/ bots/deepseek/memory.json
```

### TTS 声音不合适 / TTS Voice Sounds Wrong

当前默认用 `zh_3.wav`（女声）。`assets/audio/` 下还有其他可选：

```bash
ls assets/audio/
# zh_1.wav  zh_3.wav  zh_4.wav  zh_6.wav  zh_10.wav  zh_11.wav
```

修改 `profiles/deepseek.json` 中 `speak_model` 的编号切换，如 `moss_tts/zh_4`。

### 端口冲突 / Port Conflict

```
ASR: 8090 | TTS: 8001 | MindServer: 8080
→ Modify in settings.js if ports clash
→ Or: lsof -ti:8080 | xargs kill -9
```

---

## 技术架构 / Architecture

```
┌──────────────────────────────────────────┐
│              Minecraft                    │
│       (Java Edition, any 1.18+)          │
└──────────┬────────────────────────────────┘
           │ Mineflayer (auto-detect version)
┌──────────▼────────────────────────────────┐
│           Node.js Main Process            │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │ speak.js │ │ agent.js │ │ main.js   │ │
│  │ (TTS)    │ │ (LLM)    │ │ (orch.)   │ │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ │
└───────┼─────────────┼─────────────┼───────┘
        │             │             │
   ┌────▼────┐   ┌────▼────┐   ┌───▼──────┐
   │MOSS-TTS │   │DeepSeek │   │   ASR    │
   │ :8001   │   │ V4-Flash│   │  :8090   │
   │ Python  │   │ HTTPS   │   │ Python   │
   │ 3.11+   │   │         │   │          │
   └─────────┘   └─────────┘   └──────────┘
  Chinese TTS     LLM Brain    Chinese STT
  (bundled src)   (China OK)   (faster-whisper)
```

---

## 致谢 / Acknowledgments

- [Mindcraft](https://github.com/mindcraft-bots/mindcraft) — original LLM-based Minecraft agentic framework
- [Planner-Based Agentic Minecraft Companion](https://github.com/Ing-Ji/Planner-Based-Agentic-Minecraft-companion) — upstream fork with task planning
- [MOSS-TTS-Nano](https://github.com/OpenMOSS/MOSS-TTS-Nano) — lightweight multilingual TTS by OpenMOSS Team (Fudan University)
- [DeepSeek](https://platform.deepseek.com) — LLM API (V4-Flash)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — CTranslate2-based ASR
- [minecraft-data](https://github.com/PrismarineJS/minecraft-data) — version-specific game data

## License

MIT
