// A lab worker thread: runs the jobs it is sent (tools/lab/pool.js) and sends back each result.
import { parentPort } from 'node:worker_threads';
import * as jobs from './jobs.js';

parentPort.on('message', (job) => {
  try {
    const fn = jobs[job.fn];
    if (!fn) throw new Error(`no lab job named ${job.fn}`);
    parentPort.postMessage({ result: fn(...(job.args || [])) });
  } catch (e) { parentPort.postMessage({ error: String((e && e.stack) || e) }); }
});
