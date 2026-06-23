import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';
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
// Launch Kokoro-TTS if model is selected
if (settings.speak){
    try{
        await new TTSService().boot()
    }catch(err){
        console.log("Error booting TTS ",err)
    }
}

// Clean up ASR processes on exit
process.on('exit', cleanupASR);
process.on('SIGINT', () => { cleanupASR(); process.exit(); });
process.on('SIGTERM', () => { cleanupASR(); process.exit(); });

for (let profile of settings.profiles) {
    const profile_json = JSON.parse(readFileSync(profile, 'utf8'));
    settings.profile = profile_json;
    Mindcraft.createAgent(settings);
}