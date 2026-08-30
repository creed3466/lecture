# CatGuard Relay — Multimodal VLM MVP

정식 서비스는 홈캠 영상을 자동 관찰해 이상 장면을 감지하고 보호자 본인에게 카카오톡으로 알립니다. 현재 웹 MVP는 사진 1장을 수동 제출해 Gemini 분석, 본인 알림 시뮬레이션, 선택적 가족·지인 현장 확인 요청까지 검증합니다.

- Live: https://creed3466.github.io/lecture/
- Frontend: GitHub Pages 정적 HTML/CSS/JavaScript
- AI proxy: Cloudflare Worker
- Model: Gemini 3.1 Flash-Lite
- Fallback: Worker 미설정/장애 시 로컬 안전 분석
- Built-in demo: 사진이 없는 사용자를 위한 224×298 예시 이미지와 상세 상황 입력
- Notification demo: 실제 전송 없이 카카오톡 알림 도착 장면을 웹에서 재현
- Date input: Apple Calendar 스타일의 시작일–종료일 부재 일정 선택
- Event preview: 체크형 이벤트 감지 분석 시나리오
- Zero-input demo: 2단계 입력을 비우고 제출하면 기본 사진과 예시 상황을 자동 적용
- Test mode: `config.js`의 `testMode: true`에서 Gemini API를 호출하지 않고 고정 분석 응답 사용
- Database: Google Sheets의 `event_log`, `feedback`, `dashboard`, `codebook` 4개 탭

## 로컬 실행

```bash
git clone https://github.com/creed3466/lecture.git
cd lecture
python -m http.server 8000
```

`http://localhost:8000`에서 확인합니다. Worker 주소를 설정하지 않아도 전체 UI는 로컬 fallback으로 동작합니다.

## 실제 Gemini 이미지 분석 연결

### 1. Gemini API 키 만들기

Google AI Studio에서 Gemini API 키를 만듭니다. 키를 `config.js`, GitHub 저장소, HTML 또는 브라우저 JavaScript에 넣지 마세요.

### 2. Cloudflare Worker 배포

```bash
cd worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

`GEMINI_API_KEY`는 Cloudflare Secret에만 저장됩니다. 필요하면 `wrangler.toml`의 `ALLOWED_ORIGINS`에 쉼표로 구분한 허용 출처를 추가합니다.

### 3. 프런트엔드에 Worker URL 연결

배포 결과가 `https://catguard-relay-ai.<account>.workers.dev`라면 `config.js`를 다음처럼 수정합니다.

```js
window.CATGUARD_CONFIG = {
  aiEndpoint: "https://catguard-relay-ai.<account>.workers.dev/analyze"
};
```

이 URL은 비밀정보가 아닙니다. Gemini API 키는 계속 Worker Secret에만 존재합니다.

## 데이터 처리와 제한

- 사진은 브라우저에서 최대 1280px JPEG로 다시 인코딩해 EXIF 위치정보를 제거합니다.
- 제품 방향은 연속 영상 자동 감지이지만, 현재 MVP의 Gemini 입력은 사용자가 제출한 사진 한 장으로 제한합니다.
- Worker와 브라우저는 입력·이미지를 저장하지 않으며 응답에 `no-store`를 적용합니다.
- Gemini API로 보내는 데이터에는 연결된 Google 서비스 약관과 데이터 정책이 적용됩니다. 과제 시연에는 비식별 샘플 이미지를 권장합니다.
- AI 결과는 질병·응급도·통증·감정·안전 상태를 진단하거나 보증하지 않습니다.
- 이미지가 없거나 AI 연결이 실패하면 사용자가 입력한 사실만 정리하는 로컬 모드로 자동 전환됩니다.
- 카카오톡과 가족·지인 메시지는 실제로 전송되지 않습니다. 익명화된 분석 결과와 선택형 피드백만 Google Sheets 저장 대상으로 사용합니다.

## Google Sheets DB 연결

1. `google-apps-script/Code.gs`를 Apps Script 프로젝트에 붙여 넣습니다.
2. 스크립트 속성에 `SPREADSHEET_ID`와 임의의 긴 `WEBHOOK_TOKEN`을 저장합니다.
3. 웹 앱을 `나로 실행`, 접근 권한 `모든 사용자`로 배포합니다.
4. Cloudflare Worker에 웹 앱 URL과 동일 토큰을 Secret으로 저장합니다.

```bash
cd worker
npx wrangler secret put SHEETS_WEBHOOK_URL
npx wrangler secret put SHEETS_WEBHOOK_TOKEN
npx wrangler deploy
```

`SHEETS_WEBHOOK_URL`이 없는 테스트 환경에서도 `/collect`는 개인정보가 제거된 저장 페이로드를 검증하고 `validated_only`로 응답합니다. 실제 시트에는 사진 원본, 이름, 연락처, 주소, IP, 자유 입력 원문을 저장하지 않습니다.

## 파일 구조

```text
index.html           화면과 5단계 플로우
style.css            Apple-inspired UI와 VLM 분석 화면
script.js            이미지 정제, API 호출, 로컬 fallback
config.js            공개 가능한 Worker endpoint 설정
assets/default/      사진이 없는 사용자를 위한 224px급 예시 이미지
worker/
  wrangler.toml       Worker 배포 설정
  src/index.js        Gemini 프록시, CORS, 입력/응답 검증
google-apps-script/   Google Sheets 행 추가용 Apps Script
```
