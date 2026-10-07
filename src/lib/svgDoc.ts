/**
 * The drawing surface the saved PDF and the Print page share. pdf.ts only ever talks to a
 * `DrawDoc`; jsPDF is one of them (it writes the PDF) and `SvgDoc` is the other (it writes
 * the same pages as SVG for the Print screen), so the two can never drift apart. Text is
 * always measured with jsPDF's real Helvetica metrics, in both cases.
 */

export type RGB = [number, number, number]

/** The handful of drawing calls pdf.ts uses. jsPDF's own document satisfies this as it is. */
export interface DrawDoc {
  setFont(name: string, style?: string): unknown
  setFontSize(size: number): unknown
  setTextColor(r: number, g: number, b: number): unknown
  setFillColor(r: number, g: number, b: number): unknown
  setDrawColor(r: number, g: number, b: number): unknown
  setLineWidth(w: number): unknown
  setLineDashPattern(pattern: number[], phase: number): unknown
  text(text: string, x: number, y: number, opts?: { align?: 'left' | 'center' | 'right'; angle?: number }): unknown
  getTextWidth(text: string): number
  splitTextToSize(text: string, maxW: number): string | string[]
  rect(x: number, y: number, w: number, h: number, style?: string): unknown
  circle(x: number, y: number, r: number, style?: string): unknown
  line(x1: number, y1: number, x2: number, y2: number): unknown
  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style?: string): unknown
  addPage(): unknown
  getNumberOfPages(): number
  setPage(n: number): unknown
}

/** What SvgDoc needs from jsPDF: only its text measuring. */
interface Measurer {
  setFont(name: string, style?: string): unknown
  setFontSize(size: number): unknown
  getTextWidth(text: string): number
  splitTextToSize(text: string, maxW: number): string | string[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const rgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`
const num = (n: number) => String(Math.round(n * 1000) / 1000)
const PT = 0.3528

export class SvgDoc implements DrawDoc {
  private pages: string[][] = [[]]
  private current = 0
  private bold = false
  private size = 10
  private textColor: RGB = [0, 0, 0]
  private fill: RGB = [255, 255, 255]
  private stroke: RGB = [0, 0, 0]
  private lineWidth = 0.2
  private dash: number[] = []

  constructor(
    private readonly measure: Measurer,
    private readonly pageW: number,
    private readonly pageH: number,
  ) {
    this.pages[0].push(`<rect x="0" y="0" width="${pageW}" height="${pageH}" fill="#fff"/>`)
  }

  setFont(_name: string, style?: string) {
    this.bold = style === 'bold'
    return this
  }
  setFontSize(size: number) {
    this.size = size
    return this
  }
  setTextColor(r: number, g: number, b: number) {
    this.textColor = [r, g, b]
    return this
  }
  setFillColor(r: number, g: number, b: number) {
    this.fill = [r, g, b]
    return this
  }
  setDrawColor(r: number, g: number, b: number) {
    this.stroke = [r, g, b]
    return this
  }
  setLineWidth(w: number) {
    this.lineWidth = w
    return this
  }
  setLineDashPattern(pattern: number[]) {
    this.dash = pattern
    return this
  }

  getTextWidth(text: string): number {
    this.measure.setFont('helvetica', this.bold ? 'bold' : 'normal')
    this.measure.setFontSize(this.size)
    return this.measure.getTextWidth(text)
  }
  splitTextToSize(text: string, maxW: number): string | string[] {
    this.measure.setFont('helvetica', this.bold ? 'bold' : 'normal')
    this.measure.setFontSize(this.size)
    return this.measure.splitTextToSize(text, maxW)
  }

  private paint(style: string | undefined): string {
    const f = style?.includes('F') ? rgb(this.fill) : 'none'
    const s = style === undefined || style.includes('S') || style.includes('D') ? rgb(this.stroke) : 'none'
    const dash = this.dash.length > 0 && s !== 'none' ? ` stroke-dasharray="${this.dash.map(num).join(' ')}"` : ''
    return `fill="${f}" stroke="${s}" stroke-width="${num(this.lineWidth)}"${dash}`
  }
  private add(svg: string) {
    this.pages[this.current].push(svg)
  }

  text(text: string, x: number, y: number, opts?: { align?: 'left' | 'center' | 'right'; angle?: number }) {
    const anchor = opts?.align === 'center' ? 'middle' : opts?.align === 'right' ? 'end' : 'start'
    // jsPDF turns a rotated text counter-clockwise, which is SVG's negative angle.
    const rot = opts?.angle ? ` transform="rotate(${-opts.angle} ${num(x)} ${num(y)})"` : ''
    this.add(
      `<text x="${num(x)}" y="${num(y)}" xml:space="preserve" font-family="Helvetica, Arial, 'Liberation Sans', sans-serif" font-size="${num(this.size * PT)}" font-weight="${this.bold ? 700 : 400}" fill="${rgb(this.textColor)}" text-anchor="${anchor}"${rot}>${esc(text)}</text>`,
    )
    return this
  }
  rect(x: number, y: number, w: number, h: number, style?: string) {
    this.add(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${this.paint(style)}/>`)
    return this
  }
  circle(x: number, y: number, r: number, style?: string) {
    this.add(`<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" ${this.paint(style)}/>`)
    return this
  }
  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style?: string) {
    this.add(`<polygon points="${num(x1)},${num(y1)} ${num(x2)},${num(y2)} ${num(x3)},${num(y3)}" ${this.paint(style)}/>`)
    return this
  }
  line(x1: number, y1: number, x2: number, y2: number) {
    const dash = this.dash.length > 0 ? ` stroke-dasharray="${this.dash.map(num).join(' ')}"` : ''
    this.add(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${rgb(this.stroke)}" stroke-width="${num(this.lineWidth)}"${dash}/>`)
    return this
  }
  addPage() {
    this.pages.push([`<rect x="0" y="0" width="${this.pageW}" height="${this.pageH}" fill="#fff"/>`])
    this.current = this.pages.length - 1
    return this
  }
  getNumberOfPages() {
    return this.pages.length
  }
  setPage(n: number) {
    this.current = n - 1
    return this
  }

  /** One standalone `<svg>` per page, sized in millimetres. */
  svgPages(): string[] {
    return this.pages.map(
      (ops) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.pageW} ${this.pageH}" width="${this.pageW}mm" height="${this.pageH}mm" preserveAspectRatio="xMidYMid meet">${ops.join('')}</svg>`,
    )
  }
}
