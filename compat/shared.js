(() => {
    'use strict';

    const _RANDOM_EXAM_LATEX_FUNC_MAP = {
        '\\arccos': 'math.acos',
        '\\arcsin': 'math.asin',
        '\\arctan': 'math.atan',
        '\\tan^{-1}': 'math.atan',
        '\\sin': 'math.sin',
        '\\cos': 'math.cos',
        '\\tan': 'math.tan',
        '\\log': 'math.log10',
        '\\ln': 'math.log',
        '\\exp': 'math.exp'
    };

    const _RANDOM_EXAM_ANSWER_ALLOWED_LATEX_COMMANDS = new Set([
        'frac', 'sqrt',
        'left', 'right',
        'pi',
        'sin', 'cos', 'tan',
        'arcsin', 'arccos', 'arctan',
        'arcsinh', 'arccosh', 'arctanh',
        'sinh', 'cosh', 'tanh',
        'ln', 'log', 'exp'
    ]);

    const _RANDOM_EXAM_ANSWER_TEXT_STYLE_COMMANDS = new Set([
        'textbf', 'textit', 'emph', 'underline', 'texttt',
        'mathrm', 'mathbb', 'mathcal', 'mathbf',
        'vec', 'hat', 'bar', 'overline', 'dot', 'ddot',
        'quad', 'qquad', 'newline', 'par'
    ]);

    const _RANDOM_EXAM_ANSWER_MULTIPLICATION_TEXT_COMMANDS = new Set([
        'times', 'cdot'
    ]);

    const _RANDOM_EXAM_ANSWER_UNSUPPORTED_FUNCTION_COMMANDS = new Set([
        'sec', 'csc', 'cot',
        'asin', 'acos', 'atan'
    ]);

    const _RANDOM_EXAM_TOOLBAR_POLICY_REASON_BY_KEY = Object.freeze({
        answer_no_var_wrap: "정답식에서는 '*var*' 표기를 사용하지 않습니다.",
        answer_no_math_delimiter: "정답식에는 '$...$' 또는 '$$...$$'를 넣지 않습니다.",
        answer_no_log_base: "정답식에서는 \\ln(x)만 사용하세요. \\log(x), \\log_{a}(x)는 현재 지원되지 않습니다.",
        answer_no_brace_lr: "중괄호 left/right 템플릿은 정답식 파서와 호환되지 않습니다.",
        answer_no_subscript: "첨자 템플릿은 정답식 계산 파서와 호환되지 않습니다.",
        answer_no_percent: "정답식에서는 백분율 기호 대신 계산식만 입력하세요.",
        answer_no_prime_degree: "각도/프라임 템플릿은 정답식 계산 파서와 호환되지 않습니다."
    });

    const _RANDOM_EXAM_PDFLATEX_PROFILE = Object.freeze({
        compilerCommand: 'latexmk -pdf -interaction=nonstopmode',
        engine: 'pdflatex',
        documentClass: '\\documentclass[b4paper,twocolumn]{article}',
        mathPackages: Object.freeze({
            amsmath: false,
            amssymb: false,
            amsfonts: false,
            mathtools: false
        })
    });

    // Package-dependent math commands (separated from command-mode classification).
    const _RANDOM_EXAM_TEXT_COMMAND_PACKAGE_REQUIREMENTS = Object.freeze({
        mathbb: Object.freeze({ anyOf: Object.freeze(['amssymb', 'amsfonts']) })
    });

    const _RANDOM_EXAM_COMPAT_VAR_NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

    const _RANDOM_EXAM_ALLOWED_MATH_CALLS = new Set([
        'math.sin', 'math.cos', 'math.tan',
        'math.asin', 'math.acos', 'math.atan',
        'math.asinh', 'math.acosh', 'math.atanh',
        'math.sinh', 'math.cosh', 'math.tanh',
        'math.exp', 'math.log', 'math.log10',
        'math.sqrt'
    ]);

    const _RANDOM_EXAM_ALLOWED_MATH_CONSTANTS = new Set([
        'math.pi', 'math.e', 'math.tau', 'math.inf', 'math.nan'
    ]);

    const _RANDOM_EXAM_FUNC_FIX_EXAMPLES = {
        'math.sin': '\\sin(x)',
        'math.cos': '\\cos(x)',
        'math.tan': '\\tan(x)',
        'math.asin': '\\arcsin(x)',
        'math.acos': '\\arccos(x)',
        'math.atan': '\\arctan(x)',
        'math.asinh': '\\arcsinh(x)',
        'math.acosh': '\\arccosh(x)',
        'math.atanh': '\\arctanh(x)',
        'math.sinh': '\\sinh(x)',
        'math.cosh': '\\cosh(x)',
        'math.tanh': '\\tanh(x)',
        'math.exp': '\\exp(x)',
        'math.log': '\\ln(x)',
        'math.log10': '\\log(x)',
        'math.sqrt': '\\sqrt{x}'
    };

    const _RANDOM_EXAM_PY_TOKEN_TO_LATEX_DISPLAY = Object.freeze({
        'math.sin': '\\sin',
        'math.cos': '\\cos',
        'math.tan': '\\tan',
        'math.asin': '\\arcsin',
        'math.acos': '\\arccos',
        'math.atan': '\\arctan',
        'math.asinh': '\\arcsinh',
        'math.acosh': '\\arccosh',
        'math.atanh': '\\arctanh',
        'math.sinh': '\\sinh',
        'math.cosh': '\\cosh',
        'math.tanh': '\\tanh',
        'math.exp': '\\exp',
        'math.log': '\\ln',
        'math.log10': '\\log',
        'math.sqrt': '\\sqrt',
        'math.pi': '\\pi',
        'math.e': 'e',
        'math.tau': 'tau',
        'math.inf': 'inf',
        'math.nan': 'nan'
    });

    const _RANDOM_EXAM_TEXT_SPECIAL_CHAR_WARNING_FIXES = Object.freeze({
        '_': '\\_',
        '^': '\\^{}',
        '~': '\\~{}'
    });

    const _RANDOM_EXAM_GREEK_UNICODE_MAP = Object.freeze({
        '\u03b1': '\\alpha',
        '\u03b2': '\\beta',
        '\u03b3': '\\gamma',
        '\u03b4': '\\delta',
        '\u03b5': '\\epsilon',
        '\u03f5': '\\varepsilon',
        '\u03b6': '\\zeta',
        '\u03b7': '\\eta',
        '\u03b8': '\\theta',
        '\u03d1': '\\vartheta',
        '\u03b9': '\\iota',
        '\u03ba': '\\kappa',
        '\u03bb': '\\lambda',
        '\u03bc': '\\mu',
        '\u03bd': '\\nu',
        '\u03be': '\\xi',
        '\u03bf': 'o',
        '\u03c0': '\\pi',
        '\u03d6': '\\varpi',
        '\u03c1': '\\rho',
        '\u03f1': '\\varrho',
        '\u03c3': '\\sigma',
        '\u03c2': '\\sigma',
        '\u03c4': '\\tau',
        '\u03c5': '\\upsilon',
        '\u03c6': '\\phi',
        '\u03d5': '\\varphi',
        '\u03c7': '\\chi',
        '\u03c8': '\\psi',
        '\u03c9': '\\omega',
        '\u0393': '\\Gamma',
        '\u0394': '\\Delta',
        '\u0398': '\\Theta',
        '\u039b': '\\Lambda',
        '\u039e': '\\Xi',
        '\u03a0': '\\Pi',
        '\u03a3': '\\Sigma',
        '\u03a5': '\\Upsilon',
        '\u03a6': '\\Phi',
        '\u03a8': '\\Psi',
        '\u03a9': '\\Omega',
        '\u0391': 'A',
        '\u0392': 'B',
        '\u0395': 'E',
        '\u0396': 'Z',
        '\u0397': 'H',
        '\u0399': 'I',
        '\u039a': 'K',
        '\u039c': 'M',
        '\u039d': 'N',
        '\u039f': 'O',
        '\u03a1': 'P',
        '\u03a4': 'T',
        '\u03a7': 'X'
    });

    const _RANDOM_EXAM_TEXT_UNICODE_SYMBOL_MAP = Object.freeze({
        '≤': '\\le',
        '≥': '\\ge',
        '≠': '\\neq',
        '±': '\\pm',
        '×': '\\times',
        '÷': '\\div',
        '√': '\\sqrt{}',
        '∞': '\\infty',
        '∑': '\\sum',
        '∏': '\\prod',
        '∫': '\\int',
        '∂': '\\partial',
        '∇': '\\nabla',
        '→': '\\to',
        '←': '\\leftarrow',
        '↔': '\\leftrightarrow'
    });

    const _RANDOM_EXAM_TEXT_INVISIBLE_UNICODE_MAP = Object.freeze({
        '\u200b': { label: 'ZERO WIDTH SPACE', replacement: '' },
        '\u200c': { label: 'ZERO WIDTH NON-JOINER', replacement: '' },
        '\u200d': { label: 'ZERO WIDTH JOINER', replacement: '' },
        '\u2060': { label: 'WORD JOINER', replacement: '' },
        '\ufeff': { label: 'ZERO WIDTH NO-BREAK SPACE(BOM)', replacement: '' },
        '\u00a0': { label: 'NO-BREAK SPACE', replacement: ' ' }
    });

    // Single source of truth for text-field command mode classification.
    const _RANDOM_EXAM_TEXT_COMMAND_MODE_GROUPS = Object.freeze({
        math: Object.freeze([
            'frac', 'sqrt', 'left', 'right',
            'sin', 'cos', 'tan', 'csc', 'sec', 'cot',
            'arcsin', 'arccos', 'arctan',
            'sinh', 'cosh', 'tanh',
            'ln', 'log', 'exp',
            'mathrm', 'mathbb', 'mathcal', 'mathbf',
            'vec', 'hat', 'bar', 'overline', 'dot', 'ddot',
            'times', 'cdot', 'pm', 'approx', 'neq', 'le', 'ge', 'infty',
            'int', 'oint', 'sum', 'prod', 'partial', 'nabla',
            'circ',
            'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
            'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
            'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
            'varepsilon', 'vartheta', 'varpi', 'varrho', 'varphi',
            'leftarrow', 'rightarrow', 'leftrightarrow', 'Leftarrow', 'Rightarrow', 'Leftrightarrow'
        ]),
        text: Object.freeze([
            'par'
        ]),
        dual: Object.freeze([
            'textbf', 'textit', 'emph', 'texttt',
            'newline',
            'underline', 'quad', 'qquad'
        ])
    });

    const _RANDOM_EXAM_TEXT_MATH_ONLY_COMMANDS = new Set(_RANDOM_EXAM_TEXT_COMMAND_MODE_GROUPS.math);
    const _RANDOM_EXAM_TEXT_TEXT_ONLY_COMMANDS = new Set(_RANDOM_EXAM_TEXT_COMMAND_MODE_GROUPS.text);
    const _RANDOM_EXAM_TEXT_DUAL_MODE_COMMANDS = new Set(_RANDOM_EXAM_TEXT_COMMAND_MODE_GROUPS.dual);

    function _getTextCommandMode(cmd) {
        const name = String(cmd || '').trim();
        if (!name) return '';
        if (_RANDOM_EXAM_TEXT_DUAL_MODE_COMMANDS.has(name)) return 'dual';
        if (_RANDOM_EXAM_TEXT_TEXT_ONLY_COMMANDS.has(name)) return 'text';
        if (_RANDOM_EXAM_TEXT_MATH_ONLY_COMMANDS.has(name)) return 'math';
        return '';
    }

    function _getMissingMathPackagesForCommand(cmd, profile = _RANDOM_EXAM_PDFLATEX_PROFILE) {
        const name = String(cmd || '').trim();
        if (!name) return [];
        const req = _RANDOM_EXAM_TEXT_COMMAND_PACKAGE_REQUIREMENTS[name];
        if (!req || typeof req !== 'object') return [];

        const flags = (profile && typeof profile === 'object' && profile.mathPackages && typeof profile.mathPackages === 'object')
            ? profile.mathPackages
            : {};
        const allOf = Array.isArray(req.allOf) ? req.allOf.filter(Boolean) : [];
        const anyOf = Array.isArray(req.anyOf) ? req.anyOf.filter(Boolean) : [];

        if (allOf.length > 0) {
            return allOf.filter((pkg) => !Boolean(flags[pkg]));
        }
        if (anyOf.length > 0) {
            const hasAny = anyOf.some((pkg) => Boolean(flags[pkg]));
            return hasAny ? [] : [...anyOf];
        }
        return [];
    }

    function _isEscapedAt(text, index) {
        let slashCount = 0;
        for (let i = index - 1; i >= 0; i--) {
            if (text[i] !== '\\') break;
            slashCount += 1;
        }
        return (slashCount % 2) === 1;
    }

    function _collectUnescapedIndexes(text, targetChar) {
        const out = [];
        const s = String(text || '');
        for (let i = 0; i < s.length; i++) {
            if (s[i] !== targetChar) continue;
            if (_isEscapedAt(s, i)) continue;
            out.push(i);
        }
        return out;
    }

    function _collectUnescapedIndexesOutsideMath(text, targetChar) {
        const out = [];
        const rawText = String(text || '');
        const s = rawText;
        let mathMode = null; // null | '$' | '$$'

        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '$' && !_isEscapedAt(rawText, i)) {
                const next = s[i + 1] || '';
                const canUseDouble = (next === '$' && !_isEscapedAt(rawText, i + 1) && mathMode !== '$');
                if (canUseDouble) {
                    mathMode = (mathMode === '$$') ? null : '$$';
                    i += 1;
                    continue;
                }
                mathMode = (mathMode === '$') ? null : '$';
                continue;
            }
            if (mathMode) continue;
            if (ch !== targetChar || _isEscapedAt(rawText, i)) continue;
            out.push(i);
        }
        return out;
    }

    function _extractLatexCommands(text) {
        const s = String(text || '');
        const out = [];
        const re = /\\([A-Za-z]+)/g;
        let m;
        while (true) {
            m = re.exec(s);
            if (m === null) break;
            const cmd = String(m[1] || '');
            if (!cmd) continue;
            out.push({ cmd, index: m.index });
        }
        return out;
    }

    function _toUserFacingToken(token) {
        const key = String(token || '');
        return _RANDOM_EXAM_PY_TOKEN_TO_LATEX_DISPLAY[key] || key;
    }

    function _needsLatexCommandDelimiter(nextChar) {
        return /^[A-Za-z]$/.test(nextChar || '');
    }

    function _randomExamFindMatchingBrace(s, startIdx) {
        if (startIdx < 0 || startIdx >= s.length || s[startIdx] !== '{') return -1;
        let depth = 0;
        for (let i = startIdx; i < s.length; i++) {
            if (s[i] === '{') depth += 1;
            else if (s[i] === '}') depth -= 1;
            if (depth === 0) return i;
        }
        return -1;
    }

    function _formatCompatError(prefix, msg) {
        return `${prefix}random-exam-generator 호환성: ${msg}`;
    }

    function _formatCompatWarning(prefix, msg) {
        return `${prefix}random-exam-generator 호환성 경고: ${msg}`;
    }

    function _mergeCompatDiagnostics(...parts) {
        const out = { errors: [], warnings: [], quickFixes: [] };
        parts.forEach(part => {
            if (!part || typeof part !== 'object') return;
            if (Array.isArray(part.errors)) out.errors.push(...part.errors);
            if (Array.isArray(part.warnings)) out.warnings.push(...part.warnings);
            if (Array.isArray(part.quickFixes)) out.quickFixes.push(...part.quickFixes);
        });
        return out;
    }

    const root = (typeof window !== 'undefined') ? window : globalThis;
    root.RandomExamCompatShared = {
        _RANDOM_EXAM_LATEX_FUNC_MAP,
        _RANDOM_EXAM_ANSWER_ALLOWED_LATEX_COMMANDS,
        _RANDOM_EXAM_ANSWER_TEXT_STYLE_COMMANDS,
        _RANDOM_EXAM_ANSWER_MULTIPLICATION_TEXT_COMMANDS,
        _RANDOM_EXAM_ANSWER_UNSUPPORTED_FUNCTION_COMMANDS,
        _RANDOM_EXAM_TOOLBAR_POLICY_REASON_BY_KEY,
        _RANDOM_EXAM_PDFLATEX_PROFILE,
        _RANDOM_EXAM_COMPAT_VAR_NAME_RE,
        _RANDOM_EXAM_ALLOWED_MATH_CALLS,
        _RANDOM_EXAM_ALLOWED_MATH_CONSTANTS,
        _RANDOM_EXAM_FUNC_FIX_EXAMPLES,
        _RANDOM_EXAM_PY_TOKEN_TO_LATEX_DISPLAY,
        _RANDOM_EXAM_TEXT_SPECIAL_CHAR_WARNING_FIXES,
        _RANDOM_EXAM_GREEK_UNICODE_MAP,
        _RANDOM_EXAM_TEXT_UNICODE_SYMBOL_MAP,
        _RANDOM_EXAM_TEXT_INVISIBLE_UNICODE_MAP,
        _RANDOM_EXAM_TEXT_COMMAND_PACKAGE_REQUIREMENTS,
        _RANDOM_EXAM_TEXT_COMMAND_MODE_GROUPS,
        _RANDOM_EXAM_TEXT_MATH_ONLY_COMMANDS,
        _RANDOM_EXAM_TEXT_TEXT_ONLY_COMMANDS,
        _RANDOM_EXAM_TEXT_DUAL_MODE_COMMANDS,
        _getTextCommandMode,
        _getMissingMathPackagesForCommand,
        _isEscapedAt,
        _collectUnescapedIndexes,
        _collectUnescapedIndexesOutsideMath,
        _extractLatexCommands,
        _toUserFacingToken,
        _needsLatexCommandDelimiter,
        _randomExamFindMatchingBrace,
        _formatCompatError,
        _formatCompatWarning,
        _mergeCompatDiagnostics
    };
})();
