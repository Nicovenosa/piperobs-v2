import { Plugin, PluginSettingTab, Setting, WorkspaceLeaf, MarkdownView, Notice, TFile, App } from 'obsidian';
import { DEFAULT_SETTINGS, PiperObsSettings, FEATURED_VOICES, DEFAULT_DATA_DIR, KaraokeTheme, InstalledVoice, KARAOKE_THEMES } from './settings/DEFAULTS';
import { SidePanelView, VIEW_TYPE, SidebarVoice } from './views/SidePanel';
import { MiniPlayer } from './views/MiniPlayer';
import { VoiceModal } from './views/VoiceModal';
import { DownloadModal } from './views/DownloadModal';
import { AutoMagicBanner } from './views/AutoMagicBanner';
import { StatusBarItem } from './views/StatusBar';
import { PiperEngine } from './PiperEngine';
import { KaraokeHighlighter, karaokeDecorationsExtension } from './KaraokeHighlighter';
import { extractFromActiveFile, ExtractedSpeechDocument } from './TextExtractor';
import { join } from 'path';

// ─── Pomodoro State ─────────────────────────────────────────────────────────

interface PomodoroState {
  active: boolean;
  mode: 'focus' | 'break';
  remainingSec: number;
  totalSec: number;
  timerId: number | null;
  sessionsCompleted: number;
}

const POMODORO_FOCUS_MIN = 25;
const POMODORO_BREAK_MIN = 5;

export default class PiperObsV2Plugin extends Plugin {
  settings: PiperObsSettings = DEFAULT_SETTINGS;
  engine: PiperEngine | null = null;
  karaokeHighlighter: KaraokeHighlighter | null = null;
  sidePanel: SidePanelView | null = null;
  miniPlayer: MiniPlayer | null = null;
  statusBar: StatusBarItem | null = null;
  currentJob: { jobId: string; paragraphs: number } | null = null;
  dismissedBanners: Set<string> = new Set();
  private initialized = false;
  private _currentPhrase = 0;
  private _totalPhrases = 0;

  // Pomodoro
  pomodoro: PomodoroState = {
    active: false,
    mode: 'focus',
    remainingSec: POMODORO_FOCUS_MIN * 60,
    totalSec: POMODORO_FOCUS_MIN * 60,
    timerId: null,
    sessionsCompleted: 0,
  };
  private adaptiveFocusMin = POMODORO_FOCUS_MIN;
  private adaptiveBreakMin = POMODORO_BREAK_MIN;

  async onload() {
    console.debug('Loading PiperObs v2...');

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Guard: clean up any previous failed loads
    try {
      this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    } catch { /* no-op */ }

    // Register view
    try {
      this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new SidePanelView(leaf));
    } catch {
      console.warn('PiperObs v2: view type ya registrado, continuando...');
    }

    // Register CodeMirror extension for karaoke highlighting
    this.registerEditorExtension([karaokeDecorationsExtension]);

