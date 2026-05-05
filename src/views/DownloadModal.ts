import { Modal, App } from 'obsidian';
import { InstalledVoice } from '../settings/DEFAULTS';

export class DownloadModal extends Modal {
  voice: InstalledVoice;
  state: 'downloading' | 'success' | 'error' = 'downloading';
  onCancel: () => void = () => {};

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
    fill.style.width = '0%';

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

    // Store refs
    (this as any).pctEl = pctEl;
    (this as any).fill = fill;
    (this as any).leftEl = leftEl;
    (this as any).rightEl = rightEl;
  }

  private renderSuccess() {
    const { contentEl } = this;
    contentEl.empty();

    const body = contentEl.createDiv('piperobs-dl-body');
    body.style.textAlign = 'center';
    body.style.paddingTop = '32px';

    const checkmark = body.createDiv();
    checkmark.style.fontSize = '48px';
    checkmark.style.marginBottom = '16px';
    checkmark.setText('✓');

    const text = body.createDiv();
    text.style.fontSize = '15px';
    text.style.color = '#fff';
    text.style.marginBottom = '20px';
    text.setText(`${this.voice.name} listo para usar`);

    const useBtn = body.createEl('button', { cls: 'piperobs-btn-download' });
    useBtn.style.width = '100%';
    useBtn.setText('Usar ahora');
    useBtn.style.marginBottom = '12px';

    const countdown = body.createDiv();
    countdown.style.fontSize = '12px';
    countdown.style.color = 'rgba(255,255,255,0.3)';
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

    const body = contentEl.createDiv('piperobs-dl-body');
    body.style.textAlign = 'center';
    body.style.paddingTop = '32px';

    const icon = body.createDiv();
    icon.style.fontSize = '48px';
    icon.style.marginBottom = '16px';
    icon.setText('⚠');

    const text = body.createDiv();
    text.style.fontSize = '14px';
    text.style.color = '#fff';
    text.style.marginBottom = '8px';
    text.setText('Error descargando voz');

    const errorMsg = body.createDiv();
    errorMsg.style.fontSize = '12px';
    errorMsg.style.color = 'rgba(255,255,255,0.4)';
    errorMsg.style.marginBottom = '20px';
    errorMsg.setText(message);

    const retryBtn = body.createEl('button', { cls: 'piperobs-btn-download' });
    retryBtn.style.width = '100%';
    retryBtn.style.marginBottom = '8px';
    retryBtn.setText('Reintentar');
    retryBtn.onclick = () => {
      this.state = 'downloading';
      this.renderDownloading();
    };

    const closeBtn = body.createEl('button', { cls: 'piperobs-btn-cancel' });
    closeBtn.style.width = '100%';
    closeBtn.setText('Cerrar');
    closeBtn.onclick = () => this.close();
  }

  setProgress(pct: number, downloadedMB: number, speedMBs: number, etaSecs: number) {
    const fill = (this as any).fill;
    const pctEl = (this as any).pctEl;
    const leftEl = (this as any).leftEl;
    const rightEl = (this as any).rightEl;

    if (fill) fill.style.width = (pct * 100) + '%';
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
