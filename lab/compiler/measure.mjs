// Run from a Linux host with the installed Arduino AVR toolchain: node measure.mjs [1|2].
// Values are sampled peaks; short-lived processes and disk peaks may be missed.
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSketch, runCli } from './compile.mjs';

const jobs = Number(process.argv[2] || 1);
if (![1, 2].includes(jobs)) throw new Error('usage: node measure.mjs [1|2]');
if (process.platform !== 'linux') throw new Error('measure.mjs requires Linux /proc');
const sketch = await readFile(fileURLToPath(new URL('./fixtures/heavy.ino', import.meta.url)), 'utf8');
const groups = new Set(), roots = new Set();
const peak = { totalRssBytes: 0, processRssBytes: 0, processVmBytes: 0, tmpAllocatedBytes: 0, largestFileBytes: 0 };
const executables = {};
let sampleError, sampling = false;

async function disk(root) {
  let allocated = 0, largest = 0;
  async function walk(path) {
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) {
        try { const info = await stat(child); allocated += info.blocks * 512; largest = Math.max(largest, info.size); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
  }
  await walk(root);
  return { allocated, largest };
}

async function sample() {
  if (sampling) return;
  sampling = true;
  try {
    let rss = 0;
    for (const entry of await readdir('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const proc = await readFile(`/proc/${entry}/stat`, 'utf8');
        const fields = proc.slice(proc.lastIndexOf(')') + 2).split(' ');
        if (!groups.has(Number(fields[2]))) continue; // /proc stat field 5: process group
        const status = await readFile(`/proc/${entry}/status`, 'utf8');
        const processRss = Number(status.match(/^VmRSS:\s+(\d+) kB/m)?.[1] || 0) * 1024;
        const processVm = Number(status.match(/^VmSize:\s+(\d+) kB/m)?.[1] || 0) * 1024;
        const highRss = Number(status.match(/^VmHWM:\s+(\d+) kB/m)?.[1] || 0) * 1024;
        const highVm = Number(status.match(/^VmPeak:\s+(\d+) kB/m)?.[1] || 0) * 1024;
        const name = status.match(/^Name:\s+(\S+)/m)?.[1] || 'unknown';
        const seen = executables[name] ||= { rssBytes: 0, vmBytes: 0 };
        seen.rssBytes = Math.max(seen.rssBytes, highRss, processRss);
        seen.vmBytes = Math.max(seen.vmBytes, highVm, processVm);
        rss += processRss;
        peak.processRssBytes = Math.max(peak.processRssBytes, highRss, processRss);
        peak.processVmBytes = Math.max(peak.processVmBytes, highVm, processVm);
      } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
    }
    peak.totalRssBytes = Math.max(peak.totalRssBytes, rss);
    let allocated = 0;
    for (const root of roots) {
      const size = await disk(root);
      allocated += size.allocated;
      peak.largestFileBytes = Math.max(peak.largestFileBytes, size.largest);
    }
    peak.tmpAllocatedBytes = Math.max(peak.tmpAllocatedBytes, allocated);
  } catch (error) { sampleError ||= error; }
  finally { sampling = false; }
}

const start = performance.now();
const timer = setInterval(sample, 20);
let results, compileError;
try {
  const settled = await Promise.allSettled(Array.from({ length: jobs }, () => compileSketch(sketch, {
    runner: (args, options) => {
      roots.add(options.cwd);
      return runCli(args, { ...options, spawnImpl: (command, argv, settings) => {
        const child = spawn(command, argv, settings);
        if (child.pid) groups.add(child.pid);
        return child;
      } });
    },
  })));
  results = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
  compileError = settled.find(result => result.status === 'rejected')?.reason;
} catch (error) {
  compileError = error;
} finally {
  clearInterval(timer);
}
while (sampling) await new Promise(resolve => setTimeout(resolve, 1));
const report = { jobs, wallMs: Math.round(performance.now() - start), ...peak, executables,
  results: results?.map(({ ok, reason, sizeBytes, errors }) => ({ ok, reason, sizeBytes, errors })),
  compileError: compileError?.message, samplingError: sampleError?.message };
console.log(JSON.stringify(report));
if (sampleError || compileError || results.some(result => !result.ok)) process.exitCode = 1;
