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

// Stands in for a template hole. No whitespace, so it survives tokenising.
const DYNAMIC = "\u0000";

// Every string a className is built from — including the branches of a
// conditional. `className={active ? "nav-link nav-link--active" : "nav-link"}`
// is the ordinary way this codebase marks state, and an earlier version of
// this scanner saw NONE of it: it matched only `className="..."` and
// `className={`...`}`, so five classes used in all three shells looked unused
// and, worse, would not have been caught had they been misspelled.
const classNameLiterals = (source: string): string[] => {
  const literals: string[] = [];
  for (const match of source.matchAll(/className=/g)) {
    let i = match.index + "className=".length;
    if (source[i] === '"') {
      const end = source.indexOf('"', i + 1);
      if (end > i) literals.push(source.slice(i + 1, end));
      continue;
    }
    if (source[i] !== "{") continue;
    // Walk to the matching brace, so the whole expression is in hand however
    // it is written, then take every string literal inside it.
    let depth = 0;
    const start = i;
    for (; i < source.length; i++) {
      const char = source[i];
      if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const expression = source.slice(start + 1, i);
    for (const inner of expression.matchAll(/"([^"]*)"|`([^`]*)`/g)) {
      literals.push(inner[1] ?? inner[2] ?? "");
    }
  }
  return literals;
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
    for (const literal of classNameLiterals(source)) {
      // Collapse each interpolation to a marker FIRST: `${String((i % 5) + 1)}`
      // contains spaces, and splitting before collapsing shreds one class into
      // four nonsense tokens like `.5)` and `.+`.
      const collapsed = literal.replace(/\$\{[^}]*\}/g, DYNAMIC);
      for (const token of collapsed.split(/\s+/).filter(Boolean)) {
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
      .filter((usage) => !usage.className.includes(DYNAMIC))
      .filter((usage) => !defined.has(usage.className))
      .map((usage) => `${usage.file}: .${usage.className}`);

    expect([...new Set(orphans)]).toEqual([]);
  });

  // The other half of a `base base--${variant}` template. The variant itself
  // cannot be known at rest, but its PREFIX can: if nothing in the stylesheet
  // begins with `badge--`, then no value of `tone` will ever match a rule, and
  // the component is styling nothing — the same silent failure as K-28 wearing
  // a template literal.
  it("has no interpolated class whose prefix matches nothing in the stylesheet", () => {
    const defined = [...definedClasses()];
    const orphans = usedClasses()
      .filter((usage) => usage.className.includes(DYNAMIC))
      .map((usage) => ({
        ...usage,
        prefix: usage.className.slice(0, usage.className.indexOf(DYNAMIC)),
      }))
      .filter((usage) => usage.prefix !== "")
      .filter((usage) => !defined.some((name) => name.startsWith(usage.prefix)))
      .map((usage) => `${usage.file}: .${usage.prefix}*`);

    expect([...new Set(orphans)]).toEqual([]);
  });
});
