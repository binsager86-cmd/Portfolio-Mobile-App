import api from "@/services/api/client";
import {
  getKuwaitSignal,
  sanitizeKuwaitSignalErrorDetail,
} from "@/services/api/analytics/tradeSignals";

jest.mock("@/services/api/client", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

const mockApiGet = api.get as jest.MockedFunction<typeof api.get>;

describe("tradeSignals error sanitization", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("sanitizes signal-engine import errors", async () => {
    mockApiGet.mockRejectedValue({
      response: {
        status: 500,
        data: {
          detail: "ImportError: cannot import name 'ER_HIGH' from 'app.services.signal_engine.config.model_params'",
        },
      },
    });

    await expect(
      getKuwaitSignal({ symbol: "NBK", exchange: "KSE", segment: "PREMIER" }),
    ).rejects.toMatchObject({
      response: {
        data: {
          detail:
            "Technical analysis is temporarily unavailable while the signal engine is being restored. Please try again shortly.",
        },
      },
    });
  });

  it("preserves user-facing non-internal error details", () => {
    expect(sanitizeKuwaitSignalErrorDetail("Symbol not found.", 404)).toBe("Symbol not found.");
  });

  it("falls back to a safe generic message for empty 500 errors", () => {
    expect(sanitizeKuwaitSignalErrorDetail(undefined, 500)).toBe(
      "Technical analysis is temporarily unavailable. Please try again shortly.",
    );
  });
});
