import { PLAYBACK_RATES } from '../settings/DEFAULTS';

export class MiniPlayer {
  private container: HTMLElement | null = null;
  private state: 'hidden' | 'synthesizing' | 'playing' | 'paused' = 'hidden';
  private currentRate = 1.0;

  onPause: () => void = () => {};
  onResume: () => void = () => {};
  onStop: () => void = () => {};
  onPrev: () => void = () => {};
  onNext: () => void = () => {};
  onRateChange: (rate: number) => void = () => {};

  constructor() {
    this.buildDOM();
  }

  private buildDOM() {
    this.container = document.createElement('div');
    this.container.className = 'piperobs-miniplayer';
    this.container.style.display = 'none';

    const row = document.createElement('div');
    row.className = 'piperobs-mp-row';

    const logo = document.createElement('div');
    logo.className = 'piperobs-mp-logo';
    logo.id = 'piperobs-mp-logo';
    // Icono simple blanco (ondas) sobre fondo gradiente que cambia con el tema
    logo.innerHTML = `<svg viewBox="0 0 32 32" style="width:20px;height:20px"><path d="M4 4 Q4 2 6 2 L26 2 Q28 2 28 4 L28 20 Q28 22 26 22 L20 22 L16 28 L12 22 L6 22 Q4 22 4 20 Z" fill="white" opacity="0.95"/><rect x="8"  y="10" width="3" height="9"  rx="1.5" fill="white" opacity="0.9"/><rect x="13" y="7"  width="3" height="12" rx="1.5" fill="white" opacity="0.85"/><rect x="18" y="10" width="3" height="9"  rx="1.5" fill="white" opacity="0.5"/><rect x="23" y="12" width="2" height="7"  rx="1"   fill="white" opacity="0.3"/></svg>`;

    const info = document.createElement('div');
    info.className = 'piperobs-mp-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'piperobs-mp-title';
    titleEl.innerHTML = 'PiperObs <span id="piperobs-mp-paused-badge" style="display:none;font-size:12px;color:#64748b;font-weight:500;margin-left:6px">· pausado</span>';
    const timeEl = document.createElement('div');
    timeEl.className = 'piperobs-mp-time';
    timeEl.id = 'piperobs-mp-time';
    timeEl.textContent = '0:00 / 0:00';
    const track = document.createElement('div');
    track.className = 'piperobs-mp-track';
    const fill = document.createElement('div');
    fill.className = 'piperobs-mp-fill';
    fill.id = 'piperobs-mp-fill';
    fill.style.width = '0%';
    track.appendChild(fill);
    info.appendChild(titleEl);
    info.appendChild(timeEl);
    info.appendChild(track);

    const waveform = document.createElement('div');
    waveform.className = 'piperobs-mp-waveform';
    waveform.id = 'piperobs-mp-waveform';
    for (let i = 0; i < 12; i++) {
      const bar = document.createElement('div');
      bar.className = 'piperobs-waveform-bar';
      bar.style.animationDelay = `${i * 0.05}s`;
      waveform.appendChild(bar);
    }

    const controls = document.createElement('div');
    controls.className = 'piperobs-mp-controls';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'piperobs-mp-btn';
    prevBtn.textContent = '\u23EE';
    prevBtn.onclick = () => this.onPrev();

    const playBtn = document.createElement('button');
    playBtn.className = 'piperobs-mp-btn play';
    playBtn.id = 'piperobs-mp-play-btn';
    playBtn.textContent = '\u23F8';
    playBtn.onclick = () => {
      if (this.state === 'playing') this.onPause();
      else if (this.state === 'paused') this.onResume();
    };

    const nextBtn = document.createElement('button');
    nextBtn.className = 'piperobs-mp-btn';
    nextBtn.textContent = '\u23ED';
    nextBtn.onclick = () => this.onNext();

    const spdBtn = document.createElement('button');
    spdBtn.className = 'piperobs-mp-spd-btn';
    spdBtn.id = 'piperobs-mp-spd-btn';
    spdBtn.textContent = '1x';
    spdBtn.onclick = (e) => {
      e.stopPropagation();
      const panel = document.getElementById('piperobs-speed-panel');
      if (panel) {
        panel.classList.toggle('visible');
        spdBtn.classList.toggle('open');
        this.container?.classList.toggle('expanded');
      }
    };

    controls.appendChild(prevBtn);
    controls.appendChild(playBtn);
    controls.appendChild(nextBtn);
    controls.appendChild(spdBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'piperobs-mp-close';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = () => { this.hide(); this.onStop(); };

    row.appendChild(logo);
    row.appendChild(info);
    row.appendChild(waveform);
    row.appendChild(controls);
    row.appendChild(closeBtn);

    const speedPanel = document.createElement('div');
    speedPanel.className = 'piperobs-speed-panel';
    speedPanel.id = 'piperobs-speed-panel';

    PLAYBACK_RATES.forEach(rate => {
      const btn = document.createElement('button');
      btn.className = 'piperobs-spd-option';
      if (rate === 1.0) btn.classList.add('active');
      btn.textContent = rate.toFixed(2);
      btn.onclick = () => {
        this.currentRate = rate;
        speedPanel.querySelectorAll('.piperobs-spd-option').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        const spdBtnEl = document.getElementById('piperobs-mp-spd-btn');
        if (spdBtnEl) spdBtnEl.textContent = rate.toFixed(2) + 'x';
        speedPanel.classList.remove('visible');
        const spd = document.getElementById('piperobs-mp-spd-btn');
        if (spd) spd.classList.remove('open');
        this.container?.classList.remove('expanded');
        this.onRateChange(rate);
      };
      speedPanel.appendChild(btn);
    });

    const synthBar = document.createElement('div');
    synthBar.className = 'piperobs-synth-bar';
    synthBar.id = 'piperobs-synth-bar';
    synthBar.style.display = 'none';
    const spinner = document.createElement('div');
    spinner.className = 'piperobs-spinner';
    const synthText = document.createElement('div');
    synthText.className = 'piperobs-synth-text';
    synthText.textContent = 'Preparando audio...';
    const synthProg = document.createElement('div');
    synthProg.className = 'piperobs-synth-prog';
    synthProg.id = 'piperobs-synth-prog';
    synthProg.textContent = '0 / 0';
    synthBar.appendChild(spinner);
    synthBar.appendChild(synthText);
    synthBar.appendChild(synthProg);

    const controlsWrap = document.createElement('div');
    controlsWrap.id = 'piperobs-mp-controls-wrap';
    controlsWrap.style.display = 'flex';
    controlsWrap.style.alignItems = 'center';
    controlsWrap.style.gap = '10px';
    controlsWrap.appendChild(row);

    this.container.appendChild(controlsWrap);
    this.container.appendChild(synthBar);
    this.container.appendChild(speedPanel);

    document.body.appendChild(this.container);
  }

  show(state: 'synthesizing' | 'playing' | 'paused') {
    if (!this.container) return;
    const synthBar = document.getElementById('piperobs-synth-bar');
    const controlsWrap = document.getElementById('piperobs-mp-controls-wrap');
    if (state === 'synthesizing') {
      if (synthBar) synthBar.style.display = 'flex';
      if (controlsWrap) controlsWrap.style.display = 'none';
    } else {
      if (synthBar) synthBar.style.display = 'none';
      if (controlsWrap) controlsWrap.style.display = 'flex';
      this.updatePlayState(state);
    }
    this.container.style.display = 'flex';
    this.state = state;
  }

  hide() {
    if (this.container) { this.container.style.display = 'none'; }
    this.state = 'hidden';
  }

  private updatePlayState(state: 'playing' | 'paused') {
    const btn = document.getElementById('piperobs-mp-play-btn');
    const badge = document.getElementById('piperobs-mp-paused-badge');
    const waveform = document.getElementById('piperobs-mp-waveform');
    if (btn) btn.textContent = state === 'playing' ? '\u23F8' : '\u25B6';
    if (badge) badge.style.display = state === 'paused' ? 'inline' : 'none';
    if (waveform) waveform.classList.toggle('playing', state === 'playing');
    if (state === 'paused') btn?.classList.add('paused');
    else btn?.classList.remove('paused');
  }

  updateProgress(pct: number, elapsed: string, total: string) {
    const fill = document.getElementById('piperobs-mp-fill');
    const time = document.getElementById('piperobs-mp-time');
    if (fill) fill.style.width = (pct * 100) + '%';
    if (time) time.textContent = elapsed + ' / ' + total;
  }

  updateSynthProgress(current: number, total: number) {
    const prog = document.getElementById('piperobs-synth-prog');
    if (prog) prog.textContent = current + ' / ' + total;
  }

  setRate(rate: number) {
    this.currentRate = rate;
    const btn = document.getElementById('piperobs-mp-spd-btn');
    if (btn) btn.textContent = rate.toFixed(2) + 'x';
  }

  setPaused(paused: boolean) {
    if (paused) { this.updatePlayState('paused'); this.state = 'paused'; }
    else { this.updatePlayState('playing'); this.state = 'playing'; }
  }

  setPomodoro(state: { active: boolean; mode: 'focus' | 'break'; remainingSec: number; totalSec: number; cyclesDone: number } | null) {
    // MiniPlayer no muestra pomodoro visualmente, solo lo ignoramos
  }

  cleanup() {
    if (this.container) { this.container.remove(); this.container = null; }
  }
}
