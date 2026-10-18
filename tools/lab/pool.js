// Runs lab jobs on every core: worker threads, each with its own copy of the simulation.
// A job is { fn, args }: fn names an export of tools/lab/jobs.js, run as fn(...args) in a worker.
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

export const WORKER = fileURLToPath(new URL('./worker.js', import.meta.url));
export const cores = () => Math.max(1, (os.availableParallelism ? os.availableParallelism() : os.cpus().length));

/** Run jobs on `workers` threads; onResult(result, job, done, total) as each one finishes. Results come back in job order. */
export async function runJobs(jobs, { workers = cores(), onResult } = {}) {
  const results = new Array(jobs.length);
  let next = 0, done = 0;
  const one = () => new Promise((resolve, reject) => {
    const w = new Worker(WORKER, { execArgv: [] });   // not the parent's flags (--input-type breaks a worker)
    let cur = -1;
    const go = () => {
      if (next >= jobs.length) { w.terminate().then(resolve); return; }
      cur = next++;
      w.postMessage(jobs[cur]);
    };
    w.on('message', (m) => {
      if (m.error) { w.terminate(); reject(new Error(`job ${cur} (${jobs[cur].fn}) failed: ${m.error}`)); return; }
      results[cur] = m.result; done++;
      if (onResult) onResult(m.result, jobs[cur], done, jobs.length);
      go();
    });
    w.on('error', reject);
    go();
  });
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, jobs.length)) }, one));
  return results;
}
