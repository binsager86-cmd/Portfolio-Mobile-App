import React from "react";
import { screen } from "@testing-library/react-native";

import { ActionInterpretationCard } from "@/components/eagle-eye/ActionInterpretationCard";
import { renderWithProviders } from "@/__tests__/helpers";

describe("ActionInterpretationCard", () => {
  it("shows the same action guidance implied by the backend risks and continuation lane", () => {
    renderWithProviders(
      <ActionInterpretationCard
        analysis={{
          ticker: "AAYAN",
          name_en: "Aayan",
          sector: "Industrial",
          stage: "MARKUP",
          rating: "BUY",
          confidence: 74,
          thesis: "Momentum remains constructive.",
          supports: [],
          resistances: [],
          continue_rising: true,
          continue_rising_exhaustion_count: 1,
          risk_warning_score: 2,
          risky_near_resistance: false,
          risk_reward_ratio: 2.4,
          signals: [],
        }}
      />,
    );

    expect(screen.getByText("Action plan")).toBeTruthy();
    expect(
      screen.getAllByText(/hold with trailing stop|avoid chasing|wait for pullback/i).length,
    ).toBeGreaterThan(0);
  });
});
