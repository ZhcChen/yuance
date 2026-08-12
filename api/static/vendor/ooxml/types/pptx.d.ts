//#region dist/.types-work/mathjax-CKU2W8zq.d.ts
interface MathSvg {
  svg: string;
  widthEm: number;
  ascentEm: number;
  descentEm: number;
}
interface MathRenderer {
  loadMathJax(): Promise<void>;
  mathMLToSvg(mathml: string): Promise<MathSvg>;
}
//#endregion
//#region dist/.types-work/hyperlink-R5D7g--F.d.ts
type MathStyle = 'roman' | 'italic' | 'bold' | 'boldItalic';
interface MathRun {
  kind: 'run';
  text: string;
  style: MathStyle;
}
interface MathFraction {
  kind: 'fraction';
  num: MathNode[];
  den: MathNode[];
  bar?: boolean;
}
interface MathScript {
  kind: 'sup' | 'sub' | 'subSup';
  base: MathNode[];
  sup?: MathNode[];
  sub?: MathNode[];
}
interface MathNary {
  kind: 'nary';
  op: string;
  limLoc?: string;
  sub?: MathNode[];
  sup?: MathNode[];
  body: MathNode[];
}
interface MathDelimiter {
  kind: 'delimiter';
  begChar: string;
  endChar: string;
  items: MathNode[][];
}
interface MathRadical {
  kind: 'radical';
  index?: MathNode[];
  radicand: MathNode[];
}
interface MathLimit {
  kind: 'limit';
  base: MathNode[];
  lower?: MathNode[];
  upper?: MathNode[];
}
interface MathArray {
  kind: 'array';
  rows: MathNode[][][];
  align: 'eq' | 'center' | 'left';
}
interface MathGroupChr {
  kind: 'groupChr';
  char: string;
  pos: 'top' | 'bot';
  base: MathNode[];
}
interface MathBar {
  kind: 'bar';
  pos: 'top' | 'bot';
  base: MathNode[];
}
interface MathAccent {
  kind: 'accent';
  char: string;
  base: MathNode[];
}
interface MathFunc {
  kind: 'func';
  name: MathNode[];
  arg: MathNode[];
}
interface MathGroup {
  kind: 'group';
  items: MathNode[];
}
interface MathPhant {
  kind: 'phant';
  show: boolean;
  zeroWid?: boolean;
  zeroAsc?: boolean;
  zeroDesc?: boolean;
  base: MathNode[];
}
interface MathSPre {
  kind: 'sPre';
  sub: MathNode[];
  sup: MathNode[];
  base: MathNode[];
}
interface MathBox {
  kind: 'box';
  base: MathNode[];
}
interface MathBorderBox {
  kind: 'borderBox';
  hideTop?: boolean;
  hideBot?: boolean;
  hideLeft?: boolean;
  hideRight?: boolean;
  strikeH?: boolean;
  strikeV?: boolean;
  strikeBltr?: boolean;
  strikeTlbr?: boolean;
  base: MathNode[];
}
type MathNode = MathRun | MathFraction | MathScript | MathNary | MathDelimiter | MathRadical | MathLimit | MathArray | MathGroupChr | MathBar | MathAccent | MathFunc | MathGroup | MathPhant | MathSPre | MathBox | MathBorderBox;
interface Duotone {
  clr1: string;
  clr2: string;
}
type PathCmd = {
  cmd: 'moveTo';
  x: number;
  y: number;
} | {
  cmd: 'lineTo';
  x: number;
  y: number;
} | {
  cmd: 'cubicBezTo';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
} | {
  cmd: 'quadBezTo';
  x1: number;
  y1: number;
  x: number;
  y: number;
} | {
  cmd: 'arcTo';
  wr: number;
  hr: number;
  stAng: number;
  swAng: number;
} | {
  cmd: 'close';
};
type Fill = SolidFill | NoFill | GradientFill | PatternFill | ImageFill;
interface SolidFill {
  fillType: 'solid';
  color: string;
}
interface NoFill {
  fillType: 'none';
}
interface GradientStop {
  position: number;
  color: string;
}
interface GradientFill {
  fillType: 'gradient';
  stops: GradientStop[];
  angle: number;
  gradType: string;
  scaled?: boolean;
  path?: 'shape' | 'circle' | 'rect' | string;
  fillToRect?: FillRect;
  tileRect?: FillRect;
  flip?: 'none' | 'x' | 'y' | 'xy' | string;
  rotWithShape?: boolean;
}
interface PatternFill {
  fillType: 'pattern';
  fg: string;
  bg: string;
  preset: string;
}
interface FillRect {
  l?: number;
  t?: number;
  r?: number;
  b?: number;
}
interface TileInfo {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  flip: string;
  algn?: string;
}
interface ImageFill {
  fillType: 'image';
  imagePath: string;
  mimeType: string;
  fillRect?: FillRect;
  tile?: TileInfo;
  alpha?: number;
  duotone?: Duotone;
}
interface Shadow {
  color: string;
  alpha: number;
  blur: number;
  dist: number;
  dir: number;
  sx?: number;
  sy?: number;
  kx?: number;
  ky?: number;
  algn?: 'tl' | 't' | 'tr' | 'l' | 'ctr' | 'r' | 'bl' | 'b' | 'br';
  rotWithShape?: boolean;
}
interface Glow {
  color: string;
  alpha: number;
  radius: number;
}
interface SoftEdge {
  radius: number;
}
interface Reflection {
  blur: number;
  dist: number;
  dir: number;
  stA: number;
  stPos: number;
  endA: number;
  endPos: number;
  sx: number;
  sy: number;
}
interface ArrowEnd {
  type: string;
  w: string;
  len: string;
}
interface Stroke {
  color: string;
  width: number;
  fill?: Exclude<Fill, {
    fillType: 'image';
  } | {
    fillType: 'none';
  }>;
  dashStyle?: string;
  customDash?: ReadonlyArray<{
    dash: number;
    space: number;
  }>;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'round' | 'bevel' | 'miter';
  miterLimit?: number;
  alignment?: 'ctr' | 'in';
  headEnd?: ArrowEnd;
  tailEnd?: ArrowEnd;
  cmpd?: string;
}
interface TextBody$1 {
  verticalAnchor: string;
  paragraphs: Paragraph$1[];
  defaultFontSize: number | null;
  defaultBold: boolean | null;
  defaultItalic: boolean | null;
  lIns: number;
  rIns: number;
  tIns: number;
  bIns: number;
  wrap: string;
  vert: string;
  autoFit: string;
  fontScale?: number | null;
  lnSpcReduction?: number | null;
  numCol?: number;
  spcCol?: number;
}
type SpaceLine = {
  type: 'pct';
  val: number;
} | {
  type: 'pts';
  val: number;
};
type Bullet$1 = {
  type: 'none';
} | {
  type: 'inherit';
} | {
  type: 'char';
  char: string;
  color: string | null;
  sizePct: number | null;
  sizePts?: number;
  fontFamily: string | null;
} | {
  type: 'autoNum';
  numType: string;
  startAt: number | null;
  color: string | null;
  sizePct?: number | null;
  sizePts?: number;
  fontFamily?: string | null;
};
interface TabStop {
  pos: number;
  algn: string;
}
interface Paragraph$1 {
  alignment: string;
  marL: number;
  marR: number;
  indent: number;
  spaceBefore: number | null;
  spaceAfter: number | null;
  spaceLine: SpaceLine | null;
  lvl: number;
  bullet: Bullet$1;
  defFontSize: number | null;
  defColor: string | null;
  defBold: boolean | null;
  defItalic: boolean | null;
  defFontFamily: string | null;
  tabStops: TabStop[];
  rtl?: boolean;
  runs: TextRun[];
}
type TextRun = TextRunData | LineBreak | EquationRun;
interface EquationRun {
  type: 'math';
  nodes: MathNode[];
  display: boolean;
  fontSize?: number | null;
  color?: string | null;
}
interface TextRunData {
  type: 'text';
  text: string;
  bold: boolean | null;
  italic: boolean | null;
  underline: boolean;
  underlineStyle?: string;
  underlineColor?: string;
  strikethrough: boolean;
  strikeDouble?: boolean;
  fontSize: number | null;
  color: string | null;
  fontFamily: string | null;
  fontFamilyEa?: string;
  fontFamilySym?: string;
  baseline?: number;
  caps?: 'none' | 'small' | 'all';
  letterSpacing?: number;
  fieldType?: string;
  hyperlink?: string;
  hyperlinkAction?: string;
  shadow?: Shadow;
  reflection?: Reflection;
  outline?: TextOutline;
  highlight?: string;
}
interface TextOutline {
  width: number;
  color?: string;
}
interface LineBreak {
  type: 'break';
}
interface RenderOptions {
  width?: number;
  defaultTextColor?: string | null;
  dpr?: number;
  majorFont?: string | null;
  minorFont?: string | null;
  hlinkColor?: string | null;
  fetchMedia?: (path: string) => Promise<Blob>;
  fetchImage?: (path: string, mimeType: string) => Promise<Blob>;
  skipMediaControls?: boolean;
}
interface ChartSeries {
  name: string;
  color: string | null;
  fillPattern?: PatternFill | null;
  lineColor?: string | null;
  lineWidthEmu?: number | null;
  values: (number | null)[];
  dataPointColors?: (string | null)[] | null;
  dataLabelColors?: (string | null)[] | null;
  labelColor?: string | null;
  seriesType?: string | null;
  useSecondaryAxis?: boolean | null;
  categories?: string[] | null;
  showMarker?: boolean | null;
  valFormatCode?: string | null;
  catFormatCode?: string | null;
  catFormatCodes?: (string | null)[] | null;
  markerSymbol?: string | null;
  markerSize?: number | null;
  markerFill?: string | null;
  markerLine?: string | null;
  dataPointOverrides?: ChartDataPointOverride[] | null;
  dataLabelOverrides?: ChartDataLabelOverride[] | null;
  seriesDataLabels?: ChartSeriesDataLabels | null;
  errBars?: ChartErrBars[] | null;
  bubbleSizes?: (number | null)[] | null;
  smooth?: boolean | null;
  trendLines?: ChartTrendline[] | null;
  lineHidden?: boolean | null;
}
interface ChartTrendline {
  trendlineType: string;
  order?: number | null;
  period?: number | null;
  forward?: number | null;
  backward?: number | null;
  intercept?: number | null;
  dispRSqr?: boolean | null;
  dispEq?: boolean | null;
  lineColor?: string | null;
  lineWidthEmu?: number | null;
}
interface ChartDataPointOverride {
  idx: number;
  color?: string;
  markerSymbol?: string;
  markerSize?: number;
  markerFill?: string;
  markerLine?: string;
  explosion?: number;
}
interface ChartDataLabelOverride {
  idx: number;
  text: string;
  position?: string;
  fontColor?: string;
  fontSizeHpt?: number;
  fontBold?: boolean;
  labelBox?: ChartLabelBox;
  showVal?: boolean;
  showCatName?: boolean;
  showSerName?: boolean;
  showPercent?: boolean;
  deleted?: boolean;
}
interface ChartLabelBox {
  fill?: string;
  borderColor?: string;
  borderWidthEmu?: number;
}
interface ChartSeriesDataLabels {
  showVal: boolean;
  showCatName: boolean;
  showSerName: boolean;
  showPercent: boolean;
  position?: string;
  fontColor?: string;
  formatCode?: string;
  separator?: string;
  fontBold?: boolean;
  fontSizeHpt?: number;
  labelBox?: ChartLabelBox;
  showLeaderLines?: boolean;
  leaderLineColor?: string;
  leaderLineWidthEmu?: number;
}
interface ChartErrBars {
  dir: string;
  barType: string;
  plus: (number | null)[];
  minus: (number | null)[];
  noEndCap: boolean;
  color?: string;
  lineWidthEmu?: number;
  dash?: string;
}
type ChartType = 'line' | 'stackedLine' | 'stackedLinePct' | 'clusteredBar' | 'clusteredBarH' | 'stackedBar' | 'stackedBarH' | 'stackedBarPct' | 'stackedBarHPct' | 'area' | 'stackedArea' | 'stackedAreaPct' | 'pie' | 'doughnut' | 'scatter' | 'bubble' | 'radar' | 'waterfall' | 'stock' | 'boxWhisker' | 'sunburst' | 'treemap' | string;
interface ChartExElementStyle {
  fillPaints?: Array<SolidFill | GradientFill | PatternFill | null> | null;
  fillColors?: Array<string | null> | null;
  fillHidden?: boolean | null;
  lineColors?: Array<string | null> | null;
  lineWidthEmu?: number | null;
  lineHidden?: boolean | null;
  lineDash?: string | null;
  lineCap?: string | null;
  lineJoin?: string | null;
  fillColorIndex?: number | null;
  lineColorIndex?: number | null;
}
interface ChartModel {
  chartType: ChartType;
  title: string | null;
  titlePresent?: boolean;
  categories: string[];
  series: ChartSeries[];
  chartTextBoxes?: ChartTextBox[] | null;
  varyColors?: boolean | null;
  showDataLabels: boolean;
  valMin: number | null;
  valMax: number | null;
  catAxisTitle: string | null;
  valAxisTitle: string | null;
  catAxisHidden: boolean;
  valAxisHidden: boolean;
  catAxisLineHidden: boolean;
  valAxisLineHidden: boolean;
  plotAreaBg: string | null;
  chartBg: string | null;
  showLegend: boolean;
  legendPos: 'r' | 'l' | 't' | 'b' | 'tr' | null;
  catAxisCrossBetween: 'between' | 'midCat' | string;
  valAxisMajorTickMark: 'cross' | 'out' | 'in' | 'none' | string;
  catAxisMajorTickMark: 'cross' | 'out' | 'in' | 'none' | string;
  valAxisMinorTickMark?: 'cross' | 'out' | 'in' | 'none' | string | null;
  catAxisMinorTickMark?: 'cross' | 'out' | 'in' | 'none' | string | null;
  titleFontSizeHpt: number | null;
  titleFontColor: string | null;
  titleFontFace: string | null;
  catAxisFontSizeHpt: number | null;
  valAxisFontSizeHpt: number | null;
  catAxisFontColor?: string | null;
  valAxisFontColor?: string | null;
  dataLabelFontSizeHpt: number | null;
  dataLabelFontBold?: boolean | null;
  subtotalIndices: number[];
  legendManualLayout?: LegendManualLayout | null;
  valAxisFormatCode?: string | null;
  barGapWidth?: number | null;
  barOverlap?: number | null;
  dataLabelPosition?: string | null;
  dataLabelFontColor?: string | null;
  dataLabelFormatCode?: string | null;
  titleFontBold?: boolean | null;
  catAxisFontBold?: boolean | null;
  valAxisFontBold?: boolean | null;
  catAxisTitleFontSizeHpt?: number | null;
  catAxisTitleFontBold?: boolean | null;
  catAxisTitleFontColor?: string | null;
  valAxisTitleFontSizeHpt?: number | null;
  valAxisTitleFontBold?: boolean | null;
  valAxisTitleFontColor?: string | null;
  catAxisFontFace?: string | null;
  valAxisFontFace?: string | null;
  catAxisTitleFontFace?: string | null;
  valAxisTitleFontFace?: string | null;
  dataLabelFontFace?: string | null;
  legendFontFace?: string | null;
  legendFontColor?: string | null;
  legendFontSizeHpt?: number | null;
  legendFontBold?: boolean | null;
  themeMajorFontLatin?: string | null;
  themeMinorFontLatin?: string | null;
  chartBorderColor?: string | null;
  chartBorderWidthEmu?: number | null;
  catAxisCrosses?: string | null;
  catAxisCrossesAt?: number | null;
  valAxisCrosses?: string | null;
  valAxisCrossesAt?: number | null;
  catAxisLineColor?: string | null;
  catAxisLineWidthEmu?: number | null;
  valAxisLineColor?: string | null;
  valAxisLineWidthEmu?: number | null;
  catAxisFormatCode?: string | null;
  catAxisMin?: number | null;
  catAxisMax?: number | null;
  titleManualLayout?: ChartManualLayout | null;
  plotAreaManualLayout?: ChartManualLayout | null;
  scatterStyle?: string | null;
  bubbleScale?: number | null;
  bubbleSizeRepresents?: 'area' | 'w' | null;
  showNegativeBubbles?: boolean | null;
  radarStyle?: string | null;
  secondaryValAxis?: SecondaryValueAxis | null;
  secondaryCatAxis?: SecondaryValueAxis | null;
  date1904?: boolean;
  holeSize?: number | null;
  firstSliceAngle?: number | null;
  dispBlanksAs?: string | null;
  valAxisMajorGridlines?: boolean | null;
  catAxisMajorGridlines?: boolean | null;
  valAxisGridlineColor?: string | null;
  valAxisGridlineWidthEmu?: number | null;
  catAxisGridlineColor?: string | null;
  catAxisGridlineWidthEmu?: number | null;
  valAxisMinorGridlines?: boolean | null;
  valAxisMajorUnit?: number | null;
  valAxisMinorUnit?: number | null;
  valAxisLogBase?: number | null;
  valAxisOrientation?: 'minMax' | 'maxMin' | string | null;
  catAxisOrientation?: 'minMax' | 'maxMin' | string | null;
  catAxisTickLabelPos?: string | null;
  catAxisTickLabelSkip?: number | null;
  catAxisTickMarkSkip?: number | null;
  valAxisTickLabelPos?: string | null;
  catAxisLabelRotation?: number | null;
  stockHiLowLines?: boolean | null;
  stockHiLowLineColor?: string | null;
  stockUpDownBars?: boolean | null;
  chartexBox?: ChartexBoxWhisker | null;
  chartexSunburst?: ChartexSunburst | null;
  chartexTreemap?: ChartexTreemap | null;
  chartexAccents?: string[] | null;
  chartexColorPalette?: Array<string | null> | null;
  chartexColorStyleMethod?: string | null;
  chartexDataPointStyle?: ChartExElementStyle | null;
  chartexDataPointLineStyle?: ChartExElementStyle | null;
  chartexDataPointMarkerStyle?: ChartExElementStyle | null;
}
interface ChartTextRun {
  text: string;
  fontSizeHpt?: number | null;
  bold?: boolean | null;
  color?: string | null;
  fontFace?: string | null;
}
interface ChartTextParagraph {
  runs: ChartTextRun[];
  align?: 'l' | 'ctr' | 'r' | 'just' | 'dist' | string | null;
}
interface ChartTextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  paragraphs: ChartTextParagraph[];
  verticalAnchor?: 't' | 'ctr' | 'b' | 'just' | 'dist' | string | null;
  wrap?: 'none' | 'square' | string | null;
}
interface ChartexBoxSeries {
  name: string;
  color?: string | null;
  lineColor?: string | null;
  lineWidthEmu?: number | null;
  valuesByCategory: number[][];
  meanMarker: boolean;
  meanLine: boolean;
  showOutliers: boolean;
  showNonoutliers: boolean;
  quartileMethod: string;
}
interface ChartexBoxWhisker {
  categories: string[];
  series: ChartexBoxSeries[];
}
interface ChartexSunburstRow {
  path: string[];
  size: number;
}
interface ChartexSunburst {
  rows: ChartexSunburstRow[];
}
interface ChartexTreemap {
  rows: ChartexSunburstRow[];
  parentLabelLayout?: string | null;
}
interface SecondaryValueAxis {
  min: number | null;
  max: number | null;
  title: string | null;
  hidden: boolean;
  formatCode?: string | null;
  fontColor?: string | null;
  fontSizeHpt?: number | null;
  lineColor?: string | null;
  lineWidthEmu?: number | null;
  lineHidden: boolean;
  majorTickMark: string;
  majorUnit?: number | null;
  titleFontSizeHpt?: number | null;
  titleFontBold?: boolean | null;
  titleFontColor?: string | null;
}
interface ChartManualLayout {
  xMode?: string;
  yMode?: string;
  wMode?: string;
  hMode?: string;
  layoutTarget?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}
