/**
 * Packet (report size: 64 bytes over USB, 32 through the 2.4 GHz dongle; without the report-id byte):
 *   [0]=0xAA magic  [1]=cmd  [2..3]=offset LE  [4]=len  [5..6]=request code LE  [8..]=data
 * Reply echoes the request code at [5..6]; [2]==0xFF means error; data starts at [8].
 */
import { readU16le, u16le } from "./bytes.ts";

const MAGIC = 0xaa;
const ERROR = 0xff;
/** Bytes before the data: each packet carries report size - HEADER_BYTES of data. */
export const HEADER_BYTES = 8;

export interface Request {
  cmd: number;
  offset: number;
  length: number;
  /** Echoed by the reply, to match it. */
  request: number;
  data: ArrayLike<number>;
}

export function encodePacket(reportSize: number, r: Request): Uint8Array {
  const pkt = new Uint8Array(reportSize);
  pkt.set([MAGIC, r.cmd, ...u16le(r.offset), r.length, ...u16le(r.request)]);
  pkt.set(r.data, HEADER_BYTES);
  return pkt;
}

/** Strips the leading byte the dongle sometimes puts before the magic (the hub drops it too). */
export function withoutDongleByte(report: Uint8Array): Uint8Array {
  const shifted = report[0] !== MAGIC && report[1] === MAGIC;
  return shifted ? report.subarray(1) : report;
}

export function answers(reply: Uint8Array, request: number): boolean {
  return reply.length >= 7 && readU16le(reply, 5) === request;
}

export function isError(reply: Uint8Array): boolean {
  return reply[2] === ERROR;
}
