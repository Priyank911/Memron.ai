/**
 * CSS Module Type Declarations
 * 
 * Tells TypeScript to accept CSS file imports.
 * This is normally handled by Next.js but may be needed
 * for some editor configurations.
 */

declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.sass' {
  const content: { [className: string]: string };
  export default content;
}
