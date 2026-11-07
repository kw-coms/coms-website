import { LocalSimulator } from './local-simulator';
import type { Command, Event } from './simulator';

const simulator = new LocalSimulator();
const send = (event: Event): void => globalThis.postMessage(event);

simulator.onFrame(value => send({ type: 'frame', value }));
simulator.onSerial(value => send({ type: 'serial', value }));
simulator.onState((state, error) => {
  if (state === 'idle' && error) send({ type: 'error', value: error.replace(/^시뮬레이션 오류: /, '') });
});

globalThis.onmessage = (event: MessageEvent<Command>) => {
  const command = event.data;
  try {
    switch (command.method) {
      case 'setScene':
        simulator.setScene(command.value);
        break;
      case 'loadHex':
        simulator.loadHex(command.value);
        break;
      case 'writeSerial':
        simulator.writeSerial(command.value);
        break;
      case 'setSpeed':
        simulator.setSpeed(command.value);
        break;
      case 'setInput':
        simulator.setInput(command.value);
        break;
      case 'debugLoad':
        simulator.debug.load(command.value);
        break;
      case 'debugBreakpoints':
        simulator.debug.setBreakpoints(command.value);
        break;
      case 'debugContinue':
        simulator.debug.continue();
        break;
      case 'debugStepInto':
        simulator.debug.stepInto();
        break;
      case 'debugStepOver':
        simulator.debug.stepOver();
        break;
      case 'debugStepOut':
        simulator.debug.stepOut();
        break;
      default:
        simulator[command.method]();
    }
  } catch (error) {
    simulator.pause();
    send({ type: 'error', value: error instanceof Error ? error.message : String(error) });
  }
};
