import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const INDEX_HTML_PATH = path.resolve(process.cwd(), 'index.html');
const README_PATH = path.resolve(process.cwd(), 'README.md');
const USER_GUIDE_MD_PATH = path.resolve(process.cwd(), 'USER_GUIDE.md');
const MANUAL_TEST_CHECKLIST_PATH = path.resolve(process.cwd(), 'MANUAL_TEST_CHECKLIST.md');
const STYLE_CSS_PATH = path.resolve(process.cwd(), 'style.css');
const APP_JS_PATH = path.resolve(process.cwd(), 'app.js');
const TOOLBAR_CONFIG_PATH = path.resolve(process.cwd(), 'toolbar-config.js');
const TOOLBAR_UI_PATH = path.resolve(process.cwd(), 'toolbar-ui.js');
const indexSource = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const readmeSource = fs.readFileSync(README_PATH, 'utf8');
const userGuideMdSource = fs.readFileSync(USER_GUIDE_MD_PATH, 'utf8');
const manualChecklistSource = fs.readFileSync(MANUAL_TEST_CHECKLIST_PATH, 'utf8');
const styleSource = fs.readFileSync(STYLE_CSS_PATH, 'utf8');
const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');
const toolbarConfigSource = fs.readFileSync(TOOLBAR_CONFIG_PATH, 'utf8');
const toolbarUiSource = fs.readFileSync(TOOLBAR_UI_PATH, 'utf8');

function loadToolbarDef() {
  const sandbox = { window: {}, globalThis: {} };
  vm.createContext(sandbox);
  new vm.Script(toolbarConfigSource).runInContext(sandbox);
  const api = sandbox.window.ToolbarConfig || sandbox.globalThis.ToolbarConfig;
  assert.ok(api && api.TOOLBAR_DEF);
  return api.TOOLBAR_DEF;
}

function loadToolbarTabs() {
  const sandbox = { window: {}, globalThis: {} };
  vm.createContext(sandbox);
  new vm.Script(toolbarConfigSource).runInContext(sandbox);
  const api = sandbox.window.ToolbarConfig || sandbox.globalThis.ToolbarConfig;
  assert.ok(api && Array.isArray(api.TOOLBAR_TABS));
  return api.TOOLBAR_TABS;
}

test('index has third-party notice wrapper id', () => {
  assert.equal(indexSource.includes('id="third-party-notices-link"'), true);
});

test('header exposes user guide button linked to USER_GUIDE.md', () => {
  assert.equal(
    /id="user-guide-btn"[^>]*href="USER_GUIDE\.md"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/.test(indexSource),
    true
  );
  assert.equal(
    /id="user-guide-btn"[^>]*class="[^"]*btn-guide[^"]*"/.test(indexSource),
    true
  );
  assert.equal(
    /id="user-guide-btn"[\s\S]*?사용자 가이드/.test(indexSource),
    true
  );
  assert.equal(
    /id="user-guide-btn"[\s\S]*?<span class="text-sm text-gray-700">문항:/.test(indexSource),
    true
  );
});

test('README and guide file references use direct USER_GUIDE.md path', () => {
  assert.equal(readmeSource.includes('- 사용자 가이드: `USER_GUIDE.md`'), true);
  assert.equal(userGuideMdSource.includes('# 문제 JSON 편집기 사용자 가이드'), true);
  assert.equal(userGuideMdSource.includes('## 6) random-exam-generator 호환 작성 가이드'), true);
});

test('validation error/warning regions expose live accessibility attributes', () => {
  assert.equal(
    /id="validation-errors"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/.test(indexSource),
    true
  );
  assert.equal(
    /id="validation-warnings"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/.test(indexSource),
    true
  );
});

test('toolbar tablist and tabs declare accessibility attributes', () => {
  assert.equal(/id="toolbar-tablist"[^>]*role="tablist"[^>]*aria-label="LaTeX 툴바 탭"/.test(indexSource), true);
  assert.equal(/id="toolbar-tab-basic"[^>]*role="tab"[^>]*aria-selected="true"[^>]*aria-controls="toolbar-basic"[^>]*tabindex="0"/.test(indexSource), true);
  assert.equal(/id="toolbar-tab-greek"[^>]*role="tab"[^>]*aria-selected="false"[^>]*aria-controls="toolbar-greek"[^>]*tabindex="-1"/.test(indexSource), true);
  assert.equal(/id="toolbar-tab-functionParen"[^>]*role="tab"[^>]*aria-selected="false"[^>]*aria-controls="toolbar-functionParen"[^>]*tabindex="-1"/.test(indexSource), true);
});

