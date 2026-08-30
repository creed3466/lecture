# CatGuard Relay — Multimodal VLM MVP

홈캠 캡처와 보호자의 상황 설명을 Gemini가 함께 살펴보고, 관찰 가능한 사실과 현장 확인 체크리스트를 만드는 웹 MVP입니다.

- Live: https://creed3466.github.io/lecture/
- Frontend: GitHub Pages 정적 HTML/CSS/JavaScript
- AI proxy: Cloudflare Worker
- Model: Gemini 2.5 Flash-Lite
- Fallback: Worker 미설정/장애 시 로컬 안전 분석

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
- Worker와 브라우저는 입력·이미지를 저장하지 않으며 응답에 `no-store`를 적용합니다.
- 무료 Gemini API에 보낸 데이터는 Google의 무료 서비스 데이터 정책이 적용될 수 있습니다. 과제 시연에는 비식별 샘플 이미지를 권장합니다.
- AI 결과는 질병·응급도·통증·감정·안전 상태를 진단하거나 보증하지 않습니다.
- 이미지가 없거나 AI 연결이 실패하면 사용자가 입력한 사실만 정리하는 로컬 모드로 자동 전환됩니다.
- 메시지는 자동 전송되지 않으며 피드백도 외부에 저장되지 않습니다.

## 파일 구조

```text
index.html           화면과 5단계 플로우
style.css            Apple-inspired UI와 VLM 분석 화면
script.js            이미지 정제, API 호출, 로컬 fallback
config.js            공개 가능한 Worker endpoint 설정
worker/
  wrangler.toml       Worker 배포 설정
  src/index.js        Gemini 프록시, CORS, 입력/응답 검증
```
