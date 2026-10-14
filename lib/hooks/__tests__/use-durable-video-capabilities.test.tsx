import { act, renderHook } from "@testing-library/react";
import { fetchDurableVideoCapabilities } from "@/lib/api";
import { useDurableVideoCapabilities } from "../use-durable-video-capabilities";

jest.mock("@/lib/api", () => ({ fetchDurableVideoCapabilities: jest.fn() }));
const model = { id: "LTX-2.5 Distilled BF16", onlineWorkers: 2 };
beforeEach(() => { jest.clearAllMocks(); (fetchDurableVideoCapabilities as jest.Mock).mockResolvedValue({ enabled: true, models: [model] }); });
async function settle() { await act(async () => { await Promise.resolve(); }); }

it("exposes only the server-enabled exact online models", async () => {
  const { result } = renderHook(() => useDurableVideoCapabilities(true, "owner-a"));
  await settle();
  expect(result.current).toMatchObject({ ready: true, enabled: true, models: [model], error: false });
});

it("does not query capabilities while signed out", async () => {
  const { result } = renderHook(() => useDurableVideoCapabilities(false, "owner-a"));
  await settle();
  expect(fetchDurableVideoCapabilities).not.toHaveBeenCalled();
  expect(result.current.enabled).toBe(false);
});

it.each([
  { enabled: false, models: [model] },
  { enabled: true, models: [{ ...model, id: "LTX-2.3" }] },
  { enabled: true, models: [{ ...model, onlineWorkers: 0 }] },
  { enabled: true, models: [model, model] },
  { enabled: "true", models: [] },
])("fails closed on invalid capability response %j", async (value) => {
  (fetchDurableVideoCapabilities as jest.Mock).mockResolvedValue(value);
  const { result } = renderHook(() => useDurableVideoCapabilities(true, "owner-a"));
  await settle();
  expect(result.current).toMatchObject({ ready: true, enabled: false, models: [], error: true });
});

it("discards a capability reply from the previous account", async () => {
  let resolve!: (value: unknown) => void;
  (fetchDurableVideoCapabilities as jest.Mock)
    .mockReturnValueOnce(new Promise((done) => { resolve = done; }))
    .mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender } = renderHook(({ owner }) => useDurableVideoCapabilities(true, owner), { initialProps: { owner: "owner-a" } });
  rerender({ owner: "owner-b" });
  await act(async () => { resolve({ enabled: true, models: [model] }); });
  expect(result.current.enabled).toBe(false);
  expect(result.current.models).toEqual([]);
});
