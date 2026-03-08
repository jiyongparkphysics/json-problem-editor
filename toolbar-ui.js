(() => {
    'use strict';

    const TOOLBAR_BTN_BASE_CLASS = 'toolbar-btn bg-white border rounded hover:bg-gray-100';

    function mkInlineLabel(text) {
        const div = document.createElement('div');
        div.className = 'tb-label';
        div.textContent = text;
        return div;
    }

    function mkInlineDivider() {
        const d = document.createElement('div');
        d.className = 'tb-divider';
        return d;
    }

    // Convert marker-template to (textWithoutMarker, moveFromEnd) to preserve legacy behavior.
    function splitMarkerToLegacyMove(strWithMarker) {
        const idx = String(strWithMarker || '').indexOf('|');
        if (idx === -1) return { text: String(strWithMarker || ''), move: 0 };
        const text = strWithMarker.slice(0, idx) + strWithMarker.slice(idx + 1);
        const move = idx - text.length; // legacy move (usually negative)
        return { text, move };
    }

    function makeToolbarButton(cfg) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = TOOLBAR_BTN_BASE_CLASS + (cfg.cls ? (' ' + cfg.cls) : '');
        if (cfg.title) btn.title = cfg.title;

        if (cfg.kind === 'wrap') {
            btn.dataset.action = 'wrap';
            btn.dataset.prefix = cfg.prefix ?? '';
            btn.dataset.suffix = cfg.suffix ?? '';
            btn.dataset.cursorEmpty = cfg.cursorEmpty ?? 'inside';
            btn.dataset.cursorSelected = cfg.cursorSelected ?? btn.dataset.cursorEmpty;
            if (cfg.smartInsert) btn.dataset.smartInsert = String(cfg.smartInsert);
        } else if (cfg.kind === 'cmd') {
            btn.dataset.action = 'cmd';
            btn.dataset.cmd = cfg.cmd ?? '';
            // default tail: single trailing space (matches legacy buttons like \sin, \alpha)
            btn.dataset.tail = (cfg.tail !== undefined) ? String(cfg.tail) : ' ';
        } else if (cfg.kind === 'tpl') {
            btn.dataset.action = 'tpl';
            btn.dataset.tpl = cfg.tpl ?? '';
        }
        if (cfg.policyKey) btn.dataset.policyKey = String(cfg.policyKey);

        // Safe label rendering: use KaTeX render API instead of innerHTML
        if (cfg.labelHtml !== undefined && cfg.labelHtml !== null) {
            // Extract LaTeX between $ delimiters and render safely via KaTeX API
            const latexMatch = String(cfg.labelHtml).match(/^\$(.+)\$$/);
            if (latexMatch && window.katex) {
                try {
                    katex.render(latexMatch[1], btn, { throwOnError: false });
                } catch (_) {
                    btn.textContent = cfg.labelHtml;
                }
            } else {
                btn.textContent = cfg.labelHtml;
            }
        } else {
            btn.textContent = cfg.label ?? '';
        }

        // Accessibility: add aria-label for screen readers
        const ariaText = cfg.title || cfg.label || cfg.cmd || cfg.tpl || '';
        if (ariaText) btn.setAttribute('aria-label', ariaText);

        return btn;
    }

    function renderToolbarTab(tabName) {
        const configApi = (typeof window !== 'undefined') ? window.ToolbarConfig : null;
        const def = configApi?.getToolbarDefinition?.(tabName);
        const root = document.getElementById('toolbar-' + tabName);
        if (!def || !root) return;

        const wasHidden = root.classList.contains('hidden');
        root.className = 'toolbar-content' + (wasHidden ? ' hidden' : '');
        root.innerHTML = '';
        const frag = document.createDocumentFragment();

        if (def.layout === 'inline') {
            let currentButtons = null;
            const ensureButtonsRow = () => {
                if (currentButtons) return;
                currentButtons = document.createElement('div');
                currentButtons.className = 'tb-buttons';
                frag.appendChild(currentButtons);
            };

            (def.items || []).forEach(item => {
                if (item.kind === 'label') {
                    frag.appendChild(mkInlineLabel(item.text || ''));
                    currentButtons = null;
                } else if (item.kind === 'divider') {
                    frag.appendChild(mkInlineDivider());
                    currentButtons = null;
                } else {
                    ensureButtonsRow();
                    currentButtons.appendChild(makeToolbarButton(item));
                }
            });
        } else if (def.layout === 'groups') {
            // Render subsection blocks in a 2-column grid for a compact layout.
            const grid = document.createElement('div');
            grid.className = 'tb-grid';

            (def.groups || []).forEach((g) => {
                const section = document.createElement('div');
                section.className = 'tb-section';

                const label = document.createElement('div');
                label.className = 'tb-label';
                label.textContent = g.title || '';
                section.appendChild(label);

                const buttons = document.createElement('div');
                buttons.className = g.groupClass || 'tb-buttons';
                (g.buttons || []).forEach(btnCfg => {
                    buttons.appendChild(makeToolbarButton(btnCfg));
                });
                section.appendChild(buttons);

                grid.appendChild(section);
            });

            frag.appendChild(grid);
        }

        root.appendChild(frag);
    }

    function renderAllToolbars() {
        const tabs = (typeof window !== 'undefined' && window.ToolbarConfig?.TOOLBAR_TABS)
            ? window.ToolbarConfig.TOOLBAR_TABS
            : ['basic', 'greek', 'fonts', 'operators', 'functions'];
        tabs.forEach((tabName) => renderToolbarTab(tabName));
    }

    function _getTabButtons() {
        return Array.from(document.querySelectorAll('.tab-btn[data-tab]'))
            .filter((btn) => {
                if (!btn || typeof btn !== 'object') return false;
                if (btn.hidden) return false;
                if (btn.classList && btn.classList.contains('hidden')) return false;
                if (btn.getAttribute && btn.getAttribute('aria-hidden') === 'true') return false;
                return true;
            });
    }

    function setActiveTab(tabName) {
        const tabs = (typeof window !== 'undefined' && window.ToolbarConfig?.TOOLBAR_TABS)
            ? window.ToolbarConfig.TOOLBAR_TABS
            : ['basic', 'greek', 'fonts', 'operators', 'functions'];
        const allButtons = Array.from(document.querySelectorAll('.tab-btn[data-tab]'));
        const visibleButtons = _getTabButtons();
        const visibleTabs = visibleButtons
            .map((btn) => String(btn.dataset.tab || '').trim())
            .filter(Boolean);
        const fallbackTab = visibleTabs[0] || tabs[0] || 'basic';
        const requested = tabs.includes(tabName) ? tabName : fallbackTab;
        const target = visibleTabs.includes(requested) ? requested : fallbackTab;

        allButtons.forEach(btn => {
            const isActive = (btn.dataset.tab === target);
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        document.querySelectorAll('.toolbar-content').forEach(el => {
            const isTarget = (el.id === ('toolbar-' + target));
            el.classList.toggle('hidden', !isTarget);
            el.setAttribute('aria-hidden', isTarget ? 'false' : 'true');
            if (isTarget) el.removeAttribute('hidden');
            else el.setAttribute('hidden', '');
        });
        if (typeof document !== 'undefined' && typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
            document.dispatchEvent(new window.CustomEvent('toolbar:tabchange', { detail: { tab: target } }));
        }
        return target;
    }

    function _bindToolbarTabKeyboard() {
        _getTabButtons().forEach((btn) => {
            if (btn.dataset.kbBound === '1') return;
            btn.dataset.kbBound = '1';
            btn.addEventListener('keydown', (e) => {
                const buttons = _getTabButtons();
                const idx = buttons.indexOf(btn);
                if (idx < 0 || buttons.length === 0) return;

                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const delta = e.key === 'ArrowRight' ? 1 : -1;
                    const next = (idx + delta + buttons.length) % buttons.length;
                    const targetBtn = buttons[next];
                    targetBtn.focus();
                    setActiveTab(targetBtn.dataset.tab);
                    return;
                }
                if (e.key === 'Home' || e.key === 'End') {
                    e.preventDefault();
                    const targetBtn = (e.key === 'Home') ? buttons[0] : buttons[buttons.length - 1];
                    targetBtn.focus();
                    setActiveTab(targetBtn.dataset.tab);
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setActiveTab(btn.dataset.tab);
                }
            });
        });
    }

    function _initToolbarA11y() {
        const tabList = document.getElementById('toolbar-tablist');
        if (tabList) {
            tabList.setAttribute('role', 'tablist');
            tabList.setAttribute('aria-label', 'LaTeX 툴바 탭');
        }
        _getTabButtons().forEach((btn) => {
            const tab = String(btn.dataset.tab || '').trim();
            if (!tab) return;
            if (!btn.id) btn.id = `toolbar-tab-${tab}`;
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-controls', `toolbar-${tab}`);
        });

        const tabs = (typeof window !== 'undefined' && window.ToolbarConfig?.TOOLBAR_TABS)
            ? window.ToolbarConfig.TOOLBAR_TABS
            : ['basic', 'greek', 'fonts', 'operators', 'functions'];
        tabs.forEach((tab) => {
            const pane = document.getElementById(`toolbar-${tab}`);
            if (!pane) return;
            pane.setAttribute('role', 'tabpanel');
            pane.setAttribute('aria-labelledby', `toolbar-tab-${tab}`);
        });
    }

    function initToolbar() {
        renderAllToolbars();
        _initToolbarA11y();
        _bindToolbarTabKeyboard();
        const activeBtn = _getTabButtons().find((btn) => btn.classList.contains('active')) || _getTabButtons()[0];
        if (activeBtn?.dataset?.tab) setActiveTab(activeBtn.dataset.tab);
    }

    const api = {
        initToolbar,
        setActiveTab,
        splitMarkerToLegacyMove,
    };

    if (typeof window !== 'undefined') {
        window.ToolbarUI = api;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.ToolbarUI = api;
    }
})();
