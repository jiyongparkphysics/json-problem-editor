import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const APP_JS_PATH = path.resolve(process.cwd(), 'app.js');
const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');

function extractFunctionDeclaration(source, fnName) {
  const signature = `function ${fnName}(`;
  let start = source.indexOf(signature);
  if (start < 0) {
    throw new Error(`Cannot find function declaration: ${fnName}`);
  }
  if (start >= 6 && source.slice(start - 6, start) === 'async ') {
    start -= 6;
  }

  const bodyStart = source.indexOf('{', start);
  if (bodyStart < 0) {
    throw new Error(`Cannot find function body start: ${fnName}`);
  }

  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) {
    throw new Error(`Cannot find function body end: ${fnName}`);
  }
  return source.slice(start, end);
}

function extractConstStatement(source, constName) {
  const signature = `const ${constName} =`;
  const start = source.indexOf(signature);
  if (start < 0) {
    throw new Error(`Cannot find const statement: ${constName}`);
  }

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

  throw new Error(`Cannot find const statement end: ${constName}`);
}

function loadZipMappingFns() {
  const fns = [
    '_normalizeZipPath',
    '_zipDir',
    '_buildZipImageIndex',
    '_resolveImageEntryForQuestion',
  ].map((name) => extractFunctionDeclaration(appSource, name));

  const sandbox = {};
  vm.createContext(sandbox);
  const script = new vm.Script(`${fns.join('\n\n')}\n({ _normalizeZipPath, _zipDir, _buildZipImageIndex, _resolveImageEntryForQuestion });`);
  return script.runInContext(sandbox);
}

function loadImportMappingFns(overrides = {}) {
  const fns = [
    extractConstStatement(appSource, 'normalizeQuestionPoints'),
    extractConstStatement(appSource, 'coerceQuestionPointsInput'),
    extractConstStatement(appSource, 'normalizeQuestionVariables'),
    extractFunctionDeclaration(appSource, '_mapQuestion'),
    extractFunctionDeclaration(appSource, '_parseFileForImport'),
  ];

  const sandbox = {
    normalizeQuestionId: (id) => String(id ?? '').trim(),
    _resolveImageEntryForQuestion: () => null,
    _mapQuestionAsync: async () => null,
    ...overrides,
  };
  vm.createContext(sandbox);
  const script = new vm.Script(`${fns.join('\n\n')}\n({ _mapQuestion, _parseFileForImport });`);
  return script.runInContext(sandbox);
}

function loadZipImportRuntimeFns(overrides = {}) {
  const fns = [
    extractFunctionDeclaration(appSource, '_normalizeZipPath'),
    extractFunctionDeclaration(appSource, '_zipDir'),
    extractFunctionDeclaration(appSource, '_buildZipImageIndex'),
    extractFunctionDeclaration(appSource, '_resolveImageEntryForQuestion'),
    extractConstStatement(appSource, 'normalizeQuestionPoints'),
    extractConstStatement(appSource, 'coerceQuestionPointsInput'),
    extractConstStatement(appSource, 'normalizeQuestionVariables'),
    extractConstStatement(appSource, 'IMPORT_MATERIALIZE_BATCH_SIZE'),
    extractFunctionDeclaration(appSource, '_mapQuestion'),
    extractFunctionDeclaration(appSource, '_getImportImageRef'),
    extractFunctionDeclaration(appSource, '_hasDeferredImportImage'),
    extractFunctionDeclaration(appSource, '_cloneImportQuestion'),
    extractFunctionDeclaration(appSource, '_materializeDeferredImportImage'),
    extractFunctionDeclaration(appSource, '_yieldToUi'),
    extractFunctionDeclaration(appSource, '_materializeImportQuestions'),
    extractFunctionDeclaration(appSource, '_mapQuestionAsync'),
    extractFunctionDeclaration(appSource, '_parseFileForImport'),
  ];

  const sandbox = {
    Blob: globalThis.Blob,
    normalizeQuestionId: (id) => String(id ?? '').trim(),
    MAX_IMAGE_BYTES: 5 * 1024 * 1024,
    _blobToDataUrl: async () => 'data:image/png;base64,stub',
    requestAnimationFrame: (cb) => {
      cb();
      return 1;
    },
    JSZip: {
      async loadAsync() {
        throw new Error('JSZip.loadAsync override required in this test');
      },
    },
    ...overrides,
  };
  vm.createContext(sandbox);
  const script = new vm.Script(
    `${fns.join('\n\n')}\n({ _buildZipImageIndex, _mapQuestionAsync, _materializeImportQuestions, _parseFileForImport });`
  );
  return script.runInContext(sandbox);
}

