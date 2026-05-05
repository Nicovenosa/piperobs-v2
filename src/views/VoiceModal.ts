import { Modal, App, setIcon } from 'obsidian';
import { InstalledVoice, FEATURED_VOICES } from '../settings/DEFAULTS';

export class VoiceModal extends Modal {
  installedVoices: InstalledVoice[] = [];
  activeTab: 'installed' | 'explore' = 'installed';

  onSetDefault: (voiceId: string) => void = () => {};
  onDeleteVoice: (voiceId: string) => void = () => {};
  onDownloadVoice: (voiceId: string) => void = () => {};

  constructor(app: App, installedVoices: InstalledVoice[]) {
    super(app);
    this.installedVoices = installedVoices;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('piperobs-modal');

    // Header
    const header = contentEl.createDiv('piperobs-modal-header');
    header.createDiv('piperobs-modal-title').setText('Gestionar voces');
    const closeBtn = header.createEl('button', { cls: 'piperobs-modal-close', text: '✕' });
    closeBtn.onclick = () => this.close();

    // Tabs
    const tabs = contentEl.createDiv('piperobs-modal-tabs');
    const tabInst = tabs.createEl('button', { cls: 'piperobs-modal-tab active', text: 'Instaladas' });
    const tabExplore = tabs.createEl('button', { cls: 'piperobs-modal-tab', text: 'Explorar voces' });

    const body = contentEl.createDiv('piperobs-modal-body');

    const renderInstalled = () => {
      body.empty();

      const count = this.installedVoices.length;
      const totalMB = this.installedVoices.reduce((s, v) => s + v.sizeMB, 0);
      body.createDiv('piperobs-section-label').setText(`${count} voz${count !== 1 ? 'es' : ''} instalada${count !== 1 ? 's' : ''} · ${totalMB} MB`);

      this.installedVoices.forEach(voice => {
        const row = body.createDiv('piperobs-voice-row installed');

        row.createSpan('piperobs-voice-flag').setText(voice.flag);

        const info = row.createDiv('piperobs-voice-info');
        info.createDiv('piperobs-voice-name').setText(voice.name);
        const meta = info.createDiv('piperobs-voice-meta');
        meta.setText(`${voice.language} · ${voice.gender === 'femenina' ? 'Femenina' : 'Masculina'} · ${voice.sizeMB} MB`);

        const badge = row.createEl('span');
        if (voice.isDefault) {
          badge.className = 'piperobs-badge def';
          badge.setText('Default');
        } else {
          badge.className = 'piperobs-badge inst';
          badge.setText('Instalada');
          const delBtn = row.createEl('button', { cls: 'piperobs-btn-delete', text: '⊖' });
          delBtn.onclick = () => this.onDeleteVoice(voice.id);
        }
      });

      body.createDiv('piperobs-divider');

      // Other available voices
      body.createDiv('piperobs-section-label').setText('Otras voces disponibles');

      const toShow = FEATURED_VOICES.filter(f => !this.installedVoices.find(v => v.id === f.id));
      toShow.forEach(featured => {
        const row = body.createDiv('piperobs-voice-row');

        row.createSpan('piperobs-voice-flag').setText(featured.flag);

        const info = row.createDiv('piperobs-voice-info');
        info.createDiv('piperobs-voice-name').setText(featured.name);
        const meta = info.createDiv('piperobs-voice-meta');
        meta.setText(`${featured.language} · ${featured.gender === 'femenina' ? 'Femenina' : 'Masculina'} · ${featured.sizeMB} MB`);

        const dlBtn = row.createEl('button', { cls: 'piperobs-btn-download' });
        dlBtn.setText(`⬇ ${featured.sizeMB} MB`);
        dlBtn.onclick = () => {
          this.onDownloadVoice(featured.id);
          this.close();
        };
      });

      body.createDiv('piperobs-storage-bar').innerHTML = `<span>Espacio usado</span><span>${totalMB} MB</span>`;
    };

    const renderExplore = () => {
      body.empty();

      // Search
      const searchWrap = body.createDiv('piperobs-search-wrap');
      const searchIcon = searchWrap.createSpan();
      searchIcon.setText('⌕');
      searchIcon.style.color = 'rgba(255,255,255,0.25)';
      const searchInput = searchWrap.createEl('input', { placeholder: 'Buscar por nombre o idioma...' });

      // Filters
      const filterRow = body.createDiv('piperobs-filters');
      const langs = [
        { code: 'es', label: '🇪🇸 Español' },
        { code: 'pt', label: '🇧🇷 Portugués' },
        { code: 'en', label: '🇺🇸 Inglés' },
        { code: 'de', label: '🇩🇪 Alemán' },
        { code: 'fr', label: '🇫🇷 Francés' },
        { code: 'masculina', label: 'Masculina' },
        { code: 'femenina', label: 'Femenina' },
      ];
      let activeFilters: Set<string> = new Set();

      const applyFiltersAndSearch = () => {
        const query = searchInput.value.toLowerCase();
        const rows = body.querySelectorAll('.piperobs-voice-row[data-voice-id]');
        rows.forEach((row: any) => {
          const text = (row.textContent || '').toLowerCase();
          const matches = query === '' || text.includes(query);
          const lang = row.dataset.lang || '';
          const gender = row.dataset.gender || '';
          const filterMatch = activeFilters.size === 0 ||
            [...activeFilters].some(f => f === lang || f === gender);
          row.style.display = matches && filterMatch ? 'flex' : 'none';
        });
      };

      langs.forEach(l => {
        const chip = filterRow.createEl('button', { cls: 'piperobs-filter-chip', text: l.label });
        chip.onclick = () => {
          if (activeFilters.has(l.code)) activeFilters.delete(l.code);
          else activeFilters.add(l.code);
          chip.classList.toggle('active', activeFilters.has(l.code));
          applyFiltersAndSearch();
        };
      });

      searchInput.addEventListener('input', applyFiltersAndSearch);

      // Featured voices
      body.createDiv('piperobs-section-label').setText('Destacadas');
      FEATURED_VOICES.forEach(f => {
        const installed = this.installedVoices.find(v => v.id === f.id);
        const row = body.createDiv('piperobs-voice-row');
        row.setAttribute('data-voice-id', f.id);
        row.setAttribute('data-lang', f.language.toLowerCase().includes('español') ? 'es' :
          f.language.toLowerCase().includes('portugu') ? 'pt' : f.language.toLowerCase().includes('english') ? 'en' : '');
        row.setAttribute('data-gender', f.gender);

        row.createSpan('piperobs-voice-flag').setText(f.flag);
        const info = row.createDiv('piperobs-voice-info');
        info.createDiv('piperobs-voice-name').setText(f.name);
        const meta = info.createDiv('piperobs-voice-meta');
        meta.setText(`${f.language} · ${f.gender === 'femenina' ? 'Femenina' : 'Masculina'} · ${f.sizeMB} MB`);

        if (installed) {
          const badge = row.createEl('span', { cls: 'piperobs-badge inst', text: 'Instalada' });
        } else {
          const dlBtn = row.createEl('button', { cls: 'piperobs-btn-download' });
          dlBtn.setText(`⬇ ${f.sizeMB} MB`);
          dlBtn.onclick = () => {
            this.onDownloadVoice(f.id);
            this.close();
          };
        }
      });

      // Catalog section
      body.createDiv('piperobs-divider');
      body.createDiv('piperobs-section-label').setText('Catálogo completo · 150+ voces');

      const catalogSection = body.createDiv();
      let catalogOffset = 0;
      const PAGE_SIZE = 20;

      const loadCatalog = () => {
        // Fetch from Hugging Face API
        fetch('https://huggingface.co/api/models/rhasspy/piper-voices')
          .then(r => r.json())
          .then(data => {
            const siblings = data.siblings || [];
            const voices = siblings
              .filter((s: any) => s.rfilename.endsWith('.onnx') && !s.rfilename.includes('/samples/'))
              .map((s: any) => {
                const parts = s.rfilename.split('/');
                const voiceId = parts[parts.length - 1].replace('.onnx', '');
                const qual = parts[parts.length - 2] || 'medium';
                const name = parts[parts.length - 3] || voiceId;
                const region = parts[parts.length - 4] || '';
                const lang = parts[parts.length - 5] || parts[0] || '';

                let flag = '';
                const fl: Record<string, string> = { es: '🇪🇸', en: '🇺🇸', pt: '🇧🇷', de: '🇩🇪', fr: '🇫🇷', it: '🇮🇹', ja: '🇯🇵', zh: '🇨🇳', ko: '🇰🇷', ru: '🇷🇺' };
                flag = fl[lang] || '🌐';

                const langM: Record<string, string> = { es: 'Español', en: 'English', pt: 'Português', de: 'Deutsch', fr: 'Français', it: 'Italiano', ja: '日本語', zh: '中文', ko: '한국어', ru: 'Русский' };
                const language = langM[lang] || lang;

                return { id: voiceId, name, flag, language, quality: qual, sizeMB: qual === 'low' ? 8 : 63 };
              });

            // Remove duplicates
            const seen = new Set();
            const unique = voices.filter((v: any) => {
              const k = v.id;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });

            // Paginate
            const page = unique.slice(catalogOffset, catalogOffset + PAGE_SIZE);
            catalogOffset += PAGE_SIZE;

            page.forEach((v: any) => {
              const installed = this.installedVoices.find(vi => vi.id === v.id);
              const row = catalogSection.createDiv('piperobs-voice-row');
              row.setAttribute('data-voice-id', v.id);
              row.setAttribute('data-lang', v.language.toLowerCase());
              row.setAttribute('data-gender', '');

              row.createSpan('piperobs-voice-flag').setText(v.flag);
              const info = row.createDiv('piperobs-voice-info');
              info.createDiv('piperobs-voice-name').setText(v.name);
              info.createDiv('piperobs-voice-meta').setText(`${v.language} · ${v.quality} · ${v.sizeMB} MB`);

              if (installed) {
                row.createEl('span', { cls: 'piperobs-badge inst', text: 'Instalada' });
              } else {
                const dlBtn = row.createEl('button', { cls: 'piperobs-btn-download' });
                dlBtn.setText(`⬇ ${v.sizeMB} MB`);
                dlBtn.onclick = () => {
                  this.onDownloadVoice(v.id);
                  this.close();
                };
              }
            });

            // Update or remove "Cargar más" button
            const existingBtn = body.querySelector('.piperobs-catalog-more');
            if (existingBtn) existingBtn.remove();

            if (catalogOffset < unique.length) {
              const moreBtn = body.createEl('button', { cls: 'piperobs-catalog-more' });
              moreBtn.setText('Cargar más voces →');
              moreBtn.style.cssText = 'width:100%;background:transparent;border:0.5px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);border-radius:8px;padding:9px;font-size:12px;cursor:pointer;margin-top:10px';
              moreBtn.onclick = loadCatalog;
            }
          })
          .catch(() => {
            const err = catalogSection.createDiv();
            err.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.3);text-align:center;padding:12px';
            err.setText('Error cargando catálogo. Verificá tu conexión.');
          });
      };

      loadCatalog();
    };

    tabInst.onclick = () => {
      this.activeTab = 'installed';
      tabInst.classList.add('active');
      tabExplore.classList.remove('active');
      renderInstalled();
    };

    tabExplore.onclick = () => {
      this.activeTab = 'explore';
      tabExplore.classList.add('active');
      tabInst.classList.remove('active');
      renderExplore();
    };

    renderInstalled();
  }
}
