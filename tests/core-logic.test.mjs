import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const APP_JS_PATH = path.resolve(process.cwd(), 'app.js');
const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');

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

function loadValidateQuestionFn({ unknownSymbolsInAnswer, questions } = {}) {
  const sandbox = {
    unknownSymbolsInAnswer: unknownSymbolsInAnswer ?? (() => ({ unknown: [] })),
    state: { questions: questions ?? [] },
  };

  return runSnippets(
    [
      extractConstStatement(appSource, 'normalizeQuestionId'),
      extractConstStatement(appSource, 'normalizeQuestionPoints'),
      extractConstStatement(appSource, 'extractVariables'),
      extractConstStatement(appSource, 'getDecimalPlaces'),
      extractConstStatement(appSource, 'getDuplicateIdIndexes'),
      extractConstStatement(appSource, 'validateQuestion'),
    ],
    '{ validateQuestion }',
    sandbox
  );
}

function loadValidationCacheFns({ unknownSymbolsInAnswer, questions } = {}) {
  const sandbox = {
    unknownSymbolsInAnswer: unknownSymbolsInAnswer ?? (() => ({ unknown: [] })),
    state: { questions: questions ?? [] },
  };

  return runSnippets(
    [
      extractConstStatement(appSource, 'normalizeQuestionId'),
      extractConstStatement(appSource, 'normalizeQuestionPoints'),
      extractConstStatement(appSource, 'extractVariables'),
      extractConstStatement(appSource, 'getDecimalPlaces'),
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
} = {}) {
  const classSet = new Set(['hidden']);
  const rendered = [];
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

  const classList = {
    add(name) { classSet.add(name); },
    remove(name) { classSet.delete(name); },
    contains(name) { return classSet.has(name); },
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
        return {
          textContent: '',
          className: '',
          type: 'div',
          dataset: {},
          children: [],
          appendChild(node) { this.children.push(node); },
        };
      },
    },
    dom,
    state,
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
      extractConstStatement(appSource, 'renderValidationErrors'),
      extractConstStatement(appSource, '_formatQuestionRef'),
      extractConstStatement(appSource, '_buildGlobalValidationHint'),
      extractConstStatement(appSource, 'renderGlobalValidationHint'),
      extractConstStatement(appSource, 'updateJsonAndValidation'),
    ],
    '{ updateJsonAndValidation }',
    sandbox
  );

  updateJsonAndValidation();
  return {
    saveDisabled: dom.saveBtn.disabled,
    isHidden: classList.contains('hidden'),
    rendered,
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

test('validateQuestion: reports unknown symbols from answer analysis', () => {
  const question = {
    id: 'Q1',
    text: '값은 *a*',
    answer: 'a+c',
    variables: [{ name: 'a', min: '1', max: '2' }],
  };
  const { validateQuestion } = loadValidateQuestionFn({
    unknownSymbolsInAnswer: () => ({ unknown: ['c'] }),
    questions: [question],
  });
  const errs = validateQuestion(question, 0);
  assert.ok(errs.some((e) => e.includes('없는 기호') && e.includes('c')));
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

  assert.equal(frac, '((a)/(b))');
  assert.equal(logb, 'log((x),(2))');
  assert.equal(trig, 'sin((x))+2*x');
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
  assert.equal(result.rendered.some((line) => line.includes('2번 문항')), true);
  assert.equal(result.rendered.some((line) => line.includes('오류 문항:')), false);
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
  assert.equal(result.rendered.some((line) => line.includes('2번 문항')), true);
  assert.equal(result.rendered.some((line) => line.includes('9번 문항')), true);
  assert.equal(result.rendered.some((line) => line.includes('10번 문항')), false);
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
