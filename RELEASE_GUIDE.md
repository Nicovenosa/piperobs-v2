# 🚀 Guía de Publicación — PiperObs v2

## Paso 1: Crear el repositorio en GitHub

1. Andá a https://github.com/new
2. Nombre del repo: `piperobs-v2`
3. Dejalo **Público**
4. NO agregues README, .gitignore ni LICENSE (ya los tenemos)
5. Click en **Create repository**

## Paso 2: Subir el código

```bash
cd /home/zeroox/proyectos-tts/piperobs-v2
git init
git add .
git commit -m "Initial release v2.1.0"
git branch -M main
git remote add origin https://github.com/NicolasVenosa/piperobs-v2.git
git push -u origin main
```

## Paso 3: Crear un Release de GitHub

1. Andá a tu repo en GitHub → **Releases** → **Create a new release**
2. Click en **Choose a tag** → escribí `2.1.0` → **Create new tag**
3. Release title: `v2.1.0`
4. Description: copiá esto:

```markdown
## PiperObs v2.1.0

### Features
- Local TTS with Piper (offline after setup)
- Karaoke word highlighting (editor mode)
- Adaptive Pomodoro timer
- 5 color themes (Gold, Cyan, Magenta, Green, Orange)
- Voice manager with download/delete
- Volume & speed controls
- Focus mode
- MiniPlayer with waveform
- Gapless playback

### First-time setup
The plugin will auto-download Piper binary and default voice on first use.
```

5. Adjuntá estos 3 archivos como binaries (drag & drop):
   - `main.js`
   - `styles.css`
   - `manifest.json`

6. Click en **Publish release**

## Paso 4: Publicar en Obsidian Community Plugins

1. Hacé fork de: https://github.com/obsidianmd/obsidian-releases
2. Clonalo localmente:

```bash
git clone https://github.com/TU_USUARIO/obsidian-releases.git
cd obsidian-releases
```

3. Editá el archivo `community-plugins.json` y agregá esto al final del array (antes del último `]`):

```json
,
  {
    "id": "piperobs-v2",
    "name": "PiperObs v2",
    "author": "Nicolas Venosa",
    "description": "Local TTS with karaoke highlight, Pomodoro, and 5 themes. Offline voice synthesis using Piper.",
    "repo": "NicolasVenosa/piperobs-v2",
    "branch": "main"
  }
```

**IMPORTANTE:** La coma antes del objeto es necesaria si no es el último elemento.

4. Commiteá y pusheá:

```bash
git add community-plugins.json
git commit -m "Add PiperObs v2 plugin"
git push origin master
```

5. Andá a tu fork en GitHub y creá un **Pull Request** al repo original `obsidianmd/obsidian-releases`
6. Título del PR: `Add PiperObs v2`
7. Descripción:

```markdown
# Plugin Submission: PiperObs v2

Local TTS (Text-to-Speech) plugin for Obsidian using Piper.

**Repository:** https://github.com/NicolasVenosa/piperobs-v2
**Release:** https://github.com/NicolasVenosa/piperobs-v2/releases/tag/2.1.0

## Features
- Offline voice synthesis (Piper TTS)
- Karaoke word highlighting
- Adaptive Pomodoro timer
- 5 color themes
- Voice manager
- Volume & speed controls
- Focus mode

## Checklist
- [x] I have read the submission guidelines
- [x] My plugin works on Obsidian Desktop
- [x] I have tested my plugin on the latest Obsidian version
- [x] My repo has a release with main.js, manifest.json, and styles.css
- [x] manifest.json has id, name, version, minAppVersion, description, author, isDesktopOnly
```

8. Esperá a que los maintainers de Obsidian aprueben el PR (tarda entre 1-7 días)

## Paso 5: Post-publicación

- Cuando aprueben el PR, tu plugin aparecerá en **Settings → Community Plugins → Browse** de Obsidian
- Agregá screenshots/GIFs al README.md de tu repo para más impacto
- Respondé a issues y reviews de usuarios

## ⚠️ Notas importantes

- **Desktop only:** El plugin usa `child_process` (spawn) para ejecutar Piper, por eso `isDesktopOnly: true`
- **No commitees `node_modules/`**: ya está en `.gitignore`
- **Mantené `main.js` y `styles.css` actualizados** en cada release
- **Versionado:** Usá Semantic Versioning (MAJOR.MINOR.PATCH)

## 📁 Estructura del repo

```
piperobs-v2/
├── .gitignore
├── LICENSE
├── README.md
├── esbuild.config.mjs
├── main.js              ← distribución
├── manifest.json        ← distribución
├── package.json
├── styles.css           ← distribución
├── tsconfig.json
├── src/
│   ├── main.ts
│   ├── PiperEngine.ts
│   ├── KaraokeHighlighter.ts
│   ├── TextExtractor.ts
│   ├── settings/
│   │   └── DEFAULTS.ts
│   └── views/
│       ├── SidePanel.ts
│       ├── MiniPlayer.ts
│       ├── VoiceModal.ts
│       ├── DownloadModal.ts
│       ├── AutoMagicBanner.ts
│       └── StatusBar.ts
└── assets/
    └── logo/
```

## 🔗 Links útiles

- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Obsidian Submission Requirements](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)

---

**¡Listo!** Con esto tu plugin estará publicado en el Community Plugins de Obsidian.
