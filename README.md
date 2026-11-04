# 우리 학교 마음나무 🌳

**학생회 독서·친구 칭찬 캠페인용 모바일 우선 웹앱/PWA**. [dimkum47-jpg/school-webapp-template](https://github.com/dimkum47-jpg/school-webapp-template)의 `web/`·Cloudflare Worker·GitHub Pages 자동 배포 구조와 `AGENTS.md` 원칙을 바탕으로 별도 설계한 코드입니다.

> **배포 유의:** 코드와 모의 서버 자동 테스트를 통과했습니다. Firebase/Cloudflare의 서버 비밀값을 설정하고 별도 실환경 검증을 완료하기 전에는 실제 가입·저장·승인을 사용할 수 없습니다. 설정 전에는 읽기 전용 미리보기만 표시합니다.

## 주요 기능

- 1~6학년(학년별 1개 반). 학년·번호·이름·숫자 4자리 PIN으로 학생 직접 가입, 즉시 이용.
- 기기를 바꿔도 학년·번호·PIN으로 개인 기록 열람 및 수정. 공용 기기에서는 로그아웃.
- 독서: 제목, 한두 문장 내용. 칭찬: 친구 이름, 구체적인 행동, 칭찬 이유.
- 학년에 따라 입력 길이 완화; 빈약한 칭찬·완전 중복 기록에 기본 안내; 임원 최종 승인.
- 1~6학년 학급 임원별 공용 비밀번호. 해당 학년만 조회·승인·보완 요청·상품 지급 체크.
- 승인 상태와 시간, 실제 상품 지급 상태와 시간 보관. 승인/지급 담당자 신원은 기록하지 않음.
- 상품는 승인된 기록당 1개, 실제 지급일이 속하는 한국시간 월~일 주간에 학생별 최대 2개. 지급 이력은 기록 수정 후에도 유지.
- 교사 관리자: 전교생 목록/기록 관리, 비밀번호 재설정·계정 잠금, 기록 삭제·학년별 일괄 삭제, 엑셀용 CSV 내보내기.
- 나무에 승인된 글만 열매로 표현. 열매를 누르면 작성자 표시 없이 내용 조회. 등록 학생과 칭찬 대상 이름을 자동 치환하며, 승인 담당자에게 개인정보 점검을 요구.
- 192×192/512×512 PWA 아이콘, 서비스 워커와 홈 화면 설치 지원. 공개 페이지는 네트워크 우선 캐시, 로그인·학생 기록 등 API 응답은 캐시하지 않음.

## 구조

```text
web/                 GitHub Pages용 정적 HTML/CSS/JS 및 생성된 나무 그림
  assets/heart-tree.webp, icon192.png, icon512.png
  index.html, style.css, app.js, config.js, sw.js, manifest.webmanifest
worker/              Cloudflare Worker API. Firestore 서비스 계정 비밀값은 Worker Secrets에만
  src.js, domain.mjs, wrangler.toml.example
tests/               Node 내장 test runner. 도메인 규칙 + 가짜 Firestore 통합 테스트
scripts/build.mjs    JS/CSS/서비스 워커 배포 버전 자동 갱신
firestore.rules      독립된 Firebase 프로젝트에 적용할 접근 차단 규칙
.github/workflows/pages.yml  테스트 성공 시에만 GitHub Pages 자동 배포
```

## 로컬 미리보기 및 테스트

Node.js 22 이상 필요. 추가 외부 라이브러리 없이 테스트할 수 있습니다.

```sh
npm test
npm run check
npm run build
python3 -m http.server 8000 --directory dist
```

브라우저에서 `http://localhost:8000`을 열면 메인 나무 예시 화면과 학생/임원/교사 화면의 디자인을 볼 수 있습니다. `web/config.js`에 서버를 설정하기 전에는 **실제 가입·저장·승인 기능은 의도적으로 비활성화**됩니다.

## 배포 전 최초 설정 (교사 승인 이후)

### 1. Firebase 프로젝트

- **가능하면 이 앱 전용 신규 Firebase 프로젝트**를 사용하세요. 기존 학교 앱이 연결된 Firebase 프로젝트의 보안 규칙이나 컬렉션을 덮어쓰면 다른 앱이 중단될 수 있습니다.
- Firestore 데이터베이스를 준비하고, 전용 서비스 계정에 Firestore 데이터 접근에 필요한 최소한의 IAM 역할만 부여합니다.
- 전용 프로젝트일 때 `firestore.rules`를 적용합니다. 기존 프로젝트 공유 시에는 모든 앱의 규칙을 검토하고 병합한 뒤 승인받아 적용해야 합니다.
- 학생용 브라우저에 서비스 계정 키를 넣지 않습니다. 신규 서비스 계정 키 JSON은 Cloudflare Worker의 암호화된 Secret에만 저장합니다. 채팅·공개 저장소·화면 캡처로 키를 전달하지 않습니다.

### 2. Cloudflare Worker

`worker/wrangler.toml.example`을 `worker/wrangler.toml`로 복사하고 `FIREBASE_PROJECT_ID`와 `ALLOWED_ORIGIN`을 바꿉니다.

**Worker Secret 이름** (실제 값을 소스에 쓰지 말 것):

| Secret 이름 | 설명 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | 전용 서비스 계정 JSON 전체 |
| `PIN_PEPPER` | 임의의 최소 32자리 비밀문자열, 잊어버리면 기존 비밀번호 검증 불가 |
| `ADMIN_INITIAL_PASSWORD` | 협의한 교사 관리자 초기 비밀번호 |
| `OFFICER_INITIAL_PASSWORD` | 협의한 학년별 공용 임원 초기 비밀번호 |

비밀값은 Cloudflare의 Worker 설정 화면 또는 `wrangler secret put` 명령으로 안전하게 등록하세요. 키를 GitHub 저장소나 `wrangler.toml`에 적으면 안 됩니다. `ALLOWED_ORIGIN`은 GitHub Pages **원본 주소**(예: `https://dimkum47-jpg.github.io`)이고 저장소 경로가 아닙니다.

모든 환경값 등록 후 `worker/`에서 Wrangler로 Worker를 배포하고, 실제 Worker URL을 `web/config.js`의 `apiBase`에 넣습니다. 배포·계정 변경·비용 설정은 사용자 승인 후에만 실행하세요.

> 전용 서비스 계정 키를 사용하는 형태는 보안상 강력한 자격 증명을 다룹니다. 사용 권한 최소화, 키 접근 제한·교체 정책, 학교의 개인정보 관리 방침 검토가 필요합니다. Cloudflare/Firebase 제공 요금 및 무료 한도는 배포 시점에 다시 확인해야 합니다.

### 3. 공개 웹사이트/PWA

별도 GitHub 저장소에 코드를 업로드하고 GitHub Pages 설정의 Source를 **GitHub Actions**로 지정합니다. `.github/workflows/pages.yml`은 `npm test`와 `npm run check`가 성공했을 때만 `dist/`를 배포합니다. CSS/JS/서비스 워커 캐시 버전은 커밋마다 갱신됩니다.

Android Chrome에서는 브라우저 메뉴의 앱 설치 또는 '홈 화면에 추가', iPhone Safari에서는 공유 메뉴의 '홈 화면에 추가'를 이용합니다. 오프라인에서는 기존에 캐시한 화면을 볼 수 있지만 **로그인·저장·승인·상품 지급은 인터넷 연결이 필요합니다**.

## 보안 및 운영 시 주의

1. **학생 4자리 PIN**은 사용하기 쉽지만 강력한 인증 수단이 아닙니다. 동일 계정의 로그인 실패를 5회 누적하면 15분간 잠그고, PIN 재설정 시 기존 세션을 무효화합니다. 공용 기기에서는 반드시 로그아웃하고 더 강한 신원 확인이나 네트워크 보안 조치가 필요한 환경인지 학교에서 검토하세요.
2. **무승인 직접 가입**은 다른 학생의 번호를 먼저 등록하는 행위를 완전히 방지하지 못합니다. 교사는 계정 잠금/삭제/재등록으로 잘못된 가입을 정정할 수 있습니다.
3. **공용 임원 계정**은 누가 승인했는지 구분할 수 없습니다. 승인 상태와 시간만 남습니다.
4. **내용 익명화**는 등록 학생 이름과 칭찬 대상 이름을 치환하지만, 자유서술 중 예기치 않은 개인정보가 남을 수 있습니다. 임원은 승인 전에 내용을 직접 확인해야 합니다. 추가 개인정보 자동 검출은 운영 전 검증이 필요합니다.
5. Cloudflare Worker가 기록 접근 권한을 서버 측에서 확인하며 Firestore Client SDK를 사용한 직접 읽기/쓰기를 허용하지 않습니다. Worker API의 모든 민감 응답에는 `Cache-Control: no-store`가 설정됩니다.
6. **보관 정책:** 학생 기록은 교사가 직접 삭제할 때까지 보관합니다. 학교 담당자는 개인정보 수집 목적, 보관·삭제 권한, 학생·보호자 고지를 별도로 검토해야 합니다. 세션 문서는 만료 후에도 저장소에 남을 수 있으므로 실제 운영 시 서버 측 보관·정리 계획을 추가해야 합니다.
7. 상품 지급은 Firestore 트랜잭션으로 처리합니다. 실제 실시간 충돌·권한 보안 규칙 테스트는 Firebase/Worker를 연결한 뒤 별도 확인이 필요합니다.
8. **한계:** 현재 서버의 관리자 전체 기록 조회는 최대 1만 건, 학년별/학생별/승인된 기록 단일 조회는 최대 5천 건을 목표로 설계한 1차 버전입니다. 장기간 수년치 자료가 누적될 경우 목록 페이지네이션과 집계 전용 저장 구조가 필요합니다.

## 자동 검사 결과

- `npm test`: 도메인 규칙 7개 + Worker/Fake Firestore 통합 시나리오 1개 통과(세부 검증 다수 포함).
- `npm run check`: JavaScript 문법 검사 통과.
- `npm run build`: 정적 웹앱 빌드 및 버전 갱신 성공.
- 실제 Firebase 인증/쓰기, 실제 Worker 배포, Chrome/Safari/Android/iPhone 실기기 화면 및 PWA 설치: **미검증 (외부 배포 전 최종 점검 대상)**.
