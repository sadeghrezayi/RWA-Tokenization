import { Logger } from "@nestjs/common";
import type { PublicPageRevalidator } from "../../application/offerings/ports.js";

// 2.2: purges the public web app's cached marketplace pages after a publication
// change, so a withdrawal stops being advertised immediately.
//
// Deliberately BEST-EFFORT: a purge failure is logged and swallowed. The
// publication decision is already committed, and the web app's ISR window is
// the fallback — failing the operator's request because a cache would not clear
// would be worse than a briefly stale page. It is also time-boxed so a hung web
// app cannot stall an admin request.
export class WebPublicPageRevalidator implements PublicPageRevalidator {
  private readonly log = new Logger(WebPublicPageRevalidator.name);

  constructor(
    private readonly webBaseUrl: string,
    private readonly secret: string | undefined,
    private readonly timeoutMs = 2_000,
  ) {}

  async offeringChanged(offeringId: string): Promise<void> {
    if (this.secret === undefined || this.secret === "") {
      // Unconfigured: ISR alone governs freshness. Said out loud once per call
      // rather than failing, so a dev environment still works.
      this.log.debug("REVALIDATE_SECRET not set — relying on the ISR window");
      return;
    }
    try {
      const res = await fetch(`${this.webBaseUrl}/api/revalidate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-revalidate-secret": this.secret },
        // Only the id: expanding it into locale-specific paths is the web
        // app's job, since routing and locales are its knowledge.
        body: JSON.stringify({ offeringId }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status === 401 || res.status === 403) {
        // The one cause a status code alone hides: both sides are configured,
        // and they disagree. "returned 401" sends a reader looking for a bug;
        // this sends them to the two places the value is set (K-4).
        this.log.warn(
          "public cache purge REFUSED by the web app — the API and web disagree on REVALIDATE_SECRET; " +
            "published and withdrawn offerings will be stale for the whole ISR window until they match",
        );
      } else if (!res.ok) {
        this.log.warn(`public cache purge returned ${String(res.status)}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log.warn(`public cache purge failed (ISR window still applies): ${reason}`);
    }
  }
}
