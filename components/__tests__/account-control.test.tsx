import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAccount, useDisconnect } from "wagmi";
import { AccountControl } from "@/components/account-control";
import { useAuthStore } from "@/lib/stores/auth-store";

jest.mock("wagmi", () => ({
  useAccount: jest.fn(),
  useDisconnect: jest.fn(),
}));

jest.mock("@/components/google-one-tap", () => ({
  GoogleSignInButton: () => null,
}));

jest.mock("@/components/wallet-auth-button", () => ({
  WalletAuthButton: () => null,
}));

jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: jest.fn(),
}));

const connector = { id: "baseAccount", name: "Base Account" };
const address = "0x0000000000000000000000000000000000000001" as const;
const disconnectAsync = jest.fn();

let connected = true;

describe("AccountControl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connected = true;
    (useAccount as jest.Mock).mockImplementation(() => ({
      address: connected ? address : undefined,
      connector: connected ? connector : undefined,
      isConnected: connected,
    }));
    (useDisconnect as jest.Mock).mockReturnValue({
      disconnectAsync,
      isPending: false,
    });
    disconnectAsync.mockResolvedValue(undefined);
    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      authMethod: "google",
      address,
      googleId: "google-user",
      email: "user@example.test",
      name: "Test User",
      clearAuth: jest.fn(),
    });
  });

  it("disconnects the active connector without unlinking the account wallet", async () => {
    const view = render(<AccountControl mobile />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() =>
      expect(disconnectAsync).toHaveBeenCalledWith({ connector }),
    );

    connected = false;
    view.rerender(<AccountControl mobile />);
    expect(screen.getByText("Linked wallet")).toBeVisible();
    expect(
      screen.getByText(/browser wallet disconnected.*remains linked/i),
    ).toBeVisible();
  });
});
