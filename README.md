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

왼쪽 사이드바 메뉴는 `assets/js/nav.js` 한 파일에서만 정의하고 모든 화면이 공유합니다.
900px 이하 화면에서는 사이드바가 숨겨지고 햄버거 버튼으로 열립니다.

## 주요 기능

- 물품 등록 / 수량 늘리기·줄이기 / 삭제
- 카테고리 4종 고정: 문구류 / 전자기기 / 청소용품 / 기타
- 물품별 "적정 재고량" 대비 부족 여부·부족 수량 자동 계산 및 배지 표시
- 물품 목록: 이름·카테고리·등록자 통합 검색, 4종 정렬(최신순/이름순/수량순/입고일순, 재클릭 시 방향 전환)
- 대시보드 4위젯: 총 품목 수 / 최근 변경 내역 / 카테고리별 분포(도넛 차트) / 재고 부족(상위 5건 + 전체 링크)
- 등록/수량 변경/삭제 시 `item_logs` 테이블에 자동으로 이력 기록 (누가/언제/무엇을/얼마나)
- 화면 밝기(시스템/밝게/어둡게) 선택 및 localStorage 유지
- 360px 모바일 화면까지 반응형 대응

## 기술 스택

- 정적 HTML(`index.html`/`item.html`/`register.html`) + 순수 JavaScript, 별도 빌드 도구 없음
- [Supabase](https://supabase.com) (Postgres) — 데이터 저장 및 RPC 함수
- Supabase JS 클라이언트 (CDN), 대시보드 도넛 차트는 Chart.js (CDN)

## 폴더 구조

```
index.html / item.html / register.html   화면 3개
assets/css/styles.css                    공통 스타일 (테마, 반응형 레이아웃 포함)
assets/js/config.js                      Supabase 클라이언트 초기화, 공통 상수/유틸
assets/js/theme.js                       화면 밝기 설정 저장/적용
assets/js/nickname.js                    닉네임 저장/조회 (등록·수량변경·삭제 시 사용)
assets/js/nav.js                         사이드바 메뉴 (모든 화면 공유, 단일 소스)
assets/js/dashboard.js                   대시보드 로직
assets/js/item.js                        물품 목록 로직
assets/js/register.js                    물품 등록 로직
supabase/schema.sql                      테이블/RLS/함수 전체 SQL
serve.ps1, .claude/launch.json           로컬 정적 서버 (PowerShell)
```

## Supabase 스키마

`supabase/schema.sql`에 전체 스키마가 있습니다.

- `items`: 물품 마스터 (이름/카테고리/수량/적정 재고량/입고일/등록자 닉네임/수정 시간)
- `item_logs`: 수량 변경 이력 (누가/언제/무엇을/얼마나, CREATE/INCREASE/DECREASE/DELETE/IMPORT)
- `create_item` / `delete_item` / `increase_item_quantity` / `decrease_item_quantity`: items 갱신과 item_logs 기록을 한 트랜잭션으로 처리하는 DB 함수. 증감 함수는 행 잠금(`SELECT ... FOR UPDATE`)으로 동시 변경 시에도 값이 유실되지 않고, 수량이 0 미만으로 내려가지 않도록 방지합니다.
- RLS는 로그인이 없는 구조에 맞춰 `anon` 키로 열려 있습니다. 외부에 URL이 노출되면 누구나 데이터를 읽고 쓸 수 있으니, 사내망/사내 공유 링크로만 배포하세요.

`assets/js/config.js`의 Supabase URL/anon key를 실제 사용할 프로젝트 값으로 바꿔서 사용하세요.

## 로컬 실행

빌드 과정이 없는 정적 사이트라 아무 정적 서버로 열면 됩니다. 저장소에는 PowerShell 기반의 간단한 서버(`serve.ps1`)가 포함되어 있습니다.

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
```

기본적으로 `http://localhost:5500`에서 열립니다.

## 캐시 버스팅 (?v=버전)

`index.html`/`item.html`/`register.html`에서 로컬 CSS/JS를 불러올 때 `?v=1`처럼 버전 쿼리를 붙여 두었습니다.
브라우저가 예전 캐시 파일을 계속 쓰는 것을 막기 위한 것으로, **`assets/css`나 `assets/js` 파일을 수정할 때마다 세 HTML 파일의 해당 `?v=N` 번호를 함께 올려야** 합니다.
