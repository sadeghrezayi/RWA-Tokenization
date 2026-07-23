import { afterEach, describe, expect, it } from "vitest";
import { readCsrfToken } from "../lib/session";

const clearCookies = () => {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0`;
  }
};

afterEach(clearCookies);

describe("readCsrfToken", () => {
  it("returns_undefined_when_the_csrf_cookie_is_absent", () => {
    document.cookie = "other=1";
    expect(readCsrfToken()).toBeUndefined();
  });

  it("reads_and_decodes_the_csrf_cookie_value", () => {
    document.cookie = "other=1";
    document.cookie = "tk_csrf=abc%20123";
    expect(readCsrfToken()).toBe("abc 123");
  });
});
