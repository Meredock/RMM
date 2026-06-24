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
];

export default eslintConfig;
