import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const APP_JS_PATH = path.resolve(process.cwd(), 'app.js');
const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');
const COMPAT_JS_PATH = path.resolve(process.cwd(), 'random-exam-compat.js');
const COMPAT_SHARED_JS_PATH = path.resolve(process.cwd(), 'compat', 'shared.js');
const COMPAT_TEXT_JS_PATH = path.resolve(process.cwd(), 'compat', 'text.js');
const COMPAT_ANSWER_JS_PATH = path.resolve(process.cwd(), 'compat', 'answer.js');
const compatSource = fs.readFileSync(COMPAT_JS_PATH, 'utf8');
const compatSharedSource = fs.readFileSync(COMPAT_SHARED_JS_PATH, 'utf8');
const compatTextSource = fs.readFileSync(COMPAT_TEXT_JS_PATH, 'utf8');
const compatAnswerSource = fs.readFileSync(COMPAT_ANSWER_JS_PATH, 'utf8');

function extractFunctionDeclaration(source, fnName) {
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Cannot find function: ${fnName}`);

  const bodyStart = source.indexOf('{', start);
  if (bodyStart < 0) throw new Error(`Cannot find body start: ${fnName}`);

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inRegex = false;
  let inRegexClass = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;
  let lastSignificant = '';
  const canStartRegex = (prev) => !prev || '({[=,:;!&|?+-*%^~<>'.includes(prev);
  let end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (escape) {
      escape = false;
      continue;
    }

    if (inSingle) {
      if (ch === '\\') escape = true;
      else if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') escape = true;
      else if (ch === '`') inTemplate = false;
      continue;
    }
    if (inRegex) {
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (inRegexClass) {
        if (ch === ']') inRegexClass = false;
        continue;
      }
      if (ch === '[') {
        inRegexClass = true;
        continue;
      }
      if (ch === '/') {
        inRegex = false;
        lastSignificant = '/';
      }
      continue;
    }

    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }

    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inTemplate = true; continue; }
    if (ch === '/' && canStartRegex(lastSignificant)) { inRegex = true; continue; }

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }

    if (!/\s/.test(ch)) lastSignificant = ch;
  }
  if (end < 0) throw new Error(`Cannot find body end: ${fnName}`);
  return source.slice(start, end);
}

function extractConstStatement(source, constName) {
  const signature = `const ${constName} =`;
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Cannot find const: ${constName}`);

  let i = start + signature.length;
  let brace = 0;
  let bracket = 0;
  let paren = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inRegex = false;
  let inRegexClass = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;
  let lastSignificant = '';
  const canStartRegex = (prev) => !prev || '({[=,:;!&|?+-*%^~<>'.includes(prev);

  for (; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (escape) {
      escape = false;
      continue;
    }

    if (inSingle) {
      if (ch === '\\') escape = true;
      else if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') escape = true;
      else if (ch === '`') inTemplate = false;
      continue;
    }
    if (inRegex) {
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (inRegexClass) {
        if (ch === ']') inRegexClass = false;
        continue;
      }
      if (ch === '[') {
        inRegexClass = true;
        continue;
      }
      if (ch === '/') {
        inRegex = false;
        lastSignificant = '/';
      }
      continue;
    }

    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }

    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inTemplate = true; continue; }
    if (ch === '/' && canStartRegex(lastSignificant)) { inRegex = true; continue; }

    if (ch === '{') brace++;
    else if (ch === '}') brace--;
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === ';' && brace === 0 && bracket === 0 && paren === 0) {
      return source.slice(start, i + 1);
    }

    if (!/\s/.test(ch)) lastSignificant = ch;
  }
  throw new Error(`Cannot find const end: ${constName}`);
}

function extractBetween(source, startSignature, endSignature) {
  const start = source.indexOf(startSignature);
  if (start < 0) throw new Error(`Cannot find start signature: ${startSignature}`);
  const end = source.indexOf(endSignature, start + startSignature.length);
  if (end < 0) throw new Error(`Cannot find end signature: ${endSignature}`);
  return source.slice(start, end).trimEnd();
}

function runSnippets(snippets, exportsExpr, sandbox = {}) {
  vm.createContext(sandbox);
  const script = new vm.Script(`${snippets.join('\n\n')}\n(${exportsExpr});`);
  return script.runInContext(sandbox);
}

function loadVariableFns() {
  return runSnippets(
    [
      extractConstStatement(appSource, 'extractVariables'),
      extractConstStatement(appSource, 'getDecimalPlaces'),
    ],
    '{ extractVariables, getDecimalPlaces }'
  );
}

function loadTextPreviewFns() {
  return runSnippets(
    [
      extractFunctionDeclaration(appSource, '_escapeHtml'),
      extractConstStatement(appSource, 'normalizeLatexTextForPreview'),
      extractConstStatement(appSource, 'highlightVarsInKatex'),
    ],
    '{ normalizeLatexTextForPreview, highlightVarsInKatex }'
  );
}

function loadLatexFns() {
  const sandbox = {
    math: {
      parse(expr) {
        if (!expr || typeof expr !== 'string') throw new Error('invalid expr');
      },
    },
  };

  return runSnippets(
    [
      extractConstStatement(appSource, '_LATEX_FUNC_MAP'),
      extractBetween(appSource, 'function _readGroup(', 'function _readParenGroup('),
      extractBetween(appSource, 'function _readParenGroup(', 'function _readAtom('),
      extractBetween(appSource, 'function _readAtom(', 'function _latexToMathjsCore('),
      extractBetween(appSource, 'function _latexToMathjsCore(', 'function _tokenizeExpr('),
      extractBetween(appSource, 'function _tokenizeExpr(', 'function _insertImplicitMultiplication('),
      extractBetween(appSource, 'function _insertImplicitMultiplication(', 'function latexToMathjs('),
      extractFunctionDeclaration(appSource, 'latexToMathjs'),
    ],
    '{ latexToMathjs }',
    sandbox
  );
}

function loadValidateQuestionFn({ unknownSymbolsInAnswer, questions, randomExamCompat } = {}) {
  const compatApi = loadRandomExamCompatFns();
  const sandbox = {
    unknownSymbolsInAnswer: unknownSymbolsInAnswer ?? (() => ({ unknown: [] })),
    state: { questions: questions ?? [] },
    window: {
      RandomExamCompat: {
        validateQuestionCompatibility:
          randomExamCompat ?? ((question, index, extractVariables) => compatApi.validateQuestionCompatibility(question, index, extractVariables)),
      },
    },
  };

  return runSnippets(
    [
      extractConstStatement(appSource, 'normalizeQuestionId'),
      extractConstStatement(appSource, 'normalizeQuestionPoints'),
      extractConstStatement(appSource, 'extractVariables'),
      extractConstStatement(appSource, 'getDecimalPlaces'),
      extractConstStatement(appSource, '_getRandomExamCompatHost'),
      extractConstStatement(appSource, '_getRandomExamCompatApi'),
      extractConstStatement(appSource, '_getRandomExamCompatCache'),
      extractConstStatement(appSource, '_buildRandomExamCompatCacheKey'),
      extractConstStatement(appSource, '_getRandomExamCompatCacheSlot'),
      extractConstStatement(appSource, '_normalizeRandomExamCompatDiagnostics'),
      extractConstStatement(appSource, '_buildRandomExamCompatRuntimeErrorMessage'),
      extractConstStatement(appSource, '_buildRandomExamCompatRuntimeDiag'),
      extractConstStatement(appSource, '_computeRandomExamCompatibilityDiagnostics'),
      extractConstStatement(appSource, 'getRandomExamCompatibilityDiagnostics'),
      extractConstStatement(appSource, 'validateRandomExamCompatibility'),
      extractConstStatement(appSource, 'getDuplicateIdIndexes'),
      extractConstStatement(appSource, 'validateQuestion'),
    ],
    '{ validateQuestion }',
    sandbox
  );
}

function loadValidationCacheFns({ unknownSymbolsInAnswer, questions, randomExamCompat } = {}) {
  const compatApi = loadRandomExamCompatFns();
  const sandbox = {
    unknownSymbolsInAnswer: unknownSymbolsInAnswer ?? (() => ({ unknown: [] })),
    state: { questions: questions ?? [] },
    window: {
      RandomExamCompat: {
        validateQuestionCompatibility:
          randomExamCompat ?? ((question, index, extractVariables) => compatApi.validateQuestionCompatibility(question, index, extractVariables)),
      },
    },
  };

  return runSnippets(
    [
      extractConstStatement(appSource, 'normalizeQuestionId'),
      extractConstStatement(appSource, 'normalizeQuestionPoints'),
      extractConstStatement(appSource, 'extractVariables'),
      extractConstStatement(appSource, 'getDecimalPlaces'),
      extractConstStatement(appSource, '_getRandomExamCompatHost'),
      extractConstStatement(appSource, '_getRandomExamCompatApi'),
      extractConstStatement(appSource, '_getRandomExamCompatCache'),
      extractConstStatement(appSource, '_buildRandomExamCompatCacheKey'),
      extractConstStatement(appSource, '_getRandomExamCompatCacheSlot'),
      extractConstStatement(appSource, '_normalizeRandomExamCompatDiagnostics'),
      extractConstStatement(appSource, '_buildRandomExamCompatRuntimeErrorMessage'),
      extractConstStatement(appSource, '_buildRandomExamCompatRuntimeDiag'),
      extractConstStatement(appSource, '_computeRandomExamCompatibilityDiagnostics'),
      extractConstStatement(appSource, 'getRandomExamCompatibilityDiagnostics'),
      extractConstStatement(appSource, 'validateRandomExamCompatibility'),
      extractConstStatement(appSource, 'getDuplicateIdIndexes'),
      extractConstStatement(appSource, '_validationCache'),
      extractConstStatement(appSource, '_getQuestionHash'),
      extractConstStatement(appSource, 'validateQuestion'),
      extractConstStatement(appSource, 'validateQuestionCached'),
    ],
    '{ _validationCache, _getQuestionHash, validateQuestionCached }',
    sandbox
  );
}

function loadGetRandomExamCompatibilityDiagnosticsFn({ randomExamCompat } = {}) {
  const compatApi = randomExamCompat ?? loadRandomExamCompatFns();
  const sandbox = {
    window: { RandomExamCompat: compatApi },
    globalThis: {},
  };

  return runSnippets(
    [
      extractConstStatement(appSource, 'extractVariables'),
      extractConstStatement(appSource, '_getRandomExamCompatHost'),
      extractConstStatement(appSource, '_getRandomExamCompatApi'),
      extractConstStatement(appSource, '_getRandomExamCompatCache'),
      extractConstStatement(appSource, '_buildRandomExamCompatCacheKey'),
      extractConstStatement(appSource, '_getRandomExamCompatCacheSlot'),
      extractConstStatement(appSource, '_normalizeRandomExamCompatDiagnostics'),
      extractConstStatement(appSource, '_buildRandomExamCompatRuntimeErrorMessage'),
      extractConstStatement(appSource, '_buildRandomExamCompatRuntimeDiag'),
      extractConstStatement(appSource, '_computeRandomExamCompatibilityDiagnostics'),
      extractConstStatement(appSource, 'getRandomExamCompatibilityDiagnostics'),
    ],
    '{ getRandomExamCompatibilityDiagnostics }',
    sandbox
  );
}

function loadGetRandomExamCompatibilityDiagnosticsRuntime({ randomExamCompat } = {}) {
  const compatApi = randomExamCompat ?? loadRandomExamCompatFns();
  const sandbox = {
    window: { RandomExamCompat: compatApi },
    globalThis: {},
  };

  const exported = runSnippets(
    [
      extractConstStatement(appSource, 'extractVariables'),
      extractConstStatement(appSource, '_getRandomExamCompatHost'),
      extractConstStatement(appSource, '_getRandomExamCompatApi'),
      extractConstStatement(appSource, '_getRandomExamCompatCache'),
      extractConstStatement(appSource, '_buildRandomExamCompatCacheKey'),
      extractConstStatement(appSource, '_getRandomExamCompatCacheSlot'),
      extractConstStatement(appSource, '_normalizeRandomExamCompatDiagnostics'),
      extractConstStatement(appSource, '_buildRandomExamCompatRuntimeErrorMessage'),
      extractConstStatement(appSource, '_buildRandomExamCompatRuntimeDiag'),
      extractConstStatement(appSource, '_computeRandomExamCompatibilityDiagnostics'),
      extractConstStatement(appSource, 'getRandomExamCompatibilityDiagnostics'),
    ],
    '{ getRandomExamCompatibilityDiagnostics }',
    sandbox
  );

  return { ...exported, sandbox };
}

function loadRandomExamCompatFns() {
  const sandbox = { window: {}, globalThis: {} };
  vm.createContext(sandbox);
  new vm.Script(compatSharedSource).runInContext(sandbox);
  new vm.Script(compatTextSource).runInContext(sandbox);
  new vm.Script(compatAnswerSource).runInContext(sandbox);
  new vm.Script(compatSource).runInContext(sandbox);
  const api = sandbox.window.RandomExamCompat || sandbox.globalThis.RandomExamCompat;
  if (!api) throw new Error('RandomExamCompat API not found');
  return api;
}

function loadRandomExamCompatFnsWithMissingModules({ missingText = false, missingAnswer = false } = {}) {
  const sandbox = { window: {}, globalThis: {} };
  vm.createContext(sandbox);
  new vm.Script(compatSharedSource).runInContext(sandbox);
  if (!missingText) new vm.Script(compatTextSource).runInContext(sandbox);
  if (!missingAnswer) new vm.Script(compatAnswerSource).runInContext(sandbox);
  new vm.Script(compatSource).runInContext(sandbox);
  const api = sandbox.window.RandomExamCompat || sandbox.globalThis.RandomExamCompat;
  if (!api) throw new Error('RandomExamCompat API not found');
  return api;
}

