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

import { Battery9v, BatteryAaPack, CapacitorCeramic, CapacitorElectrolytic, CoinCell, DiodePart, DipSwitch4, Inductor, Keypad4x4, TiltSwitch, ZenerPart } from './parts/passives';
import { FlexSensor, ForceSensor, GasSensor, IrReceiver, Pir, SoilMoisture, Tmp36 } from './parts/sensors';
import { Gearmotor, LightBulb, NeopixelRing, Relay, SevenSegment4, VibrationMotor } from './parts/outputs';
import { L293d, Logic7400, Logic7404, Logic7408, Logic7432, Logic7486, Nmos, Npn, Opto4n35, Pnp, Regulator7805, Shift595, Timer555, Tip120 } from './parts/semis';
import { FunctionGenerator, LogicAnalyzer, Oscilloscope, PowerSupply } from './parts/bench';

const BODY: Record<PartInstance['kind'], (p: PartProps) => React.ReactNode> = {
  'arduino-uno': ArduinoUno, 'breadboard-half': Breadboard, 'breadboard-full': Breadboard,
  led: Led, 'rgb-led': RgbLed, resistor: Resistor, pushbutton: Pushbutton, 'slide-switch': SlideSwitch,
  potentiometer: Potentiometer, photoresistor: Photoresistor, buzzer: Buzzer, servo: Servo, 'hc-sr04': HcSr04,
  'lcd1602-i2c': Lcd1602, multimeter: Multimeter, dht11: Dht11, joystick: Joystick, 'seven-segment': SevenSegment,
  'neopixel-strip': NeopixelStrip, l9110s: L9110s, 'dc-motor': DcMotor,
  // v2
  'battery-9v': Battery9v, 'battery-aa-pack': BatteryAaPack, 'coin-cell-3v': CoinCell, 'power-supply': PowerSupply,
  'capacitor-ceramic': CapacitorCeramic, 'capacitor-electrolytic': CapacitorElectrolytic, diode: DiodePart, zener: ZenerPart, inductor: Inductor,
  'dip-switch-4': DipSwitch4, 'keypad-4x4': Keypad4x4, 'tilt-switch': TiltSwitch, 'breadboard-mini': Breadboard,
  tmp36: Tmp36, pir: Pir, 'flex-sensor': FlexSensor, 'force-sensor': ForceSensor, 'soil-moisture': SoilMoisture, 'gas-sensor': GasSensor, 'ir-receiver': IrReceiver,
  'light-bulb': LightBulb, 'vibration-motor': VibrationMotor, gearmotor: Gearmotor, 'neopixel-ring': NeopixelRing, 'seven-segment-4digit': SevenSegment4, 'lcd1602-parallel': Lcd1602,
  npn: Npn, pnp: Pnp, nmos: Nmos, tip120: Tip120, 'relay-spdt': Relay, l293d: L293d, 'shift-register-595': Shift595,
  'logic-7400': Logic7400, 'logic-7408': Logic7408, 'logic-7432': Logic7432, 'logic-7486': Logic7486, 'logic-7404': Logic7404,
  'timer-555': Timer555, 'regulator-7805': Regulator7805, 'optocoupler-4n35': Opto4n35,
  oscilloscope: Oscilloscope, 'function-generator': FunctionGenerator, 'logic-analyzer': LogicAnalyzer,
};

/** One part: a group in world space that the interaction layer can find via userData.partId. */
export const PartView = memo(function PartView({ part }: { part: PartInstance }) {
  const Body = BODY[part.kind];
  const low = useStore((s) => s.quality === 'low');
  if (!Body) return null;
  const size = PARTS[part.kind]?.size ?? [10, 10, 10];
  const board = part.kind === 'arduino-uno' || part.kind.startsWith('breadboard');
  if (!PARTS[part.kind]) return null;
  return (
    <>
      <group position={part.pos} rotation-y={(part.rotY * Math.PI) / 180} userData={{ partId: part.id }}>
        <Body part={part} />
      </group>
      {/* low quality has no shadow maps: a cheap baked blob under the part instead */}
      {low && (
        <mesh position={[part.pos[0], (board ? DESK_Y : part.pos[1]) + 0.08, part.pos[2]]} rotation={[-Math.PI / 2, 0, (part.rotY * Math.PI) / 180]} renderOrder={1}>
          <planeGeometry args={[size[0] * (board ? 1.15 : 1.4) + 4, size[2] * (board ? 1.15 : 1.4) + 4]} />
          <meshBasicMaterial map={blobTexture()} transparent opacity={board ? 0.5 : 0.4} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </>
  );
});
