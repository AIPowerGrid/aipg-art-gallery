import { renderHook, waitFor } from "@testing-library/react";
import { useWalletAddress } from "../use-wallet-address";
import * as wagmi from "wagmi";

jest.mock("wagmi", () => ({
  useAccount: jest.fn(() => ({
    address: undefined,
    isConnected: false,
  })),
}));

describe("useWalletAddress", () => {
  const mockUseAccount = wagmi.useAccount as jest.MockedFunction<typeof wagmi.useAccount>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any);
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
    mockUseAccount.mockReturnValue({
      address: mockAddress as `0x${string}`,
      isConnected: true,
    } as any);

    const { result } = renderHook(() => useWalletAddress());

    await waitFor(() => {
      expect(result.current.mounted).toBe(true);
    });

    expect(result.current.address).toBe(mockAddress);
    expect(result.current.isConnected).toBe(true);
  });
});
