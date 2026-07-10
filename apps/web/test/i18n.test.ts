import { describe, expect, it } from "vitest";
import { defaultLocale, dictionaries, direction, locales } from "../lib/i18n";

// Language policy (user decision 2026-07-10): the platform is multilingual by
// architecture, but the default and demo locale is ALWAYS English.
describe("language policy", () => {
  it("defaults_to_english", () => {
    expect(defaultLocale).toBe("en");
  });

  it("ships_english_only_until_a_locale_is_added_by_business_decision", () => {
    expect(locales).toEqual(["en"]);
  });

  it("every_locale_has_a_dictionary_and_a_text_direction", () => {
    for (const locale of locales) {
      expect(dictionaries[locale]).toBeDefined();
      expect(direction[locale]).toMatch(/^(ltr|rtl)$/);
    }
  });
});
