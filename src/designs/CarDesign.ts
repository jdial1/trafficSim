import type { RenderVehicleEnv } from '../renderVehicleDesign';
import { fillRR, bothRR, fillRect, polyFill, fillArc } from './utils';

function f1RearGlow(ctx: CanvasRenderingContext2D, time: number, x: number, y: number, w: number, h: number) {
  const blink = Math.floor(time / 200) % 2 === 0;
  ctx.save();
  ctx.shadowColor = '#00FFFF';
  ctx.shadowBlur = blink ? 2 : 0.666;
  fillRect(ctx, x, y, w, h, '#F85149');
  ctx.restore();
}

export function renderCar(env: RenderVehicleEnv) {
  const { ctx, v, time, lane, isBraking, isStopped, brakeIntensity } = env;
  const tail = isBraking ? (isStopped ? 1 : 0.3 + 0.7 * Math.min(1, brakeIntensity)) : 0.4;
  const blinkL = Math.floor(time / 350) % 2 === 0 && lane?.type === 'LEFT';
  const blinkR = Math.floor(time / 350) % 2 === 0 && lane?.type === 'RIGHT';

  if (v.legendarySkin) {
    ctx.save();
    ctx.scale(1 / 3, 1 / 3);
    fillRR(ctx, 22, -27, 14, 8, 2, '#0D0F12');
    fillRR(ctx, 22, 19, 14, 8, 2);
    fillRR(ctx, -35, -27, 16, 10, 2);
    fillRR(ctx, -35, 17, 16, 10, 2);
    ctx.strokeStyle = '#1A1D23';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, -19);
    ctx.lineTo(15, -8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(26, 19);
    ctx.lineTo(15, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-28, -17);
    ctx.lineTo(-22, -8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-28, 17);
    ctx.lineTo(-22, 8);
    ctx.stroke();
    fillRR(ctx, 36, -22, 8, 44, 2, '#1A1D23');
    polyFill(ctx, [[36, -22], [42, -22], [40, -16], [36, -16]], '#F85149');
    polyFill(ctx, [[36, 22], [42, 22], [40, 16], [36, 16]]);
    polyFill(ctx, [[-30, -8], [15, -6], [40, -3], [40, 3], [15, 6], [-30, 8]]);
    polyFill(ctx, [[15, -2], [38, -1], [38, 1], [15, 2]], '#F0F6FC');
    fillRR(ctx, -20, -18, 35, 36, 4, '#F85149');
    fillRR(ctx, -15, -16, 20, 32, 2, '#0D0F12');
    fillRR(ctx, -45, -20, 12, 40, 2, '#1A1D23');
    fillRect(ctx, -42, -18, 6, 36, '#F85149');
    fillRR(ctx, -10, -6, 18, 12, 6, '#0D0F12');
    fillArc(ctx, -3, 0, 4, '#FFD700');
    f1RearGlow(ctx, time, -46, -2, 2, 4);
    ctx.globalAlpha = tail;
    fillRect(ctx, -46, -2, 2, 4, '#F85149');
    ctx.globalAlpha = 1;
    fillRect(ctx, 41, -22, 4, 10, '#FFD700');
    fillRect(ctx, 41, 12, 4, 10);
    if (blinkL) fillRect(ctx, -45, -22, 4, 10, '#FFD700');
    if (blinkR) fillRect(ctx, -45, 12, 4, 10, '#FFD700');
    ctx.restore();
    return;
  }

  if (v.rareSkin) {
    ctx.save();
    ctx.scale(1 / 3, 1 / 3);
    bothRR(ctx, -45, -27, 90, 54, 10, '#1A1D23', '#8B949E', 3);
    fillRect(ctx, -15, -27, 36, 54, '#F0F6FC');
    ctx.strokeStyle = '#2D333B';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-15, -27, 36, 54);
    bothRR(ctx, -24, -24, 12, 48, 4, '#161b22', '#8B949E', 2.25);
    bothRR(ctx, 15, -24, 16, 48, 4, '#161b22', '#8B949E', 2.25);
    fillArc(ctx, 1, 0, 6, 'rgba(210,153,34,0.8)');
    bothRR(ctx, 44, -14, 4, 28, 2, '#2D333B', '#8B949E', 1.5);
    bothRR(ctx, 46, -10, 3, 20, 1, '#161b22');
    bothRR(ctx, -3, -20, 6, 40, 2, '#161b22', '#2D333B', 1.5);
    fillRR(ctx, -2, -18, 4, 14, 1, '#F85149');
    fillRR(ctx, -2, 4, 4, 14, 1, '#58A6FF');
    ctx.globalAlpha = tail;
    fillRR(ctx, -45, -22, 4, 10, 1, '#F85149');
    fillRR(ctx, -45, 12, 4, 10, 1);
    ctx.globalAlpha = 1;
    fillRR(ctx, 41, -22, 4, 10, 1, '#FFD700');
    fillRR(ctx, 41, 12, 4, 10, 1);
    if (blinkL) fillRR(ctx, -45, -22, 4, 10, 1, '#FFD700');
    if (blinkR) fillRR(ctx, -45, 12, 4, 10, 1, '#FFD700');
    ctx.restore();
    return;
  }

  bothRR(ctx, -15, -9, 30, 18, 3.33, v.color, '#1A1D23', 0.33);
  fillRR(ctx, -8, -8, 14, 16, 0.66, 'rgba(255,255,255,0.1)');
  fillRR(ctx, -11.66, -8, 4.66, 16, 1.33, '#1A1D23');
  fillRR(ctx, 5, -8, 6.66, 16, 1.33, '#1A1D23');

  ctx.globalAlpha = tail;
  fillRR(ctx, -15, -7.33, 1.33, 3.33, 0.33, '#F85149');
  fillRR(ctx, -15, 4, 1.33, 3.33, 0.33);
  ctx.globalAlpha = 1;

  fillRR(ctx, 13.66, -7.33, 1.33, 3.33, 0.33, '#FFD700');
  fillRR(ctx, 13.66, 4, 1.33, 3.33, 0.33);

  if (blinkL) fillRR(ctx, -15, -7.33, 1.33, 3.33, 0.33, '#FFD700');
  if (blinkR) fillRR(ctx, -15, 4, 1.33, 3.33, 0.33, '#FFD700');
}
