import { DipIC, To220, To92 } from './kit';
import type { PartProps } from './common';

export const Npn = (_: PartProps) => <To92 kind="npn" label="2N2222" />;
export const Pnp = (_: PartProps) => <To92 kind="pnp" label="2N2907" />;
export const Nmos = (_: PartProps) => <To220 kind="nmos" label="IRLZ44N" sub="N-MOSFET" />;
export const Tip120 = (_: PartProps) => <To220 kind="tip120" label="TIP120" sub="NPN Darlington" />;
export const Regulator7805 = (_: PartProps) => <To220 kind="regulator-7805" label="L7805CV" sub="5V 1.5A" />;

export const L293d = (_: PartProps) => <DipIC kind="l293d" label="L293D" sub="H-BRIDGE" />;
export const Shift595 = (_: PartProps) => <DipIC kind="shift-register-595" label="74HC595" sub="SHIFT REG" />;
export const Logic7400 = (_: PartProps) => <DipIC kind="logic-7400" label="74HC00" sub="NAND" />;
export const Logic7408 = (_: PartProps) => <DipIC kind="logic-7408" label="74HC08" sub="AND" />;
export const Logic7432 = (_: PartProps) => <DipIC kind="logic-7432" label="74HC32" sub="OR" />;
export const Logic7486 = (_: PartProps) => <DipIC kind="logic-7486" label="74HC86" sub="XOR" />;
export const Logic7404 = (_: PartProps) => <DipIC kind="logic-7404" label="74HC04" sub="NOT" />;
export const Timer555 = (_: PartProps) => <DipIC kind="timer-555" label="NE555P" sub="TIMER" />;
export const Opto4n35 = (_: PartProps) => <DipIC kind="optocoupler-4n35" label="4N35" sub="OPTO" />;
