(() => {
    'use strict';

    const root = (typeof window !== 'undefined') ? window : globalThis;
    const S = root.RandomExamCompatShared;
    if (!S) return;

    function _getCommandMode(cmd) {
        if (typeof S._getTextCommandMode === 'function') {
            return S._getTextCommandMode(cmd);
        }
        const name = String(cmd || '').trim();
        if (!name) return '';
        const textOnly = S._RANDOM_EXAM_TEXT_TEXT_ONLY_COMMANDS || new Set();
        const dualMode = S._RANDOM_EXAM_TEXT_DUAL_MODE_COMMANDS || new Set();
        const mathOnly = S._RANDOM_EXAM_TEXT_MATH_ONLY_COMMANDS || new Set();
        if (dualMode.has(name)) return 'dual';
        if (textOnly.has(name)) return 'text';
        if (mathOnly.has(name)) return 'math';
        return '';
    }

    function _isGreekUnicodeChar(ch) {
        if (!ch) return false;
        const cp = ch.codePointAt(0);
        return (cp >= 0x0370 && cp <= 0x03FF) || (cp >= 0x1F00 && cp <= 0x1FFF);
    }

    function _collectGreekUnicodeFindings(text) {
        const raw = [...String(text || '')];
        const mappedCounts = new Map();
        const unmappedCounts = new Map();
        let totalGreekCharCount = 0;

        raw.forEach(ch => {
            if (!_isGreekUnicodeChar(ch)) return;
            totalGreekCharCount += 1;
            const mapped = S._RANDOM_EXAM_GREEK_UNICODE_MAP[ch];
            if (mapped) {
                const key = `${ch}\u0000${mapped}`;
                mappedCounts.set(key, (mappedCounts.get(key) || 0) + 1);
                return;
            }
            unmappedCounts.set(ch, (unmappedCounts.get(ch) || 0) + 1);
        });

        const mapped = [...mappedCounts.entries()].map(([key, count]) => {
            const sep = key.indexOf('\u0000');
            return {
                char: key.slice(0, sep),
                replacement: key.slice(sep + 1),
                count
            };
        });
        const unmapped = [...unmappedCounts.entries()].map(([char, count]) => ({ char, count }));

        const mappedCount = mapped.reduce((sum, item) => sum + item.count, 0);
        return { totalGreekCharCount, mappedCount, mapped, unmapped };
    }

    function _buildGreekUnicodeWarning(fieldLabel, findings) {
        if (!findings || findings.totalGreekCharCount <= 0) return '';
        const summarize = (items, itemToText, limit = 4) => {
            const arr = Array.isArray(items) ? items : [];
            if (arr.length === 0) return '';
            const head = arr.slice(0, limit).map(itemToText).join(', ');
            const more = arr.length > limit ? ` 외 ${arr.length - limit}개` : '';
            return `${head}${more}`;
        };

        const details = [];
        if (findings.mapped.length > 0) {
            const mappedSummary = summarize(
                findings.mapped,
                (item) => `'${item.char}' -> '${item.replacement}'`
            );
            if (mappedSummary) details.push(`자동치환 후보: ${mappedSummary}`);
        }
        if (findings.unmapped.length > 0) {
            const unmappedSummary = summarize(
                findings.unmapped,
                (item) => `'${item.char}'`
            );
            if (unmappedSummary) details.push(`수동 확인: ${unmappedSummary}`);
        }
        const tail = details.length > 0 ? ` ${details.join(' / ')}` : '';
        return `${fieldLabel}에 그리스 유니코드가 있습니다. '$\\alpha$'처럼 수식 구분자 안에서 LaTeX 명령으로 입력하세요.${tail}`;
    }

    function _collectMappedUnicodeFindings(text, mapObj) {
        const raw = [...String(text || '')];
        const counts = new Map();
        raw.forEach((ch) => {
            const replacement = mapObj[ch];
            if (!replacement) return;
            const key = `${ch}\u0000${replacement}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        const mapped = [...counts.entries()].map(([key, count]) => {
            const sep = key.indexOf('\u0000');
            return {
                char: key.slice(0, sep),
                replacement: key.slice(sep + 1),
                count
            };
        });
        const mappedCount = mapped.reduce((sum, item) => sum + item.count, 0);
        return { totalCount: mappedCount, mapped };
    }

    function _buildUnicodeMathSymbolWarning(fieldLabel, findings) {
        if (!findings || findings.totalCount <= 0) return '';
        const summary = findings.mapped
            .slice(0, 6)
            .map((item) => `'${item.char}' -> '${item.replacement}'`)
            .join(', ');
        const more = findings.mapped.length > 6 ? ` 외 ${findings.mapped.length - 6}개` : '';
        return `${fieldLabel}에 pdflatex 비권장 유니코드 수학기호가 있습니다. LaTeX 명령으로 바꾸세요: ${summary}${more}`;
    }

    function _collectInvisibleUnicodeFindings(text) {
        const raw = [...String(text || '')];
        const counts = new Map();
        raw.forEach((ch) => {
            const meta = S._RANDOM_EXAM_TEXT_INVISIBLE_UNICODE_MAP[ch];
            if (!meta) return;
            counts.set(ch, (counts.get(ch) || 0) + 1);
        });
        const items = [...counts.entries()].map(([char, count]) => {
            const meta = S._RANDOM_EXAM_TEXT_INVISIBLE_UNICODE_MAP[char] || {};
            return {
                char,
                label: String(meta.label || 'INVISIBLE'),
                replacement: (typeof meta.replacement === 'string') ? meta.replacement : '',
                count
            };
        });
        const totalCount = items.reduce((sum, item) => sum + item.count, 0);
        return { totalCount, items };
    }

    function _buildInvisibleUnicodeWarning(fieldLabel, findings) {
        if (!findings || findings.totalCount <= 0) return '';
        const summary = findings.items
            .slice(0, 5)
            .map((item) => `${item.label}(U+${item.char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
            .join(', ');
        const more = findings.items.length > 5 ? ` 외 ${findings.items.length - 5}개` : '';
        return `${fieldLabel}에 보이지 않는 유니코드 문자가 있습니다: ${summary}${more}. 제거 또는 공백으로 정리하세요.`;
    }

    function _isEmojiLikeChar(ch) {
        if (!ch) return false;
        const cp = ch.codePointAt(0);
        return (
            (cp >= 0x1F300 && cp <= 0x1FAFF) ||
            (cp >= 0x1F1E6 && cp <= 0x1F1FF)
        );
    }

    function _collectEmojiFindings(text) {
        const raw = [...String(text || '')];
        const counts = new Map();
        raw.forEach((ch) => {
            if (!_isEmojiLikeChar(ch)) return;
            counts.set(ch, (counts.get(ch) || 0) + 1);
        });
        const items = [...counts.entries()].map(([char, count]) => ({ char, count }));
        const totalCount = items.reduce((sum, item) => sum + item.count, 0);
        return { totalCount, items };
    }

    function _buildEmojiWarning(fieldLabel, findings) {
        if (!findings || findings.totalCount <= 0) return '';
        const summary = findings.items
            .slice(0, 4)
            .map((item) => `'${item.char}'`)
            .join(', ');
        const more = findings.items.length > 4 ? ` 외 ${findings.items.length - 4}개` : '';
        return `${fieldLabel}에 이모지/픽토그램 문자가 있습니다: ${summary}${more}. pdflatex 출력에서 누락될 수 있으니 텍스트 또는 LaTeX 표기로 바꾸세요.`;
    }

    function _isUnicodeSuperscriptSubscript(ch) {
        if (_UNICODE_SUP_SUB_TO_LATEX[ch]) return true;
        const cp = ch.codePointAt(0);
        if (cp === 0x00B2 || cp === 0x00B3 || cp === 0x00B9) return true;
        if (cp >= 0x2070 && cp <= 0x209F) return true;
        return false;
    }

    function _collectUnicodeSupSubFindings(text) {
        const raw = [...String(text || '')];
        const counts = new Map();
        raw.forEach((ch) => {
            if (!_isUnicodeSuperscriptSubscript(ch)) return;
            counts.set(ch, (counts.get(ch) || 0) + 1);
        });
        const items = [...counts.entries()].map(([char, count]) => ({ char, count }));
        const totalCount = items.reduce((sum, item) => sum + item.count, 0);
        return { totalCount, items };
    }

    function _buildSupSubWarning(fieldLabel, findings) {
        if (!findings || findings.totalCount <= 0) return '';
        const summary = findings.items
            .slice(0, 6)
            .map((item) => `'${item.char}'`)
            .join(', ');
        const more = findings.items.length > 6 ? ` 외 ${findings.items.length - 6}개` : '';
        return `${fieldLabel}에 유니코드 위/아래첨자 문자가 있습니다: ${summary}${more}. '^{}', '_{}' 형태의 LaTeX 표기를 권장합니다.`;
    }

    const _UNICODE_SUP_SUB_TO_LATEX = Object.freeze({
        '\u00B9': { type: 'sup', value: '1' },
        '\u00B2': { type: 'sup', value: '2' },
        '\u00B3': { type: 'sup', value: '3' },
        '\u2070': { type: 'sup', value: '0' },
        '\u2071': { type: 'sup', value: 'i' },
        '\u2074': { type: 'sup', value: '4' },
        '\u2075': { type: 'sup', value: '5' },
        '\u2076': { type: 'sup', value: '6' },
        '\u2077': { type: 'sup', value: '7' },
        '\u2078': { type: 'sup', value: '8' },
        '\u2079': { type: 'sup', value: '9' },
        '\u207A': { type: 'sup', value: '+' },
        '\u207B': { type: 'sup', value: '-' },
        '\u207C': { type: 'sup', value: '=' },
        '\u207D': { type: 'sup', value: '(' },
        '\u207E': { type: 'sup', value: ')' },
        '\u207F': { type: 'sup', value: 'n' },
        '\u2080': { type: 'sub', value: '0' },
        '\u2081': { type: 'sub', value: '1' },
        '\u2082': { type: 'sub', value: '2' },
        '\u2083': { type: 'sub', value: '3' },
        '\u2084': { type: 'sub', value: '4' },
        '\u2085': { type: 'sub', value: '5' },
        '\u2086': { type: 'sub', value: '6' },
        '\u2087': { type: 'sub', value: '7' },
        '\u2088': { type: 'sub', value: '8' },
        '\u2089': { type: 'sub', value: '9' },
        '\u208A': { type: 'sub', value: '+' },
        '\u208B': { type: 'sub', value: '-' },
        '\u208C': { type: 'sub', value: '=' },
        '\u208D': { type: 'sub', value: '(' },
        '\u208E': { type: 'sub', value: ')' },
        '\u2090': { type: 'sub', value: 'a' },
        '\u2091': { type: 'sub', value: 'e' },
        '\u2092': { type: 'sub', value: 'o' },
        '\u2093': { type: 'sub', value: 'x' },
        '\u2095': { type: 'sub', value: 'h' },
        '\u2096': { type: 'sub', value: 'k' },
        '\u2097': { type: 'sub', value: 'l' },
        '\u2098': { type: 'sub', value: 'm' },
        '\u2099': { type: 'sub', value: 'n' },
        '\u209A': { type: 'sub', value: 'p' },
        '\u209B': { type: 'sub', value: 's' },
        '\u209C': { type: 'sub', value: 't' }
    });

    function _isHangulChar(ch) {
        if (!ch) return false;
        const cp = ch.codePointAt(0);
        return (
            (cp >= 0xAC00 && cp <= 0xD7A3) || // Hangul syllables
            (cp >= 0x1100 && cp <= 0x11FF) || // Hangul jamo
            (cp >= 0x3130 && cp <= 0x318F) || // Hangul compatibility jamo
            (cp >= 0xA960 && cp <= 0xA97F) || // Hangul jamo extended-A
            (cp >= 0xD7B0 && cp <= 0xD7FF)    // Hangul jamo extended-B
        );
    }

    function _collectUnhandledUnicodeFindings(text) {
        const raw = [...String(text || '')];
        const counts = new Map();
        raw.forEach((ch) => {
            const cp = ch.codePointAt(0);
            if (!Number.isFinite(cp) || cp <= 0x7F) return;
            if (_isHangulChar(ch)) return;
            if (S._RANDOM_EXAM_GREEK_UNICODE_MAP[ch]) return;
            if (S._RANDOM_EXAM_TEXT_UNICODE_SYMBOL_MAP[ch]) return;
            if (S._RANDOM_EXAM_TEXT_INVISIBLE_UNICODE_MAP[ch]) return;
            if (_isEmojiLikeChar(ch)) return;
            if (_isUnicodeSuperscriptSubscript(ch)) return;
            counts.set(ch, (counts.get(ch) || 0) + 1);
        });
        const items = [...counts.entries()].map(([char, count]) => ({ char, count }));
        const totalCount = items.reduce((sum, item) => sum + item.count, 0);
        return { totalCount, items };
    }

    function _buildUnhandledUnicodeWarning(fieldLabel, findings) {
        if (!findings || findings.totalCount <= 0) return '';
        const summary = findings.items
            .slice(0, 6)
            .map((item) => `'${item.char}'(U+${item.char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
            .join(', ');
        const more = findings.items.length > 6 ? ` 외 ${findings.items.length - 6}개` : '';
        return `${fieldLabel}에 분류되지 않은 유니코드 문자가 있습니다: ${summary}${more}. pdflatex 환경에서 표시가 불안정할 수 있어 수동 확인을 권장합니다.`;
    }

    const _TEXT_MATH_FUNCTION_COMMANDS = new Set([
        'sin', 'cos', 'tan', 'csc', 'sec', 'cot',
        'arcsin', 'arccos', 'arctan',
        'sinh', 'cosh', 'tanh',
        'ln', 'log', 'exp'
    ]);

    const _TEXT_MATH_ONE_ARG_COMMANDS = new Set([
        'sqrt', 'vec', 'hat', 'bar', 'overline', 'dot', 'ddot',
        'mathrm', 'mathbb', 'mathcal', 'mathbf'
    ]);

    const _TEXT_MATH_TWO_ARG_COMMANDS = new Set([
        'frac'
    ]);

    const _TEXT_MATH_REQUIRES_ARG_COMMANDS = new Set([
        ..._TEXT_MATH_ONE_ARG_COMMANDS,
        ..._TEXT_MATH_TWO_ARG_COMMANDS
    ]);

    function _skipWhitespace(rawText, start) {
        let i = Number(start) || 0;
        while (i < rawText.length && /\s/.test(rawText[i])) i += 1;
        return i;
    }

    function _consumeBalancedGroup(rawText, start, openCh, closeCh) {
        if (start < 0 || start >= rawText.length) return -1;
        if (rawText[start] !== openCh) return -1;
        let depth = 0;
        for (let i = start; i < rawText.length; i++) {
            const ch = rawText[i];
            if (ch === openCh && !S._isEscapedAt(rawText, i)) depth += 1;
            else if (ch === closeCh && !S._isEscapedAt(rawText, i)) {
                depth -= 1;
                if (depth === 0) return i + 1;
            }
        }
        return -1;
    }

    function _consumeLatexControlSequence(rawText, start) {
        if (start < 0 || start >= rawText.length) return start;
        if (rawText[start] !== '\\' || S._isEscapedAt(rawText, start)) return start;
        let i = start + 1;
        while (i < rawText.length && /[A-Za-z]/.test(rawText[i])) i += 1;
        if (i === start + 1) return Math.min(rawText.length, start + 2);
        return i;
    }

    function _consumeLeftRightDelimiter(rawText, start) {
        const pos = _skipWhitespace(rawText, start);
        if (pos >= rawText.length) return -1;
        if (rawText[pos] === '\\') {
            const end = _consumeLatexControlSequence(rawText, pos);
            return (end > pos) ? end : -1;
        }
        return pos + 1;
    }

    function _consumeLeftRightSpan(rawText, start, cmdEnd) {
        const firstDelimiterEnd = _consumeLeftRightDelimiter(rawText, cmdEnd);
        if (firstDelimiterEnd <= cmdEnd) return null;

        let depth = 1;
        let cursor = firstDelimiterEnd;
        while (cursor < rawText.length) {
            const ch = rawText[cursor];
            if (ch !== '\\' || S._isEscapedAt(rawText, cursor)) {
                cursor += 1;
                continue;
            }

            const seqEnd = _consumeLatexControlSequence(rawText, cursor);
            if (seqEnd <= cursor) {
                cursor += 1;
                continue;
            }
            const name = rawText.slice(cursor + 1, seqEnd);
            if (name !== 'left' && name !== 'right') {
                cursor = seqEnd;
                continue;
            }

            const delimiterEnd = _consumeLeftRightDelimiter(rawText, seqEnd);
            if (delimiterEnd <= seqEnd) {
                cursor = seqEnd;
                continue;
            }

            depth += (name === 'left') ? 1 : -1;
            cursor = delimiterEnd;
            if (depth === 0) {
                return {
                    end: cursor,
                    base: rawText.slice(start, cursor)
                };
            }
            if (depth < 0) return null;
        }
        return null;
    }

    function _consumeMathAtom(rawText, start) {
        const atomStart = _skipWhitespace(rawText, start);
        if (atomStart >= rawText.length) return atomStart;
        const ch = rawText[atomStart];
        if (ch === '{') {
            const end = _consumeBalancedGroup(rawText, atomStart, '{', '}');
            return end > atomStart ? end : atomStart;
        }
        if (ch === '(') {
            const end = _consumeBalancedGroup(rawText, atomStart, '(', ')');
            return end > atomStart ? end : atomStart;
        }
        if (ch === '[') {
            const end = _consumeBalancedGroup(rawText, atomStart, '[', ']');
            return end > atomStart ? end : atomStart;
        }
        if (ch === '\\') {
            const seqEnd = _consumeLatexControlSequence(rawText, atomStart);
            if (seqEnd <= atomStart) return atomStart;
            const cmd = rawText.slice(atomStart + 1, seqEnd);
            if (!cmd) return seqEnd;

            const mode = _getCommandMode(cmd);
            if (mode === 'math') {
                return Math.max(seqEnd, _expandMathOnlyCommandSpan(rawText, atomStart, cmd, seqEnd));
            }

            // Keep command+group together to avoid malformed wrap like "$\\sin \\textbf${a}".
            let cursor = seqEnd;
            while (true) {
                const groupStart = _skipWhitespace(rawText, cursor);
                if (rawText[groupStart] !== '{') break;
                const groupEnd = _consumeBalancedGroup(rawText, groupStart, '{', '}');
                if (groupEnd <= groupStart) break;
                cursor = groupEnd;
            }
            return cursor;
        }
        if (/[A-Za-z0-9.]/.test(ch)) {
            let i = atomStart + 1;
            while (i < rawText.length && /[A-Za-z0-9.]/.test(rawText[i])) i += 1;
            return i;
        }
        return atomStart;
    }

    function _consumeMathScripts(rawText, start) {
        let cursor = Number(start) || 0;
        while (cursor < rawText.length) {
            const opPos = _skipWhitespace(rawText, cursor);
            const op = rawText[opPos];
            if (op !== '^' && op !== '_') return cursor;
            const argEnd = _consumeMathAtom(rawText, opPos + 1);
            if (argEnd <= opPos + 1) return cursor;
            cursor = argEnd;
        }
        return cursor;
    }

    function _expandMathOnlyCommandSpan(rawText, start, cmd, cmdEnd) {
        let cursor = cmdEnd;
        const consumeRequiredArg = () => {
            const argStart = _skipWhitespace(rawText, cursor);
            const argEnd = _consumeMathAtom(rawText, argStart);
            if (argEnd <= argStart) return false;
            cursor = argEnd;
            return true;
        };

        if (_TEXT_MATH_TWO_ARG_COMMANDS.has(cmd)) {
            consumeRequiredArg();
            consumeRequiredArg();
            return cursor;
        }

        if (cmd === 'sqrt') {
            const optPos = _skipWhitespace(rawText, cursor);
            if (rawText[optPos] === '[') {
                const optEnd = _consumeBalancedGroup(rawText, optPos, '[', ']');
                if (optEnd > optPos) cursor = optEnd;
            }
            consumeRequiredArg();
            return cursor;
        }

        if (_TEXT_MATH_ONE_ARG_COMMANDS.has(cmd)) {
            consumeRequiredArg();
            return cursor;
        }

        if (cmd === 'left' || cmd === 'right') {
            const delimPos = _skipWhitespace(rawText, cursor);
            if (delimPos >= rawText.length) return cursor;
            if (rawText[delimPos] === '\\') {
                const delimEnd = _consumeLatexControlSequence(rawText, delimPos);
                if (delimEnd > delimPos) cursor = delimEnd;
                return cursor;
            }
            return delimPos + 1;
        }

        if (_TEXT_MATH_FUNCTION_COMMANDS.has(cmd)) {
            cursor = _consumeMathScripts(rawText, cursor);
            const argStart = _skipWhitespace(rawText, cursor);
            const argEnd = _consumeMathAtom(rawText, argStart);
            if (argEnd > argStart) cursor = argEnd;
            return cursor;
        }

        return cursor;
    }

    function _collectMathOnlyLatexCommandRangesOutsideMath(text) {
        const rawText = String(text || '');
        const ranges = [];
        let mathMode = null; // null | '$' | '$$'

        for (let i = 0; i < rawText.length; i++) {
            const ch = rawText[i];

            if (ch === '$' && !S._isEscapedAt(rawText, i)) {
                const next = rawText[i + 1] || '';
                const canUseDouble = (next === '$' && !S._isEscapedAt(rawText, i + 1) && mathMode !== '$');
                if (canUseDouble) {
                    mathMode = (mathMode === '$$') ? null : '$$';
                    i += 1;
                    continue;
                }
                mathMode = (mathMode === '$') ? null : '$';
                continue;
            }

            if (mathMode || ch !== '\\' || S._isEscapedAt(rawText, i)) continue;

            let j = i + 1;
            while (j < rawText.length && /[A-Za-z]/.test(rawText[j])) j += 1;
            if (j === i + 1) continue;

            const cmd = rawText.slice(i + 1, j);
            if (_getCommandMode(cmd) !== 'math') {
                i = j - 1;
                continue;
            }

            const spanEnd = Math.max(j, _expandMathOnlyCommandSpan(rawText, i, cmd, j));
            if (_TEXT_MATH_REQUIRES_ARG_COMMANDS.has(cmd) && spanEnd <= j) {
                i = j - 1;
                continue;
            }
            ranges.push({ start: i, end: spanEnd, cmd });
            i = spanEnd - 1;
        }

        return ranges;
    }

    function _collectMathOnlyLatexCommandsOutsideMath(text) {
        const rawText = String(text || '');
        const outCounts = new Map();
        let mathMode = null; // null | '$' | '$$'

        for (let i = 0; i < rawText.length; i++) {
            const ch = rawText[i];
            if (ch === '$' && !S._isEscapedAt(rawText, i)) {
                const next = rawText[i + 1] || '';
                const canUseDouble = (next === '$' && !S._isEscapedAt(rawText, i + 1) && mathMode !== '$');
                if (canUseDouble) {
                    mathMode = (mathMode === '$$') ? null : '$$';
                    i += 1;
                    continue;
                }
                mathMode = (mathMode === '$') ? null : '$';
                continue;
            }
            if (mathMode || ch !== '\\' || S._isEscapedAt(rawText, i)) continue;
            let j = i + 1;
            while (j < rawText.length && /[A-Za-z]/.test(rawText[j])) j += 1;
            if (j === i + 1) continue;

            const cmd = rawText.slice(i + 1, j);
            if (_getCommandMode(cmd) === 'math') {
                outCounts.set(cmd, (outCounts.get(cmd) || 0) + 1);
            }
            i = j - 1;
        }

        return [...outCounts.entries()].map(([cmd, count]) => ({ cmd, count }));
    }

    function _collectLatexCommandModeFindings(text) {
        const rawText = String(text || '');
        const outsideNotTextOnlyCounts = new Map();
        const insideNotMathOnlyCounts = new Map();
        const mathOnlyOutsideCounts = new Map();
        let mathMode = null; // null | '$' | '$$'
        for (let i = 0; i < rawText.length; i++) {
            const ch = rawText[i];
            if (ch === '$' && !S._isEscapedAt(rawText, i)) {
                const next = rawText[i + 1] || '';
                const canUseDouble = (next === '$' && !S._isEscapedAt(rawText, i + 1) && mathMode !== '$');
                if (canUseDouble) {
                    mathMode = (mathMode === '$$') ? null : '$$';
                    i += 1;
                    continue;
                }
                mathMode = (mathMode === '$') ? null : '$';
                continue;
            }
            if (ch !== '\\' || S._isEscapedAt(rawText, i)) continue;
            let j = i + 1;
            while (j < rawText.length && /[A-Za-z]/.test(rawText[j])) j += 1;
            if (j === i + 1) continue;

            const cmd = rawText.slice(i + 1, j);
            const mode = _getCommandMode(cmd);
            if (mode === 'dual') {
                i = j - 1;
                continue;
            }

            if (mathMode) {
                if (mode !== 'math') {
                    insideNotMathOnlyCounts.set(cmd, (insideNotMathOnlyCounts.get(cmd) || 0) + 1);
                }
            } else if (mode !== 'text') {
                outsideNotTextOnlyCounts.set(cmd, (outsideNotTextOnlyCounts.get(cmd) || 0) + 1);
                if (mode === 'math') {
                    mathOnlyOutsideCounts.set(cmd, (mathOnlyOutsideCounts.get(cmd) || 0) + 1);
                }
            }

            i = j - 1;
        }

        const toArray = (counts) => [...counts.entries()].map(([cmd, count]) => ({ cmd, count }));
        return {
            outsideNotTextOnly: toArray(outsideNotTextOnlyCounts),
            insideNotMathOnly: toArray(insideNotMathOnlyCounts),
            mathOnlyOutside: toArray(mathOnlyOutsideCounts)
        };
    }

    function _formatCommandHitSummary(commandHits, limit = 6) {
        const arr = Array.isArray(commandHits) ? commandHits : [];
        if (arr.length === 0) return { summary: '', more: '' };
        const summary = arr
            .slice(0, limit)
            .map(item => `\\${item.cmd}`)
            .join(', ');
        const more = arr.length > limit ? ` 외 ${arr.length - limit}개` : '';
        return { summary, more };
    }

    function _buildOutsideNotTextOnlyWarning(fieldLabel, commandHits) {
        if (!Array.isArray(commandHits) || commandHits.length === 0) return '';
        const { summary, more } = _formatCommandHitSummary(commandHits);
        if (!summary) return '';
        return `${fieldLabel}에서 수식 구분자 밖에 텍스트 전용이 아닌 LaTeX 명령이 있습니다: ${summary}${more}. 수식 전용 LaTeX 명령은 '$...$' 또는 '$$...$$' 안으로 옮기고, 미정의 명령은 수정하세요.`;
    }

    function _buildInsideNotMathOnlyWarning(fieldLabel, commandHits) {
        if (!Array.isArray(commandHits) || commandHits.length === 0) return '';
        const { summary, more } = _formatCommandHitSummary(commandHits);
        if (!summary) return '';
        return `${fieldLabel}에서 수식 구분자 안에 수식 전용이 아닌 LaTeX 명령이 있습니다: ${summary}${more}. 수식 전용 명령으로 바꾸거나 수식 밖으로 이동하세요.`;
    }

    function _buildMathOnlyCommandOutsideMathWarning(fieldLabel, commandHits) {
        if (!Array.isArray(commandHits) || commandHits.length === 0) return '';
        const summary = commandHits
            .slice(0, 6)
            .map(item => `\\${item.cmd}`)
            .join(', ');
        const more = commandHits.length > 6 ? ` 외 ${commandHits.length - 6}개` : '';
        return `${fieldLabel}에서 수식 전용 LaTeX 명령이 수식 밖에 있습니다: ${summary}${more}. '$...$' 또는 '$$...$$' 안으로 옮기세요.`;
    }

    function _collectMathCommandPackageFindings(text) {
        if (typeof S._getMissingMathPackagesForCommand !== 'function') return [];
        const rawText = String(text || '');
        const counts = new Map();
        let mathMode = null; // null | '$' | '$$'

        for (let i = 0; i < rawText.length; i++) {
            const ch = rawText[i];
            if (ch === '$' && !S._isEscapedAt(rawText, i)) {
                const next = rawText[i + 1] || '';
                const canUseDouble = (next === '$' && !S._isEscapedAt(rawText, i + 1) && mathMode !== '$');
                if (canUseDouble) {
                    mathMode = (mathMode === '$$') ? null : '$$';
                    i += 1;
                    continue;
                }
                mathMode = (mathMode === '$') ? null : '$';
                continue;
            }
            if (!mathMode || ch !== '\\' || S._isEscapedAt(rawText, i)) continue;

            let j = i + 1;
            while (j < rawText.length && /[A-Za-z]/.test(rawText[j])) j += 1;
            if (j === i + 1) continue;

            const cmd = String(rawText.slice(i + 1, j) || '');
            if (!cmd || _getCommandMode(cmd) !== 'math') {
                i = j - 1;
                continue;
            }

            const missing = S._getMissingMathPackagesForCommand(cmd);
            if (!Array.isArray(missing) || missing.length <= 0) {
                i = j - 1;
                continue;
            }
            const pkgKey = [...new Set(missing.map((pkg) => String(pkg || '').trim()).filter(Boolean))].sort().join(',');
            if (!pkgKey) {
                i = j - 1;
                continue;
            }
            const key = `${cmd}\u0000${pkgKey}`;
            counts.set(key, (counts.get(key) || 0) + 1);
            i = j - 1;
        }
        return [...counts.entries()].map(([key, count]) => {
            const sep = key.indexOf('\u0000');
            const cmd = key.slice(0, sep);
            const missingPackages = key.slice(sep + 1).split(',').filter(Boolean);
            return { cmd, missingPackages, count };
        });
    }

    function _buildMathCommandPackageWarning(fieldLabel, commandHits) {
        const arr = Array.isArray(commandHits) ? commandHits : [];
        if (arr.length <= 0) return '';
        const summary = arr
            .slice(0, 4)
            .map((item) => {
                const pkgs = Array.isArray(item?.missingPackages) ? item.missingPackages.join('/') : '';
                return `\\${item?.cmd || ''}${pkgs ? ` (필요: ${pkgs})` : ''}`;
            })
            .filter(Boolean)
            .join(', ');
        if (!summary) return '';
        const more = arr.length > 4 ? ` 외 ${arr.length - 4}개` : '';
        return `${fieldLabel}에서 패키지 의존 수식 명령이 감지되었습니다: ${summary}${more}. 현재 pdflatex 기준 환경에서는 컴파일 오류가 날 수 있습니다.`;
    }

    function _diagnoseUnescapedBraceBalance(text) {
        const raw = String(text || '');
        let depth = 0;
        let extraClosing = 0;
        let inComment = false;

        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];
            if (inComment) {
                if (ch === '\n' || ch === '\r') inComment = false;
                continue;
            }
            if (ch === '%' && !S._isEscapedAt(raw, i)) {
                inComment = true;
                continue;
            }
            if (ch === '{' && !S._isEscapedAt(raw, i)) {
                depth += 1;
                continue;
            }
            if (ch === '}' && !S._isEscapedAt(raw, i)) {
                if (depth === 0) extraClosing += 1;
                else depth -= 1;
            }
        }

        return {
            unclosedOpening: depth,
            extraClosing
        };
    }

    function _diagnoseTextLatexCompatibility(text) {
        const errors = [];
        const warnings = [];
        const raw = String(text || '');
        if (!raw.trim()) return { errors, warnings };

        const strictFixes = [
            { ch: '%', escaped: '\\%' },
            { ch: '&', escaped: '\\&' },
            { ch: '#', escaped: '\\#' }
        ];
        strictFixes.forEach(({ ch, escaped }) => {
            const indexes = S._collectUnescapedIndexes(raw, ch);
            if (indexes.length > 0) {
                errors.push(`지문에 '${ch}' 문자가 이스케이프 없이 포함되어 있습니다. '${escaped}'로 입력하세요.`);
            }
        });

        const textEscapeWarnings = [];
        Object.entries(S._RANDOM_EXAM_TEXT_SPECIAL_CHAR_WARNING_FIXES).forEach(([ch, escaped]) => {
            const indexes = S._collectUnescapedIndexesOutsideMath(raw, ch);
            if (indexes.length > 0) {
                textEscapeWarnings.push(`'${ch}' -> '${escaped}'`);
            }
        });
        if (textEscapeWarnings.length > 0) {
            warnings.push(`지문 텍스트(수식 구분자 밖) 특수문자 이스케이프 권장: ${textEscapeWarnings.join(', ')}`);
        }

        const dollarIndexes = S._collectUnescapedIndexes(raw, '$');
        if ((dollarIndexes.length % 2) !== 0) {
            errors.push("지문의 수식 구분자 '$' 개수가 맞지 않습니다. 인라인 수식은 '$...$' 형태로 닫아주세요.");
        }
        const braceBalance = _diagnoseUnescapedBraceBalance(raw);
        if (braceBalance.unclosedOpening > 0 || braceBalance.extraClosing > 0) {
            errors.push(
                "지문의 LaTeX 중괄호 {} 짝이 맞지 않습니다. 여는 '{'와 닫는 '}'를 맞춰 주세요. 문자 중괄호는 '\\{' 또는 '\\}'로 입력하세요."
            );
        }
        return { errors, warnings };
    }

    function _replaceMappedUnicodeWithLatex(text, mapObj, wrapOutsideMath) {
        const rawText = String(text || '');
        const raw = rawText;
        if (raw.length === 0) return { text: '', replacements: [] };

        const replacementCounts = new Map();
        const out = [];
        let mathMode = null; // null | '$' | '$$'

        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];

            if (ch === '$' && !S._isEscapedAt(rawText, i)) {
                const next = raw[i + 1] || '';
                const canUseDouble = (next === '$' && !S._isEscapedAt(rawText, i + 1) && mathMode !== '$');
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

            const replacementBase = mapObj[ch];
            if (!replacementBase) {
                out.push(ch);
                continue;
            }

            let replacement = replacementBase;
            if (mathMode) {
                const nextChar = raw[i + 1] || '';
                replacement = (replacementBase.startsWith('\\') && S._needsLatexCommandDelimiter(nextChar))
                    ? `${replacementBase}{}`
                    : replacementBase;
            } else {
                const nextChar = raw[i + 1] || '';
                if (!wrapOutsideMath && replacementBase.startsWith('\\') && S._needsLatexCommandDelimiter(nextChar)) {
                    replacement = `${replacementBase}{}`;
                } else if (wrapOutsideMath && replacementBase.startsWith('\\')) {
                    replacement = `$${replacementBase}$`;
                }
            }

            out.push(replacement);
            const key = `${ch}\u0000${replacementBase}`;
            replacementCounts.set(key, (replacementCounts.get(key) || 0) + 1);
        }

        const replacements = [...replacementCounts.entries()].map(([key, count]) => {
            const sep = key.indexOf('\u0000');
            return {
                char: key.slice(0, sep),
                replacement: key.slice(sep + 1),
                count
            };
        });
        return {
            text: out.join(''),
            replacements
        };
    }

    function replaceGreekUnicodeWithLatex(text) {
        return _replaceMappedUnicodeWithLatex(text, S._RANDOM_EXAM_GREEK_UNICODE_MAP, false);
    }

    function replaceGreekUnicodeWithLatexInText(text) {
        return _replaceMappedUnicodeWithLatex(text, S._RANDOM_EXAM_GREEK_UNICODE_MAP, true);
    }

    function replaceTextUnicodeSymbolsWithLatexInText(text) {
        return _replaceMappedUnicodeWithLatex(text, S._RANDOM_EXAM_TEXT_UNICODE_SYMBOL_MAP, true);
    }

    function normalizeTextUnicode(text) {
        const raw = [...String(text || '')];
        if (raw.length === 0) return { text: '', replacements: [] };
        const replacementCounts = new Map();
        const out = [];
        raw.forEach((ch) => {
            const meta = S._RANDOM_EXAM_TEXT_INVISIBLE_UNICODE_MAP[ch];
            if (!meta) {
                out.push(ch);
                return;
            }
            const replacement = (typeof meta.replacement === 'string') ? meta.replacement : '';
            out.push(replacement);
            const label = String(meta.label || 'INVISIBLE');
            const key = `${ch}\u0000${label}\u0000${replacement}`;
            replacementCounts.set(key, (replacementCounts.get(key) || 0) + 1);
        });
        const replacements = [...replacementCounts.entries()].map(([key, count]) => {
            const parts = key.split('\u0000');
            return {
                char: parts[0] || '',
                label: parts[1] || 'INVISIBLE',
                replacement: parts[2] || '',
                count
            };
        });
        return { text: out.join(''), replacements };
    }

    function wrapMathOnlyCommandsOutsideMathInText(text) {
        const rawText = String(text || '');
        if (!rawText) return { text: '', replacements: [] };
        const ranges = _collectMathOnlyLatexCommandRangesOutsideMath(rawText);
        if (ranges.length === 0) return { text: rawText, replacements: [] };

        const replacementCounts = new Map();
        const out = [];
        let cursor = 0;
        ranges.forEach((range) => {
            if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) return;
            if (range.start < cursor || range.end <= range.start) return;
            out.push(rawText.slice(cursor, range.start));
            const snippet = rawText.slice(range.start, range.end);
            out.push(`$${snippet}$`);
            cursor = range.end;
            const key = String(range.cmd || '');
            if (key) replacementCounts.set(key, (replacementCounts.get(key) || 0) + 1);
        });
        out.push(rawText.slice(cursor));

        const replacements = [...replacementCounts.entries()].map(([cmd, count]) => ({ cmd, count }));
        return { text: out.join(''), replacements };
    }

    function _consumeUnicodeSupSubRun(rawText, start) {
        const items = [];
        let i = Number(start) || 0;
        while (i < rawText.length) {
            const meta = _UNICODE_SUP_SUB_TO_LATEX[rawText[i]];
            if (!meta) break;
            const value = String(meta.value || '');
            if (!value) break;
            const type = (meta.type === 'sub') ? 'sub' : 'sup';
            items.push({ char: rawText[i], type, value });
            i += 1;
        }
        return { end: i, items };
    }

    function _supSubItemToCore(item) {
        if (!item) return '';
        const value = String(item.value || '');
        if (!value) return '';
        return (item.type === 'sub') ? `_{${value}}` : `^{${value}}`;
    }

    function _buildScriptsFromUnicodeSupSubRun(items) {
        const arr = Array.isArray(items) ? items : [];
        if (arr.length === 0) return '';
        const out = [];
        let activeType = '';
        let activeValue = '';

        const flush = () => {
            if (!activeType || !activeValue) return;
            out.push((activeType === 'sub') ? `_{${activeValue}}` : `^{${activeValue}}`);
            activeType = '';
            activeValue = '';
        };

        arr.forEach((item) => {
            const type = (item && item.type === 'sub') ? 'sub' : 'sup';
            const value = String(item?.value || '');
            if (!value) return;
            if (!activeType) {
                activeType = type;
                activeValue = value;
                return;
            }
            if (type === activeType) {
                activeValue += value;
                return;
            }
            flush();
            activeType = type;
            activeValue = value;
        });
        flush();
        return out.join('');
    }

    function _consumeLatexCommandBaseToken(rawText, start) {
        if (start < 0 || start >= rawText.length) return null;
        if (rawText[start] !== '\\' || S._isEscapedAt(rawText, start)) return null;
        let i = start + 1;
        while (i < rawText.length && /[A-Za-z]/.test(rawText[i])) i += 1;
        if (i === start + 1) return null;

        const cmd = rawText.slice(start + 1, i);
        if (cmd === 'right') return null;
        if (cmd === 'left') {
            const leftRightSpan = _consumeLeftRightSpan(rawText, start, i);
            if (!leftRightSpan) return null;
            return leftRightSpan;
        }
        let end = i;

        if (_getCommandMode(cmd) === 'math') {
            end = Math.max(end, _expandMathOnlyCommandSpan(rawText, start, cmd, i));
        } else {
            let cursor = end;
            while (true) {
                const groupStart = _skipWhitespace(rawText, cursor);
                if (rawText[groupStart] !== '{') break;
                const groupEnd = _consumeBalancedGroup(rawText, groupStart, '{', '}');
                if (groupEnd <= groupStart) break;
                cursor = groupEnd;
            }
            end = cursor;
        }

        return {
            end,
            base: rawText.slice(start, end)
        };
    }

    function _consumeSupSubBaseTokenOutsideMath(rawText, start) {
        if (start < 0 || start >= rawText.length) return null;
        const ch = rawText[start];

        if (ch === '\\') {
            return _consumeLatexCommandBaseToken(rawText, start);
        }

        if (ch === '(') {
            const end = _consumeBalancedGroup(rawText, start, '(', ')');
            if (end > start) return { end, base: rawText.slice(start, end) };
            return null;
        }
        if (ch === '[') {
            const end = _consumeBalancedGroup(rawText, start, '[', ']');
            if (end > start) return { end, base: rawText.slice(start, end) };
            return null;
        }
        if (ch === '{') {
            const end = _consumeBalancedGroup(rawText, start, '{', '}');
            if (end > start) return { end, base: rawText.slice(start, end) };
            return null;
        }

        if (/[A-Za-z0-9.]/.test(ch || '')) {
            let end = start + 1;
            while (end < rawText.length && /[A-Za-z0-9.]/.test(rawText[end] || '')) end += 1;
            return { end, base: rawText.slice(start, end) };
        }

        return null;
    }

    function replaceUnicodeSupSubWithLatexInText(text) {
        const rawText = String(text || '');
        if (!rawText) return { text: '', replacements: [] };

        const replacementCounts = new Map();
        const out = [];
        let mathMode = null; // null | '$' | '$$'

        for (let i = 0; i < rawText.length;) {
            const ch = rawText[i];

            if (ch === '$' && !S._isEscapedAt(rawText, i)) {
                const next = rawText[i + 1] || '';
                const canUseDouble = (next === '$' && !S._isEscapedAt(rawText, i + 1) && mathMode !== '$');
                if (canUseDouble) {
                    out.push('$$');
                    mathMode = (mathMode === '$$') ? null : '$$';
                    i += 1;
                    continue;
                }
                out.push('$');
                mathMode = (mathMode === '$') ? null : '$';
                i += 1;
                continue;
            }

            if (mathMode) {
                const run = _consumeUnicodeSupSubRun(rawText, i);
                if (run.items.length <= 0) {
                    out.push(ch);
                    i += 1;
                    continue;
                }
                const scripts = _buildScriptsFromUnicodeSupSubRun(run.items);
                out.push(scripts || rawText.slice(i, run.end));
                run.items.forEach((item) => {
                    const core = _supSubItemToCore(item);
                    if (!core) return;
                    const key = `${item.char}\u0000${core}`;
                    replacementCounts.set(key, (replacementCounts.get(key) || 0) + 1);
                });
                i = run.end;
                continue;
            }

            const baseToken = _consumeSupSubBaseTokenOutsideMath(rawText, i);
            if (baseToken) {
                const run = _consumeUnicodeSupSubRun(rawText, baseToken.end);
                if (run.items.length > 0) {
                    const scripts = _buildScriptsFromUnicodeSupSubRun(run.items);
                    out.push(`$${baseToken.base}${scripts}$`);
                    run.items.forEach((item) => {
                        const core = _supSubItemToCore(item);
                        if (!core) return;
                        const key = `${item.char}\u0000${core}`;
                        replacementCounts.set(key, (replacementCounts.get(key) || 0) + 1);
                    });
                    i = run.end;
                    continue;
                }
                out.push(baseToken.base);
                i = baseToken.end;
                continue;
            }

            out.push(ch);
            i += 1;
        }

        const replacements = [...replacementCounts.entries()].map(([key, count]) => {
            const sep = key.indexOf('\u0000');
            return {
                char: key.slice(0, sep),
                replacement: key.slice(sep + 1),
                count
            };
        });

        return { text: out.join(''), replacements };
    }

    function escapeTextLatexSpecialChars(text) {
        const rawText = String(text || '');
        const raw = rawText;
        if (raw.length === 0) return { text: '', replacements: [] };

        const replacementCounts = new Map();
        const out = [];
        let mathMode = null; // null | '$' | '$$'

        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];

            if (ch === '$' && !S._isEscapedAt(rawText, i)) {
                const next = raw[i + 1] || '';
                const canUseDouble = (next === '$' && !S._isEscapedAt(rawText, i + 1) && mathMode !== '$');
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

            if (S._isEscapedAt(rawText, i)) {
                out.push(ch);
                continue;
            }

            let replacement = '';
            if (ch === '%' || ch === '&' || ch === '#') {
                replacement = `\\${ch}`;
            } else if (!mathMode && Object.prototype.hasOwnProperty.call(S._RANDOM_EXAM_TEXT_SPECIAL_CHAR_WARNING_FIXES, ch)) {
                replacement = S._RANDOM_EXAM_TEXT_SPECIAL_CHAR_WARNING_FIXES[ch];
            }

            if (!replacement) {
                out.push(ch);
                continue;
            }

            out.push(replacement);
            const key = `${ch}\u0000${replacement}`;
            replacementCounts.set(key, (replacementCounts.get(key) || 0) + 1);
        }

        const replacements = [...replacementCounts.entries()].map(([key, count]) => {
            const sep = key.indexOf('\u0000');
            return {
                char: key.slice(0, sep),
                replacement: key.slice(sep + 1),
                count
            };
        });
        return {
            text: out.join(''),
            replacements
        };
    }

    function diagnoseTextCompileCompatibility(question, index) {
        const errors = [];
        const warnings = [];
        const quickFixes = [];
        const questionLabel = `${index + 1}번 문항`;
        const prefix = `[${questionLabel}] `;

        const textRaw = String(question?.text || '');
        const textCompat = _diagnoseTextLatexCompatibility(textRaw);
        textCompat.errors.forEach(msg => {
            errors.push(S._formatCompatError(prefix, msg));
        });
        textCompat.warnings.forEach(msg => {
            warnings.push(S._formatCompatWarning(prefix, msg));
        });

        const escapedSpecialChars = escapeTextLatexSpecialChars(textRaw);
        const escapedSpecialCharCount = escapedSpecialChars.replacements
            .reduce((sum, item) => sum + (Number(item?.count) || 0), 0);
        if (escapedSpecialCharCount > 0 && escapedSpecialChars.text !== textRaw) {
            quickFixes.push({
                id: `escape_text_special_chars_${index}`,
                action: 'escape_text_special_chars',
                field: 'text',
                count: escapedSpecialCharCount,
                label: `지문 특수문자 ${escapedSpecialCharCount}개 자동 이스케이프`
            });
        }

        const commandModeFindings = _collectLatexCommandModeFindings(textRaw);
        if (commandModeFindings.outsideNotTextOnly.length > 0) {
            const warning = _buildOutsideNotTextOnlyWarning('지문', commandModeFindings.outsideNotTextOnly);
            if (warning) {
                warnings.push(S._formatCompatWarning(prefix, warning));
            }
        }
        if (commandModeFindings.insideNotMathOnly.length > 0) {
            const warning = _buildInsideNotMathOnlyWarning('지문', commandModeFindings.insideNotMathOnly);
            if (warning) warnings.push(S._formatCompatWarning(prefix, warning));
        }
        if (commandModeFindings.mathOnlyOutside.length > 0) {
            const wrappedMathOnly = wrapMathOnlyCommandsOutsideMathInText(textRaw);
            const wrappedMathOnlyCount = wrappedMathOnly.replacements
                .reduce((sum, item) => sum + (Number(item?.count) || 0), 0);
            if (wrappedMathOnlyCount > 0 && wrappedMathOnly.text !== textRaw) {
                quickFixes.push({
                    id: `wrap_math_only_text_commands_${index}`,
                    action: 'wrap_math_only_text_commands',
                    field: 'text',
                    count: wrappedMathOnlyCount,
                    label: `지문 수식 전용 명령 ${wrappedMathOnlyCount}개 수식 구분자 보완`
                });
            }
        }

        const packageDependentCommands = _collectMathCommandPackageFindings(textRaw);
        if (packageDependentCommands.length > 0) {
            const warning = _buildMathCommandPackageWarning('지문', packageDependentCommands);
            if (warning) warnings.push(S._formatCompatWarning(prefix, warning));
        }

        const greekFindingsInText = _collectGreekUnicodeFindings(textRaw);
        if (greekFindingsInText.totalGreekCharCount > 0) {
            const warning = _buildGreekUnicodeWarning('지문', greekFindingsInText);
            if (warning) {
                warnings.push(S._formatCompatWarning(prefix, warning));
            }
            if (greekFindingsInText.mappedCount > 0) {
                quickFixes.push({
                    id: `replace_greek_unicode_text_${index}`,
                    action: 'replace_greek_unicode',
                    field: 'text',
                    count: greekFindingsInText.mappedCount,
                    label: `지문 그리스 문자 ${greekFindingsInText.mappedCount}개 자동치환($...$ 반영)`
                });
            }
        }

        const symbolFindings = _collectMappedUnicodeFindings(textRaw, S._RANDOM_EXAM_TEXT_UNICODE_SYMBOL_MAP);
        if (symbolFindings.totalCount > 0) {
            const warning = _buildUnicodeMathSymbolWarning('지문', symbolFindings);
            if (warning) {
                warnings.push(S._formatCompatWarning(prefix, warning));
            }
            const replaced = replaceTextUnicodeSymbolsWithLatexInText(textRaw);
            if (replaced.text !== textRaw) {
                quickFixes.push({
                    id: `replace_text_unicode_symbols_${index}`,
                    action: 'replace_text_unicode_symbols',
                    field: 'text',
                    count: symbolFindings.totalCount,
                    label: `지문 유니코드 수학기호 ${symbolFindings.totalCount}개 LaTeX 치환`
                });
            }
        }

        const invisibleFindings = _collectInvisibleUnicodeFindings(textRaw);
        if (invisibleFindings.totalCount > 0) {
            const warning = _buildInvisibleUnicodeWarning('지문', invisibleFindings);
            if (warning) {
                warnings.push(S._formatCompatWarning(prefix, warning));
            }
            const normalized = normalizeTextUnicode(textRaw);
            if (normalized.text !== textRaw) {
                quickFixes.push({
                    id: `normalize_text_unicode_${index}`,
                    action: 'normalize_text_unicode',
                    field: 'text',
                    count: invisibleFindings.totalCount,
                    label: `지문 보이지 않는 유니코드 ${invisibleFindings.totalCount}개 정리`
                });
            }
        }

        const emojiFindings = _collectEmojiFindings(textRaw);
        if (emojiFindings.totalCount > 0) {
            const warning = _buildEmojiWarning('지문', emojiFindings);
            if (warning) warnings.push(S._formatCompatWarning(prefix, warning));
        }

        const supSubFindings = _collectUnicodeSupSubFindings(textRaw);
        if (supSubFindings.totalCount > 0) {
            const warning = _buildSupSubWarning('지문', supSubFindings);
            if (warning) warnings.push(S._formatCompatWarning(prefix, warning));
            const replacedSupSub = replaceUnicodeSupSubWithLatexInText(textRaw);
            const replacedSupSubCount = replacedSupSub.replacements
                .reduce((sum, item) => sum + (Number(item?.count) || 0), 0);
            if (replacedSupSubCount > 0 && replacedSupSub.text !== textRaw) {
                quickFixes.push({
                    id: `replace_unicode_supsub_text_${index}`,
                    action: 'replace_unicode_supsub',
                    field: 'text',
                    count: replacedSupSubCount,
                    label: `지문 유니코드 위/아래첨자 ${replacedSupSubCount}개 LaTeX 치환`
                });
            }
        }

        const unhandledUnicodeFindings = _collectUnhandledUnicodeFindings(textRaw);
        if (unhandledUnicodeFindings.totalCount > 0) {
            const warning = _buildUnhandledUnicodeWarning('지문', unhandledUnicodeFindings);
            if (warning) warnings.push(S._formatCompatWarning(prefix, warning));
        }

        return { errors, warnings, quickFixes };
    }

    root.RandomExamCompatText = {
        diagnoseTextCompileCompatibility,
        replaceGreekUnicodeWithLatex,
        replaceGreekUnicodeWithLatexInText,
        replaceTextUnicodeSymbolsWithLatexInText,
        wrapMathOnlyCommandsOutsideMathInText,
        replaceUnicodeSupSubWithLatexInText,
        normalizeTextUnicode,
        escapeTextLatexSpecialChars
    };
})();