function loadRandomExamCompatFnsWithMathPackages(mathPackages = {}) {
  const sandbox = { window: {}, globalThis: {} };
  vm.createContext(sandbox);
  new vm.Script(compatSharedSource).runInContext(sandbox);

  const shared = sandbox.window.RandomExamCompatShared || sandbox.globalThis.RandomExamCompatShared;
  const overrides = (mathPackages && typeof mathPackages === 'object') ? mathPackages : {};
  if (shared && typeof shared === 'object') {
    const baseProfile = (shared._RANDOM_EXAM_PDFLATEX_PROFILE && typeof shared._RANDOM_EXAM_PDFLATEX_PROFILE === 'object')
      ? shared._RANDOM_EXAM_PDFLATEX_PROFILE
      : {};
    const baseMath = (baseProfile.mathPackages && typeof baseProfile.mathPackages === 'object')
      ? baseProfile.mathPackages
      : {};
    const mergedProfile = {
      ...baseProfile,
      mathPackages: {
        ...baseMath,
        ...overrides,
      },
    };
    shared._RANDOM_EXAM_PDFLATEX_PROFILE = mergedProfile;

    if (typeof shared._getMissingMathPackagesForCommand === 'function') {
      const originalGetMissing = shared._getMissingMathPackagesForCommand;
      shared._getMissingMathPackagesForCommand = (cmd, profile) => {
        if (profile && typeof profile === 'object') {
          return originalGetMissing(cmd, profile);
        }
        return originalGetMissing(cmd, mergedProfile);
      };
    }
  }

  new vm.Script(compatTextSource).runInContext(sandbox);
  new vm.Script(compatAnswerSource).runInContext(sandbox);
  new vm.Script(compatSource).runInContext(sandbox);
  const api = sandbox.window.RandomExamCompat || sandbox.globalThis.RandomExamCompat;
  if (!api) throw new Error('RandomExamCompat API not found');
  return api;
}

function loadMinMaxFns() {
  return runSnippets(
    [
      extractFunctionDeclaration(appSource, '_mulberry32'),
      extractFunctionDeclaration(appSource, 'evaluateMinMaxApprox'),
    ],
    '{ evaluateMinMaxApprox }'
  );
}

function loadIdNormalizationFns() {
  return runSnippets(
    [
      extractConstStatement(appSource, 'normalizeQuestionId'),
      extractConstStatement(appSource, 'normalizeQuestionPoints'),
      extractConstStatement(appSource, 'coerceQuestionPointsInput'),
      extractConstStatement(appSource, 'normalizeQuestionVariables'),
      extractConstStatement(appSource, 'sanitizeQuestionForExport'),
    ],
    '{ normalizeQuestionId, normalizeQuestionPoints, coerceQuestionPointsInput, normalizeQuestionVariables, sanitizeQuestionForExport }'
  );
}

function loadAutoSaveKeyFns(questions) {
  const sandbox = { state: { questions } };
  return runSnippets(
    [
      extractConstStatement(appSource, '_hashString'),
      extractConstStatement(appSource, '_questionImageHashCache'),
      extractConstStatement(appSource, '_getCachedQuestionImageHash'),
      extractConstStatement(appSource, '_buildImageSnapshotKey'),
    ],
    '{ _hashString, _buildImageSnapshotKey, state }',
    sandbox
  );
}

function loadAutoSaveMetaSignatureFns() {
  return runSnippets(
    [
      extractConstStatement(appSource, '_hashString'),
      extractConstStatement(appSource, '_buildAutoSaveMetaSignature'),
    ],
    '{ _buildAutoSaveMetaSignature }'
  );
}

function loadAutoSaveDecisionFns() {
  return runSnippets(
    [
      extractConstStatement(appSource, '_shouldSkipImageAutoSave'),
    ],
    '{ _shouldSkipImageAutoSave }'
  );
}

function loadRestoreIndexFns() {
  return runSnippets(
    [
      extractConstStatement(appSource, '_sanitizeRestoredCurrentIndex'),
    ],
    '{ _sanitizeRestoredCurrentIndex }'
  );
}

function loadImagePresenceFns(questions) {
  const sandbox = { state: { questions } };
  return runSnippets(
    [
      extractConstStatement(appSource, '_hasAnyImageData'),
    ],
    '{ _hasAnyImageData, state }',
    sandbox
  );
}

function loadTreeLabelFns() {
  return runSnippets(
    [
      extractConstStatement(appSource, 'formatQuestionTreeLabel'),
      extractConstStatement(appSource, '_buildGlobalValidationHint'),
    ],
    '{ formatQuestionTreeLabel, _buildGlobalValidationHint }'
  );
}

function runValidationUiScenario({
  currentErrors = [],
  initialInvalidIndexes = [],
  currentIndex = 0,
  questionCount = 2,
  compatDiagnostics = { errors: [], warnings: [], quickFixes: [] },
} = {}) {
  const classSet = new Set(['hidden']);
  const warningClassSet = new Set(['hidden']);
  const rendered = [];
  const renderedWarnings = [];
  const state = {
    currentIndex,
    questions: Array.from({ length: questionCount }, (_, i) => ({ id: `Q${i + 1}` })),
  };
  const invalidIndexes = new Set(initialInvalidIndexes);
  const collectTexts = (node) => {
    if (!node) return;
    if (typeof node.textContent === 'string' && node.textContent) rendered.push(node.textContent);
    const children = node?.children ?? [];
    children.forEach((child) => collectTexts(child));
  };
  const collectWarningTexts = (node) => {
    if (!node) return;
    if (typeof node.textContent === 'string' && node.textContent) renderedWarnings.push(node.textContent);
    const children = node?.children ?? [];
    children.forEach((child) => collectWarningTexts(child));
  };

  const classList = {
    add(name) { classSet.add(name); },
    remove(name) { classSet.delete(name); },
    contains(name) { return classSet.has(name); },
  };
  const warningClassList = {
    add(name) { warningClassSet.add(name); },
    remove(name) { warningClassSet.delete(name); },
    contains(name) { return warningClassSet.has(name); },
  };

  const dom = {
    validationErrors: {
      classList,
      replaceChildren(...nodes) {
        rendered.length = 0;
        nodes.forEach((node) => {
          collectTexts(node);
        });
      },
      appendChild(node) {
        collectTexts(node);
      },
      addEventListener() {},
      querySelector() { return null; },
      contains() { return true; },
      focus() {},
      dataset: {},
    },
    validationWarnings: {
      classList: warningClassList,
      replaceChildren(...nodes) {
        renderedWarnings.length = 0;
        nodes.forEach((node) => {
          collectWarningTexts(node);
        });
      },
      appendChild(node) {
        collectWarningTexts(node);
      },
      addEventListener() {},
      querySelector() { return null; },
      contains() { return true; },
      focus() {},
      dataset: {},
    },
    saveBtn: { disabled: false },
  };

  const sandbox = {
    document: {
      createDocumentFragment() {
        return {
          children: [],
          appendChild(node) { this.children.push(node); },
        };
      },
      createElement() {
        const classSet = new Set();
        return {
          textContent: '',
          className: '',
          type: 'div',
          dataset: {},
          disabled: false,
          classList: {
            add(...names) { names.forEach((n) => classSet.add(String(n))); },
            remove(...names) { names.forEach((n) => classSet.delete(String(n))); },
            contains(name) { return classSet.has(String(name)); },
          },
          children: [],
          appendChild(node) { this.children.push(node); },
        };
      },
    },
    dom,
    state,
    getRandomExamCompatibilityDiagnostics: () => compatDiagnostics,
    normalizeQuestionId: (id) => String(id ?? '').trim(),
    _invalidQuestionIndexes: invalidIndexes,
    _isValidationIndexDirty: false,
    getCurrentQuestion: () => state.questions[state.currentIndex],
    validateQuestionCached: () => currentErrors,
    _rebuildInvalidQuestionIndexes: () => {},
    _syncInvalidQuestionForIndex: (index) => {
      const idx = Number(index);
      if (currentErrors.length > 0) invalidIndexes.add(idx);
      else invalidIndexes.delete(idx);
    },
  };

  const { updateJsonAndValidation } = runSnippets(
    [
      extractConstStatement(appSource, '_compatQuickFixById'),
      extractConstStatement(appSource, '_globalWarningQuestionIndexes'),
      extractConstStatement(appSource, '_globalErrorQuestionIndexes'),
      extractConstStatement(appSource, '_syncGlobalWarningQuestionIndexes'),
      extractConstStatement(appSource, '_syncGlobalErrorQuestionIndexes'),
      extractConstStatement(appSource, '_resolveWarningNavTarget'),
      extractConstStatement(appSource, '_resolveErrorNavTarget'),
      extractConstStatement(appSource, '_createWarningNavControls'),
      extractConstStatement(appSource, '_createErrorNavControls'),
      extractConstStatement(appSource, '_setValidationErrorTheme'),
      extractConstStatement(appSource, '_setValidationWarningTheme'),
      extractConstStatement(appSource, '_clearValidationQuickFixes'),
      extractConstStatement(appSource, '_clearDeferredWarningPanel'),
      extractConstStatement(appSource, '_renderDeferredWarningPanel'),
      extractConstStatement(appSource, '_toCurrentPanelMessage'),
      extractConstStatement(appSource, 'renderValidationErrors'),
      extractConstStatement(appSource, 'renderValidationWarnings'),
      extractConstStatement(appSource, '_formatQuestionRef'),
      extractConstStatement(appSource, '_buildGlobalValidationHint'),
      extractConstStatement(appSource, 'renderGlobalValidationHint'),
      extractConstStatement(appSource, 'renderGlobalWarningHint'),
      extractConstStatement(appSource, 'collectGlobalCompatibilityWarnings'),
      extractConstStatement(appSource, 'updateJsonAndValidation'),
    ],
    '{ updateJsonAndValidation }',
    sandbox
  );

  updateJsonAndValidation();
  return {
    saveDisabled: dom.saveBtn.disabled,
    isHidden: classList.contains('hidden'),
    warningHidden: warningClassSet.has('hidden'),
    rendered,
    renderedWarnings,
  };
}

async function runRestoreFromLocalStorageScenario({
  scopedRaw = null,
  legacyRaw = null,
  restoreImagesResult = true,
  hasImagesAfterRestore = true,
  migrateStatus = 'saved',
  runSaveAfterRestore = false,
} = {}) {
  const store = new Map();
  if (scopedRaw !== null) store.set('scoped-key', scopedRaw);
  if (legacyRaw !== null) store.set('legacy-key', legacyRaw);

  const calls = {
    restoreImages: [],
    saveImages: [],
    deleteSnapshot: [],
  };

  const state = { questions: [], currentIndex: 0 };

  const sandbox = {
    AUTO_SAVE_KEY: 'scoped-key',
    LEGACY_AUTO_SAVE_KEY: 'legacy-key',
    AUTO_SAVE_IMAGE_DB: 'scoped-db',
    LEGACY_AUTO_SAVE_IMAGE_DB: 'legacy-db',
    NO_IMAGE_SNAPSHOT_MARKER: '__NO_IMAGES__',
    state,
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
    },
    _sanitizeRestoredCurrentIndex: () => 0,
    _resetValidationState: () => {},
    _restoreImagesFromIndexedDb: async (raw, dbName) => {
      calls.restoreImages.push({ raw, dbName });
      return restoreImagesResult;
    },
    _hasAnyImageData: () => hasImagesAfterRestore,
    _buildImageSnapshotKey: () => 'snapshot-key',
    _buildAutoSaveMetaSignature: () => 'meta-signature',
    _saveImagesToIndexedDb: async (raw, snapshotKey, options) => {
      calls.saveImages.push({ raw, snapshotKey, options: options || null });
      return migrateStatus;
    },
    _scheduleImageAutoSave: (payload) => {
      calls.scheduleImageAutoSave = payload;
    },
    _deleteImageSnapshotFromIndexedDb: async (dbName) => {
      calls.deleteSnapshot.push(dbName);
      return 'saved';
    },
    normalizeQuestionId: (id) => String(id ?? '').trim(),
    _forceLegacyAutoSave: false,
    _lastSavedImageSnapshotKey: '',
    _lastSavedImageMetaSignature: '',
    _pendingImageSnapshotKey: 'pending',
    _pendingImageMetaSignature: 'pending-meta',
  };

  const { restoreFromLocalStorage, saveToLocalStorage } = runSnippets(
    [
      extractConstStatement(appSource, '_getCurrentAutoSaveKey'),
      extractConstStatement(appSource, '_buildAutoSaveMeta'),
      extractConstStatement(appSource, 'normalizeQuestionPoints'),
      extractConstStatement(appSource, 'coerceQuestionPointsInput'),
      extractConstStatement(appSource, 'normalizeQuestionVariables'),
      extractConstStatement(appSource, 'saveToLocalStorage'),
      extractConstStatement(appSource, 'restoreFromLocalStorage'),
    ],
    '{ restoreFromLocalStorage, saveToLocalStorage }',
    sandbox
  );

  const restored = await restoreFromLocalStorage();
  if (runSaveAfterRestore) {
    saveToLocalStorage();
  }
  return {
    restored,
    state,
    store,
    calls,
    sandbox,
  };
}

test('extractVariables: dedupe + sort + format enforcement', () => {
  const { extractVariables } = loadVariableFns();
  const vars = Array.from(extractVariables('문장 *x* + *y1* + *x*', '*_ok* 는 허용, *9bad* 는 미허용'));
  assert.deepEqual(vars, ['_ok', 'x', 'y1']);
});

test('getDecimalPlaces: handles integer, decimal, trimmed string', () => {
  const { getDecimalPlaces } = loadVariableFns();
  assert.equal(getDecimalPlaces('10'), 0);
  assert.equal(getDecimalPlaces('10.25'), 2);
  assert.equal(getDecimalPlaces('  7.000  '), 3);
});

test('text preview normalization decodes escaped specials outside math only', () => {
  const { normalizeLatexTextForPreview } = loadTextPreviewFns();
  const raw = '효율 \\% , 기호 \\_ \\^{} \\~{} , 수식 $x\\% + y_{1}$ , 명령 \\alpha';
  const normalized = normalizeLatexTextForPreview(raw);
  assert.equal(normalized, '효율 % , 기호 _ ^ ~ , 수식 $x\\% + y_{1}$ , 명령 \\alpha');
});

test('highlightVarsInKatex uses normalized text for preview output', () => {
  const { highlightVarsInKatex } = loadTextPreviewFns();
  const html = highlightVarsInKatex('A\\_B, 값은 $*a*$');
  assert.ok(html.includes('A_B'));
  assert.equal(html.includes('A\\_B'), false);
  assert.ok(html.includes('{\\color{#2563EB}\\mathbf{a}}'));
});