test('toolbar panels are present with action hint region and no legacy policy hint', () => {
  assert.equal(indexSource.includes('id="toolbar-policy-hint"'), false);
  assert.equal(/id="toolbar-action-hint"[^>]*aria-live="polite"/.test(indexSource), true);
  assert.equal(/id="toolbar-basic"[^>]*role="tabpanel"[^>]*aria-labelledby="toolbar-tab-basic"/.test(indexSource), true);
  assert.equal(/id="toolbar-functions"[^>]*role="tabpanel"[^>]*aria-labelledby="toolbar-tab-functions"[^>]*hidden/.test(indexSource), true);
  assert.equal(/id="toolbar-functionParen"[^>]*role="tabpanel"[^>]*aria-labelledby="toolbar-tab-functionParen"[^>]*hidden/.test(indexSource), true);
});

test('focus indicator uses mode classes for text/answer color tone', () => {
  assert.equal(/id="focus-indicator"[^>]*class="[^"]*focus-indicator[^"]*mode-text[^"]*"/.test(indexSource), true);
  assert.equal(/\.focus-indicator\.mode-text\s*\{[\s\S]*?color:\s*#2563eb;[\s\S]*?background-color:\s*#eff6ff;[\s\S]*?border-color:\s*#bfdbfe;[\s\S]*?\}/.test(styleSource), true);
  assert.equal(/\.focus-indicator\.mode-answer\s*\{[\s\S]*?color:\s*#b45309;[\s\S]*?background-color:\s*#fffbeb;[\s\S]*?border-color:\s*#fde68a;[\s\S]*?\}/.test(styleSource), true);
  assert.equal(appSource.includes("dom.focusIndicator.classList.toggle('mode-text', isTextMode);"), true);
  assert.equal(appSource.includes("dom.focusIndicator.classList.toggle('mode-answer', !isTextMode);"), true);
});

test('toolbar scroll area does not use invalid max-h-50 utility', () => {
  assert.equal(indexSource.includes('max-h-50'), false);
  assert.equal(/\.toolbar-scroll\s*\{[\s\S]*?max-height:\s*12\.5rem;[\s\S]*?\}/.test(styleSource), true);
});

test('toolbar modules are loaded before app script', () => {
  const compatSharedIdx = indexSource.indexOf('compat/shared.js?v=');
  const compatTextIdx = indexSource.indexOf('compat/text.js?v=');
  const compatAnswerIdx = indexSource.indexOf('compat/answer.js?v=');
  const compatIdx = indexSource.indexOf('random-exam-compat.js?v=');
  const configIdx = indexSource.indexOf('toolbar-config.js?v=');
  const uiIdx = indexSource.indexOf('toolbar-ui.js?v=');
  const appIdx = indexSource.indexOf('app.js?v=');
  assert.equal(compatSharedIdx >= 0, true);
  assert.equal(compatTextIdx > compatSharedIdx, true);
  assert.equal(compatAnswerIdx > compatTextIdx, true);
  assert.equal(compatIdx > compatAnswerIdx, true);
  assert.equal(compatIdx >= 0, true);
  assert.equal(configIdx > compatIdx, true);
  assert.equal(uiIdx > configIdx, true);
  assert.equal(appIdx > uiIdx, true);
});

test('toolbar config includes overline/underline and sum-prod group split', () => {
  assert.equal(toolbarConfigSource.includes("cmd: 'overline'"), true);
  assert.equal(toolbarConfigSource.includes("cmd: 'underline'"), true);
  assert.equal(toolbarConfigSource.includes("title: '밑줄'"), true);
  assert.equal(toolbarConfigSource.includes("title: '무한대'"), true);
  assert.equal(toolbarConfigSource.includes("title: '합/곱 기호'"), true);
  assert.equal(toolbarConfigSource.includes("title: '미적분 기호'"), false);
});

test('toolbar config includes function parenthesis templates', () => {
  assert.equal(toolbarConfigSource.includes('functionParen: {'), true);
  assert.equal(toolbarConfigSource.includes("title: '삼각함수'"), true);
  assert.equal(toolbarConfigSource.includes("title: '역삼각함수'"), true);
  assert.equal(toolbarConfigSource.includes("title: '쌍곡선함수'"), true);
  assert.equal(toolbarConfigSource.includes("title: '로그/지수'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\sin(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\cos(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\tan(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\arcsin(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\arccos(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\arctan(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\sinh(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\cosh(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\tanh(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\ln(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\log(|)'"), true);
  assert.equal(toolbarConfigSource.includes("tpl: '\\\\exp(|)'"), true);
  assert.equal(toolbarConfigSource.includes("cls: 'text-xs px-2'"), true);
  assert.equal(toolbarConfigSource.includes("label: 'sin(x)'"), true);
  assert.equal(toolbarConfigSource.includes("label: 'arcsin(x)'"), true);
  assert.equal(toolbarConfigSource.includes("label: 'sinh(x)'"), true);
  assert.equal(toolbarConfigSource.includes("label: 'arctan(x)'"), true);
  assert.equal(toolbarConfigSource.includes("labelHtml: '$\\\\sin(x)$'"), false);
});

test('operators groups keep calculus before infinity', () => {
  const toolbarDef = loadToolbarDef();
  const titles = toolbarDef.operators.groups.map((g) => g.title);
  const calcIdx = titles.indexOf('적분/미분 기호');
  const infIdx = titles.indexOf('무한대');
  assert.equal(calcIdx >= 0, true);
  assert.equal(infIdx >= 0, true);
  assert.equal(calcIdx < infIdx, true);
});

test('toolbar blocked templates require explicit policyKey to prevent omissions', () => {
  const toolbarDef = loadToolbarDef();
  const allowedTplInAnswer = new Set([
    '^{|}',
    '\\left( |\\right)',
    '\\left[ |\\right]',
    '\\sin(|)',
    '\\cos(|)',
    '\\tan(|)',
    '\\arcsin(|)',
    '\\arccos(|)',
    '\\arctan(|)',
    '\\sinh(|)',
    '\\cosh(|)',
    '\\tanh(|)',
    '\\ln(|)',
    '\\exp(|)',
  ]);
  const knownPolicyKeys = new Set([
    'answer_no_var_wrap',
    'answer_no_math_delimiter',
    'answer_no_log_base',
    'answer_no_brace_lr',
    'answer_no_subscript',
    'answer_no_percent',
    'answer_no_prime_degree',
  ]);

  for (const tab of Object.values(toolbarDef)) {
    for (const group of (tab.groups || [])) {
      for (const btn of (group.buttons || [])) {
        if (btn.policyKey) {
          assert.equal(knownPolicyKeys.has(btn.policyKey), true, `unknown policyKey: ${btn.policyKey}`);
        }
        if (btn.kind === 'wrap') {
          assert.equal(Boolean(btn.policyKey), true, `missing policyKey for wrap button: ${btn.label || btn.prefix || '(unknown)'}`);
        }
        if (btn.kind === 'tpl' && !allowedTplInAnswer.has(btn.tpl)) {
          assert.equal(Boolean(btn.policyKey), true, `missing policyKey for blocked tpl: ${btn.tpl}`);
        }
      }
    }
  }
});

test('var wrap button enables smart insertion mode', () => {
  const toolbarDef = loadToolbarDef();
  const basicGroups = toolbarDef.basic?.groups || [];
  let varWrap = null;
  for (const group of basicGroups) {
    for (const btn of (group.buttons || [])) {
      if (btn.kind === 'wrap' && btn.label === 'var') {
        varWrap = btn;
      }
    }
  }
  assert.equal(Boolean(varWrap), true);
  assert.equal(varWrap.smartInsert, 'var');
});

test('toolbar tab order includes separate function parentheses tab', () => {
  const tabs = loadToolbarTabs();
  assert.deepEqual(Array.from(tabs), ['basic', 'greek', 'fonts', 'operators', 'functions', 'functionParen']);
});

test('toolbar tab mode policy is centralized in toolbar config and used by app sync logic', () => {
  const sandbox = { window: {}, globalThis: {} };
  vm.createContext(sandbox);
  new vm.Script(toolbarConfigSource).runInContext(sandbox);
  const api = sandbox.window.ToolbarConfig || sandbox.globalThis.ToolbarConfig;
  assert.ok(api);
  assert.deepEqual(Array.from(api.getVisibleTabsForInput('text')), ['basic', 'greek', 'fonts', 'operators', 'functions']);
  assert.deepEqual(Array.from(api.getVisibleTabsForInput('answer')), ['basic', 'functionParen']);
  assert.equal(api.getPreferredTabForInput('text'), 'functions');
  assert.equal(api.getPreferredTabForInput('answer'), 'functionParen');

  assert.equal(appSource.includes("const configApi = _getToolbarConfigApi();"), true);
  assert.equal(appSource.includes("typeof configApi.getVisibleTabsForInput === 'function'"), true);
  assert.equal(appSource.includes("typeof configApi.getPreferredTabForInput === 'function'"), true);
  assert.equal(appSource.includes('if (fallbackTab) setActiveTab(fallbackTab);'), true);
});

test('toolbar ui filters hidden tabs for navigation and active target fallback', () => {
  assert.equal(toolbarUiSource.includes("if (btn.hidden) return false;"), true);
  assert.equal(toolbarUiSource.includes("if (btn.classList && btn.classList.contains('hidden')) return false;"), true);
  assert.equal(toolbarUiSource.includes("if (btn.getAttribute && btn.getAttribute('aria-hidden') === 'true') return false;"), true);
  assert.equal(toolbarUiSource.includes('const visibleTabs = visibleButtons'), true);
  assert.equal(toolbarUiSource.includes('const target = visibleTabs.includes(requested) ? requested : fallbackTab;'), true);
});

test('function template buttons use shared toolbar button style', () => {
  assert.equal(toolbarConfigSource.includes('tb-fn-template'), false);
  assert.equal(/\.toolbar-btn\.tb-fn-template\s*\{/.test(styleSource), false);
});

test('toolbar KaTeX labels use the same font scale as text labels', () => {
  assert.equal(/\.toolbar-btn\s+\.katex\s*\{\s*font-size:\s*1em;\s*\}/.test(styleSource), true);
});

test('toolbar text-xs buttons are normalized to shared font size', () => {
  assert.equal(
    /\.toolbar-btn\.text-xs\s*\{[\s\S]*?font-size:\s*0\.9rem;[\s\S]*?line-height:\s*1\.2;[\s\S]*?\}/.test(styleSource),
    true
  );
});

test('supported function command buttons are not forced to template policy', () => {
  const toolbarDef = loadToolbarDef();
  const required = new Set(['sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'ln', 'exp']);
  const found = new Set();

  for (const group of (toolbarDef.functions.groups || [])) {
    for (const btn of (group.buttons || [])) {
      if (btn.kind !== 'cmd') continue;
      if (!required.has(btn.cmd)) continue;
      found.add(btn.cmd);
      assert.equal(Boolean(btn.policyKey), false, `unexpected policyKey for cmd: ${btn.cmd}`);
    }
  }
  assert.equal(found.size, required.size);
});

test('log command/template buttons are blocked in answer mode policy', () => {
  const toolbarDef = loadToolbarDef();
  const logCmd = (toolbarDef.functions.groups || [])
    .flatMap((g) => g.buttons || [])
    .find((btn) => btn.kind === 'cmd' && btn.cmd === 'log');
  assert.equal(Boolean(logCmd), true);
  assert.equal(logCmd.policyKey, 'answer_no_log_base');

  const logTpl = (toolbarDef.functionParen.groups || [])
    .flatMap((g) => g.buttons || [])
    .find((btn) => btn.kind === 'tpl' && btn.tpl === '\\log(|)');
  assert.equal(Boolean(logTpl), true);
  assert.equal(logTpl.policyKey, 'answer_no_log_base');
});

test('function parenthesis tab covers common function command templates', () => {
  const toolbarDef = loadToolbarDef();
  const requiredCmds = new Set(['sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp']);

  const templateCmds = new Set();
  for (const group of (toolbarDef.functionParen?.groups || [])) {
    for (const btn of (group.buttons || [])) {
      if (btn.kind !== 'tpl') continue;
      const m = String(btn.tpl || '').match(/^\\([a-zA-Z]+)\(\|\)$/);
      if (m) templateCmds.add(m[1]);
    }
  }

  for (const cmd of requiredCmds) {
    assert.equal(templateCmds.has(cmd), true, `missing function parenthesis template for ${cmd}`);
  }
});

test('print styles hide third-party notice link', () => {
  assert.equal(
    /@media print[\s\S]*#third-party-notices-link\s*\{\s*display:\s*none\s*!important;\s*\}/.test(styleSource),
    true
  );
});

test('preview tree search placeholder matches main tree semantics', () => {
  assert.equal(
    /id="question-tree-search"[^>]*placeholder="ID, 제목, 지문으로 검색\.\.\."/.test(indexSource),
    true
  );
  assert.equal(
    /id="preview-tree-search"[^>]*placeholder="ID, 제목, 지문으로 검색\.\.\."/.test(indexSource),
    true
  );
});

test('preview tree button uses fixed width style', () => {
  assert.equal(
    /#preview-tree-btn\.tree-dropdown-btn\s*\{[\s\S]*?min-height:\s*2\.375rem;[\s\S]*?width:\s*7rem;[\s\S]*?max-width:\s*7rem;[\s\S]*?\}/.test(styleSource),
    true
  );
});

test('preview action buttons use the same height as preview tree button', () => {
  assert.equal(
    /id="preview-print-btn" class="btn-primary preview-modal-action-btn py-1\.5 px-4 text-sm"/.test(indexSource),
    true
  );
  assert.equal(
    /id="preview-close-btn" class="btn-secondary preview-modal-action-btn py-1\.5 px-4 text-sm"/.test(indexSource),
    true
  );
  assert.equal(
    /\.preview-modal-action-btn\s*\{[\s\S]*?min-height:\s*2\.375rem;[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?\}/.test(styleSource),
    true
  );
});

test('question tree button uses compact fixed width style', () => {
  assert.equal(
    /#question-tree-btn\.tree-dropdown-btn\s*\{[\s\S]*?min-height:\s*2\.375rem;[\s\S]*?width:\s*7rem;[\s\S]*?max-width:\s*7rem;[\s\S]*?\}/.test(styleSource),
    true
  );
});

test('question tree button no longer relies on inline min-width style', () => {
  assert.equal(/id="question-tree-btn" class="tree-dropdown-btn"/.test(indexSource), true);
  assert.equal(indexSource.includes('id="question-tree-btn" class="tree-dropdown-btn" style='), false);
});

test('import file navigator no longer uses inline styles', () => {
  assert.equal(/id="import-file-nav-btn" class="tree-dropdown-btn hidden"/.test(indexSource), true);
  assert.equal(indexSource.includes('id="import-file-nav-btn" class="tree-dropdown-btn hidden" style='), false);
  assert.equal(/id="import-file-nav-popup" class="tree-dropdown-popup hidden"/.test(indexSource), true);
  assert.equal(indexSource.includes('id="import-file-nav-popup" class="tree-dropdown-popup hidden" style='), false);
  assert.equal(/id="import-file-nav-list" class="tree-list import-file-nav-list"/.test(indexSource), true);
  assert.equal(indexSource.includes('id="import-file-nav-list" class="tree-list import-file-nav-list" style='), false);
});

test('confirm dialog no longer uses inline width styles', () => {
  assert.equal(/class="confirm-dialog[^"]*"/.test(indexSource), true);
  assert.equal(indexSource.includes('class="confirm-dialog bg-white rounded-lg shadow-2xl p-6 mx-4" style='), false);
});

test('import file navigator style is controlled in css', () => {
  assert.equal(
    /#import-search\s*\{[\s\S]*?min-height:\s*2\.125rem;[\s\S]*?line-height:\s*1\.25rem;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /#import-file-nav-btn\.tree-dropdown-btn\s*\{[\s\S]*?min-height:\s*2\.125rem;[\s\S]*?min-width:\s*8rem;[\s\S]*?font-size:\s*0\.8rem;[\s\S]*?line-height:\s*1\.25rem;[\s\S]*?padding:\s*0\.375rem 0\.5rem;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /#import-file-nav-popup\.tree-dropdown-popup\s*\{[\s\S]*?width:\s*18rem;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /\.import-file-nav-list\s*\{[\s\S]*?max-height:\s*16rem;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /\.confirm-dialog\s*\{[\s\S]*?max-width:\s*24rem;[\s\S]*?width:\s*100%;[\s\S]*?\}/.test(styleSource),
    true
  );
});

test('import file section and tree icon styles are controlled in css classes', () => {
  assert.equal(
    /\.import-file-section\s*\{[\s\S]*?margin:\s*0;[\s\S]*?border-radius:\s*0;[\s\S]*?border-bottom:\s*1px solid #e5e7eb;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /\.import-file-header-root\s*\{[\s\S]*?padding-left:\s*0\.75rem;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /\.import-file-header-nested\s*\{[\s\S]*?padding-left:\s*1\.5rem;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /\.tree-item-num-icon\s*\{[\s\S]*?min-width:\s*auto;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /\.tree-item-indent-root\s*\{[\s\S]*?padding-left:\s*0\.5rem;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /\.tree-item-indent-nested\s*\{[\s\S]*?padding-left:\s*1\.5rem;[\s\S]*?\}/.test(styleSource),
    true
  );
});

test('confirm modal message preserves line breaks and wraps long tokens safely', () => {
  assert.equal(
    /#confirm-message\s*\{[\s\S]*?white-space:\s*pre-line;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?max-height:\s*min\(40vh,\s*16rem\);[\s\S]*?overflow-y:\s*auto;[\s\S]*?\}/.test(styleSource),
    true
  );
});

test('confirm modal has dialog accessibility attributes', () => {
  assert.equal(
    /id="confirm-modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="confirm-title"[^>]*aria-describedby="confirm-message"[^>]*aria-hidden="true"/.test(indexSource),
    true
  );
  assert.equal(/id="confirm-title"[^>]*>확인</.test(indexSource), true);
});

test('preview/import modals have dialog accessibility attributes', () => {
  assert.equal(
    /id="preview-modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="preview-modal-title"[^>]*aria-hidden="true"[^>]*tabindex="-1"/.test(indexSource),
    true
  );
  assert.equal(
    /id="import-modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="import-modal-title"[^>]*aria-hidden="true"[^>]*tabindex="-1"/.test(indexSource),
    true
  );
});

test('import modal has live status region for deferred processing progress', () => {
  assert.equal(
    /id="import-status" class="import-status hidden" aria-live="polite"/.test(indexSource),
    true
  );
  assert.equal(
    /\.import-status\s*\{[\s\S]*?font-size:\s*0\.75rem;[\s\S]*?color:\s*#6b7280;[\s\S]*?\}/.test(styleSource),
    true
  );
  assert.equal(
    /\.import-status\.import-status-busy\s*\{[\s\S]*?color:\s*#1d4ed8;[\s\S]*?font-weight:\s*600;[\s\S]*?\}/.test(styleSource),
    true
  );
});

test('source has no malformed closing tags', () => {
  const malformedClosingTag = /(^|[^<])\/(?:th|td|tr|div|span|label|button|h[1-6])>/m;
  assert.equal(malformedClosingTag.test(appSource), false);
  assert.equal(malformedClosingTag.test(indexSource), false);
});

test('source has no mojibake indicators for Korean text', () => {
  const hasReplacementChar = (text) => /\uFFFD/.test(text);
  const hasCjkMojibake = (text) => /[\u4E00-\u9FFF]/.test(text);
  const hasQuestionBeforeHangul = (text) => /\?[가-힣]/.test(text);
  const hasMojibake = (text) =>
    hasReplacementChar(text) || hasCjkMojibake(text) || hasQuestionBeforeHangul(text);

  assert.equal(hasMojibake(appSource), false);
  assert.equal(hasMojibake(indexSource), false);
  assert.equal(hasMojibake(readmeSource), false);
  assert.equal(hasMojibake(userGuideMdSource), false);
  assert.equal(hasMojibake(manualChecklistSource), false);
});
