import { Extension, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import {
  ExtractedParagraph,
  ExtractedPhrase,
  ExtractedSpeechDocument,
  ExtractedWord,
  normalizeComparableText,
} from './TextExtractor';

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface PhraseData {
  text: string;
  fullParagraph: string;
  words: WordTiming[];
  duration: number;
  paragraphIndex?: number;
  phraseIndex?: number;
}

interface RangeMark {
  from: number;
  to: number;
}

interface KaraokeDecorationState {
  phrase: RangeMark | null;
  said: RangeMark | null;
  active: RangeMark | null;
}

interface RuntimePhraseMatch {
  paragraph: ExtractedParagraph;
  phrase: ExtractedPhrase;
  words: ExtractedWord[];
}

const STARTUP_OFFSET_MS = 110;
const PREDICTIVE_OFFSET_MS = 35;

const phraseMark = Decoration.mark({ class: 'piperobs-phrase-active' });
const saidMark = Decoration.mark({ class: 'piperobs-word-said' });
const activeMark = Decoration.mark({ class: 'piperobs-word-active' });

export const setKaraokeDecorationsEffect = StateEffect.define<KaraokeDecorationState>();
export const clearKaraokeDecorationsEffect = StateEffect.define<void>();

export const karaokeDecorationsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(clearKaraokeDecorationsEffect)) {
        return Decoration.none;
      }

      if (effect.is(setKaraokeDecorationsEffect)) {
        const { phrase, said, active } = effect.value;
        const ranges: ReturnType<typeof phraseMark.range>[] = [];
        if (phrase && phrase.from < phrase.to) ranges.push(phraseMark.range(phrase.from, phrase.to));
        if (said && said.from < said.to) ranges.push(saidMark.range(said.from, said.to));
        if (active && active.from < active.to) ranges.push(activeMark.range(active.from, active.to));
        return Decoration.set(ranges, true);
      }
    }

    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const karaokeDecorationsExtension: Extension = [karaokeDecorationsField];

// ─── Preview Mode Karaoke ───────────────────────────────────────────────────

interface PreviewHighlight {
  paragraphEl: HTMLElement;
  wordSpans: Map<number, HTMLElement>;
}

export class KaraokeHighlighter {
  private app: App;
  private session: ExtractedSpeechDocument | null = null;
  private timer: number | null = null;
  private startTime = 0;
  private pausedElapsed = 0;
  private isPaused = false;
  private currentMatch: RuntimePhraseMatch | null = null;
  private currentTimings: WordTiming[] = [];
  private currentEditorView: EditorView | null = null;
  private debug = true;
  private lastRenderKey = '';
  private lastPerfRenderTime = 0;
  private lastScrolledWordIndex = -1;
  private activePhraseKey = '';

  // Preview mode
  private previewHighlight: PreviewHighlight | null = null;
  private mutationObserver: MutationObserver | null = null;
  private currentViewMode: 'editor' | 'preview' | null = null;
  private pendingRehighlight = false;
  private focusModeActive = false;

  constructor(app: App) {
    this.app = app;
  }

  setSession(session: ExtractedSpeechDocument | null): void {
    this.session = session;
  }

  setFocusMode(active: boolean): void {
    this.focusModeActive = active;
    activeDocument.body.classList.toggle('piperobs-focus-active', active);
  }

  /** Sincroniza el reloj del karaoke con el momento exacto en que el audio empieza a sonar */
  syncToAudio(phraseStartTime?: number): void {
    if (this.isPaused) return;
    // Resetear startTime para que elapsed = 0 cuando el audio realmente empieza
    this.startTime = phraseStartTime ?? performance.now();
    this.pausedElapsed = 0;
    this.lastPerfRenderTime = 0;
  }

  private log(...args: unknown[]) {
    if (this.debug) console.debug('[Karaoke]', ...args);
  }

  // ─── View discovery ───────────────────────────────────────────────────────

  private findMarkdownView(): MarkdownView | null {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) return active;