test('highlightVarsInKatex renders common text-mode layout/style commands outside math', () => {
  const { highlightVarsInKatex } = loadTextPreviewFns();
  const html = highlightVarsInKatex('첫째\\\\둘째 \\textbf{굵게} \\textit{기울임} \\underline{밑줄}');
  assert.ok(html.includes('첫째<br>둘째'));
  assert.ok(html.includes('<strong>굵게</strong>'));
  assert.ok(html.includes('<em>기울임</em>'));
  assert.ok(html.includes('<span class="underline">밑줄</span>'));
});

test('highlightVarsInKatex follows LaTeX newline semantics in text mode', () => {
  const { highlightVarsInKatex } = loadTextPreviewFns();
  const html = highlightVarsInKatex('첫줄\n둘째줄\n\n셋째줄');
  assert.ok(html.includes('첫줄 둘째줄<br><br>셋째줄'));
  assert.equal(html.includes('첫줄<br>둘째줄'), false);
});

test('validateQuestion: reports text-variable mismatch', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a* 와 *b*',
    answer: 'a+b',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({ questions: [question] });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('지문 변수(*var*)와 변수 정보 목록이 일치하지 않습니다.')));
});

test('validateQuestion: reports decimal place mismatch', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a',
    variables: [{ name: 'a', min: '1.0', max: '2.00' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({ questions: [question] });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('소수점 자릿수가 다릅니다')));
});

test('validateQuestion: reports undefined identifiers via random-exam parser compatibility', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a+c',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({ questions: [question] });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('정의되지 않은 식별자') && e.includes('c')));
});

test('validateQuestion: reports duplicate ID (case-sensitive)', () => {
  const q1 = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const q2 = {
    id: 'Q1',
    text: '값은 *b*',
    answer: 'b',
    variables: [{ name: 'b', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({ questions: [q1, q2] });
  const errs = validateQuestion(q1, 0);
  assert.ok(errs.some((e) => e.includes('동일한 ID') && e.includes('2번 문항')));
});

test('validateQuestion: Q1 and q1 are treated as different IDs', () => {
  const q1 = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const q2 = {
    id: 'q1',
    text: '값은 *b*',
    answer: 'b',
    variables: [{ name: 'b', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({ questions: [q1, q2] });
  const errs = validateQuestion(q1, 0);
  assert.ok(!errs.some((e) => e.includes('동일한 ID')));
});

test('normalizeQuestionId/sanitizeQuestionForExport: trim ID on export', () => {
  const { normalizeQuestionId, normalizeQuestionPoints, sanitizeQuestionForExport } = loadIdNormalizationFns();
  assert.equal(normalizeQuestionId('  Q1  '), 'Q1');
  assert.equal(normalizeQuestionPoints(' 5 '), '5');
  assert.equal(normalizeQuestionPoints({ bad: true }), '');
  const out = sanitizeQuestionForExport({
    id: '  Q1  ',
    title: 't',
    text: 'x',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
    points: '5'
  });
  assert.equal(out.id, 'Q1');
  assert.equal(out.points, 5);
});

test('normalizeQuestionPoints rejects negative or non-integer values', () => {
  const { normalizeQuestionPoints, coerceQuestionPointsInput } = loadIdNormalizationFns();
  assert.equal(normalizeQuestionPoints('-1'), '');
  assert.equal(normalizeQuestionPoints('1.5'), '');
  assert.equal(normalizeQuestionPoints(-3), '');
  assert.equal(normalizeQuestionPoints(2.25), '');
  assert.equal(normalizeQuestionPoints('01'), '1');
  assert.equal(normalizeQuestionPoints('1.0'), '1');
  assert.equal(coerceQuestionPointsInput('-1'), '-1');
  assert.equal(coerceQuestionPointsInput('1.5'), '1.5');
  assert.equal(coerceQuestionPointsInput('01'), '1');
});

test('sanitizeQuestionForExport drops malformed points', () => {
  const { sanitizeQuestionForExport } = loadIdNormalizationFns();
  const out = sanitizeQuestionForExport({
    id: 'Q1',
    title: 't',
    text: 'x',
    answer: 'a',
    variables: [],
    points: { bad: true }
  });
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'points'), false);
});

test('sanitizeQuestionForExport preserves repeated variable names', () => {
  const { sanitizeQuestionForExport } = loadIdNormalizationFns();
  const out = sanitizeQuestionForExport({
    id: 'Q1',
    title: 't',
    text: '*a*',
    answer: 'a',
    variables: [
      { name: 'a', min: '1', max: '2' },
      { name: 'a', min: '3', max: '4' },
      { name: '', min: '', max: '' },
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(out.variables)), [
    { name: 'a', min: '1', max: '2' },
    { name: 'a', min: '3', max: '4' },
    { name: '', min: '', max: '' },
  ]);
});

test('validateQuestion: reports invalid points input', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a',
    points: '-1',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({ questions: [question] });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('배점은 0 이상의 정수만 입력하세요.')));
});

test('validateQuestion: treats whitespace-only text and answer as missing', () => {
  const question = {
    id: 'Q1',
    text: '   \n\t  ',
    answer: '   ',
    variables: [],
  };
  const { validateQuestion } = loadValidateQuestionFn({ questions: [question] });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('지문을 입력하세요.')));
  assert.ok(errs.some((e) => e.includes('정답식을 입력하세요.')));
});

test('validateQuestionCached invalidates cached result when points change', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a',
    points: '1',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestionCached, _getQuestionHash } = loadValidationCacheFns({ questions: [question] });

  const initialHash = _getQuestionHash(question);
  const initialErrs = validateQuestionCached(question, 0);
  question.points = '1.5';
  const changedHash = _getQuestionHash(question);
  const changedErrs = validateQuestionCached(question, 0);
  question.points = '2';
  const recoveredErrs = validateQuestionCached(question, 0);

  assert.notEqual(initialHash, changedHash);
  assert.ok(!initialErrs.some((e) => e.includes('배점은 0 이상의 정수만 입력하세요.')));
  assert.ok(changedErrs.some((e) => e.includes('배점은 0 이상의 정수만 입력하세요.')));
  assert.ok(!recoveredErrs.some((e) => e.includes('배점은 0 이상의 정수만 입력하세요.')));
});

test('validateQuestion: reports duplicate variable names', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a',
    variables: [
      { name: 'a', min: '1', max: '2' },
      { name: 'a', min: '3', max: '4' },
    ],
  };
  const { validateQuestion } = loadValidateQuestionFn({ questions: [question] });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('변수 정보 목록에 중복된 이름')));
});

test('random-exam compat parser keeps parser-compatible replacements', () => {
  const { latexToPythonCompat } = loadRandomExamCompatFns();
  const expr = latexToPythonCompat('\\sinh(x)+\\log(x)+\\frac{a}{b}');
  assert.equal(expr.includes('math.sinh(x)'), true);
  assert.equal(expr.includes('math.log10(x)'), true);
  assert.equal(expr.includes('((a)/(b))'), true);
});

test('validateQuestion: reports random-exam-generator implicit multiplication incompatibility', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: '2a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('random-exam-generator 호환성') && e.includes('곱셈 기호')));
});

test('validateQuestion: reports random-exam-generator variable naming incompatibility', () => {
  const question = {
    id: 'Q1',
    text: '값은 *v_0*',
    answer: 'v_0',
    variables: [{ name: 'v_0', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('호환 변수명') && e.includes('v_0')));
});

test('validateQuestion: reports random-exam-generator unsupported log base syntax', () => {
  const question = {
    id: 'Q1',
    text: '값은 *x*',
    answer: '\\log_{2}(x)',
    variables: [{ name: 'x', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('random-exam-generator 호환성')));
  assert.ok(errs.some((e) => e.includes('\\ln(x)만 사용')));
});

test('validateQuestion: reports random-exam-generator unsupported plain log syntax', () => {
  const question = {
    id: 'Q1',
    text: '값은 *x*',
    answer: '\\log(x)',
    variables: [{ name: 'x', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('random-exam-generator 호환성')));
  assert.ok(errs.some((e) => e.includes('\\ln(x)만 사용')));
});

test('validateQuestion: reports text-style LaTeX command in answer with actionable message', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: '\\underline{a}',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('\\underline') && e.includes('텍스트/서식 명령')));
});

test('validateQuestion: overline in answer uses text-style command guidance consistently', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: '\\overline{a}',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('\\overline') && e.includes('텍스트/서식 명령')));
});

test('validateQuestion: reports multiplication command guidance in answer', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a* 와 *b*',
    answer: 'a\\times b',
    variables: [
      { name: 'a', min: '1', max: '2' },
      { name: 'b', min: '1', max: '2' },
    ],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('\\times') && e.includes('*')));
});

test('validateQuestion: reports unsupported trigonometric functions clearly', () => {
  const question = {
    id: 'Q1',
    text: '값은 *x*',
    answer: '\\sec(x)',
    variables: [{ name: 'x', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('\\sec') && e.includes('지원되지 않습니다')));
});

test('validateQuestion: keeps user-entered single backslash in unsupported command message', () => {
  const question = {
    id: 'Q1',
    text: '값은 *x*',
    answer: '\\co(x)',
    variables: [{ name: 'x', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  const cmdErr = errs.find((e) => e.includes('지원하지 않는 LaTeX 명령') && e.includes('\\co'));
  assert.ok(cmdErr);
  assert.equal(cmdErr.includes('\\\\co'), false);
});

test('validateQuestion: reports random-exam-generator function parentheses guidance', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: '\\sqrt{9.8*a}*\\arctan a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('함수') && e.includes('\\arctan(x)')));
});

test('validateQuestion: reports random-exam-generator missing function argument for bare function symbol', () => {
  const question = {
    id: 'Q1',
    text: '값은 *x*',
    answer: '\\sin',
    variables: [{ name: 'x', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('함수 인자는 괄호로 감싸야 합니다') && e.includes('\\sin(x)')));
});

test('validateQuestion: reports random-exam-generator empty function argument', () => {
  const question = {
    id: 'Q1',
    text: '값은 *x*',
    answer: '\\sin()',
    variables: [{ name: 'x', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('함수 인자가 비어 있습니다') && e.includes('\\sin(x)')));
});

test('validateQuestion: reports random-exam-generator empty sqrt/frac groups', () => {
  const sqrtQuestion = {
    id: 'Q1',
    text: '값은 *x*',
    answer: '\\sqrt{}',
    variables: [{ name: 'x', min: '1', max: '2' }],
  };
  const fracQuestion = {
    id: 'Q2',
    text: '값은 *x*',
    answer: '\\frac{}{x}',
    variables: [{ name: 'x', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [sqrtQuestion, fracQuestion],
  });
  const sqrtErrs = validateQuestion(sqrtQuestion, 0);
  const fracErrs = validateQuestion(fracQuestion, 1);
  assert.ok(sqrtErrs.some((e) => e.includes('\\sqrt 내부가 비어 있습니다')));
  assert.ok(fracErrs.some((e) => e.includes('\\frac 분자가 비어 있습니다')));
});

test('validateQuestion: reports random-exam-generator unescaped percent in text', () => {
  const question = {
    id: 'Q1',
    text: '효율은 50%이고 값은 *a*이다.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('지문에') && e.includes("'%'") && e.includes('\\%')));
});

test('validateQuestion: escaped percent in text passes compatibility check', () => {
  const question = {
    id: 'Q1',
    text: '효율은 50\\%이고 값은 *a*이다.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(!errs.some((e) => e.includes('지문에') && e.includes("'%'")));
});

test('validateQuestion: reports compatibility runtime failures instead of silent pass', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: [] }),
    questions: [question],
    randomExamCompat: () => {
      throw new Error('compat failed');
    },
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('호환성 모듈을 불러오지 못해 검사를 수행할 수 없습니다')));
  assert.ok(errs.some((e) => e.includes('compat failed')));
});

test('random-exam compat diagnose warns and offers quick fix for Greek unicode in text', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '각도는 α이고 값은 *a*이다.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.equal(Array.isArray(diag.errors), true);
  assert.equal(Array.isArray(diag.warnings), true);
  assert.equal(Array.isArray(diag.quickFixes), true);
  assert.ok(diag.warnings.some((msg) => msg.includes('그리스 유니코드')));
  assert.ok(diag.quickFixes.some((fix) => fix.action === 'replace_greek_unicode' && fix.field === 'text'));
});

test('random-exam compat fails closed when text module is missing', () => {
  const compatApi = loadRandomExamCompatFnsWithMissingModules({ missingText: true });
  const question = {
    id: 'Q1',
    text: '각도는 α이고 값은 *a*이다.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = compatApi.diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.equal(typeof compatApi.diagnoseTextCompileCompatibility, 'undefined');
  assert.ok(diag.errors.some((msg) => msg.includes('로드 실패')));
  assert.ok(diag.errors.some((msg) => msg.includes('지문 호환성 모듈')));
  assert.equal(diag.warnings.length, 0);
});

test('random-exam compat fails closed when answer module is missing', () => {
  const compatApi = loadRandomExamCompatFnsWithMissingModules({ missingAnswer: true });
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const errs = compatApi.validateQuestionCompatibility(question, 0, () => ['a']);
  assert.equal(typeof compatApi.diagnoseAnswerParserCompatibility, 'undefined');
  assert.ok(errs.some((msg) => msg.includes('로드 실패')));
  assert.ok(errs.some((msg) => msg.includes('정답식 호환성 모듈')));
});

test('app compatibility diagnostics use fail-closed error when compat split API is partially missing', () => {
  const compatApi = loadRandomExamCompatFnsWithMissingModules({ missingText: true });
  const { getRandomExamCompatibilityDiagnostics } = loadGetRandomExamCompatibilityDiagnosticsFn({
    randomExamCompat: compatApi,
  });
  const question = {
    id: 'Q1',
    text: '각도는 α이고 값은 *a*이다.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = getRandomExamCompatibilityDiagnostics(question, 0);
  assert.ok(Array.isArray(diag.errors));
  assert.ok(diag.errors.some((msg) => msg.includes('로드 실패')));
  assert.ok(diag.errors.some((msg) => msg.includes('지문 호환성 모듈')));
  assert.equal(diag.warnings.length, 0);
});

test('app compatibility diagnostics cache keeps one entry per question index slot', () => {
  const { getRandomExamCompatibilityDiagnostics, sandbox } = loadGetRandomExamCompatibilityDiagnosticsRuntime();
  const baseQuestion = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };

  for (let i = 0; i < 12; i++) {
    const question = { ...baseQuestion, text: `값은 *a* ${i}` };
    getRandomExamCompatibilityDiagnostics(question, 0);
  }
  getRandomExamCompatibilityDiagnostics({ ...baseQuestion, id: 'Q2' }, 1);

  const cache = sandbox.window.__randomExamCompatDiagnosticsCache;
  assert.equal(typeof cache?.get, 'function');
  assert.equal(typeof cache?.set, 'function');
  assert.equal(cache.size, 2);
});

test('random-exam compat replaceGreekUnicodeWithLatex inserts delimiter before latin letters', () => {
  const { replaceGreekUnicodeWithLatex } = loadRandomExamCompatFns();
  const result = replaceGreekUnicodeWithLatex('αb + β');
  assert.equal(result.text, '\\alpha{}b + \\beta');
  assert.ok(result.replacements.some((item) => item.char === 'α' && item.replacement === '\\alpha'));
});

test('random-exam compat replaceGreekUnicodeWithLatexInText wraps outside-math greek chars with $...$', () => {
  const { replaceGreekUnicodeWithLatexInText } = loadRandomExamCompatFns();
  const result = replaceGreekUnicodeWithLatexInText('각 α, 그리고 $β+γ$');
  assert.equal(result.text, '각 $\\alpha$, 그리고 $\\beta+\\gamma$');
  assert.ok(result.replacements.some((item) => item.char === 'α' && item.replacement === '\\alpha'));
});

test('random-exam compat diagnose warns and offers quick fix for unicode math symbols in text', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '조건은 a ≤ b 이고 화살표는 →. 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes('유니코드 수학기호')));
  assert.ok(diag.quickFixes.some((fix) => fix.action === 'replace_text_unicode_symbols' && fix.field === 'text'));
});

test('random-exam compat replaceTextUnicodeSymbolsWithLatexInText wraps outside-math symbols and preserves math context', () => {
  const { replaceTextUnicodeSymbolsWithLatexInText } = loadRandomExamCompatFns();
  const result = replaceTextUnicodeSymbolsWithLatexInText('a ≤ b, $x→y$');
  assert.equal(result.text, 'a $\\le$ b, $x\\to{}y$');
  assert.ok(result.replacements.some((item) => item.char === '≤' && item.replacement === '\\le'));
});

test('random-exam compat diagnose warns and offers quick fix for invisible unicode', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '숨은문자 a\u200bb 와 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes('보이지 않는 유니코드')));
  assert.ok(diag.quickFixes.some((fix) => fix.action === 'normalize_text_unicode' && fix.field === 'text'));
});

test('random-exam compat normalizeTextUnicode removes zero-width characters', () => {
  const { normalizeTextUnicode } = loadRandomExamCompatFns();
  const result = normalizeTextUnicode('a\u200bb');
  assert.equal(result.text, 'ab');
  assert.ok(result.replacements.some((item) => item.char === '\u200b'));
});

test('random-exam compat diagnose warns for emoji and unicode superscript/subscript', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '아이콘 😊, 표기 x² + y₁, 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes('이모지/픽토그램')));
  assert.ok(diag.warnings.some((msg) => msg.includes('유니코드 위/아래첨자')));
  assert.ok(diag.quickFixes.some((fix) => fix.action === 'replace_unicode_supsub' && fix.field === 'text'));
});

