import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// K-28: the issuer shell shipped using `topbar`, `topbar__actions` and
// `content` — none of which exist in components.css. Nothing failed. No test,
// no typecheck, no lint has anything to say about a class name that matches
// nothing; the page simply looks wrong, and only where someone happens to
// look. This closes that hole for every surface at once.

const root = join(import.meta.dirname, "..");

const filesUnder = (dir: string, suffix: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry === ".next") return [];
    if (statSync(path).isDirectory()) return filesUnder(path, suffix);
    return path.endsWith(suffix) ? [path] : [];
  });

const definedClasses = (): Set<string> => {
  const css = readFileSync(join(root, "app/components.css"), "utf8");
  // Selector positions only: a class is defined where it is written as `.name`
  // outside a declaration block's value.
  // Neither `as string` nor `!`: the two lint rules here forbid one each, and
  // a filter says the same thing without arguing with either.
  return new Set(
    [...css.matchAll(/\.([a-zA-Z][\w-]*)/g)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined),
  );
};

interface Usage {
  file: string;
  className: string;
}

const usedClasses = (): Usage[] => {
  const sources = [
    ...filesUnder(join(root, "components"), ".tsx"),
    ...filesUnder(join(root, "app"), ".tsx"),
  ];
  const usages: Usage[] = [];
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const literal = match[1] ?? match[2] ?? "";
      // A template hole makes the token around it unknowable at rest —
      // `toast--${tone}` is three real classes the CSS spells out separately.
      if (literal.includes("${")) continue;
      for (const token of literal.split(/\s+/).filter(Boolean)) {
        usages.push({ file: file.slice(root.length + 1), className: token });
      }
    }
  }
  return usages;
};

describe("every class a component asks for exists in the stylesheet", () => {
  it("finds classes to check at all, so a broken scan cannot pass silently", () => {
    expect(definedClasses().size).toBeGreaterThan(100);
    expect(usedClasses().length).toBeGreaterThan(100);
  });

  it("has no component naming a class the design system never defines", () => {
    const defined = definedClasses();
    const orphans = usedClasses()
      .filter((usage) => !defined.has(usage.className))
      .map((usage) => `${usage.file}: .${usage.className}`);

    expect([...new Set(orphans)]).toEqual([]);
  });
});
