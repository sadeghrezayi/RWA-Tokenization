import request from "supertest";
import { REQUIRED_DOSSIER_KINDS } from "../../src/domain/assets/legal-dossier.js";
import { CHECKLIST_ITEMS } from "../../src/domain/assets/onboarding-checklist.js";

const CONTENT = Buffer.from("deed").toString("base64");

// Walks an asset all the way to APPROVED over real HTTP, for suites whose
// subject is something downstream (offerings, distributions) and that only need
// an approved asset to exist.
//
// One copy, deliberately: this loop had been written out four times, and when
// 4.3 added the document-review gate every copy broke separately. A suite that
// is ABOUT the onboarding flow should still drive it step by step — this is for
// the ones that are not.
export const seedApprovedAsset = async (
  server: Parameters<typeof request>[0],
  officerToken: string,
  name: string,
): Promise<string> => {
  const http = request(server);
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const created = await http.post("/assets").set(auth(officerToken)).send({ name }).expect(201);
  const assetId = (created.body as { assetId: string }).assetId;

  await http.post(`/assets/${assetId}/start-structuring`).set(auth(officerToken)).expect(204);
  for (const kind of REQUIRED_DOSSIER_KINDS) {
    await http
      .post(`/assets/${assetId}/documents`)
      .set(auth(officerToken))
      .send({ kind, title: kind, contentBase64: CONTENT })
      .expect(201);
    // 4.3: approval requires that a person reviewed and accepted each document.
    await http
      .post(`/assets/${assetId}/documents/${kind}/accept`)
      .set(auth(officerToken))
      .expect(204);
  }
  await http
    .post(`/assets/${assetId}/custody`)
    .set(auth(officerToken))
    .send({ custodianName: "Trust Co.", location: "Vault 12" })
    .expect(204);
  for (const item of CHECKLIST_ITEMS) {
    await http.post(`/assets/${assetId}/checklist/${item}`).set(auth(officerToken)).expect(204);
  }
  await http.post(`/assets/${assetId}/approve`).set(auth(officerToken)).expect(204);

  return assetId;
};