    const recent = this.app.workspace.getMostRecentLeaf();
    if (recent?.view instanceof MarkdownView) return recent.view;

    let found: MarkdownView | null = null;
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (!found && leaf.view instanceof MarkdownView && leaf.view.file) {
        found = leaf.view;
      }
    });

    return found;
  }

  private getEditorView(view: MarkdownView): EditorView | null {
    const cm = (view.editor as { cm?: EditorView }).cm;
    return cm ?? null;
  }

  private isPreviewMode(view: MarkdownView): boolean {
    // Obsidian usa getMode() o podemos chequear la clase del container
    return view.getMode?.() === 'preview' || !this.getEditorView(view);
  }

  // ─── Timer & clear ────────────────────────────────────────────────────────

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private dispatchClear(): void {
    if (!this.currentEditorView) return;
    try {
      this.currentEditorView.dispatch({
        effects: [clearKaraokeDecorationsEffect.of()],
      });
    } catch { /* no-op */ }
  }

  // ─── Main API ─────────────────────────────────────────────────────────────

  startPhrase(data: PhraseData): void {
    this.clearTimer();
    this.clearPreviewHighlight();
    this.log('startPhrase:', data.text.substring(0, 80), '| words:', data.words.length, '| p:', data.paragraphIndex, '| f:', data.phraseIndex);

    const view = this.findMarkdownView();
    if (!view) {
      this.log('No MarkdownView disponible');
      return;
    }

    const match = this.resolvePhraseMatch(data);
    if (!match) {
      this.log('No se pudo resolver frase:', data.text.substring(0, 80));
      this.clearAll();
      return;
    }

    this.log('Frase resuelta:', match.phrase.from, '-', match.phrase.to, 'modo:', this.isPreviewMode(view) ? 'preview' : 'editor');

    this.currentMatch = match;
    this.currentTimings = data.words;
    this.activePhraseKey = `${match.paragraph.paragraphIndex}:${match.phrase.phraseIndex}:${match.phrase.from}:${match.phrase.to}`;
    this.startTime = performance.now() - STARTUP_OFFSET_MS;
    this.pausedElapsed = 0;
    this.isPaused = false;
    this.lastRenderKey = '';

    if (this.isPreviewMode(view)) {
      this.currentViewMode = 'preview';
      this.initPreviewHighlight(view, match, data);
      this.setupMutationObserver(view);
      this.renderPreviewState(true);
    } else {
      const editorView = this.getEditorView(view);
      if (!editorView) {
        this.log('No EditorView disponible');
        this.clearAll();
        return;
      }
      this.currentViewMode = 'editor';
      this.currentEditorView = editorView;
      this.renderCurrentState(true);
    }
  }

  pause(pausedAtMs?: number): void {
    this.isPaused = true;
    this.clearTimer();
    if (pausedAtMs !== undefined && pausedAtMs > 0) {
      this.pausedElapsed = pausedAtMs;
      return;
    }
    this.pausedElapsed = performance.now() - this.startTime + this.pausedElapsed;
  }

  resume(): void {
    if (!this.currentMatch) return;
    this.isPaused = false;
    this.startTime = performance.now();
    if (this.currentViewMode === 'preview') {
      this.renderPreviewState(false);
    } else {
      this.renderCurrentState(false);
    }
  }

  finishPhrase(): void {
    this.clearTimer();
    if (!this.currentMatch) return;

    if (this.currentViewMode === 'preview') {
      this.finishPreviewPhrase();
    } else {
      if (!this.currentEditorView) return;
      const lastWord = this.currentMatch.words[this.currentMatch.words.length - 1];
      const phraseRange = { from: this.currentMatch.phrase.from, to: this.currentMatch.phrase.to };
      const saidRange = lastWord ? { from: this.currentMatch.words[0].from, to: lastWord.to } : null;

      this.currentEditorView.dispatch({
        effects: [setKaraokeDecorationsEffect.of({
          phrase: phraseRange,
          said: saidRange,
          active: null,
        })],
      });
    }

    this.lastRenderKey = `${this.activePhraseKey}:finished`;
  }

  clearAll(): void {
    this.clearTimer();
    this.dispatchClear();
    this.clearPreviewHighlight();
    this.disconnectMutationObserver();
    this.currentMatch = null;
    this.currentTimings = [];
    this.isPaused = false;
    this.pausedElapsed = 0;
    this.lastRenderKey = '';
    this.activePhraseKey = '';
    this.currentEditorView = null;
    this.currentViewMode = null;
    activeDocument.body.classList.remove('piperobs-focus-active');
  }

  // ─── Editor mode rendering ────────────────────────────────────────────────

  private renderCurrentState(shouldScroll: boolean): void {
    if (this.isPaused || !this.currentMatch || !this.currentEditorView) return;

    const state = this.computeVisualState();
    const renderKey = `${this.activePhraseKey}:${state.saidIndex}:${state.activeIndex}`;
    // Catch-up: si el tiempo transcurrido indica que deberíamos estar en un estado diferente,
    // forzamos render aunque el renderKey sea igual (evita lag acumulado)
    const timeSinceLastRender = performance.now() - (this.lastPerfRenderTime || 0);
    const needsRender = renderKey !== this.lastRenderKey || timeSinceLastRender > 500;

    if (needsRender) {
      const phraseRange = { from: this.currentMatch.phrase.from, to: this.currentMatch.phrase.to };
      const activeWord = state.activeIndex >= 0 ? this.currentMatch.words[state.activeIndex] : null;
      const saidWord = state.saidIndex >= 0 ? this.currentMatch.words[state.saidIndex] : null;

      const effects: StateEffect<unknown>[] = [
        setKaraokeDecorationsEffect.of({
          phrase: phraseRange,
          said: saidWord ? { from: this.currentMatch.words[0].from, to: saidWord.to } : null,
          active: activeWord ? { from: activeWord.from, to: activeWord.to } : null,
        }),
      ];

      if (shouldScroll) {
        effects.push(EditorView.scrollIntoView(phraseRange.from, { y: 'center' }));
      }

      this.currentEditorView.dispatch({ effects });
      this.lastRenderKey = renderKey;
      this.lastPerfRenderTime = performance.now();

      // Focus mode: marcar línea activa
      if (this.focusModeActive) {
        try {
          let lineEl = this.currentEditorView.domAtPos(phraseRange.from).node as HTMLElement | null;
          while (lineEl && !lineEl.classList?.contains('cm-line')) {
            lineEl = lineEl.parentElement;
          }
          if (lineEl) {
            this.currentEditorView.dom.querySelectorAll('.cm-line.pobs-active-line').forEach(el => el.classList.remove('pobs-active-line'));
            lineEl.classList.add('pobs-active-line');
          }
        } catch { /* no-op */ }
      }
    }

    this.scheduleNextUpdate();
  }

  private computeVisualState(): { elapsed: number; saidIndex: number; activeIndex: number } {
    const elapsed = performance.now() - this.startTime + this.pausedElapsed;
    const adjustedElapsed = elapsed + PREDICTIVE_OFFSET_MS;
    let activeIndex = -1;
    let saidIndex = -1;

    for (let i = 0; i < this.currentTimings.length; i++) {
      const word = this.currentTimings[i];
      if (adjustedElapsed >= word.start && adjustedElapsed <= word.end) {
        activeIndex = i;
        break;
      }
      if (adjustedElapsed > word.end) {
        saidIndex = i;
      }
    }

    if (activeIndex < 0 && saidIndex + 1 < this.currentMatch!.words.length) {
      const nextWord = this.currentTimings[saidIndex + 1];
      if (nextWord && adjustedElapsed >= nextWord.start) {
        activeIndex = saidIndex + 1;
      }
    }

    return { elapsed, saidIndex, activeIndex };
  }

  private scheduleNextUpdate(): void {
    this.clearTimer();
    if (!this.currentMatch || this.currentTimings.length === 0) return;
    // Usar intervalo fijo corto para evitar acumulación de lag y permitir catch-up
    this.timer = window.setTimeout(() => this.renderCurrentState(false), 50);
  }

  // ─── Preview mode rendering ───────────────────────────────────────────────

  private initPreviewHighlight(view: MarkdownView, match: RuntimePhraseMatch, data: PhraseData): void {
    const container = view.containerEl.querySelector('.markdown-preview-view, .markdown-reading-view') as HTMLElement;
    if (!container) return;

    // Solo buscar elementos de contenido textual (sin headers, para que coincida con el extractor)
    const paragraphs = Array.from(container.querySelectorAll('p, li, blockquote'));
    const targetParagraph = paragraphs[match.paragraph.paragraphIndex] as HTMLElement;
    if (!targetParagraph) {
      // Fallback: buscar por contenido de texto
      const found = paragraphs.find(p => p.textContent?.includes(match.paragraph.text.substring(0, 40)));
      if (!found || !(found.instanceOf(HTMLElement))) return;
      this.previewHighlight = this.wrapWordsInElement(found, match, data);
    } else {
      this.previewHighlight = this.wrapWordsInElement(targetParagraph, match, data);
    }

    // Focus mode: marcar párrafo activo en preview
    if (this.focusModeActive && this.previewHighlight) {
      this.previewHighlight.paragraphEl.classList.add('pobs-active-paragraph');
    }
  }

  private wrapWordsInElement(el: HTMLElement, match: RuntimePhraseMatch, data: PhraseData): PreviewHighlight {
    const text = el.textContent || '';
    const phraseText = data.text;
    const phraseIndex = text.indexOf(phraseText);

    const wordSpans = new Map<number, HTMLElement>();

    if (phraseIndex >= 0 && match.words.length > 0) {
      const before = text.substring(0, phraseIndex);
      const after = text.substring(phraseIndex + phraseText.length);

      el.empty();
      el.appendText(before);

      const phraseSpan = el.createSpan('piperobs-preview-phrase');
      data.words.forEach((w, idx) => {
        const wordSpan = phraseSpan.createSpan('piperobs-preview-word');
        wordSpan.dataset.wordIdx = String(idx);
        wordSpan.setText(w.word);
        wordSpans.set(idx, wordSpan);
        if (idx < data.words.length - 1) {
          phraseSpan.appendText(' ');
        }
      });

      el.appendText(after);
    } else {
      // Si no encontramos el texto exacto, marcar todo el párrafo
      el.classList.add('piperobs-preview-phrase');
    }

    return { paragraphEl: el, wordSpans };
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private renderPreviewState(shouldScroll: boolean): void {
    if (this.isPaused || !this.previewHighlight) return;

    const state = this.computeVisualState();
    const renderKey = `${this.activePhraseKey}:${state.saidIndex}:${state.activeIndex}`;
    if (renderKey === this.lastRenderKey) {
      this.schedulePreviewUpdate();
      return;
    }

    const { wordSpans, paragraphEl } = this.previewHighlight;

    // Reset classes
    wordSpans.forEach(span => {
      span.classList.remove('piperobs-preview-said', 'piperobs-preview-active');
    });
    paragraphEl.classList.remove('piperobs-phrase-active');

    // Apply phrase active class
    paragraphEl.classList.add('piperobs-phrase-active');

    // Mark said words
    for (let i = 0; i <= state.saidIndex; i++) {
      const span = wordSpans.get(i);
      if (span) span.classList.add('piperobs-preview-said');
    }

    // Mark active word
    let activeSpan: HTMLElement | null = null;
    if (state.activeIndex >= 0) {
      activeSpan = wordSpans.get(state.activeIndex) || null;
      if (activeSpan) activeSpan.classList.add('piperobs-preview-active');
    }

    // Scroll: al inicio de frase scrollea el párrafo, después scrollea la palabra activa
    if (shouldScroll && paragraphEl) {
      paragraphEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (activeSpan && state.activeIndex !== this.lastScrolledWordIndex) {
      // Seguimiento suave de la palabra activa dentro del párrafo
      activeSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      this.lastScrolledWordIndex = state.activeIndex;
    }

    this.lastRenderKey = renderKey;
    this.schedulePreviewUpdate();
  }

  private schedulePreviewUpdate(): void {
    this.clearTimer();
    if (!this.previewHighlight || this.currentTimings.length === 0) return;
    // Usar intervalo fijo corto para evitar acumulación de lag y permitir catch-up
    this.timer = window.setTimeout(() => this.renderPreviewState(false), 50);
  }

  private finishPreviewPhrase(): void {
    if (!this.previewHighlight) return;
    const { wordSpans, paragraphEl } = this.previewHighlight;
    wordSpans.forEach(span => span.classList.add('piperobs-preview-said'));
    wordSpans.forEach(span => span.classList.remove('piperobs-preview-active'));
    paragraphEl.classList.remove('piperobs-phrase-active', 'pobs-active-paragraph');
  }

  private clearPreviewHighlight(): void {
    if (this.previewHighlight) {
      const { paragraphEl } = this.previewHighlight;
      // Restaurar texto original si fue modificado
      if (paragraphEl.querySelector('.piperobs-preview-phrase')) {
        // Simple restoration: remove spans and restore text
        const spans = paragraphEl.querySelectorAll('.piperobs-preview-word');
        spans.forEach(span => {
          const text = activeDocument.createTextNode(span.textContent || '');
          span.parentNode?.insertBefore(text, span);
          span.remove();
        });
        paragraphEl.classList.remove('piperobs-phrase-active', 'pobs-active-paragraph');
      }
      this.previewHighlight = null;
    }
  }

  // ─── MutationObserver ─────────────────────────────────────────────────────

  private setupMutationObserver(view: MarkdownView): void {
    this.disconnectMutationObserver();
    const container = view.containerEl.querySelector('.markdown-preview-view, .markdown-reading-view') as HTMLElement;
    if (!container) return;

    this.mutationObserver = new MutationObserver(() => {
      if (!this.currentMatch || !this.previewHighlight) return;
      // Si el párrafo fue modificado o removido, re-aplicar highlight
      const paragraphStillThere = container.contains(this.previewHighlight.paragraphEl);
      if (!paragraphStillThere || this.pendingRehighlight) {
        this.pendingRehighlight = false;
        this.clearPreviewHighlight();
        // Reconstruir highlight
        const paragraphs = Array.from(container.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote'));
        const target = paragraphs[this.currentMatch.paragraph.paragraphIndex] as HTMLElement;
        if (target) {
          const data: PhraseData = {
            text: this.currentMatch.phrase.text,
            fullParagraph: this.currentMatch.paragraph.text,
            words: this.currentTimings,
            duration: 0,
            paragraphIndex: this.currentMatch.paragraph.paragraphIndex,
            phraseIndex: this.currentMatch.phrase.phraseIndex,
          };
          this.previewHighlight = this.wrapWordsInElement(target, this.currentMatch, data);
          this.renderPreviewState(false);
        }
      }
    });

    this.mutationObserver.observe(container, { childList: true, subtree: true });
  }

  private disconnectMutationObserver(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  // ─── Phrase resolution ────────────────────────────────────────────────────

  private resolvePhraseMatch(data: PhraseData): RuntimePhraseMatch | null {
    if (!this.session || this.session.paragraphs.length === 0) return null;

    const paragraph = this.resolveParagraph(data);
    if (paragraph) {
      const byIndex = this.resolvePhraseByIndex(paragraph, data);
      if (byIndex) return byIndex;

      const byText = this.resolvePhraseByText(paragraph, data.text);
      if (byText) return byText;

      const byWords = this.resolvePhraseByWordSequence(paragraph, data.words);
      if (byWords) return byWords;
    }

    return this.resolvePhraseGlobally(data);
  }

  private resolveParagraph(data: PhraseData): ExtractedParagraph | null {
    if (typeof data.paragraphIndex === 'number') {
      const indexed = this.session?.paragraphs[data.paragraphIndex];
      if (indexed) return indexed;
    }

    const normalizedParagraph = normalizeComparableText(data.fullParagraph);
    if (!normalizedParagraph) return this.session?.paragraphs[0] ?? null;

    return this.session?.paragraphs.find(
      (paragraph) => normalizeComparableText(paragraph.text) === normalizedParagraph,
    ) ?? null;
  }

  private resolvePhraseGlobally(data: PhraseData): RuntimePhraseMatch | null {
    if (!this.session) return null;

    for (const paragraph of this.session.paragraphs) {
      const byText = this.resolvePhraseByText(paragraph, data.text);
      if (byText) return byText;

      const byWords = this.resolvePhraseByWordSequence(paragraph, data.words);
      if (byWords) return byWords;
    }

    return null;
  }

  private resolvePhraseByIndex(paragraph: ExtractedParagraph, data: PhraseData): RuntimePhraseMatch | null {
    if (typeof data.phraseIndex !== 'number') return null;
    const phrase = paragraph.phrases[data.phraseIndex];
    if (!phrase) return null;
    if (normalizeComparableText(phrase.text) !== normalizeComparableText(data.text)) return null;
    return {
      paragraph,
      phrase,
      words: this.resolveWordRanges(phrase.words, data.words),
    };
  }

  private resolvePhraseByText(paragraph: ExtractedParagraph, phraseText: string): RuntimePhraseMatch | null {
    const normalized = normalizeComparableText(phraseText);
    const phrase = paragraph.phrases.find((candidate) => normalizeComparableText(candidate.text) === normalized);
    if (!phrase) return null;
    return {
      paragraph,
      phrase,
      words: phrase.words,
    };
  }

  private resolvePhraseByWordSequence(paragraph: ExtractedParagraph, timings: WordTiming[]): RuntimePhraseMatch | null {
    const targetWords = timings
      .map((word) => normalizeComparableText(word.word))
      .filter(Boolean);

    if (targetWords.length === 0) return null;

    const paragraphWords = paragraph.words.map((word) => normalizeComparableText(word.text));

    for (let start = 0; start <= paragraphWords.length - targetWords.length; start++) {
      let matched = true;
      for (let i = 0; i < targetWords.length; i++) {
        if (paragraphWords[start + i] !== targetWords[i]) {
          matched = false;
          break;
        }
      }

      if (!matched) continue;

      const words = paragraph.words.slice(start, start + targetWords.length);
      const phraseIndex = paragraph.phrases.findIndex(
        (phrase) => phrase.from <= words[0].from && phrase.to >= words[words.length - 1].to,
      );

      const phrase: ExtractedPhrase = phraseIndex >= 0
        ? paragraph.phrases[phraseIndex]
        : {
            text: words.map((word) => word.text).join(' '),
            from: words[0].from,
            to: words[words.length - 1].to,
            cleanFrom: words[0].cleanFrom,
            cleanTo: words[words.length - 1].cleanTo,
            paragraphIndex: paragraph.paragraphIndex,
            phraseIndex: -1,
            words,
          };

      return { paragraph, phrase, words };
    }

    return null;
  }

  private resolveWordRanges(words: ExtractedWord[], timings: WordTiming[]): ExtractedWord[] {
    if (words.length === timings.length) return words;

    const normalizedWords = words.map((word) => normalizeComparableText(word.text));
    const normalizedTimings = timings.map((word) => normalizeComparableText(word.word));
    const resolved: ExtractedWord[] = [];
    let cursor = 0;

    for (const timingWord of normalizedTimings) {
      let found = -1;
      for (let i = cursor; i < normalizedWords.length; i++) {
        if (normalizedWords[i] === timingWord) {
          found = i;
          break;
        }
      }

      if (found === -1) break;
      resolved.push(words[found]);
      cursor = found + 1;
    }

    return resolved.length === timings.length ? resolved : words;
  }
}
