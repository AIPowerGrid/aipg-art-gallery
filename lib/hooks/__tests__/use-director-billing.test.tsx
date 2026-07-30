import { renderHook, waitFor } from "@testing-library/react";
import { fetchCredits, fetchCreditQuote, type GridCredits } from "@/lib/api";
import { useDirectorBilling } from "@/lib/hooks/use-director-billing";
import { newSegment } from "@/lib/stores/director-store";

jest.mock("@/lib/api", () => ({
  fetchCredits: jest.fn(),
  fetchCreditQuote: jest.fn(),
}));

const CREDITS: GridCredits = {
  account_id: "account-1",
  promotional: { remaining_usd: 0, active: false },
  free: { remaining_usd: 0, daily_cap_usd: 0, active: false },
  paid: { balance_usd: 1 },
  total_spendable_micro: 1_000_000,
  total_spendable_usd: 1,
  total_preview_usd: 1,
  charging_enabled: false,
  charging_mode: "off",
};

function quote(model: string) {
  return {
    ...CREDITS,
    estimate: {
      model,
      modality:
        model === "Krea 2 Turbo" ? ("image" as const) : ("video" as const),
      priced: true,
      reason: null,
      cost_micro: 1000,
      cost_usd: 0.001,
      balance_sufficient: true,
      from_promotional_micro: 0,
      from_daily_micro: 0,
      from_paid_micro: 1000,
      shortfall_micro: 0,
      n: 1,
      seconds: model === "Krea 2 Turbo" ? null : 3,
    },
  };
}

beforeEach(() => {
  (fetchCredits as jest.Mock).mockResolvedValue(CREDITS);
  (fetchCreditQuote as jest.Mock).mockImplementation(
    ({ modelId }: { modelId: string }) => Promise.resolve(quote(modelId)),
  );
});

afterEach(() => {
  jest.clearAllMocks();
});

it("quotes Krea plus the selected Director segment with frame/fps units", async () => {
  const selected = newSegment({ id: "segment-1", lengthFrames: 72 });
  const { result } = renderHook(() =>
    useDirectorBilling({
      authenticated: true,
      selected,
      hasAudio: false,
      modelAvailability: { checked: true, director: true, fallback: true },
    }),
  );

  await waitFor(() => expect(fetchCreditQuote).toHaveBeenCalledTimes(2));

  expect(fetchCreditQuote).toHaveBeenCalledWith(
    { modelId: "Krea 2 Turbo", n: 1 },
    expect.any(AbortSignal),
  );
  expect(fetchCreditQuote).toHaveBeenCalledWith(
    { modelId: "LTX Director 2.0", n: 1, length: 72, fps: 24 },
    expect.any(AbortSignal),
  );
  expect(result.current.credits?.account_id).toBe("account-1");
  await waitFor(() =>
    expect(result.current.segmentQuote?.estimate.seconds).toBe(3),
  );
});

it("quotes the fallback only when Director is offline and the segment has no audio", async () => {
  const selected = newSegment({ id: "segment-1", lengthFrames: 96 });
  const { rerender } = renderHook(
    ({ hasAudio }) =>
      useDirectorBilling({
        authenticated: true,
        selected,
        hasAudio,
        modelAvailability: { checked: true, director: false, fallback: true },
      }),
    { initialProps: { hasAudio: false } },
  );

  await waitFor(() =>
    expect(fetchCreditQuote).toHaveBeenCalledWith(
      { modelId: "LTX-2.3 Audio", n: 1, length: 96, fps: 24 },
      expect.any(AbortSignal),
    ),
  );

  rerender({ hasAudio: true });
  await waitFor(() =>
    expect(fetchCreditQuote).toHaveBeenCalledWith(
      { modelId: "LTX Director 2.0", n: 1, length: 96, fps: 24 },
      expect.any(AbortSignal),
    ),
  );
});
