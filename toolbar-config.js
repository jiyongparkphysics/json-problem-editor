(() => {
    'use strict';

    const TOOLBAR_DEF = Object.freeze({
        basic: {
            layout: 'groups',
            groups: [
                {
                    title: '수식 환경',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'wrap', label: 'var', cls: 'text-blue-600 font-bold', title: '변수명 입력', prefix: '*', suffix: '*', cursorEmpty: 'inside', cursorSelected: 'after', smartInsert: 'var', policyKey: 'answer_no_var_wrap' },
                        { kind: 'wrap', label: '$', prefix: '$', suffix: '$', cursorEmpty: 'inside', cursorSelected: 'inside', policyKey: 'answer_no_math_delimiter' },
                        { kind: 'wrap', label: '$$', prefix: '$$', suffix: '$$', cursorEmpty: 'inside', cursorSelected: 'inside', policyKey: 'answer_no_math_delimiter' },
                    ],
                },
                {
                    title: '분수/첨자/제곱근',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'frac', tail: '{|}{}', labelHtml: '$\\frac{a}{b}$' },
                        { kind: 'tpl', tpl: '^{|}', labelHtml: '$x^n$' },
                        { kind: 'tpl', tpl: '_{|}', labelHtml: '$x_n$', policyKey: 'answer_no_subscript' },
                        { kind: 'cmd', cmd: 'sqrt', tail: '{|}', labelHtml: '$\\sqrt{x}$' },
                    ],
                },
                {
                    title: '괄호',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'tpl', tpl: '\\left( |\\right)', labelHtml: '$( )$' },
                        { kind: 'tpl', tpl: '\\left\\{ |\\right\\}', labelHtml: '$\\{ \\}$', policyKey: 'answer_no_brace_lr' },
                        { kind: 'tpl', tpl: '\\left[ |\\right]', labelHtml: '$[ ]$' },
                    ],
                },
                {
                    title: '상수/단위',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'pi', labelHtml: '$\\pi$' },
                        { kind: 'tpl', tpl: '^{\\circ}', label: '°', policyKey: 'answer_no_prime_degree' },
                        { kind: 'tpl', tpl: '^{\\prime}', label: '′', policyKey: 'answer_no_prime_degree' },
                        { kind: 'tpl', tpl: '^{\\prime\\prime}', label: '″', policyKey: 'answer_no_prime_degree' },
                        { kind: 'tpl', tpl: '\\%', label: '%', policyKey: 'answer_no_percent' },
                    ],
                },
            ],
        },
        greek: {
            layout: 'groups',
            groups: [
                {
                    title: '소문자',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'alpha', label: 'α' },
                        { kind: 'cmd', cmd: 'beta', label: 'β' },
                        { kind: 'cmd', cmd: 'gamma', label: 'γ' },
                        { kind: 'cmd', cmd: 'delta', label: 'δ' },
                        { kind: 'cmd', cmd: 'epsilon', label: 'ε' },
                        { kind: 'cmd', cmd: 'zeta', label: 'ζ' },
                        { kind: 'cmd', cmd: 'eta', label: 'η' },
                        { kind: 'cmd', cmd: 'theta', label: 'θ' },
                        { kind: 'cmd', cmd: 'iota', label: 'ι' },
                        { kind: 'cmd', cmd: 'kappa', label: 'κ' },
                        { kind: 'cmd', cmd: 'lambda', label: 'λ' },
                        { kind: 'cmd', cmd: 'mu', label: 'μ' },
                        { kind: 'cmd', cmd: 'nu', label: 'ν' },
                        { kind: 'cmd', cmd: 'xi', label: 'ξ' },
                        { kind: 'cmd', cmd: 'pi', label: 'π' },
                        { kind: 'cmd', cmd: 'rho', label: 'ρ' },
                        { kind: 'cmd', cmd: 'sigma', label: 'σ' },
                        { kind: 'cmd', cmd: 'tau', label: 'τ' },
                        { kind: 'cmd', cmd: 'upsilon', label: 'υ' },
                        { kind: 'cmd', cmd: 'phi', label: 'φ' },
                        { kind: 'cmd', cmd: 'chi', label: 'χ' },
                        { kind: 'cmd', cmd: 'psi', label: 'ψ' },
                        { kind: 'cmd', cmd: 'omega', label: 'ω' },
                    ],
                },
                {
                    title: '대문자',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'Gamma', label: 'Γ' },
                        { kind: 'cmd', cmd: 'Delta', label: 'Δ' },
                        { kind: 'cmd', cmd: 'Theta', label: 'Θ' },
                        { kind: 'cmd', cmd: 'Lambda', label: 'Λ' },
                        { kind: 'cmd', cmd: 'Xi', label: 'Ξ' },
                        { kind: 'cmd', cmd: 'Pi', label: 'Π' },
                        { kind: 'cmd', cmd: 'Sigma', label: 'Σ' },
                        { kind: 'cmd', cmd: 'Upsilon', label: 'Υ' },
                        { kind: 'cmd', cmd: 'Phi', label: 'Φ' },
                        { kind: 'cmd', cmd: 'Psi', label: 'Ψ' },
                        { kind: 'cmd', cmd: 'Omega', label: 'Ω' },
                    ],
                },
            ],
        },
        fonts: {
            layout: 'groups',
            groups: [
                {
                    title: '서체',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'mathrm', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\mathrm{A}$' },
                        { kind: 'cmd', cmd: 'mathbb', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\mathbb{A}$' },
                        { kind: 'cmd', cmd: 'mathcal', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\mathcal{A}$' },
                        { kind: 'cmd', cmd: 'mathbf', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\mathbf{A}$' },
                    ],
                },
                {
                    title: '장식',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'vec', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\vec{a}$' },
                        { kind: 'cmd', cmd: 'hat', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\hat{a}$' },
                        { kind: 'cmd', cmd: 'bar', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\bar{a}$' },
                        { kind: 'cmd', cmd: 'overline', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\overline{a}$' },
                        { kind: 'cmd', cmd: 'dot', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\dot{a}$' },
                        { kind: 'cmd', cmd: 'ddot', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\ddot{a}$' },
                    ],
                },
                {
                    title: '화살표',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'leftarrow', label: '←' },
                        { kind: 'cmd', cmd: 'rightarrow', label: '→' },
                        { kind: 'cmd', cmd: 'leftrightarrow', label: '↔' },
                        { kind: 'cmd', cmd: 'Leftarrow', label: '⇐' },
                        { kind: 'cmd', cmd: 'Rightarrow', label: '⇒' },
                        { kind: 'cmd', cmd: 'Leftrightarrow', label: '⇔' },
                    ],
                },
                {
                    title: '밑줄',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'underline', tail: '{|}', cls: 'px-2 text-xs', labelHtml: '$\\underline{a}$' },
                    ],
                },
            ],
        },
        operators: {
            layout: 'groups',
            groups: [
                {
                    title: '사칙연산/관계',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'times', labelHtml: '$\\times$' },
                        { kind: 'cmd', cmd: 'cdot', labelHtml: '$\\cdot$' },
                        { kind: 'cmd', cmd: 'pm', labelHtml: '$\\pm$' },
                        { kind: 'cmd', cmd: 'approx', labelHtml: '$\\approx$' },
                        { kind: 'cmd', cmd: 'neq', labelHtml: '$\\neq$' },
                        { kind: 'cmd', cmd: 'le', labelHtml: '$\\le$' },
                        { kind: 'cmd', cmd: 'ge', labelHtml: '$\\ge$' },
                    ],
                },
                {
                    title: '적분/미분 기호',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'int', labelHtml: '$\\int$' },
                        { kind: 'cmd', cmd: 'oint', labelHtml: '$\\oint$' },
                        { kind: 'cmd', cmd: 'partial', labelHtml: '$\\partial$' },
                        { kind: 'cmd', cmd: 'nabla', labelHtml: '$\\nabla$' },
                    ],
                },
                {
                    title: '무한대',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'infty', labelHtml: '$\\infty$' },
                    ],
                },
                {
                    title: '합/곱 기호',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'sum', labelHtml: '$\\sum$' },
                        { kind: 'cmd', cmd: 'prod', labelHtml: '$\\prod$' },
                    ],
                },
            ],
        },
        functions: {
            layout: 'groups',
            groups: [
                {
                    title: '삼각함수',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'sin', cls: 'text-xs px-2', label: 'sin' },
                        { kind: 'cmd', cmd: 'cos', cls: 'text-xs px-2', label: 'cos' },
                        { kind: 'cmd', cmd: 'tan', cls: 'text-xs px-2', label: 'tan' },
                        { kind: 'cmd', cmd: 'csc', cls: 'text-xs px-2', label: 'csc' },
                        { kind: 'cmd', cmd: 'sec', cls: 'text-xs px-2', label: 'sec' },
                        { kind: 'cmd', cmd: 'cot', cls: 'text-xs px-2', label: 'cot' },
                    ],
                },
                {
                    title: '역삼각함수',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'arcsin', cls: 'text-xs px-2', label: 'arcsin' },
                        { kind: 'cmd', cmd: 'arccos', cls: 'text-xs px-2', label: 'arccos' },
                        { kind: 'cmd', cmd: 'arctan', cls: 'text-xs px-2', label: 'arctan' },
                    ],
                },
                {
                    title: '쌍곡선함수',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'sinh', cls: 'text-xs px-2', label: 'sinh' },
                        { kind: 'cmd', cmd: 'cosh', cls: 'text-xs px-2', label: 'cosh' },
                        { kind: 'cmd', cmd: 'tanh', cls: 'text-xs px-2', label: 'tanh' },
                    ],
                },
                {
                    title: '로그/지수',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'cmd', cmd: 'ln', cls: 'text-xs px-2', label: 'ln' },
                        { kind: 'cmd', cmd: 'log', cls: 'text-xs px-2', label: 'log', policyKey: 'answer_no_log_base' },
                        { kind: 'cmd', cmd: 'exp', cls: 'text-xs px-2', label: 'exp' },
                    ],
                },
            ],
        },
        functionParen: {
            layout: 'groups',
            groups: [
                {
                    title: '삼각함수',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'tpl', tpl: '\\sin(|)', cls: 'text-xs px-2', label: 'sin(x)' },
                        { kind: 'tpl', tpl: '\\cos(|)', cls: 'text-xs px-2', label: 'cos(x)' },
                        { kind: 'tpl', tpl: '\\tan(|)', cls: 'text-xs px-2', label: 'tan(x)' },
                    ],
                },
                {
                    title: '역삼각함수',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'tpl', tpl: '\\arcsin(|)', cls: 'text-xs px-2', label: 'arcsin(x)' },
                        { kind: 'tpl', tpl: '\\arccos(|)', cls: 'text-xs px-2', label: 'arccos(x)' },
                        { kind: 'tpl', tpl: '\\arctan(|)', cls: 'text-xs px-2', label: 'arctan(x)' },
                    ],
                },
                {
                    title: '쌍곡선함수',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'tpl', tpl: '\\sinh(|)', cls: 'text-xs px-2', label: 'sinh(x)' },
                        { kind: 'tpl', tpl: '\\cosh(|)', cls: 'text-xs px-2', label: 'cosh(x)' },
                        { kind: 'tpl', tpl: '\\tanh(|)', cls: 'text-xs px-2', label: 'tanh(x)' },
                    ],
                },
                {
                    title: '로그/지수',
                    groupClass: 'flex flex-wrap gap-1 mb-2',
                    buttons: [
                        { kind: 'tpl', tpl: '\\ln(|)', cls: 'text-xs px-2', label: 'ln(x)' },
                        { kind: 'tpl', tpl: '\\log(|)', cls: 'text-xs px-2', label: 'log(x)', policyKey: 'answer_no_log_base' },
                        { kind: 'tpl', tpl: '\\exp(|)', cls: 'text-xs px-2', label: 'exp(x)' },
                    ],
                },
            ],
        },
    });

    const TOOLBAR_TABS = Object.freeze(['basic', 'greek', 'fonts', 'operators', 'functions', 'functionParen']);
    const TOOLBAR_MODE_VISIBLE_TABS = Object.freeze({
        text: Object.freeze(['basic', 'greek', 'fonts', 'operators', 'functions']),
        answer: Object.freeze(['basic', 'functionParen'])
    });
    const TOOLBAR_MODE_PREFERRED_TAB = Object.freeze({
        text: 'functions',
        answer: 'functionParen'
    });

    function _normalizeInputMode(inputId) {
        return String(inputId || '').trim() === 'answer' ? 'answer' : 'text';
    }

    const api = {
        TOOLBAR_DEF,
        TOOLBAR_TABS,
        TOOLBAR_MODE_VISIBLE_TABS,
        TOOLBAR_MODE_PREFERRED_TAB,
        getToolbarDefinition(tabName) {
            return TOOLBAR_DEF[String(tabName || '')] || null;
        },
        getVisibleTabsForInput(inputId) {
            const mode = _normalizeInputMode(inputId);
            const tabs = TOOLBAR_MODE_VISIBLE_TABS[mode] || TOOLBAR_TABS;
            return Array.from(tabs).filter((tab) => TOOLBAR_TABS.includes(tab));
        },
        getPreferredTabForInput(inputId) {
            const mode = _normalizeInputMode(inputId);
            const preferred = TOOLBAR_MODE_PREFERRED_TAB[mode];
            return TOOLBAR_TABS.includes(preferred) ? preferred : TOOLBAR_TABS[0];
        },
    };

    if (typeof window !== 'undefined') {
        window.ToolbarConfig = api;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.ToolbarConfig = api;
    }
})();
