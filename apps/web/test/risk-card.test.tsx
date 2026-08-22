import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RiskCard } from "../components/admin/risk-card";
import type { ApiClient, RiskAssessmentDto, RiskModelDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const model: RiskModelDto = {
  provisional: true,
  notice:
    "Provisional risk model — the factors and weights below are a generic starting set, not a compliance methodology. This model REQUIRES LOCAL LEGAL VALIDATION before production use.",
  thresholds: { medium: 3, high: 6 },
  factors: [
    {
      id: "geography",
      label: "Where the applicant is resident",
      help: "Residency drives most AML frameworks' geographic risk.",
      options: [
        { value: "domestic", label: "Domestic", points: 0 },
        { value: "foreign_elevated", label: "Foreign — elevated", points: 4 },
      ],
    },
    {
      id: "exposure",
      label: "Political or public exposure",
      help: "The officer's finding, not an automated determination.",
      options: [
        { value: "none_found", label: "None found in review", points: 0 },
        { value: "pep", label: "Politically exposed person", points: 5 },
      ],
    },
  ],
};

const rated: RiskAssessmentDto = {
  score: 9,
  band: "high",
  answers: [
    { factorId: "geography", answer: "foreign_elevated", points: 4 },
    { factorId: "exposure", answer: "pep", points: 5 },
  ],
  assessedBy: "officer-1",
  assessedAt: "2026-08-22T10:00:00.000Z",
  advisory:
    "Advisory only — this rating does not decide anything on its own. It directs how closely a person reviews the file.",
};

const renderCard = (rows: RiskAssessmentDto[], overrides: Partial<ApiClient> = {}) =>
  render(
    <RiskCard
      locale="en"
      investorId="inv-1"
      token="tok"
      api={stubApi({
        riskModel: vi.fn().mockResolvedValue(model),
        investorRiskAssessments: vi.fn().mockResolvedValue(rows),
        ...overrides,
      })}
    />,
  );

// 4.2. A rating is a judgement about a person made from a model nobody has
// legally validated. Every claim this card makes has to carry that.
describe("RiskCard", () => {
  it("shows the band WITH the words saying it decides nothing", async () => {
    renderCard([rated]);

    const row = await screen.findByTestId("risk-0");
    expect(row.textContent).toMatch(/high/i);
    // The band must never appear as a verdict on its own.
    expect(screen.getByTestId("risk-advisory-0").textContent).toMatch(/does not decide|advisory/i);
  });

  it("says the model is provisional and needs local legal validation", async () => {
    renderCard([]);

    const notice = await screen.findByTestId("risk-model-notice");
    expect(notice.textContent).toMatch(/REQUIRES LOCAL LEGAL VALIDATION/);
  });

  it("says plainly when nobody has rated this applicant, rather than implying low risk", async () => {
    renderCard([]);

    const empty = await screen.findByTestId("no-risk-assessment");
    // The trap: an unrated file must never read as a cleared one. The copy has
    // to say BOTH that nobody rated this person and that the absence is not
    // itself a low rating — silence is what invites the wrong reading.
    expect(empty.textContent).toMatch(/not been (rated|assessed)/i);
    expect(empty.textContent).toMatch(/not the same as a low rating/i);
  });

  it("renders one control per factor the SERVER published, not a hard-coded list", async () => {
    renderCard([]);

    await screen.findByTestId("risk-factor-geography");
    expect(screen.getByTestId("risk-factor-exposure")).toBeTruthy();
  });

  it("sends the officer's answers and shows the rating that comes back", async () => {
    const assessRisk = vi.fn().mockResolvedValue(rated);
    const investorRiskAssessments = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([rated]);
    renderCard([], { assessRisk, investorRiskAssessments });

    await screen.findByTestId("risk-factor-geography");
    fireEvent.change(screen.getByTestId("risk-factor-geography"), {
      target: { value: "foreign_elevated" },
    });
    fireEvent.change(screen.getByTestId("risk-factor-exposure"), { target: { value: "pep" } });
    fireEvent.click(screen.getByTestId("risk-submit"));

    await waitFor(() => {
      expect(assessRisk).toHaveBeenCalledWith("tok", "inv-1", {
        geography: "foreign_elevated",
        exposure: "pep",
      });
    });
    expect(await screen.findByTestId("risk-0")).toBeTruthy();
  });

  it("surfaces a refusal in the platform's own words", async () => {
    const assessRisk = vi
      .fn()
      .mockRejectedValue(new Error('"Political or public exposure" has not been answered'));
    renderCard([], { assessRisk });

    await screen.findByTestId("risk-factor-geography");
    fireEvent.click(screen.getByTestId("risk-submit"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/has not been answered/i);
  });
});
