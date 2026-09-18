import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Node CommonJS build tooling — intentionally uses require() because it
    // runs directly under node outside the Next.js bundler.
    "contracts/*.js",
    "contracts/artifacts/**",
  ]),
]);

export default eslintConfig;
