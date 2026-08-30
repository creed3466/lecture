// 배포 후 Cloudflare Worker 주소만 입력하세요. API 키는 이 파일에 넣지 않습니다.
window.CATGUARD_CONFIG = {
  aiEndpoint: "https://catguard-relay-ai.creed3466.workers.dev/analyze",
  collectEndpoint: "https://catguard-relay-ai.creed3466.workers.dev/collect",
  testMode: true
};
