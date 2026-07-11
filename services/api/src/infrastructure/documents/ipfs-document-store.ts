import { createHash } from "node:crypto";
import type { DocumentStore } from "../../application/assets/ports.js";

// FR-AO-2: immutable legal documents on self-hosted IPFS (kubo HTTP API).
// CIDv1 + pin, so the reference is stable and survives garbage collection.
export class IpfsDocumentStore implements DocumentStore {
  constructor(private readonly apiUrl: string) {}

  async store(content: Uint8Array): Promise<{ cid: string; sha256: string }> {
    const form = new FormData();
    form.append("file", new Blob([content]));
    const res = await fetch(`${this.apiUrl}/api/v0/add?cid-version=1&pin=true`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error(`IPFS add failed with status ${String(res.status)}`);
    }
    const body = (await res.json()) as { Hash: string };
    return {
      cid: body.Hash,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  }
}
