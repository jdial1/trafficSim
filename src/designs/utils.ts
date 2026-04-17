export function fillRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color?: string) {
  if (color) ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export function strokeRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
}

export function bothRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, lw?: number) {
  if (fill) ctx.fillStyle = fill;
  if (stroke) ctx.strokeStyle = stroke;
  if (lw !== undefined) ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

export function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color?: string) {
  if (color) ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function fillArc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color?: string) {
  if (color) ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function strokeArc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

export function polyFill(ctx: CanvasRenderingContext2D, pts: number[][], color?: string) {
  if (color) ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

export function polyStroke(ctx: CanvasRenderingContext2D, pts: number[][], close: boolean, color?: string, lw?: number) {
  if (color) ctx.strokeStyle = color;
  if (lw !== undefined) ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
  ctx.stroke();
}

export function polyBoth(ctx: CanvasRenderingContext2D, pts: number[][], fill?: string, stroke?: string, lw?: number) {
  if (fill) ctx.fillStyle = fill;
  if (stroke) ctx.strokeStyle = stroke;
  if (lw !== undefined) ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function strokeVerticals(ctx: CanvasRenderingContext2D, xs: number[], y0: number, y1: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  for (const x of xs) {
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
  }
}
