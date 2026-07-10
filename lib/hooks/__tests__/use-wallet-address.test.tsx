import { renderHook, waitFor } from "@testing-library/react";
import { useWalletAddress } from "../use-wallet-address";

describe("useWalletAddress", () => {
  const request = jest.fn();
  const on = jest.fn();
  const removeListener = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    request.mockResolvedValue([]);
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request, on, removeListener },
    });
  });

  afterEach(() => {
    delete (window as typeof window & { ethereum?: unknown }).ethereum;
  });

  it("should return mounted state after mount", async () => {
    const { result } = renderHook(() => useWalletAddress());

    await waitFor(() => {
      expect(result.current.mounted).toBe(true);
    });
  });

  it("should return undefined address when not connected", async () => {
    const { result } = renderHook(() => useWalletAddress());

    await waitFor(() => {
      expect(result.current.mounted).toBe(true);
    });

    expect(result.current.address).toBeUndefined();
    expect(result.current.isConnected).toBe(false);
  });

  it("should return address when connected", async () => {
    const mockAddress = "0x1234567890123456789012345678901234567890";
    request.mockResolvedValue([mockAddress]);

    const { result } = renderHook(() => useWalletAddress());

    await waitFor(() => {
      expect(result.current.address).toBe(mockAddress);
    });

    expect(result.current.isConnected).toBe(true);
    expect(request).toHaveBeenCalledWith({ method: "eth_accounts" });
  });
});
