import { render, screen } from "@testing-library/react";
import { Providers } from "@/components/providers";

jest.mock("wagmi", () => ({
  WagmiProvider: ({
    children,
    reconnectOnMount,
  }: {
    children: React.ReactNode;
    reconnectOnMount?: boolean;
  }) => (
    <div data-testid="wagmi-provider" data-reconnect={String(reconnectOnMount)}>
      {children}
    </div>
  ),
  cookieToInitialState: jest.fn(),
}));

jest.mock("wagmi/chains", () => ({
  base: { id: 8453 },
}));

jest.mock("@tanstack/react-query", () => ({
  QueryClient: jest.fn().mockImplementation(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock("@rainbow-me/rainbowkit", () => ({
  RainbowKitProvider: ({ children }: { children: React.ReactNode }) => children,
  darkTheme: jest.fn(() => ({})),
}));

jest.mock("@/lib/wagmi", () => ({ config: {} }));
jest.mock("@/components/google-one-tap", () => ({ GoogleOneTap: () => null }));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    address: "0x0000000000000000000000000000000000000001",
    accountId: "account-123",
    googleId: null,
    syncFromStorage: jest.fn(),
    syncFromServer: jest.fn(),
  }),
}));
jest.mock("@/lib/stores/job-store", () => ({
  useJobStore: () => jest.fn(),
}));

describe("Providers", () => {
  it("does not reconnect a browser wallet when restoring the AIPG session", () => {
    render(
      <Providers cookie="wagmi.store=stored-wallet-state">
        <main>Gallery</main>
      </Providers>,
    );

    expect(screen.getByTestId("wagmi-provider")).toHaveAttribute(
      "data-reconnect",
      "false",
    );
  });
});
