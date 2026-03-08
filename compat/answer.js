(() => {
    'use strict';

    const root = (typeof window !== 'undefined') ? window : globalThis;
    const S = root.RandomExamCompatShared;
    if (!S) return;

    function _diagnoseAnswerLatexCommandCompatibility(answerText) {
        const issues = [];
        const s = String(answerText || '');
        if (!s.trim()) return issues;

        if (/\\log(?=_|\b)/.test(s)) {
            issues.push("정답식에서는 \\ln(x)만 사용하세요. \\log(x), \\log_{a}(x)는 현재 지원되지 않습니다.");
        }

        const commandHits = S._extractLatexCommands(s);
        const seen = new Set();
        commandHits.forEach(({ cmd }) => {
            if (!cmd || seen.has(cmd)) return;
            seen.add(cmd);

            if (S._RANDOM_EXAM_ANSWER_ALLOWED_LATEX_COMMANDS.has(cmd)) return;
            if (S._RANDOM_EXAM_ANSWER_MULTIPLICATION_TEXT_COMMANDS.has(cmd)) {
                issues.push(`'\\${cmd}' 대신 '*'를 사용하세요. 예: a*b`);
                return;
            }
            if (S._RANDOM_EXAM_ANSWER_TEXT_STYLE_COMMANDS.has(cmd)) {
                issues.push(`정답식(계산식)에서는 텍스트/서식 명령 '\\${cmd}'를 사용할 수 없습니다. 지문으로 옮기거나 제거하세요.`);
                return;
            }
            if (S._RANDOM_EXAM_ANSWER_UNSUPPORTED_FUNCTION_COMMANDS.has(cmd)) {
                issues.push(`함수 '\\${cmd}'는 random-exam-generator 계산 파서에서 지원되지 않습니다.`);
                return;
            }
            issues.push(`지원하지 않는 LaTeX 명령 '\\${cmd}'가 포함되어 있습니다.`);
        });

        return [...new Set(issues)];
    }

    function latexToPythonCompat(latex) {
        let s = String(latex || '');
        s = s.replace(/\r?\n/g, ' ');
        s = s.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
        s = s.replace(/\\left\[/g, '[').replace(/\\right\]/g, ']');
        s = s.replace(/\\pi/g, 'math.pi');

        const sortedFuncs = Object.entries(S._RANDOM_EXAM_LATEX_FUNC_MAP)
            .sort((a, b) => b[0].length - a[0].length);
        sortedFuncs.forEach(([latexCmd, pythonFunc]) => {
            s = s.split(latexCmd).join(pythonFunc);
        });

        s = s.replace(/\^\{([^}]*)\}/g, '**($1)');
        s = s.replace(/\^2/g, '**2');
        s = s.replace(/\^3/g, '**3');

        while (s.includes('\\frac')) {
            const idx = s.indexOf('\\frac');
            const start1 = s.indexOf('{', idx);
            if (start1 < 0) throw new Error("\\frac 뒤에는 분자를 감싼 '{...}'가 필요합니다.");
            const end1 = S._randomExamFindMatchingBrace(s, start1);
            if (end1 < 0) throw new Error("\\frac 분자 중괄호 '{...}'가 닫히지 않았습니다.");
            const start2 = s.indexOf('{', end1);
            if (start2 < 0) throw new Error("\\frac 뒤에는 분모를 감싼 '{...}'가 필요합니다.");
            const end2 = S._randomExamFindMatchingBrace(s, start2);
            if (end2 < 0) throw new Error("\\frac 분모 중괄호 '{...}'가 닫히지 않았습니다.");
            const numerator = s.slice(start1 + 1, end1);
            const denominator = s.slice(start2 + 1, end2);
            if (!String(numerator).trim()) throw new Error("\\frac 분자가 비어 있습니다.");
            if (!String(denominator).trim()) throw new Error("\\frac 분모가 비어 있습니다.");
            s = s.slice(0, idx) + `((${numerator})/(${denominator}))` + s.slice(end2 + 1);
        }

        while (s.includes('\\sqrt')) {
            const idx = s.indexOf('\\sqrt');
            const start1 = s.indexOf('{', idx);
            if (start1 < 0) throw new Error("\\sqrt 뒤에는 '{...}'가 필요합니다.");
            const end1 = S._randomExamFindMatchingBrace(s, start1);
            if (end1 < 0) throw new Error("\\sqrt 중괄호 '{...}'가 닫히지 않았습니다.");
            const inner = s.slice(start1 + 1, end1);
            if (!String(inner).trim()) throw new Error("\\sqrt 내부가 비어 있습니다.");
            s = s.slice(0, idx) + `math.sqrt(${inner})` + s.slice(end1 + 1);
        }

        // Keep behavior aligned with random-exam-generator parser.
        s = s.replace(/([a-zA-Z0-9)])\s*math\./g, '$1 * math.');
        return s;
    }

    function _tokenizePythonExpr(expr) {
        const tokens = [];
        let i = 0;
        const s = String(expr || '');
        while (i < s.length) {
            const ch = s[i];
            if (/\s/.test(ch)) {
                i += 1;
                continue;
            }
            if (s.startsWith('**', i)) {
                tokens.push('**');
                i += 2;
                continue;
            }
            const numMatch = s.slice(i).match(/^[0-9]+(?:\.[0-9]+)?/);
            if (numMatch) {
                tokens.push(numMatch[0]);
                i += numMatch[0].length;
                continue;
            }
            const idMatch = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/);
            if (idMatch) {
                tokens.push(idMatch[0]);
                i += idMatch[0].length;
                continue;
            }
            if ('+-*/(),[]'.includes(ch)) {
                tokens.push(ch);
                i += 1;
                continue;
            }
            throw new Error(`지원하지 않는 문자 '${ch}'가 포함되어 있습니다.`);
        }
        return tokens;
    }

    function _validatePythonLikeExpr(expr, definedVarNames) {
        const issues = [];
        if (/[\\]/.test(expr)) {
            issues.push('지원하지 않는 LaTeX 명령이 포함되어 있습니다.');
            return issues;
        }
        if (expr.includes('^')) {
            issues.push("지수는 `^{...}` 형식으로 작성해야 합니다. (`^2`, `^3` 예외)");
            return issues;
        }

        let tokens;
        try {
            tokens = _tokenizePythonExpr(expr);
        } catch (e) {
            issues.push(e.message || String(e));
            return issues;
        }

        const isNum = (t) => /^[0-9]+(?:\.[0-9]+)?$/.test(t);
        const isId = (t) => /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(t);
        const isValue = (t) => isNum(t) || isId(t) || t === ')' || t === ']';
        const isValueStart = (t) => isNum(t) || isId(t) || t === '(' || t === '[';
        const _findMatching = (openIdx, openTok, closeTok) => {
            let depth = 0;
            for (let i = openIdx; i < tokens.length; i++) {
                const tok = tokens[i];
                if (tok === openTok) depth += 1;
                else if (tok === closeTok) {
                    depth -= 1;
                    if (depth === 0) return i;
                    if (depth < 0) return -1;
                }
            }
            return -1;
        };

        let parenDepth = 0;
        let squareDepth = 0;
        tokens.forEach((t, idx) => {
            if (t === '(') parenDepth += 1;
            else if (t === ')') parenDepth -= 1;
            else if (t === '[') squareDepth += 1;
            else if (t === ']') squareDepth -= 1;

            if (parenDepth < 0 || squareDepth < 0) {
                issues.push('괄호 짝이 맞지 않습니다.');
            }

            if (!isId(t)) return;
            const next = tokens[idx + 1];
            if (S._RANDOM_EXAM_ALLOWED_MATH_CALLS.has(t)) {
                if (next !== '(') {
                    const example = S._RANDOM_EXAM_FUNC_FIX_EXAMPLES[t] || `${t}(x)`;
                    issues.push(`함수 인자는 괄호로 감싸야 합니다. 예: ${example}`);
                } else {
                    const closeIdx = _findMatching(idx + 1, '(', ')');
                    if (closeIdx === idx + 2) {
                        const example = S._RANDOM_EXAM_FUNC_FIX_EXAMPLES[t] || `${t}(x)`;
                        issues.push(`함수 인자가 비어 있습니다. 예: ${example}`);
                    }
                }
                return;
            }
            if (S._RANDOM_EXAM_ALLOWED_MATH_CONSTANTS.has(t)) {
                if (next === '(') {
                    const display = S._toUserFacingToken(t);
                    issues.push(`상수 '${display}'는 함수 호출 형태로 사용할 수 없습니다.`);
                }
                return;
            }
            if (t.startsWith('math.')) {
                const display = S._toUserFacingToken(t);
                issues.push(`지원되지 않는 식별자 '${display}'가 포함되어 있습니다.`);
                return;
            }
            if (!definedVarNames.has(t)) {
                issues.push(`정의되지 않은 식별자 '${t}'가 포함되어 있습니다.`);
            }
            if (next === '(' && !t.startsWith('math.')) {
                issues.push(`'${t}(...)' 형태는 지원되지 않습니다. 공백과 '*'로 명시하세요.`);
            }
        });

        if (parenDepth !== 0 || squareDepth !== 0) {
            issues.push('괄호 짝이 맞지 않습니다.');
        }

        for (let i = 0; i < tokens.length - 1; i++) {
            const open = tokens[i];
            const close = tokens[i + 1];
            if (!((open === '(' && close === ')') || (open === '[' && close === ']'))) continue;
            const prev = tokens[i - 1];
            if (open === '(' && isId(prev) && S._RANDOM_EXAM_ALLOWED_MATH_CALLS.has(prev)) continue;
            issues.push("빈 괄호 '()' 또는 '[]'는 사용할 수 없습니다.");
            break;
        }

        for (let i = 0; i < tokens.length - 1; i++) {
            const a = tokens[i];
            const b = tokens[i + 1];
            if (isId(a) && a.startsWith('math.') && b === '(') {
                continue;
            }
            if (isValue(a) && isValueStart(b)) {
                issues.push("묵시적 곱셈이 감지되었습니다. 곱셈 기호(*)를 명시하세요.");
                break;
            }
        }

        return [...new Set(issues)];
    }

    function diagnoseAnswerParserCompatibility(question, index, extractVariablesFn) {
        const errors = [];
        const warnings = [];
        const quickFixes = [];
        const questionLabel = `${index + 1}번 문항`;
        const prefix = `[${questionLabel}] `;
        const extractVars = typeof extractVariablesFn === 'function' ? extractVariablesFn : (() => []);

        const textVars = extractVars(question.text || '');
        const definedVarNames = (question.variables || [])
            .map(v => String(v?.name || '').trim())
            .filter(Boolean);
        const invalidVarNames = [...new Set(
            [...textVars, ...definedVarNames].filter(name => !S._RANDOM_EXAM_COMPAT_VAR_NAME_RE.test(name))
        )];
        if (invalidVarNames.length > 0) {
            errors.push(S._formatCompatError(prefix, `호환 변수명은 영문 시작 + 영문/숫자만 허용합니다: ${invalidVarNames.join(', ')}`));
        }

        const answer = String(question.answer || '').trim();
        if (!answer) {
            return { errors, warnings, quickFixes };
        }

        const commandIssues = _diagnoseAnswerLatexCommandCompatibility(answer);
        if (commandIssues.length > 0) {
            commandIssues.forEach(msg => {
                errors.push(S._formatCompatError(prefix, msg));
            });
            return { errors, warnings, quickFixes };
        }

        let transformed;
        try {
            transformed = latexToPythonCompat(answer);
        } catch (e) {
            errors.push(S._formatCompatError(prefix, `수식 변환 실패: ${e.message || e}`));
            return { errors, warnings, quickFixes };
        }

        const compatIssues = _validatePythonLikeExpr(transformed, new Set(definedVarNames));
        compatIssues.forEach(msg => {
            errors.push(S._formatCompatError(prefix, msg));
        });
        return { errors, warnings, quickFixes };
    }

    function getAnswerSupportedLatexCommands() {
        return [...S._RANDOM_EXAM_ANSWER_ALLOWED_LATEX_COMMANDS];
    }

    function evaluateAnswerToolbarAction(actionMeta) {
        const meta = (actionMeta && typeof actionMeta === 'object') ? actionMeta : {};
        const action = String(meta.action || '').trim();
        const policyKey = String(meta.policyKey || '').trim();
        if (policyKey && S._RANDOM_EXAM_TOOLBAR_POLICY_REASON_BY_KEY[policyKey]) {
            return { allowed: false, reason: S._RANDOM_EXAM_TOOLBAR_POLICY_REASON_BY_KEY[policyKey] };
        }

        if (action === 'cmd') {
            const cmd = String(meta.cmd || '').trim();
            if (!cmd) return { allowed: true, reason: '' };
            if (S._RANDOM_EXAM_ANSWER_ALLOWED_LATEX_COMMANDS.has(cmd)) return { allowed: true, reason: '' };
            if (S._RANDOM_EXAM_ANSWER_MULTIPLICATION_TEXT_COMMANDS.has(cmd)) {
                return { allowed: false, reason: `'\\${cmd}' 대신 '*'를 사용하세요.` };
            }
            if (S._RANDOM_EXAM_ANSWER_TEXT_STYLE_COMMANDS.has(cmd)) {
                return { allowed: false, reason: `'\\${cmd}'는 지문용 서식 명령입니다.` };
            }
            if (S._RANDOM_EXAM_ANSWER_UNSUPPORTED_FUNCTION_COMMANDS.has(cmd)) {
                return { allowed: false, reason: `함수 '\\${cmd}'는 random-exam-generator 계산 파서에서 지원되지 않습니다.` };
            }
            return { allowed: false, reason: `'\\${cmd}'는 정답식 계산 파서 미지원 명령입니다.` };
        }

        if (action === 'wrap') {
            const prefix = String(meta.prefix || '');
            const suffix = String(meta.suffix || '');
            if (prefix === '*' && suffix === '*') {
                return { allowed: false, reason: S._RANDOM_EXAM_TOOLBAR_POLICY_REASON_BY_KEY.answer_no_var_wrap };
            }
            if ((prefix === '$' && suffix === '$') || (prefix === '$$' && suffix === '$$')) {
                return { allowed: false, reason: S._RANDOM_EXAM_TOOLBAR_POLICY_REASON_BY_KEY.answer_no_math_delimiter };
            }
        }

        if (action === 'tpl') {
            const tpl = String(meta.tpl || '');
            if (tpl.includes('$')) {
                return { allowed: false, reason: S._RANDOM_EXAM_TOOLBAR_POLICY_REASON_BY_KEY.answer_no_math_delimiter };
            }
        }

        return { allowed: true, reason: '' };
    }

    function getPdflatexCompatibilityProfile() {
        return {
            compilerCommand: S._RANDOM_EXAM_PDFLATEX_PROFILE.compilerCommand,
            engine: S._RANDOM_EXAM_PDFLATEX_PROFILE.engine,
            documentClass: S._RANDOM_EXAM_PDFLATEX_PROFILE.documentClass,
            mathPackages: {
                amsmath: !!S._RANDOM_EXAM_PDFLATEX_PROFILE.mathPackages.amsmath,
                amssymb: !!S._RANDOM_EXAM_PDFLATEX_PROFILE.mathPackages.amssymb,
                amsfonts: !!S._RANDOM_EXAM_PDFLATEX_PROFILE.mathPackages.amsfonts,
                mathtools: !!S._RANDOM_EXAM_PDFLATEX_PROFILE.mathPackages.mathtools
            }
        };
    }

    root.RandomExamCompatAnswer = {
        diagnoseAnswerParserCompatibility,
        latexToPythonCompat,
        getAnswerSupportedLatexCommands,
        evaluateAnswerToolbarAction,
        getPdflatexCompatibilityProfile
    };
})();
