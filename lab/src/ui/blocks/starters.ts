import { workspace, type N } from './build';

const loop = (...s: N[]): N => ({ type: 'lab_loop', do: { DO: s } });
/** A fresh workspace: the two containers every program needs. */
export const DEFAULT_BLOCKS = {
  blocks: { languageVersion: 0, blocks: [{ type: 'lab_setup', x: 24, y: 24 }, { type: 'lab_loop', x: 24, y: 130 }] },
};
const w = (ms: number): N => ({ type: 'lab_wait', fields: { UNIT: 'ms' }, in: { TIME: ms } });
const write = (pin: string, state: 'HIGH' | 'LOW'): N => ({ type: 'lab_digital_write', fields: { PIN: pin, STATE: state } });

const blink = (pin: string) => workspace([loop(write(pin, 'HIGH'), w(500), write(pin, 'LOW'), w(500))]);

/** Block versions of the beginner examples, keyed by the example id in src/core/examples.ts. */
export const STARTER_BLOCKS: Record<string, ReturnType<typeof workspace>> = {
  'builtin-blink': blink('13'),
  'external-blink': blink('8'),
  'button-led': workspace([loop({
    type: 'controls_if', extra: { hasElse: true },
    in: { IF0: { type: 'lab_button', fields: { PIN: '2', WIRING: 'PULLUP' } } },
    do: { DO0: [write('8', 'HIGH')], ELSE: [write('8', 'LOW')] },
  })]),
  'pot-led': workspace([loop(
    {
      type: 'lab_pwm_write', fields: { PIN: '9' },
      in: { VALUE: { type: 'lab_map', in: { VALUE: { type: 'lab_analog_read', fields: { PIN: 'A0' } }, FROM_LOW: 0, FROM_HIGH: 1023, TO_LOW: 0, TO_HIGH: 255 } } },
    },
    w(10),
  )]),
  'servo-sweep': workspace([loop(
    { type: 'controls_for', fields: { VAR: 'angle' }, in: { FROM: 0, TO: 180, BY: 1 }, do: { DO: [{ type: 'lab_servo_write', fields: { PIN: '9' }, in: { ANGLE: { type: 'variables_get', fields: { VAR: 'angle' } } } }, w(15)] } },
    { type: 'controls_for', fields: { VAR: 'angle' }, in: { FROM: 180, TO: 0, BY: -1 }, do: { DO: [{ type: 'lab_servo_write', fields: { PIN: '9' }, in: { ANGLE: { type: 'variables_get', fields: { VAR: 'angle' } } } }, w(15)] } },
  )], ['angle']),
  'distance-alarm': workspace([loop(
    { type: 'variables_set', fields: { VAR: 'cm' }, in: { VALUE: { type: 'lab_ultrasonic', fields: { TRIG: '7', ECHO: '6' } } } },
    {
      type: 'controls_if', extra: { hasElse: true },
      in: {
        IF0: {
          type: 'logic_operation', fields: { OP: 'AND' },
          in: {
            A: { type: 'logic_compare', fields: { OP: 'GT' }, in: { A: { type: 'variables_get', fields: { VAR: 'cm' } }, B: 0 } },
            B: { type: 'logic_compare', fields: { OP: 'LT' }, in: { A: { type: 'variables_get', fields: { VAR: 'cm' } }, B: 20 } },
          },
        },
      },
      do: { DO0: [write('4', 'HIGH'), { type: 'lab_tone', fields: { PIN: '8' }, in: { FREQ: 1000 } }], ELSE: [write('4', 'LOW'), { type: 'lab_no_tone', fields: { PIN: '8' } }] },
    },
    w(60),
  )], ['cm']),
};
