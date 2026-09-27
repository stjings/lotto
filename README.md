# Lotto Static v2

브라우저의 `Failed to fetch` 문제를 피하도록 데이터 로딩을 3단계로 구성했습니다.

1. `./data/all.json` — GitHub Actions가 매주 갱신하는 같은 도메인 데이터
2. `./data/recent.json` — 번들에 포함된 최근 회차 데이터
3. 외부 공개 JSON — 직접 호출 가능 환경에서만 사용
4. 위 요청이 모두 차단되면 HTML 내부 내장 데이터 사용

## GitHub Pages
main 브랜치의 root를 Pages로 배포하면 됩니다.

## 자동 업데이트
`.github/workflows/update-lotto.yml`가 매주 토요일 15:30 UTC
(한국시간 일요일 00:30)에 공개 데이터셋을 내려받아 `data/all.json`을 갱신합니다.
