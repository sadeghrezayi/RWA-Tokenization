import { describe, expect, it } from "vitest";
import { parseCookies, serializeCookie } from "../../src/infrastructure/http/cookies.js";

describe("parseCookies", () => {
  it("returns_empty_for_no_header", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });

  it("parses_multiple_cookies_and_decodes_values", () => {
    expect(parseCookies("session=abc.def; csrf=t%20ok; other=1")).toEqual({
      session: "abc.def",
      csrf: "t ok",
      other: "1",
    });
  });

  it("ignores_malformed_segments", () => {
    expect(parseCookies("=nokey; justkey; a=b")).toEqual({ a: "b" });
  });
});

describe("serializeCookie", () => {
  it("emits_attributes_for_a_secure_httponly_session_cookie", () => {
    const header = serializeCookie("session", "jwt.value", {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAgeSeconds: 3600,
    });
    expect(header).toContain("session=jwt.value");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=3600");
  });

  it("omits_httponly_and_secure_when_not_requested", () => {
    const header = serializeCookie("csrf", "token", { sameSite: "Lax", path: "/" });
    expect(header).not.toContain("HttpOnly");
    expect(header).not.toContain("Secure");
    expect(header).toContain("csrf=token");
  });

  it("encodes_the_value", () => {
    expect(serializeCookie("k", "a b", {})).toContain("k=a%20b");
  });

  it("expires_immediately_with_max_age_zero", () => {
    expect(serializeCookie("session", "", { maxAgeSeconds: 0 })).toContain("Max-Age=0");
  });
});
