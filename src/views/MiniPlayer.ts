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
    this.container.classList.add('piperobs-hidden');

    const row = document.createElement('div');
    row.className = 'piperobs-mp-row';

    const logo = document.createElement('div');
    logo.className = 'piperobs-mp-logo';
    logo.id = 'piperobs-mp-logo';
    const logoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    logoSvg.setAttribute('viewBox', '0 0 32 32');
    logoSvg.classList.add('piperobs-mp-logo-svg');
    const logoPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    logoPath.setAttribute('d', 'M4 4 Q4 2 6 2 L26 2 Q28 2 28 4 L28 20 Q28 22 26 22 L20 22 L16 28 L12 22 L6 22 Q4 22 4 20 Z');
    logoPath.setAttribute('fill', 'white');
    logoPath.setAttribute('opacity', '0.95');
    logoSvg.appendChild(logoPath);
    const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect1.setAttribute('x', '8'); rect1.setAttribute('y', '10'); rect1.setAttribute('width', '3'); rect1.setAttribute('height', '9'); rect1.setAttribute('rx', '1.5'); rect1.setAttribute('fill', 'white'); rect1.setAttribute('opacity', '0.9');
    logoSvg.appendChild(rect1);
    const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect2.setAttribute('x', '13'); rect2.setAttribute('y', '7'); rect2.setAttribute('width', '3'); rect2.setAttribute('height', '12'); rect2.setAttribute('rx', '1.5'); rect2.setAttribute('fill', 'white'); rect2.setAttribute('opacity', '0.85');
    logoSvg.appendChild(rect2);
    const rect3 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect3.setAttribute('x', '18'); rect3.setAttribute('y', '10'); rect3.setAttribute('width', '3'); rect3.setAttribute('height', '9'); rect3.setAttribute('rx', '1.5'); rect3.setAttribute('fill', 'white'); rect3.setAttribute('opacity', '0.5');
    logoSvg.appendChild(rect3);
    const rect4 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect4.setAttribute('x', '23'); rect4.setAttribute('y', '12'); rect4.setAttribute('width', '2'); rect4.setAttribute('height', '7'); rect4.setAttribute('rx', '1'); rect4.setAttribute('fill', 'white'); rect4.setAttribute('opacity', '0.3');
    logoSvg.appendChild(rect4);
    logo.appendChild(logoSvg);

    const info = document.createElement('div');
    info.className = 'piperobs-mp-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'piperobs-mp-title';
    titleEl.appendText('PiperObs ');
    const pausedBadge = document.createElement('span');
    pausedBadge.id = 'piperobs-mp-paused-badge';
    pausedBadge.className = 'piperobs-mp-paused-badge';
    pausedBadge.setText('· pausado');
    titleEl.appendChild(pausedBadge);
    const timeEl = document.createElement('div');
    timeEl.className = 'piperobs-mp-time';
    timeEl.id = 'piperobs-mp-time';
    timeEl.textContent = '0:00 / 0:00';
    const track = document.createElement('div');
    track.className = 'piperobs-mp-track';
    const fill = document.createElement('div');
    fill.className = 'piperobs-mp-fill';
    fill.id = 'piperobs-mp-fill';
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
    controlsWrap.className = 'piperobs-display-flex';
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
      synthBar?.classList.remove('piperobs-hidden');
      synthBar?.classList.add('piperobs-display-flex');
      controlsWrap?.classList.add('piperobs-hidden');
      controlsWrap?.classList.remove('piperobs-display-flex');
    } else {
      synthBar?.classList.add('piperobs-hidden');
      synthBar?.classList.remove('piperobs-display-flex');
      controlsWrap?.classList.remove('piperobs-hidden');
      controlsWrap?.classList.add('piperobs-display-flex');
      this.updatePlayState(state);
    }
    this.container.classList.remove('piperobs-hidden');
    this.container.classList.add('piperobs-display-flex');
    this.state = state;
  }

  hide() {
    if (this.container) {
      this.container.classList.add('piperobs-hidden');
      this.container.classList.remove('piperobs-display-flex');
    }
    this.state = 'hidden';
  }

  private updatePlayState(state: 'playing' | 'paused') {
    const btn = document.getElementById('piperobs-mp-play-btn');
    const badge = document.getElementById('piperobs-mp-paused-badge');
    const waveform = document.getElementById('piperobs-mp-waveform');
    if (btn) btn.textContent = state === 'playing' ? '\u23F8' : '\u25B6';
    if (badge) {
      if (state === 'paused') {
        badge.classList.add('piperobs-display-inline');
      } else {
        badge.classList.remove('piperobs-display-inline');
      }
    }
    if (waveform) waveform.classList.toggle('playing', state === 'playing');
    if (state === 'paused') btn?.classList.add('paused');
    else btn?.classList.remove('paused');
  }

  updateProgress(pct: number, elapsed: string, total: string) {
    const fill = document.getElementById('piperobs-mp-fill');
    const time = document.getElementById('piperobs-mp-time');
    if (fill) fill.style.setProperty('--pobs-mp-width', (pct * 100) + '%');
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

  setPomodoro(_state: { active: boolean; mode: 'focus' | 'break'; remainingSec: number; totalSec: number; cyclesDone: number } | null) {
    // MiniPlayer no muestra pomodoro visualmente, solo lo ignoramos
  }

  cleanup() {
    if (this.container) { this.container.remove(); this.container = null; }
  }
}
