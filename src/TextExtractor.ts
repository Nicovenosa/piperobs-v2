import { App, Editor, getFrontMatterInfo } from 'obsidian';

const EMOJI_TO_WORD: Record<string, string> = {
  '🔑': 'clave',
  '📌': 'importante',
  '💡': 'ejemplo',
  '⚠️': 'atencion',
  '🎯': 'objetivo',
  '🔥': 'atencion',
  '❌': 'incorrecto',
  '✅': 'correcto',
  '📚': 'referencia',
  '🧠': 'truco',
};

export interface ExtractedWord {
  text: string;
  from: number;
  to: number;
  cleanFrom: number;
  cleanTo: number;
  wordIndex: number;
}

export interface ExtractedPhrase {
  text: string;
  from: number;
  to: number;
  cleanFrom: number;
  cleanTo: number;
  paragraphIndex: number;
  phraseIndex: number;
  words: ExtractedWord[];
}

export interface ExtractedParagraph {
  text: string;
  from: number;
  to: number;
  cleanFrom: number;
  cleanTo: number;
  paragraphIndex: number;
  words: ExtractedWord[];
  phrases: ExtractedPhrase[];
}

export interface ExtractedSpeechDocument {
  text: string;
  sourceFrom: number;
  sourceTo: number;
  paragraphs: ExtractedParagraph[];
}

interface MutableWord {
  text: string;
  from: number;
  to: number;
}

const SENTENCE_END_RE = /[.!?…]+(?:["')\]]+)?$/;
const MARKDOWN_TRIM_RE = /^[#*_~|>\-+[\]()"'`]+|[#*_~[\]()"'`]+$/g;
const LEADING_LIST_RE = /^(\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s+))+/;
const URL_RE = /^https?:\/\//i;
const TABLE_LINE_RE = /^\s*\|.*\|.*$/;
const FENCE_RE = /^\s*```/;
const TOKEN_RE = /\S+/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const IMAGE_RE = /!\[([^\]]*)\]\(([^)]*)\)/g;
const LINK_RE = /\[([^\]]+)\]\(([^)]*)\)/g;
const EXTRA_WHITESPACE_RE = /\s+/g;
const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const SECTION_NUMBER_RE = /^\d+(?:\.\d+)*[.)]?$/;

export function normalizeComparableText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[#*_`~|>[]()¿¡«»"'']/g, '')
    .replace(/\$\$[^$]+\$\$/g, '')
    .replace(/\$[^$]+\$/g, '')
    .replace(/[.,;:!?…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoOutputWords(text: string): string[] {
  return text
    .split(EXTRA_WHITESPACE_RE)
    .map((part) => part.trim())
    .filter(Boolean);
}

function sanitizeToken(raw: string): string[] {
  if (!raw) return [];
  if (URL_RE.test(raw)) return [];

  let token = raw;
  if (SECTION_NUMBER_RE.test(token)) return [];

  for (const [emoji, word] of Object.entries(EMOJI_TO_WORD)) {
    token = token.split(emoji).join(` ${word} `);
  }

  token = token.replace(EMOJI_RE, ' ');
  token = token.replace(/[:;]+$/g, '');
  token = token.replace(MARKDOWN_TRIM_RE, '');
  token = token.replace(/[¿¡]/g, '');
  token = token.replace(/_{2,}/g, ' ');
  token = token.replace(EXTRA_WHITESPACE_RE, ' ').trim();

  return splitIntoOutputWords(token);
}

function pushWordsFromSegment(words: MutableWord[], text: string, absoluteStart: number): void {
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const rawToken = match[0];
    const tokenStart = absoluteStart + match.index;
    const tokenEnd = tokenStart + rawToken.length;
    const cleanParts = sanitizeToken(rawToken);
    if (cleanParts.length === 0) continue;

    for (const part of cleanParts) {
      words.push({
        text: part,
        from: tokenStart,
        to: tokenEnd,
      });
    }
  }
}

function processLineToWords(line: string, absoluteStart: number): MutableWord[] {
  const withoutPrefix = line.replace(LEADING_LIST_RE, '');
  const prefixTrim = line.length - withoutPrefix.length;
  const text = withoutPrefix;
  const baseStart = absoluteStart + prefixTrim;

  const words: MutableWord[] = [];
  const matches: Array<{ start: number; end: number; label: string; labelOffset: number }> = [];

  INLINE_CODE_RE.lastIndex = 0;
  let codeMatch: RegExpExecArray | null;
  while ((codeMatch = INLINE_CODE_RE.exec(text)) !== null) {
    matches.push({
      start: codeMatch.index,
      end: codeMatch.index + codeMatch[0].length,
      label: '',
      labelOffset: 0,
    });
  }

  IMAGE_RE.lastIndex = 0;
  let imageMatch: RegExpExecArray | null;
  while ((imageMatch = IMAGE_RE.exec(text)) !== null) {
    matches.push({
      start: imageMatch.index,
      end: imageMatch.index + imageMatch[0].length,
      label: imageMatch[1] ?? '',
      labelOffset: 2,
    });
  }

  LINK_RE.lastIndex = 0;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = LINK_RE.exec(text)) !== null) {
    matches.push({
      start: linkMatch.index,
      end: linkMatch.index + linkMatch[0].length,
      label: linkMatch[1] ?? '',
      labelOffset: 1,
    });
  }

  matches.sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;

    if (match.start > cursor) {
      pushWordsFromSegment(words, text.slice(cursor, match.start), baseStart + cursor);
    }

    if (match.label) {
      pushWordsFromSegment(words, match.label, baseStart + match.start + match.labelOffset);
    }

    cursor = match.end;
  }

  if (cursor < text.length) {
    pushWordsFromSegment(words, text.slice(cursor), baseStart + cursor);
  }

  return words;
}

