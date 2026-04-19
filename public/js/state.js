/**
 * state.js — Reactive Proxy State Manager (v2.0 — Academic Assets)
 * Pattern: Observer / Proxy, decouples data from DOM.
 * Conforms to OpenInference tracing specification.
 *
 * Changelog v2.0
 * ─────────────
 * • Added ui.assets: full state machine for flashcard/mindmap/exam panels.
 * • Added ui.assetManifest: tracks which types are cached per-document.
 * • Added ui.assetModal: open/close + active tab tracking.
 */
const STATE = (() => {
    const _raw = {
        // WebSocket / Connection
        connection: {
            status: 'disconnected',
            reconnectAttempts: 0,
            sessionStart: null,
        },
        // LLM Span
        llmSpan: {
            traceId:           null,
            requestStartMs:    null,
            firstTokenMs:      null,
            completionMs:      null,
            ttftMs:            null,
            totalLatencyMs:    null,
            promptTokens:      null,
            completionTokens:  null,
            totalTokens:       null,
            throughputTokSec:  null,
            estimatedCostUsd:  null,
            modelName:         'gemini-flash',
            isStreaming:       false,
        },
        // Retrieval Span (OpenInference spec)
        retrievalSpan: {
            queryVector:       null,
            topK:              null,
            retrievalLatencyMs: null,
            indexSize:         null,
            chunks:            [],
        },
        // Context Window
        contextWindow: {
            used:     0,
            max:      32768,
            inputEst: 0,
        },
        // Session aggregates
        session: {
            queries:      0,
            totalTokens:  0,
            totalCostUsd: 0,
            latencies:    [],
            ttfts:        [],
            documents:    0,
            uptimeStart:  null,
        },
        // UI state
        ui: {
            isProcessing:        false,
            activeChunkId:       null,
            currentStreamBuffer: '',

            // Vault Selector
            documents:           [],
            selectedDocumentId:  'global',

            // ── v2.0: Academic Asset State ────────────────────────────────
            assetModal: {
                isOpen:     false,
                activeTab:  null,          // 'flashcards' | 'mindmap' | 'exam'
                isLoading:  false,
                error:      null,
            },
            assetManifest: [],             // [{asset_type, generated_at, ...}]
            assets: {
                flashcards: {
                    data:         null,    // { cards: [...], count: N }
                    currentIndex: 0,
                    isFlipped:    false,
                },
                mindmap: {
                    data:         null,    // { mermaid: '...' }
                    rendered:     false,
                },
                exam: {
                    data:         null,    // { mcq: [...], written: [...] }
                    answers:      {},      // { questionIndex: 'A'|'B'|'C'|'D' }
                    writtenAnswers:{},     // { questionIndex: 'free text' }
                    submitted:    false,
                    score:        null,    // { correct, total, pct }
                },
            },
        },
    };

    // ─── Subscriber registry ─────────────────────────────────────────────────
    const _subs = new Map();

    function _notify(path, newVal, oldVal) {
        (_subs.get(path) || []).forEach(fn => {
            try { fn(newVal, oldVal, path); }
            catch (e) { console.error(`[STATE] Error @ ${path}:`, e); }
        });
        (_subs.get('*') || []).forEach(fn => {
            try { fn(newVal, oldVal, path); }
            catch (e) { console.error(`[STATE] Wildcard error:`, e); }
        });
    }

    // ─── Deep reactive proxy factory ─────────────────────────────────────────
    function _makeProxy(obj, pathPrefix = '') {
        return new Proxy(obj, {
            get(target, key) {
                const val = target[key];
                if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                    return _makeProxy(val, pathPrefix ? `${pathPrefix}.${key}` : key);
                }
                return val;
            },
            set(target, key, newVal) {
                const oldVal = target[key];
                target[key] = newVal;
                const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
                if (oldVal !== newVal) _notify(fullPath, newVal, oldVal);
                return true;
            },
        });
    }

    const state = _makeProxy(_raw);

    return {
        get: () => state,
        on(path, fn) {
            if (!_subs.has(path)) _subs.set(path, []);
            _subs.get(path).push(fn);
        },
        off(path, fn) {
            if (!_subs.has(path)) return;
            _subs.set(path, _subs.get(path).filter(f => f !== fn));
        },
        snapshot() {
            return JSON.parse(JSON.stringify(_raw));
        },
        computed: {
            ctxPct()       { return (_raw.contextWindow.used / _raw.contextWindow.max) * 100; },
            avgLatency()   {
                const l = _raw.session.latencies;
                return l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null;
            },
            avgTtft()      {
                const t = _raw.session.ttfts;
                return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null;
            },
            tokenRatioPct() {
                const { promptTokens, completionTokens } = _raw.llmSpan;
                if (!promptTokens || !completionTokens) return 0;
                return Math.round((promptTokens / (promptTokens + completionTokens)) * 100);
            },
            latencyClass(ms) {
                if (ms == null) return 'text-chrome-faint';
                if (ms < 1500)  return 'latency-good';
                if (ms < 4000)  return 'latency-medium';
                return 'latency-slow';
            },
            estimateCost(promptTok, completionTok) {
                const inputCost  = (promptTok     / 1_000_000) * 0.075;
                const outputCost = (completionTok / 1_000_000) * 0.30;
                return inputCost + outputCost;
            },
            estimateTokens(text) {
                return Math.ceil((text || '').length / 4);
            },
            formatMs(ms) {
                if (ms == null) return '—';
                if (ms < 1000)  return `${ms}ms`;
                return `${(ms / 1000).toFixed(2)}s`;
            },
            formatUptime(ms) {
                const s   = Math.floor(ms / 1000);
                const h   = Math.floor(s / 3600);
                const m   = Math.floor((s % 3600) / 60);
                const sec = s % 60;
                return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
            },
            generateTraceId() {
                return 'tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            },
            /** Check if an asset type is in the manifest (i.e., already cached) */
            isAssetCached(type) {
                return _raw.ui.assetManifest.some(m => m.asset_type === type);
            },
        },
    };
})();

window.STATE = STATE;