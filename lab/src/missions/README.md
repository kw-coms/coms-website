# 아두이노 기초 미션

`MISSIONS`는 10개 한국어 미션의 시작 장면, 기준 장면·코드, 단계별 힌트, 필요한/허용된 부품, 동작 판정 단계를 제공합니다. UI는 시작 장면을 열고 사용자가 수정한 장면을 컴파일한 뒤 `checkMission(mission, scene, hex)`를 호출합니다. 판정은 `SimFrame.timeMs` 기준의 입력 변경, 실행, 부품 상태·핀·시리얼·전환 간격을 사용합니다. `referenceScene.code`를 기존 컴파일 서비스에 제출해 받은 HEX로 기준 장면을 동일한 판정기에 실행할 수 있습니다.

IC 핀은 패키지 번호(74HC595: 16 VCC, 8 GND, 14 SER, 11 SRCLK, 12 RCLK; 555: 8 VCC, 1 GND, 2 TRIG, 3 OUT, 4 RESET, 6 THRESH, 7 DISCH)를 씁니다. 키패드 `key` 입력은 0이 해제, 1~16이 행 우선 키 번호입니다. TMP36 출력 핀은 `OUT`입니다.

정적 테스트는 장면·핀 계약을 검사합니다. 실제 기준 HEX 컴파일과 10개 시뮬레이션 판정은 Docker AVR 도구체인과 완성된 v2 코어를 사용해 별도로 실행해야 합니다.

```ts
import { MISSIONS, checkMission } from './missions';
const mission = MISSIONS.find(m => m.id === 'led-blink')!;
const scene = structuredClone(mission.starterScene);
// UI가 사용자 회로와 코드를 편집하고 컴파일한 뒤:
const result = await checkMission(mission, scene, compiledHex, { signal: abortController.signal });
// result: { passed, step, message }; step은 실패한 1-based 단계 (사전 검사 실패는 0)
```

시작 장면의 부품 ID는 판정 대상입니다. UI에서 배선·코드를 편집할 때 ID를 유지하세요. 임의 ID로 다시 만든 회로는 UI에서 대상 ID를 매핑해야 합니다. 시작·참조 장면은 서로 독립된 복제본입니다. 재시도할 때도 `structuredClone`으로 새 시작 장면을 만드세요. 555 미션은 HEX 없이 실행하며, 시작 회로에는 완성해야 할 배선 한 가닥이 빠져 있습니다.

판정 DSL (`CheckerStep`):

- `setInput`: 부품 ID, 입력 key, 값 지정.
- `run`: 시뮬레이션 시간으로 N ms 진행. 이후 판정은 이 구간의 프레임·시리얼을 사용합니다.
- `expectPart`: `led.brightness`, `buzzer.on`, `motor.rpm` 등 공개 시각 상태를 비교.
- `expectPin`: 핀의 `level`, `duty`, `freq` 비교.
- `expectSerial`: 현재 구간에서 수신한 문자열 포함 여부.
- `expectSerialNumber`: 접두사 뒤 숫자가 지정 범위에 있는 완성된 줄 검사. TMP36은 ADC 양자화 오차를 허용하며 두 온도로 검사합니다.
- `expectTransitions`: 임계값 전환 횟수와 `intervalMs` 또는 `highMs`/`lowMs`를 허용 오차와 비교. 신호등은 순서·다른 색 꺼짐과 각 색의 켜짐/꺼짐 시간을 함께 확인합니다.

각 검사마다 독립 시뮬레이터를 생성·해제합니다. 실행당 최대 30초, 전체 시뮬레이션 최대 60초/100단계, 벽시계 최대 45초, 시리얼 4096자·프레임 2000개로 제한합니다. 취소, 시간 초과, 코어 오류, 누락된 관측값은 실패로 처리합니다. 테스트에서는 공개 `Simulator` 인터페이스의 합성 구현을 주입할 수 있습니다.
