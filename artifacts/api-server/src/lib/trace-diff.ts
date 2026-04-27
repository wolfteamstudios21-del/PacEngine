/*
 * Trace v2 diff — TS mirror of TraceDiff.cpp. Both implementations
 * read the same byte-level format and compare frame-by-frame in
 * lock-step. Determinism is the headline guarantee, so this diff is
 * structural: every divergence is reported as one of a small set of
 * stable kinds.
 */

import { parseTraceV2, type TraceFrame, type EntityFrame } from "./trace-reader";
import type { TraceDiffEntry } from "@workspace/api-zod/types/traceDiffEntry";

export type { TraceDiffEntry };

export interface TraceDiffOutcome {
  identical: boolean;
  firstDivergenceTick?: number;
  entries: TraceDiffEntry[];
}

const MAX_ENTRIES = 100;

export function diffTraces(a: Buffer, b: Buffer): TraceDiffOutcome {
  const out: TraceDiffOutcome = { identical: true, entries: [] };

  let parsedA: ReturnType<typeof parseTraceV2>;
  let parsedB: ReturnType<typeof parseTraceV2>;
  try {
    parsedA = parseTraceV2(a);
  } catch (err) {
    return note(out, 0, "frame_size_diff",
      `trace A failed to load: ${(err as Error).message}`);
  }
  try {
    parsedB = parseTraceV2(b);
  } catch (err) {
    return note(out, 0, "frame_size_diff",
      `trace B failed to load: ${(err as Error).message}`);
  }

  const fa = parsedA.frames;
  const fb = parsedB.frames;
  const common = Math.min(fa.length, fb.length);

  for (let i = 0; i < common; i++) {
    const frameA = fa[i]!;
    const frameB = fb[i]!;
    if (frameA.tick !== frameB.tick) {
      note(out, frameA.tick, "frame_size_diff",
        `tick mismatch: A=${frameA.tick} B=${frameB.tick}`);
      continue;
    }
    diffEntities(out, frameA, frameB);
    diffEvents(out, frameA, frameB);
  }

  if (fa.length !== fb.length) {
    note(out, common, "frame_size_diff",
      `frame count differs: A=${fa.length} B=${fb.length}`);
  }

  return out;
}

function diffEntities(out: TraceDiffOutcome, a: TraceFrame, b: TraceFrame): void {
  const ne = Math.min(a.entities.length, b.entities.length);
  for (let e = 0; e < ne; e++) {
    const ea = a.entities[e]!;
    const eb = b.entities[e]!;
    if (ea.index !== eb.index || ea.generation !== eb.generation) {
      note(out, a.tick, "entity_changed",
        `entity slot ${e} identity differs (A=${ea.index}/${ea.generation} ` +
        `B=${eb.index}/${eb.generation})`);
      continue;
    }
    if (!entitiesEqual(ea, eb)) {
      note(out, a.tick, "entity_changed",
        `entity ${ea.index} components differ`);
    }
  }
  for (let e = ne; e < a.entities.length; e++) {
    note(out, a.tick, "entity_removed",
      `entity ${a.entities[e]!.index} present in A only`);
  }
  for (let e = ne; e < b.entities.length; e++) {
    note(out, a.tick, "entity_added",
      `entity ${b.entities[e]!.index} present in B only`);
  }
}

function diffEvents(out: TraceDiffOutcome, a: TraceFrame, b: TraceFrame): void {
  const ev = Math.min(a.events.length, b.events.length);
  for (let k = 0; k < ev; k++) {
    if (a.events[k] !== b.events[k]) {
      note(out, a.tick, "event_diff",
        `event ${k} differs: A='${a.events[k]}' B='${b.events[k]}'`);
    }
  }
  if (a.events.length !== b.events.length) {
    note(out, a.tick, "event_diff",
      `event count differs: A=${a.events.length} B=${b.events.length}`);
  }
}

function entitiesEqual(a: EntityFrame, b: EntityFrame): boolean {
  if (a.pacId !== b.pacId) return false;
  if (a.type !== b.type) return false;
  const pa = a.position;
  const pb = b.position;
  if ((pa === undefined) !== (pb === undefined)) return false;
  if (pa && pb) {
    if (pa.x !== pb.x || pa.y !== pb.y || pa.z !== pb.z) return false;
  }
  return true;
}

function note(
  out: TraceDiffOutcome,
  tick: number,
  kind: TraceDiffEntry["kind"],
  detail: string,
): TraceDiffOutcome {
  out.identical = false;
  if (out.firstDivergenceTick === undefined) {
    out.firstDivergenceTick = tick;
  }
  if (out.entries.length < MAX_ENTRIES) {
    out.entries.push({ tick, kind, detail });
  }
  return out;
}