test('random-exam compat replaceUnicodeSupSubWithLatexInText converts superscript/subscript with math-aware wrapping', () => {
  const { replaceUnicodeSupSubWithLatexInText } = loadRandomExamCompatFns();
  const result = replaceUnicodeSupSubWithLatexInText('x² + y₁, $z⁴$');
  assert.equal(result.text, '$x^{2}$ + $y_{1}$, $z^{4}$');
  assert.ok(result.replacements.some((item) => item.char === '²' && item.replacement === '^{2}'));
  assert.ok(result.replacements.some((item) => item.char === '₁' && item.replacement === '_{1}'));
});

test('random-exam compat replaceUnicodeSupSubWithLatexInText preserves valid bases for grouped and command expressions', () => {
  const { replaceUnicodeSupSubWithLatexInText } = loadRandomExamCompatFns();
  const result = replaceUnicodeSupSubWithLatexInText('\\frac{a}{b}² + (x+y)² + x¹⁰ + a₁₂');
  assert.equal(result.text, '$\\frac{a}{b}^{2}$ + $(x+y)^{2}$ + $x^{10}$ + $a_{12}$');
  assert.equal(result.text.includes('$}^{2}$'), false);
});

test('random-exam compat replaceUnicodeSupSubWithLatexInText keeps \\left...\\right grouped base intact', () => {
  const { replaceUnicodeSupSubWithLatexInText } = loadRandomExamCompatFns();
  const result = replaceUnicodeSupSubWithLatexInText('\\left( x \\right)² + \\left\\{x\\right\\}²');
  assert.equal(result.text, '$\\left( x \\right)^{2}$ + $\\left\\{x\\right\\}^{2}$');
  assert.equal(result.text.includes('\\left$('), false);
});

test('random-exam compat diagnose warns for unhandled unicode without quick fix', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '기호 é 는 수동 확인 대상, 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes('분류되지 않은 유니코드')));
  assert.equal(diag.quickFixes.some((fix) => fix.action === 'replace_unhandled_unicode'), false);
});

test('random-exam compat unhandled-unicode warning excludes normal hangul text', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '한글 지문과 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.equal(diag.warnings.some((msg) => msg.includes('분류되지 않은 유니코드')), false);
});

test('random-exam compat diagnose warns for math-only LaTeX commands outside math mode in text', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '각도는 \\alpha 이고 함수는 \\sin x 이다. 벡터는 \\vec{v}. 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes('수식 전용 LaTeX 명령')));
  assert.ok(diag.warnings.some((msg) => msg.includes('\\alpha')));
  assert.ok(diag.warnings.some((msg) => msg.includes('\\sin')));
  assert.ok(diag.warnings.some((msg) => msg.includes('\\vec')));
  assert.ok(diag.quickFixes.some((fix) => fix.action === 'wrap_math_only_text_commands' && fix.field === 'text'));
});

test('random-exam compat wrapMathOnlyCommandsOutsideMathInText wraps math-only commands outside math mode', () => {
  const { wrapMathOnlyCommandsOutsideMathInText } = loadRandomExamCompatFns();
  const result = wrapMathOnlyCommandsOutsideMathInText('각도 \\alpha, 함수 \\sin x, 벡터 \\vec{v}, 이미 수식은 $\\cos y$');
  assert.equal(result.text, '각도 $\\alpha$, 함수 $\\sin x$, 벡터 $\\vec{v}$, 이미 수식은 $\\cos y$');
  assert.ok(result.replacements.some((item) => item.cmd === 'alpha' && item.count === 1));
  assert.ok(result.replacements.some((item) => item.cmd === 'sin' && item.count === 1));
  assert.ok(result.replacements.some((item) => item.cmd === 'vec' && item.count === 1));
});

test('random-exam compat wrapMathOnlyCommandsOutsideMathInText keeps mixed text command group syntactically valid', () => {
  const { wrapMathOnlyCommandsOutsideMathInText } = loadRandomExamCompatFns();
  const result = wrapMathOnlyCommandsOutsideMathInText('\\sin \\textbf{a}');
  assert.equal(result.text, '$\\sin \\textbf{a}$');
  assert.equal(result.text.includes('\\textbf$'), false);
});

test('random-exam compat diagnose does not warn when math-only commands are inside $...$ in text', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '각도는 $\\alpha$ 이고 함수는 $\\sin x$ 이고 연산은 $a \\circ b$ 이다. 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.equal(diag.warnings.some((msg) => msg.includes('수식 전용 LaTeX 명령')), false);
  assert.equal(diag.warnings.some((msg) => msg.includes('\\circ')), false);
});

test('random-exam compat diagnose warns when \\circ is outside math mode in text', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '연산은 a \\circ b 로 쓴다. 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes('수식 전용 LaTeX 명령')));
  assert.ok(diag.warnings.some((msg) => msg.includes('\\circ')));
});

test('random-exam compat diagnose warns for package-dependent math command under current pdflatex profile', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '집합은 $\\mathbb{R}$ 이고 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes('패키지 의존 수식 명령')));
  assert.ok(diag.warnings.some((msg) => msg.includes('\\mathbb')));
  assert.ok(diag.warnings.some((msg) => msg.includes('amssymb')));
  assert.ok(diag.warnings.some((msg) => msg.includes('amsfonts')));
});

test('random-exam compat package-dependent warning is scoped to math mode only', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '집합은 \\mathbb{R} 로 표기. 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.equal(diag.warnings.some((msg) => msg.includes('패키지 의존 수식 명령')), false);
});

test('random-exam compat package-dependent mathbb warning is cleared when amsfonts is enabled', () => {
  const { diagnoseQuestionCompatibility, getPdflatexCompatibilityProfile } = loadRandomExamCompatFnsWithMathPackages({
    amssymb: false,
    amsfonts: true,
  });
  const profile = getPdflatexCompatibilityProfile();
  assert.equal(Boolean(profile.mathPackages.amssymb), false);
  assert.equal(Boolean(profile.mathPackages.amsfonts), true);

  const question = {
    id: 'Q1',
    text: '집합은 $\\mathbb{R}$ 이고 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.equal(diag.warnings.some((msg) => msg.includes('패키지 의존 수식 명령')), false);
  assert.equal(diag.warnings.some((msg) => msg.includes('\\mathbb')), false);
});

test('random-exam compat diagnose warns for non-text command outside math mode in text', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '명령 \\a 와 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes('수식 구분자 밖')));
  assert.ok(diag.warnings.some((msg) => msg.includes('\\a')));
});

test('random-exam compat diagnose warns for truly text-only command inside math mode in text', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '수식은 $a\\par b$ 이고 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes('수식 구분자 안')));
  assert.ok(diag.warnings.some((msg) => msg.includes('\\par')));
});

