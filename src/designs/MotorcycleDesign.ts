import type { RenderVehicleEnv } from '../renderVehicleDesign';
import { fillRR, bothRR, fillRect, fillArc, strokeArc, polyStroke, polyFill } from './utils';

export function renderMotorcycle(env: RenderVehicleEnv) {
  const { ctx, v, time, lane, isBraking, isStopped, brakeIntensity } = env;
  const blinkLR = Math.floor(time / 350) % 2 === 0 && (lane?.type === 'LEFT' || lane?.type === 'RIGHT');

  if (v.legendarySkin) {
    ctx.save();
    ctx.scale(1 / 3, 1 / 3);
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 14 / 3;
    ctx.globalAlpha = isBraking ? (isStopped ? 1 : 0.35 + 0.65 * Math.min(1, brakeIntensity)) : 0.6;
    polyFill(ctx, [[-24, -4], [-75, -2], [-75, 2], [-24, 4]], '#00FFFF');
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 8 / 3;
    bothRR(ctx, -26, -10, 52, 20, 10, '#0D0F12', '#00FFFF', 1.5);
    strokeArc(ctx, -16, 0, 8, '#00FFFF', 3);
    strokeArc(ctx, 16, 0, 8, '#00FFFF', 3);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    fillRR(ctx, -6, -6, 16, 12, 6, '#1A1D23');
    polyFill(ctx, [[0, -4], [6, 0], [0, 4]], 'rgba(0,255,255,0.8)');
    fillRect(ctx, 25, -1, 2, 2, '#FFD700');
    if (blinkLR) fillRect(ctx, -27, -1, 2, 2, '#FFD700');
    ctx.restore();
    return;
  }

  if (v.rareSkin) {
    ctx.save();
    ctx.scale(1 / 3, 1 / 3);
    fillRR(ctx, -26, -2, 16, 4, 1, '#0D0F12');
    fillRR(ctx, 10, -2, 16, 4, 1);
    polyStroke(ctx, [[-14, 0], [4, -4], [14, 0], [4, 4]], true, '#58A6FF', 2);
    polyStroke(ctx, [[-14, 0], [4, 0]], false);
    fillRR(ctx, 12, -12, 2, 24, 1, '#C9D1D9');
    fillRR(ctx, 11, -14, 4, 4, 1, '#1A1D23');
    fillRR(ctx, 11, 10, 4, 4, 1);
    fillRR(ctx, -1, -8, 4, 16, 1, '#2D333B');
    bothRR(ctx, -10, -7, 14, 14, 5, '#f78166', '#1A1D23', 1);
    fillArc(ctx, -2, 0, 6, '#D29922');
    strokeArc(ctx, -2, 0, 6, '#1A1D23', 1);
    ctx.globalAlpha = isBraking ? (isStopped ? 1 : 0.3 + 0.7 * Math.min(1, brakeIntensity)) : 0.85;
    fillRect(ctx, -27, -1, 2, 2, '#F85149');
    ctx.globalAlpha = 1;
    fillRect(ctx, 25, -1, 2, 2, '#FFD700');
    if (blinkLR) fillRect(ctx, -27, -1, 2, 2, '#FFD700');
    ctx.restore();
    return;
  }

  fillRR(ctx, -9, -1, 4, 2, 0.66, '#0D0F12');
  fillRR(ctx, 5, -0.66, 4, 1.33, 0.66);
  fillRR(ctx, -6, -2.33, 4.66, 4.66, 1.33, v.color);
  fillRR(ctx, -2.66, -3.66, 7.33, 7.33, 2);
  fillRR(ctx, -4.33, -1.66, 5.33, 3.33, 1.33, '#1A1D23');
  fillRR(ctx, 2.33, -2, 2, 4, 0.66);
  fillRR(ctx, 2.33, -5, 1, 10, 0.5, '#2D333B');
  fillRR(ctx, 2, -5.33, 1.33, 2, 0.33, '#0D0F12');
  fillRR(ctx, 2, 3.33, 1.33, 2, 0.33);

  ctx.globalAlpha = isBraking ? (isStopped ? 1 : 0.3 + 0.7 * Math.min(1, brakeIntensity)) : 1;
  fillRR(ctx, -6.33, -1, 1, 2, 0.33, '#F85149');
  ctx.globalAlpha = 1;

  fillRR(ctx, 4.33, -1, 1.33, 2, 0.33, '#FFD700');
  if (blinkLR) fillRR(ctx, -6.33, -1, 1, 2, 0.33, '#FFD700');
}
