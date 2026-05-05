import { ItemView, WorkspaceLeaf, App } from 'obsidian';
import { InstalledVoice, FEATURED_VOICES, KARAOKE_THEMES, KaraokeTheme } from '../settings/DEFAULTS';

export const VIEW_TYPE = 'piperobs-v2-panel-2025';

function makeLogoMark(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '28');
  svg.setAttribute('class', 'piperobs-logo-mark');
  svg.innerHTML = `
    <defs><linearGradient id="pobs-logo-grad" x1="4" y1="2" x2="28" y2="22"><stop offset="0%" stop-color="#8957e5"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient></defs>
    <path d="M4 4 Q4 2 6 2 L26 2 Q28 2 28 4 L28 20 Q28 22 26 22 L20 22 L16 28 L12 22 L6 22 Q4 22 4 20 Z" fill="url(#pobs-logo-grad)"/>
    <rect x="8"  y="10" width="3" height="9"  rx="1.5" fill="#22D3EE"/>
    <rect x="13" y="7"  width="3" height="12" rx="1.5" fill="white" opacity="0.9"/>
    <rect x="18" y="10" width="3" height="9"  rx="1.5" fill="white" opacity="0.5"/>
    <rect x="23" y="12" width="2" height="7"  rx="1"   fill="white" opacity="0.3"/>
  `;
  return svg;
}

export interface SidebarVoice {
  id: string;
  name: string;
  flag: string;
  language: string;
  installed: boolean;
  isDefault: boolean;
}

export class SidePanelView extends ItemView {
  onRead: () => void = () => {};
  onStop: () => void = () => {};
  onPause: () => void = () => {};
  onResume: () => void = () => {};
  onPrev: () => void = () => {};
  onNext: () => void = () => {};
  onRateChange: (rate: number) => void = () => {};
  onVolumeChange: (vol: number) => void = () => {};
  onVoiceChange: (voiceId: string) => void = () => {};
  onRestartWithVoice: () => void = () => {};
  onOpenVoiceModal: () => void = () => {};
  onTogglePomodoro: () => void = () => {};
  onSkipPomodoro: () => void = () => {};
  onThemeChange: (theme: KaraokeTheme) => void = () => {};
  onToggleFocusMode: () => void = () => {};

