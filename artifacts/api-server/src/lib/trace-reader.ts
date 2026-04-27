/*
 * Trace v2 reader — TS mirror of pacengine/engine/trace/src/TraceReader.cpp.
 *
 * The exact same byte format that the C++ writer produces is parsed
 * here. Determinism note: the editor never re-encodes a trace; this
 * reader only decodes it into JSON-friendly shapes for the
 * /pacengine/runs/:runId/frames endpoint.
 */

import type { TraceFrame } from "@workspace/api-zod/types/traceFrame";
import type { EntityFrame } from "@workspace/api-zod/types/entityFrame";
import type { PositionValue } from "@workspace/api-zod/types/positionValue";

export type { TraceFrame, EntityFrame, PositionValue };

// Component type tags — must match TraceFormat.hpp.
const TAG_PAC_ID = 1;
const TAG_ENTITY_TYPE = 2;
const TAG_POSITION = 3;

const HEADER_SIZE = 16;
const MAGIC = "PACT";
const VERSION_V2 = 2;

class Cursor {
  pos = 0;
  constructor(private readonly buf: Buffer) {}
  remaining(): number {
    return this.buf.length - this.pos;
  }
  readU8(): number {
    const v = this.buf.readUInt8(this.pos);
    this.pos += 1;
    return v;
  }
  readU16(): number {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  readU32(): number {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  readU64(): bigint {
    const v = this.buf.readBigUInt64LE(this.pos);
    this.pos += 8;
    return v;
  }
  readF64(): number {
    const v = this.buf.readDoubleLE(this.pos);
    this.pos += 8;
    return v;
  }
  readBytes(n: number): Buffer {
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}

export interface ParsedTrace {
  version: number;
  frames: TraceFrame[];
}

export class TraceParseError extends Error {}

export function parseTraceV2(buf: Buffer): ParsedTrace {
  if (buf.length < HEADER_SIZE) {
    throw new TraceParseError("trace file shorter than 16-byte header");
  }
  if (buf.subarray(0, 4).toString("ascii") !== MAGIC) {
    throw new TraceParseError("bad magic (expected 'PACT')");
  }
  const version = buf.readUInt16LE(4);
  if (version !== VERSION_V2) {
    throw new TraceParseError(`unsupported trace version ${version}`);
  }

  const cur = new Cursor(buf);
  cur.pos = HEADER_SIZE;

  const frames: TraceFrame[] = [];
  while (cur.remaining() > 0) {
    if (cur.remaining() < 4) {
      throw new TraceParseError("truncated frame size");
    }
    const frameSize = cur.readU32();
    if (cur.remaining() < frameSize) {
      throw new TraceParseError("frame size exceeds file");
    }
    const frameStart = cur.pos;

    const tickBig = cur.readU64();
    // Ticks fit in 53-bit JS number for any realistic editor session.
    const tick = Number(tickBig);

    const entityCount = cur.readU32();
    const entities: EntityFrame[] = [];
    for (let i = 0; i < entityCount; i++) {
      const index = cur.readU32();
      const generation = cur.readU32();
      const compCount = cur.readU8();

      const ef: EntityFrame = { index, generation };
      for (let c = 0; c < compCount; c++) {
        const tag = cur.readU16();
        const payloadSize = cur.readU16();
        const payload = cur.readBytes(payloadSize);
        switch (tag) {
          case TAG_PAC_ID: {
            ef.pacId = readStringU16(payload);
            break;
          }
          case TAG_ENTITY_TYPE: {
            ef.type = readStringU16(payload);
            break;
          }
          case TAG_POSITION: {
            if (payload.length === 24) {
              const pos: PositionValue = {
                x: payload.readDoubleLE(0),
                y: payload.readDoubleLE(8),
                z: payload.readDoubleLE(16),
              };
              ef.position = pos;
            }
            break;
          }
          default:
            // Forward-compat: unknown component types are skipped silently.
            break;
        }
      }
      entities.push(ef);
    }

    const eventCount = cur.readU32();
    const events: string[] = [];
    for (let e = 0; e < eventCount; e++) {
      const n = cur.readU32();
      events.push(cur.readBytes(n).toString("utf8"));
    }

    if (cur.pos !== frameStart + frameSize) {
      throw new TraceParseError(
        `frame size mismatch (parser drift) at frame ${frames.length}`,
      );
    }
    frames.push({ tick, entities, events });
  }

  return { version, frames };
}

function readStringU16(payload: Buffer): string {
  if (payload.length < 2) return "";
  const n = payload.readUInt16LE(0);
  if (payload.length < 2 + n) return "";
  return payload.subarray(2, 2 + n).toString("utf8");
}