function splitPhrases(words: ExtractedWord[], paragraphIndex: number): ExtractedPhrase[] {
  const phrases: ExtractedPhrase[] = [];
  let current: ExtractedWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const phraseIndex = phrases.length;
    phrases.push({
      text: current.map((word) => word.text).join(' '),
      from: current[0].from,
      to: current[current.length - 1].to,
      cleanFrom: current[0].cleanFrom,
      cleanTo: current[current.length - 1].cleanTo,
      paragraphIndex,
      phraseIndex,
      words: current,
    });
    current = [];
  };

  for (const word of words) {
    current.push(word);
    if (SENTENCE_END_RE.test(word.text)) flush();
  }

  flush();
  return phrases;
}

function toSpeechWord(text: string): string {
  return text
    .replace(/[;:!?…]+$/g, '')
    .replace(/^["'""''']+|["'""''']+$/g, '')
    .trim();
}

function toSpeechPhraseText(phrase: ExtractedPhrase, isLastInParagraph: boolean): string {
  const base = phrase.words
    .map((word) => toSpeechWord(word.text))
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!base) return '';
  if (isLastInParagraph) return `${base}.`;
  return `${base},`;
}

function buildDocument(raw: string, baseOffset: number): ExtractedSpeechDocument {
  const frontMatter = getFrontMatterInfo(raw);
  const contentStart = frontMatter.exists ? frontMatter.contentStart : 0;
  const sourceTo = baseOffset + raw.length;
  const paragraphs: ExtractedParagraph[] = [];
  const lines = raw.split('\n');

  const docTextParts: string[] = [];
  let cleanOffset = 0;
  let currentParagraphWords: MutableWord[] = [];
  let inFence = false;
  let lineOffset = 0;

  const flushParagraph = () => {
    if (currentParagraphWords.length === 0) return;

    const paragraphIndex = paragraphs.length;
    const paragraphText = currentParagraphWords.map((word) => word.text).join(' ');
    const cleanWords: ExtractedWord[] = [];
    let paragraphCleanOffset = cleanOffset;

    for (let i = 0; i < currentParagraphWords.length; i++) {
      const word = currentParagraphWords[i];
      const cleanFrom = paragraphCleanOffset;
      const cleanTo = cleanFrom + word.text.length;
      cleanWords.push({
        text: word.text,
        from: word.from,
        to: word.to,
        cleanFrom,
        cleanTo,
        wordIndex: i,
      });
      paragraphCleanOffset = cleanTo + 1;
    }

    const paragraph: ExtractedParagraph = {
      text: paragraphText,
      from: currentParagraphWords[0].from,
      to: currentParagraphWords[currentParagraphWords.length - 1].to,
      cleanFrom: cleanOffset,
      cleanTo: cleanOffset + paragraphText.length,
      paragraphIndex,
      words: cleanWords,
      phrases: [],
    };

    paragraph.phrases = splitPhrases(cleanWords, paragraphIndex);
    paragraphs.push(paragraph);
    const speechParagraphText = paragraph.phrases
      .map((phrase, index) => toSpeechPhraseText(phrase, index === paragraph.phrases.length - 1))
      .filter(Boolean)
      .join(' ');

    if (!speechParagraphText) {
      currentParagraphWords = [];
      return;
    }

    docTextParts.push(speechParagraphText);
    cleanOffset += paragraphText.length + 2;
    currentParagraphWords = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineStart = lineOffset;
    const nextLineOffset = lineOffset + line.length + 1;
    lineOffset = nextLineOffset;

    if (lineStart + line.length <= contentStart) continue;

    const contentSliceStart = Math.max(0, contentStart - lineStart);
    const effectiveLine = line.slice(contentSliceStart);
    const absoluteLineStart = baseOffset + lineStart + contentSliceStart;

    if (FENCE_RE.test(effectiveLine)) {
      flushParagraph();
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;
    if (TABLE_LINE_RE.test(effectiveLine)) continue;

    const lineWords = processLineToWords(effectiveLine, absoluteLineStart);
    if (lineWords.length === 0) {
      flushParagraph();
      continue;
    }

    currentParagraphWords.push(...lineWords);
  }

  flushParagraph();

  const text = docTextParts.join(' ');

  return {
    text,
    sourceFrom: baseOffset + contentStart,
    sourceTo,
    paragraphs,
  };
}

export async function extractFromActiveFile(app: App): Promise<ExtractedSpeechDocument> {
  const file = app.workspace.getActiveFile();
  if (!file) throw new Error('No hay archivo activo');

  const raw = await app.vault.cachedRead(file);
  return buildDocument(raw, 0);
}

export function extractFromSelection(editor: Editor): ExtractedSpeechDocument {
  const selection = editor.getSelection();
  if (!selection) throw new Error('No hay texto seleccionado');

  const from = editor.posToOffset(editor.getCursor('from'));
  return buildDocument(selection, from);
}
