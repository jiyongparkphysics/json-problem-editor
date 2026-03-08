    (function() {
        'use strict';
        // Safe scroll: only scrolls the list container, never the page
        function _ensureVisibleInList(listEl, itemEl) {
            const listRect = listEl.getBoundingClientRect();
            const itemRect = itemEl.getBoundingClientRect();
            const topDelta = itemRect.top - listRect.top;
            const bottomDelta = itemRect.bottom - listRect.bottom;
            if (topDelta < 0) listEl.scrollTop += topDelta;
            else if (bottomDelta > 0) listEl.scrollTop += bottomDelta;
        }
        // =============================
        // LaTeX Toolbar Logic (ported)
        // =============================
        const toolbarState = { lastFocusedInputId: 'text' };

        const _getToolbarUiApi = () => {
            if (typeof window === 'undefined') return null;
            const uiApi = window.ToolbarUI;
            if (!uiApi || typeof uiApi !== 'object') return null;
            return uiApi;
        };
        const _getToolbarConfigApi = () => {
            if (typeof window === 'undefined') return null;
            const configApi = window.ToolbarConfig;
            if (!configApi || typeof configApi !== 'object') return null;
            return configApi;
        };

        function setActiveTab(tabName) {
            const uiApi = _getToolbarUiApi();
            if (uiApi && typeof uiApi.setActiveTab === 'function') {
                uiApi.setActiveTab(tabName);
                return;
            }
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });
            document.querySelectorAll('.toolbar-content').forEach(el => {
                el.classList.add('hidden');
            });
            const pane = document.getElementById('toolbar-' + tabName);
            if (pane) pane.classList.remove('hidden');
        }

        function splitMarkerToLegacyMove(strWithMarker) {
            const uiApi = _getToolbarUiApi();
            if (uiApi && typeof uiApi.splitMarkerToLegacyMove === 'function') {
                return uiApi.splitMarkerToLegacyMove(strWithMarker);
            }
            const idx = String(strWithMarker || '').indexOf('|');
            if (idx === -1) return { text: String(strWithMarker || ''), move: 0 };
            const text = strWithMarker.slice(0, idx) + strWithMarker.slice(idx + 1);
            const move = idx - text.length;
            return { text, move };
        }


        function insertAtCursor(input, prefix, suffix, moveCursor = 0) {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;
            const selected = text.substring(start, end);
            input.value = text.substring(0, start) + prefix + selected + suffix + text.substring(end);

            const newPos = start + prefix.length + selected.length + suffix.length + moveCursor;
            input.selectionStart = input.selectionEnd = newPos;
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function _isEscapedAtIndex(text, idx) {
            let slashCount = 0;
            for (let i = idx - 1; i >= 0; i--) {
                if (text[i] !== '\\') break;
                slashCount += 1;
            }
            return (slashCount % 2) === 1;
        }

        function _getMathModeAtPosition(text, pos) {
            const raw = String(text || '');
            const limit = Math.max(0, Math.min(raw.length, Number.isFinite(pos) ? pos : 0));
            let mathMode = null; // null | '$' | '$$'
            for (let i = 0; i < limit; i++) {
                const ch = raw[i];
                if (ch !== '$' || _isEscapedAtIndex(raw, i)) continue;
                const next = raw[i + 1] || '';
                const canUseDouble = (next === '$' && !_isEscapedAtIndex(raw, i + 1) && mathMode !== '$');
                if (canUseDouble) {
                    mathMode = (mathMode === '$$') ? null : '$$';
                    i += 1;
                    continue;
                }
                mathMode = (mathMode === '$') ? null : '$';
            }
            return mathMode;
        }

        document.addEventListener('DOMContentLoaded', () => {
            const toolbarUi = _getToolbarUiApi();
            if (toolbarUi && typeof toolbarUi.initToolbar === 'function') {
                toolbarUi.initToolbar();
            }

            const createEmptyQuestion = () => ({
                id: '',
                title: '',
                text: '',
                answer: '',
                variables: [], // { name, min, max }
                points: '', // optional
                imageData: null // base64 data URL for image
            });

            const state = {
                questions: [createEmptyQuestion()],
                currentIndex: 0
            };
            const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
            const IMPORT_MATERIALIZE_BATCH_SIZE = 10;

            const dom = {
                id: document.getElementById('id'),
                title: document.getElementById('title'),
                points: document.getElementById('points'),
                text: document.getElementById('text'),
                answer: document.getElementById('answer'),
                calcMinMaxBtn: document.getElementById('calc-minmax'),
                calcMinMaxAllBtn: document.getElementById('calc-minmax-all'),
                minmaxAllResult: document.getElementById('minmax-all-result'),
                minmaxReportTable: document.getElementById('minmax-report-table'),
                minmaxSamples: document.getElementById('minmax-samples'),
                answerMathjs: document.getElementById('answer-mathjs'),
                minmaxResult: document.getElementById('minmax-result'),
                variablesContainer: document.getElementById('variables-container'),
                textPreview: document.getElementById('text-preview'),
                answerPreview: document.getElementById('answer-preview'),
                validationErrors: document.getElementById('validation-errors'),
                validationWarnings: document.getElementById('validation-warnings'),
                newBtn: document.getElementById('new-btn'),
                loadBtn: document.getElementById('load-btn'),
                saveBtn: document.getElementById('save-btn'),
                fileInput: document.getElementById('file-input'),
                questionTreeWrap: document.getElementById('question-tree-wrap'),
                questionTreeBtn: document.getElementById('question-tree-btn'),
                questionTreeLabel: document.getElementById('question-tree-label'),
                questionTreePopup: document.getElementById('question-tree-popup'),
                questionTreeSearch: document.getElementById('question-tree-search'),
                questionTreeList: document.getElementById('question-tree-list'),
                addQuestionBtn: document.getElementById('add-question'),
                deleteQuestionBtn: document.getElementById('delete-question'),
                focusIndicator: document.getElementById('focus-indicator'),
                toolbarActionHint: document.getElementById('toolbar-action-hint'),
                imageInput: document.getElementById('image-input'),
                imageBox: document.getElementById('image-box'),
                imageBoxPlaceholder: document.getElementById('image-box-placeholder'),
                imagePreviewImg: document.getElementById('image-preview-img'),
                imageRemoveBtn: document.getElementById('image-remove-btn'),
                importModal: document.getElementById('import-modal'),
                importList: document.getElementById('import-list'),
                importSummary: document.getElementById('import-summary'),
                importStatus: document.getElementById('import-status'),
                importSearch: document.getElementById('import-search'),
                importFileLabel: document.getElementById('import-file-label'),
                importSelectAllBtn: document.getElementById('import-select-all-btn'),
                importReplaceBtn: document.getElementById('import-replace-btn'),
                importAppendBtn: document.getElementById('import-append-btn'),
                importCancelBtn: document.getElementById('import-cancel-btn'),
                importFileNavWrap: document.getElementById('import-file-nav-wrap'),
                importFileNavBtn: document.getElementById('import-file-nav-btn'),
                importFileNavLabel: document.getElementById('import-file-nav-label'),
                importFileNavPopup: document.getElementById('import-file-nav-popup'),
                importFileNavList: document.getElementById('import-file-nav-list'),
                previewAllBtn: document.getElementById('preview-all-btn'),
                previewModal: document.getElementById('preview-modal'),
                previewContent: document.getElementById('preview-content'),
                previewSummary: document.getElementById('preview-summary'),
                previewTreeWrap: document.getElementById('preview-tree-wrap'),
                previewTreeBtn: document.getElementById('preview-tree-btn'),
                previewTreeLabel: document.getElementById('preview-tree-label'),
                previewTreePopup: document.getElementById('preview-tree-popup'),
                previewTreeSearch: document.getElementById('preview-tree-search'),
                previewTreeList: document.getElementById('preview-tree-list'),
                previewPrintBtn: document.getElementById('preview-print-btn'),
                previewCloseBtn: document.getElementById('preview-close-btn'),
                confirmModal: document.getElementById('confirm-modal'),
                confirmTitle: document.getElementById('confirm-title'),
                confirmMessage: document.getElementById('confirm-message'),
                confirmOkBtn: document.getElementById('confirm-ok-btn'),
                confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
            };

            const _getRandomExamPdflatexProfile = () => {
                try {
                    const compatApi = (typeof window !== 'undefined' && window.RandomExamCompat) ? window.RandomExamCompat : null;
                    if (compatApi && typeof compatApi.getPdflatexCompatibilityProfile === 'function') {
                        const profile = compatApi.getPdflatexCompatibilityProfile();
                        if (profile && typeof profile === 'object') return profile;
                    }
                } catch (_) {
                    // Use fallback profile below.
                }
                return {
                    compilerCommand: 'latexmk -pdf -interaction=nonstopmode',
                    engine: 'pdflatex',
                    documentClass: '\\documentclass[b4paper,twocolumn]{article}',
                    mathPackages: {
                        amsmath: false,
                        amssymb: false,
                        amsfonts: false,
                        mathtools: false
                    }
                };
            };

            const _buildPdflatexProfileHint = () => {
                const profile = _getRandomExamPdflatexProfile();
                const command = String(profile.compilerCommand || '').trim();
                const engine = String(profile.engine || '').trim();
                const mathPackages = (profile && typeof profile.mathPackages === 'object' && profile.mathPackages)
                    ? profile.mathPackages
                    : {};
                const amsmathOn = !!mathPackages.amsmath;
                const amssymbOn = !!mathPackages.amssymb;
                const amsfontsOn = !!mathPackages.amsfonts;
                const mathtoolsOn = !!mathPackages.mathtools;
                const amsList = [];
                if (amsmathOn) amsList.push('amsmath');
                if (amssymbOn) amsList.push('amssymb');
                if (amsfontsOn) amsList.push('amsfonts');
                if (mathtoolsOn) amsList.push('mathtools');
                const amsSummary = amsList.length > 0
                    ? `${amsList.join(', ')} 포함`
                    : 'amsmath/amssymb/amsfonts/mathtools 미포함';
                return `기준 환경: ${command}${engine ? ` (${engine})` : ''} | AMS 수식 패키지: ${amsSummary}`;
            };

            const _evaluateToolbarButtonPolicy = (btn, inputId) => {
                if (!btn || inputId !== 'answer') return { allowed: true, reason: '' };
                try {
                    const compatApi = (typeof window !== 'undefined' && window.RandomExamCompat) ? window.RandomExamCompat : null;
                    if (compatApi && typeof compatApi.evaluateAnswerToolbarAction === 'function') {
                        const policy = compatApi.evaluateAnswerToolbarAction({
                            action: String(btn.dataset.action || ''),
                            cmd: String(btn.dataset.cmd || ''),
                            tpl: String(btn.dataset.tpl || ''),
                            prefix: String(btn.dataset.prefix || ''),
                            suffix: String(btn.dataset.suffix || ''),
                            policyKey: String(btn.dataset.policyKey || '')
                        });
                        if (policy && typeof policy === 'object' && typeof policy.allowed === 'boolean') {
                            return {
                                allowed: !!policy.allowed,
                                reason: String(policy.reason || '')
                            };
                        }
                    }
                } catch (_) {
                    // Fall through to permissive default.
                }
                return { allowed: true, reason: '' };
            };

            const _syncAnswerOnlyToolbarTabs = (targetInputId) => {
                const configApi = _getToolbarConfigApi();
                const tabNames = Array.isArray(configApi?.TOOLBAR_TABS) && configApi.TOOLBAR_TABS.length > 0
                    ? Array.from(configApi.TOOLBAR_TABS)
                    : ['basic', 'greek', 'fonts', 'operators', 'functions', 'functionParen'];
                const tabMap = new Map();
                tabNames.forEach((tabName) => {
                    tabMap.set(tabName, {
                        btn: document.getElementById(`toolbar-tab-${tabName}`),
                        panel: document.getElementById(`toolbar-${tabName}`)
                    });
                });
                if ([...tabMap.values()].some((item) => !item.btn || !item.panel)) return;

                let visibleTabs = [];
                if (configApi && typeof configApi.getVisibleTabsForInput === 'function') {
                    const resolved = configApi.getVisibleTabsForInput(targetInputId);
                    if (Array.isArray(resolved)) visibleTabs = resolved;
                }
                if (visibleTabs.length === 0) {
                    visibleTabs = targetInputId === 'answer'
                        ? ['basic', 'functionParen']
                        : ['basic', 'greek', 'fonts', 'operators', 'functions'];
                }
                visibleTabs = visibleTabs.filter((tab) => tabMap.has(tab));
                if (visibleTabs.length === 0) {
                    visibleTabs = ['basic'].filter((tab) => tabMap.has(tab));
                }
                const visibleSet = new Set(visibleTabs);

                const activeBtn = document.querySelector('.tab-btn.active[data-tab]');
                const activeTab = activeBtn ? String(activeBtn.dataset.tab || '').trim() : '';

                const showTab = (tabBtn, panel) => {
                    tabBtn.classList.remove('hidden');
                    tabBtn.removeAttribute('hidden');
                    tabBtn.setAttribute('aria-hidden', 'false');
                    const isActive = tabBtn.classList.contains('active') || tabBtn.getAttribute('aria-selected') === 'true';
                    if (isActive) {
                        panel.classList.remove('hidden');
                        panel.removeAttribute('hidden');
                        panel.setAttribute('aria-hidden', 'false');
                    }
                };
                const hideTab = (tabBtn, panel) => {
                    tabBtn.classList.remove('active');
                    tabBtn.classList.add('hidden');
                    tabBtn.setAttribute('hidden', '');
                    tabBtn.setAttribute('aria-hidden', 'true');
                    tabBtn.setAttribute('aria-selected', 'false');
                    tabBtn.setAttribute('tabindex', '-1');
                    panel.classList.add('hidden');
                    panel.setAttribute('hidden', '');
                    panel.setAttribute('aria-hidden', 'true');
                };

                tabNames.forEach((tabName) => {
                    const item = tabMap.get(tabName);
                    if (!item) return;
                    if (visibleSet.has(tabName)) showTab(item.btn, item.panel);
                    else hideTab(item.btn, item.panel);
                });

                if (!visibleSet.has(activeTab)) {
                    const preferredTab = (configApi && typeof configApi.getPreferredTabForInput === 'function')
                        ? configApi.getPreferredTabForInput(targetInputId)
                        : (targetInputId === 'answer' ? 'functionParen' : 'functions');
                    const fallbackTab = visibleSet.has(preferredTab) ? preferredTab : visibleTabs[0];
                    if (fallbackTab) setActiveTab(fallbackTab);
                }
            };

            const _setToolbarActionHint = (message = '') => {
                if (!dom.toolbarActionHint) return;
                const text = String(message || '').trim();
                if (!text) {
                    dom.toolbarActionHint.textContent = '';
                    dom.toolbarActionHint.classList.add('hidden');
                    return;
                }
                dom.toolbarActionHint.textContent = text;
                dom.toolbarActionHint.classList.remove('hidden');
            };

            const _syncToolbarButtonAvailability = () => {
                const targetInputId = toolbarState.lastFocusedInputId || 'text';
                _syncAnswerOnlyToolbarTabs(targetInputId);
                _setToolbarActionHint('');
                document.querySelectorAll('.toolbar-content button[data-action]').forEach((btn) => {
                    if (!btn || typeof btn !== 'object') return;
                    const baseTitle = String(btn.dataset.baseTitle ?? btn.title ?? '');
                    btn.dataset.baseTitle = baseTitle;

                    const policy = _evaluateToolbarButtonPolicy(btn, targetInputId);
                    const blocked = !policy.allowed;
                    btn.dataset.blocked = blocked ? '1' : '0';
                    btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
                    btn.classList.toggle('opacity-40', blocked);
                    btn.classList.toggle('cursor-not-allowed', blocked);

                    if (blocked) {
                        const reason = String(policy.reason || '현재 입력 대상에서 사용할 수 없습니다.');
                        btn.dataset.blockedReason = reason;
                        btn.title = baseTitle ? `${baseTitle} | ${reason}` : reason;
                    } else {
                        delete btn.dataset.blockedReason;
                        btn.title = baseTitle;
                    }
                });
            };

            // Tab click
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    setActiveTab(btn.dataset.tab);
                });
            });
            document.addEventListener('toolbar:tabchange', () => {
                _syncToolbarButtonAvailability();
            });

            // === Unified modal dialog (confirm + alert replacement) ===
            function showDialog({
                message,
                mode = 'confirm', // 'confirm' | 'alert'
                title = '',
                okText = '확인',
                cancelText = '취소'
            }) {
                return new Promise((resolve) => {
                    const isAlert = mode === 'alert';
                    const dialogTitle = title || (isAlert ? '안내' : '확인');
                    const prevOkText = dom.confirmOkBtn.textContent;
                    const prevCancelText = dom.confirmCancelBtn.textContent;
                    const prevTitleText = dom.confirmTitle ? dom.confirmTitle.textContent : '';
                    const prevActiveElement = document.activeElement;

                    if (dom.confirmTitle) dom.confirmTitle.textContent = dialogTitle;
                    dom.confirmMessage.textContent = message;
                    dom.confirmOkBtn.textContent = okText;
                    dom.confirmCancelBtn.textContent = cancelText;
                    dom.confirmCancelBtn.classList.toggle('hidden', isAlert);
                    dom.confirmModal.setAttribute('aria-hidden', 'false');
                    dom.confirmModal.classList.remove('hidden');

                    const cleanup = (result) => {
                        dom.confirmModal.classList.add('hidden');
                        dom.confirmModal.setAttribute('aria-hidden', 'true');
                        if (dom.confirmTitle) dom.confirmTitle.textContent = prevTitleText;
                        dom.confirmOkBtn.textContent = prevOkText;
                        dom.confirmCancelBtn.textContent = prevCancelText;
                        dom.confirmCancelBtn.classList.remove('hidden');
                        dom.confirmOkBtn.removeEventListener('click', onOk);
                        dom.confirmCancelBtn.removeEventListener('click', onCancel);
                        dom.confirmModal.removeEventListener('click', onBackdrop);
                        document.removeEventListener('keydown', onKeyDown);
                        if (prevActiveElement && typeof prevActiveElement.focus === 'function') {
                            requestAnimationFrame(() => {
                                try { prevActiveElement.focus(); } catch (_) {}
                            });
                        }
                        resolve(result);
                    };
                    const onOk = () => cleanup(true);
                    const onCancel = () => cleanup(false);
                    const onBackdrop = (e) => {
                        if (e.target !== dom.confirmModal) return;
                        cleanup(isAlert ? true : false);
                    };
                    const onKeyDown = (e) => {
                        if (e.key === 'Enter') {
                            if (!isAlert && document.activeElement === dom.confirmCancelBtn) cleanup(false);
                            else cleanup(true);
                        } else if (e.key === 'Escape') {
                            cleanup(isAlert ? true : false);
                        } else if (e.key === 'Tab') {
                            const focusables = [dom.confirmCancelBtn, dom.confirmOkBtn]
                                .filter(el => el && !el.classList.contains('hidden'));
                            if (focusables.length === 0) return;
                            e.preventDefault();
                            const currentIdx = focusables.indexOf(document.activeElement);
                            if (currentIdx < 0) {
                                focusables[0].focus();
                                return;
                            }
                            const nextIdx = e.shiftKey
                                ? (currentIdx - 1 + focusables.length) % focusables.length
                                : (currentIdx + 1) % focusables.length;
                            focusables[nextIdx].focus();
                        }
                    };

                    dom.confirmOkBtn.addEventListener('click', onOk);
                    if (!isAlert) dom.confirmCancelBtn.addEventListener('click', onCancel);
                    dom.confirmModal.addEventListener('click', onBackdrop);
                    document.addEventListener('keydown', onKeyDown);
                    requestAnimationFrame(() => dom.confirmOkBtn.focus());
                });
            }

            const showConfirm = (message, options = {}) => showDialog({ message, mode: 'confirm', ...options });
            const showAlert = (message, options = {}) => showDialog({ message, mode: 'alert', ...options });

            const _FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]';
            const _isElementVisibleInModal = (el, modalEl) => {
                if (!el || !modalEl) return false;
                if (!modalEl.contains(el)) return false;
                let node = el;
                while (node && node !== modalEl) {
                    if (node.classList?.contains('hidden')) return false;
                    if (node.getAttribute?.('aria-hidden') === 'true') return false;
                    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
                        const cs = window.getComputedStyle(node);
                        if (!cs || cs.display === 'none' || cs.visibility === 'hidden') return false;
                    }
                    node = node.parentElement;
                }
                if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false;
                return true;
            };
            const _getVisibleFocusable = (modalEl) => {
                if (!modalEl) return [];
                return Array.from(modalEl.querySelectorAll(_FOCUSABLE_SELECTOR)).filter((el) => {
                    if (!el || typeof el.focus !== 'function') return false;
                    if (el.disabled) return false;
                    if (el.getAttribute('tabindex') === '-1') return false;
                    if (el.tagName === 'INPUT' && (el.type || '').toLowerCase() === 'hidden') return false;
                    return _isElementVisibleInModal(el, modalEl);
                });
            };
            const _attachModalFocusTrap = (modalEl, {
                initialFocus = null,
                onEscape = null
            } = {}) => {
                const prevActiveElement = document.activeElement;
                const onKeyDown = (e) => {
                    // If another top-level modal is active, let that modal own keyboard handling.
                    if (!modalEl.contains(document.activeElement)) return;
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        if (typeof onEscape === 'function') onEscape();
                        return;
                    }
                    if (e.key !== 'Tab') return;
                    const focusables = _getVisibleFocusable(modalEl);
                    if (focusables.length === 0) {
                        e.preventDefault();
                        return;
                    }
                    e.preventDefault();
                    const currentIdx = focusables.indexOf(document.activeElement);
                    if (currentIdx < 0) {
                        focusables[0].focus();
                        return;
                    }
                    const nextIdx = e.shiftKey
                        ? (currentIdx - 1 + focusables.length) % focusables.length
                        : (currentIdx + 1) % focusables.length;
                    focusables[nextIdx].focus();
                };

                document.addEventListener('keydown', onKeyDown);
                requestAnimationFrame(() => {
                    const target = initialFocus || _getVisibleFocusable(modalEl)[0] || modalEl;
                    if (target && typeof target.focus === 'function') target.focus();
                });

                return () => {
                    document.removeEventListener('keydown', onKeyDown);
                    if (prevActiveElement && typeof prevActiveElement.focus === 'function') {
                        requestAnimationFrame(() => {
                            try { prevActiveElement.focus(); } catch (_) {}
                        });
                    }
                };
            };

            // Focus Tracking
            const updateFocus = (e) => {
                toolbarState.lastFocusedInputId = e.target.id;
                if (dom.focusIndicator) {
                    const isTextMode = e.target.id === 'text';
                    const modeLabel = isTextMode
                        ? '지문'
                        : '정답식';
                    dom.focusIndicator.classList.toggle('mode-text', isTextMode);
                    dom.focusIndicator.classList.toggle('mode-answer', !isTextMode);
                    dom.focusIndicator.textContent = `입력 대상: ${modeLabel}`;
                }
                _syncToolbarButtonAvailability();
            };
            dom.text.addEventListener('focus', updateFocus);
            dom.answer.addEventListener('focus', updateFocus);
            _syncToolbarButtonAvailability();

            // Toolbar click (event delegation)
            document.querySelectorAll('.toolbar-content').forEach(container => {
                container.addEventListener('focusin', (e) => {
                    const btn = e.target.closest('button[data-action]');
                    if (!btn) return;
                    const blocked = btn.getAttribute('aria-disabled') === 'true' || btn.dataset.blocked === '1';
                    if (!blocked) {
                        _setToolbarActionHint('');
                        return;
                    }
                    const reason = String(btn.dataset.blockedReason || '현재 입력 대상에서 사용할 수 없습니다.');
                    _setToolbarActionHint(reason);
                });
                container.addEventListener('focusout', (e) => {
                    const next = e.relatedTarget;
                    if (next && typeof next.closest === 'function' && next.closest('.toolbar-content')) return;
                    _setToolbarActionHint('');
                });
                container.addEventListener('click', (e) => {
                    const btn = e.target.closest('button');
                    if (!btn) return;
                    const blocked = btn.getAttribute('aria-disabled') === 'true' || btn.dataset.blocked === '1';
                    if (blocked) {
                        const reason = String(btn.dataset.blockedReason || '현재 입력 대상에서 사용할 수 없습니다.');
                        _setToolbarActionHint(reason);
                        return;
                    }

                    const targetInput = document.getElementById(toolbarState.lastFocusedInputId);
                    if (!targetInput) return;

                    const action = btn.dataset.action;

                    // --- New toolbar actions (data-driven) ---
                    if (action === 'wrap') {
                        let prefix = btn.dataset.prefix ?? '';
                        let suffix = btn.dataset.suffix ?? '';
                        const empty = targetInput.selectionStart === targetInput.selectionEnd;
                        const smartInsertMode = String(btn.dataset.smartInsert || '').trim();
                        if (smartInsertMode === 'var') {
                            const text = String(targetInput.value || '');
                            const startPos = Number.isFinite(targetInput.selectionStart) ? targetInput.selectionStart : 0;
                            const endPos = Number.isFinite(targetInput.selectionEnd) ? targetInput.selectionEnd : startPos;
                            const outsideMathAtStart = _getMathModeAtPosition(text, startPos) === null;
                            const outsideMathAtEnd = _getMathModeAtPosition(text, endPos) === null;
                            if (outsideMathAtStart && outsideMathAtEnd) {
                                prefix = '$*';
                                suffix = '*$';
                            } else {
                                prefix = '*';
                                suffix = '*';
                            }
                        }

                        const cursorMode = empty
                            ? (btn.dataset.cursorEmpty || 'inside')
                            : (btn.dataset.cursorSelected || 'inside');

                        const move = (cursorMode === 'inside') ? -suffix.length : 0;
                        insertAtCursor(targetInput, prefix, suffix, move);
                        return;
                    }

                    if (action === 'cmd') {
                        const cmd = btn.dataset.cmd ?? '';
                        const tail = (btn.dataset.tail !== undefined) ? btn.dataset.tail : ' ';
                        const { text, move } = splitMarkerToLegacyMove('\\' + cmd + tail);
                        insertAtCursor(targetInput, text, '', move);
                        return;
                    }

                    if (action === 'tpl') {
                        const tpl = btn.dataset.tpl ?? '';
                        const { text, move } = splitMarkerToLegacyMove(tpl);
                        insertAtCursor(targetInput, text, '', move);
                        return;
                    }

                });
            });

            const extractVariables = (...texts) => {
                const varRegex = /\*([a-zA-Z_][a-zA-Z0-9_]*)\*/g;
                let allVars = new Set();
                texts.forEach(text => {
                    if (!text) return;
                    let match;
                    while (true) {
                        match = varRegex.exec(text);
                        if (match === null) break;
                        allVars.add(match[1]);
                    }
                });
                return Array.from(allVars).sort();
            };
            
            const getDecimalPlaces = (numStr) => {
                if (!numStr) return 0;
                const s = String(numStr).trim();
                const parts = s.split('.');
                if (parts.length < 2) return 0;
                return parts[1].length;
            };


