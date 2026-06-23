import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync, existsSync, rmSync } from 'fs';
import { execSync } from 'child_process';
//support moss-tts-nano
import { TTSService } from './src/agent/moss_tts/tts_launcher.js';
//suport asr
import { launchASR, cleanupASR } from './src/asr/launcher.js'; 
function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .option('clean', {
            type: 'boolean',
            default: false,
            describe: 'Clear all persisted tasks and memory before starting (useful when switching worlds)',
        })
        .option('tts-cpu', {
            type: 'boolean',
            default: false,
            describe: 'Force TTS to use CPU instead of GPU (default: GPU)',
        })
        .help()
        .alias('help', 'h')
        .parse();
}
const args = parseArguments();
if (args.profiles) {
    settings.profiles = args.profiles;
}
if (args.task_path) {
    let tasks = JSON.parse(readFileSync(args.task_path, 'utf8'));
    if (args.task_id) {
        settings.task = tasks[args.task_id];
        settings.task.task_id = args.task_id;
    }
    else {
        throw new Error('task_id is required when task_path is provided');
    }
}

// these environment variables override certain settings
if (process.env.MINECRAFT_PORT) {
    settings.port = process.env.MINECRAFT_PORT;
}
if (process.env.MINDSERVER_PORT) {
    settings.mindserver_port = process.env.MINDSERVER_PORT;
}
if (process.env.PROFILES && JSON.parse(process.env.PROFILES).length > 0) {
    settings.profiles = JSON.parse(process.env.PROFILES);
}
if (process.env.INSECURE_CODING) {
    settings.allow_insecure_coding = true;
}
if (process.env.BLOCKED_ACTIONS) {
    settings.blocked_actions = JSON.parse(process.env.BLOCKED_ACTIONS);
}
if (process.env.MAX_MESSAGES) {
    settings.max_messages = process.env.MAX_MESSAGES;
}
if (process.env.NUM_EXAMPLES) {
    settings.num_examples = process.env.NUM_EXAMPLES;
}
if (process.env.LOG_ALL) {
    settings.log_all_prompts = process.env.LOG_ALL;
}

// Auto-cleanup leftover ports from previous runs
try {
    const ports = [settings.mindserver_port || 8080, settings.asr_port || 8090, 8001];
    const pids = execSync(`lsof -ti:${ports.join(',')} 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
    if (pids) {
        console.log('[startup] Cleaning up leftover processes...');
        pids.split('\n').forEach(pid => {
            try { process.kill(parseInt(pid), 'SIGKILL'); } catch {}
        });
        console.log('[startup] Ports cleared');
    }
} catch {}

// Initialize MindServer BEFORE launching ASR (Voice Bridge needs it to connect)
Mindcraft.init(true, settings.mindserver_port, settings.auto_open_ui);

// Launch ASR voice input if enabled
if (settings.asr_enabled) {
    const firstProfile = JSON.parse(readFileSync(settings.profiles[0], 'utf8'));
    await launchASR({
        agent: firstProfile.name || 'Janet',
        player: settings.asr_player || 'ADMIN',
        port: settings.asr_port || 8090,
        key: settings.asr_key || 'v',
        mindserverPort: settings.mindserver_port || 8080,
    });
}
// Launch TTS if enabled (default: GPU, use --tts-cpu to force CPU)
if (settings.speak){
    try{
        if (args.ttsCpu) {
            process.env.MOSS_TTS_DEVICE = 'cpu';
            console.log('[startup] TTS device forced to CPU');
        }
        await new TTSService().boot()
    }catch(err){
        console.log("Error booting TTS ",err)
    }
}

// Clean up ASR processes on exit
process.on('exit', cleanupASR);
process.on('SIGINT', () => { cleanupASR(); process.exit(); });
process.on('SIGTERM', () => { cleanupASR(); process.exit(); });

// --clean flag: clear persisted tasks and memory (useful when switching worlds)
if (args.clean) {
    console.log('[clean] Clearing old tasks and memory...');
    for (let profile of settings.profiles) {
        try {
            const profile_json = JSON.parse(readFileSync(profile, 'utf8'));
            const agentName = profile_json.name || 'andy';
            const tasksDir = `./bots/${agentName}/tasks`;
            const memPath = `./bots/${agentName}/memory.json`;
            if (existsSync(tasksDir)) {
                rmSync(tasksDir, { recursive: true, force: true });
                console.log(`[clean] Removed tasks: ${tasksDir}`);
            }
            if (existsSync(memPath)) {
                rmSync(memPath);
                console.log(`[clean] Removed memory: ${memPath}`);
            }
        } catch (err) {
            console.warn(`[clean] Failed to clean profile ${profile}: ${err.message}`);
        }
    }
    console.log('[clean] Done.');
}

// Set response language based on ASR_LANGUAGE (zh → Chinese, en → English)
const asrLang = (process.env.ASR_LANGUAGE || 'zh').trim().toLowerCase();
const langRules = {
    zh: { conversing_rule: '- 始终使用中文回复。', init_msg: '用中文回复一句温暖友好的问候，介绍自己是Janet，一个我的世界AI伙伴' },
    en: { conversing_rule: '- Always reply in English.', init_msg: 'Reply with a warm friendly greeting in English and introduce yourself as Janet, a Minecraft AI companion' },
};
const langConfig = langRules[asrLang] || langRules.zh;

for (let profile of settings.profiles) {
    const profile_json = JSON.parse(readFileSync(profile, 'utf8'));
    // Inject language rule into conversing prompt
    if (profile_json.conversing) {
        // Remove ALL dynamic language-matching rules (hardcoded rule takes precedence)
        profile_json.conversing = profile_json.conversing
            .replace(/^.*(玩家用什么语言|检测玩家消息的语言|用玩家使用的语言|match the player.s language|reply in the same language|语言规则[（(]最高优先级[）)]).*\n?/gmi, '')
            .replace(/- (始终使用中文回复|Always reply in English)[^\n]*\n?/g, '')
            .replace(/(交流规则：\n)/, '$1' + langConfig.conversing_rule + '\n');
        console.log(`[startup] Language set to: ${asrLang} → "${langConfig.conversing_rule}"`);
    }
    settings.profile = profile_json;
    if (!settings.init_message || settings.init_message.includes('Reply with a warm') || settings.init_message.includes('用中文回复')) {
        settings.init_message = langConfig.init_msg;
    }
    Mindcraft.createAgent(settings);
}