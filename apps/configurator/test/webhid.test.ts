import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { hidTransport, PID_CABLE, PID_DONGLE } from "../src/webhid.ts";
import { asDevice, FakeHidDevice } from "./fake-hid.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test.each([
  [PID_CABLE, 64, 500],
  [PID_DONGLE, 32, 3000],
])("pid %s: %s-byte reports, %s ms timeout", async (pid, size, timeout) => {
  const device = new FakeHidDevice(pid);
  device.onReport = () => [];
  const transport = hidTransport(asDevice(device));
  expect(transport.reportSize).toBe(size);

  let reply: Uint8Array | undefined | null = null;
  void transport.transfer(new Uint8Array(size)).then((r) => (reply = r));
  await vi.advanceTimersByTimeAsync(timeout - 1);
  expect(reply).toBe(null);

  await vi.advanceTimersByTimeAsync(1);
  expect(reply).toBe(undefined);
});

test("sends the report as is and resolves with the reply", async () => {
  const device = new FakeHidDevice(PID_CABLE);
  const transport = hidTransport(asDevice(device));
  const report = new Uint8Array(64).fill(7);

  expect(await transport.transfer(report)).toEqual(report);
  expect(device.sent).toEqual([report]);
});

test("reports that arrive together are queued and read one by one", async () => {
  const device = new FakeHidDevice(PID_CABLE);
  device.onReport = () => [Uint8Array.of(1), Uint8Array.of(2)];
  const transport = hidTransport(asDevice(device));

  expect(await transport.transfer(new Uint8Array(64))).toEqual(
    Uint8Array.of(1),
  );
  expect(await transport.transfer()).toEqual(Uint8Array.of(2));
});

test("a report that arrives later resolves the waiting transfer", async () => {
  const device = new FakeHidDevice(PID_DONGLE);
  device.onReport = () => [];
  const transport = hidTransport(asDevice(device));

  const reply = transport.transfer(new Uint8Array(32));
  await vi.advanceTimersByTimeAsync(1000);
  device.emit(Uint8Array.of(3));

  expect(await reply).toEqual(Uint8Array.of(3));
});

test("stray reports received before a request are ignored", async () => {
  const device = new FakeHidDevice(PID_CABLE);
  const transport = hidTransport(asDevice(device));
  device.emit(Uint8Array.of(9));

  const report = new Uint8Array(64).fill(1);
  expect(await transport.transfer(report)).toEqual(report);
});

test("once its signal aborts, the transport stops listening to the device", async () => {
  const device = new FakeHidDevice(PID_CABLE);
  const link = new AbortController();
  const transport = hidTransport(asDevice(device), link.signal);
  link.abort();

  const reply = transport.transfer(new Uint8Array(64));
  await vi.advanceTimersByTimeAsync(500);

  expect(await reply).toBe(undefined);
});
