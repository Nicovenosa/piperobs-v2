import { spawn, execFile } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, createWriteStream, readFileSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { platform, arch } from 'os';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';

import { ExtractedSpeechDocument } from './TextExtractor';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface PhraseStartData {
  text: string;
  fullParagraph: string;
  words: WordTiming[];
  duration: number;
  paragraphIndex: number;
  phraseIndex: number;
}

export interface SynthesisProgress {
  current: number;
  total: number;
}

interface PhraseAudioItem {
  duration: number;
  timings: WordTiming[];
  file: string;
  audioBuffer: AudioBuffer;
}

export type PiperEvent =
  | 'connected'
  | 'disconnected'
  | 'synthesis-started'
  | 'synthesis-progress'
  | 'playback-started'
  | 'phrase-started'
  | 'phrase-finished'
  | 'phrase-playing'
  | 'paragraph-started'
  | 'paragraph-finished'
  | 'playback-finished'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'error'
  | 'progress'
  | 'download-progress'
  | 'voice-changed';

type Listener = (payload: unknown) => void;

// ─── Constantes ─────────────────────────────────────────────────────────────

const PIPER_VERSION = '2023.11.14-2';
const PIPER_BASE_URL = 'https://github.com/rhasspy/piper/releases/download';

function getPiperBinaryName(): string {
  const plat = platform();
  const cpu = arch();
  if (plat === 'linux' && cpu === 'x64') return 'piper_linux_x86_64.tar.gz';
  if (plat === 'linux' && cpu === 'arm64') return 'piper_linux_aarch64.tar.gz';
  if (plat === 'darwin' && cpu === 'x64') return 'piper_macos_x64.tar.gz';
  if (plat === 'darwin' && cpu === 'arm64') return 'piper_macos_aarch64.tar.gz';
  if (plat === 'win32' && cpu === 'x64') return 'piper_windows_amd64.zip';
  throw new Error(`Plataforma no soportada: ${plat} ${cpu}`);
}

function getPiperBinPath(dataDir: string): string {
  return join(dataDir, 'bin', 'piper', 'piper' + (platform() === 'win32' ? '.exe' : ''));
}

function getPiperBinDir(dataDir: string): string {
  return join(dataDir, 'bin', 'piper');
}

function getPiperDownloadUrl(): string {
  return `${PIPER_BASE_URL}/${PIPER_VERSION}/${getPiperBinaryName()}`;
}

const VOICE_BASE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

