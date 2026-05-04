import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const ignores = [
  ".next/**",
  "coverage/**",
  "data/processed/**",
  "node_modules/**",
  "public/data/**"
];

const config = [...nextVitals, ...nextTypescript, { ignores }];

export default config;
