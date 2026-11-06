import { memo } from 'react';
import type { PartInstance } from '../core/types';
import { PARTS } from '../ui/core';
import { useStore } from '../ui/store';
import { DESK_Y } from './sceneRefs';
import { blobTexture } from './parts/common';
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
  const low = useStore((s) => s.quality === 'low');
  if (!Body) return null;
  const size = PARTS[part.kind]?.size ?? [10, 10, 10];
  const board = part.kind === 'arduino-uno' || part.kind.startsWith('breadboard');
  return (
    <>
      <group position={part.pos} rotation-y={(part.rotY * Math.PI) / 180} userData={{ partId: part.id }}>
        <Body part={part} />
      </group>
      {/* low quality has no shadow maps: a cheap baked blob under the part instead */}
      {low && (
        <mesh position={[part.pos[0], (board ? DESK_Y : part.pos[1]) + 0.08, part.pos[2]]} rotation={[-Math.PI / 2, 0, (part.rotY * Math.PI) / 180]} renderOrder={1}>
          <planeGeometry args={[size[0] * (board ? 1.25 : 1.9) + 6, size[2] * (board ? 1.25 : 1.9) + 6]} />
          <meshBasicMaterial map={blobTexture()} transparent opacity={board ? 0.5 : 0.4} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </>
  );
});