  private bridgeConnected = false;
  private playbackState: 'idle' | 'synthesizing' | 'playing' | 'paused' = 'idle';
  private currentRate = 1.0;
  private docTitle = '';
  private docWords = 0;
  private currentVoiceId = '';
  private voices: SidebarVoice[] = [];
  private el: Record<string, HTMLElement> = {};

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'PiperObs'; }
  getIcon() { return 'headphones'; }

  private showHelpModal() {
    const modal = document.createElement('div');
    modal.className = 'piperobs-help-modal';
    modal.innerHTML = `
      <div class="piperobs-help-backdrop"></div>
      <div class="piperobs-help-content">
        <div class="piperobs-help-header">
          <strong>ℹ️ Cómo usar PiperObs</strong>
          <button class="piperobs-help-close">&#10005;</button>
        </div>
        <div class="piperobs-help-body">
          <div class="piperobs-help-section">
            <h4>🎙️ Lectura de voz</h4>
            <p>Abrí cualquier nota en Obsidian y tocá <strong>"Leer documento completo"</strong>. El plugin sintetiza voz localmente con IA (Piper TTS).</p>
          </div>
          <div class="piperobs-help-section">
            <h4>🎨 Resaltado de palabras (Karaoke)</h4>
            <p><strong>Solo funciona en modo edición</strong> (editor de texto), no en modo lectura/preview. Cambiá al modo edición desde el icono de lápiz arriba a la derecha del documento.</p>
            <p>En modo preview se resalta el párrafo activo pero no palabra por palabra.</p>
          </div>
          <div class="piperobs-help-section">
            <h4>🎤 Cambio de voz</h4>
            <p>Seleccioná una voz del desplegable <strong>"Voz activa"</strong>. Si estaba reproduciendo, se detendrá y rearrancará automáticamente desde el inicio con la nueva voz.</p>
          </div>
          <div class="piperobs-help-section">
            <h4>🍅 Pomodoro</h4>
            <p>Se adapta automáticamente a la longitud del texto. Textos cortos = sesiones cortas. Textos largos = pomodoro clásico 25/5.</p>
          </div>
          <div class="piperobs-help-section">
            <h4>🎯 Modo Focus</h4>
            <p>Oscurece todo el documento excepto la línea que se está leyendo. Solo disponible en modo edición con karaoke activo.</p>
          </div>
          <div class="piperobs-help-section">
            <h4>⚡ Controles rápidos</h4>
            <ul>
              <li><kbd>Ctrl/Cmd + P</kbd> → "Leer documento"</li>
              <li><kbd>Ctrl/Cmd + P</kbd> → "Pausar/Reanudar"</li>
              <li><kbd>Ctrl/Cmd + P</kbd> → "Detener"</li>
            </ul>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.piperobs-help-close')?.addEventListener('click', close);
    modal.querySelector('.piperobs-help-backdrop')?.addEventListener('click', close);
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    const root = container.createDiv('piperobs-sidebar');

    const header = root.createDiv('piperobs-sidebar-header');
    header.appendChild(makeLogoMark());
    const title = header.createDiv('piperobs-header-title');
    title.setText('PiperObs');
    const dot = document.createElement('div');
    dot.className = 'piperobs-status-dot';
    header.appendChild(dot);
    this.el.dot = dot;

    // Botón de ayuda
    const infoBtn = document.createElement('button');
    infoBtn.className = 'piperobs-info-btn';
    infoBtn.innerHTML = '&#10067;'; // Signo de pregunta ❓
    infoBtn.title = '¿Cómo funciona?';
    infoBtn.onclick = () => this.showHelpModal();
    header.appendChild(infoBtn);

    const body = root.createDiv('piperobs-sidebar-body');

    const card = body.createDiv('piperobs-doc-card');
    this.el.docTitle = card.createDiv('piperobs-doc-title');
    this.el.docTitle.setText('Sin documento activo');
    this.el.docMeta = card.createDiv('piperobs-doc-meta');
    this.el.docMeta.setText('Abrí una nota para leer');

    this.el.readBtn = body.createEl('button', { cls: 'piperobs-btn-read' });
    this.el.readBtn.innerHTML = '<svg width=14 height=14 viewBox="0 0 16 16" fill=white><polygon points="4,2 14,8 4,14"/></svg> Leer documento completo';
    this.el.readBtn.addEventListener('click', () => this.onRead());

    const secSpeed = body.createDiv('piperobs-section-label');
    secSpeed.setText('Velocidad');
    const speedRow = body.createDiv('piperobs-speed-row');
    const RATES = [0.75, 0.9, 1.0, 1.25, 1.5];
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '4'; slider.step = '1'; slider.value = '2';
    slider.className = 'piperobs-speed-slider';
    this.el.speedVal = document.createElement('span');
    this.el.speedVal.className = 'piperobs-speed-val';
    this.el.speedVal.textContent = '1.0x';
    slider.addEventListener('input', () => {
      const rate = RATES[parseInt(slider.value)];
      this.el.speedVal.textContent = rate + 'x';
      this.currentRate = rate;
      this.onRateChange(rate);
    });
    speedRow.appendChild(slider);
    speedRow.appendChild(this.el.speedVal);

    // Volumen
    const secVolume = body.createDiv('piperobs-section-label');
    secVolume.setText('Volumen');
    const volumeRow = body.createDiv('piperobs-volume-row');
    const volSlider = document.createElement('input');
    volSlider.type = 'range'; volSlider.min = '0'; volSlider.max = '100'; volSlider.step = '1'; volSlider.value = '85';
    volSlider.className = 'piperobs-volume-slider';
    this.el.volumeVal = document.createElement('span');
    this.el.volumeVal.className = 'piperobs-volume-val';
    this.el.volumeVal.textContent = '85%';
    this.el.volumeIcon = document.createElement('span');
    this.el.volumeIcon.className = 'piperobs-volume-icon';
    this.el.volumeIcon.textContent = '🔊';
    volSlider.addEventListener('input', () => {
      const vol = parseInt(volSlider.value);
      this.el.volumeVal.textContent = vol + '%';
      this.el.volumeIcon.textContent = vol === 0 ? '🔇' : vol < 34 ? '🔈' : vol < 67 ? '🔉' : '🔊';
      this.onVolumeChange(vol / 100);
    });
    volumeRow.appendChild(this.el.volumeIcon);
    volumeRow.appendChild(volSlider);
    volumeRow.appendChild(this.el.volumeVal);

    const secVoice = body.createDiv('piperobs-section-label');
    secVoice.setText('Voz activa');

    const ddWrap = body.createDiv('piperobs-voice-dropdown-wrap');
    this.el.voiceSel = ddWrap.createDiv('piperobs-voice-selector');
    this.el.voiceFlag = (this.el.voiceSel as HTMLElement).createSpan('piperobs-voice-flag');
    this.el.voiceFlag.setText('\u{1F1E6}\u{1F1F7}');
    this.el.voiceName = (this.el.voiceSel as HTMLElement).createSpan('piperobs-voice-name');
    this.el.voiceName.setText('Daniela (Español AR)');
    this.el.voiceSel.createSpan('piperobs-voice-arrow').setText('›');
    this.el.voiceSel.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = this.el.voiceDD;
      if (dd) {
        const open = dd.classList.contains('visible');
        if (open) { dd.classList.remove('visible'); (this.el.voiceSel as HTMLElement).classList.remove('open'); }
        else { this.renderVoiceDropdown(); dd.classList.add('visible'); (this.el.voiceSel as HTMLElement).classList.add('open'); }
      }
    });

    this.el.voiceDD = ddWrap.createDiv('piperobs-voice-dropdown');
    document.addEventListener('click', () => {
      this.el.voiceDD?.classList.remove('visible');
      (this.el.voiceSel as HTMLElement)?.classList.remove('open');
    });

    // Botón reiniciar con esta voz
    this.el.restartVoiceBtn = body.createEl('button', { cls: 'piperobs-btn-restart-voice' });
    this.el.restartVoiceBtn.innerHTML = '🔄 Reiniciar con esta voz';
    this.el.restartVoiceBtn.style.display = 'none';
    this.el.restartVoiceBtn.onclick = () => this.onRestartWithVoice();

    // Karaoke Theme Panel
    const themePanel = body.createDiv('piperobs-karaoke-theme-panel');
    const themeLabel = themePanel.createDiv('piperobs-theme-label');
    themeLabel.createSpan().setText('Tema de resaltado');
    this.el.themePreview = themeLabel.createSpan('piperobs-theme-preview');
    this.el.themePreview.setText('Violeta/Cyan');
    const presets = themePanel.createDiv('piperobs-color-presets');
    const themeMap: Record<KaraokeTheme, { gradient: string; name: string }> = {
      gold: { gradient: 'linear-gradient(135deg,#fbbf24,#f59e0b)', name: 'Oro' },
      cyan: { gradient: 'linear-gradient(135deg,#22d3ee,#06b6d4)', name: 'Violeta/Cyan' },
      magenta: { gradient: 'linear-gradient(135deg,#ec4899,#a855f7)', name: 'Rosa/Magenta' },
      green: { gradient: 'linear-gradient(135deg,#22c55e,#84cc16)', name: 'Verde/Lime' },
      orange: { gradient: 'linear-gradient(135deg,#f97316,#ef4444)', name: 'Naranja/Rojo' },
    };
    (Object.keys(themeMap) as KaraokeTheme[]).forEach(theme => {
      const chip = presets.createEl('button', { cls: 'piperobs-color-preset' });
      chip.dataset.theme = theme;
      chip.style.cssText = `background: ${themeMap[theme].gradient} !important;` + (chip.style.cssText || '');
      chip.title = themeMap[theme].name;
      chip.onclick = () => {
        presets.querySelectorAll('.piperobs-color-preset').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.el.themePreview!.textContent = themeMap[theme].name;
        this.onThemeChange(theme);
      };
    });

    // Focus Mode (fuera del theme panel)
    const focusBtn = body.createEl('button', { cls: 'piperobs-btn-focus' });
    focusBtn.innerHTML = '🎯 Modo Focus';
    focusBtn.onclick = () => this.onToggleFocusMode();
    this.el.focusBtn = focusBtn;

    // Stats Row
    const statsRow = body.createDiv('piperobs-stats-row');
    const wpmChip = statsRow.createDiv('piperobs-stat-chip');
    this.el.statWPM = wpmChip.createDiv('piperobs-stat-value');
    this.el.statWPM.setText('--');
    wpmChip.createDiv('piperobs-stat-label').setText('pal/min');
    const timeChip = statsRow.createDiv('piperobs-stat-chip');
    this.el.statTime = timeChip.createDiv('piperobs-stat-value');
    this.el.statTime.setText('--');
    timeChip.createDiv('piperobs-stat-label').setText('restante');
    const phraseChip = statsRow.createDiv('piperobs-stat-chip');
    this.el.statPhrase = phraseChip.createDiv('piperobs-stat-value');
    this.el.statPhrase.setText('--');
    phraseChip.createDiv('piperobs-stat-label').setText('frases');

    body.createDiv('piperobs-divider');
    const voicesBtn = body.createEl('button', { cls: 'piperobs-btn-voices', text: '+ Gestionar voces' });
    voicesBtn.addEventListener('click', () => this.onOpenVoiceModal());

    // Pomodoro
    const pomoWrap = body.createDiv('piperobs-pomo-wrap');
    const pomoToggle = pomoWrap.createDiv('piperobs-pomo-toggle');
    pomoToggle.id = 'pomo-toggle';
    pomoToggle.onclick = () => this.onTogglePomodoro();
    const pomoLabel = pomoToggle.createDiv('piperobs-pomo-label');
    pomoLabel.createSpan('piperobs-pomo-icon').setText('🍅');
    const pomoText = pomoLabel.createDiv();
    pomoText.createDiv('piperobs-pomo-title').setText('Pomodoro');
    this.el.pomoSub = pomoText.createDiv('piperobs-pomo-sub');
    this.el.pomoSub.setText('25 min lectura / 5 min descanso');
    pomoToggle.createDiv('piperobs-pomo-switch');

    this.el.pomoPanel = pomoWrap.createDiv('piperobs-pomo-panel');
    this.el.pomoPanel.id = 'pomo-panel';
    this.el.pomoTimer = this.el.pomoPanel.createDiv('piperobs-pomo-timer');
    this.el.pomoTimer.setText('25:00');
    this.el.pomoState = this.el.pomoPanel.createDiv('piperobs-pomo-state');
    this.el.pomoState.setText('Modo lectura');
    this.el.pomoCycles = this.el.pomoPanel.createDiv('piperobs-pomo-cycles');
    for (let i = 0; i < 4; i++) {
      this.el.pomoCycles.createDiv('piperobs-pomo-dot');
    }
    const pomoActions = this.el.pomoPanel.createDiv('piperobs-pomo-actions');
    const skipBtn = pomoActions.createEl('button', { cls: 'piperobs-pomo-skip', text: 'Saltar fase' });
    skipBtn.onclick = () => this.onSkipPomodoro();

  }

  private renderVoiceDropdown() {
    const dd = this.el.voiceDD;
    if (!dd) return;
    dd.innerHTML = '';
    this.voices.forEach(voice => {
      const row = dd.createDiv('piperobs-voice-option');
      if (voice.id === this.currentVoiceId) row.classList.add('active');
      row.createSpan('piperobs-voice-flag').setText(voice.flag);
      const nameSpan = row.createDiv('piperobs-voice-option-name');
      nameSpan.setText(voice.name + ' (' + voice.language + ')');
      if (voice.installed || voice.isDefault) {
        const badge = row.createSpan('piperobs-voice-badge');
        badge.addClass(voice.isDefault ? 'default' : 'installed');
        badge.setText(voice.isDefault ? 'Default' : 'Instalada');
      } else {
        row.createSpan('piperobs-voice-unavailable').setText('No instalada');
      }
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (voice.installed || voice.isDefault) {
          this.onVoiceChange(voice.id);
          dd.classList.remove('visible');
          (this.el.voiceSel as HTMLElement)?.classList.remove('open');
        } else {
          dd.classList.remove('visible');
          (this.el.voiceSel as HTMLElement)?.classList.remove('open');
          this.onOpenVoiceModal();
        }
      });
    });
  }

  updateBridgeStatus(connected: boolean) {
    this.bridgeConnected = connected;
    if (this.el.dot) {
      this.el.dot.className = connected ? 'piperobs-status-dot connected' : 'piperobs-status-dot';
    }
  }

  updateInlineProgress(currentPhrase: number, totalPhrases: number, elapsed: string) {
    if (this.el.statPhrase) {
      this.el.statPhrase.textContent = totalPhrases > 0 ? `${currentPhrase}/${totalPhrases}` : '--';
    }
  }

  updatePlaybackState(state: 'idle' | 'synthesizing' | 'playing' | 'paused') {
    this.playbackState = state;
    if (this.el.readBtn) {
      (this.el.readBtn as HTMLElement).style.display = 'flex';
      (this.el.readBtn as HTMLElement).innerHTML = state === 'playing'
        ? '<svg width=14 height=14 viewBox="0 0 16 16" fill=white><rect x=4 y=2 width=4 height=12 rx=1/><rect x=10 y=2 width=4 height=12 rx=1/></svg> Detener lectura'
        : '<svg width=14 height=14 viewBox="0 0 16 16" fill=white><polygon points="4,2 14,8 4,14"/></svg> Leer documento completo';
    }
  }

  updateActiveFile(name: string, words: number, minutes?: number) {
    this.docTitle = name;
    this.docWords = words;
    const est = minutes ?? Math.round(words / 200);
    if (this.el.docTitle) this.el.docTitle.textContent = name || 'Sin documento';
    if (this.el.docMeta) {
      if (name) {
        this.el.docMeta.textContent = `${words.toLocaleString()} palabras · ~${est} min`;
        (this.el.docMeta as HTMLElement).classList.remove('piperobs-doc-meta-idle');
      } else {
        this.el.docMeta.textContent = 'Abrí una nota para leer';
        (this.el.docMeta as HTMLElement).classList.add('piperobs-doc-meta-idle');
      }
    }
    if (this.el.readBtn) {
      (this.el.readBtn as HTMLButtonElement).disabled = !name;
    }
    if (this.el.statWPM) this.el.statWPM.textContent = '142';
    if (this.el.statTime) this.el.statTime.textContent = est + 'm';
  }

  updateVoice(voiceId: string, voiceList: SidebarVoice[]) {
    this.currentVoiceId = voiceId;
    this.voices = voiceList;
    const active = voiceList.find(v => v.id === voiceId);
    if (active) {
      if (this.el.voiceFlag) this.el.voiceFlag.textContent = active.flag;
      if (this.el.voiceName) this.el.voiceName.textContent = active.name + ' (' + active.language + ')';
    }
  }

  updateRate(rate: number) {
    this.currentRate = rate;
  }

  updateVolume(vol: number) {
    const pct = Math.round(vol * 100);
    if (this.el.volumeVal) this.el.volumeVal.textContent = pct + '%';
    if (this.el.volumeIcon) this.el.volumeIcon.textContent = pct === 0 ? '🔇' : pct < 34 ? '🔈' : pct < 67 ? '🔉' : '🔊';
    const slider = this.containerEl.querySelector('.piperobs-volume-slider') as HTMLInputElement;
    if (slider) slider.value = String(pct);
  }

  updateFocusMode(active: boolean) {
    if (this.el.focusBtn) {
      this.el.focusBtn.classList.toggle('active', active);
      this.el.focusBtn.innerHTML = active ? '🎯 Focus activo' : '🎯 Modo Focus';
    }
  }

  showRestartVoiceButton(show: boolean) {
    if (this.el.restartVoiceBtn) {
      this.el.restartVoiceBtn.style.display = show ? 'block' : 'none';
    }
  }

  setPomodoroAdaptive(config: { focusMin: number; breakMin: number; estimatedMinutes: number }) {
    if (this.el.pomoSub) {
      this.el.pomoSub.textContent = `${config.focusMin} min lectura / ${config.breakMin} min descanso · ~${config.estimatedMinutes} min total`;
    }
    // Mostrar chip adaptativo
    let chip = this.containerEl.querySelector('.piperobs-pomo-adaptive-chip') as HTMLElement;
    if (!chip) {
      const pomoWrap = this.containerEl.querySelector('.piperobs-pomo-wrap');
      if (pomoWrap) {
        chip = pomoWrap.createEl('div', { cls: 'piperobs-pomo-adaptive-chip' });
      }
    }
    if (chip) {
      chip.textContent = `⏱ Pomodoro adaptado: ${config.focusMin}min/${config.breakMin}min`;
    }
  }

  updateKaraokeTheme(theme: KaraokeTheme) {
    const chip = this.containerEl.querySelector(`.piperobs-color-preset[data-theme="${theme}"]`) as HTMLElement;
    if (chip) {
      this.containerEl.querySelectorAll('.piperobs-color-preset').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    }
    const names: Record<KaraokeTheme, string> = { gold: 'Oro', cyan: 'Violeta/Cyan', magenta: 'Rosa/Magenta', green: 'Verde/Lime', orange: 'Naranja/Rojo' };
    if (this.el.themePreview) this.el.themePreview.textContent = names[theme];
  }

  setPomodoro(state: { active: boolean; mode: 'focus' | 'break'; remainingSec: number; totalSec: number; cyclesDone: number } | null) {
    const toggle = this.containerEl.querySelector('#pomo-toggle') as HTMLElement;
    const panel = this.containerEl.querySelector('#pomo-panel') as HTMLElement;
    if (!toggle || !panel) return;

    if (!state) {
      toggle.classList.remove('active');
      panel.classList.remove('open');
      if (this.el.pomoSub) this.el.pomoSub.textContent = '25 min lectura / 5 min descanso';
      return;
    }

    toggle.classList.add('active');
    panel.classList.add('open');

    const min = Math.floor(state.remainingSec / 60);
    const sec = state.remainingSec % 60;
    if (this.el.pomoTimer) this.el.pomoTimer.textContent = `${min}:${String(sec).padStart(2, '0')}`;
    if (this.el.pomoState) {
      this.el.pomoState.textContent = state.mode === 'focus' ? 'Modo lectura' : 'Descanso';
      this.el.pomoState.className = 'piperobs-pomo-state ' + (state.mode === 'focus' ? 'reading' : 'break');
    }
    if (this.el.pomoSub) this.el.pomoSub.textContent = state.mode === 'focus' ? 'Enfoque activo' : 'Tomá un descanso';

    if (this.el.pomoCycles) {
      const dots = this.el.pomoCycles.querySelectorAll('.piperobs-pomo-dot');
      dots.forEach((dot, idx) => {
        dot.classList.toggle('done', idx < state.cyclesDone);
      });
    }
  }
}
