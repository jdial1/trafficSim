import type { RenderVehicleEnv } from '../renderVehicleDesign';
import { fillRR, bothRR, fillRect, fillArc, strokeArc, strokeVerticals } from './utils';

function fireBeaconBlock(ctx: CanvasRenderingContext2D, time: number) {
  const flash = Math.floor(time / 250) % 2 === 0;
  ctx.save();
  ctx.shadowBlur = 8 / 3;
  fillRR(ctx, 40, -26, 6, 52, 2, '#0D0F12');
  ctx.shadowColor = flash ? '#F85149' : '#58A6FF';
  fillRR(ctx, 41, -25, 4, 18, 1, flash ? '#F85149' : '#58A6FF');
  ctx.shadowColor = flash ? '#58A6FF' : '#F85149';
  fillRR(ctx, 41, 7, 4, 18, 1, flash ? '#58A6FF' : '#F85149');
  ctx.shadowColor = '#F85149';
  fillRR(ctx, -68, -28, 4, 6, 1, '#F85149');
  ctx.shadowColor = '#58A6FF';
  fillRR(ctx, -68, 22, 4, 6, 1, '#58A6FF');
  ctx.restore();
}

export function renderTruck(env: RenderVehicleEnv) {
  const { ctx, v, time, lane, isBraking, isStopped, brakeIntensity } = env;
  const tail = isBraking ? (isStopped ? 1 : 0.3 + 0.7 * Math.min(1, brakeIntensity)) : 0.4;
  const blinkL = Math.floor(time / 350) % 2 === 0 && lane?.type === 'LEFT';
  const blinkR = Math.floor(time / 350) % 2 === 0 && lane?.type === 'RIGHT';

  if (v.legendarySkin) {
    ctx.save();
    ctx.scale(1 / 3, 1 / 3);
    bothRR(ctx, -67.5, -28, 135, 56, 4, '#D7263D', '#1A1D23', 1);
    fillRect(ctx, -70, -24, 4, 48, '#8B949E');
    bothRR(ctx, 35, -24, 30, 48, 4, '#F0F6FC', '#1A1D23', 1);
    fillRR(ctx, 42, -22, 16, 44, 2, 'rgba(0,0,0,0.1)');
    fillRR(ctx, 62, -22, 6, 44, 2, '#1A1D23');
    fillRect(ctx, -10, -26, 40, 6, '#2D333B');
    fillRect(ctx, -10, 20, 40, 6);
    fillArc(ctx, 0, -23, 2, '#8B949E');
    fillArc(ctx, 10, -23, 2);
    fillArc(ctx, 0, 23, 2);
    fillArc(ctx, 10, 23, 2);
    bothRR(ctx, -65, -6, 105, 12, 1, '#2D333B', '#C9D1D9', 2);
    strokeVerticals(ctx, [-62, -56, -50, -44, -38, -32, -26, -20, -14, -8, -2, 4, 10, 16, 22, 28, 34], -6, 6, '#1A1D23', 2);
    fillArc(ctx, 45, 0, 4, '#C9D1D9');
    strokeArc(ctx, 45, 0, 4, '#1A1D23', 1);
    fillRect(ctx, 47, -1, 6, 2, '#1A1D23');
    fireBeaconBlock(ctx, time);
    ctx.globalAlpha = tail;
    fillRR(ctx, -67.5, -22, 3, 8, 1, '#F85149');
    fillRR(ctx, -67.5, 14, 3, 8, 1);
    ctx.globalAlpha = 1;
    fillArc(ctx, 63, -18, 4, '#FFD700');
    fillArc(ctx, 63, 18, 4);
    if (blinkL) fillRR(ctx, -67.5, -22, 3, 8, 1, '#FFD700');
    if (blinkR) fillRR(ctx, -67.5, 14, 3, 8, 1, '#FFD700');
    ctx.restore();
    return;
  }

  if (v.rareSkin) {
    ctx.save();
    ctx.scale(1 / 3, 1 / 3);
    bothRR(ctx, -67.5, -24, 135, 48, 8, v.color, '#1A1D23', 1);
    bothRR(ctx, -50, -30, 28, 60, 6);
    bothRR(ctx, 35, -30, 24, 60, 6);
    fillRR(ctx, -60, -20, 55, 40, 3, '#1A1D23');
    ctx.globalAlpha = 0.8;
    fillRect(ctx, -58, -16, 51, 4, '#8B5A2B');
    fillRect(ctx, -58, -8, 51, 4);
    fillRect(ctx, -58, 0, 51, 4);
    fillRect(ctx, -58, 8, 51, 4);
    ctx.globalAlpha = 1;
    bothRR(ctx, 0, -22, 28, 44, 6, '#F0F6FC', '#1A1D23', 1);
    fillRR(ctx, 22, -20, 5, 40, 2, '#0D0F12');
    fillRR(ctx, 0, -18, 4, 36, 1.5);
    ctx.globalAlpha = tail;
    fillRR(ctx, -67.5, -22, 3, 8, 1, '#F85149');
    fillRR(ctx, -67.5, 14, 3, 8, 1);
    ctx.globalAlpha = 1;
    fillArc(ctx, 63, -18, 4, '#FFD700');
    fillArc(ctx, 63, 18, 4);
    if (blinkL) fillRR(ctx, -67.5, -22, 3, 8, 1, '#FFD700');
    if (blinkR) fillRR(ctx, -67.5, 14, 3, 8, 1, '#FFD700');
    ctx.restore();
    return;
  }

  bothRR(ctx, -22.5, -10, 31.66, 20, 1.33, '#8B949E', '#1A1D23', 0.33);
  fillRect(ctx, -20, -8.66, 26.66, 17.33, 'rgba(0,0,0,0.15)');
  fillRect(ctx, 8.33, -1.66, 4, 3.33, '#1A1D23');
  bothRR(ctx, 10.83, -8.66, 11.66, 17.33, 2, v.color, '#1A1D23', 0.33);
  fillRR(ctx, 17.33, -8, 3.33, 16, 1, '#1A1D23');
  fillRR(ctx, 12, -7.33, 4, 14.66, 0.66, 'rgba(0,0,0,0.2)');

  ctx.globalAlpha = tail;
  fillRR(ctx, -22.5, -9.33, 1.33, 3.33, 0.33, '#F85149');
  fillRR(ctx, -22.5, 6, 1.33, 3.33, 0.33);
  ctx.globalAlpha = 1;

  fillRR(ctx, 21.16, -8, 1.33, 3.33, 0.33, '#FFD700');
  fillRR(ctx, 21.16, 4.66, 1.33, 3.33, 0.33);

  if (blinkL) fillRR(ctx, -22.5, -9.33, 1.33, 3.33, 0.33, '#FFD700');
  if (blinkR) fillRR(ctx, -22.5, 6, 1.33, 3.33, 0.33, '#FFD700');
}
