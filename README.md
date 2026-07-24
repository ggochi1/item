# 공용 물품 관리 앱

사무실에서 함께 쓰는 공용 물품(볼펜, A4용지, 건전지, 물티슈 등)의 재고를 관리하는 사내 웹앱입니다.
로그인 없이 닉네임만으로 물품을 등록하고, 수량을 늘리거나 줄이고, 삭제할 수 있습니다.
모든 수량 변경/등록/삭제는 이력으로 남아 "누가 무엇을 얼마나 가져갔는지" 추적할 수 있습니다.

자세한 요구사항은 [PRD.md](PRD.md)를 참고하세요.

## 화면 구성

| 파일 | 화면 |
|---|---|
| `index.html` | 현황 대시보드 (첫 화면) |
| `item.html` | 물품 목록 (검색/정렬/수량 조정/삭제) |
| `register.html` | 물품 등록 |
| `import.html` | 엑셀 업로드 (양식 다운로드 → 채우기 → 업로드 3단계, 저장 전 미리보기) |

왼쪽 사이드바 메뉴는 `assets/js/nav.js` 한 파일에서만 정의하고 모든 화면이 공유합니다.
900px 이하 화면에서는 사이드바가 숨겨지고 햄버거 버튼으로 열립니다.

## 주요 기능

- 물품 등록 / 수량 늘리기·줄이기 / 삭제
- 카테고리 4종 고정: 문구류 / 전자기기 / 청소용품 / 기타
- 물품별 "적정 재고량" 대비 부족 여부·부족 수량 자동 계산 및 배지 표시
- 물품 목록: 이름·카테고리·등록자 통합 검색, 4종 정렬(최신순/이름순/수량순/입고일순, 재클릭 시 방향 전환)
- 대시보드 4위젯: 총 품목 수 / 최근 변경 내역 / 카테고리별 분포(도넛 차트) / 재고 부족(상위 5건 + 전체 링크)
- 등록/수량 변경/삭제 시 `item_logs` 테이블에 자동으로 이력 기록 (누가/언제/무엇을/얼마나)
- 엑셀(.xlsx/.xls/.csv) 업로드로 물품 일괄 등록: 저장 전 미리보기 확인, 같은 이름은 수량만 합산(행이 늘지 않음), 잘못된 행은 그 행만 건너뛰고 사유 표시, 저장은 하나의 트랜잭션으로 처리되어 중간 실패 시 전체 롤백
- 물품 등록 화면의 "말로 등록하기(AI)": 자연어 문장을 여러 건의 등록 후보로 분석 (아래 "AI 자연어 등록" 참고)
- 화면 밝기(시스템/밝게/어둡게) 선택 및 localStorage 유지
- 360px 모바일 화면까지 반응형 대응

## 기술 스택