function makeZip(entries) {
  return {
    forEach(cb) {
      entries.forEach((entry) => cb(entry.path, entry));
    },
  };
}

test('normalize path keeps case and normalizes slashes', () => {
  const { _normalizeZipPath } = loadZipMappingFns();
  assert.equal(_normalizeZipPath('\\A\\B\\Q1.PNG'), 'A/B/Q1.PNG');
  assert.equal(_normalizeZipPath('/Root/AA/q1.png'), 'Root/AA/q1.png');
});

test('resolve prefers same-folder + exact-case match', () => {
  const { _buildZipImageIndex, _resolveImageEntryForQuestion } = loadZipMappingFns();

  const q1Upper = { dir: false, path: 'A/Q1.png', name: 'A/Q1.png' };
  const q1Lower = { dir: false, path: 'A/q1.png', name: 'A/q1.png' };
  const zip = makeZip([q1Upper, q1Lower]);
  const idx = _buildZipImageIndex(zip, ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

  const resolvedUpper = _resolveImageEntryForQuestion(idx, 'Q1', 'A/questions.json');
  const resolvedLower = _resolveImageEntryForQuestion(idx, 'q1', 'A/questions.json');
  assert.equal(resolvedUpper, q1Upper);
  assert.equal(resolvedLower, q1Lower);
});

test('resolve returns null when same-folder exact-case candidates are ambiguous', () => {
  const { _buildZipImageIndex, _resolveImageEntryForQuestion } = loadZipMappingFns();

  const a1 = { dir: false, path: 'A/Q1.png', name: 'A/Q1.png' };
  const a2 = { dir: false, path: 'A/Q1.jpg', name: 'A/Q1.jpg' };
  const zip = makeZip([a1, a2]);
  const idx = _buildZipImageIndex(zip, ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

  const resolved = _resolveImageEntryForQuestion(idx, 'Q1', 'A/questions.json');
  assert.equal(resolved, null);
});

test('resolve falls back to globally unique exact-case basename', () => {
  const { _buildZipImageIndex, _resolveImageEntryForQuestion } = loadZipMappingFns();

  const only = { dir: false, path: 'Elsewhere/Q1.webp', name: 'Elsewhere/Q1.webp' };
  const zip = makeZip([only]);
  const idx = _buildZipImageIndex(zip, ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

  const resolved = _resolveImageEntryForQuestion(idx, 'Q1', 'A/questions.json');
  assert.equal(resolved, only);
});

test('mapQuestion skips malformed question payloads', () => {
  const { _mapQuestion } = loadImportMappingFns();
  assert.equal(_mapQuestion(null), null);
  assert.equal(_mapQuestion(123), null);
  assert.equal(_mapQuestion('Q1'), null);
  assert.equal(_mapQuestion([]), null);
});

test('mapQuestion filters malformed variables', () => {
  const { _mapQuestion } = loadImportMappingFns();
  const mapped = _mapQuestion({
    id: ' Q1 ',
    variables: [
      null,
      123,
      'x',
      ['bad'],
      { name: 'a', min: '1', max: '2' },
      { name: 'b' },
    ],
  });
  const plain = JSON.parse(JSON.stringify(mapped));
  assert.equal(plain.id, 'Q1');
  assert.deepEqual(plain.variables, [
    { name: 'a', min: '1', max: '2' },
    { name: 'b', min: '', max: '' },
  ]);
});

test('mapQuestion preserves repeated variable names and invalid points for validation', () => {
  const { _mapQuestion } = loadImportMappingFns();
  const mapped = _mapQuestion({
    id: 'Q1',
    points: '-2',
    variables: [
      { name: 'a', min: '1', max: '2' },
      { name: 'a', min: '3', max: '4' },
      { name: 'b', min: '5', max: '6' },
    ],
  });
  const plain = JSON.parse(JSON.stringify(mapped));
  assert.equal(plain.points, '-2');
  assert.deepEqual(plain.variables, [
    { name: 'a', min: '1', max: '2' },
    { name: 'a', min: '3', max: '4' },
    { name: 'b', min: '5', max: '6' },
  ]);
});

test('mapQuestion normalizes malformed field types to safe defaults', () => {
  const { _mapQuestion } = loadImportMappingFns();
  const mapped = _mapQuestion({
    id: { bad: true },
    title: 123,
    text: { x: 1 },
    answer: ['a'],
    variables: [
      { name: { bad: true }, min: {}, max: false },
      { name: 'x', min: 0, max: '1' },
    ],
  });
  const plain = JSON.parse(JSON.stringify(mapped));
  assert.equal(plain.id, '');
  assert.equal(plain.title, '');
  assert.equal(plain.text, '');
  assert.equal(plain.answer, '');
  assert.deepEqual(plain.variables, [
    { name: '', min: '', max: '' },
    { name: 'x', min: 0, max: '1' },
  ]);
});

test('parseFileForImport skips malformed questions in plain json import', async () => {
  const { _parseFileForImport } = loadImportMappingFns();
  const result = await _parseFileForImport({
    name: 'questions.json',
    async text() {
      return JSON.stringify([
        { id: 'Q1', title: 'ok' },
        null,
        123,
        ['bad'],
        { id: 'Q2', variables: [null, { name: 'x', min: '0', max: '1' }] },
      ]);
    },
  });

  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0].id, 'Q1');
  assert.equal(result.questions[1].id, 'Q2');
  assert.deepEqual(JSON.parse(JSON.stringify(result.questions[1].variables)), [
    { name: 'x', min: '0', max: '1' },
  ]);
});

test('parseFileForImport rejects when every plain json question is malformed', async () => {
  const { _parseFileForImport } = loadImportMappingFns();
  await assert.rejects(async () => _parseFileForImport({
    name: 'questions.json',
    async text() {
      return JSON.stringify([null, 123, ['bad'], 'Q1']);
    },
  }));
});

test('parseFileForImport normalizes malformed question field types', async () => {
  const { _parseFileForImport } = loadImportMappingFns();
  const result = await _parseFileForImport({
    name: 'questions.json',
    async text() {
      return JSON.stringify([{
        id: { bad: true },
        title: 1,
        text: { body: 'x' },
        answer: false,
        points: { bad: true },
        variables: [{ name: { bad: true }, min: {}, max: null }],
      }]);
    },
  });
  const q = JSON.parse(JSON.stringify(result.questions[0]));
  assert.equal(q.id, '');
  assert.equal(q.title, '');
  assert.equal(q.text, '');
  assert.equal(q.answer, '');
  assert.equal(q.points, '');
  assert.deepEqual(q.variables, [{ name: '', min: '', max: '' }]);
});

test('source import append keeps checked items across filters and reports hidden selections', () => {
  assert.equal(
    /const checked = dom\.importList\.querySelectorAll\('\.import-item input\[type="checkbox"\]:checked'\)\.length;/.test(appSource),
    true
  );
  assert.equal(
    /const visibleChecked = dom\.importList\.querySelectorAll\('\.import-item:not\(\[style\*="display: none"\]\) input\[type="checkbox"\]:checked'\)\.length;/.test(appSource),
    true
  );
  assert.equal(
    /const checkboxes = dom\.importList\.querySelectorAll\('\.import-item input\[type="checkbox"\]:checked'\);/.test(appSource),
    true
  );
  assert.equal(appSource.includes('숨김 선택'), true);
});

test('mapQuestionAsync skips oversized zip images and increments skip counter', async () => {
  const blobCalls = [];
  const { _buildZipImageIndex, _mapQuestionAsync } = loadZipImportRuntimeFns({
    MAX_IMAGE_BYTES: 10,
    _blobToDataUrl: async (blob) => {
      blobCalls.push({ size: blob.size, type: blob.type });
      return `data:${blob.type};base64,ok`;
    },
  });

  const oversizedEntry = {
    dir: false,
    path: 'A/Q1.png',
    name: 'A/Q1.png',
    async(type) {
      if (type !== 'uint8array') throw new Error('unexpected async type');
      return new Uint8Array(11);
    },
  };

  const imageIndex = _buildZipImageIndex(makeZip([oversizedEntry]), ['.png']);
  const importMeta = { skippedLargeImages: 0 };
  const question = await _mapQuestionAsync(
    { id: 'Q1', title: '', text: '', answer: '', variables: [] },
    imageIndex,
    { '.png': 'image/png' },
    'A/questions.json',
    importMeta
  );

  assert.equal(question.imageData, null);
  assert.equal(importMeta.skippedLargeImages, 1);
  assert.deepEqual(blobCalls, []);
});

test('mapQuestionAsync keeps valid zip images and converts to data url', async () => {
  const blobCalls = [];
  const { _buildZipImageIndex, _mapQuestionAsync } = loadZipImportRuntimeFns({
    MAX_IMAGE_BYTES: 10,
    _blobToDataUrl: async (blob) => {
      blobCalls.push({ size: blob.size, type: blob.type });
      return `data:${blob.type};base64,ok`;
    },
  });

  const smallEntry = {
    dir: false,
    path: 'A/Q1.png',
    name: 'A/Q1.png',
    async(type) {
      if (type !== 'uint8array') throw new Error('unexpected async type');
      return new Uint8Array([1, 2, 3, 4]);
    },
  };

  const imageIndex = _buildZipImageIndex(makeZip([smallEntry]), ['.png']);
  const importMeta = { skippedLargeImages: 0 };
  const question = await _mapQuestionAsync(
    { id: 'Q1', title: '', text: '', answer: '', variables: [] },
    imageIndex,
    { '.png': 'image/png' },
    'A/questions.json',
    importMeta
  );

  assert.equal(question.imageData, 'data:image/png;base64,ok');
  assert.equal(importMeta.skippedLargeImages, 0);
  assert.deepEqual(blobCalls, [{ size: 4, type: 'image/png' }]);
});

test('parseFileForImport zip keeps unique filePath for same basename groups', async () => {
  const jsonA = {
    dir: false,
    path: 'A/questions.json',
    name: 'A/questions.json',
    async(type) {
      if (type !== 'string') throw new Error('unexpected async type');
      return JSON.stringify([{ id: 'Q1', text: '*a*', answer: 'a', variables: [{ name: 'a', min: '1', max: '2' }] }]);
    },
  };
  const jsonB = {
    dir: false,
    path: 'B/questions.json',
    name: 'B/questions.json',
    async(type) {
      if (type !== 'string') throw new Error('unexpected async type');
      return JSON.stringify([{ id: 'Q2', text: '*b*', answer: 'b', variables: [{ name: 'b', min: '1', max: '2' }] }]);
    },
  };
  const zip = makeZip([jsonA, jsonB]);

  const { _parseFileForImport } = loadZipImportRuntimeFns({
    JSZip: { loadAsync: async () => zip },
    _blobToDataUrl: async () => 'data:image/png;base64,ok',
  });

  const result = await _parseFileForImport({ name: 'bundle.zip' });

  assert.equal(result.questions.length, 2);
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].file, 'questions.json');
  assert.equal(result.groups[1].file, 'questions.json');
  assert.equal(result.groups[0].filePath, 'A/questions.json');
  assert.equal(result.groups[1].filePath, 'B/questions.json');
  assert.notEqual(result.groups[0].filePath, result.groups[1].filePath);
});

