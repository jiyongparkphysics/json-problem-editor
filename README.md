# 문제 JSON 편집기

## 실행 방법

- 앱 실행(사용): `index.html`을 브라우저에서 열면 됩니다. Node는 필요하지 않습니다.
- Node는 코드 점검/자동 테스트 실행 시에만 필요합니다.
- 주의: KaTeX/math.js/JSZip/Tailwind/폰트는 CDN으로 로드되므로, 실행 시 인터넷 연결이 필요합니다.
- Tailwind CSS는 비고정 CDN 런타임을 사용하므로, 시점에 따라 외관이 일부 달라질 수 있습니다.
- 이 도구는 데스크톱 기준 1024px 이상 화면을 전제로 하며, 그보다 좁은 폭에서는 편집 UI 대신 안내 배너만 표시됩니다.
- 불러오기 `전체 교체`는 확인 모달 승인 후 현재 문항을 모두 덮어씁니다(복구 불가).
- ZIP 불러오기는 문항 목록을 먼저 표시하고, 이미지 해석은 `전체 교체` 또는 `선택 추가` 시점에 처리합니다.
- ZIP 불러오기에서 5MB를 초과하는 이미지는 자동으로 제외되며, 제외 개수가 안내됩니다.
- 불러오기 검색은 선택 상태를 지우지 않으며, 필터를 바꿔가며 체크한 문항도 `선택 추가`에 함께 반영됩니다.
- 테스트 코드는 배포 런타임에 포함되지 않으며, 개발/CI 검증용으로만 실행됩니다.

## 권장 환경

- 최신 Chrome/Edge/Firefox/Safari (최근 1년 내 버전 권장)
- 필수 Web API: `localStorage`, `IndexedDB`, `FileReader`, `CSS.escape`, `requestAnimationFrame`
- `IntersectionObserver`가 있으면 전체 미리보기에서 지연 렌더링과 현재 문항 추적을 사용하고, 없으면 전체 렌더링 폴백으로 동작합니다.

## 실행 테스트 명령

```powershell
node --check app.js
node --test --test-isolation=none tests/app-logic.test.mjs tests/core-logic.test.mjs tests/ui-static.test.mjs
```

한 줄 실행:

```powershell
node --check app.js; node --test --test-isolation=none tests/app-logic.test.mjs tests/core-logic.test.mjs tests/ui-static.test.mjs
```

## random-exam-generator 호환성 테스트 (별도)

- 호환성 테스트는 외부 파서 의존성이 있어 `tests/compat/` 아래에서 분리 운영합니다.
- 환경 변수 `RANDOM_EXAM_GENERATOR_PATH`에 생성기 레포 경로를 지정한 뒤 실행합니다.
- 기준 PDF 환경은 생성기의 `latexmk -pdf` + `kotex` 프리앰블이므로, KaTeX 미리보기와 결과가 다를 수 있습니다.
- 지문은 텍스트 문맥이 기본이라 `\alpha` 단독보다 `$\alpha$` 형태를 사용하세요(정답식 칸은 `$...$` 없이 수식만 입력).
- 지문 변수 `*var*`는 미리보기에서 파란 굵은 강조를 안정적으로 보려면 `$...$` 또는 `$$...$$` 안에서 쓰는 것을 권장합니다. 예: `$*a*$`
- 지문 텍스트에서는 `%`, `&`, `#`를 `\%`, `\&`, `\#`로 이스케이프하고, 수식 구분자 밖의 `_`, `^`, `~`도 `\_`, `\^{}`, `\~{}` 형태를 권장합니다.

```powershell
$env:RANDOM_EXAM_GENERATOR_PATH="C:\path\to\random-exam-generator"
python tests/compat/random-exam-generator/run_compat.py
```

## 참고

- 사용자 가이드: `USER_GUIDE.md`
- 수동 점검 항목: `MANUAL_TEST_CHECKLIST.md`
- 서드파티 라이선스 고지: `THIRD_PARTY_NOTICES.md`

## 자동저장/복구 동작 요약

- 문항 메타(ID/제목/지문/정답/변수/배점/인덱스)는 `localStorage`에 자동 저장됩니다.
- 이미지 데이터는 `IndexedDB`에 별도 저장되며, 메타 시그니처(길이+해시) 일치 시에만 복구됩니다.
- 자동저장 키/이미지 DB는 현재 페이지 경로 기준 네임스페이스로 분리되어 서로 다른 배포본 간 충돌을 줄입니다.
- 이미지가 동일하더라도 메타데이터가 바뀌면 이미지 스냅샷 연결 정보도 함께 갱신됩니다.
- 구버전 자동저장 키를 발견하면 현재 스코프로 마이그레이션을 시도하며, 이미지 마이그레이션 실패 시에는 유실 방지를 위해 레거시 키/DB를 계속 사용합니다(성공 시 스코프로 전환).
- `새로시작` 실행 시 `localStorage` 자동저장 데이터와 `IndexedDB` 이미지 스냅샷을 함께 초기화합니다.

## 호환성 프로필 (pdflatex 기준)

- 편집기의 고정 호환성 기준은 `COMPATIBILITY_PROFILE.md`를 따릅니다.
- 기준 소스: random-exam-generator preamble + compile path.
- 컴파일 경로: `latexmk -pdf -interaction=nonstopmode` (엔진: `pdflatex`).
- AMS 수식 패키지 기준: `amsmath`, `amssymb`, `amsfonts`, `mathtools`는 현재 미포함으로 취급합니다.
- 메시지 UX 정책: 오류/경고는 입력창 원문(사용자 입력) 기준으로 노출합니다.

## 툴바 아키텍처

- `toolbar-config.js`: 툴바 탭/그룹/버튼 정의.
- `toolbar-ui.js`: 렌더링, 탭 활성화, 키보드 내비게이션.
- `compat/shared.js`: 호환성 공통 상수/헬퍼.
- `compat/text.js`: 지문 호환성 진단 + 지문 퀵픽스.
- `compat/answer.js`: 정답식 파서 호환성 + 툴바 정책 규칙.
- `random-exam-compat.js`: `window.RandomExamCompat` 퍼사드.
- `app.js`: 모듈 호출 + 비활성화 상태/UI 동기화.