const PHRASE_END_RE = /[.!?…]+(?:["')\]]+)?$/;

// ─── WAV Header parser ──────────────────────────────────────────────────────

function readWavSampleRate(filePath: string): number {
  try {
    const fd = readFileSync(filePath);
    if (fd.length < 44) return 22050;
    // Bytes 24-27: sample rate (little-endian)
    const rate = fd.readUInt32LE(24);
    return rate > 0 ? rate : 22050;
  } catch {
    return 22050;
  }
}

// ─── PiperEngine ────────────────────────────────────────────────────────────

export class PiperEngine {
  private dataDir: string;
  private voiceDir: string;
  private binPath: string;
  private listeners = new Map<PiperEvent, Set<Listener>>();
  private destroyed = false;

  private currentJob: {
    abort: boolean;
    paused: boolean;
    phrases: Array<{ text: string; paragraphIndex: number; phraseIndex: number; fullParagraph: string; words: string[] }>;
    currentIndex: number;
    rate: number;
    voiceId: string;
  } | null = null;

  private pauseResolve: (() => void) | null = null;
  private activeVoices: string[] = [];

  // Generación de playback: se incrementa en cada start/seek/stop para invalidar operaciones viejas
  private playbackGeneration = 0;
  // Para abortar playAudio() inmediatamente
  private audioAbortFn: (() => void) | null = null;

  // Web Audio API para gapless playback
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private nextAudioTime = 0;
  private currentPhraseAudioStartTime = 0;
  private voiceChangeGen = 0;

  constructor(dataDir: string, activeVoices?: string[]) {
    this.dataDir = dataDir;
    this.voiceDir = join(dataDir, 'voices');
    this.binPath = getPiperBinPath(dataDir);
    this.activeVoices = activeVoices || [];
  }

  // ─── Inicialización ─────────────────────────────────────────────────────

  async initialize(onProgress?: (msg: string, pct?: number) => void): Promise<void> {
    mkdirSync(this.dataDir, { recursive: true });
    mkdirSync(join(this.dataDir, 'bin'), { recursive: true });
    mkdirSync(this.voiceDir, { recursive: true });

    console.debug('[PiperObs] Data dir:', this.dataDir);
    console.debug('[PiperObs] Bin path:', this.binPath);
    console.debug('[PiperObs] Voice dir:', this.voiceDir);

    if (!existsSync(this.binPath)) {
      console.debug('[PiperObs] Binary not found, downloading...');
      await this.downloadPiperBinary(onProgress);
      console.debug('[PiperObs] Binary download complete');
    } else {
      console.debug('[PiperObs] Binary already exists');
    }

    for (const voiceId of this.activeVoices) {
      const voiceModelPath = join(this.voiceDir, voiceId, voiceId + '.onnx');
      if (!existsSync(voiceModelPath)) {
        console.debug('[PiperObs] Voice not found, downloading:', voiceId);
        await this.downloadVoice(voiceId, onProgress);
        console.debug('[PiperObs] Voice download complete:', voiceId);
      } else {
        console.debug('[PiperObs] Voice already exists:', voiceId);
      }
    }

    console.debug('[PiperObs] Checking binary...');
    try {
      await this.checkBinary();
      console.debug('[PiperObs] Binary check OK');
      this.emit('connected', { dataDir: this.dataDir });
    } catch (err) {
      console.error('[PiperObs] Binary check FAILED:', err);
      this.emit('error', { message: 'Piper binary check failed', err });
      return;
    }
  }

  private async checkBinary(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binPath, ['--help'], {
        cwd: getPiperBinDir(this.dataDir),
      });
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Piper exit code ${code}`));
      });
      child.on('error', (err) => reject(err));
      setTimeout(() => reject(new Error('Piper binary timeout')), 5000);
    });
  }

  // ─── Eventos ────────────────────────────────────────────────────────────

  on(event: PiperEvent, listener: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  private emit(event: PiperEvent, payload: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch { /* no-op */ }
    }
  }

  // ─── Control de generación ──────────────────────────────────────────────

  private getGen(): number {
    return this.playbackGeneration;
  }

  private checkGen(gen: number): boolean {
    return gen === this.playbackGeneration && !this.destroyed;
  }

  // ─── API de control ─────────────────────────────────────────────────────

  async speak(text: string, voiceId: string, rate: number = 1.0, speechDoc?: ExtractedSpeechDocument): Promise<void> {
    this.stop(); // Detener cualquier job anterior
    this.playbackGeneration++;
    const gen = this.getGen();

    const voiceModelPath = join(this.voiceDir, voiceId, voiceId + '.onnx');

    if (!existsSync(voiceModelPath)) {
      this.emit('error', { message: `Voz no encontrada: ${voiceId}. Descargala desde el panel de voces.` });
      return;
    }

    // Construir frases
    const phrases: Array<{
      text: string;
      paragraphIndex: number;
      phraseIndex: number;
      fullParagraph: string;
      words: string[];
    }> = [];

    if (speechDoc && speechDoc.paragraphs.length > 0) {
      for (const paragraph of speechDoc.paragraphs) {
        for (const phrase of paragraph.phrases) {
          const words = phrase.words.map(w => w.text);
          if (words.length > 0) {
            phrases.push({
              text: words.join(' '),
              paragraphIndex: phrase.paragraphIndex,
              phraseIndex: phrase.phraseIndex,
              fullParagraph: paragraph.text,
              words,
            });
          }
        }
      }
    } else {
      const paragraphs = this.splitParagraphs(text);
      paragraphs.forEach((paragraphText, pIdx) => {
        const phraseTexts = this.splitPhrases(paragraphText);
        phraseTexts.forEach((phraseText, fIdx) => {
          if (phraseText.trim().length > 0) {
            phrases.push({
              text: phraseText.trim(),
              paragraphIndex: pIdx,
              phraseIndex: fIdx,
              fullParagraph: paragraphText,
              words: phraseText.trim().split(/\s+/),
            });
          }
        });
      });
    }

    if (phrases.length === 0) {
      this.emit('error', { message: 'No hay texto para leer' });
      return;
    }

    this.currentJob = {
      abort: false,
      paused: false,
      phrases,
      currentIndex: 0,
      rate,
      voiceId,
    };

    this.emit('synthesis-started', null);

    // Queue de frases pre-sintetizadas — solo 1 frase antes de empezar a reproducir
    const buffer: Array<{ duration: number; timings: WordTiming[]; file: string; audioBuffer: AudioBuffer }> = [];

    const _synth = (t: string, v: string, r: number, f: string) => this.synthesize(t, v, r, f);
    const _estDur = (f: string, wc: number) => this.estimateDurationFromFile(f, wc);
    const _estTime = (w: string[], d: number) => this.estimateWordTimings(w, d);

    const synthOne = async (idx: number): Promise<PhraseAudioItem> => {
      const p = phrases[idx];
      const f = join(this.dataDir, `.temp-phrase-${idx}.wav`);
      // Usar this.currentJob!.voiceId para permitir cambio de voz en vivo
      await _synth(p.text, this.currentJob!.voiceId, this.currentJob?.rate ?? rate, f);
      if (!this.checkGen(gen) || this.currentJob?.abort) throw new Error('aborted');
      const dur = _estDur(f, p.words.length);
      const t = _estTime(p.words, dur);
      const buf = await this.decodeWav(f);
      return { duration: dur, timings: t, file: f, audioBuffer: buf };
    };

    // Pre-llenar buffer: solo 1 frase. Empezar a reproducir tan pronto como esté lista.
    let produceIdx = 0;
    try {
      const firstItem = await synthOne(produceIdx++);
      if (this.checkGen(gen) && !this.currentJob?.abort) buffer.push(firstItem);
    } catch { if (!this.checkGen(gen) || this.currentJob?.abort) return; }

    // Loop de reproducción
    let nextPromise: Promise<PhraseAudioItem> | null = null;
    for (let i = 0; i < phrases.length; i++) {
      if (!this.checkGen(gen) || this.currentJob?.abort) break;

      // Pausa
      if (this.currentJob?.paused) {
        await new Promise<void>(resolve => { this.pauseResolve = resolve; });
        if (!this.checkGen(gen) || this.currentJob?.abort) break;
      }

      if (this.currentJob) this.currentJob.currentIndex = i;
      this.emit('synthesis-progress', { current: i + 1, total: phrases.length });

      const phrase = phrases[i];

      // Si buffer vacío, esperar síntesis en curso o iniciar una
      let item = buffer.shift();
      if (!item) {
        if (nextPromise) {
          try {
            const r: PhraseAudioItem = await nextPromise;
            if (this.checkGen(gen) && !this.currentJob?.abort) item = r;
            else { this.safeUnlink(r.file); }
          } catch { /* no-op */ }
          nextPromise = null;
        }
        if (!item && produceIdx < phrases.length) {
          try {
            const r: PhraseAudioItem = await synthOne(produceIdx++);
            if (this.checkGen(gen) && !this.currentJob?.abort) item = r;
            else { this.safeUnlink(r.file); }
          } catch { /* no-op */ }
        }
        if (!item) break;
      }

      // Progress tracking (estimado)
      let elapsedMs = 0;
      for (let j = 0; j < i; j++) elapsedMs += phrases[j].words.length * 400;
      const totalMs = phrases.reduce((s, p) => s + p.words.length * 400, 0);
      this.emit('progress', { elapsedMs, totalMs });

      const effectiveTimings = item.timings;

      this.emit('phrase-started', {
        text: phrase.text,
        fullParagraph: phrase.fullParagraph,
        words: effectiveTimings,
        duration: item.duration,
        paragraphIndex: phrase.paragraphIndex,
        phraseIndex: phrase.phraseIndex,
      } as PhraseStartData);

      // Sintetizar siguiente en background ANTES de reproducir
      if (!nextPromise && produceIdx < phrases.length) {
        nextPromise = synthOne(produceIdx++);
      }

      await this.playAudio(item.audioBuffer, gen);

      if (!this.checkGen(gen)) {
        this.safeUnlink(item.file);
        if (nextPromise) { try { await nextPromise; } catch { /* no-op */ } }
        return;
      }

      this.safeUnlink(item.file);
      this.emit('phrase-finished', { paragraphIndex: phrase.paragraphIndex, phraseIndex: phrase.phraseIndex });

      // Consumir nextPromise si terminó mientras reproducíamos
      if (nextPromise) {
        try {
          const r = await nextPromise;
          if (this.checkGen(gen) && !this.currentJob?.abort) buffer.push(r);
          else { this.safeUnlink(r.file); }
        } catch { /* no-op */ }
        nextPromise = null;
      }
    }

    if (this.checkGen(gen) && !this.currentJob?.abort) {
      const paraCount = speechDoc?.paragraphs?.length || this.splitParagraphs(text).length || 1;
      this.emit('playback-finished', {
        paragraphs: paraCount,
        phrases: phrases.length,
      });
    }

    this.currentJob = null;
  }

  pause(): void {
    if (this.currentJob) {
      this.currentJob.paused = true;
      this.audioCtx?.suspend();
      this.emit('paused', null);
    }
  }

  resume(): void {
    if (this.currentJob) {
      this.currentJob.paused = false;
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
      }
      this.audioCtx?.resume();
      this.emit('resumed', null);
    }
  }

  stop(): void {
    this.playbackGeneration++;

    if (this.currentJob) {
      this.currentJob.abort = true;
      this.currentJob.paused = false;
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
      }
    }

    // Abortar audio activo inmediatamente
    if (this.audioAbortFn) {
      this.audioAbortFn();
      this.audioAbortFn = null;
    }

    // Matar audio al instante
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* no-op */ }
      try { this.currentSource.disconnect(); } catch { /* no-op */ }
      this.currentSource = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch { /* no-op */ }
      this.audioCtx = null;
      this.gainNode = null;
    }

    this.cleanTempFiles();
    this.currentJob = null;
    this.nextAudioTime = 0;
    this.emit('stopped', null);
  }

  async seek(direction: 'next' | 'prev'): Promise<void> {
    if (!this.currentJob || this.currentJob.currentIndex < 0) return;

    const targetIndex = direction === 'next'
      ? Math.min(this.currentJob.currentIndex + 1, this.currentJob.phrases.length - 1)
      : Math.max(0, this.currentJob.currentIndex - 1);

    if (targetIndex === this.currentJob.currentIndex) return;

    // Incrementar generación para invalidar el loop principal
    this.playbackGeneration++;
    const gen = this.getGen();

    // Abortar audio actual
    if (this.audioAbortFn) {
      this.audioAbortFn();
      this.audioAbortFn = null;
    }

    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* no-op */ }
      try { this.currentSource.disconnect(); } catch { /* no-op */ }
      this.currentSource = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch { /* no-op */ }
      this.audioCtx = null;
      this.gainNode = null;
    }

    this.cleanTempFiles();
    this.nextAudioTime = 0;

    const phrase = this.currentJob.phrases[targetIndex];
    const tempFile = join(this.dataDir, `.temp-seek-${Date.now()}.wav`);

    try {
      await this.synthesize(phrase.text, this.currentJob.voiceId, this.currentJob.rate, tempFile);
      if (!this.checkGen(gen) || this.currentJob?.abort) {
        this.safeUnlink(tempFile);
        return;
      }

      const sampleRate = readWavSampleRate(tempFile);
      const duration = this.estimateDurationFromFile(tempFile, phrase.words.length);
      const wordTimings = this.estimateWordTimings(phrase.words, duration);
      const seekAudioBuffer = await this.decodeWav(tempFile);

      this.currentJob.currentIndex = targetIndex;

      this.emit('phrase-started', {
        text: phrase.text,
        fullParagraph: phrase.fullParagraph,
        words: wordTimings,
        duration,
        paragraphIndex: phrase.paragraphIndex,
        phraseIndex: phrase.phraseIndex,
      } as PhraseStartData);

      await this.playAudio(seekAudioBuffer, gen);

      this.safeUnlink(tempFile);
      if (!this.checkGen(gen) || this.currentJob?.abort) return;

      this.emit('phrase-finished', {
        paragraphIndex: phrase.paragraphIndex,
        phraseIndex: phrase.phraseIndex,
      });

      // Continuar con el loop principal desde la siguiente frase
      // Para lograr esto sin duplicar lógica, reiniciamos speak() desde el targetIndex+1
      await this.continueFromIndex(targetIndex + 1, gen);
    } catch (err) {
      this.emit('error', { message: 'Error en seek', err });
    }
  }

  private async continueFromIndex(startIndex: number, gen: number): Promise<void> {
    if (!this.currentJob || startIndex >= this.currentJob.phrases.length) return;
    const { phrases, rate } = this.currentJob;
    const buffer: Array<{ duration: number; timings: WordTiming[]; file: string; audioBuffer: AudioBuffer }> = [];

    const synthOne = async (idx: number): Promise<PhraseAudioItem> => {
      const p = phrases[idx];
      const f = join(this.dataDir, `.temp-phrase-${idx}.wav`);
      // Usar this.currentJob!.voiceId para permitir cambio de voz en vivo
      await this.synthesize(p.text, this.currentJob!.voiceId, this.currentJob?.rate ?? rate, f);
      if (!this.checkGen(gen) || this.currentJob?.abort) throw new Error('aborted');
      const dur = this.estimateDurationFromFile(f, p.words.length);
      const t = this.estimateWordTimings(p.words, dur);
      const buf = await this.decodeWav(f);
      return { duration: dur, timings: t, file: f, audioBuffer: buf };
    };

    // Pre-llenar buffer: solo 1 frase. Empezar a reproducir tan pronto como esté lista.
    let produceIdx = startIndex;
    try {
      const firstItem = await synthOne(produceIdx++);
      if (this.checkGen(gen) && !this.currentJob?.abort) buffer.push(firstItem);
    } catch { if (!this.checkGen(gen) || this.currentJob?.abort) return; }

    let nextPromise: Promise<PhraseAudioItem> | null = null;
    for (let i = startIndex; i < phrases.length; i++) {
      if (!this.checkGen(gen) || this.currentJob?.abort) break;
      if (this.currentJob?.paused) {
        await new Promise<void>(resolve => { this.pauseResolve = resolve; });
        if (!this.checkGen(gen) || this.currentJob?.abort) break;
      }

      this.currentJob.currentIndex = i;
      this.emit('synthesis-progress', { current: i + 1, total: phrases.length });

      const phrase = phrases[i];
      let item = buffer.shift();
      if (!item) {
        if (nextPromise) {
          try {
            const r: PhraseAudioItem = await nextPromise;
            if (this.checkGen(gen) && !this.currentJob?.abort) item = r;
            else { this.safeUnlink(r.file); }
          } catch { /* no-op */ }
          nextPromise = null;
        }
        if (!item && produceIdx < phrases.length) {
          try {
            const r: PhraseAudioItem = await synthOne(produceIdx++);
            if (this.checkGen(gen) && !this.currentJob?.abort) item = r;
            else { this.safeUnlink(r.file); }
          } catch { /* no-op */ }
        }
        if (!item) break;
      }

      const effectiveTimings = item.timings;

      this.emit('phrase-started', {
        text: phrase.text,
        fullParagraph: phrase.fullParagraph,
        words: effectiveTimings,
        duration: item.duration,
        paragraphIndex: phrase.paragraphIndex,
        phraseIndex: phrase.phraseIndex,
      } as PhraseStartData);

      if (!nextPromise && produceIdx < phrases.length) {
        nextPromise = synthOne(produceIdx++);
      }

      await this.playAudio(item.audioBuffer, gen);

      if (!this.checkGen(gen)) {
        this.safeUnlink(item.file);
        if (nextPromise) { try { await nextPromise; } catch { /* no-op */ } }
        return;
      }

      this.safeUnlink(item.file);
      this.emit('phrase-finished', { paragraphIndex: phrase.paragraphIndex, phraseIndex: phrase.phraseIndex });

      if (nextPromise) {
        try {
          const r = await nextPromise;
          if (this.checkGen(gen) && !this.currentJob?.abort) buffer.push(r);
          else { this.safeUnlink(r.file); }
        } catch { /* no-op */ }
        nextPromise = null;
      }
    }

    if (this.checkGen(gen) && !this.currentJob?.abort) {
      this.emit('playback-finished', {
        paragraphs: this.splitParagraphs(phrases.map(p => p.fullParagraph).join('\n\n')).length || 1,
        phrases: phrases.length,
      });
    }

    this.currentJob = null;
  }

  setPlaybackRate(rate: number): void {
    if (this.currentJob) {
      this.currentJob.rate = rate;
    }
  }

  setVolume(vol: number): void {
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    }
  }

  setVoice(voiceId: string): void {
    if (this.currentJob) {
      this.currentJob.voiceId = voiceId;
      this.voiceChangeGen++;
      this.emit('voice-changed', { voiceId, gen: this.voiceChangeGen });
    }
  }

  getAudioElapsedMs(): number {
    if (!this.audioCtx) return 0;
    return Math.max(0, (this.audioCtx.currentTime - this.currentPhraseAudioStartTime) * 1000);
  }

  async restartWithVoice(voiceId: string): Promise<void> {
    if (!this.currentJob) return;
    const currentIndex = this.currentJob.currentIndex;
    const { phrases } = this.currentJob;

    // Cambiar voz
    this.currentJob.voiceId = voiceId;

    // Abortar audio actual
    this.playbackGeneration++;
    const gen = this.getGen();

    if (this.audioAbortFn) {
      this.audioAbortFn();
      this.audioAbortFn = null;
    }
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* no-op */ }
      try { this.currentSource.disconnect(); } catch { /* no-op */ }
      this.currentSource = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch { /* no-op */ }
      this.audioCtx = null;
    }
    this.nextAudioTime = 0;
    this.cleanTempFiles();

    // Reanudar desde la frase actual con la nueva voz
    if (currentIndex < phrases.length) {
      await this.continueFromIndex(currentIndex, gen);
    }
  }

  // ─── Descargas ──────────────────────────────────────────────────────────

  private async downloadPiperBinary(onProgress?: (msg: string, pct?: number) => void): Promise<void> {
    const url = getPiperDownloadUrl();
    const archiveName = getPiperBinaryName();
    const archivePath = join(this.dataDir, 'bin', archiveName);

    onProgress?.('Descargando Piper TTS...', 0);

    await this.downloadFile(url, archivePath, (pct) => {
      onProgress?.('Descargando Piper TTS...', pct * 0.8);
    });

    onProgress?.('Extrayendo Piper TTS...', 0.85);
    await this.extractArchive(archivePath, join(this.dataDir, 'bin'));

    if (platform() !== 'win32') {
      await new Promise<void>((resolve, reject) => {
        execFile('chmod', ['+x', this.binPath], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    try { unlinkSync(archivePath); } catch { /* no-op */ }
    onProgress?.('Piper TTS listo', 1);
  }

  async downloadVoice(voiceId: string, onProgress?: (msg: string, pct?: number) => void): Promise<void> {
    const voiceDir = join(this.voiceDir, voiceId);
    mkdirSync(voiceDir, { recursive: true });

    const pathParts = this.parseVoiceIdPath(voiceId);
    const modelUrl = `${VOICE_BASE_URL}/${pathParts}/${voiceId}.onnx`;
    const configUrl = `${VOICE_BASE_URL}/${pathParts}/${voiceId}.onnx.json`;

    const modelPath = join(voiceDir, voiceId + '.onnx');
    const configPath = join(voiceDir, voiceId + '.onnx.json');

    onProgress?.(`Descargando ${voiceId}...`, 0);

    await this.downloadFile(modelUrl, modelPath, (pct) => {
      onProgress?.(`Descargando ${voiceId}...`, pct * 0.95);
    });

    try {
      await this.downloadFile(configUrl, configPath, () => {});
    } catch {
      const espeak = voiceId.split('-')[1] || 'en-us';
      const cfg = { num_speakers: 1, sample_rate: 22050, espeak_voice: espeak };
      writeFileSync(configPath, JSON.stringify(cfg));
    }

    onProgress?.(`${voiceId} lista`, 1);

    if (!this.activeVoices.includes(voiceId)) {
      this.activeVoices.push(voiceId);
    }
  }

  private parseVoiceIdPath(voiceId: string): string {
    const firstDash = voiceId.indexOf('-');
    if (firstDash < 0) return voiceId;
    const langRegion = voiceId.substring(0, firstDash);
    const lang = langRegion.split('_')[0];
    const rest = voiceId.substring(firstDash + 1);
    const parts = rest.split('-');
    const quality = parts[parts.length - 1];
    const name = parts.slice(0, -1).join('-');
    return `${lang}/${langRegion}/${name}/${quality}`;
  }

  isVoiceInstalled(voiceId: string): boolean {
    const modelPath = join(this.voiceDir, voiceId, voiceId + '.onnx');
    return existsSync(modelPath);
  }

  getVoiceDir(): string { return this.voiceDir; }
  getDataDir(): string { return this.dataDir; }
  isBinaryReady(): boolean { return existsSync(this.binPath); }

  // ─── Síntesis ───────────────────────────────────────────────────────────

  private synthesize(text: string, voiceId: string, rate: number, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const voiceModelPath = join(this.voiceDir, voiceId, voiceId + '.onnx');
      const voiceConfigPath = join(this.voiceDir, voiceId, voiceId + '.onnx.json');

      const lengthScale = rate > 0 ? (1 / rate) : 1.0;

      const args = [
        '--model', voiceModelPath,
        '--length_scale', String(Math.round(lengthScale * 100) / 100),
        '--output_file', outputFile,
      ];

      if (existsSync(voiceConfigPath)) {
        args.push('--config', voiceConfigPath);
      }

      const child = spawn(this.binPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: getPiperBinDir(this.dataDir),
      });

      let stderr = '';

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Piper exit ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => reject(err));

      child.stdin.write(text);
      child.stdin.end();
    });
  }

  // ─── Web Audio API ──────────────────────────────────────────────────────

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: 22050 });
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private async decodeWav(filePath: string): Promise<AudioBuffer> {
    const buffer = readFileSync(filePath);
    const ctx = this.getAudioContext();
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return new Promise((resolve, reject) => {
      ctx.decodeAudioData(arrayBuffer, (decoded) => {
        resolve(this.trimAudioBuffer(decoded));
      }, (err) => reject(err));
    });
  }

  // Recorta silencio al inicio y final del buffer (padding que genera Piper)
  private trimAudioBuffer(buffer: AudioBuffer): AudioBuffer {
    const threshold = 0.0005;
    const channelData = buffer.getChannelData(0);

    // Encontrar primer sample con audio (silencio inicial)
    let firstSample = 0;
    while (firstSample < channelData.length && Math.abs(channelData[firstSample]) < threshold) {
      firstSample++;
    }

    // Encontrar último sample con audio (silencio final)
    let lastSample = channelData.length - 1;
    while (lastSample > firstSample && Math.abs(channelData[lastSample]) < threshold) {
      lastSample--;
    }

    // Dejar ~30ms de cola y ~10ms de ataque para evitar cortes bruscos
    const sampleRate = buffer.sampleRate;
    const attackPad = Math.round(sampleRate * 0.01);
    const releasePad = Math.round(sampleRate * 0.03);

    const start = Math.max(0, firstSample - attackPad);
    const end = Math.min(channelData.length, lastSample + 1 + releasePad);
    const newLength = end - start;

    if (start === 0 && end >= channelData.length) return buffer;

    const newBuffer = this.getAudioContext().createBuffer(buffer.numberOfChannels, newLength, sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      newBuffer.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
    }
    return newBuffer;
  }

  private playAudio(audioBuffer: AudioBuffer, gen: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.checkGen(gen)) { resolve(); return; }

      let resolved = false;
      const doResolve = () => {
        if (resolved) return;
        resolved = true;
        this.audioAbortFn = null;
        resolve();
      };

      try {
        const ctx = this.getAudioContext();
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.gainNode || ctx.destination);
        this.currentSource = source;
        this.audioAbortFn = doResolve;

        source.onended = () => {
          this.currentSource = null;
          doResolve();
        };

        // Gapless playback: programar el inicio exacto para que encadene con el anterior
        const when = Math.max(ctx.currentTime, this.nextAudioTime);
        this.currentPhraseAudioStartTime = when;
        this.nextAudioTime = when + audioBuffer.duration;
        source.start(when);

        // Emitir phrase-playing exactamente cuando la frase empieza a sonar
        const delayUntilStart = Math.max(0, (when - ctx.currentTime) * 1000);
        setTimeout(() => {
          this.emit('phrase-playing', { phraseStartTime: performance.now() });
          if (when <= ctx.currentTime) {
            this.emit('playback-started', null);
          }
        }, delayUntilStart);
      } catch (err) {
        console.error('[PiperObs] playAudio error:', err);
        doResolve();
      }
    });
  }

  private estimateDurationFromFile(filePath: string, wordCount: number): number {
    try {
      const sampleRate = readWavSampleRate(filePath);
      const stat = statSync(filePath);
      const dataSize = Math.max(0, stat.size - 44);
      const ms = Math.round((dataSize / 2 / sampleRate) * 1000);
      return ms > 0 ? ms : wordCount * 400;
    } catch {
      return wordCount * 400;
    }
  }

  // ─── Estimación de timings ──────────────────────────────────────────────

  private estimateWordTimings(words: string[], totalDurationMs: number): WordTiming[] {
    if (words.length === 0) return [];

    const totalChars = words.reduce((sum, w) => sum + w.length, 0) || 1;
    const msPerChar = totalDurationMs / totalChars;
    let currentTime = 0;

    return words.map(word => {
      const wordDuration = word.length * msPerChar;
      const timing: WordTiming = {
        word,
        start: Math.round(currentTime),
        end: Math.round(currentTime + wordDuration),
      };
      currentTime += wordDuration;
      return timing;
    });
  }

  // ─── Utilidades de texto ────────────────────────────────────────────────

  private splitParagraphs(text: string): string[] {
    return text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(Boolean);
  }

  private splitPhrases(paragraph: string): string[] {
    const phrases: string[] = [];
    let current = '';
    const tokens = paragraph.split(/\s+/);
    for (const token of tokens) {
      current += (current ? ' ' : '') + token;
      if (PHRASE_END_RE.test(token) || current.length > 200) {
        phrases.push(current);
        current = '';
      }
    }
    if (current.trim()) {
      phrases.push(current);
    }
    return phrases.length > 0 ? phrases : [paragraph];
  }

  // ─── Limpieza segura ────────────────────────────────────────────────────

  private safeUnlink(filePath: string): void {
    try { unlinkSync(filePath); } catch { /* no-op */ }
  }

  private cleanTempFiles(): void {
    try {
      const files = readdirSync(this.dataDir).filter((f: string) =>
        f.startsWith('.temp-phrase') || f.startsWith('.temp-seek')
      );
      files.forEach((f: string) => {
        try { unlinkSync(join(this.dataDir, f)); } catch { /* no-op */ }
      });
    } catch { /* no-op */ }
  }

  // ─── Utilidades de descarga ─────────────────────────────────────────────

  private async downloadFile(
    url: string,
    destPath: string,
    onProgress: (pct: number) => void,
    redirectCount: number = 0,
  ): Promise<void> {
    const MAX_REDIRECTS = 10;
    if (redirectCount > MAX_REDIRECTS) throw new Error('Demasiados redirects');

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const getter = parsedUrl.protocol === 'https:' ? httpsGet : httpGet;

      const req = getter(url, (res) => {
        const status = res.statusCode || 500;

        if (status >= 300 && status < 400 && res.headers.location) {
          req.destroy();
          const redirectUrl = new URL(res.headers.location, parsedUrl).href;
          this.downloadFile(redirectUrl, destPath, onProgress, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status} al descargar ${url}`));
          return;
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        const destDir = dirname(destPath);
        mkdirSync(destDir, { recursive: true });

        const file = createWriteStream(destPath);
        let received = 0;

        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) {
            try { onProgress(received / total); } catch { /* no-op */ }
          }
        });

        res.pipe(file);

        file.on('finish', () => resolve());
        file.on('error', (err) => {
          try { unlinkSync(destPath); } catch { /* no-op */ }
          reject(err);
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(120000, () => {
        req.destroy();
        reject(new Error('Timeout descargando'));
      });
    });
  }

  private async extractArchive(archivePath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (archivePath.endsWith('.zip')) {
        execFile('unzip', ['-o', archivePath, '-d', destDir], (err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        execFile('tar', ['-xzf', archivePath, '-C', destDir], (err) => {
          if (err) reject(err);
          else resolve();
        });
      }
    });
  }

  // ─── Limpieza ───────────────────────────────────────────────────────────

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.listeners.clear();
  }
}
