import { ItemView, WorkspaceLeaf } from 'obsidian';
import { KaraokeTheme } from '../settings/DEFAULTS';

export const VIEW_TYPE = 'piperobs-v2-panel-2025';

function makeLogoMark(): SVGElement {
  const svg = activeDocument.createSvg('svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '28');
  svg.setAttribute('class', 'piperobs-logo-mark');

  const defs = activeDocument.createSvg('defs');
  const grad = activeDocument.createSvg('linearGradient');
  grad.setAttribute('id', 'pobs-logo-grad');
  grad.setAttribute('x1', '4');
  grad.setAttribute('y1', '2');
  grad.setAttribute('x2', '28');
  grad.setAttribute('y2', '22');
  const stop1 = activeDocument.createSvg('stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', '#8957e5');
  const stop2 = activeDocument.createSvg('stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', '#22d3ee');
  grad.appendChild(stop1);
  grad.appendChild(stop2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  const path = activeDocument.createSvg('path');
  path.setAttribute('d', 'M4 4 Q4 2 6 2 L26 2 Q28 2 28 4 L28 20 Q28 22 26 22 L20 22 L16 28 L12 22 L6 22 Q4 22 4 20 Z');
  path.setAttribute('fill', 'url(#pobs-logo-grad)');
  svg.appendChild(path);

  const r1 = activeDocument.createSvg('rect');
  r1.setAttribute('x', '8'); r1.setAttribute('y', '10'); r1.setAttribute('width', '3'); r1.setAttribute('height', '9'); r1.setAttribute('rx', '1.5'); r1.setAttribute('fill', '#22D3EE');
  svg.appendChild(r1);
  const r2 = activeDocument.createSvg('rect');
  r2.setAttribute('x', '13'); r2.setAttribute('y', '7'); r2.setAttribute('width', '3'); r2.setAttribute('height', '12'); r2.setAttribute('rx', '1.5'); r2.setAttribute('fill', 'white'); r2.setAttribute('opacity', '0.9');
  svg.appendChild(r2);
  const r3 = activeDocument.createSvg('rect');
  r3.setAttribute('x', '18'); r3.setAttribute('y', '10'); r3.setAttribute('width', '3'); r3.setAttribute('height', '9'); r3.setAttribute('rx', '1.5'); r3.setAttribute('fill', 'white'); r3.setAttribute('opacity', '0.5');
  svg.appendChild(r3);
  const r4 = activeDocument.createSvg('rect');
  r4.setAttribute('x', '23'); r4.setAttribute('y', '12'); r4.setAttribute('width', '2'); r4.setAttribute('height', '7'); r4.setAttribute('rx', '1'); r4.setAttribute('fill', 'white'); r4.setAttribute('opacity', '0.3');
  svg.appendChild(r4);

  return svg;
}

function makePlayIcon(): SVGElement {
  const svg = activeDocument.createSvg('svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'white');
  const polygon = activeDocument.createSvg('polygon');
  polygon.setAttribute('points', '4,2 14,8 4,14');
  svg.appendChild(polygon);
  return svg;
}

function makePauseIcon(): SVGElement {
  const svg = activeDocument.createSvg('svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'white');
  const rect1 = activeDocument.createSvg('rect');
  rect1.setAttribute('x', '4'); rect1.setAttribute('y', '2'); rect1.setAttribute('width', '4'); rect1.setAttribute('height', '12'); rect1.setAttribute('rx', '1');
  const rect2 = activeDocument.createSvg('rect');
  rect2.setAttribute('x', '10'); rect2.setAttribute('y', '2'); rect2.setAttribute('width', '4'); rect2.setAttribute('height', '12'); rect2.setAttribute('rx', '1');
  svg.appendChild(rect1);
  svg.appendChild(rect2);
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
  getDisplayText() { return 'Piperobs v2'; }
  getIcon() { return 'headphones'; }

  private showHelpModal() {
    const modal = activeDocument.createDiv();
    modal.className = 'piperobs-help-modal';

    const backdrop = activeDocument.createDiv();
    backdrop.className = 'piperobs-help-backdrop';
    backdrop.onclick = () => modal.remove();

    const content = activeDocument.createDiv();
    content.className = 'piperobs-help-content';

    const header = activeDocument.createDiv();
    header.className = 'piperobs-help-header';
    const headerTitle = activeDocument.createEl('strong');
    headerTitle.setText('ℹ️ cómo usar el plugin');
    const closeBtn = activeDocument.createEl('button');
    closeBtn.className = 'piperobs-help-close';
    closeBtn.setText('\u2715');
    closeBtn.onclick = () => modal.remove();
    header.appendChild(headerTitle);
    header.appendChild(closeBtn);

    const body = activeDocument.createDiv();
    body.className = 'piperobs-help-body';

    const sections: Array<{ title: string; paragraphs: string[]; list?: string[] }> = [
      {
        title: '\u{1F399}️ Lectura de voz',
        paragraphs: ['Abrí cualquier nota en Obsidian y tocá "Leer documento completo". El plugin sintetiza voz localmente con IA (piper TTS).'],
      },
      {
        title: '\u{1F3A8} Resaltado de palabras (karaoke)',
        paragraphs: ['Solo funciona en modo edición (editor de texto), no en modo lectura/preview. Cambiá al modo edición desde el icono de lápiz arriba a la derecha del documento.', 'En modo preview se resalta el párrafo activo pero no palabra por palabra.'],
      },
      {
        title: '\u{1F3A4} Cambio de voz',
        paragraphs: ['Seleccioná una voz del desplegable "Voz activa". Si estaba reproduciendo, se detendrá y rearrancará automáticamente desde el inicio con la nueva voz.'],
      },
      {
        title: '\u{1F345} Pomodoro',
        paragraphs: ['Se adapta automáticamente a la longitud del texto. Textos cortos = sesiones cortas. Textos largos = pomodoro clásico 25/5.'],
      },
      {
        title: '\u{1F3AF} Modo focus',
        paragraphs: ['Oscurece todo el documento excepto la línea que se está leyendo. Solo disponible en modo edición con karaoke activo.'],
      },
      {
        title: '\u{26A1} Controles rápidos',
        paragraphs: [],
        list: ['Ctrl/Cmd + P → "Leer documento"', 'Ctrl/Cmd + P → "Pausar/Reanudar"', 'Ctrl/Cmd + P → "Detener"'],
      },
    ];

    sections.forEach(sec => {
      const sectionEl = activeDocument.createDiv();
      sectionEl.className = 'piperobs-help-section';
      const h4 = activeDocument.createEl('h4');
      h4.setText(sec.title);
      sectionEl.appendChild(h4);
      sec.paragraphs.forEach(p => {
        const pEl = activeDocument.createEl('p');
        pEl.setText(p);
        sectionEl.appendChild(pEl);
      });
      if (sec.list) {
        const ul = activeDocument.createEl('ul');
        sec.list.forEach(item => {
          const li = activeDocument.createEl('li');
          li.setText(item);
          ul.appendChild(li);
        });
        sectionEl.appendChild(ul);
      }
      body.appendChild(sectionEl);
    });

    content.appendChild(header);
    content.appendChild(body);
    modal.appendChild(backdrop);
    modal.appendChild(content);
    activeDocument.body.appendChild(modal);
  }

  onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    const root = container.createDiv('piperobs-sidebar');

    const header = root.createDiv('piperobs-sidebar-header');
    header.appendChild(makeLogoMark());
    const title = header.createDiv('piperobs-header-title');
    title.setText('Piperobs v2');
    const dot = activeDocument.createDiv();
    dot.className = 'piperobs-status-dot';
    header.appendChild(dot);
    this.el.dot = dot;

    // Botón de ayuda
    const infoBtn = activeDocument.createEl('button');
    infoBtn.className = 'piperobs-info-btn';
    infoBtn.setText('?');
    infoBtn.title = '¿cómo funciona?';
    infoBtn.onclick = () => this.showHelpModal();
    header.appendChild(infoBtn);

    const body = root.createDiv('piperobs-sidebar-body');

    const card = body.createDiv('piperobs-doc-card');
    this.el.docTitle = card.createDiv('piperobs-doc-title');
    this.el.docTitle.setText('Sin documento activo');
    this.el.docMeta = card.createDiv('piperobs-doc-meta');
    this.el.docMeta.setText('Abrí una nota para leer');

    this.el.readBtn = body.createEl('button', { cls: 'piperobs-btn-read' });
    this.el.readBtn.appendChild(makePlayIcon());
    this.el.readBtn.appendText(' Leer documento completo');
    this.el.readBtn.addEventListener('click', () => this.onRead());

    const secSpeed = body.createDiv('piperobs-section-label');
    secSpeed.setText('Velocidad');
    const speedRow = body.createDiv('piperobs-speed-row');
    const RATES = [0.75, 0.9, 1.0, 1.25, 1.5];
    const slider = activeDocument.createEl('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '4'; slider.step = '1'; slider.value = '2';
    slider.className = 'piperobs-speed-slider';
    this.el.speedVal = activeDocument.createSpan();
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
    const volSlider = activeDocument.createEl('input');
    volSlider.type = 'range'; volSlider.min = '0'; volSlider.max = '100'; volSlider.step = '1'; volSlider.value = '85';
    volSlider.className = 'piperobs-volume-slider';
    this.el.volumeVal = activeDocument.createSpan();
    this.el.volumeVal.className = 'piperobs-volume-val';
    this.el.volumeVal.textContent = '85%';
    this.el.volumeIcon = activeDocument.createSpan();
    this.el.volumeIcon.className = 'piperobs-volume-icon';
    this.el.volumeIcon.textContent = '\u{1F50A}';
    volSlider.addEventListener('input', () => {
      const vol = parseInt(volSlider.value);
      this.el.volumeVal.textContent = vol + '%';
      this.el.volumeIcon.textContent = vol === 0 ? '\u{1F507}' : vol < 34 ? '\u{1F508}' : vol < 67 ? '\u{1F509}' : '\u{1F50A}';
      this.onVolumeChange(vol / 100);
    });
    volumeRow.appendChild(this.el.volumeIcon);
    volumeRow.appendChild(volSlider);
    volumeRow.appendChild(this.el.volumeVal);

    const secVoice = body.createDiv('piperobs-section-label');
    secVoice.setText('Voz activa');

    const ddWrap = body.createDiv('piperobs-voice-dropdown-wrap');
    this.el.voiceSel = ddWrap.createDiv('piperobs-voice-selector');
    this.el.voiceFlag = this.el.voiceSel.createSpan('piperobs-voice-flag');
    this.el.voiceFlag.setText('\u{1F1E6}\u{1F1F7}');
    this.el.voiceName = this.el.voiceSel.createSpan('piperobs-voice-name');
    this.el.voiceName.setText('Daniela (español ar)');
    this.el.voiceSel.createSpan('piperobs-voice-arrow').setText('›');
    this.el.voiceSel.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = this.el.voiceDD;
      if (dd) {
        const open = dd.classList.contains('visible');
        if (open) { dd.classList.remove('visible'); this.el.voiceSel.classList.remove('open'); }
        else { this.renderVoiceDropdown(); dd.classList.add('visible'); this.el.voiceSel.classList.add('open'); }
      }
    });

    this.el.voiceDD = ddWrap.createDiv('piperobs-voice-dropdown');
    activeDocument.addEventListener('click', () => {
      this.el.voiceDD?.classList.remove('visible');
      this.el.voiceSel?.classList.remove('open');
    });

    // Botón reiniciar con esta voz
    this.el.restartVoiceBtn = body.createEl('button', { cls: 'piperobs-btn-restart-voice' });
    this.el.restartVoiceBtn.setText('\u{1F504} Reiniciar con esta voz');
    this.el.restartVoiceBtn.classList.add('piperobs-hidden');
    this.el.restartVoiceBtn.onclick = () => this.onRestartWithVoice();

    // Karaoke Theme Panel
    const themePanel = body.createDiv('piperobs-karaoke-theme-panel');
    const themeLabel = themePanel.createDiv('piperobs-theme-label');
    themeLabel.createSpan().setText('Tema de resaltado');
    this.el.themePreview = themeLabel.createSpan('piperobs-theme-preview');
    this.el.themePreview.setText('Violeta/cyan');
    const presets = themePanel.createDiv('piperobs-color-presets');
    const themeMap: Record<KaraokeTheme, { name: string }> = {
      gold: { name: 'Oro' },
      cyan: { name: 'Violeta/Cyan' },
      magenta: { name: 'Rosa/Magenta' },
      green: { name: 'Verde/Lime' },
      orange: { name: 'Naranja/Rojo' },
    };
    (Object.keys(themeMap) as KaraokeTheme[]).forEach(theme => {
      const chip = presets.createEl('button', { cls: 'piperobs-color-preset' });
      chip.dataset.theme = theme;
      chip.title = themeMap[theme].name;
      chip.onclick = () => {
        presets.querySelectorAll('.piperobs-color-preset').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (this.el.themePreview) this.el.themePreview.textContent = themeMap[theme].name;
        this.onThemeChange(theme);
      };
    });

    // Focus Mode (fuera del theme panel)
    const focusBtn = body.createEl('button', { cls: 'piperobs-btn-focus' });
    focusBtn.setText('\u{1F3AF} Modo focus');
    focusBtn.onclick = () => this.onToggleFocusMode();
    this.el.focusBtn = focusBtn;

    // Stats Row
    const statsRow = body.createDiv('piperobs-stats-row');
    const wpmChip = statsRow.createDiv('piperobs-stat-chip');
    this.el.statWPM = wpmChip.createDiv('piperobs-stat-value');
    this.el.statWPM.setText('--');
    wpmChip.createDiv('piperobs-stat-label').setText('Pal/min');
    const timeChip = statsRow.createDiv('piperobs-stat-chip');
    this.el.statTime = timeChip.createDiv('piperobs-stat-value');
    this.el.statTime.setText('--');
    timeChip.createDiv('piperobs-stat-label').setText('Restante');
    const phraseChip = statsRow.createDiv('piperobs-stat-chip');
    this.el.statPhrase = phraseChip.createDiv('piperobs-stat-value');
    this.el.statPhrase.setText('--');
    phraseChip.createDiv('piperobs-stat-label').setText('Frases');

    body.createDiv('piperobs-divider');
    const voicesBtn = body.createEl('button', { cls: 'piperobs-btn-voices', text: '+ gestionar voces' });
    voicesBtn.addEventListener('click', () => this.onOpenVoiceModal());

    // Pomodoro
    const pomoWrap = body.createDiv('piperobs-pomo-wrap');
    const pomoToggle = pomoWrap.createDiv('piperobs-pomo-toggle');
    pomoToggle.id = 'pomo-toggle';
    pomoToggle.onclick = () => this.onTogglePomodoro();
    const pomoLabel = pomoToggle.createDiv('piperobs-pomo-label');
    pomoLabel.createSpan('piperobs-pomo-icon').setText('\u{1F345}');
    const pomoText = pomoLabel.createDiv();
    pomoText.createDiv('piperobs-pomo-title').setText('Pomodoro');
    this.el.pomoSub = pomoText.createDiv('piperobs-pomo-sub');
    this.el.pomoSub.setText('25 Min lectura / 5 min descanso');
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

    return Promise.resolve();
  }

  private renderVoiceDropdown() {
    const dd = this.el.voiceDD;
    if (!dd) return;
    dd.empty();
    this.voices.forEach(voice => {
      const row = dd.createDiv('piperobs-voice-option');
      if (voice.id === this.currentVoiceId) row.classList.add('active');
      row.createSpan('piperobs-voice-flag').setText(voice.flag);
      const nameSpan = row.createDiv('piperobs-voice-option-name');
      nameSpan.setText(voice.name + ' (' + voice.language + ')');
      if (voice.installed || voice.isDefault) {
        const badge = row.createSpan('piperobs-voice-badge');
        badge.addClass(voice.isDefault ? 'default' : 'installed');
        badge.setText(voice.isDefault ? 'Predeterminada' : 'Instalada');
      } else {
        row.createSpan('piperobs-voice-unavailable').setText('No instalada');
      }
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (voice.installed || voice.isDefault) {
          this.onVoiceChange(voice.id);
          dd.classList.remove('visible');
          this.el.voiceSel?.classList.remove('open');
        } else {
          dd.classList.remove('visible');
          this.el.voiceSel?.classList.remove('open');
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

  updateInlineProgress(currentPhrase: number, totalPhrases: number, _elapsed: string) {
    if (this.el.statPhrase) {
      this.el.statPhrase.textContent = totalPhrases > 0 ? `${currentPhrase}/${totalPhrases}` : '--';
    }
  }

  updatePlaybackState(state: 'idle' | 'synthesizing' | 'playing' | 'paused') {
    this.playbackState = state;
    if (this.el.readBtn) {
      this.el.readBtn.classList.remove('piperobs-hidden');
      this.el.readBtn.classList.add('piperobs-display-flex');
      this.el.readBtn.empty();
      if (state === 'playing') {
        this.el.readBtn.appendChild(makePauseIcon());
        this.el.readBtn.appendText(' Detener lectura');
      } else {
        this.el.readBtn.appendChild(makePlayIcon());
        this.el.readBtn.appendText(' Leer documento completo');
      }
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
        this.el.docMeta.classList.remove('piperobs-doc-meta-idle');
      } else {
        this.el.docMeta.textContent = 'Abrí una nota para leer';
        this.el.docMeta.classList.add('piperobs-doc-meta-idle');
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
    if (this.el.volumeIcon) this.el.volumeIcon.textContent = pct === 0 ? '\u{1F507}' : pct < 34 ? '\u{1F508}' : pct < 67 ? '\u{1F509}' : '\u{1F50A}';
    const slider = this.containerEl.querySelector('.piperobs-volume-slider') as HTMLInputElement;
    if (slider) slider.value = String(pct);
  }

  updateFocusMode(active: boolean) {
    if (this.el.focusBtn) {
      this.el.focusBtn.classList.toggle('active', active);
      this.el.focusBtn.empty();
      this.el.focusBtn.appendText(active ? '\u{1F3AF} focus activo' : '\u{1F3AF} Modo focus');
    }
  }

  showRestartVoiceButton(show: boolean) {
    if (this.el.restartVoiceBtn) {
      if (show) {
        this.el.restartVoiceBtn.classList.remove('piperobs-hidden');
      } else {
        this.el.restartVoiceBtn.classList.add('piperobs-hidden');
      }
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
        chip = pomoWrap.createDiv({ cls: 'piperobs-pomo-adaptive-chip' });
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
      if (this.el.pomoSub) this.el.pomoSub.textContent = '25 Min lectura / 5 min descanso';
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
