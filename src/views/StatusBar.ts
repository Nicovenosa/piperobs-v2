export type StatusState = 'idle' | 'synthesizing' | 'playing' | 'paused' | 'error' | 'disconnected';

export class StatusBarItem {
  private container: HTMLElement;
  private markSvg: HTMLElement;
  private text: HTMLElement;

  constructor(statusBarEl: HTMLElement) {
    this.container = statusBarEl.createDiv('piperobs-status-bar-item piperobs-v2');

    this.markSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as HTMLElement;
    this.markSvg.setAttribute('class', 'piperobs-status-bar-mark');
    this.markSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    this.markSvg.setAttribute('viewBox', '0 0 32 32');
    this.markSvg.innerHTML = `
      <path d="M4 4 Q4 2 6 2 L26 2 Q28 2 28 4 L28 20 Q28 22 26 22 L20 22 L16 28 L12 22 L6 22 Q4 22 4 20 Z" fill="#8352C9"/>
      <rect x="8"  y="10" width="3" height="9"  rx="1.5" fill="#22D3EE"/>
      <rect x="13" y="7"  width="3" height="12" rx="1.5" fill="white" opacity="0.85"/>
      <rect x="18" y="10" width="3" height="9"  rx="1.5" fill="white" opacity="0.5"/>
      <rect x="23" y="13" width="2" height="6"  rx="1"   fill="white" opacity="0.3"/>
    `;
    this.container.appendChild(this.markSvg);

    this.text = this.container.createSpan();
    this.text.setText('PiperObs · listo');
  }

  update(state: StatusState, extra?: { voiceShort?: string; rate?: number }) {
    let text = '';

    switch (state) {
      case 'idle':
        text = 'PiperObs · listo';
        break;
      case 'synthesizing':
        text = 'PiperObs · preparando';
        break;
      case 'playing':
        const voiceText = extra?.voiceShort || 'Leyendo';
        const rate = extra?.rate ? (extra.rate.toFixed(2) === '1.00' ? '1x' : extra.rate.toFixed(2) + 'x') : '1x';
        text = `${voiceText} · ${rate}`;
        break;
      case 'paused':
        text = 'PiperObs · pausado';
        break;
      case 'error':
        text = '⚠ PiperObs · error';
        break;
      case 'disconnected':
        text = '⚠ sin bridge';
        break;
    }

    this.text.setText(text);
  }
}
