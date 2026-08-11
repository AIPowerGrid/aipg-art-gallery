import {
  initializeGoogleIdentity,
  resetGoogleIdentityForTests,
} from "@/lib/google-identity";

describe("Google Identity initialization", () => {
  const initialize = jest.fn();

  beforeEach(() => {
    resetGoogleIdentityForTests();
    initialize.mockClear();
    window.google = {
      accounts: {
        id: {
          initialize,
          prompt: jest.fn(),
          renderButton: jest.fn(),
          cancel: jest.fn(),
          revoke: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete window.google;
  });

  it("initializes the page-wide Google client exactly once", () => {
    expect(initializeGoogleIdentity("client-1")).toBe(true);
    expect(initializeGoogleIdentity("client-1")).toBe(true);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client-1",
        use_fedcm_for_prompt: true,
      }),
    );
  });

  it("refuses to replace the callback with another client configuration", () => {
    initializeGoogleIdentity("client-1");

    expect(() => initializeGoogleIdentity("client-2")).toThrow(
      "different client ID",
    );
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});

