declare namespace JSX {
  interface Element {}

  interface IntrinsicElements {
    [elementName: string]: unknown;
  }
}

declare module "*.css";

declare module "react/jsx-runtime" {
  export const Fragment: unknown;
  export function jsx(type: unknown, props: unknown, key?: unknown): JSX.Element;
  export function jsxs(type: unknown, props: unknown, key?: unknown): JSX.Element;
}
