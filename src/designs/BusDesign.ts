import type { RenderVehicleEnv } from '../renderVehicleDesign';
import { fillRR, bothRR, fillRect, fillArc, polyBoth, strokeRR } from './utils';

function drawSchoolBusHull(ctx: CanvasRenderingContext2D) {
  const p = new Path2D(`M -90 -30 L 60 -30 L 60 -20 L 86 -20 A 4 4 0 0 1 90 -16 L 90 16 A 4 4 0 0 1 86 20 L 60 20 L 60 30 L -90 30 Z`);
  ctx.fillStyle = '#ffcc00';
  ctx.strokeStyle = '#1A1D23';
  ctx.lineWidth = 1;
  ctx.fill(p);
  ctx.stroke(p);
}

function drawMaglevBodyStack(ctx: CanvasRenderingContext2D) {
  const body = new Path2D(`M -90 -26 L 50 -26 A 40 26 0 0 1 90 0 A 40 26 0 0 1 50 26 L -90 26 Z`);
  ctx.fillStyle = '#F0F6FC';
  ctx.strokeStyle = '#1A1D23';
  ctx.lineWidth = 1;
  ctx.fill(body);
  ctx.stroke(body);
  const upperSkirt = new Path2D(`M -90 -26 L 50 -26 A 40 26 0 0 1 90 0 L -90 0 Z`);
  ctx.fillStyle = '#E6EDF5';
  ctx.fill(upperSkirt);
  ctx.fillStyle = '#2D333B';
  ctx.fillRect(-90, -30, 140, 4);
  ctx.fillRect(-90, 26, 140, 4);
  const canopy = new Path2D(`M -70 -18 L 40 -18 A 25 18 0 0 1 75 0 A 25 18 0 0 1 40 18 L -70 18 Z`);
  ctx.fillStyle = '#0D0F12';
  ctx.strokeStyle = '#2D333B';
  ctx.lineWidth = 1;
  ctx.fill(canopy);
  ctx.stroke(canopy);
  const hi = new Path2D(`M -60 -14 L 30 -14 A 18 14 0 0 1 60 0 L -60 0 Z`);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill(hi);
}

function maglevGlowStroke(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.shadowColor = '#00FFFF';
  ctx.shadowBlur = 10 / 3;
  strokeRR(ctx, -85, -25, 170, 50, 25, 'rgba(0,255,255,0.5)', 6);
  ctx.restore();
}

export function renderBus(env: RenderVehicleEnv) {
  const { ctx, v, time, lane, isBraking, isStopped, brakeIntensity } = env;
  const tail = isBraking ? (isStopped ? 1 : 0.3 + 0.7 * Math.min(1, brakeIntensity)) : 0.4;
  const blinkL = Math.floor(time / 350) % 2 === 0 && lane?.type === 'LEFT';
  const blinkR = Math.floor(time / 350) % 2 === 0 && lane?.type === 'RIGHT';

  if (v.legendarySkin) {
    ctx.save();
    ctx.scale(1 / 3, 1 / 3);
    maglevGlowStroke(ctx);
    drawMaglevBodyStack(ctx);
    fillRR(ctx, -50, -6, 20, 12, 2, '#1A1D23');
    fillRR(ctx, -10, -6, 20, 12, 2);
    fillRR(ctx, -94, -16, 8, 10, 2);
    fillRR(ctx, -94, 6, 8, 10, 2);
    ctx.save();
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 8 / 3;
    polyBoth(ctx, [[-94, -14], [-106, -11], [-94, -8]], '#00FFFF');
    polyBoth(ctx, [[-94, 8], [-106, 11], [-94, 14]]);
    ctx.restore();
    ctx.globalAlpha = tail;
    fillRR(ctx, -90, -26, 4, 8, 1, '#F85149');
    fillRR(ctx, -90, 18, 4, 8, 1);
    ctx.globalAlpha = 1;
    fillArc(ctx, 86, -14, 3.5, '#FFD700');
    fillArc(ctx, 86, 14, 3.5);
    if (blinkL) fillRR(ctx, -90, -26, 4, 8, 1, '#FFD700');
    if (blinkR) fillRR(ctx, -90, 18, 4, 8, 1, '#FFD700');
    ctx.restore();
    return;
  }

  if (v.rareSkin) {
    ctx.save();
    ctx.scale(1 / 3, 1 / 3);
    drawSchoolBusHull(ctx);
    bothRR(ctx, -80, -24, 135, 48, 4, '#F0F6FC', '#1A1D23', 1);
    fillRect(ctx, -85, -28, 140, 2, '#1A1D23');
    fillRect(ctx, -85, 26, 140, 2);
    polyBoth(ctx, [[10, -30], [15, -30], [18, -33], [18, -38], [15, -41], [10, -41], [7, -38], [7, -33]], '#F85149', '#F0F6FC', 1);
    fillRect(ctx, 10, -30, 2, 3, '#1A1D23');
    fillRR(ctx, -86, -24, 6, 48, 2);
    fillRR(ctx, 58, -28, 8, 56, 2);
    bothRR(ctx, -50, -10, 16, 20, 2, '#C9D1D9', '#2D333B', 1);
    bothRR(ctx, 10, -10, 16, 20, 2);
    ctx.globalAlpha = tail;
    fillRR(ctx, -90, -26, 4, 8, 1, '#F85149');
    fillRR(ctx, -90, 18, 4, 8, 1);
    ctx.globalAlpha = 1;
    fillArc(ctx, 86, -14, 3.5, '#FFD700');
    fillArc(ctx, 86, 14, 3.5);
    if (blinkL) fillRR(ctx, -90, -26, 4, 8, 1, '#FFD700');
    if (blinkR) fillRR(ctx, -90, 18, 4, 8, 1, '#FFD700');
    ctx.restore();
    return;
  }

  bothRR(ctx, -30, -10, 60, 20, 2.66, v.color, '#1A1D23', 0.33);
  fillRR(ctx, -26.66, -8.66, 53.33, 17.33, 1.33, 'rgba(0,0,0,0.15)');
  fillRR(ctx, -25, -9.33, 50, 1.33, 0.5, '#1A1D23');
  fillRR(ctx, -25, 8, 50, 1.33, 0.5);
  fillRR(ctx, -29.33, -8, 2, 16, 0.66);
  fillRR(ctx, 24, -9.33, 4.66, 18.66, 1);
  bothRR(ctx, -15, -6, 10, 12, 1, '#2D333B', '#1A1D23', 0.33);
  fillArc(ctx, -10, 0, 4, '#1A1D23');
  bothRR(ctx, 5, -6, 10, 12, 1, '#2D333B', '#1A1D23', 0.33);
  fillArc(ctx, 10, 0, 4, '#1A1D23');

  ctx.globalAlpha = tail;
  fillRR(ctx, -29.66, -8.66, 1.33, 3.33, 0.33, '#F85149');
  fillRR(ctx, -29.66, 5.33, 1.33, 3.33, 0.33);
  ctx.globalAlpha = 1;

  fillRR(ctx, 28.33, -8.66, 1.33, 3.33, 0.33, '#FFD700');
  fillRR(ctx, 28.33, 5.33, 1.33, 3.33, 0.33);

  if (blinkL) fillRR(ctx, -29.66, -8.66, 1.33, 3.33, 0.33, '#FFD700');
  if (blinkR) fillRR(ctx, -29.66, 5.33, 1.33, 3.33, 0.33, '#FFD700');
}
