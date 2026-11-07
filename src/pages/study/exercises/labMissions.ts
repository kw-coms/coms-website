import type { LabMissionLink } from './types'

export const labMissions: LabMissionLink[] = [
  { id: 'led-blink', title: 'LED 깜빡이기', level: 1 },
  { id: 'traffic-light', title: '순서 지키는 신호등', level: 2 },
  { id: 'button-toggle', title: '버튼으로 LED 토글', level: 2 },
  { id: 'pot-dimmer', title: '가변저항으로 밝기', level: 2 },
  { id: 'distance-alarm', title: '10cm 거리 경보기', level: 3 },
  { id: 'tmp36-serial', title: 'TMP36 온도계', level: 3 },
  { id: 'shift-chase', title: '74HC595 LED 흐르기', level: 4 },
  { id: 'transistor-motor', title: '트랜지스터로 모터 구동', level: 4 },
  { id: 'keypad-password', title: '키패드 비밀번호', level: 5 },
  { id: 'timer-555', title: '아두이노 없는 555 깜빡이', level: 4 },
]

export const missionUrl = (id: string) => `/lab/#mission=${encodeURIComponent(id)}`
