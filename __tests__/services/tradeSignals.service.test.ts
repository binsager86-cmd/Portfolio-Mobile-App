import api from "@/services/api/client";
import { getKuwaitSignal } from "@/services/api/analytics/tradeSignals";

jest.mock("@/services/api/client", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

const mockApiGet = api.get as jest.Mock;

describe("getKuwaitSignal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("masks backend internal ImportError detail", async () => {
    const axiosLikeError = {
      isAxiosError: true,
      response: {
        data: {
          detail:
            "ImportError: cannot import name 'ER_HIGH' from 'app.services.signal_engine.config.model_params' (/workspace/app/services/signal_engine/config/model_params.py)",
        },
      },
    };
    mockApiGet.mockRejectedValueOnce(axiosLikeError);

    await expect(getKuwaitSignal({ symbol: "NBK", exchange: "KSE", segment: "PREMIER" }))
      .rejects
      .toMatchObject({
        response: {
          data: {
            detail: "Signal engine is temporarily unavailable. Please try again shortly.",
          },
        },
      });
  });

  it("keeps normal API error details unchanged", async () => {
    const axiosLikeError = {
      isAxiosError: true,
      response: { data: { detail: "Symbol not found." } },
    };
    mockApiGet.mockRejectedValueOnce(axiosLikeError);

    await expect(getKuwaitSignal({ symbol: "UNKNOWN", exchange: "KSE", segment: "PREMIER" }))
      .rejects
      .toMatchObject({
        response: { data: { detail: "Symbol not found." } },
      });
  });
});
