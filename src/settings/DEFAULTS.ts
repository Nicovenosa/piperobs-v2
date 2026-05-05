export interface PiperObsSettings {
  dataDir: string;
  defaultVoice: string;
  playbackRate: number;
  defaultRate?: number;
  volume: number;
  highlightEnabled: boolean;
  autoMagicEnabled: boolean;
  installedVoices: InstalledVoice[];
  pomodoroEnabled?: boolean;
  karaokeTheme?: KaraokeTheme;
}

export interface InstalledVoice {
  id: string;
  name: string;
  language: string;
  flag: string;
  gender: 'femenina' | 'masculina';
  quality: 'high' | 'medium' | 'low';
  sizeMB: number;
  isDefault: boolean;
}

export const DEFAULT_DATA_DIR = '.obsidian/piperobs-data';

export type KaraokeTheme = 'gold' | 'cyan' | 'magenta' | 'green' | 'orange';

export const KARAOKE_THEMES: KaraokeTheme[] = ['gold', 'cyan', 'magenta', 'green', 'orange'];

export const DEFAULT_SETTINGS: PiperObsSettings = {
  dataDir: DEFAULT_DATA_DIR,
  defaultVoice: 'es_AR-daniela-high',
  playbackRate: 1.0,
  volume: 0.85,
  highlightEnabled: true,
  autoMagicEnabled: true,
  installedVoices: [
    {
      id: 'es_AR-daniela-high',
      name: 'Daniela',
      language: 'Español AR',
      flag: '\u{1F1E6}\u{1F1F7}',
      gender: 'femenina',
      quality: 'high',
      sizeMB: 63,
      isDefault: true
    }
  ],
  pomodoroEnabled: false,
  karaokeTheme: 'gold',
};

export const FEATURED_VOICES = [
  { id: 'es_ES-davefx-medium',  name: 'Davefx', language: 'Español ES', flag: '\u{1F1EA}\u{1F1F8}', gender: 'masculina' as const, quality: 'medium' as const, sizeMB: 63 },
  { id: 'es_ES-carlfm-x_low',   name: 'Carlfm', language: 'Español ES', flag: '\u{1F1EA}\u{1F1F8}', gender: 'masculina' as const, quality: 'low'    as const, sizeMB: 27 },
  { id: 'es_MX-claude-high',    name: 'Claude', language: 'Español MX', flag: '\u{1F1F2}\u{1F1FD}', gender: 'femenina'  as const, quality: 'high'   as const, sizeMB: 63 },
  { id: 'pt_BR-faber-medium',   name: 'Faber',  language: 'Português BR',flag: '\u{1F1E7}\u{1F1F7}', gender: 'masculina' as const, quality: 'medium' as const, sizeMB: 63 },
  { id: 'en_US-lessac-medium',  name: 'Lessac', language: 'English US',  flag: '\u{1F1FA}\u{1F1F8}', gender: 'masculina' as const, quality: 'medium' as const, sizeMB: 63 },
  { id: 'en_US-amy-medium',     name: 'Amy',    language: 'English US',  flag: '\u{1F1FA}\u{1F1F8}', gender: 'femenina'  as const, quality: 'medium' as const, sizeMB: 63 },
];

export const PLAYBACK_RATES = [0.75, 0.9, 1.0, 1.25, 1.5];
