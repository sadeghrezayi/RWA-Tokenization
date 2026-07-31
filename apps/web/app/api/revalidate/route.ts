import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { locales } from "../../../lib/i18n";

// 2.2: on-demand cache purge for the public marketplace.
//
// ISR alone is NOT sufficient: withdrawing an offering must stop it being
// advertised immediately, and a stale cached page would keep soliciting for the
// whole revalidate window. The API calls this after publish/unpublish; the ISR
// window remains the fallback if the call is ever missed.
//
// The caller sends only an offeringId. Expanding that into concrete paths lives
// HERE because locales and routing are the web app's knowledge — and because
// revalidatePath needs real paths ("/en/browse"), not route patterns.
//
// Guarded by a shared secret: this is a cache-control surface, not public data.
export const POST = async (request: Request): Promise<NextResponse> => {
  const expected = process.env.REVALIDATE_SECRET;
  if (expected === undefined || expected === "") {
    // Fail closed: an unconfigured secret must not mean "anyone may purge".
    return NextResponse.json({ error: "revalidation is not configured" }, { status: 503 });
  }
  if (request.headers.get("x-revalidate-secret") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { offeringId?: unknown };
  const offeringId = typeof body.offeringId === "string" ? body.offeringId : undefined;
  if (offeringId === undefined || offeringId === "") {
    return NextResponse.json({ error: "offeringId is required" }, { status: 400 });
  }

  const paths = [
    "/sitemap.xml",
    ...locales.flatMap((locale) => [`/${locale}/browse`, `/${locale}/browse/${offeringId}`]),
  ];
  for (const path of paths) {
    revalidatePath(path);
  }
  return NextResponse.json({ revalidated: paths });
};
