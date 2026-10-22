# 금괴 도둑 🏃

경비를 피해 금괴를 모두 모으고 사다리로 탈출하는 로드러너식 플랫폼 퍼즐. 의존성 없는 정적 게임(`index.html` + `logic.js` + `game.js`)입니다.

- 땅을 파서 경비를 구멍에 빠뜨리고, 금괴를 미끼로 경비를 유인할 수 있어요
- 코스 8개, 코스별 최고 클리어 시간(`loderunnerTimes`)과 클리어한 코스 수(`loderunnerBest`)를 localStorage 에 저장
- 클리어하면 경비와 가장 가까웠던 순간 앞뒤를 잘라 둔 "아슬아슬" 리플레이와 결과 복사
- 조작: ← → ↑ ↓ / WASD 이동, Z·Q 왼쪽 파기, X·E 오른쪽 파기, R 다시 시작, P 일시정지, M 소리 (터치는 화면 버튼)

규칙(`newWorld`, `stepWorld` …)은 `logic.js`(화면 없이 Node 로 시험할 수 있다: `node test/logic.test.js`), 화면·입력·소리·리플레이는 `game.js`.
