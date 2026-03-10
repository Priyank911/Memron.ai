import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    rules: {
      // Downgrade new React Hooks v5 strict rules — were never enforced, fix incrementally
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      // JSX text — easy to miss, warn only
      "react/no-unescaped-entities": "warn",
    },
  },
];
