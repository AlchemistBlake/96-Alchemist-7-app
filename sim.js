// 96-Alchemist-7 · kinematic lane simulation core (schema_version 1)
// Deterministic: integer-only state, seeded RNG, frame-indexed commands, no wall clock.
// sig: BWA_15.2003075_SOV_96.7Hz_SHA-BEWA_69912070
'use strict';

const SCHEMA_VERSION = 1;
const FP = 256; // fixed-point scale for particle positions/velocities

// mulberry32: 32-bit integer PRNG, identical across JS engines.
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// Shared frame-budget rule (M-021, agreed with worker/validate.py):
// total = duration_s * fps and must be an exact integer; frames are 0..total-1;
// every command needs at_frame < total and at_frame + (duration_frames||0) <= total.
function totalFrames(job) {
  const x = job.duration_s * job.fps, r = Math.round(x);
  return Math.abs(x - r) < 1e-9 ? r : null;
}

function checkJob(job) {
  const errs = [];
  if (job.schema_version !== SCHEMA_VERSION) errs.push('schema_version must be 1');
  if (job.mode !== 'kinematic') errs.push('mode must be kinematic');
  if (![24, 30, 60].includes(job.fps)) errs.push('fps must be 24|30|60');
  if (typeof job.duration_s !== 'number' || job.duration_s <= 0 || job.duration_s > 30) errs.push('duration_s out of range');
  if (!job.provenance || !Number.isInteger(job.provenance.seed)) errs.push('provenance.seed must be integer');
  const cmds = job.vdsb_commands;
  if (!Array.isArray(cmds) || cmds.length === 0) errs.push('vdsb_commands must be non-empty');
  const total = totalFrames(job);
  if (total === null) errs.push('duration_s * fps must be a whole number of frames');
  let last = -1;
  (cmds || []).forEach((c, i) => {
    if (!Number.isInteger(c.at_frame) || c.at_frame < 0) errs.push(`cmd ${i}: at_frame`);
    if (c.at_frame < last) errs.push(`cmd ${i}: at_frame goes backwards`);
    last = c.at_frame;
    const end = c.at_frame + (c.duration_frames || 0);
    if (total !== null && (c.at_frame >= total || end > total)) errs.push(`cmd ${i}: runs past duration`);
    switch (c.command) {
      case 'ui_lock': if (typeof c.state !== 'boolean') errs.push(`cmd ${i}: state`); break;
      case 'play_anim': case 'spawn_fx':
        if (!c.target || !c.asset_tag || !Number.isInteger(c.duration_frames)) errs.push(`cmd ${i}: target/asset_tag/duration_frames`); break;
      case 'ui_update_hp': if (!c.target || !Number.isInteger(c.value)) errs.push(`cmd ${i}: target/value`); break;
      default: errs.push(`cmd ${i}: unknown command ${c.command}`);
    }
  });
  return errs;
}

function entityIds(job) {
  const ids = new Set();
  if (job.core_event) { ids.add(job.core_event.caster); ids.add(job.core_event.target); }
  for (const c of job.vdsb_commands) if (c.target) ids.add(c.target);
  return [...ids].sort();
}

function createSim(job) {
  const errs = checkJob(job);
  if (errs.length) throw new Error('invalid kinematic job: ' + errs.join('; '));
  const rng = makeRng(job.provenance.seed);
  const ids = entityIds(job);
  const state = {
    frame: -1,
    total: totalFrames(job),
    ui_locked: false,
    entities: ids.map((id, i) => ({ id, slot: i, hp: 100, anim: null })),
    fx: [],
    fxSeq: 0,
  };
  const byId = new Map(state.entities.map(e => [e.id, e]));
  const cmds = job.vdsb_commands;
  let ci = 0;

  function apply(c) {
    const f = state.frame;
    switch (c.command) {
      case 'ui_lock': state.ui_locked = c.state; break;
      case 'play_anim': byId.get(c.target).anim = { tag: c.asset_tag, start: f, end: f + c.duration_frames }; break;
      case 'ui_update_hp': byId.get(c.target).hp = c.value; break;
      case 'spawn_fx': {
        const parts = [];
        for (let k = 0; k < 24; k++) {
          // velocity in fixed-point, range [-3,3] px/frame
          parts.push({ x: 0, y: 0, vx: (rng() % (6 * FP + 1)) - 3 * FP, vy: (rng() % (6 * FP + 1)) - 4 * FP });
        }
        state.fx.push({ seq: state.fxSeq++, target: c.target, tag: c.asset_tag, start: f, end: f + c.duration_frames, parts });
        break;
      }
    }
  }

  function step() {
    if (state.frame + 1 >= state.total) return false;
    state.frame++;
    const f = state.frame;
    // expire, then integrate particles (integer math only)
    for (const e of state.entities) if (e.anim && f >= e.anim.end) e.anim = null;
    state.fx = state.fx.filter(x => f < x.end);
    for (const x of state.fx) for (const p of x.parts) { p.x += p.vx; p.y += p.vy; p.vy += 16; }
    while (ci < cmds.length && cmds[ci].at_frame === f) apply(cmds[ci++]);
    return true;
  }

  // Canonical serialization: explicit field order, integers/booleans/strings only.
  function serialize() {
    const ent = state.entities.map(e => [e.id, e.hp, e.anim ? [e.anim.tag, e.anim.start, e.anim.end] : null]);
    const fx = state.fx.map(x => [x.seq, x.target, x.tag, x.start, x.end, x.parts.map(p => [p.x, p.y, p.vx, p.vy])]);
    return JSON.stringify([SCHEMA_VERSION, state.frame, state.ui_locked, ent, fx]);
  }

  return { state, step, serialize };
}

if (typeof module !== 'undefined') module.exports = { createSim, checkJob, totalFrames, makeRng, SCHEMA_VERSION, FP };
if (typeof window !== 'undefined') window.Kinematic = { createSim, checkJob, makeRng, SCHEMA_VERSION, FP };
