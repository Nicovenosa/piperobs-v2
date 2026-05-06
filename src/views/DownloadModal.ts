import { Modal, App } from 'obsidian';
import { InstalledVoice } from '../settings/DEFAULTS';

export class DownloadModal extends Modal {
  voice: InstalledVoice;
  state: 'downloading' | 'success' | 'error' = 'downloading';
  onCancel: () => void = () => {};

  private pctEl: HTMLElement | null = null;
  private fill: HTMLElement | null = null;
  private leftEl: HTMLElement | null = null;
  private rightEl: HTMLElement | null = null;

  constructor(app: App, voice: InstalledVoice) {
    super(app);
    this.voice = voice;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('piperobs-dl-modal');

    this.renderDownloading();
  }

  private renderDownloading() {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createDiv('piperobs-dl-header');

    const icon = header.createDiv('piperobs-dl-icon');
    icon.setText('⬇');

    const info = header.createDiv();
    const name = info.createDiv('piperobs-voice-name');
    name.setText(this.voice.name);
    const metaInfo = info.createDiv('piperobs-voice-meta');
    metaInfo.setText(`${this.voice.language} • ${this.voice.sizeMB}MB`);

    const body = contentEl.createDiv('piperobs-dl-body');

    const labels = body.createDiv('piperobs-dl-progress-labels');
    const progressLabel = labels.createDiv();
    progressLabel.setText('Descargando...');
    const pctEl = labels.createDiv('piperobs-dl-pct');
    pctEl.setText('0%');

    const track = body.createDiv('piperobs-dl-track');
    const fill = track.createDiv('piperobs-dl-fill');
    fill.id = 'piperobs-dl-fill';

    const meta = body.createDiv('piperobs-dl-meta');
    const leftEl = meta.createDiv();
    leftEl.setText('0MB / ' + this.voice.sizeMB + 'MB');
    const rightEl = meta.createDiv();
    rightEl.setText('-- MB/s');

    const cancelBtn = body.createEl('button', { cls: 'piperobs-btn-cancel' });
    cancelBtn.setText('Cancelar');
    cancelBtn.onclick = () => {
      this.onCancel();
      this.close();
    };

    this.pctEl = pctEl;
    this.fill = fill;
    this.leftEl = leftEl;
    this.rightEl = rightEl;
  }

  private renderSuccess() {
    const { contentEl } = this;
    contentEl.empty();

    const body = contentEl.createDiv('piperobs-dl-body piperobs-dl-success-body');

    const checkmark = body.createDiv('piperobs-dl-checkmark');
    checkmark.setText('✓');

    const text = body.createDiv('piperobs-dl-success-text');
    text.setText(`${this.voice.name} listo para usar`);

    const useBtn = body.createEl('button', { cls: 'piperobs-btn-download piperobs-width-full piperobs-margin-bottom-12' });
    useBtn.setText('Usar ahora');

    const countdown = body.createDiv('piperobs-font-size-12 piperobs-color-muted-light');
    let secs = 3;
    countdown.setText(`Se cierra en ${secs}s`);

    const timer = setInterval(() => {
      secs--;
      if (secs <= 0) {
        clearInterval(timer);
        this.close();
      } else {
        countdown.setText(`Se cierra en ${secs}s`);
      }
    }, 1000);

    useBtn.onclick = () => {
      clearInterval(timer);
      this.close();
    };
  }

  private renderError(message: string) {
    const { contentEl } = this;
    contentEl.empty();

    const body = contentEl.createDiv('piperobs-dl-body piperobs-dl-error-body');

    const icon = body.createDiv('piperobs-dl-error-icon');
    icon.setText('⚠');

    const text = body.createDiv('piperobs-dl-error-title');
    text.setText('Error descargando voz');

    const errorMsg = body.createDiv('piperobs-dl-error-msg');
    errorMsg.setText(message);

    const retryBtn = body.createEl('button', { cls: 'piperobs-btn-download piperobs-width-full piperobs-margin-bottom-8' });
    retryBtn.setText('Reintentar');
    retryBtn.onclick = () => {
      this.state = 'downloading';
      this.renderDownloading();
    };

    const closeBtn = body.createEl('button', { cls: 'piperobs-btn-cancel piperobs-width-full' });
    closeBtn.setText('Cerrar');
    closeBtn.onclick = () => this.close();
  }

  setProgress(pct: number, downloadedMB: number, speedMBs: number, etaSecs: number) {
    const fill = this.fill;
    const pctEl = this.pctEl;
    const leftEl = this.leftEl;
    const rightEl = this.rightEl;

    if (fill) fill.style.setProperty('--pobs-dl-width', (pct * 100) + '%');
    if (pctEl) pctEl.setText(Math.round(pct * 100) + '%');
    if (leftEl) leftEl.setText(downloadedMB.toFixed(1) + 'MB / ' + this.voice.sizeMB + 'MB');
    if (rightEl) {
      const etaMin = Math.floor(etaSecs / 60);
      const etaSec = etaSecs % 60;
      rightEl.setText(`${speedMBs.toFixed(1)} MB/s • ${etaMin}:${String(etaSec).padStart(2, '0')}`);
    }
  }

  setSuccess() {
    this.state = 'success';
    this.renderSuccess();
  }

  setError(message: string) {
    this.state = 'error';
    this.renderError(message);
  }
}
