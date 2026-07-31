import type { PublicOfferingDto } from "./api";

// 2.2: server-side reads of the PUBLIC endpoints, used by server components so
// the marketplace ships real HTML (crawlers and slow connections both get
// content without executing JS).
//
// Separate from lib/api.ts on purpose: that client carries a session cookie and
// CSRF token. Nothing here is authenticated — these routes are anonymous by
// design — so no credentials are attached, and none should be.
const baseUrl = (): string =>
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// How long a public page may serve cached data. Offerings change rarely and a
// stale entry is never dangerous — an UNPUBLISHED offering disappears within
// this window at worst, and the API is still the authority for subscribing.
export const PUBLIC_REVALIDATE_SECONDS = 60;

const getJson = async <T>(path: string): Promise<T | undefined> => {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      next: { revalidate: PUBLIC_REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      // 404 for an unlisted offering is expected, not exceptional.
      return undefined;
    }
    return (await res.json()) as T;
  } catch {
    // The page decides what to render; it must not claim "nothing on offer".
    return undefined;
  }
};

export const fetchPublicOfferings = (): Promise<PublicOfferingDto[] | undefined> =>
  getJson<PublicOfferingDto[]>("/public/offerings");

export const fetchPublicOffering = (id: string): Promise<PublicOfferingDto | undefined> =>
  getJson<PublicOfferingDto>(`/public/offerings/${encodeURIComponent(id)}`);
