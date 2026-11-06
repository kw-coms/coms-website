/** ATmega328P peripherals run at 16 MHz: 16 cycles per microsecond. */
export const CYCLES_PER_US = 16;
export type Schedule = (callback: () => void, delayCycles: number) => void;
export type Drive = (level: 0 | 1) => void;

export { LCD1602 } from './lcd-protocol';
export { DHT11Protocol } from './dht11';
export { HCSR04Protocol } from './hcsr04';
export { WS2812Protocol } from './ws2812';
export { servoAngleFromPulseUs } from './servo';