// =============================
// LaTeX -> math.js 변환 + 기호 추출 + min/max
// =============================
const _LATEX_FUNC_MAP = {
    sin: 'sin', cos: 'cos', tan: 'tan',
    sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
    csc: 'csc', sec: 'sec', cot: 'cot',
    arcsin: 'asin', arccos: 'acos', arctan: 'atan',
    asin: 'asin', acos: 'acos', atan: 'atan',
    ln: 'log', log: 'log', exp: 'exp'
};

function _readGroup(s, i) {
    // s[i] must be '{'
    let depth = 0;
    const start = i + 1;
    for (let k = i; k < s.length; k++) {
        const ch = s[k];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth === 0) return { content: s.slice(start, k), next: k + 1 };
    }
    throw new Error("LaTeX 중괄호 {}가 닫히지 않았습니다.");
}

function _readParenGroup(s, i) {
    // s[i] must be '('
    let depth = 0;
    for (let k = i; k < s.length; k++) {
        const c = s[k];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        if (depth === 0) {
            return { content: s.slice(i + 1, k), next: k + 1 };
        }
    }
    throw new Error("LaTeX 괄호 ()가 닫히지 않았습니다.");
}

function _readAtom(s, i) {
    const ch = s[i];
    if (!ch) return { atom: '', next: i };
    if (ch === '{') {
        const g = _readGroup(s, i);
        return { atom: '(' + _latexToMathjsCore(g.content) + ')', next: g.next };
    }
    if (ch === '(') {
        const g = _readParenGroup(s, i);
        return { atom: '(' + _latexToMathjsCore(g.content) + ')', next: g.next };
    }
    const num = s.slice(i).match(/^[0-9]+(\.[0-9]+)?/);
    if (num) return { atom: num[0], next: i + num[0].length };
    const id = s.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (id) return { atom: id[0], next: i + id[0].length };
    return { atom: ch, next: i + 1 };
}

function _latexToMathjsCore(latex) {
    let s = String(latex || '');
    // remove $ delimiters and \left/\right
    s = s.replace(/\$/g, '');
    s = s.replace(/\\left/g, '').replace(/\\right/g, '');

    // spacing commands
    s = s.replace(/\\,/g, '').replace(/\\;/g, '').replace(/\\!/g, '').replace(/\\\s/g, '');

    // operators
    s = s.replace(/\\times\b/g, '*').replace(/\\cdot\b/g, '*');

    // constants/symbols
    s = s.replace(/\\pi\b/g, 'pi');
    s = s.replace(/\\mathrm\{e\}/g, 'e');

    // IMPORTANT: do NOT blindly collapse subscripts before handling \log_{a}(...)
    // We'll keep subscripts and handle selectively.

    let out = '';
    for (let i = 0; i < s.length; ) {
        const ch = s[i];

        if (ch === '\\') {
            const m = s.slice(i + 1).match(/^[a-zA-Z]+/);
            if (!m) throw new Error(`지원하지 않는 LaTeX 명령: \\${s[i+1] || ''}`);
            const name = m[0];
            i += 1 + name.length;

            if (name === 'frac') {
                if (s[i] !== '{') throw new Error("\\frac 뒤에는 { }가 와야 합니다.");
                const g1 = _readGroup(s, i); i = g1.next;
                if (s[i] !== '{') throw new Error("\\frac 분모는 { }로 감싸야 합니다.");
                const g2 = _readGroup(s, i); i = g2.next;
                out += '((' + _latexToMathjsCore(g1.content) + ')/(' + _latexToMathjsCore(g2.content) + '))';
                continue;
            }

            if (name === 'sqrt') {
                if (s[i] !== '{') throw new Error("\\sqrt 뒤에는 { }가 와야 합니다.");
                const g = _readGroup(s, i); i = g.next;
                out += 'sqrt(' + _latexToMathjsCore(g.content) + ')';
                continue;
            }

            // Special: \log_{a}(x) -> log(x, a)

            // functions
            const mapped = _LATEX_FUNC_MAP[name];
            if (mapped) {
                while (s[i] === ' ') i++;

// Base-notation log: \log_{a}(x)  ->  log(x, a)
                if (name === 'log' && s[i] === '_') {
                    // parse base after underscore: _{...} or _a
                    i++; // skip '_'
                    while (s[i] === ' ') i++;
                    let baseAtom = '';
                    if (s[i] === '{') {
                        const gb = _readGroup(s, i); i = gb.next;
                        baseAtom = '(' + _latexToMathjsCore(gb.content) + ')';
                    } else {
                        const ab = _readAtom(s, i);
                        baseAtom = '(' + ab.atom + ')';
                        i = ab.next;
                    }
                    while (s[i] === ' ') i++;

                    // argument: ( ... ) or { ... } or atom
                    const arg = _readAtom(s, i);
                    if (!arg.atom) throw new Error(`\\log 뒤에 인자가 필요합니다.`);
                    i = arg.next;

                    out += 'log(' + arg.atom + ', ' + baseAtom + ')';
                    continue;
                }
                const atom = _readAtom(s, i);
                if (!atom.atom) throw new Error(`\\${name} 뒤에 인자가 필요합니다.`);
                i = atom.next;
                out += mapped + '(' + atom.atom + ')';
                continue;
            }

            // fallback: unsupported commands
            throw new Error(`지원하지 않는 LaTeX 명령: \\${name}`);
        }

        if (ch === '{') {
            const g = _readGroup(s, i);
            out += '(' + _latexToMathjsCore(g.content) + ')';
            i = g.next;
            continue;
        }

        if (ch === '^') {
            i++;
            let expAtom;
            if (s[i] === '{') {
                const g = _readGroup(s, i);
                expAtom = '(' + _latexToMathjsCore(g.content) + ')';
                i = g.next;
            } else {
                const a = _readAtom(s, i);
                expAtom = '(' + a.atom + ')';
                i = a.next;
            }
            out += '^' + expAtom;
            continue;
        }

        if (ch === '_') {
            // 일반 subscript: x_{1} -> x1 (best-effort)
            // NOTE: \log_{a}는 위에서 별도 처리함
            i++;
            while (s[i] === ' ') i++;
            if (s[i] === '{') {
                const g = _readGroup(s, i);
                out += _latexToMathjsCore(g.content);
                i = g.next;
            } else {
                const a = _readAtom(s, i);
                out += a.atom;
                i = a.next;
            }
            continue;
        }

        out += ch;
        i++;
    }

    return out;
}

function _tokenizeExpr(expr) {
    const re = /\s*([0-9]+(?:\.[0-9]+)?|[a-zA-Z_][a-zA-Z0-9_]*|[\+\-\*\/\^\(\),])/g;
    const toks = [];
    let m;
    while (true) {
        m = re.exec(expr);
        if (m === null) break;
        toks.push(m[1]);
    }
    return toks;
}

function _insertImplicitMultiplication(expr) {
    const toks = _tokenizeExpr(expr);
    const out = [];
    const isId = (t) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t);
    const isNum = (t) => /^[0-9]+(\.[0-9]+)?$/.test(t);
    const isFuncCall = (a, b) => isId(a) && b === '('; // f(
    const canLeft = (t) => isNum(t) || isId(t) || t === ')';
    const canRight = (t) => isNum(t) || isId(t) || t === '(';

    for (let i = 0; i < toks.length; i++) {
        const a = toks[i];
        const b = toks[i + 1];
        out.push(a);
        if (!b) continue;
        if (isFuncCall(a, b)) continue;
        if (canLeft(a) && canRight(b)) out.push('*');
    }
    return out.join(' ');
}

function latexToMathjs(latex) {
    let expr = _latexToMathjsCore(latex);
    expr = _insertImplicitMultiplication(expr);
    expr = expr.replace(/\s+/g, '');

        if (/[{}\\]/.test(expr)) {
            throw new Error("변환 규칙에 맞지 않는 LaTeX가 포함되어 있습니다. (지원: \\frac, \\sqrt, \\sin/\\cos/\\tan, \\sinh/\\cosh/\\tanh, \\arcsin/\\arccos/\\arctan, \\ln/\\log, \\log_{a}(x), \\exp, 거듭제곱 ^ )");
        }

    try {
        math.parse(expr); // parse check
    } catch (e) {
        throw new Error("계산식 문법 오류: " + e.message);
    }

    return expr;
}

function extractSymbolsFromMathjs(expr) {
    const node = math.parse(String(expr || ''));
    const symbols = new Set();
    node.traverse((n) => {
        if (n && n.isSymbolNode) symbols.add(String(n.name || ''));
    });

    const builtins = new Set(['pi', 'e', 'i', 'Infinity', 'NaN', 'true', 'false']);
    const funcs = new Set([
        'sin','cos','tan','csc','sec','cot','asin','acos','atan',
        'sinh','cosh','tanh','asinh','acosh','atanh',
        'log','ln','exp','sqrt','abs',
        'min','max','pow'
    ]);

    return [...symbols]
        .filter((s) => s && !builtins.has(s) && !funcs.has(s))
        .sort();
}

const _getRandomExamCompatHost = () => {
    if (typeof window !== 'undefined' && window) return window;
    if (typeof globalThis !== 'undefined' && globalThis) return globalThis;
    return null;
};

const _getRandomExamCompatApi = () => {
    const host = _getRandomExamCompatHost();
    if (!host) return null;
    const api = host.RandomExamCompat;
    return (api && typeof api === 'object') ? api : null;
};

const _getRandomExamCompatCache = () => {
    const host = _getRandomExamCompatHost();
    if (!host) return null;
    if (host.__randomExamCompatDiagnosticsCache instanceof Map) {
        return host.__randomExamCompatDiagnosticsCache;
    }
    const created = new Map();
    host.__randomExamCompatDiagnosticsCache = created;
    return created;
};

const _buildRandomExamCompatCacheKey = (question) => {
    const vars = Array.isArray(question?.variables)
        ? question.variables.map((v) => `${v?.name ?? ''}\u0001${v?.min ?? ''}\u0001${v?.max ?? ''}`).join('\u0002')
        : '';
    return `${question?.id ?? ''}\u0000${question?.text ?? ''}\u0000${question?.answer ?? ''}\u0000${question?.points ?? ''}\u0000${vars}`;
};

const _getRandomExamCompatCacheSlot = (index) => {
    const idx = Number(index);
    if (Number.isInteger(idx) && idx >= 0) return `q:${idx}`;
    return 'q:unknown';
};

const _normalizeRandomExamCompatDiagnostics = (raw) => {
    const src = (raw && typeof raw === 'object') ? raw : {};
    return {
        errors: Array.isArray(src.errors) ? src.errors.filter(msg => typeof msg === 'string' && msg) : [],
        warnings: Array.isArray(src.warnings) ? src.warnings.filter(msg => typeof msg === 'string' && msg) : [],
        quickFixes: Array.isArray(src.quickFixes) ? src.quickFixes.filter(item => item && typeof item === 'object') : []
    };
};

const _buildRandomExamCompatRuntimeErrorMessage = (index, detail) => {
    const questionLabel = `${index + 1}번 문항`;
    const tail = detail ? ` (${detail})` : '';
    return `[${questionLabel}] random-exam-generator 호환성: 호환성 모듈을 불러오지 못해 검사를 수행할 수 없습니다${tail}. 페이지를 새로고침하고 스크립트 로드를 확인하세요.`;
};

const _buildRandomExamCompatRuntimeDiag = (index, detail) => ({
    errors: [_buildRandomExamCompatRuntimeErrorMessage(index, detail)],
    warnings: [],
    quickFixes: []
});

const _computeRandomExamCompatibilityDiagnostics = (question, index) => {
    const compatApi = _getRandomExamCompatApi();
    if (compatApi &&
        typeof compatApi.diagnoseTextCompileCompatibility === 'function' &&
        typeof compatApi.diagnoseAnswerParserCompatibility === 'function') {
        const textDiag = _normalizeRandomExamCompatDiagnostics(
            compatApi.diagnoseTextCompileCompatibility(question, index, extractVariables)
        );
        const answerDiag = _normalizeRandomExamCompatDiagnostics(
            compatApi.diagnoseAnswerParserCompatibility(question, index, extractVariables)
        );
        return {
            errors: [...textDiag.errors, ...answerDiag.errors],
            warnings: [...textDiag.warnings, ...answerDiag.warnings],
            quickFixes: [...textDiag.quickFixes, ...answerDiag.quickFixes]
        };
    }
    if (compatApi && typeof compatApi.diagnoseQuestionCompatibility === 'function') {
        return _normalizeRandomExamCompatDiagnostics(
            compatApi.diagnoseQuestionCompatibility(question, index, extractVariables)
        );
    }
    if (compatApi && typeof compatApi.validateQuestionCompatibility === 'function') {
        const errors = compatApi.validateQuestionCompatibility(question, index, extractVariables);
        return {
            errors: Array.isArray(errors) ? errors.filter(msg => typeof msg === 'string' && msg) : [],
            warnings: [],
            quickFixes: []
        };
    }
    return _buildRandomExamCompatRuntimeDiag(index, '필수 API 누락');
};

const getRandomExamCompatibilityDiagnostics = (question, index) => {
    const cache = _getRandomExamCompatCache();
    const cacheKey = _buildRandomExamCompatCacheKey(question);
    const cacheSlot = _getRandomExamCompatCacheSlot(index);
    if (cache && cache.has(cacheSlot)) {
        const cached = cache.get(cacheSlot);
        if (cached && typeof cached === 'object' && cached.key === cacheKey) {
            return _normalizeRandomExamCompatDiagnostics(cached.diag);
        }
    }

    try {
        const diag = _normalizeRandomExamCompatDiagnostics(
            _computeRandomExamCompatibilityDiagnostics(question, index)
        );
        if (cache) cache.set(cacheSlot, { key: cacheKey, diag });
        return diag;
    } catch (err) {
        const detail = String(err?.message || err || '').trim();
        const diag = _buildRandomExamCompatRuntimeDiag(index, detail || '실행 오류');
        if (cache) cache.set(cacheSlot, { key: cacheKey, diag });
        return diag;
    }
};

const validateRandomExamCompatibility = (question, index) => {
    const diag = getRandomExamCompatibilityDiagnostics(question, index);
    return Array.isArray(diag?.errors) ? diag.errors : [];
};

const applyRandomExamCompatQuickFix = (question, quickFix) => {
    if (!question || typeof question !== 'object') return false;
    const fix = (quickFix && typeof quickFix === 'object') ? quickFix : null;
    if (!fix || (
        fix.action !== 'replace_greek_unicode' &&
        fix.action !== 'escape_text_special_chars' &&
        fix.action !== 'replace_text_unicode_symbols' &&
        fix.action !== 'normalize_text_unicode' &&
        fix.action !== 'wrap_math_only_text_commands' &&
        fix.action !== 'replace_unicode_supsub'
    )) return false;

    const field = (fix.field === 'answer') ? 'answer' : 'text';
    const compatApi = (typeof window !== 'undefined' && window.RandomExamCompat) ? window.RandomExamCompat : null;

    const original = String(question[field] || '');
    let replacer = null;
    if (fix.action === 'replace_greek_unicode') {
        if (!compatApi || typeof compatApi.replaceGreekUnicodeWithLatex !== 'function') return false;
        replacer = (field === 'text' && typeof compatApi.replaceGreekUnicodeWithLatexInText === 'function')
            ? compatApi.replaceGreekUnicodeWithLatexInText
            : compatApi.replaceGreekUnicodeWithLatex;
    } else if (fix.action === 'escape_text_special_chars') {
        if (!compatApi || typeof compatApi.escapeTextLatexSpecialChars !== 'function') return false;
        replacer = compatApi.escapeTextLatexSpecialChars;
    } else if (fix.action === 'replace_text_unicode_symbols') {
        if (!compatApi || typeof compatApi.replaceTextUnicodeSymbolsWithLatexInText !== 'function') return false;
        replacer = compatApi.replaceTextUnicodeSymbolsWithLatexInText;
    } else if (fix.action === 'normalize_text_unicode') {
        if (!compatApi || typeof compatApi.normalizeTextUnicode !== 'function') return false;
        replacer = compatApi.normalizeTextUnicode;
    } else if (fix.action === 'wrap_math_only_text_commands') {
        if (!compatApi || typeof compatApi.wrapMathOnlyCommandsOutsideMathInText !== 'function') return false;
        replacer = compatApi.wrapMathOnlyCommandsOutsideMathInText;
    } else if (fix.action === 'replace_unicode_supsub') {
        if (!compatApi || typeof compatApi.replaceUnicodeSupSubWithLatexInText !== 'function') return false;
        replacer = compatApi.replaceUnicodeSupSubWithLatexInText;
    }
    if (typeof replacer !== 'function') return false;

    const replaced = replacer(original);
    if (!replaced || typeof replaced.text !== 'string' || replaced.text === original) return false;

    question[field] = replaced.text;
    return true;
};

function _mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function _boundsFromQuestion(q) {
    const bounds = {};
    (q.variables || []).forEach(v => {
        const mn = Number(v.min), mx = Number(v.max);
        if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
            throw new Error(`변수 '${v.name}'의 범위가 숫자가 아닙니다.`);
        }
        bounds[v.name] = { min: mn, max: mx };
    });
    return bounds;
}

