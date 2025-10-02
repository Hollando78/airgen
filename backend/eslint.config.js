import tseslint from "typescript-eslint";

export default tseslint.config({
  ignores: [
    "dist/**",
    "node_modules/**"
  ]
}, {
  files: ["src/**/*.ts"],
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parser: tseslint.parser
  },
  rules: {
    "no-console": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off"
  }
});