test('parseFileForImport zip defers image conversion until actual import', async () => {
  const blobCalls = [];
  const jsonEntry = {
    dir: false,
    path: 'A/questions.json',
    name: 'A/questions.json',
    async(type) {
      if (type !== 'string') throw new Error('unexpected async type');
      return JSON.stringify([{ id: 'Q1', text: '문항', answer: '1', variables: [] }]);
    },
  };
  const imageEntry = {
    dir: false,
    path: 'A/Q1.png',
    name: 'A/Q1.png',
    async(type) {
      if (type !== 'uint8array') throw new Error('unexpected async type');
      return new Uint8Array([1, 2, 3]);
    },
  };
  const zip = makeZip([jsonEntry, imageEntry]);

  const { _parseFileForImport } = loadZipImportRuntimeFns({
    JSZip: { loadAsync: async () => zip },
    _blobToDataUrl: async (blob) => {
      blobCalls.push(blob.size);
      return 'data:image/png;base64,ok';
    },
  });

  const result = await _parseFileForImport({ name: 'bundle.zip' });

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].imageData, null);
  assert.equal(result.questions[0]._importImageRef.entry, imageEntry);
  assert.deepEqual(blobCalls, []);
});

test('materializeImportQuestions resolves deferred zip images and reports skipped count', async () => {
  const progress = [];
  const { _buildZipImageIndex, _mapQuestionAsync, _materializeImportQuestions } = loadZipImportRuntimeFns({
    MAX_IMAGE_BYTES: 5,
    _blobToDataUrl: async (blob) => `data:${blob.type};base64,${blob.size}`,
  });

  const smallEntry = {
    dir: false,
    path: 'A/Q1.png',
    name: 'A/Q1.png',
    async(type) {
      if (type !== 'uint8array') throw new Error('unexpected async type');
      return new Uint8Array([1, 2, 3]);
    },
  };
  const oversizedEntry = {
    dir: false,
    path: 'A/Q2.png',
    name: 'A/Q2.png',
    async(type) {
      if (type !== 'uint8array') throw new Error('unexpected async type');
      return new Uint8Array([1, 2, 3, 4, 5, 6]);
    },
  };
  const imageIndex = _buildZipImageIndex(makeZip([smallEntry, oversizedEntry]), ['.png']);
  const deferredA = await _mapQuestionAsync(
    { id: 'Q1', title: '', text: '', answer: '', variables: [] },
    imageIndex,
    { '.png': 'image/png' },
    'A/questions.json',
    null,
    { deferImage: true }
  );
  const deferredB = await _mapQuestionAsync(
    { id: 'Q2', title: '', text: '', answer: '', variables: [] },
    imageIndex,
    { '.png': 'image/png' },
    'A/questions.json',
    null,
    { deferImage: true }
  );

  const result = await _materializeImportQuestions([deferredA, deferredB], {
    onProgress(done, total) {
      progress.push(`${done}/${total}`);
    },
  });

  assert.equal(result.skippedLargeImages, 1);
  assert.equal(result.questions[0].imageData, 'data:image/png;base64,3');
  assert.equal(result.questions[1].imageData, null);
  assert.equal('_importImageRef' in result.questions[0], false);
  assert.equal('_importImageRef' in result.questions[1], false);
  assert.deepEqual(progress, ['1/2', '2/2']);
});
