//#region dist/.types-work/mathjax-6BV6bQWa.d.ts
//#region packages/core/src/math/mathjax.d.ts
interface MathSvg {
    /** standalone `<svg>…</svg>` markup. */
    svg: string;
    /** extents in em (the SVG viewBox uses 1em = 1000 units). */
    widthEm: number;
    ascentEm: number;
    descentEm: number;
}
/**
 * The math engine contract a viewer needs to render equations. Satisfied by the
 * `math` named export of the separate `@silurus/ooxml/math` entry point, which
 * the consumer opts into:
 *
 * ```ts
 * import { DocxViewer } from '@silurus/ooxml/docx';
 * import { math } from '@silurus/ooxml/math';
 * new DocxViewer(canvas, { math });
 * ```
 *
 * Omit it and the equation engine (MathJax + STIX Two Math, ~3 MB) is never
 * imported, so a bundler drops it entirely.
 */
interface MathRenderer {
    /** Preload the engine. Called once before converting equations. */
    loadMathJax(): Promise<void>;
    /** MathML string → standalone SVG + baseline-relative em extents. */
    mathMLToSvg(mathml: string): Promise<MathSvg>;
}
//#endregion
//#region dist/.types-work/math.d.ts
//#region src/math.d.ts
/**
 * The OMML equation engine (MathJax + STIX Two Math). Pass it to a viewer's
 * `math` option to enable equation rendering. Self-contained: no network, no
 * cross-origin requests.
 */
declare const math: MathRenderer;
//#endregion
export { type MathRenderer, type MathSvg, math };
