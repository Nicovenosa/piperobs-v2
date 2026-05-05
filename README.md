# 🔊 PiperObs v2

> Local TTS (Text-to-Speech) for Obsidian using Piper. Karaoke highlight, Pomodoro timer, 5 color themes, offline voice synthesis.

[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?color=7e6ad4&label=downloads&query=%24%5B%22piperobs-v2%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&logo=obsidian&style=flat-square)](https://obsidian.md/plugins?id=piperobs-v2)
[![Version](https://img.shields.io/github/v/release/NicolasVenosa/piperobs-v2?style=flat-square)](https://github.com/NicolasVenosa/piperobs-v2/releases)
[![License](https://img.shields.io/github/license/NicolasVenosa/piperobs-v2?style=flat-square)](LICENSE)

---

## ✨ Features

- 🎙️ **Local TTS** — Synthesize speech offline using [Piper TTS](https://github.com/rhasspy/piper). No internet required after setup.
- 🎨 **Karaoke Highlight** — Words are highlighted in real-time as they are spoken (editor mode).
- 🍅 **Adaptive Pomodoro** — Auto-adjusts focus/break sessions based on document length.
- 🎭 **5 Color Themes** — Gold, Cyan, Magenta, Green, Orange. Switch anytime.
- 🎤 **Voice Manager** — Download, delete, and switch voices on the fly.
- 🎚️ **Volume & Speed** — Independent controls for playback volume (0-100%) and speed (0.75x - 1.5x).
- 🎯 **Focus Mode** — Dims everything except the active line while reading.
- 🌐 **Multi-language** — Supports Spanish (AR, ES, MX), Portuguese, English, and more.
- 📱 **MiniPlayer** — Floating playback bar with waveform animation and progress.
- ⚡ **Gapless Playback** — Web Audio API for smooth, uninterrupted reading.

---

## 📸 Screenshots

<!-- PASO 1: Sacar capturas en Obsidian -->
<!-- PASO 2: Guardarlas en /home/zeroox/piperobs-screenshots/ -->
<!-- PASO 3: Yo (Claude) las subo al repo y actualizo estas URLs -->

### Sidebar — Controles principales
![Sidebar Preview](https://raw.githubusercontent.com/NicolasVenosa/piperobs-v2/main/assets/screenshots/sidebar.png)
*Panel lateral con velocidad, volumen, selector de voz, temas, focus mode y pomodoro*

### MiniPlayer — Reproducción flotante
![MiniPlayer Preview](https://raw.githubusercontent.com/NicolasVenosa/piperobs-v2/main/assets/screenshots/miniplayer.png)
*Barra flotante con waveform animado, controles de reproducción y progreso*

### Karaoke — Resaltado de palabras
![Karaoke Preview](https://raw.githubusercontent.com/NicolasVenosa/piperobs-v2/main/assets/screenshots/karaoke.png)
*Modo edición: palabras resaltadas en tiempo real mientras se lee*

> **Nota:** Las imágenes se agregarán antes del release. Si estás viendo esto en GitHub y faltan imágenes, estamos en proceso de subirlas.

---

## 📦 Installation

### From Obsidian Community Plugins (Recommended)

1. Open **Settings → Community Plugins**
2. Turn on **Safe Mode** off
3. Click **Browse** and search for **"PiperObs"**
4. Click **Install**, then **Enable**

### Manual Installation

1. Download the latest release: `main.js`, `styles.css`, and `manifest.json`
2. Create a folder `.obsidian/plugins/piperobs-v2/` in your vault
3. Copy the three files into that folder
4. Enable the plugin in **Settings → Community Plugins**

---

## 🚀 First Use

1. Open the **PiperObs** sidebar (right panel)
2. Click **"Leer documento completo"** or use the command palette (`Ctrl+P` → "Read document")
3. The plugin will automatically download Piper binary and the default voice on first run
4. Enjoy your local TTS!

---

## 🎛️ Controls

| Feature | Shortcut / Control |
|---|---|
| Read document | `Ctrl+P` → "Leer documento" |
| Pause / Resume | `Ctrl+P` → "Pausar/Reanudar" |
| Stop | `Ctrl+P` → "Detener" |
| Speed | Slider in sidebar (0.75x - 1.5x) |
| Volume | Slider in sidebar (0% - 100%) |
| Voice | Dropdown in sidebar |
| Theme | Color circles in sidebar |
| Focus Mode | Button in sidebar or Command Palette |
| Pomodoro | Toggle in sidebar |

---

## 🎤 Supported Voices

PiperObs includes a curated catalog of voices. You can download additional voices from the **Voice Manager** (+ Gestionar voces).

**Included by default:**
- `es_AR-daniela-high` — Español Argentina (femenina)

**Available to download:**
- `es_ES-davefx-medium` — Español España (masculina)
- `es_ES-carlfm-x_low` — Español España (masculina, ligera)
- `es_MX-claude-high` — Español México (femenina)
- `pt_BR-faber-medium` — Portugués Brasil (masculina)
- `en_US-lessac-medium` — English US (masculina)
- `en_US-amy-medium` — English US (femenina)

And 30+ more languages available via the Piper voice repository.

---

## ⚙️ Settings

| Setting | Description | Default |
|---|---|---|
| **Data Directory** | Where Piper binaries and voices are stored | `.obsidian/piperobs-data` |
| **Default Voice** | Voice used for reading | `es_AR-daniela-high` |
| **Volume** | Playback volume (0-100%) | `85%` |
| **Playback Rate** | Speech speed | `1.0x` |
| **Karaoke Highlight** | Highlight words while reading | `On` |
| **Auto Magic** | Suggest voices by language | `On` |
| **Pomodoro** | Enable timer during reading | `Off` |
| **Karaoke Theme** | Color theme for highlights | `Gold` |

---

## 🖥️ Requirements

- **Obsidian** v1.5.0 or later
- **Desktop only** (Linux, macOS, Windows)
- ~150MB free space for Piper binary + default voice
- Internet connection **only** for downloading Piper and voices (first time)

---

## 🛠️ Development

```bash
git clone https://github.com/NicolasVenosa/piperobs-v2.git
cd piperobs-v2
npm install
npm run build
```

For development with hot-reload:
```bash
npm run dev
```

---

## 🗺️ Roadmap

- [ ] Streaming synthesis (no temp files)
- [ ] Mobile support (if Piper releases mobile binaries)
- [ ] Custom pronunciation dictionary
- [ ] Export audio to file
- [ ] Voice preview before download

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or PR on GitHub.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

- [Piper TTS](https://github.com/rhasspy/piper) by Rhasspy / Michael Hansen
- [Obsidian](https://obsidian.md) by Dynalist
- Built with ❤️ by [Nicolas Venosa](https://github.com/NicolasVenosa)

---

<div align="center">

**[⭐ Star this repo](https://github.com/NicolasVenosa/piperobs-v2)** if you find it useful!

</div>
