import type { PrismaClient } from "@prisma/client";
import { ScreeningResult } from "../../domain/screening/screening-result.js";
import type { ScreeningRepository } from "../../application/screening/ports.js";
import type { IdGenerator } from "../../application/identity/ports.js";

// Append-only: `save` always inserts. A screening re-run is a new fact, not an
// update of the old one, so there is deliberately no upsert here.
export class PrismaScreeningRepository implements ScreeningRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ids: IdGenerator,
  ) {}

  async save(result: ScreeningResult): Promise<void> {
    await this.prisma.screeningResult.create({
      data: {
        id: this.ids.nextId(),
        subjectId: result.subjectId,
        outcome: result.outcome,
        provider: result.provider,
        // Carried explicitly. If this column were ever dropped, a mock result
        // would become indistinguishable from a real one the moment it was
        // read back — which the shared contract test exists to prevent.
        simulated: result.simulated,
        checkedAt: result.checkedAt,
      },
    });
  }

  async findForSubject(subjectId: string): Promise<ScreeningResult[]> {
    const rows = await this.prisma.screeningResult.findMany({
      where: { subjectId },
      orderBy: { checkedAt: "asc" },
    });
    return rows.map((row) =>
      ScreeningResult.of({
        subjectId: row.subjectId,
        outcome: row.outcome === "possible_match" ? "possible_match" : "clear",
        provider: row.provider,
        simulated: row.simulated,
        checkedAt: row.checkedAt,
      }),
    );
  }
}
