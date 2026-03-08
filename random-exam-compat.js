(() => {
    'use strict';

    const root = (typeof window !== 'undefined') ? window : globalThis;
    const shared = root.RandomExamCompatShared || {};
    const textCompat = root.RandomExamCompatText || {};
    const answerCompat = root.RandomExamCompatAnswer || {};

    const emptyDiag = () => ({ errors: [], warnings: [], quickFixes: [] });
    const hasTextDiag = typeof textCompat.diagnoseTextCompileCompatibility === 'function';
    const hasAnswerDiag = typeof answerCompat.diagnoseAnswerParserCompatibility === 'function';

    function _buildFailClosedDiagnostics(index) {
        const questionIndex = Number.isInteger(Number(index)) ? Number(index) : 0;
        const questionLabel = `${questionIndex + 1}번 문항`;
        const prefix = `[${questionLabel}] `;
        const missingModules = [];
        if (!hasTextDiag) missingModules.push('지문 호환성 모듈');
        if (!hasAnswerDiag) missingModules.push('정답식 호환성 모듈');
        const missingDetail = (missingModules.length > 0) ? missingModules.join(', ') : '알 수 없는 모듈';
        const msg = `호환성 모듈 로드 실패(${missingDetail})로 검사를 중단했습니다. 페이지를 새로고침하고 스크립트 로드를 확인하세요.`;
        const formatted = (typeof shared._formatCompatError === 'function')
            ? shared._formatCompatError(prefix, msg)
            : `${prefix}random-exam-generator 호환성: ${msg}`;
        return { errors: [formatted], warnings: [], quickFixes: [] };
    }

    function diagnoseQuestionCompatibility(question, index, extractVariablesFn) {
        if (!hasTextDiag || !hasAnswerDiag) {
            return _buildFailClosedDiagnostics(index);
        }
        const textDiag = (typeof textCompat.diagnoseTextCompileCompatibility === 'function')
            ? textCompat.diagnoseTextCompileCompatibility(question, index, extractVariablesFn)
            : emptyDiag();
        const answerDiag = (typeof answerCompat.diagnoseAnswerParserCompatibility === 'function')
            ? answerCompat.diagnoseAnswerParserCompatibility(question, index, extractVariablesFn)
            : emptyDiag();
        if (typeof shared._mergeCompatDiagnostics === 'function') {
            return shared._mergeCompatDiagnostics(textDiag, answerDiag);
        }
        return {
            errors: [...(textDiag.errors || []), ...(answerDiag.errors || [])],
            warnings: [...(textDiag.warnings || []), ...(answerDiag.warnings || [])],
            quickFixes: [...(textDiag.quickFixes || []), ...(answerDiag.quickFixes || [])]
        };
    }

    function validateQuestionCompatibility(question, index, extractVariablesFn) {
        return diagnoseQuestionCompatibility(question, index, extractVariablesFn).errors;
    }

    const api = {
        diagnoseTextCompileCompatibility: hasTextDiag ? textCompat.diagnoseTextCompileCompatibility : undefined,
        diagnoseAnswerParserCompatibility: hasAnswerDiag ? answerCompat.diagnoseAnswerParserCompatibility : undefined,
        diagnoseQuestionCompatibility,
        validateQuestionCompatibility,
        replaceGreekUnicodeWithLatex: textCompat.replaceGreekUnicodeWithLatex || ((text) => ({ text: String(text || ''), replacements: [] })),
        replaceGreekUnicodeWithLatexInText: textCompat.replaceGreekUnicodeWithLatexInText || ((text) => ({ text: String(text || ''), replacements: [] })),
        replaceTextUnicodeSymbolsWithLatexInText: textCompat.replaceTextUnicodeSymbolsWithLatexInText || ((text) => ({ text: String(text || ''), replacements: [] })),
        wrapMathOnlyCommandsOutsideMathInText: textCompat.wrapMathOnlyCommandsOutsideMathInText || ((text) => ({ text: String(text || ''), replacements: [] })),
        replaceUnicodeSupSubWithLatexInText: textCompat.replaceUnicodeSupSubWithLatexInText || ((text) => ({ text: String(text || ''), replacements: [] })),
        normalizeTextUnicode: textCompat.normalizeTextUnicode || ((text) => ({ text: String(text || ''), replacements: [] })),
        escapeTextLatexSpecialChars: textCompat.escapeTextLatexSpecialChars || ((text) => ({ text: String(text || ''), replacements: [] })),
        latexToPythonCompat: answerCompat.latexToPythonCompat || ((latex) => String(latex || '')),
        getAnswerSupportedLatexCommands: answerCompat.getAnswerSupportedLatexCommands || (() => []),
        evaluateAnswerToolbarAction: answerCompat.evaluateAnswerToolbarAction || (() => ({ allowed: true, reason: '' })),
        getPdflatexCompatibilityProfile: answerCompat.getPdflatexCompatibilityProfile || (() => ({
            compilerCommand: 'latexmk -pdf -interaction=nonstopmode',
            engine: 'pdflatex',
            documentClass: '\\documentclass[b4paper,twocolumn]{article}',
            mathPackages: { amsmath: false, amssymb: false, amsfonts: false, mathtools: false }
        }))
    };

    if (typeof window !== 'undefined') {
        window.RandomExamCompat = api;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.RandomExamCompat = api;
    }
})();
