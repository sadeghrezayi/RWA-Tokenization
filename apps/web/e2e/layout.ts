import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// The measurements the mobile pass made by hand, as reusable assertions.

// A page must never scroll sideways. Wide content (a data table, a diagram)
// scrolls inside its own box; the document itself does not.
export const expectNoHorizontalPageScroll = async (page: Page): Promise<void> => {
  const overflowBy = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflowBy, "the page scrolls horizontally").toBeLessThanOrEqual(0);
};

// Nothing may spill out of its container except the elements whose whole job is
// to scroll (.table-wrap) or to be scrolled past (a disclosed nav).
export const expectNothingOverflowsItsContainer = async (page: Page): Promise<void> => {
  const offenders = await page.evaluate(() => {
    const allowed = new Set(["table-wrap", "modal__body", "sidebar__nav"]);
    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        if (el.clientWidth === 0) return false;
        if ([...el.classList].some((cls) => allowed.has(cls))) return false;
        return el.scrollWidth > el.clientWidth + 1;
      })
      .slice(0, 5)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${el.className} (${String(el.scrollWidth)} > ${String(el.clientWidth)})`,
      );
  });
  expect(offenders, "elements overflow their container").toEqual([]);
};

// Present in the DOM is not the same as usable: a control hidden by CSS, or
// pushed past the right edge, is unreachable to the person who needs it.
export const expectReachable = async (control: Locator, what: string): Promise<void> => {
  await expect(control, `${what} is not visible`).toBeVisible();
  const box = await control.boundingBox();
  expect(box, `${what} has no box`).not.toBeNull();
  const viewport = control.page().viewportSize();
  if (box && viewport) {
    expect(box.x, `${what} starts off the left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${what} runs past the right edge`).toBeLessThanOrEqual(
      viewport.width + 1,
    );
  }
};

// Registering through the API keeps the layout specs about layout: no wizard
// steps, no fixtures, just a signed-in session to render the shell with.
//
// LIMITATION, stated rather than hidden: each run leaves its investors behind.
// There is no delete-investor endpoint, and giving the web package database
// credentials to clean up would couple these specs to persistence they should
// know nothing about. CI runs against an ephemeral database so it does not
// accumulate there; a long-lived DEV database will collect `layout-*` rows,
// removable with:
//   DELETE FROM investors WHERE email LIKE 'layout-%@example.com';
export const registerInvestor = async (
  page: Page,
  apiBase = process.env.API_BASE_URL ?? "http://localhost:3001",
): Promise<{ email: string; password: string }> => {
  const email = `layout-${String(Date.now())}-${String(Math.floor(Math.random() * 100000))}@example.com`;
  const password = "Passw0rd-layout-1";
  const response = await page.request.post(`${apiBase}/investors`, {
    data: { email, password },
  });
  expect(response.ok(), "could not register a test investor").toBe(true);
  return { email, password };
};

export const signIn = async (page: Page, email: string, password: string): Promise<void> => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
};
