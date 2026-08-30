import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useReconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { WalletAuthButton } from "@/components/wallet-auth-button";
import { signIn } from "@/lib/auth";
import { useAuthStore } from "@/lib/stores/auth-store";

jest.mock("@rainbow-me/rainbowkit", () => ({
  useConnectModal: jest.fn(),
}));

jest.mock("wagmi", () => ({
  useAccount: jest.fn(),
  useReconnect: jest.fn(),
  useSignMessage: jest.fn(),
  useSwitchChain: jest.fn(),
}));

jest.mock("wagmi/chains", () => ({
  base: { id: 8453 },
}));

jest.mock("@/lib/auth", () => ({
  linkWalletToGoogleAccount: jest.fn(),
  signIn: jest.fn(),
}));

jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: jest.fn(),
}));

const address = "0x0000000000000000000000000000000000000001";
const openConnectModal = jest.fn();
const signMessageAsync = jest.fn();
const switchChainAsync = jest.fn();
const reconnectAsync = jest.fn();
const setAuthenticated = jest.fn();
const syncFromServer = jest.fn();

let account = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  chainId: undefined as number | undefined,
};

describe("WalletAuthButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    account = { address: undefined, isConnected: false, chainId: undefined };
    (useConnectModal as jest.Mock).mockReturnValue({ openConnectModal });
    (useAccount as jest.Mock).mockImplementation(() => account);
    (useReconnect as jest.Mock).mockReturnValue({ reconnectAsync });
    (useSignMessage as jest.Mock).mockReturnValue({ signMessageAsync });
    (useSwitchChain as jest.Mock).mockReturnValue({ switchChainAsync });
    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      setAuthenticated,
      syncFromServer,
    });
    (signIn as jest.Mock).mockResolvedValue(undefined);
    syncFromServer.mockResolvedValue(undefined);
    reconnectAsync.mockResolvedValue([]);
  });

  it("finishes AIPG sign-in after a Base Account popup remount", async () => {
    const firstRender = render(<WalletAuthButton mode="sign-in" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with wallet" }),
    );
    expect(openConnectModal).toHaveBeenCalledTimes(1);
    expect(signIn).not.toHaveBeenCalled();

    // Base Account may return through a fresh page context after establishing
    // its own session. The original explicit click must survive that remount.
    firstRender.unmount();
    account = { address, isConnected: true, chainId: 8453 };
    render(<WalletAuthButton mode="sign-in" />);

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        address,
        signMessageAsync,
        chainId: 8453,
      }),
    );
    expect(syncFromServer).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("aipg_wallet_auth_intent")).toBeNull();
  });

  it("does not turn an ordinary connected-wallet mount into auth intent", async () => {
    account = { address, isConnected: true, chainId: 8453 };
    render(<WalletAuthButton mode="sign-in" />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signIn).not.toHaveBeenCalled();
    expect(reconnectAsync).not.toHaveBeenCalled();
  });

  it("reopens the chooser when a stored explicit intent cannot reconnect", async () => {
    sessionStorage.setItem(
      "aipg_wallet_auth_intent",
      JSON.stringify({ mode: "sign-in", expiresAt: Date.now() + 60_000 }),
    );

    render(<WalletAuthButton mode="sign-in" />);

    await waitFor(() => expect(reconnectAsync).toHaveBeenCalledTimes(1));
    expect(openConnectModal).toHaveBeenCalledTimes(1);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("does not reopen the chooser after an authorized reconnect", async () => {
    reconnectAsync.mockResolvedValue([
      { accounts: [address], chainId: 8453, connector: { id: "baseAccount" } },
    ]);
    sessionStorage.setItem(
      "aipg_wallet_auth_intent",
      JSON.stringify({ mode: "sign-in", expiresAt: Date.now() + 60_000 }),
    );

    render(<WalletAuthButton mode="sign-in" />);

    await waitFor(() => expect(reconnectAsync).toHaveBeenCalledTimes(1));
    expect(openConnectModal).not.toHaveBeenCalled();
  });

  it("retries the explicit connection when focus returns from the wallet", async () => {
    render(<WalletAuthButton mode="sign-in" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with wallet" }),
    );

    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(reconnectAsync).toHaveBeenCalledTimes(1));
  });
});
