import { act, renderHook } from "@testing-library/react";
import { fetchDurableVideoQuote } from "@/lib/api";
import { useDurableVideoQuote } from "../use-durable-video-quote";

jest.mock("@/lib/api", () => ({ fetchDurableVideoQuote: jest.fn() }));
const options = { enabled: true, authenticated: true, ownerIdentifier: "owner-a", model: "LTX-2.5 Distilled BF16" as const, frames: 81 };
const quote = { account_id: "owner-a", charging_enabled: true, estimate: { model: options.model, modality: "video", frames: 81, fps: 24, priced: true, cost_micro: 80000, balance_sufficient: false } };

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); (fetchDurableVideoQuote as jest.Mock).mockResolvedValue(quote); });
afterEach(() => { jest.useRealTimers(); });
async function tick() { await act(async () => { jest.advanceTimersByTime(150); }); }

it("requests an exact-frame account-bound ceiling even with insufficient credits", async () => {
  const { result } = renderHook(() => useDurableVideoQuote(options));
  expect(result.current.loading).toBe(true);
  await tick();
  expect(fetchDurableVideoQuote).toHaveBeenCalledWith({ model: options.model, frames: 81, fps: 24 }, expect.any(AbortSignal));
  expect(result.current.quote).toEqual(quote);
  expect(result.current.costCeilingMicro).toBe(80000);
});

it.each([
  { enabled: false }, { authenticated: false }, { ownerIdentifier: undefined }, { frames: 80 },
])("does not quote while disabled or invalid: %j", async (patch) => {
  const { result } = renderHook(() => useDurableVideoQuote({ ...options, ...patch }));
  await tick();
  expect(fetchDurableVideoQuote).not.toHaveBeenCalled();
  expect(result.current.costCeilingMicro).toBeNull();
});

it.each([
  { account_id: "another-account" }, { charging_enabled: false },
  { estimate: { ...quote.estimate, model: "LTX-2.3" } },
  { estimate: { ...quote.estimate, frames: 80 } },
  { estimate: { ...quote.estimate, fps: 30 } },
  { estimate: { ...quote.estimate, cost_micro: 0 } },
  { estimate: { ...quote.estimate, cost_micro: Number.MAX_SAFE_INTEGER + 1 } },
])("rejects stale or unbound quote %j", async (patch) => {
  (fetchDurableVideoQuote as jest.Mock).mockResolvedValue({ ...quote, ...patch });
  const { result } = renderHook(() => useDurableVideoQuote(options));
  await tick();
  expect(result.current.costCeilingMicro).toBeNull();
  expect(result.current.error).toBeTruthy();
});

it("hides the prior account's price immediately and discards its late reply", async () => {
  let resolve!: (value: typeof quote) => void;
  (fetchDurableVideoQuote as jest.Mock).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { result, rerender } = renderHook(({ ownerIdentifier }) => useDurableVideoQuote({ ...options, ownerIdentifier }), { initialProps: { ownerIdentifier: "owner-a" } });
  await tick();
  rerender({ ownerIdentifier: "owner-b" });
  expect(result.current.costCeilingMicro).toBeNull();
  await act(async () => { resolve(quote); });
  expect(result.current.quote).toBeNull();
});

it("hides a previously accepted ceiling as soon as the frame count changes", async () => {
  const { result, rerender } = renderHook(({ frames }) => useDurableVideoQuote({ ...options, frames }), { initialProps: { frames: 81 } });
  await tick();
  expect(result.current.costCeilingMicro).toBe(80000);
  rerender({ frames: 337 });
  expect(result.current.costCeilingMicro).toBeNull();
  expect(result.current.loading).toBe(true);
});

it("refreshes the read-only quote without issuing any generation", async () => {
  const { result } = renderHook(() => useDurableVideoQuote(options));
  await tick();
  act(() => result.current.refresh());
  expect(result.current.costCeilingMicro).toBeNull();
  await tick();
  expect(fetchDurableVideoQuote).toHaveBeenCalledTimes(2);
});

it("does not restore an old ceiling after the pilot is disabled and re-enabled", async () => {
  const { result, rerender } = renderHook(({ enabled }) => useDurableVideoQuote({ ...options, enabled }), { initialProps: { enabled: true } });
  await tick();
  expect(result.current.costCeilingMicro).toBe(80000);
  rerender({ enabled: false });
  expect(result.current.quote).toBeNull();
  rerender({ enabled: true });
  expect(result.current.costCeilingMicro).toBeNull();
  expect(result.current.loading).toBe(true);
  await tick();
  expect(fetchDurableVideoQuote).toHaveBeenCalledTimes(2);
});
