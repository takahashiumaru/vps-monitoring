module.exports = [
  {
    ignores: ["ios/**", "data/**", "node_modules/**"],
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-console": "off",
    },
  },
];
