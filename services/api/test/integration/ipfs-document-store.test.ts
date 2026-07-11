import { describe, expect, it } from "vitest";
import { IpfsDocumentStore } from "../../src/infrastructure/documents/ipfs-document-store.js";

const IPFS_API = process.env.IPFS_API_URL ?? "http://127.0.0.1:5001";

// Requires the kubo container from docker-compose.yml.
describe("IpfsDocumentStore (integration, real kubo)", () => {
  it("stores_bytes_and_returns_a_cidv1_plus_sha256_and_content_round_trips", async () => {
    const store = new IpfsDocumentStore(IPFS_API);
    const content = new TextEncoder().encode(`dossier content ${IPFS_API}`);

    const receipt = await store.store(content);

    expect(receipt.cid).toMatch(/^b/); // CIDv1 base32
    expect(receipt.sha256).toMatch(/^[0-9a-f]{64}$/);

    const res = await fetch(`${IPFS_API}/api/v0/cat?arg=${receipt.cid}`, { method: "POST" });
    expect(res.ok).toBe(true);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(content);
  });

  it("stores_identical_content_to_the_same_cid", async () => {
    const store = new IpfsDocumentStore(IPFS_API);
    const content = new TextEncoder().encode("identical bytes");

    const first = await store.store(content);
    const second = await store.store(content);
    expect(second.cid).toBe(first.cid);
  });
});