test('random-exam compat diagnose does not warn for compile-safe text styling command inside math mode', () => {
  const { diagnoseQuestionCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '수식은 $\\textbf{a}$ 이고 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseQuestionCompatibility(question, 0, () => ['a']);
  assert.equal(diag.warnings.some((msg) => msg.includes('수식 구분자 안')), false);
  assert.equal(diag.warnings.some((msg) => msg.includes('\\textbf')), false);
});

test('random-exam compat diagnose accepts parser-compatible accidental hyperbolic inverse forms', () => {
  const { diagnoseAnswerParserCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '값은 *x*',
    answer: '\\arctanh(x)',
    variables: [{ name: 'x', min: '0.1', max: '0.9' }],
  };
  const diag = diagnoseAnswerParserCompatibility(question, 0, () => ['x']);
  assert.equal(diag.errors.some((msg) => msg.includes('곱셈 기호')), false);
  assert.equal(diag.errors.length, 0);
});

test('random-exam compat exposes pdflatex profile baseline', () => {
  const { getPdflatexCompatibilityProfile } = loadRandomExamCompatFns();
  const profile = getPdflatexCompatibilityProfile();
  assert.equal(profile.engine, 'pdflatex');
  assert.ok(String(profile.compilerCommand || '').includes('latexmk -pdf'));
  assert.equal(typeof profile.mathPackages, 'object');
  assert.equal(Boolean(profile.mathPackages.amsmath), false);
  assert.equal(Boolean(profile.mathPackages.amssymb), false);
  assert.equal(Boolean(profile.mathPackages.amsfonts), false);
  assert.equal(Boolean(profile.mathPackages.mathtools), false);
});

test('random-exam compat evaluates answer toolbar policies from parser rules', () => {
  const { evaluateAnswerToolbarAction } = loadRandomExamCompatFns();

  const blockVar = evaluateAnswerToolbarAction({
    action: 'wrap',
    prefix: '*',
    suffix: '*',
    policyKey: 'answer_no_var_wrap',
  });
  assert.equal(blockVar.allowed, false);
  assert.ok(blockVar.reason.includes('*var*'));

  const blockTimes = evaluateAnswerToolbarAction({ action: 'cmd', cmd: 'times' });
  assert.equal(blockTimes.allowed, false);
  assert.ok(blockTimes.reason.includes("'*'"));

  const blockUnderline = evaluateAnswerToolbarAction({ action: 'cmd', cmd: 'underline' });
  assert.equal(blockUnderline.allowed, false);
  assert.ok(blockUnderline.reason.includes('\\underline'));
  assert.ok(blockUnderline.reason.includes('지문용 서식 명령'));

  const blockOverline = evaluateAnswerToolbarAction({ action: 'cmd', cmd: 'overline' });
  assert.equal(blockOverline.allowed, false);
  assert.ok(blockOverline.reason.includes('\\overline'));
  assert.ok(blockOverline.reason.includes('지문용 서식 명령'));

  const blockTpl = evaluateAnswerToolbarAction({
    action: 'tpl',
    tpl: '\\log_{|}',
    policyKey: 'answer_no_log_base',
  });
  assert.equal(blockTpl.allowed, false);
  assert.ok(blockTpl.reason.includes('\\ln(x)만 사용'));

  const allowLegacyPolicyKey = evaluateAnswerToolbarAction({
    action: 'cmd',
    cmd: 'sin',
    policyKey: 'answer_use_function_parenthesis',
  });
  assert.equal(allowLegacyPolicyKey.allowed, true);
  assert.equal(String(allowLegacyPolicyKey.reason || ''), '');
});

test('random-exam compat allows answer toolbar actions for supported commands', () => {
  const { evaluateAnswerToolbarAction } = loadRandomExamCompatFns();
  const allowedSin = evaluateAnswerToolbarAction({ action: 'cmd', cmd: 'sin' });
  const allowedFrac = evaluateAnswerToolbarAction({ action: 'cmd', cmd: 'frac' });
  assert.equal(allowedSin.allowed, true);
  assert.equal(allowedFrac.allowed, true);
});

test('random-exam compat text/answer diagnostics are separated', () => {
  const {
    diagnoseTextCompileCompatibility,
    diagnoseAnswerParserCompatibility,
  } = loadRandomExamCompatFns();

  const question = {
    id: 'Q1',
    text: '효율 50%에서 \\alpha 를 쓰고 값은 *a*.',
    answer: '2a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };

  const textDiag = diagnoseTextCompileCompatibility(question, 0, () => ['a']);
  const answerDiag = diagnoseAnswerParserCompatibility(question, 0, () => ['a']);

  assert.ok(textDiag.errors.some((msg) => msg.includes("'%'")));
  assert.ok(textDiag.warnings.some((msg) => msg.includes('수식 전용 LaTeX 명령')));
  assert.equal(textDiag.errors.some((msg) => msg.includes('곱셈 기호')), false);

  assert.ok(answerDiag.errors.some((msg) => msg.includes('곱셈 기호')));
  assert.equal(answerDiag.warnings.some((msg) => msg.includes('수식 전용 LaTeX 명령')), false);
  assert.equal(answerDiag.errors.some((msg) => msg.includes("'%'")), false);
});

test('random-exam compat answer diagnostics omit raw-input snippet', () => {
  const { diagnoseAnswerParserCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: '2a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseAnswerParserCompatibility(question, 0, () => ['a']);
  assert.ok(diag.errors.some((msg) => msg.includes('묵시적 곱셈')));
  assert.equal(diag.errors.some((msg) => msg.includes('입력식:')), false);
});

test('random-exam compat diagnose reports unclosed brace in text command', () => {
  const { diagnoseTextCompileCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '\\underline{정지 마찰 계수',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseTextCompileCompatibility(question, 0, () => ['a']);
  assert.ok(diag.errors.some((msg) => msg.includes('중괄호') && msg.includes('짝이 맞지')));
});

test('random-exam compat brace guidance shows single-backslash user input form', () => {
  const { diagnoseTextCompileCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '\\underline{정지 마찰 계수',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseTextCompileCompatibility(question, 0, () => ['a']);
  const msg = diag.errors.find((m) => m.includes('문자 중괄호는'));
  assert.ok(msg);
  assert.ok(msg.includes("'\\{'"));
  assert.ok(msg.includes("'\\}'"));
  assert.equal(msg.includes("'\\\\{'"), false);
  assert.equal(msg.includes("'\\\\}'"), false);
});

test('random-exam compat diagnose ignores escaped literal braces in text', () => {
  const { diagnoseTextCompileCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '집합은 \\{a,b\\} 이고 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseTextCompileCompatibility(question, 0, () => ['a']);
  assert.equal(diag.errors.some((msg) => msg.includes('중괄호') && msg.includes('짝이 맞지')), false);
});

test('random-exam compat diagnose warns and offers quick fix for text-mode unsafe characters', () => {
  const { diagnoseTextCompileCompatibility } = loadRandomExamCompatFns();
  const question = {
    id: 'Q1',
    text: '경로 A_B ^ C ~ D, 식은 $x^2$이고 값은 *a*.',
    answer: 'a',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const diag = diagnoseTextCompileCompatibility(question, 0, () => ['a']);
  assert.ok(diag.warnings.some((msg) => msg.includes("'_'")));
  assert.ok(diag.quickFixes.some((fix) => fix.action === 'escape_text_special_chars' && fix.field === 'text'));
});

test('random-exam compat escapeTextLatexSpecialChars escapes only text-mode unsafe chars', () => {
  const { escapeTextLatexSpecialChars } = loadRandomExamCompatFns();
  const result = escapeTextLatexSpecialChars('A_B ^ C ~ D, 식 $x^2$');
  assert.equal(result.text, 'A\\_B \\^{} C \\~{} D, 식 $x^2$');
});

test('random-exam compat escapeTextLatexSpecialChars keeps escaped tokens after astral unicode', () => {
  const { escapeTextLatexSpecialChars } = loadRandomExamCompatFns();
  const input = `emoji \u{1F600}\\%`;
  const result = escapeTextLatexSpecialChars(input);
  assert.equal(result.text, input);
  const replacedCount = result.replacements.reduce((sum, item) => sum + (Number(item?.count) || 0), 0);
  assert.equal(replacedCount, 0);
});

test('autosave image snapshot key changes for same-length/prefix different image', () => {
  const prefix = 'data:image/png;base64,';
  const imgA = prefix + 'A'.repeat(120);
  const imgB = prefix + 'A'.repeat(119) + 'B'; // same length, same prefix, different body
  const { _buildImageSnapshotKey, state } = loadAutoSaveKeyFns([{ imageData: imgA }]);
  const k1 = _buildImageSnapshotKey();
  state.questions = [{ imageData: imgB }];
  const k2 = _buildImageSnapshotKey();
  assert.notEqual(k1, k2);
});

test('autosave meta signature reflects both length and content', () => {
  const { _buildAutoSaveMetaSignature } = loadAutoSaveMetaSignatureFns();
  const s1 = _buildAutoSaveMetaSignature('{"a":1}');
  const s2 = _buildAutoSaveMetaSignature('{"a":2}');
  const s3 = _buildAutoSaveMetaSignature('{"a":1} ');
  assert.notEqual(s1, s2);
  assert.notEqual(s1, s3);
});

test('autosave skip decision: same snapshot but different meta must not be skipped', () => {
  const { _shouldSkipImageAutoSave } = loadAutoSaveDecisionFns();
  const shouldSkip = _shouldSkipImageAutoSave({
    snapshotKey: '0:123:abc',
    metaSignature: '200:aaaa',
    lastSnapshotKey: '0:123:abc',
    lastMetaSignature: '180:bbbb',
    pendingSnapshotKey: '',
    pendingMetaSignature: '',
  });
  assert.equal(shouldSkip, false);
});

test('sanitize restored currentIndex clamps and normalizes invalid values', () => {
  const { _sanitizeRestoredCurrentIndex } = loadRestoreIndexFns();
  assert.equal(_sanitizeRestoredCurrentIndex('abc', 3), 0);
  assert.equal(_sanitizeRestoredCurrentIndex(-5, 3), 0);
  assert.equal(_sanitizeRestoredCurrentIndex(99, 3), 2);
  assert.equal(_sanitizeRestoredCurrentIndex('1.8', 3), 1);
});

test('hasAnyImageData returns true only when at least one image exists', () => {
  const { _hasAnyImageData, state } = loadImagePresenceFns([{ imageData: null }, { imageData: '' }]);
  assert.equal(_hasAnyImageData(), false);
  state.questions = [{ imageData: null }, { imageData: 'data:image/png;base64,AAA' }];
  assert.equal(_hasAnyImageData(), true);
});

test('latexToMathjs: converts basic forms', () => {
  const { latexToMathjs } = loadLatexFns();
  const frac = latexToMathjs('\\frac{a}{b}').replace(/\s+/g, '');
  const logb = latexToMathjs('\\log_{2}(x)').replace(/\s+/g, '');
  const trig = latexToMathjs('\\sin(x)+2x').replace(/\s+/g, '');
  const spacedFuncMul = latexToMathjs('a \\sqrt{9.8} \\cos(a)').replace(/\s+/g, '');

  assert.equal(frac, '((a)/(b))');
  assert.equal(logb, 'log((x),(2))');
  assert.equal(trig, 'sin((x))+2*x');
  assert.equal(spacedFuncMul, 'a*sqrt(9.8)*cos((a))');
});

test('latexToMathjs: throws on unsupported command', () => {
  const { latexToMathjs } = loadLatexFns();
  assert.throws(() => latexToMathjs('\\foobar{x}'), /지원하지 않는 LaTeX 명령/);
});

test('evaluateMinMaxApprox: deterministic linear range with corners', () => {
  const { evaluateMinMaxApprox } = loadMinMaxFns();
  const compiled = {
    evaluate(scope) {
      return scope.x + scope.y;
    },
  };
  const bounds = {
    x: { min: 0, max: 1 },
    y: { min: 0, max: 1 },
  };
  const r = evaluateMinMaxApprox(compiled, bounds, 200, 1);
  assert.equal(r.minVal, 0);
  assert.equal(r.maxVal, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(r.argMin)), { x: 0, y: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(r.argMax)), { x: 1, y: 1 });
});

test('evaluateMinMaxApprox: throws on empty bounds', () => {
  const { evaluateMinMaxApprox } = loadMinMaxFns();
  const compiled = { evaluate: () => 1 };
  assert.throws(
    () => evaluateMinMaxApprox(compiled, {}, 200, 1),
    /변수 범위가 없습니다/
  );
});

test('source no longer uses native alert/confirm/prompt', () => {
  assert.equal(/\balert\s*\(/.test(appSource), false);
  assert.equal(/\bconfirm\s*\(/.test(appSource), false);
  assert.equal(/\bprompt\s*\(/.test(appSource), false);
});

test('confirm modal Enter follows focused button and alert Enter confirms', async () => {
  const makeClassList = (initial = []) => {
    const set = new Set(initial);
    return {
      add(name) { set.add(name); },
      remove(name) { set.delete(name); },
      toggle(name, force) {
        if (force === true) { set.add(name); return true; }
        if (force === false) { set.delete(name); return false; }
        if (set.has(name)) { set.delete(name); return false; }
        set.add(name);
        return true;
      },
      contains(name) { return set.has(name); },
    };
  };

  const documentMock = {
    activeElement: null,
    _listeners: new Map(),
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const set = this._listeners.get(type);
      if (!set) return;
      set.delete(fn);
      if (set.size === 0) this._listeners.delete(type);
    },
    dispatchKey(key, options = {}) {
      const set = this._listeners.get('keydown');
      if (!set) return;
      const event = {
        key,
        shiftKey: !!options.shiftKey,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
      };
      [...set].forEach((fn) => fn(event));
    },
  };

  const makeNode = ({ textContent = '', hidden = false } = {}) => {
    const listeners = new Map();
    const attrs = new Map();
    return {
      textContent,
      classList: makeClassList(hidden ? ['hidden'] : []),
      setAttribute(name, value) {
        attrs.set(String(name), String(value));
      },
      getAttribute(name) {
        return attrs.get(String(name)) ?? null;
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        const set = listeners.get(type);
        if (!set) return;
        set.delete(fn);
        if (set.size === 0) listeners.delete(type);
      },
      focus() {
        documentMock.activeElement = this;
      },
    };
  };

  const dom = {
    confirmModal: makeNode({ hidden: true }),
    confirmTitle: makeNode({ textContent: '확인' }),
    confirmMessage: makeNode(),
    confirmOkBtn: makeNode({ textContent: '확인' }),
    confirmCancelBtn: makeNode({ textContent: '취소' }),
  };

  const sandbox = {
    dom,
    document: documentMock,
    requestAnimationFrame: (cb) => {
      cb();
      return 1;
    },
  };

  const { showDialog } = runSnippets(
    [extractBetween(appSource, 'function showDialog({', 'const showConfirm =')],
    '{ showDialog }',
    sandbox
  );

  const confirmByCancel = showDialog({ message: '삭제?', mode: 'confirm' });
  documentMock.activeElement = dom.confirmCancelBtn;
  documentMock.dispatchKey('Enter');
  assert.equal(await confirmByCancel, false);

  const confirmByOk = showDialog({ message: '삭제?', mode: 'confirm' });
  documentMock.activeElement = dom.confirmOkBtn;
  documentMock.dispatchKey('Enter');
  assert.equal(await confirmByOk, true);

  const alertByEnter = showDialog({ message: '오류', mode: 'alert' });
  documentMock.activeElement = dom.confirmCancelBtn;
  documentMock.dispatchKey('Enter');
  assert.equal(await alertByEnter, true);

  const confirmTabCycle = showDialog({ message: '탭 순환', mode: 'confirm' });
  documentMock.activeElement = dom.confirmOkBtn;
  documentMock.dispatchKey('Tab');
  assert.equal(documentMock.activeElement, dom.confirmCancelBtn);
  documentMock.dispatchKey('Tab', { shiftKey: true });
  assert.equal(documentMock.activeElement, dom.confirmOkBtn);
  documentMock.dispatchKey('Escape');
  assert.equal(await confirmTabCycle, false);

  assert.equal(dom.confirmModal.getAttribute('aria-hidden'), 'true');
  assert.equal(dom.confirmTitle.textContent, '확인');
});

test('focusable filter excludes hidden descendants inside modal focus trap', () => {
  const makeClassList = (hidden = false) => ({
    contains(name) {
      return hidden && name === 'hidden';
    },
  });

  const createNode = ({
    tagName = 'BUTTON',
    hidden = false,
    ariaHidden = null,
    style = null,
    rects = [{}],
    disabled = false,
    tabindex = null,
    type = '',
  } = {}) => {
    const attrs = new Map();
    if (ariaHidden !== null) attrs.set('aria-hidden', String(ariaHidden));
    if (tabindex !== null) attrs.set('tabindex', String(tabindex));
    return {
      tagName,
      type,
      disabled,
      parentElement: null,
      classList: makeClassList(hidden),
      _style: style,
      focus() {},
      getAttribute(name) {
        return attrs.has(name) ? attrs.get(name) : null;
      },
      getClientRects() {
        return rects;
      },
    };
  };

  const modal = {
    _nodes: [],
    querySelectorAll() {
      return this._nodes;
    },
    contains(node) {
      let cur = node;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentElement;
      }
      return false;
    },
  };

  const visible = createNode();
  visible.parentElement = modal;

  const hiddenClassParent = {
    parentElement: modal,
    classList: makeClassList(true),
    getAttribute() { return null; },
    _style: null,
  };
  const hiddenByClass = createNode();
  hiddenByClass.parentElement = hiddenClassParent;

  const hiddenAriaParent = {
    parentElement: modal,
    classList: makeClassList(false),
    getAttribute(name) { return name === 'aria-hidden' ? 'true' : null; },
    _style: null,
  };
  const hiddenByAria = createNode();
  hiddenByAria.parentElement = hiddenAriaParent;

  const hiddenStyleParent = {
    parentElement: modal,
    classList: makeClassList(false),
    getAttribute() { return null; },
    _style: { display: 'none', visibility: 'visible' },
  };
  const hiddenByStyle = createNode();
  hiddenByStyle.parentElement = hiddenStyleParent;

  const zeroRect = createNode({ rects: [] });
  zeroRect.parentElement = modal;

  const disabled = createNode({ disabled: true });
  disabled.parentElement = modal;

  const hiddenInput = createNode({ tagName: 'INPUT', type: 'hidden' });
  hiddenInput.parentElement = modal;

  modal._nodes = [visible, hiddenByClass, hiddenByAria, hiddenByStyle, zeroRect, disabled, hiddenInput];

  const sandbox = {
    window: {
      getComputedStyle(node) {
        return node?._style || { display: 'block', visibility: 'visible' };
      },
    },
  };

  const { _getVisibleFocusable } = runSnippets(
    [
      extractConstStatement(appSource, '_FOCUSABLE_SELECTOR'),
      extractConstStatement(appSource, '_isElementVisibleInModal'),
      extractConstStatement(appSource, '_getVisibleFocusable'),
    ],
    '{ _getVisibleFocusable }',
    sandbox
  );

  const out = _getVisibleFocusable(modal);
  assert.equal(out.length, 1);
  assert.equal(out[0], visible);
});

test('import search filter applies incrementally and keeps summary/folder state', () => {
  const makeItem = (searchText, checked = false) => {
    const checkbox = { checked };
    return {
      dataset: { searchText },
      style: { display: '' },
      checkbox,
    };
  };

  const itemA1 = makeItem('alpha topic', true);
  const itemA2 = makeItem('beta topic', false);
  const itemB1 = makeItem('alpha extra', false);
  const items = [itemA1, itemA2, itemB1];

  const makeFolder = (folderItems) => ({
    style: { display: '' },
    querySelectorAll(selector) {
      if (selector === '.import-item:not([style*="display: none"])') {
        return folderItems.filter((item) => item.style.display !== 'none');
      }
      return [];
    },
  });

  const folderA = makeFolder([itemA1, itemA2]);
  const folderB = makeFolder([itemB1]);

  const importList = {
    querySelectorAll(selector) {
      if (selector === '.import-item') return items;
      if (selector === '.import-folder') return [folderA, folderB];
      if (selector === '.import-item input[type="checkbox"]:checked') {
        return items
          .filter((item) => item.checkbox.checked)
          .map((item) => item.checkbox);
      }
      if (selector === '.import-item:not([style*="display: none"])') {
        return items.filter((item) => item.style.display !== 'none');
      }
      if (selector === '.import-item:not([style*="display: none"]) input[type="checkbox"]') {
        return items
          .filter((item) => item.style.display !== 'none')
          .map((item) => item.checkbox);
      }
      if (selector === '.import-item:not([style*="display: none"]) input[type="checkbox"]:checked') {
        return items
          .filter((item) => item.style.display !== 'none' && item.checkbox.checked)
          .map((item) => item.checkbox);
      }
      return [];
    },
  };

  const sandbox = {
    dom: {
      importList,
      importSummary: { textContent: '' },
      importAppendBtn: { disabled: true },
      importSelectAllBtn: { textContent: '전체 선택' },
    },
    _importCandidates: [{}, {}, {}],
    _importGroups: [{ folder: 'A' }],
  };

  const { _applyImportSearchFilter } = runSnippets(
    [extractBetween(appSource, 'function _updateImportSummary() {', 'function _buildImportItem(')],
    '{ _applyImportSearchFilter }',
    sandbox
  );

  _applyImportSearchFilter('alpha');
  assert.equal(itemA1.style.display, '');
  assert.equal(itemA2.style.display, 'none');
  assert.equal(itemB1.style.display, '');
  assert.equal(folderA.style.display, '');
  assert.equal(folderB.style.display, '');
  assert.equal(sandbox.dom.importSummary.textContent, '1개 선택 (2/3 표시)');
  assert.equal(sandbox.dom.importAppendBtn.disabled, false);

  // Incremental update: only newly appended items are filtered, while summary stays in sync.
  _applyImportSearchFilter('beta', { items: [itemA2], syncFolders: false });
  assert.equal(itemA2.style.display, '');
  assert.equal(itemA1.style.display, '');
  assert.equal(sandbox.dom.importSummary.textContent, '1개 선택');

  _applyImportSearchFilter('beta');
  assert.equal(itemA1.style.display, 'none');
  assert.equal(itemA2.style.display, '');
  assert.equal(itemB1.style.display, 'none');
  assert.equal(folderA.style.display, '');
  assert.equal(folderB.style.display, 'none');
  assert.equal(sandbox.dom.importSummary.textContent, '1개 선택 (1/3 표시, 숨김 선택 1개)');
  assert.equal(sandbox.dom.importAppendBtn.disabled, false);

  assert.equal(
    /dom\.importSearch\.addEventListener\('input', \(\) => \{\s*_applyImportSearchFilter\(dom\.importSearch\.value\);\s*\}\);/.test(appSource),
    true
  );
});

test('import replace action requires confirmation modal', () => {
  assert.equal(
    /async function doReplace\(\)\s*\{[\s\S]*?if \(!await showConfirm\('현재 문항을 전체 교체할까요\? \(기존 문항 복구 불가\)', \{ okText: '전체 교체' \}\)\) return;/.test(appSource),
    true
  );
});

test('import file nav uses unique file-path key for section jump', () => {
  assert.equal(
    /groups\.push\(\{ folder, file: fname, filePath: jf\.name, startIdx, count: allQuestions\.length - startIdx \}\);/.test(appSource),
    true
  );
  assert.equal(/fileDiv\.dataset\.filePath = g\.filePath \|\| g\.file \|\| '';\s*/.test(appSource), true);
  assert.equal(
    /querySelector\(`\.import-file-section\[data-file-path="\$\{CSS\.escape\(g\.filePath \|\| g\.file \|\| ''\)\}"\]`\)/.test(appSource),
    true
  );
});

test('tree dropdown actions are keyboard focusable and activate on Enter/Space', () => {
  assert.equal(
    /const _makeTreeActionFocusable = \(el\) => \{[\s\S]*?el\.tabIndex = 0;[\s\S]*?el\.setAttribute\('role', 'button'\);[\s\S]*?if \(e\.key !== 'Enter' && e\.key !== ' '\) return;[\s\S]*?el\.click\(\);/.test(appSource),
    true
  );
  assert.equal(
    /if \(!item\) \{[\s\S]*?item = document\.createElement\('div'\);[\s\S]*?container\.appendChild\(item\);[\s\S]*?\}\s*_makeTreeActionFocusable\(item\);/.test(appSource),
    true
  );
  assert.equal(/const allItem = document\.createElement\('div'\);[\s\S]*?_makeTreeActionFocusable\(allItem\);/.test(appSource), true);
  assert.equal(/const hdr = document\.createElement\('div'\);[\s\S]*?_makeTreeActionFocusable\(hdr\);/.test(appSource), true);
  assert.equal(/const item = document\.createElement\('div'\);[\s\S]*?_makeTreeActionFocusable\(item\);/.test(appSource), true);
});

test('zip import defers image conversion and still enforces 5MB image limit', () => {
  assert.equal(/const MAX_IMAGE_BYTES = 5 \* 1024 \* 1024; \/\/ 5MB/.test(appSource), true);
  assert.equal(
    /_mapQuestionAsync\(q, imageIndex, mimeByExt, jf\.name, importMeta, \{ deferImage: true \}\)/.test(appSource),
    true
  );
  assert.equal(/if \(binary\.byteLength > MAX_IMAGE_BYTES\) \{[\s\S]*?skippedLargeImages \+= 1;/.test(appSource), true);
  assert.equal(/question\.imageData = await _blobToDataUrl\(blob\);/.test(appSource), true);
  assert.equal(appSource.includes('_blobToDataURL('), false);
  assert.equal(
    /const importResult = await _materializeImportQuestions\(_importCandidates, \{[\s\S]*?if \(importResult\.skippedLargeImages > 0\) \{[\s\S]*?showAlert\(`불러오기에서 5MB 초과 이미지 \$\{importResult\.skippedLargeImages\}개를 제외했습니다\.`\);/.test(appSource),
    true
  );
  assert.equal(
    /const importResult = await _materializeImportQuestions\(selectedCandidates, \{[\s\S]*?if \(importResult\.skippedLargeImages > 0\) \{[\s\S]*?5MB 초과 이미지 \$\{importResult\.skippedLargeImages\}개를 제외했습니다\./.test(appSource),
    true
  );
});

test('preview/import modals toggle aria-hidden and attach focus trap', () => {
  assert.equal(/const _isElementVisibleInModal = \(el, modalEl\) => \{/.test(appSource), true);
  assert.equal(/node\.classList\?\.contains\('hidden'\)/.test(appSource), true);
  assert.equal(/node\.getAttribute\?\.\('aria-hidden'\) === 'true'/.test(appSource), true);
  assert.equal(/window\.getComputedStyle\(node\)/.test(appSource), true);
  assert.equal(/return _isElementVisibleInModal\(el, modalEl\);/.test(appSource), true);
  assert.equal(
    /openFullPreview\(\) \{[\s\S]*?dom\.previewModal\.setAttribute\('aria-hidden', 'false'\);[\s\S]*?_attachModalFocusTrap\(dom\.previewModal, \{/.test(appSource),
    true
  );
  assert.equal(
    /function closeFullPreview\(\) \{[\s\S]*?dom\.previewModal\.setAttribute\('aria-hidden', 'true'\);/.test(appSource),
    true
  );
  assert.equal(
    /function openImportModal\(questions, groups, filename\) \{[\s\S]*?dom\.importModal\.setAttribute\('aria-hidden', 'false'\);[\s\S]*?_attachModalFocusTrap\(dom\.importModal, \{/.test(appSource),
    true
  );
  assert.equal(
    /function closeImportModal\(\) \{[\s\S]*?dom\.importModal\.setAttribute\('aria-hidden', 'true'\);/.test(appSource),
    true
  );
});

test('nested dropdown Escape closes popup before modal dismissal', () => {
  assert.equal(
    /_attachModalFocusTrap\(dom\.previewModal, \{[\s\S]*?onEscape: \(\) => \{[\s\S]*?if \(!dom\.previewTreePopup\.classList\.contains\('hidden'\)\) \{[\s\S]*?_closePreviewTree\(\);[\s\S]*?dom\.previewTreeBtn\.focus\(\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?closeFullPreview\(\);/.test(appSource),
    true
  );
  assert.equal(
    /_attachModalFocusTrap\(dom\.importModal, \{[\s\S]*?onEscape: \(\) => \{[\s\S]*?if \(!dom\.importFileNavPopup\.classList\.contains\('hidden'\)\) \{[\s\S]*?_closeImportFileNav\(\);[\s\S]*?dom\.importFileNavBtn\.focus\(\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?closeImportModal\(\);/.test(appSource),
    true
  );
  assert.equal(
    /dom\.previewTreeSearch\.addEventListener\('keydown', \(e\) => \{[\s\S]*?if \(e\.key === 'Escape'\) \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?e\.stopPropagation\(\);[\s\S]*?_closePreviewTree\(\);[\s\S]*?dom\.previewTreeBtn\.focus\(\);[\s\S]*?\}[\s\S]*?\}\);/.test(appSource),
    true
  );
  assert.equal(
    /dom\.importFileNavList\.addEventListener\('keydown', \(e\) => \{[\s\S]*?if \(e\.key !== 'Escape'\) return;[\s\S]*?e\.preventDefault\(\);[\s\S]*?e\.stopPropagation\(\);[\s\S]*?_closeImportFileNav\(\);[\s\S]*?dom\.importFileNavBtn\.focus\(\);/.test(appSource),
    true
  );
});

test('source no longer embeds inline styles in import file templates', () => {
  assert.equal(appSource.includes("fileDiv.style.margin = '0';"), false);
  assert.equal(appSource.includes("fileDiv.style.borderRadius = '0';"), false);
  assert.equal(appSource.includes("fileDiv.style.border = 'none';"), false);
  assert.equal(appSource.includes("fileDiv.style.borderBottom = '1px solid #e5e7eb';"), false);
  assert.equal(appSource.includes('item.style.paddingLeft'), false);
  assert.equal(appSource.includes('<div class="import-folder-header" style='), false);
  assert.equal(appSource.includes('<span class="import-folder-toggle" style='), false);
  assert.equal(appSource.includes('<span class="import-folder-icon" style='), false);
  assert.equal(appSource.includes('<span class="import-folder-label" style='), false);
  assert.equal(
    /const fileHeaderClass = needsFolderWrap[\s\S]*?import-folder-header import-file-header import-file-header-nested[\s\S]*?import-folder-header import-file-header import-file-header-root/.test(appSource),
    true
  );
  assert.equal(appSource.includes('class="import-folder-toggle import-file-toggle"'), true);
  assert.equal(appSource.includes('class="import-folder-icon import-file-icon"'), true);
  assert.equal(appSource.includes('class="import-folder-label import-file-label"'), true);
  assert.equal(appSource.includes('class="tree-item-num tree-item-num-icon"'), true);
});

test('source clears IndexedDB autosave image snapshot on new start', () => {
  assert.equal(appSource.includes('await _clearAutoSaveImagesFromIndexedDb();'), true);
});

test('source uses raw-meta stale guards for image autosave writes', () => {
  assert.equal(appSource.includes('latestRawBeforeConvert !== metaRaw'), true);
  assert.equal(appSource.includes('latestRawBeforePut !== metaRaw'), true);
});

test('source caches image hash per question object for autosave snapshot key', () => {
  assert.equal(appSource.includes('const _questionImageHashCache = new WeakMap();'), true);
  assert.equal(appSource.includes('const _getCachedQuestionImageHash = (question) => {'), true);
  assert.equal(appSource.includes('cached && cached.dataUrl === dataUrl'), true);
});

test('source no longer renders image tags via string interpolation', () => {
  assert.equal(appSource.includes('<img class="pq-image" src="${q.imageData}" alt="문항 이미지">'), false);
  assert.equal(appSource.includes('<img src="${q.imageData}" alt="문항 이미지"'), false);
});

test('source clears min/max panels on data reset or import merge/replace', () => {
  assert.equal(/function\s+clearMinMaxPanels\s*\(/.test(appSource), true);
  assert.equal(
    /dom\.newBtn\.addEventListener\('click'[\s\S]*?clearMinMaxPanels\(\);[\s\S]*?updateUI\(\);/.test(appSource),
    true
  );
  assert.equal(
    /function\s+doReplace\(\)\s*\{[\s\S]*?clearMinMaxPanels\(\);[\s\S]*?updateUI\(\);/.test(appSource),
    true
  );
  assert.equal(
    /async function\s+doAppend\(\)\s*\{[\s\S]*?clearMinMaxPanels\(\);[\s\S]*?updateUI\(\);/.test(appSource),
    true
  );
});

test('source defines symbol extractor used by min/max variable mismatch checks', () => {
  assert.equal(/function\s+extractSymbolsFromMathjs\s*\(expr\)\s*\{/.test(appSource), true);
  assert.equal(appSource.includes('const used = extractSymbolsFromMathjs(expr);'), true);
});

test('minmax report jump button keeps clickable fallback label when ID is empty', () => {
  assert.equal(
    /const jumpLabel = \(r\) => \{[\s\S]*?return normalizedId \? _escapeHtml\(normalizedId\) : `\$\{r\.index\}\uBC88 \uBB38\uD56D`;/.test(appSource),
    true
  );
  assert.equal(
    /data-goto-question="\$\{r\.qIndex\}"[\s\S]*?title="\$\{jumpTitle\(r\)\}"[\s\S]*?\$\{jumpLabel\(r\)\}/.test(appSource),
    true
  );
});

test('source uses incremental global validation state for save button enable/disable', () => {
  assert.equal(
    /const _invalidQuestionIndexes = new Set\(\);/.test(appSource),
    true
  );
  assert.equal(
    /const _rebuildInvalidQuestionIndexes = \(\) => \{/.test(appSource),
    true
  );
  assert.equal(
    /const updateJsonAndValidation = \(\) => \{[\s\S]*?_isValidationIndexDirty[\s\S]*?const invalidCount = _invalidQuestionIndexes\.size;[\s\S]*?dom\.saveBtn\.disabled = invalidCount > 0;/.test(appSource),
    true
  );
});

test('save click handler keeps validation-error guard without navigation side effects', () => {
  assert.equal(
    /dom\.saveBtn\.addEventListener\('click'[\s\S]*?if \(allErrors\.length > 0\) \{[\s\S]*?_rebuildInvalidQuestionIndexes\(\);[\s\S]*?dom\.saveBtn\.disabled = true;[\s\S]*?updateJsonAndValidation\(\);[\s\S]*?return;/.test(appSource),
    true
  );
  assert.equal(appSource.includes('첫 오류 문항으로 이동했습니다.'), false);
  assert.equal(appSource.includes('오류 문항:'), false);
});

test('save flow shows global compatibility warning summary confirm but still allows saving', () => {
  assert.equal(
    /const collectGlobalCompatibilityWarnings = \(\) => \{[\s\S]*?state\.questions\.forEach\(\(q, idx\) => \{[\s\S]*?getRandomExamCompatibilityDiagnostics\(q, idx\)/.test(appSource),
    true
  );
  assert.equal(
    /const buildGlobalCompatibilityWarningConfirmMessage = \(summary\) => \{[\s\S]*?random-exam-generator 경고/.test(appSource),
    true
  );
  assert.equal(
    /dom\.saveBtn\.addEventListener\('click'[\s\S]*?const warningSummary = collectGlobalCompatibilityWarnings\(\);[\s\S]*?if \(warningSummary\.totalWarnings > 0\) \{[\s\S]*?showConfirm\(warningMessage,\s*\{[\s\S]*?title:\s*'호환성 경고'[\s\S]*?okText:\s*'저장 계속'[\s\S]*?cancelText:\s*'경고 확인'[\s\S]*?\}/.test(appSource),
    true
  );
  assert.equal(
    /if \(!proceedSave\) \{[\s\S]*?state\.currentIndex = firstWarningIndex;[\s\S]*?updateUI\(\);[\s\S]*?return;/.test(appSource),
    true
  );
  assert.equal(
    /if \(!proceedSave\) \{[\s\S]*?updateJsonAndValidation\(\);[\s\S]*?return;/.test(appSource),
    true
  );
});

test('validation warning UI exposes previous/next warning navigation controls', () => {
  assert.equal(appSource.includes("const _createWarningNavControls = (tone = 'amber') => {"), true);
  assert.equal(appSource.includes("prevBtn.dataset.warningNav = 'prev';"), true);
  assert.equal(appSource.includes("nextBtn.dataset.warningNav = 'next';"), true);
  assert.equal(appSource.includes("prevBtn.textContent = '이전 경고';"), true);
  assert.equal(appSource.includes("nextBtn.textContent = '다음 경고';"), true);
  assert.equal(appSource.includes('const renderGlobalWarningHint = (summary) => {'), true);
  assert.equal(appSource.includes('다른 문항 ${questionCount}개에 호환성 경고가 있습니다.'), true);
  assert.equal(appSource.includes("const warningNavBtn = e.target.closest('button[data-warning-nav]');"), true);
  assert.equal(appSource.includes('const targetIdx = _resolveWarningNavTarget(direction);'), true);
  assert.equal(appSource.includes('state.currentIndex = targetIdx;'), true);
  assert.equal(appSource.includes('updateUI();'), true);
});

test('validation error UI exposes previous/next error navigation controls', () => {
  assert.equal(appSource.includes('const _createErrorNavControls = () => {'), true);
  assert.equal(appSource.includes("prevBtn.dataset.errorNav = 'prev';"), true);
  assert.equal(appSource.includes("nextBtn.dataset.errorNav = 'next';"), true);
  assert.equal(appSource.includes("prevBtn.textContent = '이전 오류';"), true);
  assert.equal(appSource.includes("nextBtn.textContent = '다음 오류';"), true);
  assert.equal(appSource.includes('_syncGlobalErrorQuestionIndexes(_invalidQuestionIndexes);'), true);
  assert.equal(appSource.includes("const errorNavBtn = e.target.closest('button[data-error-nav]');"), true);
  assert.equal(appSource.includes('const targetIdx = _resolveErrorNavTarget(direction);'), true);
  assert.equal(appSource.includes('state.currentIndex = targetIdx;'), true);
  assert.equal(appSource.includes('const errorNav = _createErrorNavControls();'), true);
});

test('validation error panel exposes goto buttons for other invalid questions', () => {
  assert.equal(
    /renderGlobalValidationHint = \(otherInvalidIndexes\) => \{[\s\S]*?btn\.dataset\.gotoQuestion = String\(idx\);[\s\S]*?btn\.textContent = _formatQuestionRef\(idx\);/.test(appSource),
    true
  );
  assert.equal(
    /dom\.validationErrors\.addEventListener\('click'[\s\S]*?button\[data-goto-question\][\s\S]*?state\.currentIndex = idx;[\s\S]*?updateUI\(\);/.test(appSource),
    true
  );
});

test('question tree label formatter returns compact number labels', () => {
  const { formatQuestionTreeLabel } = loadTreeLabelFns();
  assert.equal(formatQuestionTreeLabel(0, { id: 'Q1' }), '1\uBC88');
  assert.equal(formatQuestionTreeLabel(9, { id: 'Q10' }), '10\uBC88');
  assert.equal(formatQuestionTreeLabel(-3, { id: 'QX' }), '1\uBC88');
});

test('global validation hint builder returns message only for positive counts', () => {
  const { _buildGlobalValidationHint } = loadTreeLabelFns();
  assert.equal(_buildGlobalValidationHint(0), '');
  assert.equal(_buildGlobalValidationHint(-1), '');
  assert.equal(_buildGlobalValidationHint(NaN), '');
  const hint = _buildGlobalValidationHint(2);
  assert.equal(typeof hint, 'string');
  assert.equal(hint.includes('2'), true);
});

test('updateJsonAndValidation shows global hint when only other questions are invalid', () => {
  const result = runValidationUiScenario({
    currentErrors: [],
    initialInvalidIndexes: [1],
    currentIndex: 0,
  });
  assert.equal(result.saveDisabled, true);
  assert.equal(result.isHidden, false);
  assert.equal(result.rendered.some((line) => line.includes('다른 문항 1개')), true);
  assert.equal(result.rendered.some((line) => line.includes('2번')), true);
  assert.equal(result.rendered.some((line) => line.includes('오류 문항:')), false);
});

test('updateJsonAndValidation defers warning details and shows summary line when errors exist', () => {
  const result = runValidationUiScenario({
    currentErrors: [],
    initialInvalidIndexes: [1],
    currentIndex: 0,
    compatDiagnostics: {
      errors: [],
      warnings: ['현재 문항 경고'],
      quickFixes: [{ id: 'fix1', action: 'normalize_text_unicode', field: 'text', label: '자동치환' }],
    },
  });
  assert.equal(result.saveDisabled, true);
  assert.equal(result.isHidden, false);
  assert.equal(result.warningHidden, false);
  assert.equal(result.rendered.some((line) => line.includes('다른 문항 1개')), true);
  assert.equal(result.rendered.some((line) => line.includes('다른 문항 경고 1건')), false);
  assert.equal(result.renderedWarnings.some((line) => line.includes('다른 문항 경고 1건')), true);
  assert.equal(result.rendered.some((line) => line.includes('현재 문항 경고')), false);
  assert.equal(result.rendered.some((line) => line.includes('자동치환')), false);
});

test('renderGlobalValidationHint truncates chips to 8 and shows +n summary', () => {
  const result = runValidationUiScenario({
    currentErrors: [],
    initialInvalidIndexes: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    currentIndex: 0,
    questionCount: 10,
  });
  assert.equal(result.saveDisabled, true);
  assert.equal(result.rendered.some((line) => line.includes('다른 문항 9개')), true);
  assert.equal(result.rendered.some((line) => line.includes('2번')), true);
  assert.equal(result.rendered.some((line) => line.includes('9번')), true);
  assert.equal(result.rendered.some((line) => line.includes('10번')), false);
  assert.equal(result.rendered.some((line) => line.includes('+1개')), true);
});

test('updateJsonAndValidation prioritizes current question errors over global hint', () => {
  const result = runValidationUiScenario({
    currentErrors: ['현재 문항 오류'],
    initialInvalidIndexes: [1],
    currentIndex: 0,
  });
  assert.equal(result.saveDisabled, true);
  assert.equal(result.isHidden, false);
  assert.equal(result.rendered.some((line) => line.includes('현재 문항 오류')), true);
  assert.equal(result.rendered.some((line) => line.includes('다른 문항')), false);
});

test('updateJsonAndValidation shows deferred warning summary with current question errors', () => {
  const result = runValidationUiScenario({
    currentErrors: ['현재 문항 오류'],
    initialInvalidIndexes: [1],
    currentIndex: 0,
    compatDiagnostics: {
      errors: [],
      warnings: ['경고'],
      quickFixes: [],
    },
  });
  assert.equal(result.saveDisabled, true);
  assert.equal(result.isHidden, false);
  assert.equal(result.warningHidden, false);
  assert.equal(result.rendered.some((line) => line.includes('현재 문항 오류')), true);
  assert.equal(result.rendered.some((line) => line.includes('다른 문항 경고 1건')), false);
  assert.equal(result.renderedWarnings.some((line) => line.includes('다른 문항 경고 1건')), true);
});

test('source namespaces autosave keys and keeps legacy restore fallback', () => {
  assert.equal(/const LEGACY_AUTO_SAVE_KEY = 'json-editor-autosave';/.test(appSource), true);
  assert.equal(/const LEGACY_AUTO_SAVE_IMAGE_DB = 'json-editor-autosave-assets';/.test(appSource), true);
  assert.equal(/const AUTO_SAVE_SCOPE = \(\(\) => \{[\s\S]*?window\?\.location\?\.pathname[\s\S]*?\}\)\(\);/.test(appSource), true);
  assert.equal(/const AUTO_SAVE_KEY = `\$\{LEGACY_AUTO_SAVE_KEY\}:\$\{AUTO_SAVE_SCOPE\}`;/.test(appSource), true);
  assert.equal(/const AUTO_SAVE_IMAGE_DB = `\$\{LEGACY_AUTO_SAVE_IMAGE_DB\}:\$\{AUTO_SAVE_SCOPE\}`;/.test(appSource), true);
  assert.equal(/restoreFromLocalStorage = async \(\) => \{[\s\S]*?localStorage\.getItem\(LEGACY_AUTO_SAVE_KEY\)/.test(appSource), true);
});

test('restoreFromLocalStorage migrates legacy image snapshot to scoped db when possible', async () => {
  const raw = JSON.stringify({ questions: [{ id: 'Q1' }], currentIndex: 0 });
  const result = await runRestoreFromLocalStorageScenario({
    scopedRaw: null,
    legacyRaw: raw,
    restoreImagesResult: true,
    hasImagesAfterRestore: true,
    migrateStatus: 'saved',
  });

  assert.equal(result.restored, true);
  assert.equal(result.calls.restoreImages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.calls.restoreImages[0])), { raw, dbName: 'legacy-db' });
  assert.equal(result.calls.saveImages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.calls.saveImages[0])), {
    raw,
    snapshotKey: 'snapshot-key',
    options: { dbName: 'scoped-db', metaKey: 'scoped-key' },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.calls.deleteSnapshot)), ['legacy-db']);
  assert.equal(result.store.get('scoped-key'), raw);
  assert.equal(result.store.has('legacy-key'), false);
  assert.equal(result.sandbox._lastSavedImageSnapshotKey, 'snapshot-key');
  assert.equal(result.sandbox._lastSavedImageMetaSignature, 'meta-signature');
});

test('restoreFromLocalStorage keeps legacy fallback when image migration fails', async () => {
  const raw = JSON.stringify({ questions: [{ id: 'Q1' }], currentIndex: 0 });
  const result = await runRestoreFromLocalStorageScenario({
    scopedRaw: null,
    legacyRaw: raw,
    restoreImagesResult: true,
    hasImagesAfterRestore: true,
    migrateStatus: 'failed',
  });

  assert.equal(result.restored, true);
  assert.equal(result.calls.saveImages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.calls.saveImages[0])), {
    raw,
    snapshotKey: 'snapshot-key',
    options: { dbName: 'scoped-db', metaKey: 'scoped-key' },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.calls.deleteSnapshot)), []);
  assert.equal(result.store.has('legacy-key'), true);
  assert.equal(result.store.has('scoped-key'), false);
  assert.equal(result.sandbox._lastSavedImageSnapshotKey, 'snapshot-key');
  assert.equal(result.sandbox._lastSavedImageMetaSignature, 'meta-signature');
});

test('restore fallback keeps writing autosave meta to legacy key until migration succeeds', async () => {
  const raw = JSON.stringify({ questions: [{ id: 'Q1' }], currentIndex: 0 });
  const result = await runRestoreFromLocalStorageScenario({
    scopedRaw: null,
    legacyRaw: raw,
    restoreImagesResult: true,
    hasImagesAfterRestore: true,
    migrateStatus: 'failed',
    runSaveAfterRestore: true,
  });

  assert.equal(result.restored, true);
  assert.equal(result.store.has('legacy-key'), true);
  assert.equal(result.store.has('scoped-key'), false);
  const savedRaw = result.store.get('legacy-key');
  assert.equal(typeof savedRaw, 'string');
  assert.equal(savedRaw.includes('"questions"'), true);
  assert.equal(result.calls.scheduleImageAutoSave.includes('"questions"'), true);
});

test('restoreFromLocalStorage skips malformed question entries', async () => {
  const raw = JSON.stringify({
    questions: [{ id: 'Q1', text: 'ok' }, null, 123, ['bad']],
    currentIndex: 0,
  });
  const result = await runRestoreFromLocalStorageScenario({
    scopedRaw: raw,
    hasImagesAfterRestore: false,
  });

  assert.equal(result.restored, true);
  assert.equal(result.state.questions.length, 1);
  assert.equal(result.state.questions[0].id, 'Q1');
});

test('restoreFromLocalStorage normalizes restored variables and trims ID', async () => {
  const raw = JSON.stringify({
    questions: [{
      id: '  Q1  ',
      text: 'x',
      answer: 'x',
      variables: [null, 123, ['bad'], { name: 'a', min: '1', max: '2' }, { name: 'b' }],
    }],
    currentIndex: 0,
  });
  const result = await runRestoreFromLocalStorageScenario({
    scopedRaw: raw,
    hasImagesAfterRestore: false,
  });

  assert.equal(result.restored, true);
  assert.equal(result.state.questions.length, 1);
  assert.equal(result.state.questions[0].id, 'Q1');
  assert.deepEqual(JSON.parse(JSON.stringify(result.state.questions[0].variables)), [
    { name: 'a', min: '1', max: '2' },
    { name: 'b', min: '', max: '' },
  ]);
});

test('restoreFromLocalStorage preserves repeated variable names for validation', async () => {
  const raw = JSON.stringify({
    questions: [{
      id: 'Q1',
      text: '*a*',
      answer: 'a',
      variables: [
        { name: 'a', min: '1', max: '2' },
        { name: 'a', min: '3', max: '4' },
        { name: 'b', min: '5', max: '6' },
      ],
    }],
    currentIndex: 0,
  });
  const result = await runRestoreFromLocalStorageScenario({
    scopedRaw: raw,
    hasImagesAfterRestore: false,
  });

  assert.equal(result.restored, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.state.questions[0].variables)), [
    { name: 'a', min: '1', max: '2' },
    { name: 'a', min: '3', max: '4' },
    { name: 'b', min: '5', max: '6' },
  ]);
});

test('restoreFromLocalStorage preserves invalid points for later validation', async () => {
  const raw = JSON.stringify({
    questions: [{
      id: 'Q1',
      text: '*a*',
      answer: 'a',
      points: '-2',
      variables: [{ name: 'a', min: '1', max: '2' }],
    }],
    currentIndex: 0,
  });
  const result = await runRestoreFromLocalStorageScenario({
    scopedRaw: raw,
    hasImagesAfterRestore: false,
  });

  assert.equal(result.restored, true);
  assert.equal(result.state.questions[0].points, '-2');
});

test('restoreFromLocalStorage normalizes malformed text fields to safe defaults', async () => {
  const raw = JSON.stringify({
    questions: [{
      id: { bad: true },
      title: 123,
      text: { body: 'x' },
      answer: ['bad'],
      points: { bad: true },
      variables: [{ name: { bad: true }, min: {}, max: false }, { name: 'x', min: 0, max: '1' }],
    }],
    currentIndex: 0,
  });
  const result = await runRestoreFromLocalStorageScenario({
    scopedRaw: raw,
    hasImagesAfterRestore: false,
  });

  assert.equal(result.restored, true);
  assert.equal(result.state.questions.length, 1);
  assert.equal(result.state.questions[0].id, '');
  assert.equal(result.state.questions[0].title, '');
  assert.equal(result.state.questions[0].text, '');
  assert.equal(result.state.questions[0].answer, '');
  assert.equal(result.state.questions[0].points, '');
  assert.deepEqual(JSON.parse(JSON.stringify(result.state.questions[0].variables)), [
    { name: '', min: '', max: '' },
    { name: 'x', min: 0, max: '1' },
  ]);
});

test('restoreFromLocalStorage returns false when all question entries are malformed', async () => {
  const raw = JSON.stringify({
    questions: [null, 123, ['bad'], 'Q1'],
    currentIndex: 0,
  });
  const result = await runRestoreFromLocalStorageScenario({
    scopedRaw: raw,
    hasImagesAfterRestore: false,
  });

  assert.equal(result.restored, false);
  assert.equal(result.state.questions.length, 0);
  assert.equal(result.calls.restoreImages.length, 0);
});

test('source uses shared question-label formatter for main and preview trees', () => {
  assert.equal(/const formatQuestionTreeLabel = \(index, question\) =>/.test(appSource), true);
  assert.equal(
    /const formatQuestionTreeLabel = \(index, question\) => \{[\s\S]*?return `\$\{safeIndex \+ 1\}번`;/.test(appSource),
    true
  );
  assert.equal(
    /updateQuestionSelectorUI = \(\) => \{[\s\S]*?dom\.questionTreeLabel\.textContent = formatQuestionTreeLabel\(/.test(appSource),
    true
  );
  assert.equal(
    /openFullPreview\(\) \{[\s\S]*?dom\.previewTreeLabel\.textContent = formatQuestionTreeLabel\(/.test(appSource),
    true
  );
});

test('full preview falls back when IntersectionObserver is unavailable', () => {
  assert.equal(
    /const canUseIntersectionObserver = typeof IntersectionObserver === 'function';/.test(appSource),
    true
  );
  assert.equal(
    /else \{\s*placeholders\.forEach\(\(el, idx\) => _renderPreviewItem\(el, idx\)\);[\s\S]*?dom\.previewModal\.addEventListener\('scroll', onPreviewScroll, \{ passive: true \}\);/.test(appSource),
    true
  );
});

test('question selector refresh reapplies active search query', () => {
  assert.equal(
    /updateQuestionSelectorUI = \(\) => \{[\s\S]*?_patchTreeItems\(dom\.questionTreeList, state\.questions, state\.currentIndex\);[\s\S]*?filterTreeItemsInList\(dom\.questionTreeList, dom\.questionTreeSearch\?\.value \|\| ''\);/.test(appSource),
    true
  );
  assert.equal(
    /openFullPreview\(\) \{[\s\S]*?_patchTreeItems\(dom\.previewTreeList, state\.questions, 0\);[\s\S]*?filterTreeItemsInList\(dom\.previewTreeList, dom\.previewTreeSearch\?\.value \|\| ''\);/.test(appSource),
    true
  );
});

test('active dropdown query reflects text edits immediately on selector refresh', () => {
  const makeElement = () => {
    const el = {
      children: [],
      dataset: {},
      style: {},
      attributes: new Map(),
      tabIndex: -1,
      _listeners: new Map(),
      _classSet: new Set(),
      _className: '',
      get className() { return this._className; },
      set className(v) {
        this._className = String(v || '');
        this._classSet = new Set(this._className.split(/\s+/).filter(Boolean));
      },
      classList: {
        add: (...names) => names.forEach((n) => el._classSet.add(n)),
        remove: (...names) => names.forEach((n) => el._classSet.delete(n)),
        contains: (name) => el._classSet.has(name),
        toggle: (name, force) => {
          const shouldAdd = force === undefined ? !el._classSet.has(name) : !!force;
          if (shouldAdd) el._classSet.add(name);
          else el._classSet.delete(name);
        },
      },
      setAttribute(name, value) { this.attributes.set(name, String(value)); },
      getAttribute(name) { return this.attributes.get(name) ?? null; },
      addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, []);
        this._listeners.get(type).push(handler);
      },
      click() {},
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        return child;
      },
      get lastElementChild() {
        return this.children.length ? this.children[this.children.length - 1] : null;
      },
      querySelectorAll(selector) {
        const isTreeItem = (node) => node?._classSet?.has('tree-item');
        const isTreeGroup = (node) => node?._classSet?.has('tree-group');
        const isVisibleTreeItem = (node) => isTreeItem(node) && node.style?.display !== 'none';
        const out = [];
        const match = (node) => {
          if (selector === '.tree-item') return isTreeItem(node);
          if (selector === '.tree-group') return isTreeGroup(node);
          if (selector === '.tree-item:not([style*="display: none"])') return isVisibleTreeItem(node);
          return false;
        };
        const walk = (node) => {
          (node.children || []).forEach((child) => {
            if (match(child)) out.push(child);
            walk(child);
          });
        };
        walk(this);
        return out;
      },
    };
    return el;
  };

  const dom = {
    questionTreeLabel: { textContent: '' },
    questionTreeList: makeElement(),
    questionTreeSearch: { value: 'target' },
  };
  const state = {
    currentIndex: 0,
    questions: [
      { id: 'Q1', title: 'A', text: 'first body' },
      { id: 'Q2', title: 'B', text: 'second body' },
    ],
  };

  const sandbox = {
    document: { createElement: () => makeElement() },
    dom,
    state,
    _escapeHtml: (s) => String(s ?? ''),
  };

  const { updateQuestionSelectorUI } = runSnippets(
    [
      extractConstStatement(appSource, 'formatQuestionTreeLabel'),
      extractConstStatement(appSource, '_treeItemSearchIndex'),
      extractConstStatement(appSource, '_makeTreeActionFocusable'),
      extractConstStatement(appSource, 'filterTreeItemsInList'),
      extractConstStatement(appSource, '_patchTreeItems'),
      extractConstStatement(appSource, 'updateQuestionSelectorUI'),
    ],
    '{ updateQuestionSelectorUI }',
    sandbox
  );

  updateQuestionSelectorUI();
  const items1 = dom.questionTreeList.querySelectorAll('.tree-item');
  const first1 = items1.find((it) => it.dataset.idx === '0');
  const second1 = items1.find((it) => it.dataset.idx === '1');
  assert.equal(first1.style.display, 'none');
  assert.equal(second1.style.display, 'none');

  state.questions[1].text = 'contains TARGET keyword';
  updateQuestionSelectorUI();
  const items2 = dom.questionTreeList.querySelectorAll('.tree-item');
  const first2 = items2.find((it) => it.dataset.idx === '0');
  const second2 = items2.find((it) => it.dataset.idx === '1');
  assert.equal(first2.style.display, 'none');
  assert.equal(second2.style.display, '');
});

test('tree dropdown search index includes ID, title, and text', () => {
  assert.equal(
    /const _treeItemSearchIndex = new WeakMap\(\);/.test(appSource),
    true
  );
  assert.equal(
    /_treeItemSearchIndex\.set\(item, `\$\{q\.id \|\| ''\} \$\{q\.title \|\| ''\} \$\{q\.text \|\| ''\}`\.toLowerCase\(\)\);/.test(appSource),
    true
  );
  assert.equal(
    /const key = `\$\{idx\}\\u0000\$\{q\.id \|\| ''\}\\u0000\$\{q\.title \|\| ''\}`;/.test(appSource),
    true
  );
});

test('variable bounds edits schedule autosave debounce', () => {
  assert.equal(
    /const scheduleMetaAutoSave = \(\) => \{[\s\S]*?_saveTimer = setTimeout\(saveToLocalStorage, 500\);/.test(appSource),
    true
  );
  assert.equal(
    /dom\.variablesContainer\.addEventListener\('input'[\s\S]*?updateJsonAndValidation\(\);[\s\S]*?scheduleMetaAutoSave\(\);/.test(appSource),
    true
  );
});

test('answer toolbar blocked buttons use aria-disabled with action hint feedback', () => {
  assert.equal(
    appSource.includes('정답식 모드로 일부 버튼이 비활성화됩니다'),
    false
  );
  assert.equal(appSource.includes('toolbar-policy-hint'), false);
  assert.equal(appSource.includes('toolbarPolicyHint'), false);
  assert.equal(appSource.includes('toolbar-action-hint'), true);
  assert.equal(appSource.includes('btn.disabled = blocked'), false);
  assert.equal(appSource.includes("btn.dataset.blocked = blocked ? '1' : '0';"), true);
  assert.equal(appSource.includes("btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');"), true);
  assert.equal(appSource.includes("const blocked = btn.getAttribute('aria-disabled') === 'true' || btn.dataset.blocked === '1';"), true);
  assert.equal(appSource.includes('if (btn.disabled) return;'), false);
});

test('applyRandomExamCompatQuickFix supports text compatibility quick-fix actions', () => {
  assert.equal(appSource.includes("fix.action !== 'replace_text_unicode_symbols'"), true);
  assert.equal(appSource.includes("fix.action !== 'normalize_text_unicode'"), true);
  assert.equal(appSource.includes("fix.action !== 'wrap_math_only_text_commands'"), true);
  assert.equal(appSource.includes("fix.action !== 'replace_unicode_supsub'"), true);
  assert.equal(appSource.includes('compatApi.replaceTextUnicodeSymbolsWithLatexInText'), true);
  assert.equal(appSource.includes('compatApi.normalizeTextUnicode'), true);
  assert.equal(appSource.includes('compatApi.wrapMathOnlyCommandsOutsideMathInText'), true);
  assert.equal(appSource.includes('compatApi.replaceUnicodeSupSubWithLatexInText'), true);
});
