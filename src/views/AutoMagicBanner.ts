import { MarkdownView } from 'obsidian';
import { InstalledVoice, FEATURED_VOICES } from '../settings/DEFAULTS';

export class AutoMagicBanner {
  private view: MarkdownView;
  private currentVoice: InstalledVoice;
  private dismissedNotes: Set<string> = new Set();
  private bannerEl: HTMLElement | null = null;
  private state: 'suggest' | 'downloading' | 'done' = 'suggest';

  onDownload: (voiceId: string) => void = () => {};
  onIgnore: () => void = () => {};
  onUseNow: (voiceId: string) => void = () => {};

  constructor(view: MarkdownView, currentVoice: InstalledVoice) {
    this.view = view;
    this.currentVoice = currentVoice;
  }

  show() {
    const file = this.view.file;
    if (!file || this.dismissedNotes.has(file.path)) return;

    const content = this.view.editor?.getValue() || '';
    const detectedLang = this.detectLanguage(content);

    if (!detectedLang || this.currentVoiceLanguage() === detectedLang) return;

    const suggestedVoice = this.getSuggestedVoice(detectedLang);
    if (!suggestedVoice) return;

    this.renderSuggest(suggestedVoice);
    this.dismissedNotes.add(file.path);
  }

  private detectLanguage(content: string): string | null {
    const words = content.toLowerCase().split(/\s+/).slice(0, 500);

    const vocabularies: { [key: string]: string[] } = {
      es: ['el', 'la', 'de', 'que', 'en', 'los', 'se', 'del', 'las', 'un'],
      en: ['the', 'of', 'and', 'to', 'in', 'is', 'it', 'that', 'was'],
      pt: ['de', 'da', 'do', 'que', 'em', 'os', 'as', 'um', 'uma', 'não'],
      fr: ['le', 'la', 'de', 'et', 'les', 'des', 'en', 'du', 'une', 'que'],
      de: ['der', 'die', 'das', 'und', 'in', 'den', 'von', 'zu', 'ist']
    };

    const scores: { [key: string]: number } = {};
    Object.entries(vocabularies).forEach(([lang, vocab]) => {
      scores[lang] = words.filter(w => vocab.includes(w)).length;
    });

    const maxLang = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
    if (maxLang[1] >= 5) return maxLang[0];

    return null;
  }

  private currentVoiceLanguage(): string {
    const id = this.currentVoice.id;
    if (id.startsWith('es_')) return 'es';
    if (id.startsWith('en_')) return 'en';
    if (id.startsWith('pt_')) return 'pt';
    if (id.startsWith('fr_')) return 'fr';
    if (id.startsWith('de_')) return 'de';
    return 'unknown';
  }

  private getSuggestedVoice(lang: string): InstalledVoice | null {
    const filtered = FEATURED_VOICES.filter(v => v.id.startsWith(lang + '_'));
    return filtered.length > 0 ? filtered[0] : null;
  }

  private renderSuggest(voice: InstalledVoice) {
    this.state = 'suggest';

    const container = this.view.containerEl.createDiv('piperobs-banner piperobs-v2');
    const icon = container.createSpan('piperobs-banner-icon');
    icon.setText('💡');

    const text = container.createDiv('piperobs-banner-text');
    const mainText = activeDocument.createTextNode('Esta nota está en ');
    const voiceChip = text.createDiv('piperobs-banner-voice-chip');
    voiceChip.setText(`${voice.flag} ${voice.name}`);
    const endText = activeDocument.createTextNode(' suena ideal.');

    text.appendChild(mainText);
    text.appendChild(voiceChip);
    text.appendChild(endText);

    const actions = container.createDiv('piperobs-banner-actions');

    const downloadBtn = actions.createEl('button', { cls: 'piperobs-banner-btn primary' });
    downloadBtn.setText(`⬇ ${voice.sizeMB}MB`);
    downloadBtn.onclick = () => {
      this.state = 'downloading';
      this.onDownload(voice.id);
      this.renderDownloading(container);
    };

    const ignoreBtn = actions.createEl('button', { cls: 'piperobs-banner-btn ghost' });
    ignoreBtn.setText('Ignorar');
    ignoreBtn.onclick = () => {
      container.remove();
      this.onIgnore();
    };

    const closeBtn = container.createEl('button', { cls: 'piperobs-banner-close' });
    closeBtn.setText('✕');
    closeBtn.onclick = () => container.remove();

    this.bannerEl = container;
  }

  private renderDownloading(container: HTMLElement) {
    container.empty();

    const icon = container.createSpan('piperobs-banner-icon');
    icon.setText('⏳');

    const text = container.createDiv('piperobs-banner-text');
    text.setText('Descargando...');

    const closeBtn = container.createEl('button', { cls: 'piperobs-banner-close' });
    closeBtn.setText('✕');
    closeBtn.onclick = () => container.remove();
  }

  setSuccess(voiceId: string) {
    if (!this.bannerEl) return;

    this.state = 'done';
    this.bannerEl.classList.add('success');
    this.bannerEl.empty();

    const icon = this.bannerEl.createSpan('piperobs-banner-icon');
    icon.setText('✓');

    const text = this.bannerEl.createDiv('piperobs-banner-text');
    const mainText = activeDocument.createTextNode('Listo. ¿Cambiar voz ahora?');
    text.appendChild(mainText);

    const actions = this.bannerEl.createDiv('piperobs-banner-actions');

    const useBtn = actions.createEl('button', { cls: 'piperobs-banner-btn primary' });
    useBtn.setText('Usar ahora');
    useBtn.onclick = () => {
      this.onUseNow(voiceId);
      this.bannerEl!.remove();
    };

    const laterBtn = actions.createEl('button', { cls: 'piperobs-banner-btn ghost' });
    laterBtn.setText('Después');
    laterBtn.onclick = () => this.bannerEl!.remove();

    const closeBtn = this.bannerEl.createEl('button', { cls: 'piperobs-banner-close' });
    closeBtn.setText('✕');
    closeBtn.onclick = () => this.bannerEl!.remove();
  }

  setError() {
    if (!this.bannerEl) return;
    this.bannerEl.remove();
  }

  remove() {
    if (this.bannerEl) this.bannerEl.remove();
  }
}
