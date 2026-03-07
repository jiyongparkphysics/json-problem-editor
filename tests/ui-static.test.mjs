import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEX_HTML_PATH = path.resolve(process.cwd(), 'index.html');
const STYLE_CSS_PATH = path.resolve(process.cwd(), 'style.css');
const APP_JS_PATH = path.resolve(process.cwd(), 'app.js');
const indexSource = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const styleSource = fs.readFileSync(STYLE_CSS_PATH, 'utf8');
const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');

test('index has third-party notice wrapper id', () => {
  assert.equal(indexSource.includes('id="third-party-notices-link"'), true);
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
});
