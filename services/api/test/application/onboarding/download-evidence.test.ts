import { beforeEach, describe, expect, it } from "vitest";
import { EvidenceNotFoundError } from "../../../src/application/onboarding/errors.js";
import { DownloadEvidence } from "../../../src/application/onboarding/download-evidence.js";
import { InMemoryEvidenceStore } from "../../fakes/onboarding-fakes.js";

const scan = Buffer.from("passport-scan-bytes", "utf8");

let evidence: InMemoryEvidenceStore;
let download: DownloadEvidence;
let reference: string;

beforeEach(async () => {
  evidence = new InMemoryEvidenceStore();
  download = new DownloadEvidence(evidence);
  const descriptor = await evidence.put({
    investorId: "inv-1",
    step: "identity_evidence",
    filename: "passport.jpg",
    contentType: "image/jpeg",
    bytes: scan,
  });
  reference = descriptor.reference;
});

describe("DownloadEvidence", () => {
  it("hands a reviewer the document and how to render it", async () => {
    const content = await download.execute({ reference });

    expect(content.bytes.equals(scan)).toBe(true);
    expect(content.descriptor.contentType).toBe("image/jpeg");
    expect(content.descriptor.filename).toBe("passport.jpg");
  });

  it("lets an applicant re-open their own document", async () => {
    const content = await download.execute({ reference, investorId: "inv-1" });
    expect(content.bytes.equals(scan)).toBe(true);
  });

  it("hides another applicant's document behind the same not-found answer", async () => {
    // "Forbidden" would confirm the document exists.
    await expect(download.execute({ reference, investorId: "inv-2" })).rejects.toThrow(
      EvidenceNotFoundError,
    );
  });

  it("reports an unknown reference as absent", async () => {
    await expect(download.execute({ reference: "nope" })).rejects.toThrow(EvidenceNotFoundError);
  });
});
