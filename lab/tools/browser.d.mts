export { compileOrigin } from './compile-origin.mjs';
export declare const LAB_ROOT: string;
export declare function outDir(defaultName: string, value?: string): string;
export declare function writeOutputFile(file: string, data: string | Uint8Array): Promise<void>;
export declare function saveScreenshot(target: { screenshot(): Promise<Uint8Array> }, file: string): Promise<void>;
export declare function chromeExecutable(): string;
export declare const GL_ARGS: string[];
