import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import which from 'which';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TTSService {
    constructor() {
        this.pythonServer = null;
        this.isReady = false;
        this.readyCallbacks = [];
        
        // Task Queue properties
        this.queue = [];
        this.isSpeaking = false;
    }

    async boot() {
        try {
            await which('ffplay');
        } catch {
            console.error('[TTS] ffplay not found. Please install ffmpeg.');
        }

        const venvPython = this.ensureVenv(__dirname, 'TTS server');
        if (!venvPython) {
            console.error('[TTS] Failed to prepare Python environment. Aborting boot.');
            return Promise.reject(new Error('Failed to prepare Python environment'));
        }

        console.log('[TTS] Starting Kokoro-TTS Server');

        // Return a promise that resolves when the server is ready
        return new Promise((resolve, reject) => {
            let resolved = false;
            const resetResolvedFlag = () => {
                resolved = true;
            };

            // Set a timeout in case the server takes too long or fails silently
            const bootTimeout = setTimeout(() => {
                if (!resolved && !this.isReady) {
                    reject(new Error('[TTS] Server did not start within 30 seconds'));
                }
            }, 30000);

            // spawn the venv python and point cwd to the server directory
            this.pythonServer = spawn(venvPython, ['kokoro-tts-server.py'], {
                cwd: __dirname,
                env: { ...process.env }, // preserve env (you can add/override env vars here)
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Show output to console for easier debugging
            this.pythonServer.stdout.on('data', (d) => {
                const out = d.toString();
                process.stdout.write(`[python stdout] ${out}`);
                if (out.includes('Application startup complete') && !this.isReady && !resolved) {
                    clearTimeout(bootTimeout);
                    this._markReady();
                    resetResolvedFlag();
                    resolve(true);
                }
            });

            this.pythonServer.stderr.on('data', (d) => {
                const out = d.toString();
                process.stderr.write(`[python stderr] ${out}`);
                if (out.includes('Application startup complete') && !this.isReady && !resolved) {
                    clearTimeout(bootTimeout);
                    this._markReady();
                    resetResolvedFlag();
                    resolve(true);
                }
            });

            this.pythonServer.on('error', (err) => {
                console.error('[TTS] Failed to start python server:', err);
                clearTimeout(bootTimeout);
                if (!resolved) {
                    resetResolvedFlag();
                    reject(err);
                }
            });

            this.pythonServer.on('exit', (code, signal) => {
                console.log(`[TTS] Python server exited. code=${code} signal=${signal}`);
                this.isReady = false;
                clearTimeout(bootTimeout);
                if (!resolved && code !== 0) {
                    resetResolvedFlag();
                    reject(new Error(`[TTS] Server exited with code ${code}`));
                }
            });

            process.on('SIGINT', () => this.shutdown());
            process.on('SIGTERM', () => this.shutdown());
        });
    }

    _markReady() {
        this.isReady = true;
        console.log('TTS Server is Ready.');
        this.readyCallbacks.forEach(cb => cb());
        this.readyCallbacks = [];
    }

    onReady(callback) {
        if (this.isReady) callback();
        else this.readyCallbacks.push(callback);
    }

    speak(text) {
        // console.log(`Added to queue: "${text.substring(0, 40)}..."`);
        this.queue.push(text);
        this._processQueue();
    }

    // Internal loop that handles the timing
    async _processQueue() {
    if (this.isSpeaking || this.queue.length === 0) return;
    
    this.isSpeaking = true;
    const text = this.queue.shift();
    console.log(`🗣️ Speaking: "${text}"`);

    try {
        const response = await fetch('http://127.0.0.1:8000/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, voice: 'af_heart' })
        });

        if (!response.body) throw new Error('No response body');

        // Spawn ffplay with verbose logging (remove -loglevel quiet for now)
        // const player = spawn('ffplay', [
        //     '-autoexit', '-nodisp',
        //     '-f', 's16le', '-ar', '24000', '-ch_layout', 'mono', '-i', '-'
        // ]);

        const player = spawn('ffplay', [
            '-autoexit', '-nodisp',
            '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', '-'
        ]);

        const reader = response.body.getReader();

        // Read chunks and pipe to speaker
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // Handle backpressure: if player.stdin.write returns false, wait for drain
            if (!player.stdin.write(value)) {
                console.log('[TTS] Waiting for drain...');
                await new Promise(resolve => player.stdin.once('drain', resolve));
            }
        }

        player.stdin.end();

        // Wait for ffplay to finish, but add a timeout to avoid hanging
        await Promise.race([
            new Promise((resolve) => player.on('close', resolve)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('ffplay timeout')), 10000))
        ]);

        console.log('[TTS] Playback finished');

    } catch (err) {
        console.error('[TTS] Error in playback:', err);
    } finally {
        this.isSpeaking = false;
        this._processQueue();
    }
}

    shutdown() {
        console.log('\nShutting down TTS server...');
        if (this.pythonServer) this.pythonServer.kill();
        process.exit(0);
    }

    /**
     * Validates dependencies and reinstalls if any are missing or mismatched.
     */
    ensureVenv(componentDir, label) {
        const venvDir = path.join(componentDir, '.venv');
        const requirementsFile = path.join(componentDir, 'requirements.txt');

        const isWin = process.platform === 'win32';
        const venvPython = path.join(venvDir, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');

        let sysPython;
        try {
            
            sysPython = isWin ? 'py' : this.getSystemPython();
        } catch (err) {
            console.error(`[${label}] No system python found:`, err.message);
            return null;
        }

        let needsReinstall = false;

        if (!existsSync(venvPython)) {
            console.log(`[${label}] No venv found. Initializing...`);
            needsReinstall = true;
        } else if (existsSync(requirementsFile)) {
            console.log(`[${label}] Checking dependencies...`);
            try {
                const installed = execSync(`"${venvPython}" -m pip freeze`, { encoding: 'utf-8' }).toLowerCase();

                const requirements = readFileSync(requirementsFile, 'utf-8')
                    .split('\n')
                    .map(line => line.trim().toLowerCase())
                    .filter(line => line && !line.startsWith('#') && !line.startsWith('--'));

                for (const req of requirements) {
                    const packageName = req.split(/[=>\[]/)[0].trim();
                    if (!installed.includes(packageName)) {
                        console.log(`[${label}] Missing or mismatched dependency: ${packageName}`);
                        needsReinstall = true;
                        break;
                    }
                }

                if (installed.includes('onnxruntime') && !installed.includes('onnxruntime-gpu')) {
                    console.log(`[${label}] Wrong ONNX Runtime detected (CPU instead of GPU). Reinstalling...`);
                    needsReinstall = true;
                }
            } catch (err) {
                console.error(`[${label}] Error checking dependencies: ${err.message}`);
                needsReinstall = true;
            }
        }

        if (needsReinstall) {
            console.log(`[${label}] Performing clean install...`);
            if (existsSync(venvDir)) {
                rmSync(venvDir, { recursive: true, force: true });
            }

            // Create the virtual environment
            console.log(`[${label}] Creating virtual environment...`);
            execSync(`"${sysPython}" -m venv "${venvDir}"`, { cwd: componentDir, stdio: 'inherit' });

            if (existsSync(requirementsFile)) {
                console.log(`[${label}] Installing requirements...`);
                execSync(`"${venvPython}" -m pip install --upgrade pip`, { cwd: componentDir, stdio: 'inherit' });
                execSync(`"${venvPython}" -m pip install -r "${requirementsFile}"`, { cwd: componentDir, stdio: 'inherit' });

                // ---- GPU onnxruntime handling ----
                try {
                    // Check if onnxruntime is installed and get its version
                    const versionOutput = execSync(
                        `"${venvPython}" -c "import onnxruntime; print(onnxruntime.__version__)"`,
                        { encoding: 'utf-8' }
                    ).trim();
                    console.log(`[${label}] Detected onnxruntime version: ${versionOutput}`);

                    // Uninstall the CPU version (with -y flag to avoid prompt)
                    console.log(`[${label}] Uninstalling CPU onnxruntime...`);
                    execSync(`"${venvPython}" -m pip uninstall -y onnxruntime`);
                    
                    execSync(`"${venvPython}" -m pip uninstall -y onnxruntime-gpu`);

                    // Install GPU version with the same version
                    console.log(`[${label}] Installing onnxruntime-gpu==${versionOutput}...`);
                    execSync(`"${venvPython}" -m pip install onnxruntime-gpu==${versionOutput}`);
                } catch (e) {
                    // If onnxruntime wasn't installed or version detection failed, install latest GPU
                    console.log(`[${label}] onnxruntime not found or version detection failed. Installing latest onnxruntime-gpu...`);
                    execSync(`"${venvPython}" -m pip install onnxruntime-gpu`);
                }
            }
        }

        console.log(`[${label}] Environment is healthy.`);
        return venvPython;
    }

    getSystemPython() {
        if (process.platform === 'win32') {
            try { execSync('python --version', { stdio: 'ignore' }); return 'python'; }
            catch { return 'python3'; }
        }
        return 'python3';
    }
}