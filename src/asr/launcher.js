/**
 * asr/launcher.js - Auto-launch ASR server and Voice Bridge from main.js
 *
 * Responsibilities:
 *   1. Check if Python venvs exist, create + install deps if not
 *   2. Start ASR server (uvicorn) on configured port
 *   3. Wait until ASR server is ready (health check)
 *   4. Start Voice Bridge with correct agent/player names
 *   5. Clean up child processes on exit
 */

import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWindows = process.platform === 'win32';

// Child processes to clean up on exit
let asrProcess = null;
let bridgeProcess = null;

/**
 * Get the python executable path inside a venv.
 */
function getVenvPython(venvDir) {
    if (isWindows) {
        return path.join(venvDir, 'Scripts', 'python.exe');
    }
    return path.join(venvDir, 'bin', 'python');
}

/**
 * Get the system python command.
 */
function getSystemPython() {
    if (isWindows) {
        try { execSync('python --version', { stdio: 'ignore' }); return 'python'; }
        catch { return 'python3'; }
    }
    return 'python3';
}

/**
 * Validates dependencies and reinstalls if any are missing or mismatched.
 */
function ensureVenv(componentDir, label) {
    const venvDir = path.join(componentDir, '.venv');
    const requirementsFile = path.join(componentDir, 'requirements.txt');
    
    // Determine venv python path (Windows vs Unix)
    const isWin = process.platform === 'win32';
    const venvPython = path.join(venvDir, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');

    //const sysPython = 'py'; // Using 'py' launcher as discussed for Windows safety
    //commented for support to Ubuntu 2204
    const sysPython = isWin ? 'py' : getSystemPython();

    let needsReinstall = false;

    if (!existsSync(venvPython)) {
        console.log(`[${label}] No venv found. Initializing...`);
        needsReinstall = true;
    } else if (existsSync(requirementsFile)) {
        console.log(`[${label}] Checking dependencies...`);
        try {
            // 1. Get list of currently installed packages
            const installed = execSync(`"${venvPython}" -m pip freeze`, { encoding: 'utf-8' }).toLowerCase();
            
            // 2. Read requirements.txt and filter for actual package names
            const requirements = readFileSync(requirementsFile, 'utf-8')
                .split('\n')
                .map(line => line.trim().toLowerCase())
                .filter(line => line && !line.startsWith('#') && !line.startsWith('--'));

            // 3. Check if every required package is present in 'pip freeze'
            for (const req of requirements) {
                // This handles "package==version", "package>=version", or just "package"
                const packageName = req.split(/[=>]/)[0].replace(/\[.*\]/, '').trim();
                if (!installed.includes(packageName)) {
                    console.log(`[${label}] Missing or mismatched dependency: ${packageName}`);
                    needsReinstall = true;
                    break;
                }
            }
        } catch (err) {
            console.error(`[${label}] Error checking dependencies: ${err.message}`);
            needsReinstall = true;
        }
    }

    if (needsReinstall) {
        console.log(`[${label}] Performing clean install...`);
        
        // NUCLEAR OPTION: Delete the venv folder to ensure a clean slate
        if (existsSync(venvDir)) {
            rmSync(venvDir, { recursive: true, force: true });
        }

        try {
            // Create venv
            execSync(`${sysPython} -m venv ${venvDir}`, { cwd: componentDir, stdio: 'inherit' });
            
            // Install from requirements.txt
            if (existsSync(requirementsFile)) {
                console.log(`[${label}] Installing requirements (this may take a few minutes)...`);
                execSync(`"${venvPython}" -m pip install --upgrade pip`, { cwd: componentDir, stdio: 'inherit' });
                
                // Note: This will use the --extra-index-url we put in your requirements.txt
                // execSync(`"${venvPython}" -m pip install -r requirements.txt`, { cwd: componentDir, stdio: 'inherit' });

                const extraTorchIndex = isWin ? '' : ' --extra-index-url https://download.pytorch.org/whl/cu124';
                execSync(`"${venvPython}" -m pip install -r requirements.txt${extraTorchIndex}`, { cwd: componentDir, stdio: 'inherit' });

            }
        } catch (err) {
            console.error(`[${label}] Setup failed: ${err.message}`);
            return null;
        }
    }

    console.log(`[${label}] Environment is healthy.`);
    return venvPython;
}

/**
 * Wait for ASR server to respond on the given port.
 */
async function waitForServer(port, timeoutMs = 30000) {
    const url = `http://127.0.0.1:${port}/docs`;
    const start = Date.now();
    const interval = 1000;

    while (Date.now() - start < timeoutMs) {
        try {
            const resp = await fetch(url);
            if (resp.ok) return true;
        } catch {
            // Server not ready yet
        }
        await new Promise(r => setTimeout(r, interval));
    }
    return false;
}

/**
 * Launch ASR server and Voice Bridge.
 *
 * @param {object} options
 * @param {string} options.agent - Agent name (default: 'andy')
 * @param {string} options.player - Player name (default: 'ADMIN')
 * @param {number} options.port - ASR server port (default: 8090)
 * @param {string} options.key - Push-to-talk key (default: 'v')
 * @param {number} options.mindserverPort - MindServer port (default: 8080)
 */
export async function launchASR(options = {}) {
    const agent = options.agent || 'andy';
    const player = options.player || 'ADMIN';
    const port = options.port || 8090;
    const key = options.key || 'v';
    const mindserverPort = options.mindserverPort || 8080;

    const asrServerDir = path.join(__dirname, 'asr_server');
    const voiceBridgeDir = path.join(__dirname, 'voice_bridge');

    // 1. Ensure venvs
    console.log('[ASR] Checking dependencies...');
    const asrPython = ensureVenv(asrServerDir, 'asr_server');
    const bridgePython = ensureVenv(voiceBridgeDir, 'voice_bridge');

    if (!asrPython || !bridgePython) {
        console.error('[ASR] Failed to set up Python environments. ASR will not start.');
        console.error('[ASR] You can still use Mindcraft without voice input.');
        return false;
    }

    // 2. Start ASR server
    console.log(`[ASR] Starting ASR server on port ${port}...`);
    asrProcess = spawn(asrPython, [
        '-m', 'uvicorn', 'asr_server:app',
        '--host', '127.0.0.1',
        '--port', String(port),
    ], {
        cwd: asrServerDir,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    asrProcess.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[ASR Server] ${msg}`);
    });

    asrProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[ASR Server] ${msg}`);
    });

    asrProcess.on('exit', (code) => {
        if (code !== null && code !== 0) {
            console.error(`[ASR] ASR server exited with code ${code}`);
        }
        asrProcess = null;
    });

    // 3. Wait for ASR server to be ready
    console.log('[ASR] Waiting for ASR server to be ready...');
    const ready = await waitForServer(port);
    if (!ready) {
        console.error('[ASR] ASR server failed to start within 30 seconds.');
        console.error('[ASR] You can still use Mindcraft without voice input.');
        cleanupASR();
        return false;
    }
    console.log('[ASR] ASR server is ready');

    // 4. Start Voice Bridge
    console.log(`[ASR] Starting Voice Bridge (agent: ${agent}, key: ${key})...`);
    bridgeProcess = spawn(bridgePython, [
        'voice_bridge.py',
        '--agent', agent,
        '--player', player,
        '--key', key,
        '--asr-url', `http://127.0.0.1:${port}/asr`,
        '--mindserver-url', `http://localhost:${mindserverPort}`,
    ], {
        cwd: voiceBridgeDir,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    bridgeProcess.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[Voice] ${msg}`);
    });

    bridgeProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[Voice] ${msg}`);
    });

    bridgeProcess.on('exit', (code) => {
        if (code !== null && code !== 0) {
            console.error(`[ASR] Voice Bridge exited with code ${code}`);
        }
        bridgeProcess = null;
    });

    console.log('[ASR] Voice input ready! Hold V to speak.');
    return true;
}

/**
 * Kill ASR child processes.
 */
export function cleanupASR() {
    if (asrProcess) {
        console.log('[ASR] Stopping ASR server...');
        asrProcess.kill();
        asrProcess = null;
    }
    if (bridgeProcess) {
        console.log('[ASR] Stopping Voice Bridge...');
        bridgeProcess.kill();
        bridgeProcess = null;
    }
}