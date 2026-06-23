import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { TTSConfig as gptTTSConfig } from '../models/gpt.js';
import { TTSConfig as geminiTTSConfig } from '../models/gemini.js';

let speakingQueue = []; // each item: {text, model, audioData, ready}
let isSpeaking = false;

export function speak(text, speak_model) {
    const model = speak_model || 'system';

    const item = { text, model, audioData: null, ready: null };

    if (model === 'system') {
        // no preprocessing needed
        item.ready = Promise.resolve();
    } 
    else if (model === 'moss_tts' || model.startsWith('moss_tts/')) {
        // MOSS-TTS-Nano: local Chinese TTS server on port 8001
        // format: "moss_tts" or "moss_tts/voice_name"
        const parts = model.split('/');
        const voice = parts[parts.length - 1] || 'zh_female';
        item.ready = fetchMossTTS(text, voice)
            .then(data => {
                item.audioData = data;
            })
            .catch(err => { item.error = err; });
        console.log("[TTS] MOSS-TTS-Nano request sent");
    } else {
    item.ready = fetchRemoteAudio(text, model)
        .then(data => { item.audioData = data; })
        .catch(err => { item.error = err; });
    }

    speakingQueue.push(item);
    if (!isSpeaking) processQueue();
}

async function fetchMossTTS(text, voice = 'zh_female') {
    // Call local MOSS-TTS-Nano server on port 8001
    const resp = await fetch('http://127.0.0.1:8001/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ref_audio: voice }),
    });
    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`MOSS-TTS error ${resp.status}: ${errText}`);
    }
    // Return the full PCM audio buffer
    const buf = await resp.arrayBuffer();
    return Buffer.from(buf);
}

async function fetchRemoteAudio(txt, model) {
    function getModelUrl(prov) {
        if (prov === 'openai') return gptTTSConfig.baseUrl;
        if (prov === 'google') return geminiTTSConfig.baseUrl;
        return 'https://api.openai.com/v1';
    }

    let prov, mdl, voice, url;
    if (typeof model === 'string') {
        [prov, mdl, voice] = model.split('/');
        url = getModelUrl(prov);
    } else {
        prov = model.api;
        mdl = model.model;
        voice = model.voice;
        url = model.url || getModelUrl(prov);
    }

    if (prov === 'openai') {
        return gptTTSConfig.sendAudioRequest(txt, mdl, voice, url);
    } else if (prov === 'google') {
        return geminiTTSConfig.sendAudioRequest(txt, mdl, voice, url);
    }
    else {
        throw new Error(`TTS Provider ${prov} is not supported.`);
    }
}

async function processQueue() {
    isSpeaking = true;
    if (speakingQueue.length === 0) {
        isSpeaking = false;
        return;
    }
    const item = speakingQueue.shift();
    const { text: txt, model, audioData } = item;
    if (txt.trim() === '') {
        isSpeaking = false;
        processQueue();
        return;
    }

    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    // wait for preprocessing if needed
    try {
        await item.ready;
        if (item.error) throw item.error;
    } catch (err) {
        console.error('[TTS] preprocess error', err);
        isSpeaking = false;
        processQueue();
        return;
    }

    if (model === 'system') {
        // system TTS
        const cmd = isWin
            ? `powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; \
            $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=2; \
            $s.Speak('${txt.replace(/'/g,"''")}'); $s.Dispose()"`
            : isMac
            ? `say "${txt.replace(/"/g,'\\"')}"`
            : `espeak "${txt.replace(/"/g,'\\"')}"`;

        exec(cmd, err => {
            if (err) console.error('TTS error', err);
            isSpeaking = false;
            processQueue();
        });

    } 
    else {
        // audioData was already fetched in speak()
        const rawData = item.audioData;

        if (!rawData) {
            console.error('[TTS] No audio data ready');
            isSpeaking = false;
            processQueue();
            return;
        }

        const isMossTTS = model === 'moss_tts' || model.startsWith('moss_tts/');

        try {
            if (isWin) {
                const audioBuffer = isMossTTS
                    ? rawData // raw PCM bytes
                    : (typeof rawData === 'string'
                        ? Buffer.from(rawData, 'base64')
                        : rawData);

                const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}.${isMossTTS ? 'pcm' : 'mp3'}`);
                await fs.writeFile(tmpPath, audioBuffer);

                const ffArgs = isMossTTS
                    ? ['-nodisp', '-autoexit', '-loglevel', 'quiet',
                       '-f', 's16le', '-ar', '48000', '-ac', '2', tmpPath]
                    : ['-nodisp', '-autoexit', '-loglevel', 'quiet', tmpPath];

                const player = spawn('ffplay', ffArgs, {
                    stdio: 'ignore', windowsHide: true
                });
                player.on('error', async (err) => {
                    console.error('[TTS] ffplay error', err);
                    try { await fs.unlink(tmpPath); } catch {}
                    isSpeaking = false;
                    processQueue();
                });
                player.on('exit', async () => {
                    try { await fs.unlink(tmpPath); } catch {}
                    isSpeaking = false;
                    processQueue();
                });

            } else {
                if (isMossTTS) {
                    // MOSS-TTS-Nano: raw PCM int16, 48000 Hz, stereo
                    const player = spawn('ffplay', [
                        '-nodisp', '-autoexit',
                        '-f', 's16le', '-ar', '48000', '-ac', '2',
                        '-i', '-'
                    ], { stdio: ['pipe', 'ignore', 'ignore'] });
                    player.stdin.write(rawData);
                    player.stdin.end();
                    player.on('exit', () => {
                        isSpeaking = false;
                        processQueue();
                    });
                } else {
                    // Remote TTS: base64-encoded mp3/wav
                    const player = spawn('ffplay', ['-nodisp', '-autoexit', 'pipe:0'], {
                        stdio: ['pipe', 'ignore', 'ignore']
                    });
                    player.stdin.write(Buffer.from(rawData, 'base64'));
                    player.stdin.end();
                    player.on('exit', () => {
                        isSpeaking = false;
                        processQueue();
                    });
                }
            }
        } catch (e) {
            console.error('[TTS] Audio error', e);
            isSpeaking = false;
            processQueue();
        }
    }
}