function _fmtNum(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
    if (Number.isInteger(v)) {
        const s = String(v);
        return s.length <= 5 ? s : v.toPrecision(5);
    }
    return v.toPrecision(5).replace(/\.?0+$/, '');
}

function evaluateMinMaxApprox(compiled, bounds, samples, seed) {
    const names = Object.keys(bounds);
    if (!names.length) throw new Error("변수 범위가 없습니다. 변수 정보에 최소/최대값을 입력하세요.");

    const rng = _mulberry32(seed || 1);
    const evalAt = (scope) => {
        const y = compiled.evaluate(scope);
        const val = (typeof y === 'number') ? y : (y?.valueOf?.() ?? NaN);
        return Number(val);
    };

    let minVal = Infinity, maxVal = -Infinity;
    let argMin = null, argMax = null;

    const tryPoint = (scope) => {
        let y;
        try { y = evalAt(scope); } catch { return; }
        if (!Number.isFinite(y)) return;
        if (y < minVal) { minVal = y; argMin = { ...scope }; }
        if (y > maxVal) { maxVal = y; argMax = { ...scope }; }
    };

    const n = names.length;
    const cornerCount = 1 << Math.min(n, 12);
    if (n <= 12) {
        for (let mask = 0; mask < (1 << n); mask++) {
            const scope = {};
            for (let i = 0; i < n; i++) {
                const b = bounds[names[i]];
                scope[names[i]] = (mask & (1 << i)) ? b.max : b.min;
            }
            tryPoint(scope);
        }
    } else {
        for (let k = 0; k < cornerCount; k++) {
            const scope = {};
            for (let i = 0; i < n; i++) {
                const b = bounds[names[i]];
                scope[names[i]] = (rng() < 0.5) ? b.min : b.max;
            }
            tryPoint(scope);
        }
    }

    samples = Math.max(200, Math.min(50000, Math.floor(samples || 2000)));
    for (let s = 0; s < samples; s++) {
        const scope = {};
        for (const name of names) {
            const b = bounds[name];
            scope[name] = b.min + (b.max - b.min) * rng();
        }
        tryPoint(scope);
    }

    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
        throw new Error("유효한 값이 계산되지 않았습니다. (정의역 오류/0으로 나눔/무한/NaN 등)");
    }

    return { minVal, maxVal, argMin, argMax };
}

function _escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
}

