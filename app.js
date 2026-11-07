'use strict';
// 96-Alchemist-7 job composer. Mirrors the schema_version 1 rules the Python validator enforces
// (schema/job.schema.json stays authoritative; the worker re-validates every job it touches).
const REPO = 'AlchemistBlake/96-Alchemist-7', BRANCH = 'main';
const SIG = 'BWA_15.2003075_SOV_96.7Hz_SHA-BEWA_69912070';
const $ = id => document.getElementById(id);

function nowIso(d = new Date()) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

function newId(d = new Date(), rand = crypto.getRandomValues(new Uint32Array(1))[0]) {
  const t = d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `job_${t}_${rand.toString(36)}`;
}

function buildJob(f, d = new Date(), id = newId(d)) {
  const ts = nowIso(d);
  return {
    schema_version: 1, id, mode: f.mode, status: 'queued', prompt: f.prompt.trim(),
    refs: f.mode === 'i2v' && f.ref.trim() ? [f.ref.trim()] : [],
    duration_s: f.mode === 't2i' ? 0 : Number(f.dur),
    created_at: ts, updated_at: ts, error: null, worker_id: null, attempts: 0, max_attempts: 3,
    heartbeat_at: null, lease_s: 600, segments: [], output_url: null,
    provenance: { model: null, model_version: null, seed: f.seed === '' ? null : Number(f.seed), sha256: null },
    sig: SIG, vdsb_commands: []
  };
}

function check(job) {
  const e = [];
  if (!/^job_[A-Za-z0-9_-]+$/.test(job.id)) e.push('bad id');
  if (!['t2i', 't2v', 'i2v'].includes(job.mode)) e.push('mode must be t2i, t2v or i2v here');
  if (!job.prompt) e.push('Prompt is required.');
  if (job.mode !== 't2i' && !(Number.isInteger(job.duration_s) && job.duration_s >= 1 && job.duration_s <= 30))
    e.push('Length must be a whole number from 1 to 30 seconds.');
  if (job.mode === 'i2v' && job.refs.length !== 1) e.push('Image → Video needs a start image.');
  if (job.refs[0] && /^http:\/\//.test(job.refs[0])) e.push('Use an https URL or a repo path for the start image.');
  const s = job.provenance.seed;
  if (s !== null && !(Number.isInteger(s) && s >= 0 && s < 2 ** 31)) e.push('Seed must be a whole number from 0 to 2147483647.');
  return e;
}

// Minimal YAML emitter for this flat job shape (strings always JSON-quoted, so YAML-safe).
function toYaml(job) {
  const v = x => x === null ? 'null' : typeof x === 'string' ? JSON.stringify(x)
    : Array.isArray(x) ? '[' + x.map(v).join(', ') + ']'
    : typeof x === 'object' ? '{' + Object.entries(x).map(([k, y]) => `${k}: ${v(y)}`).join(', ') + '}' : String(x);
  return Object.entries(job).map(([k, x]) => `${k}: ${v(x)}`).join('\n') + '\n';
}

function newFileUrl(job, yaml) {
  const q = new URLSearchParams({ filename: `jobs/${job.id}.yaml`, value: yaml });
  return `https://github.com/${REPO}/new/${BRANCH}?${q}`;
}

if (typeof module !== 'undefined') module.exports = { buildJob, check, toYaml, newFileUrl, newId };

if (typeof document !== 'undefined') {
  let id = newId();
  const form = () => ({ mode: $('mode').value, prompt: $('prompt').value, dur: $('dur').value, seed: $('seed').value, ref: $('ref').value });
  const render = () => {
    const f = form(), kin = f.mode === 'kinematic';
    $('promptWrap').classList.toggle('hide', kin); $('seed').parentElement.classList.toggle('hide', kin);
    $('durWrap').classList.toggle('hide', kin || f.mode === 't2i');
    $('refWrap').classList.toggle('hide', f.mode !== 'i2v'); $('kinWrap').classList.toggle('hide', !kin);
    $('queue').classList.toggle('hide', kin); $('how').classList.toggle('hide', kin);
    if (kin) { $('yaml').textContent = 'Kinematic jobs are edited and played in the kinematic player.'; $('err').textContent = ''; return; }
    const job = buildJob(f, new Date(), id), errs = check(job);
    $('yaml').textContent = toYaml(job); $('err').textContent = errs.join('\n');
    $('queue').disabled = errs.length > 0;
  };
  ['mode', 'prompt', 'dur', 'seed', 'ref'].forEach(k => $(k).addEventListener('input', render));
  $('queue').addEventListener('click', () => {
    const job = buildJob(form(), new Date(), id);
    if (check(job).length) return render();
    window.open(newFileUrl(job, toYaml(job)), '_blank', 'noopener');
    id = newId(); render();                       // next job gets a fresh id
  });
  render();
}
