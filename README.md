# Janet 中文版 — 我的世界 AI 伙伴 🏯

> *Janet Chinese Edition — Minecraft AI Companion*

基于 [Planner-Based Agentic Minecraft Companion](https://github.com/Ing-Ji/Planner-Based-Agentic-Minecraft-companion) 的中文本地化优化版本。

> *A Chinese-localized fork of the Planner-Based Agentic Minecraft Companion. Lets Janet listen, speak, and think in Chinese.*

---

## ✨ 特性 / Features

| 组件 Component | 原版 Original | 中文版 Chinese Edition |
|------|------|--------|
| 🎤 **语音输入 ASR** | faster-whisper (English) | faster-whisper → **中文普通话 Mandarin** |
| 🔊 **语音输出 TTS** | Kokoro (English only) | **MOSS-TTS-Nano** → 中文语音克隆 Chinese voice cloning |
| 🧠 **大语言模型 LLM** | GPT-4o-mini (overseas) | **DeepSeek** → 国内直接可用 Accessible in China |

- MOSS-TTS-Nano 仅 **0.1B 参数 / parameters**，CPU 即可运行 / runs on CPU
- 支持 **20 种语言 / languages**，中文效果优秀
- 语音克隆技术：提供参考音频即可自定义音色 / *Voice cloning: customize voice with a reference audio clip*
- 自动检测 MC 版本 / *Auto-detects Minecraft version* for correct recipes

---

## 环境要求 / Prerequisites

| 依赖 Dependency | 版本/说明 Version |
|------|-----------|
| Node.js | v18–20 (LTS) |
| Python | 3.10+ |
| Minecraft | Java Edition (auto-detect version) |
| ffmpeg | provides ffplay for TTS playback |

### 安装 ffmpeg / Install ffmpeg

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html, add to PATH
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

### 3. TTS 参考音频 / TTS Reference Audio

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
> *Filenames are resolved under `assets/audio/` automatically.*

> 💡 **参考音频建议 / Tips**: 5–15 秒清晰语音，WAV 格式，单人说话，背景安静。
> *5–15s clean speech, WAV format, single speaker, quiet background.*

### 4. 启动 Minecraft / Launch Minecraft

- 打开 Minecraft Java 版 / *Open Minecraft Java Edition*
- 进入世界 → ESC → **对局域网开放 / Open to LAN** → 端口设为 / *port* **55916**

### 5. 启动 Janet / Launch Janet

```bash
node main.js
```

首次启动自动完成 / *First launch will automatically*：
- 创建 Python 虚拟环境并安装依赖 / *Create Python venv & install deps*
- 下载 ASR 模型 faster-whisper small (~500MB)
- 下载 MOSS-TTS-Nano ONNX 模型 (~500MB)

> ⏳ 首次启动 5–10 分钟，后续秒级启动。
> *First launch ~5–10 min; subsequent launches are fast.*

成功后浏览器自动打开管理界面 `http://localhost:8080`。
> *The web UI opens automatically at `http://localhost:8080`.*

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
| `language` | `"zh"` | 翻译语言 / Translation language |
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
| `deepseek.json` | DeepSeek Chat **(default)** |
| `gpt.json` | OpenAI GPT |
| `claude.json` | Anthropic Claude |
| `gemini.json` | Google Gemini |
| `qwen.json` | Qwen (通义千问) |
| `llama.json` | Llama (Ollama local) |

### 跨 MC 版本 / Multi-Version Support

设置 `"minecraft_version": "auto"`（默认），系统在连接时自动检测服务器版本并加载对应配方数据。支持 1.18–1.21+。
> *With `"minecraft_version": "auto"` (default), the system auto-detects the server version on connect and loads version-specific recipe data. Supports 1.18–1.21+.*

---

## 项目结构 / Project Structure

```
janet_chinese_support/
├── main.js                 # 入口 / Entry point
├── settings.js             # 配置 / Runtime config
├── keys.json               # API 密钥 (自行创建 / create from example)
├── profiles/               # Agent 模型配置
│   └── deepseek.json       # DeepSeek profile (default)
├── src/
│   ├── agent/
│   │   ├── speak.js        # TTS 语音输出逻辑
│   │   └── moss_tts/       # MOSS-TTS-Nano service (NEW)
│   │       ├── moss-tts-server.py  # Python FastAPI (:8001)
│   │       ├── tts_launcher.js     # Node.js lifecycle mgr
│   │       └── requirements.txt    # Python deps
│   ├── asr/
│   │   ├── asr_server/     # faster-whisper ASR (:8090)
│   │   ├── voice_bridge/   # Push-to-talk bridge
│   │   └── launcher.js     # ASR lifecycle mgr
│   └── models/
│       └── deepseek.js     # DeepSeek API client
├── assets/audio/
│   └── zh_1.wav            # 默认中文女声参考音频 / Default ref voice
└── tasks/                  # 预定义任务 / Task definitions
```

---

## 常见问题 / FAQ

### TTS 启动失败 / TTS Startup Failure

```bash
# 手动测试 / Test CLI manually
pip install moss-tts-nano
moss-tts-nano --help

# HuggingFace 下载慢？使用镜像 / Use mirror for China
export HF_ENDPOINT=https://hf-mirror.com
```

### ASR 不识别中文 / ASR Not Recognizing Chinese

```bash
export ASR_LANGUAGE=zh
# Test microphone
python -c "import sounddevice; print(sounddevice.query_devices())"
```

### DeepSeek API 失败 / API Failure

- 确认 `keys.json` 中 `DEEPSEEK_API_KEY` 已正确填写 / *Verify API key*
- 检查网络是否能访问 `https://api.deepseek.com`
- 确认账户余额充足 / *Check account balance*

### 端口冲突 / Port Conflict

```
ASR: 8090 | TTS: 8001 | MindServer: 8080
→ Modify in settings.js if ports clash
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
   │ :8001   │   │ API     │   │  :8090   │
   │ Python  │   │ HTTPS   │   │ Python   │
   └─────────┘   └─────────┘   └──────────┘
  Chinese TTS     LLM Brain    Chinese STT
```

---

## 致谢 / Acknowledgments

- [Mindcraft](https://github.com/mindcraft-bots/mindcraft) — original LLM-based Minecraft agentic framework
- [Planner-Based Agentic Minecraft Companion](https://github.com/Ing-Ji/Planner-Based-Agentic-Minecraft-companion) — upstream fork with task planning
- [MOSS-TTS-Nano](https://github.com/OpenMOSS/MOSS-TTS-Nano) — lightweight multilingual TTS by OpenMOSS Team (Fudan University)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — CTranslate2-based ASR
- [minecraft-data](https://github.com/PrismarineJS/minecraft-data) — version-specific game data

## License

MIT