    await this.initializePlugin();
    new Notice('Plugin cargado');
  }

  private async initializePlugin() {
    const adapter = this.app.vault.adapter as unknown as { basePath?: string };
    const dataDir = join(
      adapter.basePath || '',
      this.app.vault.configDir,
      this.settings.dataDir || DEFAULT_DATA_DIR
    );

    const voiceIds = this.settings.installedVoices.map(v => v.id);
    this.engine = new PiperEngine(dataDir, voiceIds);
    this.engine.setVolume(this.settings.volume ?? 0.85);
    this.karaokeHighlighter = new KaraokeHighlighter(this.app);
    this.miniPlayer = new MiniPlayer();

    // Status bar
    const statusBarEl = this.addStatusBarItem();
    this.statusBar = new StatusBarItem(statusBarEl);

    // ─── Eventos del engine ───────────────────────────────────────────────

    const progressNotice = new Notice('Preparando...', 0);

    this.engine.on('connected', () => {
      this.statusBar?.update('idle');
      this.sidePanel?.updateBridgeStatus(true);
    });

    this.engine.on('synthesis-started', () => {
      this.miniPlayer?.show('synthesizing');
      this.statusBar?.update('synthesizing');
    });

    this.engine.on('synthesis-progress', (data: unknown) => {
      const progress = data as { current: number; total: number };
      if (this.miniPlayer) {
        this.miniPlayer.updateSynthProgress(progress.current, progress.total);
      }
      this._currentPhrase = progress.current;
      this._totalPhrases = progress.total;
    });

    this.engine.on('playback-started', () => {
      this.miniPlayer?.show('playing');
      this.sidePanel?.updatePlaybackState('playing');
      this.statusBar?.update('playing', {
        voiceShort: this.settings.defaultVoice.split('-')[1],
        rate: this.settings.playbackRate,
      });
      // Auto-start pomodoro focus if enabled
      if (this.settings.pomodoroEnabled && !this.pomodoro.active) {
        this.startPomodoro();
      }
      // Start pomodoro timer when audio actually starts
      if (this.pomodoro.active && this.pomodoro.timerId === null) {
        this.startPomodoroTimer();
      }
    });

    this.engine.on('phrase-started', (data: unknown) => {
      if (this.settings.highlightEnabled && this.karaokeHighlighter) {
        this.karaokeHighlighter.startPhrase(data as { text: string; fullParagraph: string; words: { word: string; start: number; end: number }[]; duration: number; paragraphIndex?: number; phraseIndex?: number });
      }
    });

    this.engine.on('phrase-playing', (data: unknown) => {
      const progress = data as { phraseStartTime: number };
      if (this.karaokeHighlighter) {
        this.karaokeHighlighter.syncToAudio(progress.phraseStartTime);
      }
    });

    this.engine.on('progress', (data: unknown) => {
      const progress = data as { elapsedMs: number; totalMs: number };
      if (this.miniPlayer && progress.totalMs > 0) {
        const pct = progress.elapsedMs / progress.totalMs;
        const elapsed = this.formatMs(progress.elapsedMs);
        const total = this.formatMs(progress.totalMs);
        this.miniPlayer.updateProgress(pct, elapsed, total);
      }
      if (this.currentJob && this.sidePanel) {
        this.sidePanel.updateInlineProgress(
          this._currentPhrase || 1,
          this._totalPhrases || 0,
          this.formatMs(progress.elapsedMs)
        );
      }
    });

    this.engine.on('phrase-finished', () => {
      if (this.karaokeHighlighter) {
        this.karaokeHighlighter.finishPhrase();
      }
    });

    this.engine.on('paused', () => {
      this.miniPlayer?.setPaused(true);
      this.sidePanel?.updatePlaybackState('paused');
      this.karaokeHighlighter?.pause();
      this.statusBar?.update('paused');
      if (this.pomodoro.active && this.pomodoro.timerId !== null) {
        window.clearInterval(this.pomodoro.timerId);
        this.pomodoro.timerId = null;
      }
    });

    this.engine.on('resumed', () => {
      this.miniPlayer?.setPaused(false);
      this.sidePanel?.updatePlaybackState('playing');
      this.karaokeHighlighter?.resume();
      this.statusBar?.update('playing', {
        voiceShort: this.settings.defaultVoice.split('-')[1],
        rate: this.settings.playbackRate,
      });
      if (this.pomodoro.active && this.pomodoro.timerId === null) {
        this.startPomodoroTimer();
      }
    });

    this.engine.on('playback-finished', () => {
      this.miniPlayer?.hide();
      this.sidePanel?.updatePlaybackState('idle');
      this.karaokeHighlighter?.clearAll();
      this.statusBar?.update('idle');
      this.currentJob = null;
    });

    this.engine.on('stopped', () => {
      this.miniPlayer?.hide();
      this.sidePanel?.updatePlaybackState('idle');
      this.karaokeHighlighter?.clearAll();
      this.statusBar?.update('idle');
      this.currentJob = null;
    });

    this.engine.on('error', (data: unknown) => {
      const msg = typeof data === 'string' ? data : (data && typeof data === 'object' && 'message' in data ? String((data as Record<string, unknown>).message) : 'Error desconocido');
      console.error('[PiperObs] ERROR:', msg, data);
      new Notice(msg);
    });

    this.engine.on('download-progress', (data: unknown) => {
      const progress = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      const msg = typeof progress.message === 'string' ? progress.message : 'Descargando...';
      const pct = typeof progress.pct === 'number' ? progress.pct : undefined;
      progressNotice.setMessage(`${msg} ${pct !== undefined ? Math.round(pct * 100) + '%' : ''}`);
    });

    // ─── Inicializar engine ───────────────────────────────────────────────

    let lastProgressMsg = '';

    try {
      await this.engine.initialize((msg, pct) => {
        if (msg !== lastProgressMsg || pct === 1) {
          lastProgressMsg = msg;
          if (!pct || pct === 1 || Math.random() < 0.3) {
            progressNotice.setMessage(`${msg} ${pct ? Math.round(pct * 100) + '%' : ''}`);
          }
        }
      });
      progressNotice.hide();
      this.initialized = true;
      this.sidePanel?.updateBridgeStatus(true);
    } catch (err) {
      progressNotice.hide();
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[PiperObs] Init FAILED:', errMsg);
      console.error('[PiperObs] Stack:', err instanceof Error ? err.stack : '');
      new Notice(errMsg.substring(0, 80));
      this.initialized = false;
      this.sidePanel?.updateBridgeStatus(false);
    }

    // ─── Comandos ─────────────────────────────────────────────────────────

    this.addCommand({
      id: 'read',
      name: 'Leer documento',
      callback: () => { void this.startReading().catch(() => {}); },
    });

    this.addCommand({
      id: 'pause',
      name: 'Pausar/Reanudar',
      callback: () => {
        if (this.engine) {
          if (this.currentJob) {
            this.pauseReading();
          } else {
            // Si no hay job pero el engine está reproduciendo igualmente
            this.engine.pause();
          }
        }
      },
    });

    this.addCommand({
      id: 'stop',
      name: 'Detener',
      callback: () => this.stopReading(),
    });

    this.addCommand({
      id: 'next',
      name: 'Siguiente párrafo',
      callback: () => this.seekNext(),
    });

    this.addCommand({
      id: 'prev',
      name: 'Párrafo anterior',
      callback: () => this.seekPrev(),
    });

    this.addCommand({
      id: 'toggle-focus',
      name: 'Alternar modo focus',
      callback: () => this.toggleFocusMode(),
    });

    // ─── MiniPlayer callbacks ─────────────────────────────────────────────

    if (this.miniPlayer) {
      this.miniPlayer.onPause = () => this.pauseReading();
      this.miniPlayer.onResume = () => this.resumeReading();
      this.miniPlayer.onStop = () => this.stopReading();
      this.miniPlayer.onPrev = () => this.seekPrev();
      this.miniPlayer.onNext = () => this.seekNext();
      this.miniPlayer.onRateChange = (rate) => this.setRate(rate);
    }

    // ─── Layout y eventos de workspace ────────────────────────────────────

    this.app.workspace.onLayoutReady(() => {
      this.activateSidePanel().then(() => {
        const currentFile = this.app.workspace.getActiveFile();
        if (currentFile) {
          this.app.vault.cachedRead(currentFile).then((content) => {
            const words = content.trim().split(/\s+/).length;
            const minutes = Math.round(words / 200);
            this.sidePanel?.updateActiveFile(currentFile.basename, words, minutes);
          }).catch(() => {});
        }
      }).catch(() => {});
    });

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file) {
          this.app.vault.cachedRead(file).then((content) => {
            const words = content.trim().split(/\s+/).length;
            const minutes = Math.round(words / 200);
            this.sidePanel?.updateActiveFile(file.basename, words, minutes);
            this.checkAutoMagic(file);
          }).catch(() => {});
        }
      })
    );

    // ─── Settings tab ─────────────────────────────────────────────────────

    this.addSettingTab(new PiperObsV2SettingTab(this.app, this));
  }

  private async activateSidePanel() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length === 0) {
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (leaves.length > 0) {
      const view = leaves[0].view;
      if (view instanceof SidePanelView) {
        this.sidePanel = view;

        this.sidePanel.onRead = () => { void this.startReading().catch(() => {}); };
        this.sidePanel.onStop = () => this.stopReading();
        this.sidePanel.onPause = () => this.pauseReading();
        this.sidePanel.onResume = () => this.resumeReading();
        this.sidePanel.onPrev = () => this.seekPrev();
        this.sidePanel.onNext = () => this.seekNext();
        this.sidePanel.onRateChange = (rate) => this.setRate(rate);
        this.sidePanel.onVolumeChange = (vol) => this.setVolume(vol);
        this.sidePanel.onVoiceChange = (voiceId) => this.changeVoice(voiceId);
        this.sidePanel.onRestartWithVoice = () => { void this.restartWithCurrentVoice().catch(() => {}); };
        this.sidePanel.onOpenVoiceModal = () => this.openVoiceModal();
        this.sidePanel.onTogglePomodoro = () => this.togglePomodoro();
        this.sidePanel.onSkipPomodoro = () => this.skipPomodoroPhase();
        this.sidePanel.onThemeChange = (theme) => this.setKaraokeTheme(theme);
        this.sidePanel.onToggleFocusMode = () => this.toggleFocusMode();

        if (this.initialized) {
          this.sidePanel.updateBridgeStatus(true);
        }

        this.updateSidebarVoices();
        this.sidePanel.updateVolume(this.settings.volume ?? 0.85);
        this.sidePanel.updateKaraokeTheme(this.settings.karaokeTheme || 'gold');
        this.applyThemeVars(this.settings.karaokeTheme || 'gold');
      }
    }
  }

  onunload() {
    console.debug('Unloading PiperObs v2...');
    this.stopPomodoro();

    try {
      this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    } catch { /* no-op */ }

    try {
      this.engine?.destroy();
    } catch { /* no-op */ }

    try {
      this.miniPlayer?.cleanup();
    } catch { /* no-op */ }

    try {
      this.karaokeHighlighter?.clearAll();
    } catch { /* no-op */ }
  }

  // ─── Acciones ──────────────────────────────────────────────────────────────

  private async startReading() {
    if (!this.engine) {
      new Notice('Motor no inicializado');
      return;
    }
    if (!this.initialized) {
      new Notice('Motor no listo. Recargá el plugin.');
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('Sin documento abierto');
      return;
    }

    const text = await this.app.vault.read(file);
    if (!text.trim()) {
      new Notice('El documento está vacío');
      return;
    }

    // Limpiar karaoke anterior si existe
    this.karaokeHighlighter?.clearAll();

    let speechDoc: ExtractedSpeechDocument | null = null;
    try {
      speechDoc = await extractFromActiveFile(this.app);
      this.karaokeHighlighter?.setSession(speechDoc);
    } catch(e) {
      console.warn('[PiperObs] No se pudo extraer documento para karaoke:', e);
    }

    // Calcular tiempo estimado y configurar pomodoro adaptativo
    const wordCount = text.trim().split(/\s+/).length;
    const estimatedMinutes = Math.round(wordCount / 150);
    this.configureAdaptivePomodoro(estimatedMinutes);

    this.sidePanel?.updatePlaybackState('synthesizing');
    this.currentJob = { jobId: file.path, paragraphs: speechDoc?.paragraphs?.length || 0 };
    await this.engine.speak(text, this.settings.defaultVoice, this.settings.playbackRate, speechDoc ?? undefined);
  }

  private configureAdaptivePomodoro(estimatedMinutes: number) {
    if (!this.settings.pomodoroEnabled) return;

    // Lógica adaptativa basada en duración estimada del texto
    let focusMin: number;
    let breakMin: number;

    if (estimatedMinutes < 8) {
      // Textos cortos: sin pomodoro o sesión única
      focusMin = estimatedMinutes;
      breakMin = 2;
    } else if (estimatedMinutes < 20) {
      // Textos medianos: sesiones proporcionales
      focusMin = Math.round(estimatedMinutes / 2);
      breakMin = Math.max(2, Math.round(focusMin / 5));
    } else if (estimatedMinutes < 45) {
      // Textos largos: 3 sesiones
      focusMin = Math.round(estimatedMinutes / 3);
      breakMin = Math.max(3, Math.round(focusMin / 5));
    } else {
      // Textos muy largos: pomodoro clásico 25/5
      focusMin = 25;
      breakMin = 5;
    }

    // Guardar config adaptativa
    this.adaptiveFocusMin = focusMin;
    this.adaptiveBreakMin = breakMin;
    this.pomodoro.totalSec = focusMin * 60;
    this.pomodoro.remainingSec = this.pomodoro.totalSec;
    this.sidePanel?.setPomodoroAdaptive({ focusMin, breakMin, estimatedMinutes });
  }

  private pauseReading() {
    this.engine?.pause();
  }

  private resumeReading() {
    this.engine?.resume();
  }

  private stopReading() {
    this.engine?.stop();
    this.karaokeHighlighter?.clearAll();
    this.stopPomodoro();
  }

  private seekNext() {
    void this.engine?.seek('next');
  }

  private seekPrev() {
    void this.engine?.seek('prev');
  }

  private setRate(rate: number) {
    this.settings.playbackRate = rate;
    void this.saveData(this.settings).catch(() => {});
    this.miniPlayer?.setRate(rate);
    this.sidePanel?.updateRate(rate);
    if (this.engine) {
      this.engine.setPlaybackRate(rate);
    }
  }

  private setVolume(vol: number) {
    this.settings.volume = vol;
    void this.saveData(this.settings).catch(() => {});
    this.sidePanel?.updateVolume(vol);
    if (this.engine) {
      this.engine.setVolume(vol);
    }
  }

  private formatMs(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return min > 0 ? `${min}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
  }

  private changeVoice(voiceId: string) {
    this.settings.defaultVoice = voiceId;
    const found = this.settings.installedVoices.find(v => v.id === voiceId);
    this.settings.installedVoices.forEach(v => v.isDefault = false);
    if (found) found.isDefault = true;
    void this.saveData(this.settings).catch(() => {});
    this.updateSidebarVoices();

    if (this.currentJob && this.engine) {
      // Cambio de voz durante reproducción: detener y rearrancar desde 0 con la nueva voz
      new Notice('Cambiando a ' + (found?.name || voiceId) + ' y rearrancando desde el inicio...');
      this.stopReading();
      // Pequeña pausa para que el audio se libere
      setTimeout(() => { void this.startReading().catch(() => {}); }, 300);
    } else {
      new Notice('Voz cambiada a ' + (found?.name || voiceId));
    }
  }

  private async restartWithCurrentVoice() {
    if (!this.engine || !this.currentJob) {
      new Notice('No hay lectura activa para reiniciar');
      return;
    }
    const voiceId = this.settings.defaultVoice;
    new Notice('Reiniciando con ' + (this.settings.installedVoices.find(v => v.id === voiceId)?.name || voiceId) + '...');
    await this.engine.restartWithVoice(voiceId);
    this.sidePanel?.showRestartVoiceButton(false);
  }

  private updateSidebarVoices() {
    if (!this.sidePanel) return;

    const list: SidebarVoice[] = [];
    this.settings.installedVoices.forEach(v => {
      list.push({
        id: v.id, name: v.name, flag: v.flag,
        language: v.language, installed: true, isDefault: v.isDefault,
      });
    });
    FEATURED_VOICES.forEach(f => {
      if (!this.settings.installedVoices.find(v => v.id === f.id)) {
        list.push({
          id: f.id, name: f.name, flag: f.flag,
          language: f.language, installed: false, isDefault: false,
        });
      }
    });

    this.sidePanel.updateVoice(this.settings.defaultVoice, list);
  }

  private openVoiceModal() {
    const modal = new VoiceModal(this.app, this.settings.installedVoices);

    modal.onSetDefault = (voiceId) => {
      this.settings.installedVoices.forEach(v => v.isDefault = false);
      const found = this.settings.installedVoices.find(v => v.id === voiceId);
      if (found) found.isDefault = true;
      this.settings.defaultVoice = voiceId;
      void this.saveData(this.settings).catch(() => {});
      new Notice('Voz cambiada a ' + (found?.name || voiceId));
    };

    modal.onDeleteVoice = (voiceId) => {
      this.settings.installedVoices = this.settings.installedVoices.filter(v => v.id !== voiceId);
      const wasDefault = this.settings.defaultVoice === voiceId;
      if (wasDefault && this.settings.installedVoices.length > 0) {
        this.settings.defaultVoice = this.settings.installedVoices[0].id;
        this.settings.installedVoices[0].isDefault = true;
      }
      void this.saveData(this.settings).catch(() => {});
      this.updateSidebarVoices();
      new Notice(`Voz eliminada`);
      // Re-abrir modal para reflejar cambios
      modal.close();
      this.openVoiceModal();
    };

    modal.onDownloadVoice = (voiceId: string) => {
      this.downloadVoice(voiceId);
    };

    modal.open();
  }

  private parseVoiceIdToVoice(voiceId: string): InstalledVoice {
    const parts = voiceId.split('-');
    const langRegion = parts[0] || '';
    const lang = langRegion.split('_')[0];
    const quality = parts[parts.length - 1] || 'medium';
    const name = parts.slice(1, -1).join('-') || voiceId;
    const flagMap: Record<string, string> = { es: '🇪🇸', en: '🇺🇸', pt: '🇧🇷', de: '🇩🇪', fr: '🇫🇷', it: '🇮🇹', ja: '🇯🇵', zh: '🇨🇳', ko: '🇰🇷', ru: '🇷🇺' };
    const langMap: Record<string, string> = { es: 'Español', en: 'English', pt: 'Português', de: 'Deutsch', fr: 'Français', it: 'Italiano', ja: '日本語', zh: '中文', ko: '한국어', ru: 'Русский' };
    return {
      id: voiceId,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      language: langMap[lang] || langRegion,
      flag: flagMap[lang] || '🌐',
      gender: 'femenina' as const,
      quality: quality === 'high' ? 'high' as const : quality === 'low' ? 'low' as const : 'medium' as const,
      sizeMB: quality === 'low' ? 27 : 63,
      isDefault: false,
    };
  }

  private async downloadVoice(voiceId: string) {
    if (!this.engine) return;

    let featured = FEATURED_VOICES.find(v => v.id === voiceId);
    if (!featured) {
      featured = this.parseVoiceIdToVoice(voiceId);
    }

    const modal = new DownloadModal(this.app, featured);
    modal.onCancel = () => {};
    modal.open();

    try {
      await this.engine.downloadVoice(voiceId, (msg, pct) => {
        if (pct !== undefined) {
          const downloadedMB = pct * featured!.sizeMB;
          const remaining = (1 - pct) * 30;
          modal.setProgress(pct, downloadedMB, featured!.sizeMB / 30, Math.max(0, remaining));
        }
      });

      modal.setSuccess();

      if (!this.settings.installedVoices.find(v => v.id === voiceId)) {
        this.settings.installedVoices.push(featured);
        void this.saveData(this.settings).catch(() => {});
        this.updateSidebarVoices();
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error descargando voz';
      modal.setError(errMsg);
    }
  }

  private checkAutoMagic(file?: TFile | null) {
    if (!this.settings.autoMagicEnabled) return;

    const fileToCheck = file ?? this.app.workspace.getActiveFile();
    if (!fileToCheck) return;

    if (this.dismissedBanners.has(fileToCheck.path)) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    const voice = this.settings.installedVoices.find(v => v.id === this.settings.defaultVoice);
    if (!voice) return;

    const banner = new AutoMagicBanner(view, voice);
    banner.onDownload = (voiceId) => {
      this.downloadVoice(voiceId);
    };
    banner.onUseNow = (voiceId) => {
      this.settings.defaultVoice = voiceId;
      void this.saveData(this.settings).catch(() => {});
    };
    banner.show();
  }

  // ─── Pomodoro ──────────────────────────────────────────────────────────────

  private togglePomodoro() {
    if (this.pomodoro.active) {
      this.stopPomodoro();
      this.stopReading();
    } else {
      // Al activar Pomodoro, si no está reproduciendo, empieza lectura automáticamente
      this.startPomodoro();
      if (!this.currentJob) {
        void this.startReading().catch(() => {});
      }
    }
  }

  private startPomodoro() {
    this.stopPomodoro();
    this.pomodoro.mode = 'focus';
    this.pomodoro.totalSec = this.adaptiveFocusMin * 60;
    this.pomodoro.remainingSec = this.pomodoro.totalSec;
    this.pomodoro.active = true;
    this.miniPlayer?.setPomodoro({ active: true, mode: 'focus', remainingSec: this.pomodoro.remainingSec, totalSec: this.pomodoro.totalSec, cyclesDone: this.pomodoro.sessionsCompleted });
    this.sidePanel?.setPomodoro({ active: true, mode: 'focus', remainingSec: this.pomodoro.remainingSec, totalSec: this.pomodoro.totalSec, cyclesDone: this.pomodoro.sessionsCompleted });
    // If audio is already playing, start timer immediately; otherwise it starts on playback-started
    if (this.currentJob) {
      this.startPomodoroTimer();
    }
  }

  private startPomodoroTimer() {
    if (this.pomodoro.timerId !== null) return;
    this.pomodoro.timerId = window.setInterval(() => this.tickPomodoro(), 1000);
  }

  private stopPomodoro() {
    if (this.pomodoro.timerId !== null) {
      window.clearInterval(this.pomodoro.timerId);
      this.pomodoro.timerId = null;
    }
    this.pomodoro.active = false;
    this.miniPlayer?.setPomodoro(null);
    this.sidePanel?.setPomodoro(null);
  }

  private tickPomodoro() {
    if (!this.pomodoro.active) return;
    this.pomodoro.remainingSec--;

    this.miniPlayer?.setPomodoro({
      active: true,
      mode: this.pomodoro.mode,
      remainingSec: this.pomodoro.remainingSec,
      totalSec: this.pomodoro.totalSec,
      cyclesDone: this.pomodoro.sessionsCompleted,
    });
    this.sidePanel?.setPomodoro({
      active: true,
      mode: this.pomodoro.mode,
      remainingSec: this.pomodoro.remainingSec,
      totalSec: this.pomodoro.totalSec,
      cyclesDone: this.pomodoro.sessionsCompleted,
    });

    if (this.pomodoro.remainingSec <= 0) {
      if (this.pomodoro.mode === 'focus') {
        this.pomodoro.sessionsCompleted++;
        this.pauseReading();
        new Notice('Pomodoro: ¡Tiempo de descanso! 🍅', 5000);
        this.pomodoro.mode = 'break';
        this.pomodoro.totalSec = this.adaptiveBreakMin * 60;
        this.pomodoro.remainingSec = this.pomodoro.totalSec;
      } else {
        new Notice('Pomodoro: ¡Descanso terminado! 🎯', 5000);
        this.pomodoro.mode = 'focus';
        this.pomodoro.totalSec = this.adaptiveFocusMin * 60;
        this.pomodoro.remainingSec = this.pomodoro.totalSec;
      }
    }
  }

  private skipPomodoroPhase() {
    if (!this.pomodoro.active) return;
    this.pomodoro.remainingSec = 1;
    this.tickPomodoro();
  }

  // ─── Focus Mode (local al karaoke) ─────────────────────────────────────────

  private focusModeActive = false;

  private toggleFocusMode() {
    this.focusModeActive = !this.focusModeActive;
    this.karaokeHighlighter?.setFocusMode(this.focusModeActive);
    this.sidePanel?.updateFocusMode(this.focusModeActive);
    if (this.focusModeActive) {
      new Notice('Modo focus activado 🎯');
    } else {
      new Notice('Modo focus desactivado');
    }
  }

  // ─── Karaoke Theme ─────────────────────────────────────────────────────────

  applyThemeVars(theme: KaraokeTheme) {
    document.body.classList.remove('piperobs-theme-gold', 'piperobs-theme-cyan', 'piperobs-theme-magenta', 'piperobs-theme-green', 'piperobs-theme-orange');
    document.body.classList.add(`piperobs-theme-${theme}`);
  }

  private setKaraokeTheme(theme: KaraokeTheme) {
    this.settings.karaokeTheme = theme;
    this.saveData(this.settings);
    this.applyThemeVars(theme);
    new Notice(`Tema karaoke: ${theme}`);
  }
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

class PiperObsV2SettingTab extends PluginSettingTab {
  plugin: PiperObsV2Plugin;

  constructor(app: App, plugin: PiperObsV2Plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Carpeta de datos')
      .setDesc('Donde se guardan binarios y voces descargadas')
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_DATA_DIR)
          .setValue(this.plugin.settings.dataDir || DEFAULT_DATA_DIR)
          .onChange((value) => {
            this.plugin.settings.dataDir = value || DEFAULT_DATA_DIR;
            void this.plugin.saveData(this.plugin.settings).catch(() => {});
          })
      );

    new Setting(containerEl)
      .setName('Voz por defecto')
      .setDesc('Voz que se usa para leer los documentos')
      .addText(text =>
        text
          .setPlaceholder('es_AR-daniela-high')
          .setValue(this.plugin.settings.defaultVoice)
          .onChange((value) => {
            this.plugin.settings.defaultVoice = value;
            void this.plugin.saveData(this.plugin.settings).catch(() => {});
          })
      );

    new Setting(containerEl)
      .setName('Volumen')
      .setDesc('Volumen de reproducción (0-100%)')
      .addSlider(slider =>
        slider
          .setLimits(0, 100, 1)
          .setValue(Math.round((this.plugin.settings.volume ?? 0.85) * 100))
          .setDynamicTooltip()
          .onChange((value) => {
            const vol = value / 100;
            this.plugin.settings.volume = vol;
            void this.plugin.saveData(this.plugin.settings).catch(() => {});
            this.plugin.engine?.setVolume(vol);
          })
      );

    new Setting(containerEl)
      .setName('Resaltado de karaoke')
      .setDesc('Resaltar palabras mientras se lee')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.highlightEnabled)
          .onChange((value) => {
            this.plugin.settings.highlightEnabled = value;
            void this.plugin.saveData(this.plugin.settings).catch(() => {});
          })
      );

    new Setting(containerEl)
      .setName('Auto magic')
      .setDesc('Sugerir voces automáticamente según el idioma')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.autoMagicEnabled)
          .onChange((value) => {
            this.plugin.settings.autoMagicEnabled = value;
            void this.plugin.saveData(this.plugin.settings).catch(() => {});
          })
      );

    new Setting(containerEl)
      .setName('Pomodoro')
      .setDesc('Activar temporizador Pomodoro 25/5 durante lectura')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.pomodoroEnabled ?? false)
          .onChange((value) => {
            this.plugin.settings.pomodoroEnabled = value;
            void this.plugin.saveData(this.plugin.settings).catch(() => {});
          })
      );

    new Setting(containerEl)
      .setName('Tema de karaoke')
      .setDesc('Color del resaltado de palabras')
      .addDropdown(dropdown =>
        dropdown
          .addOption('gold', 'Oro')
          .addOption('cyan', 'Cyan')
          .addOption('magenta', 'Magenta')
          .addOption('green', 'Verde')
          .addOption('orange', 'Naranja')
          .setValue(this.plugin.settings.karaokeTheme || 'gold')
          .onChange((value) => {
            const theme = KARAOKE_THEMES.find(t => t === value);
            if (!theme) return;
            this.plugin.settings.karaokeTheme = theme;
            void this.plugin.saveData(this.plugin.settings).catch(() => {});
            this.plugin.applyThemeVars(theme);
          })
      );

    new Setting(containerEl)
      .setName('Reinicializar motor')
      .setDesc('Vuelve a crear el motor de Piper (útil si cambiaste la carpeta de datos)')
      .addButton(btn =>
        btn
          .setButtonText('Reinicializar')
          .onClick(() => {
            this.plugin.engine?.destroy();
            new Notice('Reinicia Obsidian para aplicar los cambios');
          })
      );
  }
}
