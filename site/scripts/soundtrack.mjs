#!/usr/bin/env node
// Synthesize the trailer soundtrack (standard library only): 120 BPM disco in A minor with boxing-bell hits
// and sparkle chimes on the glitter bursts. Writes a 44.1 kHz 16-bit stereo WAV.
//   node site/scripts/soundtrack.mjs out.wav [seconds]
import { writeFileSync } from 'node:fs';
const out = process.argv[2] || 'soundtrack.wav'; const DUR = +(process.argv[3] || 40);
const SR = 44100; const N = Math.ceil(DUR * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4;
let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - Math.max(0, pan)); R[i] += v * (1 + Math.min(0, pan)); } };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function kick(t0, amp = .9) { const n = .45 * SR; let ph = 0; for (let k = 0; k < n; k++) { const t = k / SR; const f = 45 + 110 * Math.exp(-t * 32); ph += 2 * Math.PI * f / SR; add(Math.floor(t0 * SR) + k, Math.sin(ph) * Math.exp(-t * 7) * amp); } }
function hat(t0, amp = .16, open = false) { const n = (open ? .16 : .05) * SR; let prev = 0; for (let k = 0; k < n; k++) { const t = k / SR; const w = rnd(); const hp = w - prev; prev = w; add(Math.floor(t0 * SR) + k, hp * Math.exp(-t * (open ? 22 : 70)) * amp, .25); } }
function clap(t0, amp = .3) { const n = .22 * SR; for (let k = 0; k < n; k++) { const t = k / SR; const env = (t < .03 ? (Math.floor(t / .01) % 2 ? .6 : 1) : 1) * Math.exp(-t * 18); add(Math.floor(t0 * SR) + k, rnd() * env * amp, -.15); } }
function bass(t0, dur, midi, amp = .28) { const f = mtof(midi); const n = dur * SR; let ph = 0; for (let k = 0; k < n; k++) { const t = k / SR; ph += f / SR; const x = ph % 1; const saw = 2 * x - 1; const sq = x < .5 ? 1 : -1; const env = Math.min(1, t * 200) * Math.exp(-t * 5); add(Math.floor(t0 * SR) + k, (saw * .55 + sq * .25 + Math.sin(2 * Math.PI * ph) * .6) * env * amp * .5); } }
function stab(t0, dur, notes, amp = .09, pan = 0) { const n = dur * SR; for (const m of notes) { const f = mtof(m); for (const det of [-0.12, 0.12]) { const ff = f * Math.pow(2, det / 12); let ph = Math.random(); for (let k = 0; k < n; k++) { const t = k / SR; ph += ff / SR; const env = Math.min(1, t * 90) * Math.exp(-t * 6); add(Math.floor(t0 * SR) + k, (2 * (ph % 1) - 1) * env * amp / notes.length, pan * det * 8); } } } }
function pad(t0, dur, notes, amp = .05) { const n = dur * SR; for (const m of notes) { const f = mtof(m); let ph = 0; for (let k = 0; k < n; k++) { const t = k / SR; ph += f / SR; const env = Math.min(1, t / .8) * Math.min(1, (dur - t) / .8); add(Math.floor(t0 * SR) + k, Math.sin(2 * Math.PI * ph) * env * amp / notes.length * (1 + .3 * Math.sin(2 * Math.PI * .5 * t))); } } }
function bell(t0, amp = .5, f0 = 1046) { const parts = [[1, 1, 2.2], [2.76, .6, 3.2], [5.4, .4, 4.5], [8.93, .25, 6], [0.5, .35, 1.6]]; const n = 3.2 * SR; for (const [r, a, d] of parts) { const f = f0 * r; for (let k = 0; k < n; k++) { const t = k / SR; add(Math.floor(t0 * SR) + k, Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t * d) * Math.min(1, t * 800) * amp); } } }
function chimes(t0, count = 9, amp = .12) { const scale = [81, 84, 86, 88, 91, 93, 96, 98]; for (let c = 0; c < count; c++) { const st = t0 + c * .045 + Math.abs(rnd()) * .03; const f = mtof(scale[(c * 5 + 3) % scale.length]); const n = .9 * SR; const pan = rnd() * .7; for (let k = 0; k < n; k++) { const t = k / SR; add(Math.floor(st * SR) + k, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 5) * amp * (1 - c / count * .5), pan); } } }
function riser(t0, dur, amp = .18) { const n = dur * SR; let prev = 0; for (let k = 0; k < n; k++) { const t = k / SR; const x = t / dur; const w = rnd(); const f = prev + (w - prev) * (0.05 + x * .6); prev = f; add(Math.floor(t0 * SR) + k, f * x * x * amp); } }

// arrangement (seconds); scene cuts: 4.05 wordmark, 8.2 stats, 12.2 race, 20.2 8/8, 25.2 scatter, 30.2 speed, 34.3 end
const prog = [[57, [69, 72, 76]], [53, [65, 69, 72]], [48, [67, 72, 76]], [55, [67, 71, 74]]];   // Am F C G
bell(0.15, .55); pad(0, 4.1, [57, 64, 69, 72], .12); riser(2.1, 1.95, .22);
for (let t = 4; t < 38; t += BEAT) {
  const beat = Math.round((t - 4) / BEAT); const bar = Math.floor(beat / 4); const [root, chord] = prog[bar % 4];
  const breakdown = t >= 20 && t < 22;        // hold the kick for the 8/8 moment
  if (!breakdown) kick(t, t < 4.6 ? 1 : .85);
  if (t >= 8) hat(t + BEAT / 2, .14, true);
  if (t >= 8 && beat % 4 === 1 || t >= 8 && beat % 4 === 3) clap(t, .26);
  if (t >= 8) { hat(t, .06); hat(t + BEAT * .25, .05); hat(t + BEAT * .75, .05); }
  // octave disco bass on eighths
  if (!breakdown) for (let e = 0; e < 2; e++) bass(t + e * BEAT / 2, BEAT / 2 * .9, root - 24 + (e ? 12 : 0), .3);
  if (beat % 4 === 1 && t >= 12) stab(t + BEAT / 2, .22, chord, .1, 1);
  if (beat % 4 === 3 && t >= 12) stab(t + BEAT / 2, .22, chord, .08, -1);
  if (t >= 25 && t < 34) { const arp = [...chord, chord[0] + 12]; bass(t + BEAT / 4, BEAT / 4, arp[beat % 4] + 12, .05); }
}
pad(20, 2.2, [69, 72, 76, 81], .16);
bell(4.05, .45, 1318); chimes(4.05, 12, .1);
chimes(16.3, 8, .09);                 // RiNGSiDE finishes the race (t ≈ 13 + 5.5 * 382/1159)
bell(20.3, .5, 1175); chimes(20.4, 14, .1);
bell(34.3, .5); chimes(34.3, 12, .1);
bell(38.2, .6, 880);
// master: gentle limiter + fades, write WAV
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = .89 / Math.max(1, peak);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const t = i / SR; const fade = Math.min(1, t / .05) * Math.min(1, (DUR - t) / 1.2);
  const s = (x) => Math.max(-1, Math.min(1, Math.tanh(x * g * 1.1) * fade));
  buf.writeInt16LE(Math.round(s(L[i]) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(s(R[i]) * 32767), 46 + i * 4);
}
writeFileSync(out, buf);
console.log(`soundtrack: ${out} (${DUR}s, peak before limiter ${peak.toFixed(2)})`);