- 정적 HTML(`index.html`/`item.html`/`register.html`/`import.html`) + 순수 JavaScript, 별도 빌드 도구 없음
- [Supabase](https://supabase.com) (Postgres) — 데이터 저장 및 RPC 함수
- Supabase JS 클라이언트 (CDN), 대시보드 도넛 차트는 Chart.js (CDN)
- 엑셀 파싱은 [SheetJS(xlsx)](https://sheetjs.com/)를 사용하며, 대부분의 화면에서는 쓰지 않으므로 `import.html`에서 파일을 실제로 선택/드롭할 때만 CDN에서 지연 로드합니다.
- 한글 타이포그래피는 [Pretendard Variable](https://github.com/orioncactus/pretendard) (CDN)

## 폴더 구조

```
index.html / item.html / register.html / import.html   화면 4개
assets/css/styles.css                    공통 스타일 (테마, 반응형 레이아웃 포함)
assets/js/config.js                      Supabase 클라이언트 초기화, 공통 상수/유틸
assets/js/theme.js                       화면 밝기 설정 저장/적용
assets/js/nickname.js                    닉네임 저장/조회 (등록·수량변경·삭제·업로드 시 사용)
assets/js/nav.js                         사이드바 메뉴 (모든 화면 공유, 단일 소스)
assets/js/dashboard.js                   대시보드 로직
assets/js/item.js                        물품 목록 로직
assets/js/register.js                    물품 등록 로직
assets/js/import.js                      엑셀 업로드 로직 (파싱/검증/미리보기/저장)
assets/js/ai-register.js                 물품 등록 화면의 AI 자연어 등록 로직
supabase/schema.sql                      테이블/RLS/함수 전체 SQL
supabase/functions/parse-items/index.ts  OpenRouter 호출용 Edge Function (API 키는 여기서만 사용)
serve.ps1, .claude/launch.json           로컬 정적 서버 (PowerShell)
```

## Supabase 스키마

`supabase/schema.sql`에 전체 스키마가 있습니다.

- `items`: 물품 마스터 (이름/카테고리/수량/적정 재고량/입고일/등록자 닉네임/수정 시간)
- `item_logs`: 수량 변경 이력 (누가/언제/무엇을/얼마나, CREATE/INCREASE/DECREASE/DELETE/IMPORT)
- `create_item` / `delete_item` / `increase_item_quantity` / `decrease_item_quantity`: items 갱신과 item_logs 기록을 한 트랜잭션으로 처리하는 DB 함수. 증감 함수는 행 잠금(`SELECT ... FOR UPDATE`)으로 동시 변경 시에도 값이 유실되지 않고, 수량이 0 미만으로 내려가지 않도록 방지합니다.
- `import_items(p_rows jsonb)`: 엑셀 업로드용 일괄 처리 함수. 같은 이름은 함수 안에서 수량을 합산해 한 건으로 처리하고, 이미 있는 물품이면 수량만 더하고(카테고리 등은 유지), 없으면 새로 만듭니다. 전체가 하나의 함수 호출(=하나의 트랜잭션)이라 중간에 오류가 나면 이 호출로 인한 변경은 전부 롤백됩니다.
- RLS는 로그인이 없는 구조에 맞춰 `anon` 키로 열려 있습니다. 외부에 URL이 노출되면 누구나 데이터를 읽고 쓸 수 있으니, 사내망/사내 공유 링크로만 배포하세요.

`assets/js/config.js`의 Supabase URL/anon key를 실제 사용할 프로젝트 값으로 바꿔서 사용하세요.

## AI 자연어 등록 (`register.html` → "말로 등록하기")

물품 등록 화면 상단에서 "볼펜 20개랑 물티슈 5개 들어왔어" 같은 문장을 쓰면 여러 건의 등록 후보로 나눠 보여주고,
사람이 확인(카테고리 수정 가능)한 뒤에만 실제로 저장됩니다.

- **키 보관**: OpenRouter API 키는 브라우저에 절대 두지 않습니다. `supabase/functions/parse-items`가 Supabase Edge Function으로 배포되어 있고, 이 함수 안에서만 Supabase 시크릿 `OPENROUTER_API_KEY`를 읽어 OpenRouter를 호출합니다. `.env` 파일은 사용하지 않습니다.
  - 시크릿 설정(직접 실행 필요, 이 저장소에는 값이 들어있지 않음):
    ```bash
    supabase secrets set OPENROUTER_API_KEY=sk-or-... --project-ref zxojwktfmanqypkxjnpp
    ```
    또는 Supabase 대시보드 → Edge Functions → parse-items → Secrets에서 설정.
- **무료 모델만 허용**: `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, `google/gemma-4-31b-it:free`, `openai/gpt-oss-20b:free` 세 개만 고를 수 있습니다(`assets/js/config.js`의 `AI_MODELS`, `parse-items`의 `ALLOWED_MODELS`에 동일하게 정의). 실제 호출 전 매번 OpenRouter `/models`에서 해당 모델의 실시간 가격을 확인해 0원이 아니면 요청을 거절합니다. 화면에서 고른 모델은 localStorage에 저장되어 다음에도 유지됩니다.
- **모델별 구조화 출력**: 모델이 지원하는 파라미터(`structured_outputs` / `response_format` / `tools`)를 실시간으로 확인해, 가능한 가장 강한 방식으로 JSON을 강제합니다(strict JSON schema → JSON 모드 → 함수 호출(tool) → 프롬프트 지시 순).
- **안전장치**:
  - 바로 저장하지 않고 미리보기 → 확인 절차를 거칩니다.
  - 카테고리는 AI 추측값이라 미리보기에서 드롭다운으로 고칠 수 있고, 이름·수량은 사람이 말한 그대로 표시되며 수정 UI를 두지 않았습니다.
  - 시스템 프롬프트로 "삭제/감소 요청은 무시하고 등록만 추출"하도록 지시하며, 더 근본적으로는 이 기능이 호출하는 저장 함수(`import_items`)가 애초에 수량을 더하거나 새로 만드는 것만 가능해 삭제·감소 자체를 실행할 방법이 없습니다(구조적 안전장치).
  - "어제/그저께" 같은 상대적 날짜는 서버(Edge Function)가 계산한 오늘 날짜를 기준으로 절대 날짜로 변환됩니다.
  - AI 분석이 실패해도 같은 화면의 직접 입력 폼은 별도 스크립트(`assets/js/ai-register.js` vs `assets/js/register.js`)로 분리되어 있어 영향을 받지 않습니다.

## 로컬 실행

빌드 과정이 없는 정적 사이트라 아무 정적 서버로 열면 됩니다. 저장소에는 PowerShell 기반의 간단한 서버(`serve.ps1`)가 포함되어 있습니다.

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
```

기본적으로 `http://localhost:5500`에서 열립니다.

## 캐시 버스팅 (?v=버전)

각 HTML에서 로컬 CSS/JS를 불러올 때 `?v=1`처럼 버전 쿼리를 붙여 두었습니다.
브라우저가 예전 캐시 파일을 계속 쓰는 것을 막기 위한 것으로, **`assets/css`나 `assets/js` 파일을 수정할 때마다 그 파일을 불러오는 모든 HTML의 `?v=N` 번호를 함께 올려야** 합니다(예: `styles.css`를 고치면 4개 화면 전부에서 버전을 올림).