function _scopeToChips(scope) {
    if (!scope || typeof scope !== 'object') return '';
    const keys = Object.keys(scope).sort();
    if (keys.length === 0) return '<span class="text-gray-400">(없음)</span>';
    return `<div class="flex flex-wrap gap-1">` + keys.map(k => {
        const v = scope[k];
        return `<span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-mono text-gray-700">${_escapeHtml(k)}=<span class="font-semibold text-gray-900 ml-0.5">${_escapeHtml(_fmtNum(Number(v)))}</span></span>`;
    }).join('') + `</div>`;
}


            const getCurrentQuestion = () => state.questions[state.currentIndex];

            const normalizeLatexTextForPreview = (text) => {
                const raw = String(text || '');
                if (!raw) return '';

                const isEscapedAt = (idx) => {
                    let slashCount = 0;
                    for (let i = idx - 1; i >= 0; i--) {
                        if (raw[i] !== '\\') break;
                        slashCount += 1;
                    }
                    return (slashCount % 2) === 1;
                };

                const out = [];
                let mathMode = null; // null | '$' | '$$'
                for (let i = 0; i < raw.length; i++) {
                    const ch = raw[i];

                    if (ch === '$' && !isEscapedAt(i)) {
                        const next = raw[i + 1] || '';
                        const canUseDouble = (next === '$' && !isEscapedAt(i + 1) && mathMode !== '$');
                        if (canUseDouble) {
                            out.push('$$');
                            mathMode = (mathMode === '$$') ? null : '$$';
                            i += 1;
                            continue;
                        }
                        out.push('$');
                        mathMode = (mathMode === '$') ? null : '$';
                        continue;
                    }

                    if (mathMode) {
                        out.push(ch);
                        continue;
                    }

                    if (ch !== '\\') {
                        out.push(ch);
                        continue;
                    }

                    const next = raw[i + 1] || '';
                    if ('%&#_{}$'.includes(next)) {
                        out.push(next);
                        i += 1;
                        continue;
                    }
                    if (next === '^' && raw[i + 2] === '{' && raw[i + 3] === '}') {
                        out.push('^');
                        i += 3;
                        continue;
                    }
                    if (next === '~' && raw[i + 2] === '{' && raw[i + 3] === '}') {
                        out.push('~');
                        i += 3;
                        continue;
                    }

                    // Keep unknown commands as-is so users can still spot/inspect them.
                    out.push(ch);
                }
                return out.join('');
            };

            const highlightVarsInKatex = (text) => {
                const normalized = normalizeLatexTextForPreview(text || '');

                const isEscapedAt = (s, idx) => {
                    let slashCount = 0;
                    for (let i = idx - 1; i >= 0; i--) {
                        if (s[i] !== '\\') break;
                        slashCount += 1;
                    }
                    return (slashCount % 2) === 1;
                };

                const renderMathSegment = (segment) => {
                    return _escapeHtml(segment).replace(/\*([a-zA-Z_][a-zA-Z0-9_]*)\*/g,
                        (match, varName) => `{\\color{#2563EB}\\mathbf{${varName}}}`);
                };

                const renderLatexTextSegment = (segment) => {
                    const findMatchingBrace = (s, startIdx) => {
                        if (startIdx < 0 || startIdx >= s.length || s[startIdx] !== '{') return -1;
                        let depth = 0;
                        for (let i = startIdx; i < s.length; i++) {
                            if (s[i] === '{') depth += 1;
                            else if (s[i] === '}') depth -= 1;
                            if (depth === 0) return i;
                        }
                        return -1;
                    };

                    const renderInner = (s) => {
                        const formatCommands = [
                            { cmd: '\\textbf', open: '<strong>', close: '</strong>' },
                            { cmd: '\\textit', open: '<em>', close: '</em>' },
                            { cmd: '\\emph', open: '<em>', close: '</em>' },
                            { cmd: '\\underline', open: '<span class="underline">', close: '</span>' },
                            { cmd: '\\texttt', open: '<code>', close: '</code>' },
                        ];
                        let out = '';

                        for (let i = 0; i < s.length;) {
                            if (s.startsWith('\\\\', i)) {
                                out += '<br>';
                                i += 2;
                                continue;
                            }
                            if (s.startsWith('\\newline', i)) {
                                out += '<br>';
                                i += '\\newline'.length;
                                continue;
                            }
                            if (s.startsWith('\\par', i)) {
                                out += '<br><br>';
                                i += '\\par'.length;
                                continue;
                            }
                            if (s.startsWith('\\qquad', i)) {
                                out += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
                                i += '\\qquad'.length;
                                continue;
                            }
                            if (s.startsWith('\\quad', i)) {
                                out += '&nbsp;&nbsp;&nbsp;&nbsp;';
                                i += '\\quad'.length;
                                continue;
                            }

                            let handledFormat = false;
                            for (const format of formatCommands) {
                                const groupStart = i + format.cmd.length;
                                if (!s.startsWith(`${format.cmd}{`, i)) continue;
                                const groupEnd = findMatchingBrace(s, groupStart);
                                if (groupEnd < 0) break;
                                const inner = s.slice(groupStart + 1, groupEnd);
                                out += `${format.open}${renderInner(inner)}${format.close}`;
                                i = groupEnd + 1;
                                handledFormat = true;
                                break;
                            }
                            if (handledFormat) continue;

                            const ch = s[i];
                            if (ch === '~') {
                                out += '&nbsp;';
                                i += 1;
                                continue;
                            }
                            if (ch === '\r' || ch === '\n') {
                                const consumeLineBreak = (idx) => {
                                    if (s[idx] === '\r' && s[idx + 1] === '\n') return idx + 2;
                                    if (s[idx] === '\r' || s[idx] === '\n') return idx + 1;
                                    return idx;
                                };

                                const firstBreakEnd = consumeLineBreak(i);
                                let probe = firstBreakEnd;
                                while (probe < s.length && (s[probe] === ' ' || s[probe] === '\t')) probe += 1;
                                const hasSecondBreak = (probe < s.length) && (s[probe] === '\r' || s[probe] === '\n');

                                if (hasSecondBreak) {
                                    out += '<br><br>';
                                    i = consumeLineBreak(probe);
                                    continue;
                                }

                                // LaTeX plain text: single line break is treated like a space.
                                out += ' ';
                                i = firstBreakEnd;
                                continue;
                            }
                            out += _escapeHtml(ch);
                            i += 1;
                        }
                        return out;
                    };

                    return renderInner(segment);
                };

                const out = [];
                let buf = '';
                let mathMode = null; // null | '$' | '$$'

                for (let i = 0; i < normalized.length; i++) {
                    const ch = normalized[i];
                    if (ch === '$' && !isEscapedAt(normalized, i)) {
                        const next = normalized[i + 1] || '';
                        const canUseDouble = (next === '$' && !isEscapedAt(normalized, i + 1) && mathMode !== '$');
                        const delim = canUseDouble ? '$$' : '$';
                        if (!mathMode) {
                            if (buf) out.push(renderLatexTextSegment(buf));
                            buf = delim;
                            mathMode = delim;
                        } else if (mathMode === delim) {
                            buf += delim;
                            out.push(renderMathSegment(buf));
                            buf = '';
                            mathMode = null;
                        } else {
                            buf += delim;
                        }
                        i += (delim.length - 1);
                        continue;
                    }
                    buf += ch;
                }

                if (buf) {
                    out.push(mathMode ? renderMathSegment(buf) : renderLatexTextSegment(buf));
                }
                return out.join('');
            };

            const normalizeQuestionId = (id) => String(id ?? '').trim();
            const normalizeQuestionPoints = (value) => {
                if (value === undefined || value === null) return '';
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (!trimmed) return '';
                    const parsed = Number(trimmed);
                    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) return '';
                    return String(parsed);
                }
                if (typeof value === 'number') {
                    return (Number.isFinite(value) && value >= 0 && Number.isInteger(value))
                        ? String(value)
                        : '';
                }
                return '';
            };
            const coerceQuestionPointsInput = (value) => {
                if (value === undefined || value === null) return '';
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (!trimmed) return '';
                    const normalized = normalizeQuestionPoints(trimmed);
                    return normalized !== '' ? normalized : trimmed;
                }
                if (typeof value === 'number') {
                    if (!Number.isFinite(value)) return '';
                    const normalized = normalizeQuestionPoints(value);
                    return normalized !== '' ? normalized : String(value);
                }
                return '';
            };
            const normalizeQuestionVariables = (variables) => {
                if (!Array.isArray(variables)) return [];
                return variables
                    .filter(v => v && typeof v === 'object' && !Array.isArray(v))
                    .map(v => {
                        const name = (typeof v.name === 'string') ? v.name : '';
                        const min = (typeof v.min === 'string' || typeof v.min === 'number') ? v.min : '';
                        const max = (typeof v.max === 'string' || typeof v.max === 'number') ? v.max : '';
                        return { name, min, max };
                    });
            };

            const sanitizeQuestionForExport = (q) => {
                const out = {
                    id: normalizeQuestionId(q?.id),
                    title: q?.title || '',
                    text: q?.text || '',
                    answer: q?.answer || '',
                    variables: normalizeQuestionVariables(q?.variables)
                };
                const normalizedPoints = normalizeQuestionPoints(q?.points);
                if (normalizedPoints !== '') {
                    out.points = Number(normalizedPoints);
                }
                return out;
            };

            const getDuplicateIdIndexes = (questions, id, excludeIndex = -1) => {
                const target = normalizeQuestionId(id);
                if (!target) return [];
                const out = [];
                (questions || []).forEach((q, idx) => {
                    if (idx === excludeIndex) return;
                    if (normalizeQuestionId(q?.id) === target) out.push(idx + 1);
                });
                return out;
            };

            const _validationCache = new Map();
            const _getQuestionHash = (q) => {
                const vars = Array.isArray(q?.variables)
                    ? q.variables.map(v => `${v?.name ?? ''}\u0001${v?.min ?? ''}\u0001${v?.max ?? ''}`).join('\u0002')
                    : '';
                return `${q?.id ?? ''}\u0000${q?.text ?? ''}\u0000${q?.answer ?? ''}\u0000${q?.points ?? ''}\u0000${vars}`;
            };

            const validateQuestion = (question, index) => {
                const errors = [];
                const questionLabel = `${index + 1}번 문항`;
                const prefix = `[${questionLabel}] `;
                const normalizedId = normalizeQuestionId(question.id);

                // 변수 목록은 지문의 *var* 표기를 기준으로 구성한다.
                const varsInText = extractVariables(question.text || '');

                if (!normalizedId) {
                    errors.push(prefix + "문제 ID를 입력하세요.");
                } else if (!/^[a-zA-Z0-9_()-]+$/.test(normalizedId)) {
                    errors.push(prefix + "ID는 영문, 숫자, 밑줄(_), 하이픈(-), 괄호()만 사용할 수 있습니다.");
                } else {
                    const duplicates = getDuplicateIdIndexes(state.questions, normalizedId, index);
                    if (duplicates.length > 0) {
                        const duplicateLabels = duplicates.map(n => `${n}번 문항`);
                        errors.push(prefix + `동일한 ID '${normalizedId}'가 이미 사용되었습니다. (${duplicateLabels.join(', ')})`);
                    }
                }

                if (!(question.text || '').trim()) errors.push(prefix + "지문을 입력하세요.");
                if (!(question.answer || '').trim()) errors.push(prefix + "정답식을 입력하세요.");

                const hasPointsInput = question.points !== undefined
                    && question.points !== null
                    && String(question.points).trim() !== '';
                if (hasPointsInput && normalizeQuestionPoints(question.points) === '') {
                    errors.push(prefix + "배점은 0 이상의 정수만 입력하세요.");
                }

                if ((question.text || '').trim() && varsInText.length === 0) {
                    errors.push(prefix + "지문에 지정된 변수가 없습니다. *var* 형식으로 변수를 입력하세요.");
                }

                const variableNameCounts = new Map();
                (question.variables || []).forEach(v => {
                    const name = String(v?.name || '');
                    if (!name) return;
                    variableNameCounts.set(name, (variableNameCounts.get(name) || 0) + 1);
                });
                const duplicateVarNames = [...variableNameCounts.entries()]
                    .filter(([, count]) => count > 1)
                    .map(([name]) => name);
                if (duplicateVarNames.length > 0) {
                    errors.push(prefix + `변수 정보 목록에 중복된 이름이 있습니다: ${duplicateVarNames.join(', ')}`);
                }

                const definedVarNames = new Set((question.variables || []).map(v => v.name));

                if ((varsInText.length > 0 || definedVarNames.size > 0) &&
                    (varsInText.length !== definedVarNames.size ||
                     !varsInText.every(v => definedVarNames.has(v)))) {
                    errors.push(prefix + "지문 변수(*var*)와 변수 정보 목록이 일치하지 않습니다.");
                }

                (question.variables || []).forEach(v => {
                    if (!v.name) errors.push(prefix + "변수 이름이 비어있습니다.");
                    if (v.min === '' || v.max === '') {
                        errors.push(prefix + `변수 '${v.name}'의 최소/최대값을 모두 입력하세요.`);
                    } else {
                        if (isNaN(Number(v.min)) || isNaN(Number(v.max))) {
                            errors.push(prefix + `변수 '${v.name}'의 범위는 숫자여야 합니다.`);
                        } else if (Number(v.min) > Number(v.max)) {
                            errors.push(prefix + `변수 '${v.name}'의 최소값이 최대값보다 클 수 없습니다.`);
                        }
                        if (getDecimalPlaces(v.min) !== getDecimalPlaces(v.max)) {
                            errors.push(prefix + `변수 '${v.name}'의 최소/최대값의 소수점 자릿수가 다릅니다.`);
                        }
                    }
                });

                errors.push(...validateRandomExamCompatibility(question, index));

                return errors;
            };

            const validateQuestionCached = (question, index) => {
                const hash = _getQuestionHash(question);
                const cached = _validationCache.get(index);
                if (cached && cached.hash === hash) return cached.errors;
                const errors = validateQuestion(question, index);
                _validationCache.set(index, { hash, errors });
                return errors;
            };

            const validateAll = () => {
                let allErrors = [];
                state.questions.forEach((q, idx) => {
                    allErrors = allErrors.concat(validateQuestion(q, idx));
                });
                return allErrors;
            };

            const validateAllCached = () => {
                let allErrors = [];
                state.questions.forEach((q, idx) => {
                    allErrors = allErrors.concat(validateQuestionCached(q, idx));
                });
                return allErrors;
            };

            const collectGlobalCompatibilityWarnings = () => {
                const byQuestion = [];
                let totalWarnings = 0;
                state.questions.forEach((q, idx) => {
                    const diag = getRandomExamCompatibilityDiagnostics(q, idx);
                    const warnings = Array.isArray(diag?.warnings)
                        ? diag.warnings.filter(msg => typeof msg === 'string' && msg)
                        : [];
                    if (warnings.length <= 0) return;
                    byQuestion.push({ index: idx, warnings });
                    totalWarnings += warnings.length;
                });
                return {
                    totalWarnings,
                    questionCount: byQuestion.length,
                    byQuestion
                };
            };

            const buildGlobalCompatibilityWarningConfirmMessage = (summary) => {
                const src = (summary && typeof summary === 'object') ? summary : {};
                const totalWarnings = Number.isFinite(src.totalWarnings) ? Math.max(0, Math.trunc(src.totalWarnings)) : 0;
                const byQuestion = Array.isArray(src.byQuestion) ? src.byQuestion : [];
                const questionCount = Number.isFinite(src.questionCount) ? Math.max(0, Math.trunc(src.questionCount)) : byQuestion.length;
                if (totalWarnings <= 0 || questionCount <= 0) return '';

                const lines = [
                    `random-exam-generator 경고 ${totalWarnings}건 (${questionCount}개 문항).`,
                    '저장은 가능하며, 생성기 실행 전 확인하세요.',
                    '',
                    '[경고 문항 요약]'
                ];

                const previewCount = 8;
                byQuestion.slice(0, previewCount).forEach(({ index, warnings }) => {
                    const warningCount = Array.isArray(warnings) ? warnings.length : 0;
                    lines.push(`- ${index + 1}번 문항: ${warningCount}건`);
                });
                if (questionCount > previewCount) {
                    lines.push(`- 외 ${questionCount - previewCount}개 문항`);
                }

                lines.push('');
                lines.push('그래도 저장할까요?');
                return lines.join('\n');
            };

            const _invalidQuestionIndexes = new Set();
            let _isValidationIndexDirty = true;

            const _resetValidationState = () => {
                _validationCache.clear();
                try {
                    const host = (typeof window !== 'undefined' && window)
                        ? window
                        : ((typeof globalThis !== 'undefined') ? globalThis : null);
                    const cache = host?.__randomExamCompatDiagnosticsCache;
                    if (cache instanceof Map) cache.clear();
                } catch (_) {
                    // Ignore cache cleanup failures.
                }
                _invalidQuestionIndexes.clear();
                _isValidationIndexDirty = true;
            };

            const _syncInvalidQuestionForIndex = (index) => {
                const idx = Number(index);
                if (!Number.isInteger(idx) || idx < 0 || idx >= state.questions.length) return;
                const errs = validateQuestionCached(state.questions[idx], idx);
                if (errs.length > 0) _invalidQuestionIndexes.add(idx);
                else _invalidQuestionIndexes.delete(idx);
            };

            const _rebuildInvalidQuestionIndexes = () => {
                _invalidQuestionIndexes.clear();
                state.questions.forEach((q, idx) => {
                    const errs = validateQuestionCached(q, idx);
                    if (errs.length > 0) _invalidQuestionIndexes.add(idx);
                });
                _isValidationIndexDirty = false;
            };

            const formatQuestionTreeLabel = (index, question) => {
                const idx = Number(index);
                const safeIndex = Number.isFinite(idx) && idx >= 0 ? Math.trunc(idx) : 0;
                return `${safeIndex + 1}번`;
            };
            const _treeItemSearchIndex = new WeakMap();
            const _makeTreeActionFocusable = (el) => {
                if (!el || el.dataset.keyboardActionBound === '1') return;
                el.tabIndex = 0;
                el.setAttribute('role', 'button');
                el.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    e.stopPropagation();
                    el.click();
                });
                el.dataset.keyboardActionBound = '1';
            };

            const filterTreeItemsInList = (listEl, query) => {
                if (!listEl) return;
                const q = String(query || '').toLowerCase().trim();
                listEl.querySelectorAll('.tree-item').forEach(item => {
                    const searchText = _treeItemSearchIndex.get(item) || item.dataset.searchText || '';
                    item.style.display = (!q || searchText.includes(q)) ? '' : 'none';
                });
                // Future-proof: if grouped tree nodes are used, hide empty groups.
                listEl.querySelectorAll('.tree-group').forEach(grp => {
                    const visible = grp.querySelectorAll('.tree-item:not([style*="display: none"])');
                    grp.style.display = (!q || visible.length > 0) ? '' : 'none';
                });
            };

            // Helper: build flat tree items into a container
            const _patchTreeItems = (container, questions, activeIdx) => {
                while (container.children.length > questions.length) {
                    container.removeChild(container.lastElementChild);
                }

                questions.forEach((q, idx) => {
                    const key = `${idx}\u0000${q.id || ''}\u0000${q.title || ''}`;
                    let item = container.children[idx];

                    if (!item) {
                        item = document.createElement('div');
                        container.appendChild(item);
                    }
                    _makeTreeActionFocusable(item);

                    if (item.dataset._key !== key) {
                        item.className = 'tree-item' + (idx === activeIdx ? ' active' : '');
                        item.dataset._key = key;
                        item.dataset.idx = String(idx);
                        item.innerHTML = `<span class="tree-item-num">${idx + 1}</span>`
                            + (q.id ? `<span class="tree-item-id">${_escapeHtml(q.id)}</span>` : '')
                            + (q.title ? `<span class="tree-item-title">${_escapeHtml(q.title)}</span>` : '');
                    } else {
                        item.classList.toggle('active', idx === activeIdx);
                    }
                    _treeItemSearchIndex.set(item, `${q.id || ''} ${q.title || ''} ${q.text || ''}`.toLowerCase());
                });
            };

            const updateQuestionSelectorUI = () => {
                if (!dom.questionTreeLabel || !dom.questionTreeList) return;
                const current = state.questions[state.currentIndex] || {};
                dom.questionTreeLabel.textContent = formatQuestionTreeLabel(state.currentIndex, current);
                _patchTreeItems(dom.questionTreeList, state.questions, state.currentIndex);
                filterTreeItemsInList(dom.questionTreeList, dom.questionTreeSearch?.value || '');
            };

            let _lastVarsKey = '';

            const updateVariablesUIForCurrentQuestion = () => {
                const current = getCurrentQuestion();
                // Variable source of truth is question text (*var*) to match validation rules.
                const currentVars = extractVariables(current.text);
                const newVariablesState = [];
                currentVars.forEach(varName => {
                    const existingVar = (current.variables || []).find(v => v.name === varName) || { name: varName, min: '', max: '' };
                    newVariablesState.push(existingVar);
                });
                current.variables = newVariablesState;

                const varsKey = currentVars.join('\u0000');
                const shouldRebuild = _lastVarsKey !== varsKey;

                if (currentVars.length === 0) {
                    if (shouldRebuild) {
                        dom.variablesContainer.innerHTML = '';
                    }
                    _lastVarsKey = varsKey;
                    return;
                }

                if (shouldRebuild) {
                    dom.variablesContainer.innerHTML = '';
                    const table = document.createElement('table');
                    table.className = 'w-full text-sm';
                    const tbody = document.createElement('tbody');
                    const header = document.createElement('thead');
                    header.innerHTML = `
                        <tr class="text-left">
                            <th class="py-1 px-2 font-semibold">변수명</th>
                            <th class="py-1 px-2 font-semibold">최소값</th>
                            <th class="py-1 px-2 font-semibold">최대값</th>
                        </tr>`;
                    table.appendChild(header);

                    currentVars.forEach(varName => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td class="py-1 px-2 font-mono font-semibold">${_escapeHtml(varName)}</td>
                            <td><input type="text" data-var-name="${_escapeHtml(varName)}" data-var-prop="min" class="w-full p-1 rounded-md border-gray-300 text-right"></td>
                            <td><input type="text" data-var-name="${_escapeHtml(varName)}" data-var-prop="max" class="w-full p-1 rounded-md border-gray-300 text-right"></td>
                        `;
                        tbody.appendChild(row);
                    });
                    table.appendChild(tbody);
                    dom.variablesContainer.appendChild(table);
                }

                const rows = dom.variablesContainer.querySelectorAll('tr');
                currentVars.forEach((varName, idx) => {
                    const v = newVariablesState[idx] || { min: '', max: '' };
                    const row = rows[idx + 1]; // skip header row
                    if (!row) return;
                    const minInput = row.querySelector('input[data-var-prop="min"]');
                    const maxInput = row.querySelector('input[data-var-prop="max"]');
                    if (minInput && minInput.value !== String(v.min ?? '')) minInput.value = String(v.min ?? '');
                    if (maxInput && maxInput.value !== String(v.max ?? '')) maxInput.value = String(v.max ?? '');
                });

                _lastVarsKey = varsKey;
            };

            const _compatQuickFixById = new Map();
            const _globalWarningQuestionIndexes = [];
            const _globalErrorQuestionIndexes = [];

            const _syncGlobalWarningQuestionIndexes = (summary) => {
                const byQuestion = Array.isArray(summary?.byQuestion) ? summary.byQuestion : [];
                const indexes = byQuestion
                    .map((item) => Number(item?.index))
                    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < state.questions.length);
                const normalized = [...new Set(indexes)].sort((a, b) => a - b);
                _globalWarningQuestionIndexes.length = 0;
                _globalWarningQuestionIndexes.push(...normalized);
            };

            const _resolveWarningNavTarget = (direction = 'next') => {
                const total = _globalWarningQuestionIndexes.length;
                if (total <= 0) return -1;
                const currentPos = _globalWarningQuestionIndexes.indexOf(state.currentIndex);
                if (currentPos < 0) {
                    return (direction === 'prev')
                        ? _globalWarningQuestionIndexes[total - 1]
                        : _globalWarningQuestionIndexes[0];
                }
                const delta = (direction === 'prev') ? -1 : 1;
                const nextPos = (currentPos + delta + total) % total;
                return _globalWarningQuestionIndexes[nextPos];
            };

            const _syncGlobalErrorQuestionIndexes = (indexesSource) => {
                const iterable = (indexesSource && typeof indexesSource[Symbol.iterator] === 'function')
                    ? indexesSource
                    : [];
                const normalized = [...new Set(
                    [...iterable]
                        .map((idx) => Number(idx))
                        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < state.questions.length)
                )].sort((a, b) => a - b);
                _globalErrorQuestionIndexes.length = 0;
                _globalErrorQuestionIndexes.push(...normalized);
            };

            const _resolveErrorNavTarget = (direction = 'next') => {
                const total = _globalErrorQuestionIndexes.length;
                if (total <= 0) return -1;
                const currentPos = _globalErrorQuestionIndexes.indexOf(state.currentIndex);
                if (currentPos < 0) {
                    return (direction === 'prev')
                        ? _globalErrorQuestionIndexes[total - 1]
                        : _globalErrorQuestionIndexes[0];
                }
                const delta = (direction === 'prev') ? -1 : 1;
                const nextPos = (currentPos + delta + total) % total;
                return _globalErrorQuestionIndexes[nextPos];
            };

            const _createWarningNavControls = (tone = 'amber') => {
                const total = _globalWarningQuestionIndexes.length;
                if (total <= 0) return null;

                const isRed = tone === 'red';
                const textClass = isRed ? 'text-red-800' : 'text-amber-900';
                const btnClass = isRed
                    ? 'rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-50'
                    : 'rounded border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100';

                const wrap = document.createElement('div');
                wrap.className = `mt-3 flex flex-wrap items-center gap-2 ${textClass}`;

                const prevBtn = document.createElement('button');
                prevBtn.type = 'button';
                prevBtn.dataset.warningNav = 'prev';
                prevBtn.className = btnClass;
                prevBtn.textContent = '이전 경고';

                const nextBtn = document.createElement('button');
                nextBtn.type = 'button';
                nextBtn.dataset.warningNav = 'next';
                nextBtn.className = btnClass;
                nextBtn.textContent = '다음 경고';

                const currentPos = _globalWarningQuestionIndexes.indexOf(state.currentIndex);
                const status = document.createElement('span');
                status.className = 'text-xs';
                if (currentPos >= 0) {
                    status.textContent = `${currentPos + 1}/${total}`;
                }

                const disableNav = total <= 1;
                if (disableNav) {
                    prevBtn.disabled = true;
                    nextBtn.disabled = true;
                    prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
                }

                wrap.appendChild(prevBtn);
                wrap.appendChild(nextBtn);
                if (currentPos >= 0) wrap.appendChild(status);
                return wrap;
            };

            const _createErrorNavControls = () => {
                const total = _globalErrorQuestionIndexes.length;
                if (total <= 0) return null;

                const wrap = document.createElement('div');
                wrap.className = 'mt-3 flex flex-wrap items-center gap-2 text-red-800';

                const prevBtn = document.createElement('button');
                prevBtn.type = 'button';
                prevBtn.dataset.errorNav = 'prev';
                prevBtn.className = 'rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-50';
                prevBtn.textContent = '이전 오류';

                const nextBtn = document.createElement('button');
                nextBtn.type = 'button';
                nextBtn.dataset.errorNav = 'next';
                nextBtn.className = 'rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-50';
                nextBtn.textContent = '다음 오류';

                const currentPos = _globalErrorQuestionIndexes.indexOf(state.currentIndex);
                const status = document.createElement('span');
                status.className = 'text-xs';
                if (currentPos >= 0) {
                    status.textContent = `${currentPos + 1}/${total}`;
                }

                const disableNav = total <= 1;
                if (disableNav) {
                    prevBtn.disabled = true;
                    nextBtn.disabled = true;
                    prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
                }

                wrap.appendChild(prevBtn);
                wrap.appendChild(nextBtn);
                if (currentPos >= 0) wrap.appendChild(status);
                return wrap;
            };

            const _setValidationErrorTheme = () => {
                dom.validationErrors.className = 'p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg';
                if (typeof dom.validationErrors.setAttribute === 'function') {
                    dom.validationErrors.setAttribute('role', 'alert');
                    dom.validationErrors.setAttribute('aria-live', 'assertive');
                    dom.validationErrors.setAttribute('aria-atomic', 'true');
                }
            };

            const _setValidationWarningTheme = () => {
                dom.validationErrors.className = 'p-4 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg';
                if (typeof dom.validationErrors.setAttribute === 'function') {
                    dom.validationErrors.setAttribute('role', 'status');
                    dom.validationErrors.setAttribute('aria-live', 'polite');
                    dom.validationErrors.setAttribute('aria-atomic', 'true');
                }
            };

            const _clearValidationQuickFixes = () => {
                _compatQuickFixById.clear();
            };

            const _clearDeferredWarningPanel = () => {
                if (!dom.validationWarnings) return;
                dom.validationWarnings.classList.add('hidden');
                dom.validationWarnings.replaceChildren();
            };

            const _renderDeferredWarningPanel = (warningCount, questionCount) => {
                if (!dom.validationWarnings) return;
                const safeWarningCount = Number.isFinite(warningCount) ? Math.max(0, Math.trunc(warningCount)) : 0;
                const safeQuestionCount = Number.isFinite(questionCount) ? Math.max(0, Math.trunc(questionCount)) : 0;
                if (safeWarningCount <= 0 || safeQuestionCount <= 0) {
                    _clearDeferredWarningPanel();
                    return;
                }
                const line = document.createElement('div');
                line.textContent = `- 다른 문항 경고 ${safeWarningCount}건 (${safeQuestionCount}개 문항, 오류 해결 후 확인 가능)`;
                dom.validationWarnings.replaceChildren(line);
                dom.validationWarnings.classList.remove('hidden');
            };

            // Current-question panel already has context, so hide redundant "[n번 문항]" prefix.
            const _toCurrentPanelMessage = (msg) => String(msg || '').replace(/^\[\d+번 문항\]\s*/, '');

            const renderValidationErrors = (errors) => {
                _clearValidationQuickFixes();
                _setValidationErrorTheme();
                const frag = document.createDocumentFragment();
                const hasCompatIssue = Array.isArray(errors) && errors.some((msg) => String(msg || '').includes('random-exam-generator'));
                if (hasCompatIssue) {
                    const profileLine = document.createElement('div');
                    profileLine.className = 'mb-2 text-[11px] text-red-800';
                    profileLine.textContent = _buildPdflatexProfileHint();
                    frag.appendChild(profileLine);
                }
                errors.forEach((msg) => {
                    const line = document.createElement('div');
                    line.textContent = `- ${_toCurrentPanelMessage(msg)}`;
                    frag.appendChild(line);
                });
                const errorNav = _createErrorNavControls();
                if (errorNav) frag.appendChild(errorNav);
                dom.validationErrors.replaceChildren(frag);
            };

            const renderValidationWarnings = (warnings, quickFixes = []) => {
                _clearValidationQuickFixes();
                _setValidationWarningTheme();
                const frag = document.createDocumentFragment();

                const profileLine = document.createElement('div');
                profileLine.className = 'mb-2 text-[11px] text-amber-900';
                profileLine.textContent = _buildPdflatexProfileHint();
                frag.appendChild(profileLine);

                warnings.forEach((msg) => {
                    const line = document.createElement('div');
                    line.textContent = `- ${_toCurrentPanelMessage(msg)}`;
                    frag.appendChild(line);
                });

                const warningNav = _createWarningNavControls('amber');
                if (warningNav) frag.appendChild(warningNav);

                const fixList = Array.isArray(quickFixes) ? quickFixes : [];
                if (fixList.length > 0) {
                    const fixWrap = document.createElement('div');
                    fixWrap.className = 'mt-3 flex flex-wrap gap-2';
                    fixList.forEach((fix, idx) => {
                        if (!fix || typeof fix !== 'object') return;
                        const fallbackId = `${fix.action || 'fix'}:${fix.field || 'text'}:${idx}`;
                        const fixId = String(fix.id || fallbackId);
                        _compatQuickFixById.set(fixId, fix);

                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.dataset.compatFixId = fixId;
                        btn.className = 'rounded border border-amber-400 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100';
                        btn.textContent = String(fix.label || '자동치환');
                        fixWrap.appendChild(btn);
                    });
                    if (fixWrap.children.length > 0) {
                        frag.appendChild(fixWrap);
                    }
                }
                dom.validationErrors.replaceChildren(frag);
            };

            const _formatQuestionRef = (idx) => {
                return `${idx + 1}번`;
            };

            const _buildGlobalValidationHint = (otherInvalidCount) => {
                const count = Number.isFinite(otherInvalidCount) ? Math.max(0, Math.trunc(otherInvalidCount)) : 0;
                if (count <= 0) return '';
                return `\uB2E4\uB978 \uBB38\uD56D ${count}\uAC1C\uC5D0 \uC624\uB958\uAC00 \uC788\uC5B4 \uC800\uC7A5\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`;
            };

            const renderGlobalValidationHint = (otherInvalidIndexes) => {
                _clearValidationQuickFixes();
                _setValidationErrorTheme();
                const indexes = Array.isArray(otherInvalidIndexes)
                    ? otherInvalidIndexes.filter(i => Number.isInteger(i) && i >= 0 && i < state.questions.length).sort((a, b) => a - b)
                    : [];
                const hint = _buildGlobalValidationHint(indexes.length);
                if (!hint) {
                    dom.validationErrors.classList.add('hidden');
                    dom.validationErrors.replaceChildren();
                    return;
                }

                const line = document.createElement('div');
                line.textContent = `- ${hint}`;
                dom.validationErrors.replaceChildren(line);

                if (indexes.length > 0) {
                    const jumpWrap = document.createElement('div');
                    jumpWrap.className = 'mt-2 flex flex-wrap gap-1';
                    indexes.slice(0, 8).forEach((idx) => {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.dataset.gotoQuestion = String(idx);
                        btn.className = 'rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-50';
                        btn.textContent = _formatQuestionRef(idx);
                        jumpWrap.appendChild(btn);
                    });
                    if (indexes.length > 8) {
                        const more = document.createElement('span');
                        more.className = 'px-1 text-xs text-red-700';
                        more.textContent = `+${indexes.length - 8}개`;
                        jumpWrap.appendChild(more);
                    }
                    dom.validationErrors.appendChild(jumpWrap);
                }
                const errorNav = _createErrorNavControls();
                if (errorNav) dom.validationErrors.appendChild(errorNav);
                dom.validationErrors.classList.remove('hidden');
            };

            const renderGlobalWarningHint = (summary) => {
                _clearValidationQuickFixes();
                _setValidationWarningTheme();

                const src = (summary && typeof summary === 'object') ? summary : {};
                const byQuestion = Array.isArray(src.byQuestion) ? src.byQuestion : [];
                const questionCount = Number.isFinite(src.questionCount)
                    ? Math.max(0, Math.trunc(src.questionCount))
                    : byQuestion.length;
                if (questionCount <= 0) {
                    dom.validationErrors.classList.add('hidden');
                    dom.validationErrors.replaceChildren();
                    return;
                }

                const frag = document.createDocumentFragment();

                const profileLine = document.createElement('div');
                profileLine.className = 'mb-2 text-[11px] text-amber-900';
                profileLine.textContent = _buildPdflatexProfileHint();
                frag.appendChild(profileLine);

                const line = document.createElement('div');
                line.textContent = `- 다른 문항 ${questionCount}개에 호환성 경고가 있습니다.`;
                frag.appendChild(line);

                const jumpWrap = document.createElement('div');
                jumpWrap.className = 'mt-2 flex flex-wrap gap-1';
                byQuestion.slice(0, 8).forEach(({ index, warnings }) => {
                    if (!Number.isInteger(index)) return;
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.dataset.gotoQuestion = String(index);
                    btn.className = 'rounded border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100';
                    const count = Array.isArray(warnings) ? warnings.length : 0;
                    btn.textContent = `${index + 1}번${count > 0 ? ` (${count})` : ''}`;
                    jumpWrap.appendChild(btn);
                });
                if (questionCount > 8) {
                    const more = document.createElement('span');
                    more.className = 'px-1 text-xs text-amber-800';
                    more.textContent = `+${questionCount - 8}개`;
                    jumpWrap.appendChild(more);
                }
                if (jumpWrap.children.length > 0) frag.appendChild(jumpWrap);

                const warningNav = _createWarningNavControls('amber');
                if (warningNav) frag.appendChild(warningNav);

                dom.validationErrors.replaceChildren(frag);
                dom.validationErrors.classList.remove('hidden');
            };

            // JSON 실시간 출력 제거: 이제 검증만 수행
            const updateJsonAndValidation = () => {
                const current = getCurrentQuestion();
                const currentErrors = validateQuestionCached(current, state.currentIndex);
                const compatDiagnostics = getRandomExamCompatibilityDiagnostics(current, state.currentIndex);
                const currentWarnings = Array.isArray(compatDiagnostics.warnings) ? compatDiagnostics.warnings : [];
                const currentQuickFixes = Array.isArray(compatDiagnostics.quickFixes) ? compatDiagnostics.quickFixes : [];
                const globalWarningSummary = collectGlobalCompatibilityWarnings();
                const globalWarningByQuestion = Array.isArray(globalWarningSummary?.byQuestion) ? globalWarningSummary.byQuestion : [];
                const deferredWarningByQuestion = globalWarningByQuestion.filter(({ index }) => (
                    Number.isInteger(index) && index >= 0 && index < state.questions.length && index !== state.currentIndex
                ));
                const deferredWarningCount = deferredWarningByQuestion.reduce((sum, entry) => {
                    const count = Array.isArray(entry?.warnings) ? entry.warnings.length : 0;
                    return sum + count;
                }, 0);
                const deferredWarningQuestionCount = deferredWarningByQuestion.length;
                _clearDeferredWarningPanel();
                _syncGlobalWarningQuestionIndexes(globalWarningSummary);
                if (_isValidationIndexDirty) {
                    _rebuildInvalidQuestionIndexes();
                } else {
                    _syncInvalidQuestionForIndex(state.currentIndex);
                }
                _syncGlobalErrorQuestionIndexes(_invalidQuestionIndexes);
                const invalidCount = _invalidQuestionIndexes.size;
                dom.saveBtn.disabled = invalidCount > 0;
                if (currentErrors.length > 0) {
                    renderValidationErrors(currentErrors);
                    _renderDeferredWarningPanel(deferredWarningCount, deferredWarningQuestionCount);
                    dom.validationErrors.classList.remove('hidden');
                    return;
                }
                const otherInvalidCount = _invalidQuestionIndexes.has(state.currentIndex)
                    ? Math.max(0, invalidCount - 1)
                    : invalidCount;
                const otherInvalidIndexes = [..._invalidQuestionIndexes]
                    .filter(i => i !== state.currentIndex)
                    .sort((a, b) => a - b);
                if (otherInvalidCount > 0) {
                    renderGlobalValidationHint(otherInvalidIndexes);
                    _renderDeferredWarningPanel(deferredWarningCount, deferredWarningQuestionCount);
                    dom.validationErrors.classList.remove('hidden');
                    return;
                } else if (currentWarnings.length > 0) {
                    renderValidationWarnings(currentWarnings, currentQuickFixes);
                    dom.validationErrors.classList.remove('hidden');
                } else if (globalWarningSummary.questionCount > 0) {
                    renderGlobalWarningHint(globalWarningSummary);
                } else {
                    _clearValidationQuickFixes();
                    dom.validationErrors.classList.add('hidden');
                    dom.validationErrors.replaceChildren();
                }
            };

            // ===== localStorage auto-save =====
            let _saveTimer = null;
            let _imageSaveTimer = null;
            let _katexTimer = null;
            const LEGACY_AUTO_SAVE_KEY = 'json-editor-autosave';
            const LEGACY_AUTO_SAVE_IMAGE_DB = 'json-editor-autosave-assets';
            const AUTO_SAVE_SCOPE = (() => {
                try {
                    const path = String(window?.location?.pathname || 'default');
                    const normalized = path.replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
                    // Include full-path hash to avoid collisions on similar long path suffixes.
                    let h = 0x811c9dc5;
                    for (let i = 0; i < path.length; i++) {
                        h ^= path.charCodeAt(i);
                        h = Math.imul(h, 0x01000193);
                    }
                    const hash = (h >>> 0).toString(16);
                    return `${normalized.slice(-64)}__${hash}`;
                } catch (_) {
                    return 'default';
                }
            })();
            const AUTO_SAVE_KEY = `${LEGACY_AUTO_SAVE_KEY}:${AUTO_SAVE_SCOPE}`;
            const AUTO_SAVE_IMAGE_DB = `${LEGACY_AUTO_SAVE_IMAGE_DB}:${AUTO_SAVE_SCOPE}`;
            const AUTO_SAVE_IMAGE_STORE = 'autosave-images';
            const AUTO_SAVE_IMAGE_KEY = 'snapshot';
            const NO_IMAGE_SNAPSHOT_MARKER = '__NO_IMAGES__';
            let _forceLegacyAutoSave = false;
            let _lastSavedImageSnapshotKey = '';
            let _lastSavedImageMetaSignature = '';
            let _pendingImageSnapshotKey = '';
            let _pendingImageMetaSignature = '';
            const _questionImageHashCache = new WeakMap();

            const _getCurrentAutoSaveKey = () => (_forceLegacyAutoSave ? LEGACY_AUTO_SAVE_KEY : AUTO_SAVE_KEY);
            const _getCurrentAutoSaveImageDb = () => (_forceLegacyAutoSave ? LEGACY_AUTO_SAVE_IMAGE_DB : AUTO_SAVE_IMAGE_DB);

            const _hashString = (text) => {
                // FNV-1a 32-bit
                let h = 0x811c9dc5;
                const s = String(text || '');
                for (let i = 0; i < s.length; i++) {
                    h ^= s.charCodeAt(i);
                    h = Math.imul(h, 0x01000193);
                }
                return (h >>> 0).toString(16);
            };

            const _buildAutoSaveMeta = () => {
                const questionsWithoutImages = state.questions.map(q => {
                    const { imageData, ...rest } = q;
                    return rest;
                });
                return {
                    questions: questionsWithoutImages,
                    currentIndex: state.currentIndex
                };
            };

            const _buildAutoSaveMetaSignature = (raw) => {
                const s = String(raw || '');
                return `${s.length}:${_hashString(s)}`;
            };

            const _sanitizeRestoredCurrentIndex = (value, questionCount) => {
                const count = Math.max(0, Number(questionCount) || 0);
                if (count <= 0) return 0;
                const n = Number(value);
                if (!Number.isFinite(n)) return 0;
                const idx = Math.trunc(n);
                if (idx < 0) return 0;
                if (idx >= count) return count - 1;
                return idx;
            };

            const _shouldSkipImageAutoSave = ({
                snapshotKey,
                metaSignature,
                lastSnapshotKey,
                lastMetaSignature,
                pendingSnapshotKey,
                pendingMetaSignature
            }) => {
                if (!snapshotKey) return true;
                if (snapshotKey === lastSnapshotKey && metaSignature === lastMetaSignature) return true;
                if (snapshotKey === pendingSnapshotKey && metaSignature === pendingMetaSignature) return true;
                return false;
            };

            const _hasAnyImageData = () => state.questions.some(q => !!q.imageData);

            const _getCachedQuestionImageHash = (question) => {
                const dataUrl = question?.imageData;
                if (!dataUrl) return '';
                const cached = _questionImageHashCache.get(question);
                if (cached && cached.dataUrl === dataUrl) {
                    return cached.hash;
                }
                const hash = _hashString(dataUrl);
                _questionImageHashCache.set(question, { dataUrl, hash });
                return hash;
            };

            const _buildImageSnapshotKey = () => {
                const imageSig = state.questions.map((q, idx) => {
                    if (!q.imageData) return `${idx}:0`;
                    return `${idx}:${q.imageData.length}:${_getCachedQuestionImageHash(q)}`;
                }).join('|');
                return imageSig;
            };

            const _openAutoSaveImageDb = (dbName = AUTO_SAVE_IMAGE_DB) => new Promise((resolve, reject) => {
                if (!window.indexedDB) return resolve(null);
                let req;
                try {
                    req = window.indexedDB.open(dbName, 1);
                } catch (e) {
                    reject(e);
                    return;
                }
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(AUTO_SAVE_IMAGE_STORE)) {
                        db.createObjectStore(AUTO_SAVE_IMAGE_STORE);
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
            });

            const _idbGet = (db, key) => new Promise((resolve, reject) => {
                const tx = db.transaction(AUTO_SAVE_IMAGE_STORE, 'readonly');
                const store = tx.objectStore(AUTO_SAVE_IMAGE_STORE);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('indexedDB get failed'));
            });

            const _idbPut = (db, key, value) => new Promise((resolve, reject) => {
                const tx = db.transaction(AUTO_SAVE_IMAGE_STORE, 'readwrite');
                const store = tx.objectStore(AUTO_SAVE_IMAGE_STORE);
                const req = store.put(value, key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error || new Error('indexedDB put failed'));
            });

            const _idbDelete = (db, key) => new Promise((resolve, reject) => {
                const tx = db.transaction(AUTO_SAVE_IMAGE_STORE, 'readwrite');
                const store = tx.objectStore(AUTO_SAVE_IMAGE_STORE);
                const req = store.delete(key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error || new Error('indexedDB delete failed'));
            });

            const _deleteImageSnapshotFromIndexedDb = async (dbName = AUTO_SAVE_IMAGE_DB) => {
                if (!window.indexedDB) return 'saved';
                let db = null;
                try {
                    db = await _openAutoSaveImageDb(dbName);
                    if (!db) return 'saved';
                    await _idbDelete(db, AUTO_SAVE_IMAGE_KEY);
                    return 'saved';
                } catch (_) {
                    return 'failed';
                } finally {
                    if (db) db.close();
                }
            };

            const _dataUrlToBlob = async (dataUrl) => {
                const res = await fetch(dataUrl);
                return await res.blob();
            };

            const _blobToDataUrl = (blob) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error('blob read failed'));
                reader.readAsDataURL(blob);
            });

            const _saveImagesToIndexedDb = async (metaRaw, snapshotKey, options = {}) => {
                if (!window.indexedDB) return 'saved';
                const dbName = options.dbName || _getCurrentAutoSaveImageDb();
                const metaKey = options.metaKey || _getCurrentAutoSaveKey();
                let db = null;
                try {
                    db = await _openAutoSaveImageDb(dbName);
                    if (!db) return 'saved';
                    const latestRawBeforeConvert = localStorage.getItem(metaKey) || '';
                    if (latestRawBeforeConvert !== metaRaw) return 'stale';
                    const images = [];
                    for (let idx = 0; idx < state.questions.length; idx++) {
                        const dataUrl = state.questions[idx]?.imageData;
                        if (!dataUrl) continue;
                        try {
                            const blob = await _dataUrlToBlob(dataUrl);
                            images.push({ index: idx, blob });
                        } catch (_) {
                            // Skip broken data URL silently.
                        }
                    }

                    // Stale write guard: only persist if this raw payload is still current.
                    const latestRawBeforePut = localStorage.getItem(metaKey) || '';
                    if (latestRawBeforePut !== metaRaw) return 'stale';

                    await _idbPut(db, AUTO_SAVE_IMAGE_KEY, {
                        metaSignature: _buildAutoSaveMetaSignature(metaRaw),
                        snapshotKey: snapshotKey || '',
                        savedAt: Date.now(),
                        images
                    });
                    return 'saved';
                } catch (_) {
                    return 'failed';
                } finally {
                    if (db) db.close();
                }
            };

            const _restoreImagesFromIndexedDb = async (metaRaw, dbName = AUTO_SAVE_IMAGE_DB) => {
                if (!window.indexedDB) return false;
                const db = await _openAutoSaveImageDb(dbName);
                if (!db) return false;
                try {
                    const snapshot = await _idbGet(db, AUTO_SAVE_IMAGE_KEY);
                    if (!snapshot) return false;
                    const expectedSignature = _buildAutoSaveMetaSignature(metaRaw);
                    if (snapshot.metaSignature !== expectedSignature) return false;
                    const images = Array.isArray(snapshot.images) ? snapshot.images : [];
                    const restored = await Promise.all(images.map(async (it) => {
                        if (!it || typeof it.index !== 'number' || !it.blob) return null;
                        try {
                            const dataUrl = await _blobToDataUrl(it.blob);
                            return { index: it.index, dataUrl };
                        } catch (_) {
                            return null;
                        }
                    }));
                    restored.forEach((it) => {
                        if (!it) return;
                        const q = state.questions[it.index];
                        if (!q) return;
                        q.imageData = it.dataUrl;
                    });
                    return true;
                } finally {
                    db.close();
                }
            };

            const _clearAutoSaveImagesFromIndexedDb = async () => {
                if (_imageSaveTimer) {
                    clearTimeout(_imageSaveTimer);
                    _imageSaveTimer = null;
                }
                _pendingImageSnapshotKey = '';
                _pendingImageMetaSignature = '';
                _lastSavedImageSnapshotKey = '';
                _lastSavedImageMetaSignature = '';
                _forceLegacyAutoSave = false;
                await _deleteImageSnapshotFromIndexedDb(AUTO_SAVE_IMAGE_DB);
                if (LEGACY_AUTO_SAVE_IMAGE_DB !== AUTO_SAVE_IMAGE_DB) {
                    await _deleteImageSnapshotFromIndexedDb(LEGACY_AUTO_SAVE_IMAGE_DB);
                }
            };

            const _scheduleImageAutoSave = (metaRaw, retryCount = 0) => {
                if (!_hasAnyImageData()) {
                    if (_lastSavedImageSnapshotKey === NO_IMAGE_SNAPSHOT_MARKER || _pendingImageSnapshotKey === NO_IMAGE_SNAPSHOT_MARKER) return;
                    _pendingImageSnapshotKey = NO_IMAGE_SNAPSHOT_MARKER;
                    _pendingImageMetaSignature = '';
                    if (_imageSaveTimer) clearTimeout(_imageSaveTimer);
                    _imageSaveTimer = setTimeout(async () => {
                        if (_pendingImageSnapshotKey !== NO_IMAGE_SNAPSHOT_MARKER) return;
                        const status = await _deleteImageSnapshotFromIndexedDb(_getCurrentAutoSaveImageDb());
                        _pendingImageSnapshotKey = '';
                        _pendingImageMetaSignature = '';
                        if (status === 'saved') {
                            _lastSavedImageSnapshotKey = NO_IMAGE_SNAPSHOT_MARKER;
                            _lastSavedImageMetaSignature = '';
                            return;
                        }
                        if (retryCount >= 2) return;
                        const latestMetaRaw = localStorage.getItem(_getCurrentAutoSaveKey()) || '';
                        if (latestMetaRaw) _scheduleImageAutoSave(latestMetaRaw, retryCount + 1);
                    }, 700);
                    return;
                }

                const snapshotKey = _buildImageSnapshotKey();
                const metaSignature = _buildAutoSaveMetaSignature(metaRaw);
                if (_shouldSkipImageAutoSave({
                    snapshotKey,
                    metaSignature,
                    lastSnapshotKey: _lastSavedImageSnapshotKey,
                    lastMetaSignature: _lastSavedImageMetaSignature,
                    pendingSnapshotKey: _pendingImageSnapshotKey,
                    pendingMetaSignature: _pendingImageMetaSignature
                })) return;
                _pendingImageSnapshotKey = snapshotKey;
                _pendingImageMetaSignature = metaSignature;
                if (_imageSaveTimer) clearTimeout(_imageSaveTimer);
                _imageSaveTimer = setTimeout(async () => {
                    const requestedKey = _pendingImageSnapshotKey;
                    const requestedMetaSignature = _pendingImageMetaSignature;
                    const latestBeforeSave = _buildImageSnapshotKey();
                    const currentAutoSaveKey = _getCurrentAutoSaveKey();
                    const currentAutoSaveImageDb = _getCurrentAutoSaveImageDb();
                    const latestMetaRawBeforeSave = localStorage.getItem(currentAutoSaveKey) || '';
                    const latestMetaSignatureBeforeSave = _buildAutoSaveMetaSignature(latestMetaRawBeforeSave);
                    if (!requestedKey || !requestedMetaSignature || latestBeforeSave !== requestedKey || latestMetaSignatureBeforeSave !== requestedMetaSignature) {
                        _pendingImageSnapshotKey = '';
                        _pendingImageMetaSignature = '';
                        if (latestMetaRawBeforeSave) {
                            _scheduleImageAutoSave(latestMetaRawBeforeSave);
                        }
                        return;
                    }

                    const status = await _saveImagesToIndexedDb(metaRaw, requestedKey, {
                        dbName: currentAutoSaveImageDb,
                        metaKey: currentAutoSaveKey
                    });
                    if (status === 'saved') {
                        _lastSavedImageSnapshotKey = requestedKey;
                        _lastSavedImageMetaSignature = requestedMetaSignature;
                        _pendingImageSnapshotKey = '';
                        _pendingImageMetaSignature = '';
                        return;
                    }
                    _pendingImageSnapshotKey = '';
                    _pendingImageMetaSignature = '';

                    const latestMetaRaw = localStorage.getItem(_getCurrentAutoSaveKey()) || '';
                    const latestImageKey = _buildImageSnapshotKey();
                    const latestMetaSignature = _buildAutoSaveMetaSignature(latestMetaRaw);
                    if (!latestMetaRaw || (!_hasAnyImageData() ? _lastSavedImageSnapshotKey === NO_IMAGE_SNAPSHOT_MARKER : (latestImageKey === _lastSavedImageSnapshotKey && latestMetaSignature === _lastSavedImageMetaSignature))) {
                        return;
                    }
                    if (status === 'failed' && retryCount >= 2) {
                        return;
                    }
                    _scheduleImageAutoSave(latestMetaRaw, status === 'failed' ? retryCount + 1 : 0);
                }, 700);
            };

            const saveToLocalStorage = () => {
                try {
                    const payload = JSON.stringify(_buildAutoSaveMeta());
                    localStorage.setItem(_getCurrentAutoSaveKey(), payload);
                    _scheduleImageAutoSave(payload);
                } catch (_) { /* quota exceeded or private mode ??silently ignore */ }
            };
            const scheduleMetaAutoSave = () => {
                if (_saveTimer) clearTimeout(_saveTimer);
                _saveTimer = setTimeout(saveToLocalStorage, 500);
            };

            const restoreFromLocalStorage = async () => {
                try {
                    _forceLegacyAutoSave = false;
                    let raw = localStorage.getItem(AUTO_SAVE_KEY);
                    let imageDbName = AUTO_SAVE_IMAGE_DB;
                    const fromLegacy = !raw;
                    if (!raw) {
                        raw = localStorage.getItem(LEGACY_AUTO_SAVE_KEY);
                        if (raw) {
                            imageDbName = LEGACY_AUTO_SAVE_IMAGE_DB;
                            _forceLegacyAutoSave = true;
                        }
                    }
                    if (!raw) return false;
                    const data = JSON.parse(raw);
                    if (data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
                        if (fromLegacy && raw) {
                            try {
                                localStorage.setItem(AUTO_SAVE_KEY, raw);
                            } catch (_) { /* ignore migration failure */ }
                        }
                        const restoredQuestions = data.questions
                            .map(q => {
                                if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
                                const asText = (v) => (typeof v === 'string' ? v : '');
                                const normalizedRawId = (typeof q.id === 'string' || typeof q.id === 'number') ? q.id : '';
                                return {
                                    id: normalizeQuestionId(normalizedRawId),
                                    title: asText(q.title),
                                    text: asText(q.text),
                                    answer: asText(q.answer),
                                    points: coerceQuestionPointsInput(q.points),
                                    variables: normalizeQuestionVariables(q.variables),
                                    imageData: null
                                };
                            })
                            .filter(Boolean);
                        if (restoredQuestions.length === 0) {
                            _forceLegacyAutoSave = false;
                            return false;
                        }
                        state.questions = restoredQuestions;
                        state.currentIndex = _sanitizeRestoredCurrentIndex(data.currentIndex, state.questions.length);
                        _resetValidationState();
                        const restored = await _restoreImagesFromIndexedDb(raw, imageDbName);
                        const hasImages = _hasAnyImageData();
                        let migratedLegacyImages = false;
                        if (fromLegacy && imageDbName === LEGACY_AUTO_SAVE_IMAGE_DB && restored && hasImages) {
                            const migrateStatus = await _saveImagesToIndexedDb(raw, _buildImageSnapshotKey(), {
                                dbName: AUTO_SAVE_IMAGE_DB,
                                metaKey: AUTO_SAVE_KEY
                            });
                            migratedLegacyImages = migrateStatus === 'saved';
                            if (migratedLegacyImages) {
                                await _deleteImageSnapshotFromIndexedDb(LEGACY_AUTO_SAVE_IMAGE_DB);
                            }
                        }
                        if (fromLegacy) {
                            try {
                                const keepLegacyFallback = imageDbName === LEGACY_AUTO_SAVE_IMAGE_DB
                                    && (!restored || (hasImages && !migratedLegacyImages));
                                if (keepLegacyFallback) {
                                    _forceLegacyAutoSave = true;
                                    localStorage.removeItem(AUTO_SAVE_KEY);
                                } else {
                                    _forceLegacyAutoSave = false;
                                    localStorage.removeItem(LEGACY_AUTO_SAVE_KEY);
                                }
                            } catch (_) { /* ignore cleanup failure */ }
                        }
                        if (!fromLegacy) {
                            _forceLegacyAutoSave = false;
                        }
                        const canTrustCurrentImageSnapshot = hasImages
                            ? restored
                            : restored;
                        _lastSavedImageSnapshotKey = hasImages
                            ? (canTrustCurrentImageSnapshot ? _buildImageSnapshotKey() : '')
                            : (restored ? NO_IMAGE_SNAPSHOT_MARKER : '');
                        _lastSavedImageMetaSignature = hasImages && canTrustCurrentImageSnapshot
                            ? _buildAutoSaveMetaSignature(raw)
                            : '';
                        _pendingImageSnapshotKey = '';
                        _pendingImageMetaSignature = '';
                        return true;
                    }
                    _forceLegacyAutoSave = false;
                } catch (_) {
                    _forceLegacyAutoSave = false;
                    /* corrupted data ??ignore */
                }
                return false;
            };

            const _scheduleKatexRender = () => {
                if (_katexTimer) clearTimeout(_katexTimer);
                _katexTimer = setTimeout(() => {
                    if (!window.renderMathInElement) return;
                    const _katexOpts = {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false },
                        ],
                        throwOnError: false,
                        trust: false
                    };
                    renderMathInElement(dom.textPreview, _katexOpts);
                    renderMathInElement(dom.answerPreview, _katexOpts);
                }, 400);
            };

            const updateUI = () => {
                if (state.currentIndex < 0) state.currentIndex = 0;
                if (state.currentIndex >= state.questions.length) state.currentIndex = state.questions.length - 1;

                const current = getCurrentQuestion();

                // 문항 선택 UI
                updateQuestionSelectorUI();

                // 입력 필드 반영
                dom.id.value = current.id || '';
                dom.title.value = current.title || '';
                if (dom.points) dom.points.value = (current.points ?? '') === null ? '' : String(current.points ?? '');
                dom.text.value = current.text || '';
                dom.answer.value = current.answer || '';

                // 정답 범위 패널 초기화
                if (dom.minmaxResult) { dom.minmaxResult.classList.add('hidden'); dom.minmaxResult.innerHTML = ''; }
                if (dom.answerMathjs) { dom.answerMathjs.classList.add('hidden'); dom.answerMathjs.textContent = ''; }

                // 지문 미리보기
                dom.textPreview.innerHTML = highlightVarsInKatex(current.text || '');

                // 이미지 박스 (지문 아래 placeholder <-> 이미지 전환)
                if (current.imageData) {
                    dom.imagePreviewImg.src = current.imageData;
                    dom.imagePreviewImg.classList.remove('hidden');
                    dom.imageBoxPlaceholder.classList.add('hidden');
                    dom.imageRemoveBtn.classList.remove('hidden');
                    dom.imageBox.classList.remove('border-dashed');
                    dom.imageBox.classList.add('border-solid');
                } else {
                    dom.imagePreviewImg.src = '';
                    dom.imagePreviewImg.classList.add('hidden');
                    dom.imageBoxPlaceholder.classList.remove('hidden');
                    dom.imageRemoveBtn.classList.add('hidden');
                    dom.imageBox.classList.add('border-dashed');
                    dom.imageBox.classList.remove('border-solid');
                }

                // 정답식 미리보기 (변수 강조 제거)
                dom.answerPreview.innerHTML = `$$${_escapeHtml((current.answer || '').replace(/\*([a-zA-Z_][a-zA-Z0-9_]*)\*/g, '$1'))}$$`;
                _scheduleKatexRender();

                // 변수 UI
                updateVariablesUIForCurrentQuestion();

                // 삭제 버튼 상태
                dom.deleteQuestionBtn.disabled = state.questions.length <= 1;

                // 검증
                updateJsonAndValidation();

                // Auto-save to localStorage (debounced)
                scheduleMetaAutoSave();
            };

            const downloadFile = (filename, content, type = 'text/plain;charset=utf-8') => {
                const blob = new Blob([content], { type });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };

            const getJsonFilename = () => {
                const firstId = state.questions.length === 1 ? normalizeQuestionId(state.questions[0].id) : '';
                if (firstId) {
                    return firstId;
                }
                return 'questions';
            };

            // Debounce utility for input handlers (prevents excessive KaTeX re-renders)
            let _debounceTimer = null;
            const debounce = (fn, delay = 150) => {
                return (...args) => {
                    clearTimeout(_debounceTimer);
                    _debounceTimer = setTimeout(() => fn(...args), delay);
                };
            };

            const setupEventListeners = () => {
                const inputs = [dom.id, dom.title, dom.points, dom.text, dom.answer];
                const debouncedUpdateUI = debounce(() => updateUI(), 150);


                inputs.forEach(input => {
                    if (!input) return;
                    input.addEventListener('input', e => {
                        const current = getCurrentQuestion();
                        const prop = e.target.id; // 'id', 'title', 'text', 'answer'
                        current[prop] = e.target.value;
                        if (prop === 'id') _resetValidationState();
                        debouncedUpdateUI();
                    });
                });

// 정답 범위(min/max) 계산 버튼
// 샘플 수 입력 시 최소/최대 범위 자동 보정
if (dom.minmaxSamples) {
    dom.minmaxSamples.addEventListener('blur', () => {
        const v = Number(dom.minmaxSamples.value || 2000);
        dom.minmaxSamples.value = Math.max(200, Math.min(50000, v));
    });
}

if (dom.calcMinMaxBtn) {
    dom.calcMinMaxBtn.addEventListener('click', () => {
        const current = getCurrentQuestion();
        try {
            // 1) LaTeX -> math.js 변환
            const expr = latexToMathjs(current.answer || '');

            // 2) 변수 불일치 검사 (검증과 동일 규칙)
            const used = extractSymbolsFromMathjs(expr);
            const defined = new Set((current.variables || []).map(v => (v.name || '').trim()).filter(Boolean));
            const unknown = used.filter(s => !defined.has(s));
            if (unknown.length) {
                throw new Error(`정답식에 변수 목록에 없는 기호가 포함되어 있습니다: ${unknown.join(', ')}`);
            }

            if (dom.answerMathjs) {
                dom.answerMathjs.classList.remove('hidden');
                dom.answerMathjs.textContent = "math.js: " + expr;
            }

            // 3) bounds + compile
            const compiled = math.compile(expr);
            const bounds = _boundsFromQuestion(current);

            const samples = Math.max(200, Math.min(50000, Number(dom.minmaxSamples?.value || 2000)));
            const seed = 1;

            const r = evaluateMinMaxApprox(compiled, bounds, samples, seed);

            if (dom.minmaxResult) {
                dom.minmaxResult.classList.remove('hidden');
                dom.minmaxResult.innerHTML = `
                    <div class="rounded-lg border border-gray-200 bg-white p-3">
                        <div class="flex items-center justify-between">
                            <div class="font-semibold text-gray-800">결과 (근사)</div>
                            <div class="text-xs text-gray-500">샘플 ${samples.toLocaleString()}</div>
                        </div>

                        <div class="mt-2 grid grid-cols-2 gap-3">
                            <div>
                                <div class="text-xs text-gray-500 mb-0.5">min</div>
                                <div class="font-semibold font-mono text-lg text-gray-900">${_fmtNum(r.minVal)}</div>
                                <div class="mt-1.5 text-xs text-gray-500 mb-1">최소일 때 변수</div>
                                ${_scopeToChips(r.argMin)}
                            </div>
                            <div>
                                <div class="text-xs text-gray-500 mb-0.5">max</div>
                                <div class="font-semibold font-mono text-lg text-gray-900">${_fmtNum(r.maxVal)}</div>
                                <div class="mt-1.5 text-xs text-gray-500 mb-1">최대일 때 변수</div>
                                ${_scopeToChips(r.argMax)}
                            </div>
                        </div>
                    </div>
                `;
            }

            // 계산 성공 시 별도 오류 패널은 비우고, 전체 검증 오류는 updateJsonAndValidation에서 관리
        } catch (e) {
            if (dom.minmaxResult) {
                dom.minmaxResult.classList.remove('hidden');
                dom.minmaxResult.innerHTML = `
                    <div class="rounded-lg border border-red-200 bg-red-50 p-3">
                        <div class="font-semibold text-red-800">현재 문항 점검 실패</div>
                        <div class="mt-1 text-sm text-red-800">${_escapeHtml(String(e.message || e))}</div>
                        <div class="mt-2 text-xs text-red-700">
                            지원: \\frac, \\sqrt, \\sin/\\cos/\\tan, \\sinh/\\cosh/\\tanh, \\arcsin/\\arccos/\\arctan, \\ln/\\log, \\log_{a}(x), \\exp, 거듭제곱 ^, 괄호/중괄호
                        </div>
                    </div>
                `;
            }
        }
    });
}


// 전체 문항 정답범위 일괄 점검
let _lastMinMaxBatchReport = null;

function _classifyRange(minVal, maxVal) {
    const TH_MIN = 0.1;
    const TH_MAX = 10000;
    const reasons = [];
    if (!(Number.isFinite(minVal) && Number.isFinite(maxVal))) {
        reasons.push("min/max invalid");
        return { ok: false, reasons };
    }
    if (minVal >= maxVal) reasons.push("min >= max");
    if (minVal < TH_MIN) reasons.push(`min < ${TH_MIN}`);
    if (maxVal > TH_MAX) reasons.push(`max > ${TH_MAX}`);
    return { ok: reasons.length === 0, reasons };
}

async function runMinMaxBatchCheck() {
    const samples = Math.max(200, Math.min(50000, Number(dom.minmaxSamples?.value || 2000)));
    const seedBase = 1;
    const total = state.questions.length;

    const report = {
        meta: { total, samples, seedBase, thMin: 0.1, thMax: 10000, ts: new Date().toISOString() },
        ok: [],
        range_violation: [],
        error: []
    };

    if (dom.minmaxAllResult) {
        dom.minmaxAllResult.classList.remove('hidden');
        dom.minmaxAllResult.innerHTML = `<div class="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">점검 중... 0/${total}</div>`;
    }

    const chunkSize = 10;
    for (let start = 0; start < total; start += chunkSize) {
        const end = Math.min(total, start + chunkSize);
        for (let idx = start; idx < end; idx++) {
            const q = state.questions[idx];
            try {
                const expr = latexToMathjs(q.answer || '');

                const used = extractSymbolsFromMathjs(expr);
                const defined = new Set((q.variables || []).map(v => (v.name || '').trim()).filter(Boolean));
                const unknown = used.filter(s => !defined.has(s));
                if (unknown.length) {
                    throw new Error(`정답식에 변수 목록에 없는 기호가 포함되어 있습니다: ${unknown.join(', ')}`);
                }

                const compiled = math.compile(expr);
                const bounds = _boundsFromQuestion(q);
                const seed = seedBase + idx;
                const r = evaluateMinMaxApprox(compiled, bounds, samples, seed);
                const cls = _classifyRange(r.minVal, r.maxVal);

                if (cls.ok) {
                    report.ok.push({ index: idx + 1, id: q.id || '', min: r.minVal, max: r.maxVal });
                } else {
                    report.range_violation.push({
                        index: idx + 1,
                        id: q.id || '',
                        min: r.minVal,
                        max: r.maxVal,
                        reason: cls.reasons.join(', ')
                    });
                }
            } catch (e) {
                report.error.push({
                    index: idx + 1,
                    id: q.id || '',
                    message: String(e?.message || e)
                });
            }
        }

        if (dom.minmaxAllResult) {
            dom.minmaxAllResult.innerHTML = `<div class="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">점검 중... ${end}/${total}</div>`;
        }
        await new Promise(r => setTimeout(r, 0));
    }

    _lastMinMaxBatchReport = report;

    // UI 요약
    if (dom.minmaxAllResult) {
        dom.minmaxAllResult.classList.remove('hidden');

        const okCount = report.ok.length;
        const vioCount = report.range_violation.length;
        const errCount = report.error.length;
        const totalPoints = state.questions.reduce((acc, qq) => {
            const n = Number(qq?.points);
            return acc + (Number.isFinite(n) ? n : 0);
        }, 0);

        const boxClass = errCount ? 'border-red-200 bg-red-50' : (vioCount ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50');
        const titleClass = errCount ? 'text-red-800' : (vioCount ? 'text-amber-800' : 'text-green-800');

        dom.minmaxAllResult.innerHTML = `
            <div class="rounded-lg border ${boxClass} p-3">
                <div class="flex flex-nowrap items-center gap-2 overflow-x-auto text-sm">
                    <span class="font-semibold ${titleClass} shrink-0">전체 문항 점검 결과</span>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 border border-green-400 text-green-900 shrink-0">
                        정상 <span class="font-semibold">${okCount}</span>
                    </span>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-400 text-amber-900 shrink-0">
                        위반 <span class="font-semibold">${vioCount}</span>
                    </span>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 border border-red-400 text-red-900 shrink-0">
                        오류 <span class="font-semibold">${errCount}</span>
                    </span>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-400 text-slate-900 shrink-0 ml-auto">
                        총점 <span class="font-semibold">${totalPoints}</span>
                    </span>
                </div>
            </div>
        `;
        }

    // 테이블 즉시 출력
    renderMinMaxReportTable(report);
}



function _statusRank(s) {
    if (s === '계산오류') return 0;
    if (s === '범위위반') return 1;
    if (s === '통과') return 2;
    return 9;
}

function renderMinMaxReportTable(rep) {
    if (!rep || !dom.minmaxReportTable) return;

    const rows = [];

    (rep.range_violation || []).forEach(r => {
        rows.push({
            qIndex: ((r.index || 1) - 1),
            index: r.index,
            id: r.id,
            min: r.min,
            max: r.max,
            status: '범위위반',
            note: r.reason || ''
        });
    });
    (rep.error || []).forEach(r => {
        rows.push({
            qIndex: ((r.index || 1) - 1),
            index: r.index,
            id: r.id,
            status: '계산오류',
            note: r.message || ''
        });
    });

    rows.sort((a, b) => {
        const sa = _statusRank(a.status);
        const sb = _statusRank(b.status);
        if (sa !== sb) return sa - sb;

        const ida = String(a.id || '');
        const idb = String(b.id || '');
        const cmp = ida.localeCompare(idb, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp;

        return (a.index || 0) - (b.index || 0);
    });

    const statusBadge = (s) => {
        if (s === '범위위반') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-400">위반</span>';
        return '<span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-900 border border-red-400">오류</span>';
    };

    const cardClass = (s) => {
        if (s === '범위위반') return 'border-amber-200 bg-amber-50';
        return 'border-red-200 bg-red-50';
    };

    const detailLine = (r) => {
        if (r.status === '범위위반') {
            return `min: ${_fmtNum(r.min)} / max: ${_fmtNum(r.max)} · ${_escapeHtml(r.note || '')}`;
        }
        return _escapeHtml(r.note || '');
    };
    const jumpLabel = (r) => {
        const normalizedId = String(r.id || '').trim();
        return normalizedId ? _escapeHtml(normalizedId) : `${r.index}번 문항`;
    };
    const jumpTitle = (r) => {
        const normalizedId = String(r.id || '').trim();
        return normalizedId ? _escapeHtml(normalizedId) : `ID 없음 · ${r.index}번 문항`;
    };

    dom.minmaxReportTable.classList.remove('hidden');
    if (!rows.length) {
        dom.minmaxReportTable.innerHTML = `
            <div class="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                모든 문항이 정상 범위입니다.
            </div>
        `;
        dom.minmaxReportTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    dom.minmaxReportTable.innerHTML = `
        <div class="rounded-lg border border-gray-200 bg-white p-3">
            <div class="space-y-1.5">
                ${rows.map(r => `
                    <div class="rounded-md border ${cardClass(r.status)} p-2.5 flex items-start gap-2">
                        <div class="flex-shrink-0">${statusBadge(r.status)}</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-baseline gap-2">
                                <button type="button" data-goto-question="${r.qIndex}" class="font-mono text-sm text-blue-600 hover:underline truncate" title="${jumpTitle(r)}">${jumpLabel(r)}</button>
                                <span class="text-xs text-gray-500">#${r.index}</span>
                            </div>
                            <div class="mt-0.5 text-xs text-gray-600">${detailLine(r)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // 결과가 생성되면 결과 영역으로 스크롤
    dom.minmaxReportTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearMinMaxPanels() {
    _lastMinMaxBatchReport = null;
    if (dom.minmaxAllResult) {
        dom.minmaxAllResult.classList.add('hidden');
        dom.minmaxAllResult.innerHTML = '';
    }
    if (dom.minmaxReportTable) {
        dom.minmaxReportTable.classList.add('hidden');
        dom.minmaxReportTable.innerHTML = '';
    }
}

// 버튼 이벤트
if (dom.calcMinMaxAllBtn) {
    dom.calcMinMaxAllBtn.addEventListener('click', () => runMinMaxBatchCheck());
}

// 결과 테이블에서 문항 라벨 클릭 시 해당 문항으로 이동
if (dom.minmaxReportTable) {
    dom.minmaxReportTable.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-goto-question]');
        if (!btn) return;
        e.preventDefault();

        const qIdx = Number(btn.dataset.gotoQuestion);
        if (!Number.isFinite(qIdx)) return;
        if (qIdx < 0 || qIdx >= state.questions.length) return;

        state.currentIndex = qIdx;
        updateUI();

        // 좌측 입력 영역으로 시선 이동 (선택 사항)
        if (dom.id) {
            dom.id.scrollIntoView({ behavior: 'smooth', block: 'center' });
            dom.id.focus();
        }
    });
}


                
                dom.variablesContainer.addEventListener('input', e => {
                    if (e.target.tagName === 'INPUT') {
                        const { varName, varProp } = e.target.dataset;
                        const current = getCurrentQuestion();
                        const variable = (current.variables || []).find(v => v.name === varName);
                        if (variable) { variable[varProp] = e.target.value; }
                        updateJsonAndValidation();
                        scheduleMetaAutoSave();
                    }
                });

                // === 새로 시작 ===
                dom.newBtn.addEventListener('click', async () => {
                    if (!await showConfirm('편집 중인 내용을 초기화할까요? (초기화 후 복구 불가)', { okText: '초기화' })) return;
                    try {
                        localStorage.removeItem(AUTO_SAVE_KEY);
                        if (LEGACY_AUTO_SAVE_KEY !== AUTO_SAVE_KEY) {
                            localStorage.removeItem(LEGACY_AUTO_SAVE_KEY);
                        }
                    } catch (_) {}
                    await _clearAutoSaveImagesFromIndexedDb();
                    state.questions = [createEmptyQuestion()];
                    state.currentIndex = 0;
                    _resetValidationState();
                    clearMinMaxPanels();
                    updateUI();
                });

                // === 통합 불러오기 ===
                dom.loadBtn.addEventListener('click', () => dom.fileInput.click());

                dom.fileInput.addEventListener('change', async (event) => {
                    const file = event.target.files[0];
                    if (!file) return;
                    event.target.value = '';

                    try {
                        const result = await _parseFileForImport(file);
                        openImportModal(result.questions, result.groups, file.name);
                    } catch (err) {
                        console.error('파일 읽기 오류:', err);
                        await showAlert('파일을 불러오지 못했습니다.\n파일 형식(JSON/ZIP)과 내용을 확인해 주세요.');
                    }
                });

                // --- Tree dropdown open/close ---
                const _openTreePopup = () => {
                    dom.questionTreePopup.classList.remove('hidden');
                    dom.questionTreeSearch.value = '';
                    _filterTreeItems('');
                    dom.questionTreeSearch.focus({ preventScroll: true });
                    requestAnimationFrame(() => {
                        const active = dom.questionTreeList.querySelector('.tree-item.active');
                        if (active) _ensureVisibleInList(dom.questionTreeList, active);
                    });
                };
                const _closeTreePopup = () => {
                    dom.questionTreePopup.classList.add('hidden');
                };
                const _filterTreeItems = (query) => {
                    filterTreeItemsInList(dom.questionTreeList, query);
                };

                dom.questionTreeBtn.addEventListener('click', () => {
                    const isOpen = !dom.questionTreePopup.classList.contains('hidden');
                    if (isOpen) _closeTreePopup();
                    else _openTreePopup();
                });

                dom.questionTreeSearch.addEventListener('input', (e) => {
                    _filterTreeItems(e.target.value);
                });

                if (dom.validationErrors) {
                    dom.validationErrors.addEventListener('click', (e) => {
                        const fixBtn = e.target.closest('button[data-compat-fix-id]');
                        if (fixBtn) {
                            e.preventDefault();
                            const fixId = String(fixBtn.dataset.compatFixId || '');
                            const fix = _compatQuickFixById.get(fixId);
                            if (!fix) return;
                            const current = getCurrentQuestion();
                            const changed = applyRandomExamCompatQuickFix(current, fix);
                            if (!changed) return;
                            updateUI();
                            if ((fix.field === 'answer') && dom.answer) dom.answer.focus();
                            else if (dom.text) dom.text.focus();
                            return;
                        }

                        const warningNavBtn = e.target.closest('button[data-warning-nav]');
                        if (warningNavBtn) {
                            e.preventDefault();
                            const direction = String(warningNavBtn.dataset.warningNav || '').trim() === 'prev' ? 'prev' : 'next';
                            const targetIdx = _resolveWarningNavTarget(direction);
                            if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= state.questions.length) return;
                            state.currentIndex = targetIdx;
                            updateUI();
                            if (dom.id) dom.id.focus();
                            return;
                        }

                        const errorNavBtn = e.target.closest('button[data-error-nav]');
                        if (errorNavBtn) {
                            e.preventDefault();
                            const direction = String(errorNavBtn.dataset.errorNav || '').trim() === 'prev' ? 'prev' : 'next';
                            const targetIdx = _resolveErrorNavTarget(direction);
                            if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= state.questions.length) return;
                            state.currentIndex = targetIdx;
                            updateUI();
                            if (dom.id) dom.id.focus();
                            return;
                        }

                        const btn = e.target.closest('button[data-goto-question]');
                        if (!btn) return;
                        e.preventDefault();
                        const idx = Number(btn.dataset.gotoQuestion);
                        if (!Number.isInteger(idx) || idx < 0 || idx >= state.questions.length) return;
                        state.currentIndex = idx;
                        updateUI();
                        if (dom.id) dom.id.focus();
                    });
                }

                // Select item via event delegation
                dom.questionTreeList.addEventListener('click', (e) => {
                    const item = e.target.closest('.tree-item');
                    if (!item) return;
                    const idx = parseInt(item.dataset.idx, 10);
                    if (!Number.isNaN(idx) && idx >= 0 && idx < state.questions.length) {
                        state.currentIndex = idx;
                        _closeTreePopup();
                        updateUI();
                    }
                });
                dom.questionTreeList.addEventListener('keydown', (e) => {
                    if (e.key !== 'Escape') return;
                    e.preventDefault();
                    e.stopPropagation();
                    _closeTreePopup();
                    dom.questionTreeBtn.focus();
                });

                // Close popup on outside click
                document.addEventListener('mousedown', (e) => {
                    if (!dom.questionTreeWrap.contains(e.target)) _closeTreePopup();
                });

                // Close popup on Escape
                dom.questionTreeSearch.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        _closeTreePopup();
                        dom.questionTreeBtn.focus();
                    }
                });

                dom.addQuestionBtn.addEventListener('click', () => {
                    state.questions.push(createEmptyQuestion());
                    state.currentIndex = state.questions.length - 1;
                    _resetValidationState();
                    updateUI();
                });

                dom.deleteQuestionBtn.addEventListener('click', async () => {
                    if (state.questions.length <= 1) return;
                    if (!await showConfirm('현재 문항을 삭제할까요? (삭제 후 복구 불가)', { okText: '삭제' })) return;
                    state.questions.splice(state.currentIndex, 1);
                    if (state.currentIndex >= state.questions.length) {
                        state.currentIndex = state.questions.length - 1;
                    }
                    _resetValidationState();
                    updateUI();
                });

                // 이미지 박스 클릭 시 파일 선택
                dom.imageBox.addEventListener('click', (e) => {
                    if (e.target.closest('#image-remove-btn')) return;
                    dom.imageInput.click();
                });
                dom.imageInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > MAX_IMAGE_BYTES) {
                        await showAlert('이미지 파일 크기는 5MB 이하만 가능합니다.');
                        e.target.value = '';
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const current = getCurrentQuestion();
                        current.imageData = ev.target.result;
                        updateUI();
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                });

                // 이미지 제거 (X 버튼)
                dom.imageRemoveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const current = getCurrentQuestion();
                    current.imageData = null;
                    updateUI();
                });

                // === 전체 미리보기 ===
                let _previewObserver = null;
                let _previewRenderObserver = null;
                let _previewModalTeardown = null;
                let _previewScrollSyncCleanup = null;

                // Shared renderer for answer + variables (used in full preview & import detail)
                function _renderAnswerVarsHtml(q, useToggle) {
                    let innerHtml = '';
                    if (q.answer) {
                        const answerLatex = _escapeHtml((q.answer || '').replace(/\*([a-zA-Z_][a-zA-Z0-9_]*)\*/g, '$1'));
                        innerHtml += `<div class="pq-answer-section">
                            <div class="pq-answer-label">정답식</div>
                            <div>$$${answerLatex}$$</div>
                        </div>`;
                    }
                    if (q.variables && q.variables.length > 0) {
                        const varChips = q.variables.map(v => {
                            const name = _escapeHtml(v.name || '');
                            const mn = String(v.min ?? '');
                            const mx = String(v.max ?? '');
                            let chipText = `<span class="pq-var-name">${name}</span>`;
                            if (mn !== '' && mx !== '') {
                                chipText = `${_escapeHtml(mn)} ≤ <span class="pq-var-name">${name}</span> ≤ ${_escapeHtml(mx)}`;
                            } else if (mn !== '') {
                                chipText = `<span class="pq-var-name">${name}</span> ≥ ${_escapeHtml(mn)}`;
                            } else if (mx !== '') {
                                chipText = `<span class="pq-var-name">${name}</span> ≤ ${_escapeHtml(mx)}`;
                            }
                            return `<span class="pq-var-chip">${chipText}</span>`;
                        }).join('');
                        innerHtml += `<div class="mt-2">${varChips}</div>`;
                    }

                    if (!innerHtml) return '';

                    // Wrap in <details>/<summary> toggle if requested
                    if (useToggle) {
                        const varCount = (q.variables && q.variables.length > 0) ? ` · 변수 ${q.variables.length}개` : '';
                        return `<details class="pq-answer-toggle">
                            <summary><span class="pq-chev">▶</span> 정답 / 변수${varCount}</summary>
                            <div class="pq-answer-body">${innerHtml}</div>
                        </details>`;
                    }
                    return innerHtml;
                }

                function _renderPreviewItem(div, idx) {
                    if (!div || div.dataset.rendered === '1') return;
                    const q = state.questions[idx];
                    if (!q) return;

                    const headerHtml = `<div class="pq-header">
                            <span class="pq-number">${idx + 1}.</span>
                            ${q.id ? `<span class="pq-id">[${_escapeHtml(q.id)}]</span>` : ''}
                            ${(q.points !== undefined && q.points !== null && String(q.points).trim() !== '') ? `<span class="pq-points">${_escapeHtml(String(q.points))}점</span>` : ''}
                        </div>`;

                    const titleHtml = q.title ? `<div class="pq-title">${_escapeHtml(q.title)}</div>` : '';
                    const bodyHtml = `<div class="pq-body">${highlightVarsInKatex(q.text || '')}</div>`;
                    div.innerHTML = headerHtml + titleHtml + bodyHtml + _renderAnswerVarsHtml(q, true);
                    if (q.imageData) {
                        const img = document.createElement('img');
                        img.className = 'pq-image';
                        img.alt = '문항 이미지';
                        img.src = q.imageData;
                        const answerNode = div.querySelector('.pq-answer-toggle, .pq-answer-section');
                        if (answerNode) div.insertBefore(img, answerNode);
                        else div.appendChild(img);
                    }
                    div.dataset.rendered = '1';
                    div.style.minHeight = '';

                    if (window.renderMathInElement) {
                        renderMathInElement(div, {
                            delimiters: [
                                { left: '$$', right: '$$', display: true },
                                { left: '$', right: '$', display: false },
                            ],
                            throwOnError: false,
                            trust: false
                        });
                    }
                }

                function _syncPreviewHeaderState(activeIdx, totalQuestions, totalPoints) {
                    const safeIdx = Number.isInteger(activeIdx) && activeIdx >= 0 && activeIdx < state.questions.length
                        ? activeIdx
                        : 0;
                    dom.previewSummary.textContent = `${totalQuestions}문항` + (totalPoints > 0 ? ` · 총 ${totalPoints}점` : '');
                    dom.previewTreeLabel.textContent = formatQuestionTreeLabel(safeIdx, state.questions[safeIdx]);
                    dom.previewTreeList.querySelectorAll('.tree-item').forEach(el => {
                        el.classList.toggle('active', Number(el.dataset.idx) === safeIdx);
                    });
                }

                function openFullPreview() {
                    const totalQuestions = state.questions.length;
                    const totalPoints = state.questions.reduce((acc, q) => {
                        const n = Number(q.points);
                        return acc + (Number.isFinite(n) ? n : 0);
                    }, 0);

                    // Build preview tree dropdown
                    _patchTreeItems(dom.previewTreeList, state.questions, 0);
                    filterTreeItemsInList(dom.previewTreeList, dom.previewTreeSearch?.value || '');
                    _syncPreviewHeaderState(0, totalQuestions, totalPoints);

                    const frag = document.createDocumentFragment();

                    state.questions.forEach((q, idx) => {
                        const div = document.createElement('div');
                        div.className = 'preview-question';
                        div.dataset.idx = String(idx);
                        div.dataset.rendered = '';
                        div.style.minHeight = '12rem';
                        frag.appendChild(div);
                    });

                    dom.previewContent.innerHTML = '';
                    dom.previewContent.appendChild(frag);

                    const placeholders = dom.previewContent.querySelectorAll('.preview-question');
                    const _renderPreviewNeighborhood = (centerIdx) => {
                        const start = Math.max(0, centerIdx - 3);
                        const end = Math.min(state.questions.length - 1, centerIdx + 3);
                        for (let i = start; i <= end; i++) {
                            _renderPreviewItem(placeholders[i], i);
                        }
                    };
                    for (let i = 0; i < Math.min(5, placeholders.length); i++) {
                        _renderPreviewItem(placeholders[i], i);
                    }



                    dom.previewModal.classList.remove('hidden');
                    dom.previewModal.setAttribute('aria-hidden', 'false');
                    document.body.style.overflow = 'hidden';
                    dom.previewTreePopup.classList.add('hidden');
                    if (_previewModalTeardown) {
                        _previewModalTeardown();
                        _previewModalTeardown = null;
                    }
                    if (_previewScrollSyncCleanup) {
                        _previewScrollSyncCleanup();
                        _previewScrollSyncCleanup = null;
                    }
                    _previewModalTeardown = _attachModalFocusTrap(dom.previewModal, {
                        initialFocus: dom.previewCloseBtn,
                        onEscape: () => {
                            if (!dom.previewTreePopup.classList.contains('hidden')) {
                                _closePreviewTree();
                                dom.previewTreeBtn.focus();
                                return;
                            }
                            closeFullPreview();
                        }
                    });

                    const canUseIntersectionObserver = typeof IntersectionObserver === 'function';
                    const questionEls = dom.previewContent.querySelectorAll('.preview-question');

                    if (canUseIntersectionObserver) {
                        if (_previewRenderObserver) _previewRenderObserver.disconnect();
                        _previewRenderObserver = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (!entry.isIntersecting) return;
                                const idx = Number(entry.target.dataset.idx);
                                if (!Number.isFinite(idx)) return;
                                _renderPreviewNeighborhood(idx);
                            });
                        }, { root: dom.previewModal, rootMargin: '300px' });

                        placeholders.forEach(el => {
                            _previewRenderObserver.observe(el);
                        });

                        // IntersectionObserver for scroll position tracking
                        if (_previewObserver) _previewObserver.disconnect();
                        const visibleSet = new Set();

                        _previewObserver = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                const idx = Number(entry.target.dataset.idx);
                                if (entry.isIntersecting) visibleSet.add(idx);
                                else visibleSet.delete(idx);
                            });
                            if (visibleSet.size > 0) {
                                _syncPreviewHeaderState(Math.min(...visibleSet), totalQuestions, totalPoints);
                            }
                        }, { root: dom.previewModal, threshold: 0.1 });

                        questionEls.forEach(el => {
                            _previewObserver.observe(el);
                        });
                    } else {
                        placeholders.forEach((el, idx) => _renderPreviewItem(el, idx));
                        const onPreviewScroll = () => {
                            const stickyHeader = dom.previewModal.querySelector('.sticky');
                            const thresholdTop = stickyHeader?.getBoundingClientRect().bottom
                                ?? dom.previewModal.getBoundingClientRect().top;
                            let topVisible = 0;
                            questionEls.forEach(el => {
                                const idx = Number(el.dataset.idx);
                                if (!Number.isFinite(idx)) return;
                                const rect = el.getBoundingClientRect();
                                if (rect.bottom <= thresholdTop) {
                                    topVisible = idx;
                                    return;
                                }
                                if (rect.top <= thresholdTop || topVisible === 0) {
                                    topVisible = idx;
                                }
                            });
                            _syncPreviewHeaderState(topVisible, totalQuestions, totalPoints);
                        };
                        dom.previewModal.addEventListener('scroll', onPreviewScroll, { passive: true });
                        _previewScrollSyncCleanup = () => {
                            dom.previewModal.removeEventListener('scroll', onPreviewScroll);
                        };
                        requestAnimationFrame(onPreviewScroll);
                    }
                }

                function closeFullPreview() {
                    if (_previewObserver) { _previewObserver.disconnect(); _previewObserver = null; }
                    if (_previewRenderObserver) { _previewRenderObserver.disconnect(); _previewRenderObserver = null; }
                    if (_previewScrollSyncCleanup) {
                        _previewScrollSyncCleanup();
                        _previewScrollSyncCleanup = null;
                    }
                    if (_previewModalTeardown) {
                        _previewModalTeardown();
                        _previewModalTeardown = null;
                    }
                    _closePreviewTree();
                    dom.previewModal.classList.add('hidden');
                    dom.previewModal.setAttribute('aria-hidden', 'true');
                    document.body.style.overflow = '';
                }

                // Preview tree dropdown handlers
                const _openPreviewTree = () => {
                    dom.previewTreePopup.classList.remove('hidden');
                    dom.previewTreeSearch.value = '';
                    _filterPreviewTreeItems('');
                    dom.previewTreeSearch.focus({ preventScroll: true });
                    requestAnimationFrame(() => {
                        const active = dom.previewTreeList.querySelector('.tree-item.active');
                        if (active) _ensureVisibleInList(dom.previewTreeList, active);
                    });
                };
                const _closePreviewTree = () => { dom.previewTreePopup.classList.add('hidden'); };
                const _filterPreviewTreeItems = (query) => {
                    filterTreeItemsInList(dom.previewTreeList, query);
                };

                dom.previewTreeBtn.addEventListener('click', () => {
                    if (!dom.previewTreePopup.classList.contains('hidden')) _closePreviewTree();
                    else _openPreviewTree();
                });
                dom.previewTreeSearch.addEventListener('input', (e) => _filterPreviewTreeItems(e.target.value));
                dom.previewTreeList.addEventListener('click', (e) => {
                    const item = e.target.closest('.tree-item');
                    if (!item) return;
                    const idx = parseInt(item.dataset.idx, 10);
                    const target = dom.previewContent.querySelector(`.preview-question[data-idx="${idx}"]`);
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (!Number.isNaN(idx) && idx >= 0 && idx < state.questions.length) {
                        dom.previewTreeLabel.textContent = formatQuestionTreeLabel(idx, state.questions[idx]);
                        dom.previewTreeList.querySelectorAll('.tree-item').forEach(el => {
                            el.classList.toggle('active', Number(el.dataset.idx) === idx);
                        });
                    }
                    _closePreviewTree();
                });
                dom.previewTreeList.addEventListener('keydown', (e) => {
                    if (e.key !== 'Escape') return;
                    e.preventDefault();
                    e.stopPropagation();
                    _closePreviewTree();
                    dom.previewTreeBtn.focus();
                });
                document.addEventListener('mousedown', (e) => {
                    if (dom.previewTreeWrap && !dom.previewTreeWrap.contains(e.target)) _closePreviewTree();
                });
                dom.previewTreeSearch.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        _closePreviewTree();
                        dom.previewTreeBtn.focus();
                    }
                });

                dom.previewAllBtn.addEventListener('click', openFullPreview);
                dom.previewCloseBtn.addEventListener('click', closeFullPreview);
                dom.previewPrintBtn.addEventListener('click', () => {
                    // 인쇄 전 미렌더링 문항 전체 강제 렌더
                    const placeholders = dom.previewContent.querySelectorAll('.preview-question');
                    placeholders.forEach((el, i) => _renderPreviewItem(el, i));

                    const details = dom.previewContent.querySelectorAll('.pq-answer-toggle');
                    const prev = Array.from(details).map(d => d.open);
                    details.forEach(d => { d.open = true; });

                    // KaTeX 렌더링 완료 대기 후 인쇄
                    requestAnimationFrame(() => {
                        window.print();
                        details.forEach((d, i) => { d.open = prev[i]; });
                    });
                });

                // Close modal on backdrop click
                dom.previewModal.addEventListener('click', (e) => {
                    if (e.target === dom.previewModal) closeFullPreview();
                });

                // === 통합 불러오기 / 선택적 가져오기 ===
                let _importCandidates = [];

                function _normalizeZipPath(path) {
                    return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
                }

                function _zipDir(path) {
                    const normalized = _normalizeZipPath(path);
                    const idx = normalized.lastIndexOf('/');
                    return idx >= 0 ? normalized.slice(0, idx + 1) : '';
                }

                function _buildZipImageIndex(zip, imgExts) {
                    const byBase = new Map();
                    const byDirBase = new Map();

                    zip.forEach((path, entry) => {
                        if (entry.dir) return;
                        const normalizedPath = _normalizeZipPath(path);
                        const fname = normalizedPath.split('/').pop();
                        const dotIdx = fname.lastIndexOf('.');
                        if (dotIdx < 0) return;

                        const ext = fname.slice(dotIdx).toLowerCase();
                        if (!imgExts.includes(ext)) return;

                        const base = fname.slice(0, dotIdx);
                        const dir = _zipDir(normalizedPath);
                        const info = { entry, normalizedPath, dir, base, ext };
                        if (!byBase.has(base)) byBase.set(base, []);
                        byBase.get(base).push(info);

                        const dirBaseKey = `${dir}\u0000${base}`;
                        if (!byDirBase.has(dirBaseKey)) byDirBase.set(dirBaseKey, []);
                        byDirBase.get(dirBaseKey).push(info);
                    });

                    return { byBase, byDirBase };
                }

                function _resolveImageEntryForQuestion(imageIndex, questionId, jsonFilePath) {
                    const id = String(questionId || '').trim();
                    if (!id) return null;

                    const jsonDir = _zipDir(jsonFilePath);

                    // 1) Prefer exact same-folder + exact ID case match.
                    const sameDir = imageIndex.byDirBase.get(`${jsonDir}\u0000${id}`) || [];
                    if (sameDir.length === 1) return sameDir[0].entry;
                    if (sameDir.length > 1) return null;

                    // 2) Fallback only when globally unique with exact ID case.
                    const candidates = imageIndex.byBase.get(id) || [];
                    if (candidates.length === 1) return candidates[0].entry;

                    // Ambiguous or missing: do not attach wrong image.
                    return null;
                }

                async function _parseFileForImport(file) {
                    const isZip = file.name.toLowerCase().endsWith('.zip');
                    const mimeByExt = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml' };
                    const imgExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

                    if (!isZip) {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        const rawQ = Array.isArray(data) ? data : (data.questions || []);
                        if (!Array.isArray(rawQ) || rawQ.length === 0) throw new Error('가져올 문항이 없습니다.');
                        const questions = [];
                        for (const q of rawQ) {
                            const mapped = _mapQuestion(q);
                            if (mapped) questions.push(mapped);
                        }
                        if (questions.length === 0) throw new Error('가져올 문항이 없습니다.');
                        return { questions, groups: null, skippedLargeImages: 0 };
                    }

                    // ZIP: scan for all JSON files and group by folder
                    const zip = await JSZip.loadAsync(file);
                    const jsonFiles = [];
                    zip.forEach((path, entry) => {
                        if (!entry.dir && path.toLowerCase().endsWith('.json')) jsonFiles.push(entry);
                    });
                    if (jsonFiles.length === 0) throw new Error('ZIP 파일에 .json 파일이 없습니다.');

                    // Build robust image index (path-aware) for entire ZIP
                    const imageIndex = _buildZipImageIndex(zip, imgExts);
                    const importMeta = { skippedLargeImages: 0 };

                    // Parse each JSON file
                    const allQuestions = [];
                    const groups = jsonFiles.length > 1 ? [] : null;

                    for (const jf of jsonFiles) {
                        const jsonText = await jf.async('string');
                        let data;
                        try { data = JSON.parse(jsonText); } catch { continue; }
                        const rawQ = Array.isArray(data) ? data : (data.questions || []);
                        if (!Array.isArray(rawQ)) continue;

                        const startIdx = allQuestions.length;
                        for (const q of rawQ) {
                            const question = await _mapQuestionAsync(q, imageIndex, mimeByExt, jf.name, importMeta, { deferImage: true });
                            if (question) allQuestions.push(question);
                        }

                        if (groups !== null) {
                            const folder = jf.name.includes('/') ? jf.name.substring(0, jf.name.lastIndexOf('/')) : '';
                            const fname = jf.name.split('/').pop();
                            groups.push({ folder, file: fname, filePath: jf.name, startIdx, count: allQuestions.length - startIdx });
                        }
                    }

                    if (allQuestions.length === 0) throw new Error('가져올 문항이 없습니다.');
                    return { questions: allQuestions, groups, skippedLargeImages: importMeta.skippedLargeImages };
                }

                function _mapQuestion(q) {
                    if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
                    const asText = (v) => (typeof v === 'string' ? v : '');
                    const normalizedRawId = (typeof q.id === 'string' || typeof q.id === 'number') ? q.id : '';
                    return {
                        id: normalizeQuestionId(normalizedRawId),
                        title: asText(q.title),
                        text: asText(q.text),
                        answer: asText(q.answer),
                        points: coerceQuestionPointsInput(q.points),
                        variables: normalizeQuestionVariables(q.variables),
                        imageData: null
                    };
                }

                function _getImportImageRef(question, imageIndex, mimeByExt, jsonFilePath = '') {
                    if (!question || !imageIndex) return null;
                    const imgEntry = _resolveImageEntryForQuestion(imageIndex, question.id, jsonFilePath);
                    if (!imgEntry) return null;
                    const fname = imgEntry.name.split('/').pop();
                    const dotIndex = fname.lastIndexOf('.');
                    const extKey = dotIndex >= 0 ? fname.slice(dotIndex).toLowerCase() : '';
                    return {
                        entry: imgEntry,
                        mime: mimeByExt[extKey] || 'image/png'
                    };
                }

                function _hasDeferredImportImage(question) {
                    return !!(question && question._importImageRef);
                }

                function _cloneImportQuestion(q) {
                    const cloned = {
                        id: normalizeQuestionId(q?.id),
                        title: q?.title || '',
                        text: q?.text || '',
                        answer: q?.answer || '',
                        points: coerceQuestionPointsInput(q?.points),
                        variables: normalizeQuestionVariables(q?.variables),
                        imageData: q?.imageData || null
                    };
                    if (q?._importImageRef) cloned._importImageRef = q._importImageRef;
                    return cloned;
                }

                async function _materializeDeferredImportImage(question, importMeta = null) {
                    if (!_hasDeferredImportImage(question) || question.imageData) return question;
                    const binary = await question._importImageRef.entry.async('uint8array');
                    if (binary.byteLength > MAX_IMAGE_BYTES) {
                        if (importMeta) importMeta.skippedLargeImages += 1;
                        return question;
                    }
                    const blob = new Blob([binary], { type: question._importImageRef.mime || 'image/png' });
                    question.imageData = await _blobToDataUrl(blob);
                    return question;
                }

                function _yieldToUi() {
                    if (typeof requestAnimationFrame === 'function') {
                        return new Promise(resolve => requestAnimationFrame(() => resolve()));
                    }
                    return Promise.resolve();
                }

                async function _materializeImportQuestions(sourceQuestions, options) {
                    const questions = Array.isArray(sourceQuestions) ? sourceQuestions : [];
                    const importMeta = { skippedLargeImages: 0 };
                    const resolved = [];
                    const total = questions.length;
                    const onProgress = options && typeof options.onProgress === 'function'
                        ? options.onProgress
                        : null;

                    for (let i = 0; i < total; i++) {
                        const prepared = _cloneImportQuestion(questions[i]);
                        await _materializeDeferredImportImage(prepared, importMeta);
                        if (prepared._importImageRef) delete prepared._importImageRef;
                        resolved.push(prepared);

                        if (onProgress) onProgress(i + 1, total);
                        if ((i + 1) < total && (i + 1) % IMPORT_MATERIALIZE_BATCH_SIZE === 0) {
                            await _yieldToUi();
                        }
                    }

                    return {
                        questions: resolved,
                        skippedLargeImages: importMeta.skippedLargeImages
                    };
                }

                async function _mapQuestionAsync(q, imageIndex, mimeByExt, jsonFilePath = '', importMeta = null, options) {
                    const question = _mapQuestion(q);
                    if (!question) return null;
                    const importImageRef = _getImportImageRef(question, imageIndex, mimeByExt, jsonFilePath);
                    if (importImageRef) question._importImageRef = importImageRef;
                    const deferImage = !!(options && options.deferImage);
                    if (deferImage) return question;
                    await _materializeDeferredImportImage(question, importMeta);
                    if (question._importImageRef) delete question._importImageRef;
                    return question;
                }

                function _updateImportSummary() {
                    const isBusy = (typeof _importBusy !== 'undefined') ? _importBusy : false;
                    const checked = dom.importList.querySelectorAll('.import-item input[type="checkbox"]:checked').length;
                    const visible = dom.importList.querySelectorAll('.import-item:not([style*="display: none"])');
                    const visibleCheckboxes = dom.importList.querySelectorAll('.import-item:not([style*="display: none"]) input[type="checkbox"]');
                    const visibleChecked = dom.importList.querySelectorAll('.import-item:not([style*="display: none"]) input[type="checkbox"]:checked').length;
                    const total = _importCandidates.length;
                    const visCount = visible.length;
                    const hiddenChecked = Math.max(0, checked - visibleChecked);
                    let text = `${checked}개 선택`;
                    const detailBits = [];
                    if (visCount < total) detailBits.push(`${visCount}/${total} 표시`);
                    if (hiddenChecked > 0) detailBits.push(`숨김 선택 ${hiddenChecked}개`);
                    if (detailBits.length > 0) text += ` (${detailBits.join(', ')})`;
                    dom.importSummary.textContent = text;
                    if (dom.importAppendBtn) dom.importAppendBtn.disabled = isBusy || checked === 0;
                    if (dom.importReplaceBtn) dom.importReplaceBtn.disabled = isBusy || total === 0;
                    if (dom.importCancelBtn) dom.importCancelBtn.disabled = isBusy;
                    if (dom.importSelectAllBtn) dom.importSelectAllBtn.disabled = isBusy || visibleCheckboxes.length === 0;
                    if (dom.importSearch) dom.importSearch.disabled = isBusy;
                    if (dom.importFileNavBtn) dom.importFileNavBtn.disabled = isBusy || !(_importGroups && _importGroups.length > 1);
                    const allChecked = visibleCheckboxes.length > 0 && [...visibleCheckboxes].every(cb => cb.checked);
                    dom.importSelectAllBtn.textContent = allChecked ? '전체 해제' : '전체 선택';
                }

                function _applyImportSearchFilter(queryRaw = '', {
                    items = null,
                    syncFolders = true,
                    updateSummary = true
                } = {}) {
                    const query = String(queryRaw || '').toLowerCase().trim();
                    const targetItems = items || dom.importList.querySelectorAll('.import-item');
                    [...targetItems].forEach(item => {
                        if (!query) { item.style.display = ''; return; }
                        const text = item.dataset.searchText || '';
                        item.style.display = text.includes(query) ? '' : 'none';
                    });
                    // Show/hide folder nodes based on whether they have visible children
                    if (syncFolders && _importGroups) {
                        dom.importList.querySelectorAll('.import-folder').forEach(folder => {
                            const visibleItems = folder.querySelectorAll('.import-item:not([style*="display: none"])');
                            folder.style.display = (!query || visibleItems.length > 0) ? '' : 'none';
                        });
                    }
                    if (updateSummary) _updateImportSummary();
                }

                function _buildImportItem(q, idx, existingIds) {
                    const normalizedId = normalizeQuestionId(q.id);
                    const isDuplicate = normalizedId && existingIds.has(normalizedId);
                    const textSnippet = (q.text || '').replace(/\$[^$]*\$/g, '').slice(0, 80);
                    const hasImportImage = !!(q.imageData || _hasDeferredImportImage(q));

                    const item = document.createElement('div');
                    item.className = 'import-item border border-gray-200 rounded-lg overflow-hidden';
                    item.dataset.importIdx = String(idx);
                    item.dataset.searchText = `${q.id} ${q.title} ${q.text}`.toLowerCase();

                    item.innerHTML = `
                        <label class="flex items-start gap-3 p-3 hover:bg-blue-50 cursor-pointer transition-colors">
                            <input type="checkbox" class="mt-1 rounded border-gray-300 text-blue-500 focus:ring-blue-500" data-import-idx="${idx}">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="font-semibold text-sm text-gray-800">${idx + 1}번</span>
                                    ${q.id ? `<span class="text-xs font-mono text-gray-500">[${_escapeHtml(q.id)}]</span>` : ''}
                                    ${isDuplicate ? `<span class="text-xs bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded">중복</span>` : ''}
                                    ${hasImportImage ? `<span class="text-xs bg-blue-100 text-blue-600 font-semibold px-1.5 py-0.5 rounded">이미지</span>` : ''}
                                </div>
                                ${q.title ? `<div class="text-sm text-gray-700 font-medium mt-0.5">${_escapeHtml(q.title)}</div>` : ''}
                                ${textSnippet ? `<div class="text-xs text-gray-400 mt-0.5 truncate">${_escapeHtml(textSnippet)}</div>` : ''}
                            </div>
                            <button type="button" class="import-expand-btn" title="상세 보기">&#9660;</button>
                        </label>
                        <div class="import-detail hidden border-t border-gray-100 bg-gray-50 p-3 text-sm"></div>
                    `;

                    const cb = item.querySelector('input[type="checkbox"]');
                    cb.addEventListener('change', (e) => { e.stopPropagation(); _updateImportSummary(); });

                    const expandBtn = item.querySelector('.import-expand-btn');
                    const detailDiv = item.querySelector('.import-detail');
                    expandBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const isOpen = !detailDiv.classList.contains('hidden');
                        if (isOpen) {
                            detailDiv.classList.add('hidden');
                            expandBtn.innerHTML = '&#9660;';
                        } else {
                            if (!detailDiv.dataset.rendered) {
                                _renderImportDetail(detailDiv, q);
                                detailDiv.dataset.rendered = '1';
                            }
                            detailDiv.classList.remove('hidden');
                            expandBtn.innerHTML = '&#9650;';
                        }
                    });

                    return item;
                }

                function _renderImportList() {
                    _importRenderToken++;
                    if (_importRenderRafId !== null) {
                        cancelAnimationFrame(_importRenderRafId);
                        _importRenderRafId = null;
                    }
                    const renderToken = _importRenderToken;
                    const existingIds = new Set(state.questions.map(q => normalizeQuestionId(q.id)).filter(Boolean));
                    dom.importList.innerHTML = '';

                    if (_importGroups && _importGroups.length > 0) {
                        const folderMap = new Map();
                        _importGroups.forEach(g => {
                            const folder = g.folder || '';
                            if (!folderMap.has(folder)) folderMap.set(folder, []);
                            folderMap.get(folder).push(g);
                        });

                        const folderContainers = new Map();
                        folderMap.forEach((groups, folder) => {
                            const needsFolderWrap = folderMap.size > 1 || folder !== '';
                            let folderContainer = dom.importList;

                            if (needsFolderWrap) {
                                const folderDiv = document.createElement('div');
                                folderDiv.className = 'import-folder';
                                folderDiv.dataset.folder = folder;

                                const folderItemCount = groups.reduce((s, g) => s + g.count, 0);
                                folderDiv.innerHTML = `
                                    <div class="import-folder-header">
                                        <span class="import-folder-toggle">&#9660;</span>
                                        <span class="import-folder-icon">&#128193;</span>
                                        <span class="import-folder-label">${_escapeHtml(folder || '(루트)')}</span>
                                        <span class="import-folder-count">${folderItemCount}개</span>
                                    </div>
                                    <div class="import-folder-body"></div>
                                `;

                                const toggle = folderDiv.querySelector('.import-folder-toggle');
                                const body = folderDiv.querySelector('.import-folder-body');
                                folderDiv.querySelector('.import-folder-header').addEventListener('click', () => {
                                    body.classList.toggle('collapsed');
                                    toggle.classList.toggle('collapsed');
                                });

                                dom.importList.appendChild(folderDiv);
                                folderContainer = body;
                            }

                            folderContainers.set(folder, {
                                needsFolderWrap,
                                container: folderContainer,
                                groups
                            });
                        });

                        const groupQueue = [];
                        folderContainers.forEach(({ needsFolderWrap, container, groups }) => {
                            groups.forEach(g => {
                                groupQueue.push({ g, needsFolderWrap, container });
                            });
                        });

                        let i = 0;
                        const renderNextGroup = () => {
                            if (renderToken !== _importRenderToken) return;
                            if (i >= groupQueue.length) {
                                const activeQuery = dom.importSearch?.value || '';
                                if (String(activeQuery).trim()) _applyImportSearchFilter(activeQuery);
                                else _updateImportSummary();
                                return;
                            }

                            const { g, needsFolderWrap, container } = groupQueue[i++];
                            const fileDiv = document.createElement('div');
                            fileDiv.className = 'import-folder import-file-section';
                            fileDiv.dataset.filePath = g.filePath || g.file || '';
                            const fileHeaderClass = needsFolderWrap
                                ? 'import-folder-header import-file-header import-file-header-nested'
                                : 'import-folder-header import-file-header import-file-header-root';

                            fileDiv.innerHTML = `
                                <div class="${fileHeaderClass}">
                                    <span class="import-folder-toggle import-file-toggle">&#9660;</span>
                                    <span class="import-folder-icon import-file-icon">&#128196;</span>
                                    <span class="import-folder-label import-file-label">${_escapeHtml(g.file)}</span>
                                    <span class="import-folder-count">${g.count}개</span>
                                </div>
                                <div class="import-folder-body"></div>
                            `;

                            const toggle = fileDiv.querySelector('.import-folder-toggle');
                            const body = fileDiv.querySelector('.import-folder-body');
                            fileDiv.querySelector('.import-folder-header').addEventListener('click', () => {
                                body.classList.toggle('collapsed');
                                toggle.classList.toggle('collapsed');
                            });

                            const itemsContainer = document.createElement('div');
                            itemsContainer.className = 'p-2 space-y-1';
                            const appendedItems = [];
                            for (let idx = g.startIdx; idx < g.startIdx + g.count; idx++) {
                                const q = _importCandidates[idx];
                                if (!q) continue;
                                const itemNode = _buildImportItem(q, idx, existingIds);
                                appendedItems.push(itemNode);
                                itemsContainer.appendChild(itemNode);
                            }
                            body.appendChild(itemsContainer);
                            container.appendChild(fileDiv);

                            const activeQuery = dom.importSearch?.value || '';
                            if (String(activeQuery).trim()) {
                                _applyImportSearchFilter(activeQuery, {
                                    items: appendedItems,
                                    syncFolders: false
                                });
                            } else {
                                _updateImportSummary();
                            }

                            _importRenderRafId = requestAnimationFrame(renderNextGroup);
                        };

                        _importRenderRafId = requestAnimationFrame(renderNextGroup);
                    } else {
                        // No groups -> flat list (single JSON file)
                        const chunkSize = 50;
                        let start = 0;
                        const renderChunk = () => {
                            if (renderToken !== _importRenderToken) return;
                            const end = Math.min(_importCandidates.length, start + chunkSize);
                            const appendedItems = [];
                            for (let idx = start; idx < end; idx++) {
                                const q = _importCandidates[idx];
                                const itemNode = _buildImportItem(q, idx, existingIds);
                                appendedItems.push(itemNode);
                                dom.importList.appendChild(itemNode);
                            }
                            start = end;

                            const activeQuery = dom.importSearch?.value || '';
                            if (String(activeQuery).trim()) {
                                _applyImportSearchFilter(activeQuery, {
                                    items: appendedItems,
                                    syncFolders: false
                                });
                            } else {
                                _updateImportSummary();
                            }

                            if (start < _importCandidates.length) {
                                _importRenderRafId = requestAnimationFrame(renderChunk);
                            } else {
                                if (String(activeQuery).trim()) _applyImportSearchFilter(activeQuery);
                                else _updateImportSummary();
                            }
                        };
                        _importRenderRafId = requestAnimationFrame(renderChunk);
                    }
                }

                function _renderImportDetail(container, q) {
                    let html = '';

                    // Text with KaTeX (label needed since this is collapsed context)
                    if (q.text) {
                        const bodyText = highlightVarsInKatex(q.text);
                        html += `<div class="mb-2"><div class="text-xs font-semibold text-gray-500 mb-1">지문</div><div class="text-sm leading-relaxed">${bodyText}</div></div>`;
                    }

                    // Answer + Variables (shared renderer)
                    html += _renderAnswerVarsHtml(q);

                    container.innerHTML = html;
                    if (q.imageData) {
                        const imageWrap = document.createElement('div');
                        imageWrap.className = 'mb-2';
                        const img = document.createElement('img');
                        img.alt = '문항 이미지';
                        img.className = 'max-w-48 max-h-36 object-contain border border-gray-200 rounded mx-auto block';
                        img.src = q.imageData;
                        imageWrap.appendChild(img);
                        const answerNode = container.querySelector('.pq-answer-toggle, .pq-answer-section');
                        if (answerNode) container.insertBefore(imageWrap, answerNode);
                        else container.appendChild(imageWrap);
                    } else if (_hasDeferredImportImage(q)) {
                        const note = document.createElement('div');
                        note.className = 'import-deferred-image-note';
                        note.textContent = '이미지는 실제 불러오기 시 로드됩니다.';
                        const answerNode = container.querySelector('.pq-answer-toggle, .pq-answer-section');
                        if (answerNode) container.insertBefore(note, answerNode);
                        else container.appendChild(note);
                    }

                    // Render KaTeX inside detail
                    if (window.renderMathInElement) {
                        renderMathInElement(container, {
                            delimiters: [
                                { left: '$$', right: '$$', display: true },
                                { left: '$', right: '$', display: false },
                            ],
                            throwOnError: false,
                            trust: false
                        });
                    }
                }

                let _importGroups = null;
                let _importRenderToken = 0;
                let _importRenderRafId = null;
                let _importModalTeardown = null;
                let _importBusy = false;

                function _setImportBusyState(isBusy, statusText = '') {
                    _importBusy = isBusy;
                    dom.importStatus.textContent = statusText;
                    dom.importStatus.classList.toggle('hidden', !statusText);
                    dom.importStatus.classList.toggle('import-status-busy', isBusy);
                    _updateImportSummary();
                }

                function openImportModal(questions, groups, filename) {
                    _importCandidates = questions;
                    _importGroups = groups;
                    dom.importFileLabel.textContent = filename || '';
                    dom.importSearch.value = '';
                    dom.importFileNavPopup.classList.add('hidden');
                    _renderImportList();
                    _setImportBusyState(false, '');

                    // Build file nav dropdown if multiple JSON files
                    if (groups && groups.length > 1) {
                        dom.importFileNavBtn.classList.remove('hidden');
                        dom.importFileNavLabel.textContent = `${groups.length}개 파일`;
                        dom.importFileNavList.innerHTML = '';

                        // "전체" item
                        const allItem = document.createElement('div');
                        allItem.className = 'tree-item';
                        allItem.innerHTML = `<span class="tree-item-num tree-item-num-icon">&#128230;</span><span class="tree-item-title">전체 (${questions.length}개)</span>`;
                        _makeTreeActionFocusable(allItem);
                        allItem.addEventListener('click', () => {
                            dom.importList.scrollTo({ top: 0, behavior: 'smooth' });
                            _closeImportFileNav();
                        });
                        dom.importFileNavList.appendChild(allItem);

                        // Build folder -> file tree
                        const folderMap = new Map();
                        groups.forEach(g => {
                            const folder = g.folder || '';
                            if (!folderMap.has(folder)) folderMap.set(folder, []);
                            folderMap.get(folder).push(g);
                        });

                        folderMap.forEach((fileGroups, folder) => {
                            if (folderMap.size > 1 || folder !== '') {
                                const hdr = document.createElement('div');
                                hdr.className = 'tree-group-hdr';
                                hdr.innerHTML = `<span>&#128193;</span> <span>${_escapeHtml(folder || '(루트)')}</span><span class="tree-group-count">${fileGroups.reduce((s, g) => s + g.count, 0)}개</span>`;
                                _makeTreeActionFocusable(hdr);
                                dom.importFileNavList.appendChild(hdr);
                                hdr.addEventListener('click', () => {
                                    // Scroll to folder section
                                    const folderEl = dom.importList.querySelector(`.import-folder[data-folder="${CSS.escape(folder)}"]`);
                                    if (folderEl) folderEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    _closeImportFileNav();
                                });
                            }
                            fileGroups.forEach(g => {
                                const item = document.createElement('div');
                                item.className = `tree-item ${(folderMap.size > 1 || folder !== '') ? 'tree-item-indent-nested' : 'tree-item-indent-root'}`;
                                item.innerHTML = `<span class="tree-item-num tree-item-num-icon">&#128196;</span><span class="tree-item-id">${_escapeHtml(g.file)}</span><span class="tree-group-count">${g.count}개</span>`;
                                _makeTreeActionFocusable(item);
                                item.addEventListener('click', () => {
                                    const section = dom.importList.querySelector(`.import-file-section[data-file-path="${CSS.escape(g.filePath || g.file || '')}"]`);
                                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    _closeImportFileNav();
                                });
                                dom.importFileNavList.appendChild(item);
                            });
                        });
                    } else {
                        dom.importFileNavBtn.classList.add('hidden');
                    }

                    dom.importModal.classList.remove('hidden');
                    dom.importModal.setAttribute('aria-hidden', 'false');
                    document.body.style.overflow = 'hidden';
                    if (_importModalTeardown) {
                        _importModalTeardown();
                        _importModalTeardown = null;
                    }
                    _importModalTeardown = _attachModalFocusTrap(dom.importModal, {
                        initialFocus: dom.importSearch,
                        onEscape: () => {
                            if (!dom.importFileNavPopup.classList.contains('hidden')) {
                                _closeImportFileNav();
                                dom.importFileNavBtn.focus();
                                return;
                            }
                            closeImportModal();
                        }
                    });
                }

                function closeImportModal() {
                    if (_importBusy) return;
                    _importRenderToken++;
                    if (_importRenderRafId !== null) {
                        cancelAnimationFrame(_importRenderRafId);
                        _importRenderRafId = null;
                    }
                    if (_importModalTeardown) {
                        _importModalTeardown();
                        _importModalTeardown = null;
                    }
                    dom.importModal.classList.add('hidden');
                    dom.importModal.setAttribute('aria-hidden', 'true');
                    document.body.style.overflow = '';
                    _importBusy = false;
                    _closeImportFileNav();
                    dom.importStatus.textContent = '';
                    dom.importStatus.classList.add('hidden');
                    dom.importStatus.classList.remove('import-status-busy');
                    _importCandidates = [];
                    _importGroups = null;
                }

                // "전체 교체" -> replace all current questions with all from file
                async function doReplace() {
                    if (_importBusy) return;
                    if (_importCandidates.length === 0) return;
                    if (!await showConfirm('현재 문항을 전체 교체할까요? (기존 문항 복구 불가)', { okText: '전체 교체' })) return;
                    try {
                        _setImportBusyState(true, `문항 준비 중... 0/${_importCandidates.length}`);
                        const importResult = await _materializeImportQuestions(_importCandidates, {
                            onProgress: (done, total) => {
                                _setImportBusyState(true, `문항 준비 중... ${done}/${total}`);
                            }
                        });
                        state.questions = importResult.questions;
                        state.currentIndex = 0;
                        _resetValidationState();
                        clearMinMaxPanels();
                        updateUI();
                        _setImportBusyState(false, '');
                        closeImportModal();
                        if (importResult.skippedLargeImages > 0) {
                            await showAlert(`불러오기에서 5MB 초과 이미지 ${importResult.skippedLargeImages}개를 제외했습니다.`);
                        }
                    } catch (err) {
                        console.error('전체 교체 불러오기 오류:', err);
                        _setImportBusyState(false, '');
                        await showAlert('선택한 문항을 불러오지 못했습니다.\n잠시 후 다시 시도해 주세요.');
                    }
                }

                // "선택 추가" -> append only checked questions
                async function doAppend() {
                    if (_importBusy) return;
                    const checkboxes = dom.importList.querySelectorAll('.import-item input[type="checkbox"]:checked');
                    if (checkboxes.length === 0) return;

                    const selectedCandidates = [];
                    checkboxes.forEach(cb => {
                        const idx = parseInt(cb.dataset.importIdx, 10);
                        const q = _importCandidates[idx];
                        if (q) selectedCandidates.push(q);
                    });

                    const existingIds = new Set(state.questions.map(q => normalizeQuestionId(q.id)).filter(Boolean));
                    const duplicateIds = [];

                    try {
                        _setImportBusyState(true, `문항 준비 중... 0/${selectedCandidates.length}`);
                        const importResult = await _materializeImportQuestions(selectedCandidates, {
                            onProgress: (done, total) => {
                                _setImportBusyState(true, `문항 준비 중... ${done}/${total}`);
                            }
                        });

                        importResult.questions.forEach((q) => {
                            const imported = _cloneImportQuestion(q);
                            if (imported._importImageRef) delete imported._importImageRef;
                            imported.id = normalizeQuestionId(imported.id);

                            if (imported.id && existingIds.has(imported.id)) {
                                const origId = imported.id;
                                let suffix = 2;
                                while (existingIds.has(`${origId}_${suffix}`)) suffix++;
                                imported.id = `${origId}_${suffix}`;
                                duplicateIds.push(`${origId} -> ${imported.id}`);
                            }

                            if (imported.id) existingIds.add(imported.id);
                            state.questions.push(imported);
                        });

                        state.currentIndex = state.questions.length - 1;
                        _resetValidationState();
                        clearMinMaxPanels();
                        updateUI();
                        _setImportBusyState(false, '');
                        closeImportModal();

                        const notices = [];
                        if (duplicateIds.length > 0) {
                            notices.push(`중복 ID를 자동 변경했습니다.\n${duplicateIds.map((id) => `- ${id}`).join('\n')}`);
                        }
                        if (importResult.skippedLargeImages > 0) {
                            notices.push(`5MB 초과 이미지 ${importResult.skippedLargeImages}개를 제외했습니다.`);
                        }
                        if (notices.length > 0) {
                            await showAlert(`${checkboxes.length}개 문항이 추가되었습니다.\n\n${notices.join('\n\n')}`);
                        }
                    } catch (err) {
                        console.error('선택 추가 불러오기 오류:', err);
                        _setImportBusyState(false, '');
                        await showAlert('선택한 문항을 불러오지 못했습니다.\n잠시 후 다시 시도해 주세요.');
                    }
                }

                // Search filter
                dom.importSearch.addEventListener('input', () => {
                    _applyImportSearchFilter(dom.importSearch.value);
                });

                dom.importSelectAllBtn.addEventListener('click', () => {
                    const visible = dom.importList.querySelectorAll('.import-item:not([style*="display: none"]) input[type="checkbox"]');
                    const allChecked = [...visible].every(cb => cb.checked);
                    visible.forEach(cb => { cb.checked = !allChecked; });
                    _updateImportSummary();
                });

                // Import file nav dropdown handlers
                const _closeImportFileNav = () => { dom.importFileNavPopup.classList.add('hidden'); };
                dom.importFileNavBtn.addEventListener('click', () => {
                    const isOpen = !dom.importFileNavPopup.classList.contains('hidden');
                    if (isOpen) _closeImportFileNav();
                    else dom.importFileNavPopup.classList.remove('hidden');
                });
                dom.importFileNavList.addEventListener('keydown', (e) => {
                    if (e.key !== 'Escape') return;
                    e.preventDefault();
                    e.stopPropagation();
                    _closeImportFileNav();
                    dom.importFileNavBtn.focus();
                });
                document.addEventListener('mousedown', (e) => {
                    if (dom.importFileNavWrap && !dom.importFileNavWrap.contains(e.target)) _closeImportFileNav();
                });

                dom.importReplaceBtn.addEventListener('click', doReplace);
                dom.importAppendBtn.addEventListener('click', doAppend);
                dom.importCancelBtn.addEventListener('click', closeImportModal);

                dom.importModal.addEventListener('click', (e) => {
                    if (e.target === dom.importModal) closeImportModal();
                });

                // === 통합 저장하기 (이미지 있으면 ZIP, 없으면 JSON) ===
                dom.saveBtn.addEventListener('click', async () => {
                    _resetValidationState();
                    const allErrors = validateAllCached();
                    if (allErrors.length > 0) {
                        _rebuildInvalidQuestionIndexes();
                        dom.saveBtn.disabled = true;
                        // Defensive guard for programmatic invocation; normal UX blocks click via disabled button.
                        updateJsonAndValidation();
                        return;
                    }
                    const warningSummary = collectGlobalCompatibilityWarnings();
                    if (warningSummary.totalWarnings > 0) {
                        const warningMessage = buildGlobalCompatibilityWarningConfirmMessage(warningSummary);
                        const proceedSave = await showConfirm(warningMessage, {
                            title: '호환성 경고',
                            okText: '저장 계속',
                            cancelText: '경고 확인'
                        });
                        if (!proceedSave) {
                            const firstWarningIndex = Array.isArray(warningSummary.byQuestion) && warningSummary.byQuestion.length > 0
                                ? Number(warningSummary.byQuestion[0]?.index)
                                : -1;
                            if (Number.isInteger(firstWarningIndex) &&
                                firstWarningIndex >= 0 &&
                                firstWarningIndex < state.questions.length) {
                                state.currentIndex = firstWarningIndex;
                                updateUI();
                                return;
                            }
                            updateJsonAndValidation();
                            return;
                        }
                    }
                    _invalidQuestionIndexes.clear();
                    _isValidationIndexDirty = false;
                    dom.saveBtn.disabled = false;

                    const exportQuestions = state.questions.map(sanitizeQuestionForExport);

                    const jsonContent = JSON.stringify({ questions: exportQuestions }, null, 2);
                    const hasAnyImage = state.questions.some(q => !!q.imageData);

                    if (!hasAnyImage) {
                        // 이미지 없음 -> JSON 단독 저장
                        downloadFile(`${getJsonFilename()}.json`, jsonContent, 'application/json');
                        return;
                    }

                    // 이미지 있음 -> ZIP 저장
                    try {
                        const zip = new JSZip();
                        zip.file(`${getJsonFilename()}.json`, jsonContent);

                        state.questions.forEach(q => {
                            const normalizedId = normalizeQuestionId(q.id);
                            if (!q.imageData || !normalizedId) return;
                            const match = q.imageData.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
                            if (!match) return;
                            const ext = match[1] === 'jpeg' ? 'jpg' : match[1].split('+')[0];
                            zip.file(`${normalizedId}.${ext}`, match[2], { base64: true });
                        });

                        const blob = await zip.generateAsync({ type: 'blob' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${getJsonFilename()}.zip`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    } catch (err) {
                        console.error('저장 오류:', err);
                        await showAlert('저장 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.');
                    }
                });
            };

            setupEventListeners();

            // Restore auto-saved data (including IndexedDB image snapshot) before first render
            (async () => {
                await restoreFromLocalStorage();
                updateUI();
            })();
        });
    })();
    

