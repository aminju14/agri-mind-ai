import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * AgriMind AI ESLint flat config.
 *
 * Beyond next/core-web-vitals + next/typescript, this enforces the server/client import
 * boundary (ARCHITECTURE §2): client-reachable code must never import server-only modules
 * (`@/server/*`, `@/ai/*`). Those run on the server and would either break the build or
 * leak secrets/SDKs into the client bundle.
 */
const SERVER_ONLY_IMPORTS = {
  patterns: [
    {
      group: ["@/server/*", "@/server", "@/ai/*", "@/ai"],
      message:
        "Server-only module imported from client-reachable code. Move the logic behind an API route, or import it only from src/server/** or src/app/api/**. (ARCHITECTURE §2)",
    },
  ],
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Global ignores
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "prisma/migrations/**",
    ],
  },

  // Allow intentionally-unused identifiers prefixed with "_" (params, caught errors, vars).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Server/client import-boundary: forbid server-only imports from client-reachable layers.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", SERVER_ONLY_IMPORTS],
    },
  },

  // Client components (page.tsx is a server component, but layout/components may be client).
  // Belt-and-suspenders: any file with the "use client" directive must not import server-only.
  // (Covered by the layer rule above; this entry documents the intent.)

  // Test files: relax a few rules that don't matter for unit tests.
  {
    files: ["**/*.test.{ts,tsx}", "scripts/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];

export default eslintConfig;
