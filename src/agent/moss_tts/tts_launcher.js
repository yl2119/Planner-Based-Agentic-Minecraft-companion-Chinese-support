import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import which from 'which';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

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

        const venvPython = this.ensureVenv(__dirname, 'MOSS-TTS server');
        if (!venvPython) {
            console.error('[TTS] Failed to prepare Python environment. Aborting boot.');
            return Promise.reject(new Error('Failed to prepare Python environment'));
        }

        console.log('[TTS] Starting MOSS-TTS-Nano Server');

        const defaultRefAudio = process.env.MOSS_REF_AUDIO ||
            path.join(PROJECT_ROOT, 'assets', 'audio', 'zh_1.wav');

        // Return a promise that resolves when the server is ready
        return new Promise((resolve, reject) => {
            let resolved = false;
            const resetResolvedFlag = () => {
                resolved = true;
            };

            // Set a timeout in case the server takes too long or fails silently
            const bootTimeout = setTimeout(() => {
                if (!resolved && !this.isReady) {
                    reject(new Error('[TTS] MOSS-TTS-Nano server did not start within 5 minutes (model download may be slow)'));
                }
            }, 300000);

            // spawn the venv python and point cwd to the server directory
            this.pythonServer = spawn(venvPython, ['moss-tts-server.py'], {
                cwd: __dirname,
                env: {
                    ...process.env,
                    MOSS_REF_AUDIO: defaultRefAudio,
                },
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Show output to console for easier debugging
            this.pythonServer.stdout.on('data', (d) => {
                const out = d.toString();
                process.stdout.write(`[MOSS-TTS stdout] ${out}`);
                if (out.includes('Application startup complete') && !this.isReady && !resolved) {
                    clearTimeout(bootTimeout);
                    this._markReady();
                    resetResolvedFlag();
                    resolve(true);
                }
            });

            this.pythonServer.stderr.on('data', (d) => {
                const out = d.toString();
                process.stderr.write(`[MOSS-TTS stderr] ${out}`);
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
                console.log(`[TTS] MOSS-TTS-Nano server exited. code=${code} signal=${signal}`);
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
        console.log('[TTS] MOSS-TTS-Nano Server is Ready.');
        this.readyCallbacks.forEach(cb => cb());
        this.readyCallbacks = [];
    }

    onReady(callback) {
        if (this.isReady) callback();
        else this.readyCallbacks.push(callback);
    }

    speak(text) {
        this.queue.push(text);
        this._processQueue();
    }

    // Internal loop that handles the timing
    async _processQueue() {
        if (this.isSpeaking || this.queue.length === 0) return;

        this.isSpeaking = true;
        const text = this.queue.shift();
        console.log(`[TTS] Speaking: "${text.substring(0, 50)}..."`);

        try {
            const response = await fetch('http://127.0.0.1:8001/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });

            if (!response.body) throw new Error('No response body');

            // Spawn ffplay for 48000 Hz stereo PCM
            const isWin = process.platform === 'win32';

            const player = isWin ? spawn('ffplay', [
                '-autoexit', '-nodisp',
                '-f', 's16le', '-ar', '48000', '-ch_layout', 'stereo', '-i', '-'
            ]) :
            spawn('ffplay', [
                '-autoexit', '-nodisp',
                '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', '-'
            ]);

            const reader = response.body.getReader();

            // Read chunks and pipe to speaker
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                // Handle backpressure: if player.stdin.write returns false, wait for drain
                if (!player.stdin.write(value)) {
                    await new Promise(resolve => player.stdin.once('drain', resolve));
                }
            }

            player.stdin.end();

            // Wait for ffplay to finish, but add a timeout to avoid hanging
            await Promise.race([
                new Promise((resolve) => player.on('close', resolve)),
                new Promise((_, reject) => setTimeout(() => reject(new Error('ffplay timeout')), 15000))
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
        console.log('\n[TTS] Shutting down MOSS-TTS-Nano server...');
        if (this.pythonServer) this.pythonServer.kill();
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
                    // Skip local path installs (e.g. ./MOSS-TTS-Nano)
                    if (req.startsWith('.') || req.startsWith('/')) {
                        continue;
                    }
                    const packageName = req.split(/[=>\[]/)[0].trim();
                    if (!installed.includes(packageName)) {
                        console.log(`[${label}] Missing dependency: ${packageName}`);
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
            if (existsSync(venvDir)) {
                rmSync(venvDir, { recursive: true, force: true });
            }

            // Create the virtual environment
            console.log(`[${label}] Creating virtual environment...`);
            execSync(`"${sysPython}" -m venv "${venvDir}"`, { cwd: componentDir, stdio: 'inherit' });

            if (existsSync(requirementsFile)) {
                console.log(`[${label}] Installing requirements (this may take several minutes)...`);
                execSync(`"${venvPython}" -m pip install --upgrade pip`, { cwd: componentDir, stdio: 'inherit' });
                execSync(`"${venvPython}" -m pip install -r "${requirementsFile}"`, { cwd: componentDir, stdio: 'inherit' });
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
        // MOSS-TTS-Nano requires Python >=3.11
        try { execSync('python3.11 --version', { stdio: 'ignore' }); return 'python3.11'; }
        catch {
            try { execSync('python3.12 --version', { stdio: 'ignore' }); return 'python3.12'; }
            catch {
                return 'python3';
            }
        }
    }
}
