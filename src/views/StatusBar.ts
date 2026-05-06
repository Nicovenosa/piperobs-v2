export type StatusState = 'idle' | 'synthesizing' | 'playing' | 'paused' | 'error' | 'disconnected';

export class StatusBarItem {
  private container: HTMLElement;
  private markSvg: SVGElement;
  private text: HTMLElement;

  constructor(statusBarEl: HTMLElement) {
    this.container = statusBarEl.createDiv('piperobs-status-bar-item piperobs-v2');

    this.markSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.markSvg.setAttribute('class', 'piperobs-status-bar-mark');
    this.markSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    this.markSvg.setAttribute('viewBox', '0 0 32 32');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 4 Q4 2 6 2 L26 2 Q28 2 28 4 L28 20 Q28 22 26 22 L20 22 L16 28 L12 22 L6 22 Q4 22 4 20 Z');
    path.setAttribute('fill', '#8352C9');
    this.markSvg.appendChild(path);

    const rect1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect1.setAttribute('x', '8');
    rect1.setAttribute('y', '10');
    rect1.setAttribute('width', '3');
    rect1.setAttribute('height', '9');
    rect1.setAttribute('rx', '1.5');
    rect1.setAttribute('fill', '#22D3EE');
    this.markSvg.appendChild(rect1);

    const rect2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect2.setAttribute('x', '13');
    rect2.setAttribute('y', '7');
    rect2.setAttribute('width', '3');
    rect2.setAttribute('height', '12');
    rect2.setAttribute('rx', '1.5');
    rect2.setAttribute('fill', 'white');
    rect2.setAttribute('opacity', '0.85');
    this.markSvg.appendChild(rect2);

    const rect3 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect3.setAttribute('x', '18');
    rect3.setAttribute('y', '10');
    rect3.setAttribute('width', '3');
    rect3.setAttribute('height', '9');
    rect3.setAttribute('rx', '1.5');
    rect3.setAttribute('fill', 'white');
    rect3.setAttribute('opacity', '0.5');
    this.markSvg.appendChild(rect3);

    const rect4 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect4.setAttribute('x', '23');
    rect4.setAttribute('y', '13');
    rect4.setAttribute('width', '2');
    rect4.setAttribute('height', '6');
    rect4.setAttribute('rx', '1');
    rect4.setAttribute('fill', 'white');
    rect4.setAttribute('opacity', '0.3');
    this.markSvg.appendChild(rect4);

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
      case 'playing': {
        const voiceText = extra?.voiceShort || 'Leyendo';
        const rate = extra?.rate ? (extra.rate.toFixed(2) === '1.00' ? '1x' : extra.rate.toFixed(2) + 'x') : '1x';
        text = `${voiceText} · ${rate}`;
        break;
      }
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
