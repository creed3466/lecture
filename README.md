# CatGuard Relay Web MVP

외부 AI/API 의존성을 제거한 **로컬 UI/플로우 확인용 버전**입니다.

## 실행

```bash
git clone https://github.com/creed3466/lecture.git
cd lecture
python -m http.server 8000
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:8000
```

별도 API 키, 환경변수, npm 패키지 설치가 필요하지 않습니다.

## 현재 동작 방식

PRD의 5단계 화면 흐름은 그대로 유지합니다.

1. 최근 원격 확인 경험 확인
2. 실제 부재 사례 입력 + 개인정보 처리 동의
3. 현장 확인 검토 결과 표시
4. 가족/지인/펫시터 Relay 요청 문구 생성
5. 즉시 피드백

`AI로 정리하기` 버튼은 외부 AI를 호출하지 않고 브라우저 내부의 로컬 데모 처리기를 실행합니다.

로컬 처리기는:
- 사용자가 입력한 사실을 구조화
- 확인되지 않은 부분 표시
- 현장 확인을 고려할 수 있는 이유 정리
- 선택한 사람에게 보낼 현장 확인 요청 문구 생성

## 제한

이 버전은 실제 AI 모델이 아니라 UI와 행동 가설 검증을 위한 로컬 처리기입니다.

- 질병 진단 없음
- 응급도 판정 없음
- 안전 상태 보증 없음
- 치료/투약 지시 없음
- 업로드 이미지 내용 분석 없음
- 실시간 홈캠 연동 없음
- 메시지 자동 전송 없음
- Google Sheets 저장 없음
- 결제 없음
- 외부 네트워크 요청 없음

## GitHub Pages

API 키가 없으므로 정적 GitHub Pages에서도 그대로 화면 데모가 동작합니다.

- 배포 URL: https://creed3466.github.io/lecture/

- `index.html`, `style.css`, `script.js`를 같은 폴더에 둘 것
- 상대경로 `./style.css`, `./script.js` 유지
- Clipboard 복사는 HTTPS 또는 localhost에서 테스트
