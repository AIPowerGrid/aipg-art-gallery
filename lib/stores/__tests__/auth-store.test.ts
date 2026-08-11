const signOutMock = jest.fn<Promise<void>, []>();
const rememberAuthAccountMock = jest.fn();
const rememberWalletSessionMock = jest.fn();
const clearAuthTokenMock = jest.fn();

jest.mock("@/lib/auth", () => ({
  getAuthAddress: jest.fn(() => null),
  getAuthAccountId: jest.fn(() => null),
  isAuthenticated: jest.fn(() => false),
  signOut: () => signOutMock(),
  getApiBase: jest.fn(() => "/api"),
  clearAuthToken: () => clearAuthTokenMock(),
  rememberAuthAccount: (accountId: string) => rememberAuthAccountMock(accountId),
  rememberWalletSession: (address: string, accountId: string) =>
    rememberWalletSessionMock(address, accountId),
}));

import { useAuthStore } from "@/lib/stores/auth-store";

describe("auth store logout", () => {
  beforeEach(() => {
    localStorage.clear();
    signOutMock.mockReset();
    rememberAuthAccountMock.mockReset();
    rememberWalletSessionMock.mockReset();
    clearAuthTokenMock.mockReset();
    useAuthStore.setState({
      isAuthenticated: true,
      sessionChecked: false,
      authMethod: "google",
      address: null,
      accountId: "account-123",
      googleId: "google-user",
      email: "user@example.test",
      name: "Test User",
      picture: null,
    });
  });

  it("restores the canonical wallet session from the server cookie", async () => {
    useAuthStore.setState({
      isAuthenticated: false,
      sessionChecked: false,
      authMethod: null,
      address: null,
      accountId: null,
      googleId: null,
    });
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authMethod: "wallet",
        address: "0xABC",
        accountId: "ACCOUNT-123",
      }),
    } as Response);

    await useAuthStore.getState().syncFromServer();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      sessionChecked: true,
      authMethod: "wallet",
      address: "0xabc",
      accountId: "account-123",
    });
    expect(rememberWalletSessionMock).toHaveBeenCalledWith(
      "0xABC",
      "ACCOUNT-123",
    );
  });

  it("waits for server logout before clearing the local session", async () => {
    let finishLogout: (() => void) | undefined;
    signOutMock.mockImplementation(
      () => new Promise<void>((resolve) => { finishLogout = resolve; }),
    );

    const logout = useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    finishLogout?.();
    await logout;

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().authMethod).toBeNull();
  });

  it("keeps the session when server logout fails", async () => {
    signOutMock.mockRejectedValue(new Error("offline"));

    await expect(useAuthStore.getState().clearAuth()).rejects.toThrow("offline");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().authMethod).toBe("google");
  });
});
