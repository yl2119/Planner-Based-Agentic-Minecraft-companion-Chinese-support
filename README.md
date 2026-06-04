# Games 4 MC Companion

## What is this project?

This project forks [Mindcraft](https://github.com/mindcraft-bots/mindcraft), an embedded agentic framework designed for LLM interaction in Minecraft. Our work introduces "Janet," an agent enhanced with a planner and task-management capabilities. We evaluate Janet's performance relative to the baseline agent, "Andy," to investigate the efficacy of structured planning in agentic frameworks.

## Additional Features

- **🧠 Task Management System** — Multi-step task planning with automatic step progression, persistence, and validation for crafting, construction, and cooking tasks.
- **🗣️ Voice Interaction** — Speech-to-text (ASR) voice input with push-to-talk, plus Text-to-Speech output via Kokoro or system TTS.
- **💾 Long-Term Memory** — Spatial place memory and persistent conversation memory across sessions.
- **🎤 Text-to-Speech** — Local Kokoro TTS (fast, on-device) and remote TTS provider support.

(for a list of original features from Mindcraft visit https://github.com/mindcraft-bots/mindcraft)

## Quick Start

### Prerequisites

- **Node.js** v18–20 (LTS recommended; v24+ may have native module build issues)
- **Minecraft Java Edition** version 1.21.1
- **npm** (ships with Node.js)
- **ffplay** (from [FFmpeg](https://ffmpeg.org/download.html)) — required for TTS audio playback

### 1. Configure Model & API Keys

**Choose your model** — Open `profiles/Janet.json` and set:
```json
"model": "gpt-4o-mini",
"embedding": "openai"
```

Then copy `keys.example.json` → `keys.json` and add your API keys:
```json
{
  "OPENAI_API_KEY": "sk-xxxxxxxxxxxxxxxx",
  "GEMINI_API_KEY": "",
  "ANTHROPIC_API_KEY": "",
  ...
}
```

> **Important:** After creating `keys.json`, delete `keys.example.json`. Never commit `keys.json` to Git — make sure it's in `.gitignore`.

### 2. Install Dependencies

```bash
npm install
```

### 3. Kokoro TTS (Optional but Recommended)

Download and place these files in `./src/agent/kokoro/`:
- [kokoro-v0_19.fp16.onnx](https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.fp16.onnx)
- [voices-v1.0.bin](https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin)

### 4. Local LLM (Optional, instead of API)

```bash
# Install Ollama, then:
ollama pull sweaterdog/andy-4:micro-q8_0 && ollama pull embeddinggemma
```

## Running

1. Launch your LLM (Ollama for local, or ensure API keys are set for cloud)
2. Open **Minecraft Launcher** → launch **version 1.21.1**
3. Enter a **single-player world**
4. Press `Esc` → **"Open to LAN"** → set port **55916** (enable "Allow Commands" for voice features)
5. In the project root:
   ```bash
   node main.js
   ```
6. If no errors appear, **Janet** (or your configured agent) will join your game!

### Running with Task Files

Execute predefined tasks programmatically:
```bash
node main.js --task_path tasks/basic/single_agent.json --task_id gather_oak_logs
```

### Running Multiple Agents

Uncomment multiple profiles in `settings.js`:
```js
"profiles": [
    "./profiles/Janet.json",
    "./profiles/andy.json"
]
```

## Task System

Janet's planner-driven task system enables structured, multi-step execution:

### Task Lifecycle
1. **Create** — `!createTask("goal", count, "description")` generates a plan with steps
2. **Progress** — Each step is executed sequentially via `!completeStep`
3. **Validate** — Task completion is validated (inventory checks, position checks)
4. **Persist** — Tasks are saved as JSON files in `bots/<agent>/tasks/`

### Example Task JSON
```json
{
  "gather_oak_logs": {
    "goal": "Collect at least four logs",
    "initial_inventory": { "0": { "wooden_axe": 1 } },
    "agent_count": 1,
    "target": "oak_log",
    "number_of_target": 4,
    "type": "techtree",
    "timeout": 300
  }
}
```

## Evaluation Framework

The `tasks/` directory contains a complete research framework for evaluating agent performance:

```bash
# Run a single experiment
python3 tasks/evaluation_script.py \
    --model gpt-4o \
    --num_parallel 1 \
    --num_exp 1 \
    --exp_name "my_experiment" \
    --template_profile ./profiles/tasks/cooking_profile.json \
    --task_path tasks/cooking_tasks/... \
    --num_agents 1

# Run all tasks in a file sequentially
python3 tasks/run_task_file.py --task_path tasks/example_tasks.json
```

## Web UI (MindServer)

When running, open **http://localhost:8080** to access the MindServer dashboard:
- View agent status (online/offline)
- Monitor agent state
- Manage agents (restart, stop, start)

## Configuration

### `settings.js`

| Setting | Description | Default |
|---------|-------------|---------|
| `port` | Minecraft LAN port | `55916` |
| `auth` | Authentication mode | `"offline"` |
| `speak` | Enable TTS | `true` |
| `asr_enabled` | Enable voice input | `true` |
| `language` | Translation language | `"en"` |
| `mindserver_port` | Web UI port | `8080` |
| `load_memory` | Resume memory from last session | `false` |

## Troubleshooting

See [FAQ.md](./FAQ.md) for common issues including:

- `ECONNREFUSED` — Minecraft not open to LAN or wrong port
- `ERR_MODULE_NOT_FOUND` — Missing npm packages (run `npm install`)
- Native module build errors — Python/C++20 issues, Node version conflicts
- LLM API errors — Wrong keys, rate limits
- Bot stuck issues — Mineflayer pathfinder limitations

## License

See [LICENSE](./LICENSE).
