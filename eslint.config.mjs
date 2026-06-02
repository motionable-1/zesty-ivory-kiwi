import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  { ignores: ["node_modules/", "dist/"] },
];
