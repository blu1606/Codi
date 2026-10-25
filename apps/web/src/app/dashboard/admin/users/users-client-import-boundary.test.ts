import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("admin users client import boundary", () => {
  it("loads runtime auth values only through the client-safe roles entrypoint", () => {
    const source = ts.createSourceFile(
      "users-client.tsx",
      readFileSync(new URL("./users-client.tsx", import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const runtimeAuthImports = source.statements.flatMap((statement) => {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) return [];
      const name = statement.moduleSpecifier.text;
      if (name !== "@codi-1/auth" && !name.startsWith("@codi-1/auth/"))
        return [];
      const clause = statement.importClause;
      if (clause?.isTypeOnly) return [];
      const bindings = clause?.namedBindings;
      if (
        !clause?.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.every((entry) => entry.isTypeOnly)
      ) return [];
      return [name];
    });

    expect(runtimeAuthImports).toEqual(["@codi-1/auth/roles"]);
  });
});
