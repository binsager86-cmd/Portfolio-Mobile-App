/**
 * Config.ts — unit tests for API URL resolution.
 *
 * Regression tests for the IPv4/IPv6 issue:
 *   - LOCAL_WEB_API must use 127.0.0.1 (not "localhost") to avoid IPv6 resolution
 *   - isLocalDev must recognise both "localhost" and "127.0.0.1" hostnames
 *   - Production web builds must use empty string (relative paths)
 *   - Mobile builds must fall back to LAN IP
 */

// We need to test the module with different Platform/window settings,
// so we re-require it in each test after adjusting mocks.

describe("Config — API_BASE_URL resolution", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    jest.resetModules();
    // Default: no env override
    if (typeof process !== "undefined") {
      delete process.env.EXPO_PUBLIC_API_URL;
      delete process.env.EXPO_PUBLIC_API_URL_WEB;
      delete process.env.EXPO_PUBLIC_API_URL_ANDROID;
      delete process.env.EXPO_PUBLIC_API_URL_IOS;
    }
  });

  afterEach(() => {
    // Restore window
    if (originalWindow) {
      globalThis.window = originalWindow;
    }
  });

  /** Helper: load Config with mocked Platform.OS */
  function loadConfig(
    platformOS: string,
    hostname?: string,
    opts?: { hostUri?: string; isDevice?: boolean },
  ) {
    jest.doMock("react-native", () => ({
      Platform: { OS: platformOS },
    }));

    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: {
        expoConfig: { hostUri: opts?.hostUri ?? "192.168.1.5:8081" },
      },
    }));

    jest.doMock("expo-device", () => ({
      __esModule: true,
      isDevice: opts?.isDevice ?? false,
    }));

    // Simulate window.location for web tests
    if (hostname && typeof globalThis.window !== "undefined") {
      Object.defineProperty(globalThis.window, "location", {
        value: { hostname },
        writable: true,
        configurable: true,
      });
    }

    return require("@/constants/Config");
  }

  it("uses 127.0.0.1:8004 for local web dev on localhost", () => {
    const config = loadConfig("web", "localhost");
    expect(config.API_BASE_URL).toBe("http://127.0.0.1:8004");
  });

  it("uses 127.0.0.1:8004 for local web dev on 127.0.0.1", () => {
    const config = loadConfig("web", "127.0.0.1");
    expect(config.API_BASE_URL).toBe("http://127.0.0.1:8004");
  });

  it("LOCAL_WEB_API never contains 'localhost' (prevents IPv6 issues)", () => {
    const config = loadConfig("web", "localhost");
    // The URL should use 127.0.0.1, NOT localhost
    expect(config.API_BASE_URL).not.toContain("localhost");
    expect(config.API_BASE_URL).toContain("127.0.0.1");
  });

  it("uses empty string for production web (non-localhost hostname)", () => {
    const config = loadConfig("web", "myapp.example.com");
    expect(config.API_BASE_URL).toBe("");
  });

  it("respects EXPO_PUBLIC_API_URL env var over all defaults", () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.production.com";
    const config = loadConfig("web", "localhost");
    expect(config.API_BASE_URL).toBe("https://api.production.com");
  });

  it("exports API_TIMEOUT as a positive number", () => {
    const config = loadConfig("web", "localhost");
    expect(config.API_TIMEOUT).toBeGreaterThan(0);
  });

  it("keeps EXPO_PUBLIC_API_URL_ANDROID on Android emulator", () => {
    process.env.EXPO_PUBLIC_API_URL_ANDROID = "http://10.0.2.2:8004";
    const config = loadConfig("android", undefined, {
      hostUri: "192.168.1.2:8081",
      isDevice: false,
    });
    expect(config.API_BASE_URL).toBe("http://10.0.2.2:8004");
  });

  it("prefers inferred LAN URL on physical Android when env points to emulator", () => {
    process.env.EXPO_PUBLIC_API_URL_ANDROID = "http://10.0.2.2:8004";
    const config = loadConfig("android", undefined, {
      hostUri: "192.168.1.2:8081",
      isDevice: true,
    });
    expect(config.API_BASE_URL).toBe("http://192.168.1.2:8004");
  });
});
