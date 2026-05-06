/**
 * app.js — Application Controller (v2.0 — Academic Assets)
 * Wires STATE → DOM. Handles WebSocket, chat, telemetry, PAIR explainability.
 *
 * Changelog v2.0
 * ─────────────
 * • onDocumentChange: shows/hides study toolbar + fetches asset manifest.
 * • handleUploadComplete: refreshes vault + asset manifest.
 * • Asset toolbar button handlers delegated to ASSETS module.
 */
const APP = (() => {
    const $ = id => document.getElementById(id);

    const DOM = {
        chatInner:            () => $('chatInner'),
        chatScroll:           () => $('chatScroll'),
        logContainer:         () => $('logContainer'),
        queryInput:           () => $('queryInput'),
        sendBtn:              () => $('sendBtn'),
        sendLabel:            () => $('sendLabel'),
        statusDot:            () => $('statusDot'),
        statusLabel:          () => $('statusLabel'),
        docSelector:          () => $('docSelector'),
        activeDocBanner:      () => $('activeDocBanner'),
        activeDocName:        () => $('activeDocName'),
        studyToolbar:         () => $('studyToolbar'),
        streamingIndicator:   () => $('streamingIndicator'),
        inputTokenEst:        () => $('inputTokenEst'),
        ragContextIndicator:  () => $('ragContextIndicator'),
        ragTokenCount:        () => $('ragTokenCount'),
        chunkList:            () => $('chunkList'),
        ragBadge:             () => $('ragBadge'),
        queryVecStatus:       () => $('queryVecStatus'),
        topKDisplay:          () => $('topKDisplay'),
        retrievalLatency:     () => $('retrievalLatency'),
        indexSizeDisplay:     () => $('indexSizeDisplay'),
        ctxBar:               () => $('ctxBar'),
        ctxLabel:             () => $('ctxLabel'),
        uploadProgress:       () => $('uploadProgress'),
        uploadBar:            () => $('uploadBar'),
        uploadPct:            () => $('uploadPct'),
        fileInput:            () => $('fileInput'),
        dropZone:             () => $('dropZone'),
        bootMsg:              () => $('bootMsg'),
        bootTime:             () => $('bootTime'),
        spanTrace:            () => $('spanTrace'),
        mPromptTokens:        () => $('m-prompt-tokens'),
        mCompletionTokens:    () => $('m-completion-tokens'),
        mTtft:                () => $('m-ttft'),
        mTotalLatency:        () => $('m-total-latency'),
        mTotalCost:           () => $('m-total-cost'),
        mThroughput:          () => $('m-throughput'),
        tokenRatioBar:        () => $('tokenRatioBar'),
        sQueries:             () => $('s-queries'),
        sTotalTokens:         () => $('s-total-tokens'),
        sAvgLatency:          () => $('s-avg-latency'),
        sTotalCost:           () => $('s-total-cost'),
        sDocs:                () => $('s-docs'),
        sAvgTtft:             () => $('s-avg-ttft'),
        sUptime:              () => $('s-uptime'),
    };

    let ws             = null;
    let uptimeInterval = null;
    let streamBubble   = null;
    let streamRawText  = '';

    // ─── Logging ─────────────────────────────────────────────────────────────
    function log(level, msg, meta = {}) {
        const container = DOM.logContainer();
        const time      = new Date().toLocaleTimeString('en-US', { hour12: false });
        const row       = document.createElement('div');
        row.className   = `log-row ${level}`;
        const levelColors = {
            INFO:    'text-plasma-DEFAULT',
            WARN:    'text-amber-heat',
            ERROR:   'text-crimson-heat',
            SUCCESS: 'text-lattice-DEFAULT',
            DEBUG:   'text-chrome-faint',
            TRACE:   'text-void-500',
        };
        const lc     = levelColors[level] || 'text-chrome-faint';
        const metaStr = Object.keys(meta).length
            ? ' ' + Object.entries(meta)
                .map(([k, v]) => `<span class="text-chrome-faint">${k}=</span><span class="text-lattice-dim">${v}</span>`)
                .join(' ')
            : '';
        row.innerHTML = `
            <span class="text-void-500 select-none">${time}</span>
            <span class="${lc} font-semibold ml-2 select-none">[${level}]</span>
            <span class="text-chrome-DEFAULT ml-2">${msg}</span>${metaStr}
        `;
        container.appendChild(row);
        container.scrollTop = container.scrollHeight;
        const rows = container.querySelectorAll('.log-row');
        if (rows.length > 300) rows[0].remove();
    }

    // ─── Connection management ────────────────────────────────────────────────
    function connect() {
        const s = STATE.get();
        s.connection.status = 'connecting';
        updateConnectionUI('connecting');
        log('INFO', 'Establishing WebSocket connection...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

        ws.onopen = () => {
            s.connection.status     = 'connected';
            s.connection.sessionStart = Date.now();
            s.session.uptimeStart   = Date.now();
            updateConnectionUI('connected');
            DOM.sendBtn().disabled  = false;
            DOM.bootMsg().classList.remove('typing-caret');
            DOM.bootMsg().textContent = 'Secure connection established. Research vault is accessible. Upload a PDF or submit a query.';
            DOM.bootTime().textContent = new Date().toLocaleTimeString();
            uptimeInterval = setInterval(tickUptime, 1000);
            log('SUCCESS', 'WebSocket handshake complete');
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (e) {
                log('ERROR', 'Malformed message from server', { err: e.message });
            }
        };

        ws.onclose = () => {
            s.connection.status = 'disconnected';
            s.connection.reconnectAttempts++;
            updateConnectionUI('disconnected');
            DOM.sendBtn().disabled = true;
            clearInterval(uptimeInterval);
            log('WARN', 'Connection lost. Reconnecting in 3s...', { attempt: s.connection.reconnectAttempts });
            finishStream();
            setTimeout(connect, 3000);
        };

        ws.onerror = () => { log('ERROR', 'WebSocket error encountered'); };
    }

    function updateConnectionUI(status) {
        const dot   = DOM.statusDot();
        const label = DOM.statusLabel();
        if (status === 'connected') {
            dot.className     = 'w-2 h-2 rounded-full bg-lattice-DEFAULT status-live transition-all duration-500';
            label.textContent = 'CONNECTED';
            label.className   = 'font-mono text-[10px] text-lattice-DEFAULT';
        } else if (status === 'connecting') {
            dot.className     = 'w-2 h-2 rounded-full bg-amber-heat animate-pulse transition-all duration-500';
            label.textContent = 'CONNECTING';
            label.className   = 'font-mono text-[10px] text-amber-heat';
        } else {
            dot.className     = 'w-2 h-2 rounded-full bg-crimson-heat transition-all duration-500';
            label.textContent = 'DISCONNECTED';
            label.className   = 'font-mono text-[10px] text-crimson-heat';
        }
    }

    // ─── Vault Selector ───────────────────────────────────────────────────────
    async function fetchDocuments() {
        try {
            const res  = await fetch(`${window.location.protocol}//${window.location.host}/documents`);
            if (!res.ok) throw new Error('Failed to fetch documents');
            const data = await res.json();
            STATE.get().ui.documents = data.documents || [];
            renderDocSelector();
        } catch (e) {
            log('DEBUG', 'Vault Selector: Enterprise DB unavailable or empty.');
        }
    }

    function renderDocSelector() {
        const select = DOM.docSelector();
        if (!select) return;
        const docs       = STATE.get().ui.documents;
        const currentVal = STATE.get().ui.selectedDocumentId;
        select.innerHTML = '<option value="global">Global Vault (All Documents)</option>';
        docs.forEach(doc => {
            const opt       = document.createElement('option');
            opt.value       = doc.uuid;
            opt.textContent = `📄 ${doc.original_filename}`;
            select.appendChild(opt);
        });
        if (docs.some(d => d.uuid === currentVal) || currentVal === 'global') {
            select.value = currentVal;
        } else {
            select.value = 'global';
            STATE.get().ui.selectedDocumentId = 'global';
        }
        onDocumentChange({ target: select });
    }

    function onDocumentChange(event) {
        const newId   = event.target.value;
        STATE.get().ui.selectedDocumentId = newId;

        const banner   = DOM.activeDocBanner();
        const nameEl   = DOM.activeDocName();
        const toolbar  = DOM.studyToolbar();

        if (newId === 'global') {
            log('INFO', 'Vault Context: Switched to Global Search');
            if (banner)  { banner.classList.add('hidden');  banner.classList.remove('flex'); }
            if (toolbar) { toolbar.classList.add('hidden'); toolbar.classList.remove('flex'); }
            // Clear manifest badges
            if (typeof ASSETS !== 'undefined') ASSETS.refreshManifest(null);
        } else {
            const doc      = STATE.get().ui.documents.find(d => d.uuid === newId);
            const rawName  = doc ? doc.original_filename : newId;
            const cleanName = rawName.replace(/\.pdf$/i, '').replace(/_/g, ' ');
            if (nameEl)  nameEl.textContent = cleanName;
            if (banner)  { banner.classList.remove('hidden');  banner.classList.add('flex'); }
            if (toolbar) { toolbar.classList.remove('hidden'); toolbar.classList.add('flex'); }
            log('INFO', `Vault Context: Isolated to [${rawName}]`);
            // Fetch asset manifest for this document
            if (typeof ASSETS !== 'undefined') ASSETS.refreshManifest(newId);
        }
    }

    // ─── Server message router ────────────────────────────────────────────────
    function handleServerMessage(data) {
        switch (data.type) {
            case 'log':              log(data.level || 'DEBUG', data.msg, data.meta || {}); break;
            case 'retrieval_span':   handleRetrievalSpan(data); break;
            case 'llm_span_start':   handleLlmSpanStart(data); break;
            case 'stream_token':     handleStreamToken(data.token); break;
            case 'llm_span_end':     handleLlmSpanEnd(data); break;
            case 'chat':
                finishStream();
                appendAIMessage(data.msg);
                resetSendButton();
                break;
            case 'upload_progress':  updateUploadProgress(data.pct); break;
            case 'upload_complete':  handleUploadComplete(data); break;
            case 'error':
                log('ERROR', data.msg);
                appendAIMessage(`**Error:** ${data.msg}`);
                resetSendButton();
                finishStream();
                break;
            default:
                log('DEBUG', `Unknown message type: ${data.type}`);
        }
    }

    // ─── Retrieval Span ───────────────────────────────────────────────────────
    function handleRetrievalSpan(data) {
        const s              = STATE.get().retrievalSpan;
        s.topK               = data.topK              || data.chunks?.length || 0;
        s.retrievalLatencyMs = data.retrievalLatencyMs || null;
        s.indexSize          = data.indexSize          || null;
        s.queryVector        = data.queryVector        || 'computed';
        s.chunks             = data.chunks             || [];

        DOM.queryVecStatus().textContent   = s.queryVector ? '✓ encoded' : '—';
        DOM.topKDisplay().textContent      = s.topK != null ? s.topK : '—';
        DOM.retrievalLatency().textContent = STATE.computed.formatMs(s.retrievalLatencyMs);
        DOM.indexSizeDisplay().textContent = s.indexSize ? `${s.indexSize} vecs` : '—';
        DOM.ragBadge().textContent         = `${s.chunks.length} chunks`;

        const ctxTokens = s.chunks.reduce((acc, c) => acc + STATE.computed.estimateTokens(c.text), 0);
        STATE.get().contextWindow.used     = ctxTokens;
        updateContextBar();

        if (s.chunks.length) {
            DOM.ragContextIndicator().classList.remove('hidden');
            DOM.ragContextIndicator().classList.add('flex');
            DOM.ragTokenCount().textContent = ctxTokens;
        }
        renderChunks(s.chunks);
        log('INFO', 'Retrieval span complete', {
            chunks:  s.chunks.length,
            latency: STATE.computed.formatMs(s.retrievalLatencyMs),
        });
    }

    function renderChunks(chunks) {
        const container = DOM.chunkList();
        container.innerHTML = '';
        if (!chunks.length) {
            container.innerHTML = `<div class="text-center py-6"><i data-lucide="file-search" class="w-6 h-6 text-void-400 mx-auto mb-2"></i><p class="font-mono text-[10px] text-chrome-faint">No chunks retrieved</p></div>`;
            lucide.createIcons({ nodes: [container] });
            return;
        }
        chunks.forEach((chunk, i) => {
            const scoreColor = chunk.score >= 0.85 ? '#7ee787' : chunk.score >= 0.65 ? '#f0883e' : '#ff7b72';
            const scorePct   = Math.round((chunk.score || 0) * 100);
            const card       = document.createElement('div');
            card.className   = 'chunk-card rounded p-2.5 cursor-pointer';
            card.dataset.id  = chunk.id || `chunk-${i}`;
            card.innerHTML   = `
                <div class="flex items-center justify-between mb-1.5">
                    <span class="font-mono text-[9px] text-chrome-faint">CHUNK ${i + 1}</span>
                    <div class="flex items-center gap-1.5">
                        <div class="w-10 h-1 bg-void-300 rounded-full overflow-hidden">
                            <div class="h-full rounded-full" style="width:${scorePct}%;background:${scoreColor}"></div>
                        </div>
                        <span class="font-mono text-[9px]" style="color:${scoreColor}">${scorePct}%</span>
                    </div>
                </div>
                <p class="font-mono text-[10px] text-chrome-DEFAULT leading-relaxed line-clamp-3">${escapeHtml(chunk.text)}</p>
                ${chunk.source ? `<div class="mt-1.5 flex items-center gap-1"><i data-lucide="file-text" class="w-3 h-3 text-chrome-faint"></i><span class="font-mono text-[9px] text-chrome-faint truncate">${chunk.source}${chunk.page != null ? ' · p.' + chunk.page : ''}</span></div>` : ''}
            `;
            card.addEventListener('click', () => activateChunk(chunk.id || `chunk-${i}`));
            container.appendChild(card);
        });
        lucide.createIcons({ nodes: [container] });
    }

    function activateChunk(chunkId) {
        STATE.get().ui.activeChunkId = chunkId;
        document.querySelectorAll('.chunk-card').forEach(c => {
            c.classList.toggle('active', c.dataset.id === chunkId);
        });
        document.querySelectorAll('.src-ref').forEach(el => {
            el.classList.toggle('lit', el.dataset.chunk === chunkId);
        });
    }

    // ─── LLM Span ─────────────────────────────────────────────────────────────
    function handleLlmSpanStart(data) {
        const s = STATE.get();
        s.llmSpan.traceId        = data.traceId || STATE.computed.generateTraceId();
        s.llmSpan.requestStartMs = data.startMs || Date.now();
        s.llmSpan.isStreaming    = true;
        s.llmSpan.firstTokenMs   = null;
        DOM.streamingIndicator().classList.remove('hidden');
        DOM.streamingIndicator().classList.add('flex');
        log('TRACE', `LLM span started`, { traceId: s.llmSpan.traceId });
        streamRawText  = '';
        streamBubble   = createStreamBubble();
    }

    function handleStreamToken(token) {
        const s = STATE.get().llmSpan;
        if (!s.firstTokenMs) {
            s.firstTokenMs = Date.now();
            s.ttftMs       = s.firstTokenMs - s.requestStartMs;
        }
        streamRawText += token;
        if (streamBubble) streamBubble.innerHTML = marked.parse(streamRawText);
        scrollChat();
    }

    function handleLlmSpanEnd(data) {
        const s  = STATE.get();
        const ls = s.llmSpan;
        const ss = s.session;
        ls.completionMs     = Date.now();
        ls.totalLatencyMs   = ls.completionMs - (ls.requestStartMs || ls.completionMs);
        ls.promptTokens     = data.promptTokens     || null;
        ls.completionTokens = data.completionTokens || null;
        ls.totalTokens      = (ls.promptTokens || 0) + (ls.completionTokens || 0);
        ls.throughputTokSec = ls.completionTokens && ls.totalLatencyMs
            ? Math.round(ls.completionTokens / (ls.totalLatencyMs / 1000))
            : null;
        ls.estimatedCostUsd = STATE.computed.estimateCost(ls.promptTokens || 0, ls.completionTokens || 0);
        ls.isStreaming       = false;
        ss.queries++;
        ss.totalTokens  += ls.totalTokens || 0;
        ss.totalCostUsd += ls.estimatedCostUsd || 0;
        if (ls.totalLatencyMs) ss.latencies.push(ls.totalLatencyMs);
        if (ls.ttftMs)         ss.ttfts.push(ls.ttftMs);
        finishStream();
        updateMetricsUI();
        updateSpanTrace();
        updateSessionUI();
        resetSendButton();
        log('SUCCESS', 'LLM span complete', {
            tokens:  ls.totalTokens,
            latency: STATE.computed.formatMs(ls.totalLatencyMs),
            ttft:    STATE.computed.formatMs(ls.ttftMs),
            'tok/s': ls.throughputTokSec || '—',
        });
        DOM.streamingIndicator().classList.add('hidden');
        DOM.streamingIndicator().classList.remove('flex');
    }

    // ─── Streaming bubble ──────────────────────────────────────────────────────
    function createStreamBubble() {
        const wrapper   = document.createElement('div');
        wrapper.className = 'flex gap-3 animate-slide-up';
        const icon = `<div class="w-6 h-6 rounded bg-plasma-glow border border-plasma-DEFAULT/30 flex items-center justify-center shrink-0 mt-0.5">
            <i data-lucide="bot" class="w-3.5 h-3.5 text-plasma-DEFAULT"></i>
        </div>`;
        const inner   = document.createElement('div');
        inner.className = 'flex-1';
        const traceId = STATE.get().llmSpan.traceId;
        const time    = new Date().toLocaleTimeString();
        inner.innerHTML = `
            <div class="flex items-center gap-2 mb-1.5">
                <span class="font-mono text-[10px] text-plasma-dim">GEMINI</span>
                <span class="font-mono text-[9px] text-chrome-faint">${time}</span>
                <span class="font-mono text-[9px] text-void-500">${traceId}</span>
            </div>
        `;
        const bubble    = document.createElement('div');
        bubble.className = 'bubble-ai px-5 py-4 prose max-w-none';
        inner.appendChild(bubble);
        wrapper.innerHTML = icon;
        wrapper.appendChild(inner);
        DOM.chatInner().appendChild(wrapper);
        lucide.createIcons({ nodes: [wrapper] });
        scrollChat();
        return bubble;
    }

    function finishStream() {
        if (!streamBubble) return;
        injectSourceRefs(streamBubble);
        streamBubble  = null;
        streamRawText = '';
    }

    // ─── PAIR Explainability ───────────────────────────────────────────────────
    function injectSourceRefs(bubbleEl) {
        const chunks = STATE.get().retrievalSpan.chunks;
        if (!chunks.length) return;
        bubbleEl.querySelectorAll('p').forEach(p => {
            let bestChunk = null;
            let bestScore = 0;
            chunks.forEach((chunk) => {
                const chunkWords = new Set(chunk.text.toLowerCase().split(/\W+/).filter(w => w.length > 4));
                const pWords     = p.textContent.toLowerCase().split(/\W+/).filter(w => w.length > 4);
                const overlap    = pWords.filter(w => chunkWords.has(w)).length;
                if (overlap > bestScore) { bestScore = overlap; bestChunk = chunk; }
            });
            if (bestScore >= 2 && bestChunk) {
                const chunkId = bestChunk.id || `chunk-${chunks.indexOf(bestChunk)}`;
                p.classList.add('src-ref');
                p.dataset.chunk = chunkId;
                p.title         = `Source: ${bestChunk.source || 'document'} (relevance: ${Math.round((bestChunk.score || 0) * 100)}%)`;
                p.addEventListener('mouseenter', () => activateChunk(chunkId));
                p.addEventListener('mouseleave', () => {
                    document.querySelectorAll('.chunk-card').forEach(c => c.classList.remove('active'));
                    document.querySelectorAll('.src-ref').forEach(el => el.classList.remove('lit'));
                });
            }
        });
    }

    // ─── Chat UI ───────────────────────────────────────────────────────────────
    function appendUserMessage(text) {
        const wrapper   = document.createElement('div');
        wrapper.className = 'flex gap-3 justify-end animate-slide-up';
        const time    = new Date().toLocaleTimeString();
        const tokens  = STATE.computed.estimateTokens(text);
        wrapper.innerHTML = `
            <div class="flex-1 flex flex-col items-end">
                <div class="flex items-center gap-2 mb-1.5">
                    <span class="font-mono text-[9px] text-chrome-faint">${time}</span>
                    <span class="font-mono text-[9px] text-chrome-faint">~${tokens} tok</span>
                    <span class="font-mono text-[10px] text-plasma-dim">YOU</span>
                </div>
                <div class="bubble-user px-5 py-3 text-sm text-chrome-light max-w-lg">${escapeHtml(text)}</div>
            </div>
            <div class="w-6 h-6 rounded bg-void-200 border border-void-400 flex items-center justify-center shrink-0 mt-0.5">
                <i data-lucide="user" class="w-3.5 h-3.5 text-chrome-faint"></i>
            </div>
        `;
        DOM.chatInner().appendChild(wrapper);
        lucide.createIcons({ nodes: [wrapper] });
        scrollChat();
    }

    function appendAIMessage(text) {
        const wrapper   = document.createElement('div');
        wrapper.className = 'flex gap-3 animate-slide-up';
        const time = new Date().toLocaleTimeString();
        wrapper.innerHTML = `
            <div class="w-6 h-6 rounded bg-plasma-glow border border-plasma-DEFAULT/30 flex items-center justify-center shrink-0 mt-0.5">
                <i data-lucide="bot" class="w-3.5 h-3.5 text-plasma-DEFAULT"></i>
            </div>
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-1.5">
                    <span class="font-mono text-[10px] text-plasma-dim">GEMINI</span>
                    <span class="font-mono text-[9px] text-chrome-faint">${time}</span>
                </div>
                <div class="bubble-ai px-5 py-4 prose max-w-none"></div>
            </div>
        `;
        const bubble    = wrapper.querySelector('.bubble-ai');
        bubble.innerHTML = marked.parse(text);
        injectSourceRefs(bubble);
        DOM.chatInner().appendChild(wrapper);
        lucide.createIcons({ nodes: [wrapper] });
        scrollChat();
    }

    // ─── Metrics UI ───────────────────────────────────────────────────────────
    function updateMetricsUI() {
        const ls  = STATE.get().llmSpan;
        const fmt = STATE.computed.formatMs;
        const latClass = STATE.computed.latencyClass;
        if (ls.promptTokens != null)    DOM.mPromptTokens().textContent     = ls.promptTokens.toLocaleString();
        if (ls.completionTokens != null) DOM.mCompletionTokens().textContent = ls.completionTokens.toLocaleString();
        if (ls.ttftMs != null)          { DOM.mTtft().textContent = ls.ttftMs; DOM.mTtft().className = `metric-value ${latClass(ls.ttftMs)}`; }
        if (ls.totalLatencyMs != null)  { DOM.mTotalLatency().textContent = fmt(ls.totalLatencyMs); DOM.mTotalLatency().className = `metric-value ${latClass(ls.totalLatencyMs)}`; }
        if (ls.estimatedCostUsd != null) DOM.mTotalCost().textContent      = `$${ls.estimatedCostUsd.toFixed(6)}`;
        if (ls.throughputTokSec != null) DOM.mThroughput().textContent     = `${ls.throughputTokSec} tok/s`;
        DOM.tokenRatioBar().style.width = STATE.computed.tokenRatioPct() + '%';
    }

    function updateSpanTrace() {
        const ls  = STATE.get().llmSpan;
        const rs  = STATE.get().retrievalSpan;
        const fmt = STATE.computed.formatMs;
        const el  = DOM.spanTrace();
        const total = ls.totalLatencyMs || 1;
        const retMs = rs.retrievalLatencyMs || 0;
        const llmMs = Math.max(0, total - retMs);
        const spans = [
            { label: 'embedding', ms: 0,     pct: 0,                               color: '#6e7681' },
            { label: 'retrieval', ms: retMs,  pct: Math.round((retMs/total)*100),   color: '#00d9ff' },
            { label: 'llm gen',   ms: llmMs,  pct: Math.round((llmMs/total)*100),   color: '#7ee787' },
            { label: 'total',     ms: total,  pct: 100,                              color: '#b1bac4', bold: true },
        ];
        el.innerHTML = spans.map(sp => `
            <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full shrink-0" style="background:${sp.color}"></div>
                <div class="flex-1">
                    <div class="flex justify-between mb-0.5">
                        <span class="font-mono text-[9px] text-chrome-faint ${sp.bold ? 'font-semibold text-chrome-DEFAULT' : ''}">${sp.label}</span>
                        <span class="font-mono text-[9px]" style="color:${sp.color}">${fmt(sp.ms)}</span>
                    </div>
                    <div class="h-0.5 bg-void-300 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-700" style="width:${sp.pct}%;background:${sp.color}"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function updateSessionUI() {
        const ss  = STATE.get().session;
        const avg = STATE.computed.avgLatency();
        const avgT = STATE.computed.avgTtft();
        DOM.sQueries().textContent     = ss.queries;
        DOM.sTotalTokens().textContent = ss.totalTokens.toLocaleString();
        DOM.sAvgLatency().textContent  = avg ? STATE.computed.formatMs(avg) : '—';
        DOM.sTotalCost().textContent   = `$${ss.totalCostUsd.toFixed(6)}`;
        DOM.sDocs().textContent        = ss.documents;
        DOM.sAvgTtft().textContent     = avgT ? `${avgT}ms` : '—';
    }

    function updateContextBar() {
        const cw  = STATE.get().contextWindow;
        const pct = Math.min(100, (cw.used / cw.max) * 100);
        DOM.ctxBar().style.width   = pct + '%';
        DOM.ctxLabel().textContent = `${cw.used.toLocaleString()} / ${(cw.max / 1000).toFixed(0)}k`;
        if (pct > 85)      DOM.ctxBar().style.background = '#ff7b72';
        else if (pct > 60) DOM.ctxBar().style.background = '#f0883e';
        else               DOM.ctxBar().style.background = '#00d9ff';
    }

    function tickUptime() {
        const start = STATE.get().session.uptimeStart;
        if (!start) return;
        DOM.sUptime().textContent = STATE.computed.formatUptime(Date.now() - start);
    }

    // ─── File Upload ───────────────────────────────────────────────────────────
    function handleFileUpload(file) {
        if (!file) return;
        appendUserMessage(`Indexing document: ${file.name}`);
        log('INFO', `Initiating upload`, { file: file.name, size: `${(file.size / 1024).toFixed(1)}KB` });
        DOM.uploadProgress().classList.remove('hidden');
        updateUploadProgress(5);
        const formData = new FormData();
        formData.append('file', file);
        fetch(`${window.location.protocol}//${window.location.host}/upload`, { method: 'POST', body: formData })
            .then(r => r.json())
            .then(data => {
                updateUploadProgress(60);
                ws.send(JSON.stringify({ action: 'ingest', path: data.path }));
                log('INFO', `Upload received by server, ingesting...`, { path: data.path });
            })
            .catch(err => {
                DOM.uploadProgress().classList.add('hidden');
                log('ERROR', `Upload failed: ${err.message}`);
                appendAIMessage(`**Upload Error:** ${err.message}`);
            });
        DOM.fileInput().value = '';
    }

    function updateUploadProgress(pct) {
        DOM.uploadBar().style.width  = pct + '%';
        DOM.uploadPct().textContent  = pct + '%';
    }

    function handleUploadComplete(data) {
        updateUploadProgress(100);
        STATE.get().session.documents++;
        setTimeout(() => DOM.uploadProgress().classList.add('hidden'), 1500);
        updateSessionUI();
        log('SUCCESS', `Document indexed`, { chunks: data.chunks || '?', doc: data.name || '?' });
        appendAIMessage(`Document **${data.name || 'file'}** indexed successfully. ${data.chunks ? `(${data.chunks} chunks)` : ''}`);
        fetchDocuments();
    }

    // ─── Send Query ────────────────────────────────────────────────────────────
    function sendQuery() {
        const input = DOM.queryInput();
        const text  = input.value.trim();
        if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
        appendUserMessage(text);
        input.value = '';
        input.style.height = 'auto';
        DOM.inputTokenEst().textContent = '~0 tokens';
        const btn = DOM.sendBtn();
        btn.disabled = true;
        DOM.sendLabel().textContent = 'Processing';
        const traceId    = STATE.computed.generateTraceId();
        const documentId = STATE.get().ui.selectedDocumentId;
        STATE.get().llmSpan.traceId        = traceId;
        STATE.get().llmSpan.requestStartMs = Date.now();
        log('INFO', `Query dispatched`, {
            traceId,
            vault: documentId === 'global' ? 'Global' : 'Isolated',
            query: text.slice(0, 60) + (text.length > 60 ? '…' : ''),
        });
        ws.send(JSON.stringify({ action: 'query', text, traceId, documentId }));
        STATE.get().ui.isProcessing = true;
    }

    function resetSendButton() {
        const btn       = DOM.sendBtn();
        btn.disabled    = false;
        DOM.sendLabel().textContent = 'Execute';
        STATE.get().ui.isProcessing = false;
    }

    function onInputChange(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';
        DOM.inputTokenEst().textContent = `~${STATE.computed.estimateTokens(textarea.value)} tokens`;
    }

    function onInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendQuery();
        }
    }

    function clearChat() {
        DOM.chatInner().innerHTML = '';
        log('DEBUG', 'Chat history cleared');
    }

    function clearLogs() {
        DOM.logContainer().innerHTML = '';
    }

    // ─── Drag & Drop ───────────────────────────────────────────────────────────
    function initDragDrop() {
        const zone = DOM.dropZone();
        ['dragenter', 'dragover'].forEach(evt =>
            zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add('drag-over'); })
        );
        ['dragleave', 'drop'].forEach(evt =>
            zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove('drag-over'); })
        );
        zone.addEventListener('drop', e => {
            const file = e.dataTransfer.files[0];
            if (file?.type === 'application/pdf') handleFileUpload(file);
            else log('WARN', 'Only PDF files are supported');
        });
        DOM.fileInput().addEventListener('change', e => {
            if (e.target.files[0]) handleFileUpload(e.target.files[0]);
        });
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────
    function scrollChat() {
        const el = DOM.chatScroll();
        setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), 30);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ─── Init ──────────────────────────────────────────────────────────────────
    function init() {
        lucide.createIcons();
        marked.setOptions({ breaks: true, gfm: true });
        DOM.bootTime().textContent = new Date().toLocaleTimeString();
        initDragDrop();
        connect();
        fetchDocuments();
        STATE.on('connection.status', (val) => updateConnectionUI(val));
        log('INFO', 'RAG Research Console initialised');
        log('DEBUG', `Model: ${STATE.get().llmSpan.modelName}`);
        log('DEBUG', `Context window: ${STATE.get().contextWindow.max.toLocaleString()} tokens`);
    }

    return {
        init, sendQuery, clearChat, clearLogs,
        onInputChange, onInputKeydown, onDocumentChange,
    };
})();

document.addEventListener('DOMContentLoaded', APP.init);