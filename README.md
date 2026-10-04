# Movie Explorer

로컬 폴더의 영상 파일을 glob 패턴으로 검색하고 디렉터리별로 탐색하는 Tauri 데스크톱 앱입니다.

## 주요 기능

- 폴더 선택과 재귀 영상 파일 검색, include glob 패턴 적용·초기화, 검색 중 파일 점진 표시
- 검색어 필터, 디렉터리 트리, 파일 수·용량 요약
- 썸네일·그리드·간결한 목록 보기와 패널 크기 조절
- 시작 폴더·적용 패턴·보기 방식 복원, 설정 오류 표시와 명시적 초기화

## 개발 환경과 실행

Node.js 22 이상과 pnpm, Rust/Cargo 및 운영체제에 필요한 Tauri 빌드 도구가 필요합니다. `.ts` 파일을 직접 실행하는 테스트에는 Node의 TypeScript type stripping을 지원하는 버전을 사용하세요.

공통 explorer-kit은 `pnpm@9.15.5`를 사용합니다. 이 앱도 pnpm으로 설치하며 `pnpm-lock.yaml`을 사용합니다.

이 앱과 `explorer-kit`을 같은 상위 디렉터리에 체크아웃해야 합니다. TypeScript는 `link:`, Rust는 Cargo `path` 의존성을 사용하므로 앱 저장소만으로는 설치·빌드할 수 없습니다. 아래 명령은 이 앱의 루트에서 시작합니다.

```sh
cd ../explorer-kit
pnpm install --frozen-lockfile
cd ../movie-explorer
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev`는 공통 개발 도구로 사용 가능한 포트를 찾아 Vite와 Tauri를 함께 실행합니다. 브라우저 UI만 실행하려면 `pnpm --filter desktop dev`를 사용합니다.

## 검증과 빌드

```sh
pnpm typecheck
pnpm --filter desktop test
pnpm build
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm tauri build
```

`pnpm build`는 프론트엔드 타입 검사·번들 생성이며 네이티브 패키징은 `pnpm tauri build`입니다. Rust 테스트는 임시 디렉터리 fixture와 가짜 scanner를 사용합니다. Node 테스트는 설정 fixture와 가짜 스트리밍 transport로 중간 배치·취소·종료를 확인합니다. 공통 TypeScript 소스 패키지를 테스트할 때만 기존 esbuild 실행기로 임시 번들링합니다.

앱별 Storybook: `pnpm storybook`, 정적 생성: `pnpm build-storybook`.

## 데이터와 설정

브라우저 localStorage의 `movie-explorer.preferences` v1에 directoryPath·includePatternText·viewMode를 저장합니다. 검색어·선택 항목·스캔 결과는 저장 설정에 포함하지 않습니다. 편집 중인 패턴 초안은 Apply 성공 시 확정합니다. 저장 실패나 미지원 버전에서는 기존 저장값을 보존하며 명시적 초기화로 복구할 수 있습니다.

영상 파일 조회 앱이며 Folder 앱의 폴더명 메타데이터 편집 기능은 포함하지 않습니다.

## 현재 아키텍처

프론트엔드는 app/pages/features/entities/shared로 구성됩니다. 페이지는 `features/preferences` 공개 index로 설정 기능을 가져옵니다. `entities/movie/api.ts`가 Tauri DTO의 snake_case 필드를 내부 camelCase 타입으로 변환합니다. 조회 결과는 TanStack Query, 확정 설정은 settings-core, 검색·선택·입력 초안은 React local state로 관리합니다.

Rust의 `application::ScanMovieFiles`가 기본 영상 glob 정책과 스트리밍 port를 소유합니다. `infrastructure::FsMovieScanner`가 공통 `scan_files_stream`을 호출해 앱 타입으로 변환합니다. `src-tauri/src/lib.rs`는 기존 일괄 `scan_movie_files` IPC를 유지하고, 스트리밍 명령에서는 공통 `explorer-scan-job`으로 scan ID 등록·취소·terminal 분류를 관리하며 blocking worker를 실행합니다. worker 실패·취소·완료는 별도 terminal 이벤트로 보냅니다.

프런트엔드의 `entities/movie` adapter는 `@yoophi/scan-client`로 이벤트를 시작 전에 구독하고 AbortSignal에 따라 취소합니다. 받은 파일은 배치로 화면에 표시하지만 React Query cache에는 성공 terminal 뒤의 최종 결과만 넣습니다. 폴더·glob 변경, 재검색, 화면 해제 시 이전 스캔을 취소하고 늦은 이벤트를 무시합니다. 이 작은 스캔 흐름 외의 페이지 전용 모델 분리는 이번 범위에 포함하지 않았습니다.

| 위치 | 책임 |
| --- | --- |
| `apps/desktop/src` | React 화면·모델·API adapter |
| `apps/desktop/src-tauri` | Rust command와 네이티브 기능 |
| `packages/ui` | 앱 로컬 UI primitive |

## 공통 코드 연결

- 프론트엔드/개발 도구: `@yoophi/explorer-core`, `@yoophi/explorer-dev-tools`, `@yoophi/scan-client`, `@yoophi/settings-core`, `@yoophi/settings-ui`
- Rust: `explorer-fs-core`, `explorer-scan-job`.

공통 React 컴포넌트는 앱 데이터를 props와 callback으로 받고, 앱의 Tauri·라우팅·도메인 정책은 호출부에 유지합니다. 공통 저장소 UI를 보려면 `explorer-kit`에서 `pnpm storybook`을 실행하세요. 앱별 Storybook과는 별도이며 기본 포트 6006을 사용합니다.

## 관련 문서

- [공통 저장소 안내](../explorer-kit/README.md)
- [공통 UI Storybook](../explorer-kit/docs/storybook.md)
- [설정 공통화 결과](../explorer-kit/docs/settings-promotion-report.md)
- [Hexagonal·FSD 리뷰](../explorer-kit/docs/architecture-review.md)
- [아키텍처 지적 수정 결과](../explorer-kit/docs/architecture-fix-report.md)
- [두 앱 이상 공통 기능 후보](../explorer-kit/docs/shared-feature-candidates.md)
- [공통 코드 기능 리뷰와 미해결 항목](../explorer-kit/docs/shared-code-review.md)

문서 기준: 2026-10-05 로컬 구현. 아키텍처 리뷰의 개선 권고와 공통 기능 후보는 완료된 구현과 구분합니다.
