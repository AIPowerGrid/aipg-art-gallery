const signOutMock = jest.fn<Promise<void>, []>();

jest.mock("@/lib/auth", () => ({
  getAuthAddress: jest.fn(() => null),
  isAuthenticated: jest.fn(() => false),
  signOut: () => signOutMock(),
  getApiBase: jest.fn(() => "/api"),
}));

import { useAuthStore } from "@/lib/stores/auth-store";

describe("auth store logout", () => {
  beforeEach(() => {
    localStorage.clear();
    signOutMock.mockReset();
    useAuthStore.setState({
      isAuthenticated: true,
      authMethod: "google",
      address: null,
      googleId: "google-user",
      email: "user@example.test",
      name: "Test User",
      picture: null,
    });
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
