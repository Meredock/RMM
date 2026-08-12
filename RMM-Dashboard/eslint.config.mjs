// Use eslint-config-next's native flat configs directly. The previous
// FlatCompat-based setup crashed under ESLint 9 ("Converting circular structure
// to JSON") due to plugin double-registration in the compat layer.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "prisma/migrations/**"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // React-Compiler-era rule that flags common fetch-on-mount patterns
      // (e.g. setLoading(true) before a fetch in useEffect). Keep it visible as
      // a warning rather than failing the build.
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // passenger.js is the cPanel/Passenger startup file: a CommonJS shim that
    // must use require() to register the tsx hook before loading server.ts.
    // ESM import is hoisted and would run before the hook, so require() is
    // required here even though it is forbidden across the TS codebase.
    files: ["passenger.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