interface LegendManualLayout {
  xMode?: string;
  yMode?: string;
  wMode?: string;
  hMode?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface ChartRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
type OoxmlErrorCode = 'encrypted' | 'invalid-password' | 'unsupported-encryption' | 'legacy-binary-format' | 'not-ooxml';
type OoxmlErrorStage = 'container' | 'decompression' | 'parsing' | 'serialization' | 'layout' | 'rendering' | 'worker';
declare class OoxmlError extends Error {
  readonly code: OoxmlErrorCode;
  constructor(code: OoxmlErrorCode, message: string);
}
type OoxmlFormat = 'docx' | 'xlsx' | 'pptx';
interface OoxmlResourceUsageSnapshot {
  readonly archiveEntryCount: number;
  readonly declaredInflatedBytes: number;
  readonly largestInflatedEntryBytes?: number;
  readonly distinctInflatedBytes: number;
  readonly operationInflatedBytes: number;
}
type ExtensibleLiteral<Known extends string> = Known | (string & Record<never, never>);
type OoxmlResourceName = ExtensibleLiteral<'archive' | 'archive-entry' | 'xml-event' | 'xml-context' | 'xml-tree' | 'worksheet-row' | 'worksheet-shell'>;
type OoxmlResourceMetric = ExtensibleLiteral<'declared-inflated-bytes' | 'actual-inflated-bytes' | 'entry-count' | 'central-directory-bytes' | 'distinct-inflated-bytes' | 'bytes' | 'depth' | 'projected-bytes'>;
interface OoxmlResourceViolation {
  readonly format: OoxmlFormat;
  readonly operation: string;
  readonly resource: OoxmlResourceName;
  readonly metric: OoxmlResourceMetric;
  readonly part?: string;
  readonly limit: number;
  readonly observed: number;
  readonly configurable: boolean;
  readonly usage: OoxmlResourceUsageSnapshot;
}
interface OoxmlResourceLimitErrorDetails {
  readonly stage: OoxmlErrorStage;
  readonly violation: OoxmlResourceViolation;
}
declare class OoxmlResourceLimitError extends Error {
  readonly code: 'ooxml-resource-limit';
  readonly details: OoxmlResourceLimitErrorDetails;
  constructor(message: string, details: OoxmlResourceLimitErrorDetails);
}
interface OoxmlResourcePolicySnapshot {
  readonly maxArchiveEntryBytes: number | null;
  readonly maxTotalInflatedBytes: number | null;
  readonly maxArchiveEntries: number | null;
}
interface OoxmlResourceMetricsCheckpoint {
  readonly name: string;
  readonly elapsedMs: number;
  readonly usage?: OoxmlResourceUsageSnapshot;
}
interface OoxmlResourceMetrics {
  readonly schemaVersion: 1;
  readonly scope: 'load' | 'session';
  readonly format: OoxmlFormat;
  readonly mode: 'main' | 'worker' | 'node';
  readonly status: 'ok' | 'error';
  readonly sourceBytes?: number;
  readonly elapsedMs: number;
  readonly policy: Readonly<OoxmlResourcePolicySnapshot>;
  readonly usage?: OoxmlResourceUsageSnapshot;
  readonly checkpoints: readonly OoxmlResourceMetricsCheckpoint[];
  readonly outcome?: Readonly<Record<string, number>>;
  readonly error?: Readonly<{
    readonly code?: string;
    readonly stage?: string;
    readonly resource?: string;
    readonly metric?: string;
  }>;
}
type OoxmlResourceLimit = number | null;
interface OoxmlResourceLimits {
  maxArchiveEntryBytes?: OoxmlResourceLimit;
  maxTotalInflatedBytes?: OoxmlResourceLimit;
  maxArchiveEntries?: OoxmlResourceLimit;
}
interface LoadOptions$1 {
  useGoogleFonts?: boolean;
  password?: string;
  wasmUrl?: string | URL;
  maxZipEntryBytes?: number;
  resourceLimits?: OoxmlResourceLimits;
  debug?: boolean;
  onResourceMetrics?: (metrics: OoxmlResourceMetrics) => void;
  workerTimeoutMs?: number;
  math?: MathRenderer;
}
type OoxmlDecodedImageLimitMetric = 'image-pixels' | 'active-decoded-bytes';
declare class OoxmlDecodedImageLimitError extends RangeError {
  readonly metric: OoxmlDecodedImageLimitMetric;
  readonly limit: number;
  readonly observed: number;
  readonly code: 'ooxml-decoded-image-limit';
  constructor(metric: OoxmlDecodedImageLimitMetric, limit: number, observed: number);
}
declare function isOoxmlDecodedImageLimitError(error: unknown): error is OoxmlDecodedImageLimitError;
type HyperlinkTarget = {
  kind: 'external';
  url: string;
} | {
  kind: 'internal';
  ref: string;
  slideIndex?: number;
};
declare function openExternalHyperlink(url: string, allowed?: readonly string[], win?: Pick<Window, 'open'> | undefined): boolean;
//#endregion
//#region dist/.types-work/find-highlight-DcNlrW8O.d.ts
interface TextSelectionContextOptions {
  readonly maxTextCharacters?: number;
  readonly maxRunLocators?: number;
}
interface ViewerContextMenuEvent<TContext> {
  readonly originalEvent: MouseEvent;
  getContext(): Promise<TContext | null>;
}
interface AutoResizeOptions {
  pauseWhenHidden?: boolean;
}
declare function autoResize(render: (width: number, height: number) => void | Promise<void>, element: Element, opts?: AutoResizeOptions): () => void;
interface ZoomableViewer {
  getScale(): number;
  setScale(scale: number): void | Promise<void>;
  zoomIn(): void | Promise<void>;
  zoomOut(): void | Promise<void>;
  fitWidth(): void | Promise<void>;
  fitPage(): void | Promise<void>;
}
interface MatchRunSlice {
  runIndex: number;
  start: number;
  end: number;
}
interface FindMatchesOptions {
  caseSensitive?: boolean;
}
interface FindMatch<Loc = unknown> {
  matchIndex: number;
  text: string;
  location: Loc;
}
interface FindHighlightColors {
  match?: string;
  active?: string;
}
//#endregion
//#region dist/.types-work/pptx-Bb8Ij3pP.d.ts
interface BlipBullet {
  type: 'blip';
  imagePath: string;
  mimeType: string;
  sizePct: number | null;
  sizePts?: number;
}
type Bullet = Bullet$1 | BlipBullet;
interface Paragraph extends Paragraph$1 {
  eaLnBrk: boolean;
  defTabSz?: number;
}
interface TextBody extends TextBody$1 {
  rtlCol?: boolean;
  textWarp?: {
    preset: string;
    adj?: number[];
  };
  paragraphs: Paragraph[];
}
interface Presentation {
  slideWidth: number;
  slideHeight: number;
  slides: Slide[];
  defaultTextColor: string | null;
  majorFont: string | null;
  minorFont: string | null;
  hlinkColor?: string;
  folHlinkColor?: string;
}
interface Slide {
  index: number;
  slideNumber: number;
  partName?: string;
  background: Fill | null;
  elements: SlideElement[];
  elementSources?: SlideElementSource[];
  notes?: string;
  comments?: PptxComment[];
  hidden?: boolean;
  parseError?: string;
}
type SlideElementOrigin = 'master' | 'layout' | 'slide';
interface SlideElementSource {
  origin: SlideElementOrigin;
}
interface DimOptions {
  color: string;
  opacity: number;
}
interface PptxComment {
  author?: string;
  date?: string;
  text: string;
}
type SlideElement = ShapeElement | PictureElement | TableElement | ChartElement | MediaElement;
interface MediaElement {
  type: 'media';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  mediaKind: 'audio' | 'video';
  posterPath: string;
  posterMimeType: string;
  mediaPath: string;
  mimeType: string;
}
interface ShapeElement {
  type: 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  geometry: string;
  fill: Fill | null;
  stroke: Stroke | null;
  textBody: TextBody | null;
  defaultTextColor: string | null;
  custGeom: PathCmd[][] | null;
  adj: number | null;
  adj2: number | null;
  adj3: number | null;
  adj4: number | null;
  adj5: number | null;
  adj6: number | null;
  adj7: number | null;
  adj8: number | null;
  shadow: Shadow | null;
  innerShadow?: Shadow;
  glow?: Glow;
  softEdge?: SoftEdge;
  reflection?: Reflection;
  textRect?: TextRect;
  scene3d?: Scene3d;
  sp3d?: Sp3d;
  id?: string;
  name?: string;
  hyperlink?: string;
  hyperlinkAction?: string;
}
interface TextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Rot3d {
  lat: number;
  lon: number;
  rev: number;
}
interface Camera3d {
  prst: string;
  fov?: number;
  zoom?: number;
  rot?: Rot3d;
}
interface LightRig {
  rig: string;
  dir: string;
  rot?: Rot3d;
}
interface Scene3d {
  camera: Camera3d;
  lightRig?: LightRig;
}
interface Bevel3d {
  w: number;
  h: number;
  prst: string;
}
interface Sp3d {
  z?: number;
  extrusionH?: number;
  contourW?: number;
  contourClr?: string;
  extrusionClr?: string;
  prstMaterial: string;
  bevelT?: Bevel3d;
  bevelB?: Bevel3d;
}
interface TableElement {
  type: 'table';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  cols: number[];
  rows: TableRow[];
  rtl?: boolean;
}
interface TableRow {
  height: number;
  cells: TableCell[];
}
interface TableCell {
  textBody: TextBody | null;
  fill: Fill | null;
  textColor?: string;
  borderL: Stroke | null;
  borderR: Stroke | null;
  borderT: Stroke | null;
  borderB: Stroke | null;
  diagonalTL?: Stroke | null;
  diagonalTR?: Stroke | null;
  gridSpan: number;
  rowSpan: number;
  hMerge: boolean;
  vMerge: boolean;
}
interface ChartElement {
  type: 'chart';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  chart: ChartModel;
}
interface PictureElement {
  type: 'picture';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  imagePath: string;
  mimeType: string;
  svgImagePath?: string;
  intrinsicWidthPx?: number;
  intrinsicHeightPx?: number;
  stroke: Stroke | null;
  prstGeom?: string;
  prstAdjust?: number[];
  srcRect?: {
    l: number;
    t: number;
    r: number;
    b: number;
  };
  alpha?: number;
  duotone?: Duotone;
  custGeom?: PathCmd[][] | null;
  shadow?: Shadow;
  innerShadow?: Shadow;
  glow?: Glow;
  softEdge?: SoftEdge;
  reflection?: Reflection;
  scene3d?: Scene3d;
  sp3d?: Sp3d;
}
interface PptxTextRunInfo {
  elementIndex?: number;
  origin?: SlideElementOrigin;
  shapeId?: string;
  text: string;
  inShapeX: number;
  inShapeY: number;
  w: number;
  h: number;
  fontSize: number;
  font: string;
  shapeX: number;
  shapeY: number;
  shapeW: number;
  shapeH: number;
  rotation: number;
  textBodyRotation?: number;
  hyperlink?: HyperlinkTarget;
}
type TextRunCallback = (run: PptxTextRunInfo) => void;
type SlideRenderOptions = RenderOptions & {
  math?: MathRenderer;
  dim?: DimOptions;
};
declare function renderSlide(canvas: HTMLCanvasElement | OffscreenCanvas, slide: Slide, slideWidth: number, slideHeight: number, opts?: SlideRenderOptions, onTextRun?: TextRunCallback): Promise<HTMLCanvasElement | OffscreenCanvas>;
interface PptxMatchLocation {
  slide: number;
}
interface PresentationHandle {
  play(mediaPath?: string): void;
  pause(mediaPath?: string): void;
  destroy(): void;
}
interface PptxSelectionRunLocator {
  readonly slideIndex: number;
  readonly runIndex: number;
  readonly shapeId?: string;
  readonly elementIndex?: number;
  readonly origin?: SlideElementOrigin;
}
interface PptxTextSelectionContext {
  readonly format: 'pptx';
  readonly kind: 'text';
  readonly text: string;
  readonly slideIndexes: readonly number[];
  readonly shapeIds: readonly string[];
  readonly runs: readonly PptxSelectionRunLocator[];
  readonly truncated: boolean;
  readonly truncationReasons: readonly ('text' | 'runs')[];
  readonly textCharacters: number;
  readonly maxTextCharacters: number;
  readonly maxRunLocators: number;
}
declare function readPptxTextSelectionContext(root: HTMLElement, selection: Selection | null, options?: TextSelectionContextOptions): PptxTextSelectionContext | null;
type PptxSelectionContextOptions = TextSelectionContextOptions;
interface PptxSlidePoint {
  readonly x: number;
  readonly y: number;
}
interface PptxElementContextOptions {
  readonly tolerance?: number;
  readonly maxTextCharacters?: number;
}
interface PptxElementContext {
  readonly format: 'pptx';
  readonly kind: 'element';
  readonly slideIndex: number;
  readonly elementIndex: number;
  readonly origin: SlideElementOrigin | 'unknown';
  readonly elementType: SlideElement['type'];
  readonly point: PptxSlidePoint;
  readonly bounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    flipH: boolean;
    flipV: boolean;
  }>;
  readonly shapeId?: string;
  readonly name?: string;
  readonly geometry?: string;
  readonly text?: string;
  readonly mimeType?: string;
  readonly mediaKind?: 'audio' | 'video';
  readonly rowCount?: number;
  readonly columnCount?: number;
  readonly seriesCount?: number;
  readonly truncated: boolean;
  readonly truncationReasons: readonly ('text')[];
  readonly textCharacters: number;
  readonly maxTextCharacters: number;
}
type PptxSelectionContext = PptxTextSelectionContext | PptxElementContext;
type LoadOptions = LoadOptions$1 & {
  mode?: 'main' | 'worker';
};
interface RenderSlideToBitmapOptions {
  width?: number;
  dpr?: number;
  dim?: DimOptions;
  onTextRun?: TextRunCallback;
}
interface RenderSlideOptions {
  width?: number;
  dpr?: number;
  onTextRun?: TextRunCallback;
  skipMediaControls?: boolean;
  dim?: DimOptions;
}
interface PresentSlideOptions extends Omit<RenderSlideOptions, 'skipMediaControls'> {
  onError?: (error: Error) => void;
}
declare class PptxPresentation {
  private _metrics;
  private readonly _worker;
  private readonly _bridge;
  private _mode;
  private _preflight;
  private _slides;
  private _slidePullClient;
  private _resourceFailure;
  private _slidePartIndex;
  private readonly _rawParts;
  private _googleFontFaces;
  private readonly _fetchImage;
  private readonly _fetchMedia;
  private _math;
  private constructor();
  private _assertResourceHealthy;
  private _rethrowWithResourceFailure;
  static load(source: string | ArrayBuffer, opts?: LoadOptions): Promise<PptxPresentation>;
  private _parse;
  get slideCount(): number;
  get slideWidth(): number;
  get slideHeight(): number;
  get mode(): 'main' | 'worker';
  getNotes(slideIndex: number): string | null;
  isHidden(slideIndex: number): boolean;
  private _partNames;
  private _partIndex;
  getSlideIndexByPartName(partName: string): number | undefined;
  resolveInternalTarget(ref: string, currentIndex?: number): number | undefined;
  renderSlide(canvas: HTMLCanvasElement | OffscreenCanvas, slideIndex: number, opts?: RenderSlideOptions): Promise<void>;
  renderSlideToBitmap(slideIndex: number, opts?: RenderSlideToBitmapOptions): Promise<ImageBitmap>;
  collectSlideRuns(slideIndex: number, width?: number): Promise<PptxTextRunInfo[]>;
  getElementContextAt(slideIndex: number, point: PptxSlidePoint, options?: PptxElementContextOptions): Promise<PptxElementContext | null>;
  getMedia(mediaPath: string): Promise<Blob>;
  private _findMimeTypeForPath;
  getImage(imagePath: string, mimeType: string): Promise<Blob>;
  getResourceMetrics(): Promise<OoxmlResourceMetrics>;
  toMarkdown(): Promise<string>;
  presentSlide(canvas: HTMLCanvasElement, slideIndex: number, opts?: PresentSlideOptions): Promise<PresentationHandle>;
  destroy(): void;
}
type HiddenSlideMode = 'show' | 'skip' | 'dim';
interface PptxViewerOptions extends Pick<RenderOptions, 'width' | 'dpr'>, LoadOptions {
  onSlideChange?: (index: number, total: number) => void;
  onError?: (err: Error) => void;
  zoomMin?: number;
  zoomMax?: number;
  onScaleChange?: (scale: number) => void;
  enableMediaPlayback?: boolean;
  enableTextSelection?: boolean;
  enableElementSelection?: boolean;
  elementHitTolerance?: number;
  onSelectionContextChange?: (context: PptxSelectionContext | null) => void;
  onContextMenu?: (event: ViewerContextMenuEvent<PptxSelectionContext>) => void;
  findHighlightColors?: FindHighlightColors;
  hiddenSlideMode?: HiddenSlideMode;
  hiddenSlideDim?: Partial<DimOptions>;
  onHyperlinkClick?: (target: HyperlinkTarget) => void;
  enableHyperlinks?: boolean;
}
declare class PptxViewer implements ZoomableViewer {
  private readonly canvas;
  private readonly wrapper;
  private readonly canvasMount;
  private _scale;
  private textLayer;
  private highlightLayer;
  private elementLayer;
  private _find;
  private _measureCtx;
  private readonly presentationOwner;
  private get engine();
  private readonly borrowed;
  private readonly hostWindow;
  private readonly opts;
  private currentSlide;
  private _hiddenMode;
  private handle;
  private readonly _mode;
  private readonly renderDispatcher;
  private readonly errorRouter;
  private destroyed;
  private selectionChangeListener;
  private selectionContextKey;
  private elementClickListener;
  private contextMenuListener;
  private elementContext;
  private elementHitGeneration;
  private readonly elementHitTolerance;
  static fromPresentation(canvas: HTMLCanvasElement, presentation: PptxPresentation, opts?: Omit<PptxViewerOptions, keyof LoadOptions>): Omit<PptxViewer, 'load'>;
  constructor(canvas: HTMLCanvasElement, opts?: PptxViewerOptions);
  load(source: string | ArrayBuffer): Promise<void>;
  goToSlide(index: number): Promise<void>;
  nextSlide(): Promise<void>;
  prevSlide(): Promise<void>;
  private _step;
  private _initialSlide;
  private _dim;
  setHiddenSlideMode(mode: HiddenSlideMode): Promise<void>;
  get hiddenSlideMode(): HiddenSlideMode;
  get visibleSlideCount(): number;
  get slideIndex(): number;
  get slideCount(): number;
  getNotes(slideIndex: number): string | null;
  get canvasElement(): HTMLCanvasElement;
  private _naturalWidthPx;
  private _targetWidth;
  getScale(): number;
  private _zoomMin;
  private _zoomMax;
  setScale(scale: number): Promise<void>;
  zoomIn(): Promise<void>;
  zoomOut(): Promise<void>;
  fitWidth(): Promise<void>;
  fitPage(): Promise<void>;
  private _fit;
  private renderCurrentSlide;
  private _buildHighlightLayer;
  private _measureForFont;
  private _collectSlideRuns;
  findText(query: string, opts?: FindMatchesOptions): Promise<FindMatch<PptxMatchLocation>[]>;
  findNext(): Promise<FindMatch<PptxMatchLocation> | null>;
  findPrev(): Promise<FindMatch<PptxMatchLocation> | null>;
  clearFind(): void;
  private _activateMatch;
  private _redrawHighlights;
  private _buildTextLayer;
  private _hyperlinkHandler;
  private _onHyperlinkClick;
  private _resolveInternalSlideIndex;
  private _reportRenderError;
  getResourceMetrics(): Promise<OoxmlResourceMetrics>;
  getSelectionContext(options?: PptxSelectionContextOptions): PptxSelectionContext | null;
  private _emitSelectionContextChange;
  private _setElementContext;
  private _invalidateElementSelection;
  private _redrawElementOutline;
  private _onElementClick;
  private _onContextMenu;
  private _resolveContextAt;
  destroy(): void;
}
interface PptxScrollViewerOptions extends Pick<RenderSlideOptions, 'width' | 'dpr'>, LoadOptions {
  width?: number;
  gap?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  overscan?: number;
  enableTextSelection?: boolean;
  enableElementSelection?: boolean;
  elementHitTolerance?: number;
  onSelectionContextChange?: (context: PptxSelectionContext | null) => void;
  onContextMenu?: (event: ViewerContextMenuEvent<PptxSelectionContext>) => void;
  findHighlightColors?: FindHighlightColors;
  enableMediaPlayback?: boolean;
  mediaOverscan?: number;
  zoomMin?: number;
  zoomMax?: number;
  enableZoom?: boolean;
  refitOnResize?: boolean;
  background?: string;
  pageShadow?: string | false;
  onVisibleSlideChange?: (topIndex: number, total: number) => void;
  onScaleChange?: (scale: number) => void;
  onError?: (err: Error) => void;
  onHyperlinkClick?: (target: HyperlinkTarget) => void;
  enableHyperlinks?: boolean;
}
declare class PptxScrollViewer implements ZoomableViewer {
  private readonly _presentationOwner;
  private get _pres();
  private readonly _borrowed;
  private readonly _opts;
  private readonly _container;
  private readonly _wrapper;
  private readonly _scrollHost;
  private readonly _spacer;
  private _mode;
  private _scale;
  private _scaleEstablished;
  private _pendingScale;
  private readonly _slots;
  private readonly _free;
  private _heights;
  private _lastRange;
  private _lastTopIndex;
  private _scrollListener;
  private _selectionChangeListener;
  private _selectionContextKey;
  private _elementClickListener;
  private _contextMenuListener;
  private _elementContext;
  private _elementHitGeneration;
  private readonly _elementHitTolerance;
  private _destroyed;
  private readonly _slideInFlight;
  private _renderEpoch;
  private _settleTimer;
  private _wheelListener;
  private _pendingZoomAnchor;
  private _resizeObserver;
  private _prevBase;
  private _lastFitWidth;
  private readonly _pageShadow;
  private readonly _find;
  private _findActive;
  private _findMeasureCtx;
  static fromPresentation(container: HTMLElement, presentation: PptxPresentation, opts?: Omit<PptxScrollViewerOptions, keyof LoadOptions>): Omit<PptxScrollViewer, 'load'>;
  constructor(container: HTMLElement, opts?: PptxScrollViewerOptions);
  load(source: string | ArrayBuffer): Promise<void>;
  get slideCount(): number;
  private _slideWidthPx;
  private _slideHeightPx;
  private _fitWidthPx;
  private _baseScale;
  relayout(): void;
  private _relayout;
  private _recomputeHeights;
  private _gap;
  private _overscan;
  private _mediaOverscan;
  private _pad;
  private _padH;
  private _slideIndexAtOffset;
  private _range;
  private _mediaRange;
  private _rangeContains;
  private _syncSpacer;
  private _syncSpacerWidth;
  private _onScroll;
  private _mountVisible;
  private _applyPageShadow;
  private _acquireSlot;
  private _recycleSlot;
  private _positionSlot;
  private _dpr;
  private _renderSlot;
  private _renderInteractiveSlot;
  private _syncMediaPlayback;
  private _reportRenderError;
  private _renderSlotBitmap;
  setScale(scale: number): void;
  getScale(): number;
  zoomIn(): void;
  zoomOut(): void;
  fitWidth(): void;
  fitPage(): void;
  private _fit;
  private _previewVisible;
  private _previewSlot;
  private _scheduleSettle;
  private _settleRender;
  private _settleSlot;
  private _settleInteractiveSlot;
  scrollToSlide(index: number, opts?: {
    behavior?: 'auto' | 'smooth';
  }): void;
  findText(query: string, opts?: FindMatchesOptions): Promise<FindMatch<PptxMatchLocation>[]>;
  findNext(): Promise<FindMatch<PptxMatchLocation> | null>;
  findPrev(): Promise<FindMatch<PptxMatchLocation> | null>;
  clearFind(): void;
  private _activateMatch;
  private _collectSlideRuns;
  private _redrawHighlights;
  private _refreshFindRuns;
  private _redrawSlotHighlights;
  private _measureForFind;
  private _hyperlinkHandler;
  private _onHyperlinkClick;
  private _resolveInternalSlideIndex;
  private _onResize;
  get topVisibleSlide(): number;
  getResourceMetrics(): Promise<OoxmlResourceMetrics>;
  getSelectionContext(options?: PptxSelectionContextOptions): PptxSelectionContext | null;
  private _emitSelectionContextChange;
  private _setElementContext;
  private _invalidateElementSelection;
  private _redrawElementOutlines;
  private _redrawElementOutlineForSlot;
  private _onElementClick;
  private _onContextMenu;
  private _resolveContextAt;
  destroy(): void;
}
declare function buildPptxTextLayer(layer: HTMLDivElement, runs: PptxTextRunInfo[], cssWidth: number, cssHeight: number, onHyperlinkClick?: (target: HyperlinkTarget) => void, slideIndex?: number): void;
interface PptxHighlightMatch {
  slices: MatchRunSlice[];
  active: boolean;
}
type PptxHighlightColors = FindHighlightColors;
declare function buildPptxHighlightLayer(layer: HTMLDivElement, runs: PptxTextRunInfo[], matches: PptxHighlightMatch[], cssWidth: number, cssHeight: number, measureForFont: (font: string) => (s: string) => number, colors?: PptxHighlightColors): void;
//#endregion
export { type ArrowEnd, type AutoResizeOptions, type Bevel3d, type BlipBullet, type Bullet, type Camera3d, type ChartDataLabelOverride, type ChartDataPointOverride, type ChartElement, type ChartErrBars, type ChartExElementStyle, type ChartLabelBox, type ChartManualLayout, type ChartModel, type ChartRect, type ChartSeries, type ChartSeriesDataLabels, type ChartTextBox, type ChartTextParagraph, type ChartTextRun, type ChartTrendline, type ChartType, type ChartexBoxSeries, type ChartexBoxWhisker, type ChartexSunburst, type ChartexSunburstRow, type ChartexTreemap, type DimOptions, type Duotone, type EquationRun, type Fill, type FillRect, type FindHighlightColors, type FindMatch, type FindMatchesOptions, type Glow, type GradientFill, type GradientStop, type HiddenSlideMode, type HyperlinkTarget, type ImageFill, type LegendManualLayout, type LightRig, type LineBreak, type LoadOptions, type MatchRunSlice, type MathAccent, type MathArray, type MathBar, type MathBorderBox, type MathBox, type MathDelimiter, type MathFraction, type MathFunc, type MathGroup, type MathGroupChr, type MathLimit, type MathNary, type MathNode, type MathPhant, type MathRadical, type MathRenderer, type MathRun, type MathSPre, type MathScript, type MathStyle, type MathSvg, type MediaElement, type NoFill, OoxmlDecodedImageLimitError, type OoxmlDecodedImageLimitMetric, OoxmlError, type OoxmlErrorCode, type OoxmlErrorStage, type OoxmlFormat, type OoxmlResourceLimit, OoxmlResourceLimitError, type OoxmlResourceLimitErrorDetails, type OoxmlResourceLimits, type OoxmlResourceMetric, type OoxmlResourceMetrics, type OoxmlResourceMetricsCheckpoint, type OoxmlResourceName, type OoxmlResourcePolicySnapshot, type OoxmlResourceUsageSnapshot, type OoxmlResourceViolation, type Paragraph, type PathCmd, type PatternFill, type PictureElement, type PptxComment, type PptxElementContext, type PptxElementContextOptions, type PptxHighlightColors, type PptxHighlightMatch, type PptxMatchLocation, PptxPresentation, PptxScrollViewer, type PptxScrollViewerOptions, type PptxSelectionContext, type PptxSelectionContextOptions, type PptxSelectionRunLocator, type PptxSlidePoint, type PptxTextRunInfo, type PptxTextSelectionContext, PptxViewer, type PptxViewerOptions, type PresentSlideOptions, type Presentation, type PresentationHandle, type Reflection, type RenderOptions, type RenderSlideOptions, type RenderSlideToBitmapOptions, type Rot3d, type Scene3d, type SecondaryValueAxis, type Shadow, type ShapeElement, type Slide, type SlideElement, type SlideElementOrigin, type SlideElementSource, type SlideRenderOptions, type SoftEdge, type SolidFill, type Sp3d, type SpaceLine, type Stroke, type TabStop, type TableCell, type TableElement, type TableRow, type TextBody, type TextOutline, type TextRect, type TextRun, type TextRunCallback, type TextRunData, type TextSelectionContextOptions, type TileInfo, type ViewerContextMenuEvent, type ZoomableViewer, autoResize, buildPptxHighlightLayer, buildPptxTextLayer, isOoxmlDecodedImageLimitError, openExternalHyperlink, readPptxTextSelectionContext, renderSlide };