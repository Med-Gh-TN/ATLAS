/**
 * assets.js — Academic Asset Generation Engine (v1.1)
 *
 * Responsibilities:
 * • REST API communication with /api/v1/assets/* endpoints.
 * • Asset manifest fetching (cache-badge rendering on buttons).
 * • Flashcard renderer: 3D CSS flip, keyboard navigation, progress bar.
 * • Mindmap renderer: Mermaid.js v10 injection and pan/zoom.
 * • Exam renderer: MCQ radio form + written textarea + scoring engine.
 * • Summary renderer: Structured executive overview.
 * • Modal lifecycle management (open, close, tab switching).
 *
 * Dependencies: STATE (state.js), lucide icons, Mermaid.js (CDN in index.html).
 * Called by: app.js (onDocumentChange), inline button onclick handlers.
 */
const ASSETS = (() => {

    // ── API Layer ──────────────────────────────────────────────────────────────
    const API = {
        base: () => `${window.location.protocol}//${window.location.host}`,

        async manifest(documentUuid) {
            const res = await fetch(`${API.base()}/api/v1/assets/${documentUuid}/manifest`);
            if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
            return (await res.json()).data?.manifest || [];
        },

        async getAsset(documentUuid, type) {
            const res = await fetch(`${API.base()}/api/v1/assets/${documentUuid}?type=${type}`);
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`Asset fetch failed: ${res.status}`);
            return (await res.json()).data;
        },

        async generate(documentUuid, assetType, forceRegenerate = false) {
            const res = await fetch(`${API.base()}/api/v1/assets/generate`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    document_uuid:    documentUuid,
                    asset_type:       assetType,
                    force_regenerate: forceRegenerate,
                }),
            });
            const json = await res.json();
            if (!json.ok) throw new Error(json.error || 'Generation failed');
            return json.data;
        },

        async deleteAsset(documentUuid, type) {
            const res = await fetch(
                `${API.base()}/api/v1/assets/${documentUuid}?type=${type}`,
                { method: 'DELETE' }
            );
            return (await res.json()).data;
        },
    };

    // ── DOM Helpers ────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);

    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Manifest / Cache Badge Management ─────────────────────────────────────

    async function refreshManifest(documentUuid) {
        if (!documentUuid || documentUuid === 'global') {
            STATE.get().ui.assetManifest = [];
            _updateCacheBadges([]);
            return;
        }
        try {
            const manifest = await API.manifest(documentUuid);
            STATE.get().ui.assetManifest = manifest;
            _updateCacheBadges(manifest);
        } catch (e) {
            STATE.get().ui.assetManifest = [];
            _updateCacheBadges([]);
        }
    }

    function _updateCacheBadges(manifest) {
        const cachedTypes = new Set(manifest.map(m => m.asset_type));
        // Added 'summary' to the list
        ['flashcards', 'mindmap', 'exam', 'summary'].forEach(type => {
            const btn = $(`asset-btn-${type}`);
            if (!btn) return;
            const badge = btn.querySelector('.cache-badge');
            if (badge) {
                if (cachedTypes.has(type)) {
                    badge.className = 'cache-badge absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50';
                    badge.title = 'Cached — instant load';
                } else {
                    badge.className = 'cache-badge absolute -top-1 -right-1 w-2 h-2 rounded-full bg-transparent';
                    badge.title = '';
                }
            }
        });
    }

    // ── Modal Lifecycle ────────────────────────────────────────────────────────

    function openModal(type) {
        const modal = $('assetModal');
        if (!modal) return;
        STATE.get().ui.assetModal.isOpen  = true;
        STATE.get().ui.assetModal.activeTab = type;
        STATE.get().ui.assetModal.error   = null;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        // Trigger animation
        requestAnimationFrame(() => {
            modal.querySelector('.asset-modal-inner')?.classList.add('modal-visible');
        });
        // Switch to the correct tab
        switchTab(type);
    }

    function closeModal() {
        const modal = $('assetModal');
        if (!modal) return;
        const inner = modal.querySelector('.asset-modal-inner');
        if (inner) inner.classList.remove('modal-visible');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            STATE.get().ui.assetModal.isOpen = false;
        }, 280);
    }

    function switchTab(type) {
        STATE.get().ui.assetModal.activeTab = type;
        // Tab button styles (Added 'summary')
        ['flashcards', 'mindmap', 'exam', 'summary'].forEach(t => {
            const btn = $(`tab-${t}`);
            if (!btn) return;
            if (t === type) {
                btn.className = btn.className.replace('tab-inactive', 'tab-active');
                btn.classList.add('tab-active');
                btn.classList.remove('tab-inactive');
            } else {
                btn.classList.remove('tab-active');
                btn.classList.add('tab-inactive');
            }
        });
        // Show/hide panels (Added 'summary')
        ['flashcards', 'mindmap', 'exam', 'summary'].forEach(t => {
            const panel = $(`panel-${t}`);
            if (panel) panel.classList.toggle('hidden', t !== type);
        });
    }

    // ── Unified Load & Render Entry Point ──────────────────────────────────────

    async function loadAndRender(type, forceRegenerate = false) {
        const docId = STATE.get().ui.selectedDocumentId;
        if (!docId || docId === 'global') {
            showError('Please select a specific document from the Vault Selector first.');
            return;
        }
        openModal(type);
        _setLoading(type, true);

        try {
            let result;
            // Try cache first (GET), then generate (POST) if miss
            if (!forceRegenerate) {
                result = await API.getAsset(docId, type);
            }
            if (!result) {
                result = await API.generate(docId, type, forceRegenerate);
            }
            if (!result) throw new Error('No content returned from API.');

            _setLoading(type, false);
            const content = result.content || result;

            if (type === 'flashcards') renderFlashcards(content);
            if (type === 'mindmap')    await renderMindmap(content);
            if (type === 'exam')       renderExam(content);
            if (type === 'summary')    renderSummary(content, document.querySelector('#panel-summary .asset-content'));

            // Refresh manifest to update cache badges
            await refreshManifest(docId);

        } catch (err) {
            _setLoading(type, false);
            showError(err.message || 'An unexpected error occurred.');
            console.error('[ASSETS]', err);
        }
    }

    function _setLoading(type, isLoading) {
        STATE.get().ui.assetModal.isLoading = isLoading;
        const panel = $(`panel-${type}`);
        if (!panel) return;
        const loader = panel.querySelector('.asset-loader');
        const content = panel.querySelector('.asset-content');
        if (loader)  loader.classList.toggle('hidden', !isLoading);
        if (content) content.classList.toggle('hidden', isLoading);
    }

    function showError(msg) {
        STATE.get().ui.assetModal.error = msg;
        const errEl = $('assetError');
        if (errEl) {
            errEl.textContent = msg;
            errEl.classList.remove('hidden');
            setTimeout(() => errEl.classList.add('hidden'), 7000);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FLASHCARD RENDERER
    // ══════════════════════════════════════════════════════════════════════════

    function renderFlashcards(data) {
        const cards = data?.cards || data || [];
        if (!cards.length) {
            showError('No flashcards were generated. Try regenerating.');
            return;
        }

        const s = STATE.get().ui.assets.flashcards;
        s.data         = { cards, count: cards.length };
        s.currentIndex = 0;
        s.isFlipped    = false;

        _buildFlashcardUI(cards);
    }

    function _buildFlashcardUI(cards) {
        const content = document.querySelector('#panel-flashcards .asset-content');
        if (!content) return;

        content.innerHTML = `
            <div class="flex items-center justify-between mb-4 px-1">
                <span class="font-mono text-[10px] text-chrome-faint">CARD <span id="fc-current">1</span> / ${cards.length}</span>
                <div class="flex-1 mx-4 h-1 bg-void-200 rounded-full overflow-hidden">
                    <div id="fc-progress-bar" class="h-full bg-plasma-DEFAULT rounded-full transition-all duration-500" style="width:${(1/cards.length*100).toFixed(1)}%"></div>
                </div>
                <span class="font-mono text-[9px] text-chrome-faint">Click card to flip</span>
            </div>

            <div class="card-scene mx-auto" style="width:100%;max-width:560px;height:280px;perspective:1200px">
                <div id="fc-card" onclick="ASSETS.flipCard()" class="card-3d relative w-full h-full cursor-pointer" style="transform-style:preserve-3d;transition:transform 0.55s cubic-bezier(0.23,1,0.32,1)">
                    <div class="card-face card-front absolute inset-0 rounded-2xl flex flex-col items-center justify-center p-8 text-center"
                         style="backface-visibility:hidden;background:linear-gradient(135deg,#ffffff 0%,#f0f9ff 100%);border:1.5px solid #bae6fd;box-shadow:0 8px 32px rgba(2,132,199,0.08),0 2px 8px rgba(0,0,0,0.04)">
                        <div class="absolute top-4 left-5 font-mono text-[8px] text-plasma-DEFAULT/60 tracking-widest uppercase">Question</div>
                        <p id="fc-front" class="text-chrome-light text-[15px] font-medium leading-relaxed" style="font-family:'IBM Plex Sans',sans-serif"></p>
                    </div>
                    <div class="card-face card-back absolute inset-0 rounded-2xl flex flex-col items-center justify-center p-8 text-center"
                         style="backface-visibility:hidden;transform:rotateY(180deg);background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border:1.5px solid #86efac;box-shadow:0 8px 32px rgba(22,163,74,0.08),0 2px 8px rgba(0,0,0,0.04)">
                        <div class="absolute top-4 left-5 font-mono text-[8px] text-lattice-DEFAULT/60 tracking-widest uppercase">Answer</div>
                        <p id="fc-back" class="text-chrome-light text-[13.5px] leading-relaxed" style="font-family:'IBM Plex Sans',sans-serif"></p>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-center gap-4 mt-6">
                <button onclick="ASSETS.prevCard()"
                    class="flex items-center gap-2 px-5 py-2.5 rounded-lg font-mono text-[11px] text-chrome-DEFAULT bg-void-50 border border-void-200 hover:bg-void-100 transition-all active:scale-95">
                    <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Prev
                </button>
                <button onclick="ASSETS.shuffleCards()"
                    class="flex items-center gap-2 px-5 py-2.5 rounded-lg font-mono text-[11px] text-chrome-DEFAULT bg-void-50 border border-void-200 hover:bg-void-100 transition-all active:scale-95">
                    <i data-lucide="shuffle" class="w-3.5 h-3.5"></i> Shuffle
                </button>
                <button onclick="ASSETS.nextCard()"
                    class="flex items-center gap-2 px-5 py-2.5 rounded-lg font-mono text-[11px] text-plasma-dim bg-plasma-soft border border-plasma-DEFAULT/20 hover:bg-plasma-DEFAULT/15 transition-all active:scale-95">
                    Next <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                </button>
            </div>

            <div class="flex justify-center mt-4">
                <button onclick="ASSETS.regenerate('flashcards')"
                    class="font-mono text-[9px] text-chrome-faint hover:text-crimson-heat transition-colors flex items-center gap-1">
                    <i data-lucide="refresh-cw" class="w-3 h-3"></i> Regenerate
                </button>
            </div>
        `;
        lucide.createIcons({ nodes: [content] });
        _updateFlashcard();
    }

    function _updateFlashcard() {
        const s     = STATE.get().ui.assets.flashcards;
        const cards = s.data?.cards || [];
        if (!cards.length) return;
        const idx  = s.currentIndex;
        const card = cards[idx];

        const frontEl = $('fc-front');
        const backEl  = $('fc-back');
        const cardEl  = $('fc-card');
        const current = $('fc-current');
        const bar     = $('fc-progress-bar');

        if (frontEl) frontEl.textContent = card.front || '';
        if (backEl)  backEl.textContent  = card.back  || '';
        if (current) current.textContent = String(idx + 1);
        if (bar)     bar.style.width     = `${((idx + 1) / cards.length) * 100}%`;

        // Reset flip on card change
        s.isFlipped = false;
        if (cardEl) cardEl.style.transform = 'rotateY(0deg)';
    }

    function flipCard() {
        const s      = STATE.get().ui.assets.flashcards;
        const cardEl = $('fc-card');
        if (!cardEl) return;
        s.isFlipped = !s.isFlipped;
        cardEl.style.transform = s.isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
    }

    function nextCard() {
        const s     = STATE.get().ui.assets.flashcards;
        const total = s.data?.cards?.length || 0;
        if (!total) return;
        s.currentIndex = (s.currentIndex + 1) % total;
        _updateFlashcard();
    }

    function prevCard() {
        const s     = STATE.get().ui.assets.flashcards;
        const total = s.data?.cards?.length || 0;
        if (!total) return;
        s.currentIndex = (s.currentIndex - 1 + total) % total;
        _updateFlashcard();
    }

    function shuffleCards() {
        const s = STATE.get().ui.assets.flashcards;
        if (!s.data?.cards) return;
        // Fisher-Yates
        const arr = [...s.data.cards];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        s.data = { cards: arr, count: arr.length };
        s.currentIndex = 0;
        s.isFlipped    = false;
        _updateFlashcard();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MINDMAP RENDERER
    // ══════════════════════════════════════════════════════════════════════════

    async function renderMindmap(data) {
        const mermaidCode = data?.mermaid || data || '';
        if (!mermaidCode.trim()) {
            showError('No mindmap was generated. Try regenerating.');
            return;
        }

        STATE.get().ui.assets.mindmap.data = { mermaid: mermaidCode };

        const content = document.querySelector('#panel-mindmap .asset-content');
        if (!content) return;

        content.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <span class="panel-label">Knowledge Map</span>
                <div class="flex items-center gap-2">
                    <button onclick="ASSETS.downloadMindmap()"
                        class="font-mono text-[9px] text-chrome-faint hover:text-plasma-dim transition-colors flex items-center gap-1">
                        <i data-lucide="download" class="w-3 h-3"></i> SVG
                    </button>
                    <button onclick="ASSETS.regenerate('mindmap')"
                        class="font-mono text-[9px] text-chrome-faint hover:text-crimson-heat transition-colors flex items-center gap-1">
                        <i data-lucide="refresh-cw" class="w-3 h-3"></i> Regenerate
                    </button>
                </div>
            </div>
            <div id="mermaid-container"
                 class="w-full rounded-xl border border-void-200 bg-void-50 overflow-auto flex items-center justify-center"
                 style="min-height:380px;max-height:520px">
                <div id="mermaid-target" class="p-4"></div>
            </div>
        `;
        lucide.createIcons({ nodes: [content] });

        // Render Mermaid
        try {
            if (typeof mermaid === 'undefined') {
                throw new Error('Mermaid.js not loaded. Check CDN script in index.html.');
            }
            mermaid.initialize({
                startOnLoad: false,
                theme:       'base',
                themeVariables: {
                    primaryColor:   '#e0f2fe',
                    primaryBorderColor: '#0284c7',
                    primaryTextColor: '#0f172a',
                    lineColor:       '#94a3b8',
                    background:      '#ffffff',
                    nodeBorder:      '#0284c7',
                    fontFamily:      'IBM Plex Mono, monospace',
                },
            });
            const { svg } = await mermaid.render('mermaid-render', mermaidCode);
            const target  = $('mermaid-target');
            if (target) {
                target.innerHTML = svg;
                // Scale SVG to fill container
                const svgEl = target.querySelector('svg');
                if (svgEl) {
                    svgEl.style.maxWidth = '100%';
                    svgEl.style.height   = 'auto';
                }
                STATE.get().ui.assets.mindmap.rendered = true;
            }
        } catch (err) {
            const target = $('mermaid-target');
            if (target) {
                target.innerHTML = `
                    <div class="text-center py-8">
                        <p class="font-mono text-[11px] text-crimson-heat mb-3">Render error: ${escHtml(err.message)}</p>
                        <pre class="text-left text-[10px] text-chrome-faint bg-void-100 p-4 rounded-lg overflow-auto max-h-48">${escHtml(mermaidCode)}</pre>
                    </div>
                `;
            }
            console.error('[ASSETS] Mermaid render error:', err, '\nCode:', mermaidCode);
        }
    }

    function downloadMindmap() {
        const svgEl = document.querySelector('#mermaid-target svg');
        if (!svgEl) { showError('Nothing to download yet.'); return; }
        const svgStr  = new XMLSerializer().serializeToString(svgEl);
        const blob    = new Blob([svgStr], { type: 'image/svg+xml' });
        const url     = URL.createObjectURL(blob);
        const a       = document.createElement('a');
        a.href        = url;
        a.download    = 'mindmap.svg';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // EXAM RENDERER
    // ══════════════════════════════════════════════════════════════════════════

    function renderExam(data) {
        const mcq     = data?.mcq     || [];
        const written = data?.written || [];
        if (!mcq.length && !written.length) {
            showError('No exam questions were generated. Try regenerating.');
            return;
        }

        const s     = STATE.get().ui.assets.exam;
        s.data      = { mcq, written };
        s.answers   = {};
        s.writtenAnswers = {};
        s.submitted = false;
        s.score     = null;

        const content = document.querySelector('#panel-exam .asset-content');
        if (!content) return;

        const mcqHtml = mcq.map((q, i) => `
            <div class="exam-question mb-6 p-5 rounded-xl border border-void-200 bg-white shadow-sm" data-qi="${i}">
                <div class="flex items-start gap-3 mb-4">
                    <span class="shrink-0 w-7 h-7 rounded-full bg-plasma-soft border border-plasma-DEFAULT/20 flex items-center justify-center font-mono text-[10px] text-plasma-dim font-semibold">${i + 1}</span>
                    <p class="text-chrome-light text-[13.5px] leading-relaxed font-medium">${escHtml(q.question)}</p>
                </div>
                <div class="space-y-2 ml-10">
                    ${Object.entries(q.options || {}).map(([letter, text]) => `
                        <label class="exam-option flex items-start gap-3 p-3 rounded-lg border border-void-200 cursor-pointer hover:bg-void-50 hover:border-plasma-DEFAULT/30 transition-all duration-150 group" data-qi="${i}" data-letter="${letter}">
                            <input type="radio" name="mcq-${i}" value="${letter}" onchange="ASSETS.selectAnswer(${i}, '${letter}')"
                                   class="mt-0.5 accent-[#0284c7] shrink-0">
                            <div class="flex items-start gap-2 flex-1">
                                <span class="font-mono text-[10px] font-semibold text-plasma-dim shrink-0 mt-0.5">${letter}.</span>
                                <span class="text-[13px] text-chrome-DEFAULT leading-relaxed">${escHtml(text)}</span>
                            </div>
                        </label>
                    `).join('')}
                </div>
                <div id="explanation-${i}" class="hidden mt-3 ml-10 p-3 rounded-lg bg-void-50 border border-void-200">
                    <p class="font-mono text-[9px] text-chrome-faint uppercase tracking-wider mb-1">Explanation</p>
                    <p class="text-[12.5px] text-chrome-DEFAULT leading-relaxed">${escHtml(q.explanation || '')}</p>
                </div>
            </div>
        `).join('');

        const writtenHtml = written.length ? `
            <div class="mt-8 mb-3 pb-2 border-b border-void-200">
                <h3 class="font-mono text-[10px] text-chrome-faint uppercase tracking-wider">Part II — Open Questions</h3>
            </div>
            ${written.map((q, i) => `
                <div class="exam-question mb-6 p-5 rounded-xl border border-void-200 bg-white shadow-sm">
                    <div class="flex items-start gap-3 mb-3">
                        <span class="shrink-0 w-7 h-7 rounded-full bg-lattice-glow border border-lattice-DEFAULT/20 flex items-center justify-center font-mono text-[10px] text-lattice-dim font-semibold">${i + 1}</span>
                        <p class="text-chrome-light text-[13.5px] leading-relaxed font-medium">${escHtml(q.question)}</p>
                    </div>
                    <div class="ml-10">
                        <textarea id="written-${i}" onchange="ASSETS.setWrittenAnswer(${i}, this.value)" oninput="ASSETS.setWrittenAnswer(${i}, this.value)"
                            rows="4" placeholder="Your answer..."
                            class="w-full bg-void-50 border border-void-200 rounded-lg px-4 py-3 text-[13px] text-chrome-DEFAULT font-sans resize-none focus:outline-none focus:border-lattice-DEFAULT focus:bg-white transition-all"
                        ></textarea>
                    </div>
                    <div id="written-model-${i}" class="hidden mt-3 ml-10 p-4 rounded-lg bg-lattice-glow/30 border border-lattice-DEFAULT/20">
                        <p class="font-mono text-[9px] text-lattice-dim uppercase tracking-wider mb-2">Model Answer</p>
                        <p class="text-[13px] text-chrome-DEFAULT leading-relaxed">${escHtml(q.model_answer || '')}</p>
                    </div>
                </div>
            `).join('')}
        ` : '';

        content.innerHTML = `
            <div class="flex items-center justify-between mb-5">
                <div>
                    <h3 class="font-sans font-semibold text-chrome-light text-[15px]">Examination</h3>
                    <p class="font-mono text-[9px] text-chrome-faint mt-0.5">${mcq.length} QCM &nbsp;·&nbsp; ${written.length} Open Questions</p>
                </div>
                <div class="flex items-center gap-2">
                    <div id="exam-score-display" class="hidden px-3 py-1.5 rounded-lg bg-lattice-glow border border-lattice-DEFAULT/20 font-mono text-[11px] text-lattice-dim font-semibold"></div>
                    <button onclick="ASSETS.regenerate('exam')"
                        class="font-mono text-[9px] text-chrome-faint hover:text-crimson-heat transition-colors flex items-center gap-1">
                        <i data-lucide="refresh-cw" class="w-3 h-3"></i> Regenerate
                    </button>
                </div>
            </div>

            <div id="exam-mcq-section">
                <div class="mb-3 pb-2 border-b border-void-200">
                    <h3 class="font-mono text-[10px] text-chrome-faint uppercase tracking-wider">Part I — Multiple Choice (QCM)</h3>
                </div>
                ${mcqHtml}
            </div>

            ${writtenHtml}

            <div class="flex justify-center mt-8 gap-3">
                <button onclick="ASSETS.submitExam()"
                    class="px-8 py-3 rounded-xl font-sans font-semibold text-sm text-white bg-plasma-DEFAULT hover:bg-plasma-dim active:scale-95 transition-all shadow-md shadow-plasma-DEFAULT/20">
                    Submit &amp; Score
                </button>
                <button onclick="ASSETS.resetExam()"
                    class="px-6 py-3 rounded-xl font-sans text-sm text-chrome-DEFAULT bg-void-100 border border-void-200 hover:bg-void-200 transition-all">
                    Reset
                </button>
            </div>
        `;
        lucide.createIcons({ nodes: [content] });
    }

    function selectAnswer(questionIndex, letter) {
        STATE.get().ui.assets.exam.answers[questionIndex] = letter;
    }

    function setWrittenAnswer(questionIndex, text) {
        STATE.get().ui.assets.exam.writtenAnswers[questionIndex] = text;
    }

    function submitExam() {
        const s   = STATE.get().ui.assets.exam;
        if (!s.data) return;

        const { mcq, written } = s.data;
        s.submitted = true;

        // Score MCQ
        let correct = 0;
        mcq.forEach((q, i) => {
            const userAnswer = s.answers[i];
            const isCorrect  = userAnswer === q.answer;
            if (isCorrect) correct++;

            // Colour-code options
            document.querySelectorAll(`label[data-qi="${i}"]`).forEach(label => {
                const letter = label.dataset.letter;
                label.classList.remove('hover:bg-void-50', 'hover:border-plasma-DEFAULT/30');
                if (letter === q.answer) {
                    label.classList.add('bg-emerald-50', 'border-emerald-300');
                } else if (letter === userAnswer && userAnswer !== q.answer) {
                    label.classList.add('bg-red-50', 'border-red-300');
                }
                // Disable radio
                const radio = label.querySelector('input[type=radio]');
                if (radio) radio.disabled = true;
            });

            // Show explanation
            const expEl = $(`explanation-${i}`);
            if (expEl) expEl.classList.remove('hidden');
        });

        // Show written model answers
        written.forEach((q, i) => {
            const modelEl = $(`written-model-${i}`);
            if (modelEl) modelEl.classList.remove('hidden');
            const ta = $(`written-${i}`);
            if (ta) ta.disabled = true;
        });

        // Score display
        const pct       = mcq.length ? Math.round((correct / mcq.length) * 100) : 0;
        s.score         = { correct, total: mcq.length, pct };
        const scoreDisp = $('exam-score-display');
        if (scoreDisp) {
            scoreDisp.textContent = `${correct}/${mcq.length} (${pct}%)`;
            scoreDisp.classList.remove('hidden');
            if (pct >= 80) scoreDisp.classList.add('bg-lattice-glow', 'border-lattice-DEFAULT/20', 'text-lattice-dim');
            else if (pct >= 60) scoreDisp.classList.add('bg-amber-50', 'border-amber-300/40', 'text-amber-700');
            else scoreDisp.classList.add('bg-red-50', 'border-red-300/40', 'text-red-700');
        }

        // Scroll to top of panel
        document.querySelector('#panel-exam')?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetExam() {
        const s = STATE.get().ui.assets.exam;
        if (!s.data) return;
        s.answers        = {};
        s.writtenAnswers = {};
        s.submitted      = false;
        s.score          = null;
        renderExam(s.data);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SUMMARY RENDERER
    // ══════════════════════════════════════════════════════════════════════════

    function renderSummary(data, container) {
        if (!container) return;

        if (!data || !data.overview || data.overview === "Generation failed.") {
            container.innerHTML = `
                <div class="text-center p-10">
                    <p class="text-crimson-heat text-sm font-medium mb-2">Failed to parse summary data.</p>
                    <button onclick="ASSETS.regenerate('summary')" class="px-4 py-2 bg-void-100 border border-void-200 rounded text-sm hover:bg-void-200 transition-colors">
                        Try Again
                    </button>
                </div>`;
            return;
        }

        let html = `<div class="max-w-3xl mx-auto space-y-8 p-4">`;
        
        // Overview
        html += `
            <div>
                <h3 class="text-xl font-semibold text-chrome-light border-b border-void-200 pb-2 mb-3 flex items-center gap-2">
                    <i data-lucide="book-open" class="w-5 h-5 text-plasma-DEFAULT"></i> Overview
                </h3>
                <p class="text-chrome-DEFAULT leading-relaxed text-sm">${escHtml(data.overview)}</p>
            </div>`;

        // Key Concepts
        if (data.key_concepts && data.key_concepts.length > 0) {
            html += `
            <div>
                <h3 class="text-xl font-semibold text-chrome-light border-b border-void-200 pb-2 mb-3 flex items-center gap-2">
                    <i data-lucide="key" class="w-5 h-5 text-plasma-DEFAULT"></i> Key Concepts
                </h3>
                <ul class="space-y-2">`;
            data.key_concepts.forEach(concept => {
                html += `<li class="flex gap-3 text-sm text-chrome-DEFAULT items-start">
                            <div class="mt-1 w-1.5 h-1.5 rounded-full bg-plasma-DEFAULT shrink-0"></div>
                            <span>${escHtml(concept)}</span>
                         </li>`;
            });
            html += `</ul></div>`;
        }

        // Conclusion
        if (data.conclusion) {
            html += `
            <div>
                <h3 class="text-xl font-semibold text-chrome-light border-b border-void-200 pb-2 mb-3 flex items-center gap-2">
                    <i data-lucide="flag" class="w-5 h-5 text-plasma-DEFAULT"></i> Conclusion
                </h3>
                <p class="text-chrome-DEFAULT leading-relaxed text-sm">${escHtml(data.conclusion)}</p>
            </div>`;
        }

        // Regenerate Button
        html += `
            <div class="flex justify-center mt-8 pt-4 border-t border-void-200">
                <button onclick="ASSETS.regenerate('summary')"
                    class="font-mono text-[10px] text-chrome-faint hover:text-crimson-heat transition-colors flex items-center gap-1">
                    <i data-lucide="refresh-cw" class="w-3 h-3"></i> Regenerate Summary
                </button>
            </div>
        `;

        html += `</div>`;
        container.innerHTML = html;
        lucide.createIcons({ root: container });
    }

    // ── Regenerate ────────────────────────────────────────────────────────────
    async function regenerate(type) {
        await loadAndRender(type, true);
    }

    // ── Keyboard Shortcuts ────────────────────────────────────────────────────
    function _initKeyboard() {
        document.addEventListener('keydown', e => {
            const modal = STATE.get().ui.assetModal;
            if (!modal.isOpen) return;
            if (e.key === 'Escape') { closeModal(); return; }
            if (modal.activeTab === 'flashcards') {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextCard();
                if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prevCard();
                if (e.key === ' ') { e.preventDefault(); flipCard(); }
            }
        });
    }

    // ── Public API ─────────────────────────────────────────────────────────────
    return {
        // Lifecycle
        init: _initKeyboard,

        // Manifest
        refreshManifest,

        // Modal
        open:      loadAndRender,
        close:     closeModal,
        switchTab,

        // Flashcards
        flipCard,
        nextCard,
        prevCard,
        shuffleCards,

        // Mindmap
        downloadMindmap,

        // Exam
        selectAnswer,
        setWrittenAnswer,
        submitExam,
        resetExam,

        // Cache
        regenerate,
    };
})();

window.ASSETS = ASSETS;
document.addEventListener('DOMContentLoaded', ASSETS.init);