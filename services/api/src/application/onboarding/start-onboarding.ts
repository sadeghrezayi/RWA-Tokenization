import { OnboardingApplication } from "../../domain/onboarding/onboarding-application.js";
import { loadInvestor } from "../identity/load-investor.js";
import type { IdGenerator, InvestorRepository } from "../identity/ports.js";
import type { Clock } from "../offerings/ports.js";
import type { EvidenceStore, OnboardingRepository } from "./ports.js";
import type { OnboardingProgressView } from "./onboarding-view.js";
import { toProgressView } from "./onboarding-view.js";

// Entering the wizard. Idempotent by design: an applicant who navigates away
// and comes back resumes rather than losing what they filled in.
export class StartOnboarding {
  constructor(
    private readonly investors: InvestorRepository,
    private readonly applications: OnboardingRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly evidence: EvidenceStore,
  ) {}

  async execute(input: { investorId: string }): Promise<OnboardingProgressView> {
    const investor = await loadInvestor(this.investors, input.investorId);

    const existing = await this.applications.findByInvestor(investor.id);
    if (existing) {
      // Resuming: report the documents already uploaded, not an empty list.
      return toProgressView(existing, await this.evidence.listFor(investor.id));
    }

    const application = OnboardingApplication.start({
      id: this.ids.nextId(),
      investorId: investor.id,
      // Only individuals for now; the domain refuses "entity" loudly (OD-14).
      kind: "individual",
      now: this.clock.now(),
    });
    await this.applications.save(application);
    return toProgressView(application, []);
  }
}
