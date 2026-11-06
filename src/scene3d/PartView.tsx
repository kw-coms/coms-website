import { memo } from 'react';
import type { PartInstance } from '../core/types';
import { Breadboard, ArduinoUno } from './parts/boards';
import { Buzzer, Led, Photoresistor, Potentiometer, Pushbutton, Resistor, RgbLed, SlideSwitch } from './parts/basic';
import { DcMotor, Dht11, HcSr04, Joystick, L9110s, Lcd1602, Multimeter, NeopixelStrip, SevenSegment, Servo } from './parts/modules';
import type { PartProps } from './parts/common';

const BODY: Record<PartInstance['kind'], (p: PartProps) => React.ReactNode> = {
  'arduino-uno': ArduinoUno, 'breadboard-half': Breadboard, 'breadboard-full': Breadboard,
  led: Led, 'rgb-led': RgbLed, resistor: Resistor, pushbutton: Pushbutton, 'slide-switch': SlideSwitch,
  potentiometer: Potentiometer, photoresistor: Photoresistor, buzzer: Buzzer, servo: Servo, 'hc-sr04': HcSr04,
  'lcd1602-i2c': Lcd1602, multimeter: Multimeter, dht11: Dht11, joystick: Joystick, 'seven-segment': SevenSegment,
  'neopixel-strip': NeopixelStrip, l9110s: L9110s, 'dc-motor': DcMotor,
};

/** One part: a group in world space that the interaction layer can find via userData.partId. */
export const PartView = memo(function PartView({ part }: { part: PartInstance }) {
  const Body = BODY[part.kind];
  if (!Body) return null;
  return (
    <group position={part.pos} rotation-y={(part.rotY * Math.PI) / 180} userData={{ partId: part.id }}>
      <Body part={part} />
    </group>
  );
});
