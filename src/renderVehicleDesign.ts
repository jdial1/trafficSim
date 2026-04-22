import type { Vehicle, Lane } from './types';

export type RenderVehicleEnv = {
  ctx: CanvasRenderingContext2D;
  v: Vehicle;
  lane: Lane | undefined;
  time: number;
  isStopped: boolean;
  isBraking: boolean;
  brakeIntensity: number;
};

export function renderVehicleSprite(env: RenderVehicleEnv) {
  const { ctx, v } = env;

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.lineWidth = 1.5;
  ctx.fillStyle = 'transparent';

  // Colors for different vehicle types (Zachtronics style, high contrast against dark)
  let color = '#58A6FF'; // default Car
  if (v.vType === 'MOTORCYCLE') color = '#D29922';
  else if (v.vType === 'TRUCK') color = '#3FB950';
  else if (v.vType === 'BUS') color = '#F85149';
  else if (v.vType === 'VIP') color = '#C9D1D9';

  // Persistence of vision trail (based on velocity)
  const speed = Math.hypot(v.vx, v.vy);
  if (speed > 0.1) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Draw trail backwards along the velocity vector
    // Multiply by a factor (e.g. 15) to make it visible
    const trailLength = speed * 15;
    ctx.lineTo(-trailLength, 0);
    ctx.strokeStyle = color + '40'; // 25% opacity
    ctx.lineWidth = v.width * 0.8;
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  
  if (v.vType === 'MOTORCYCLE') {
    // Triangle pointing right
    ctx.moveTo(v.length / 2, 0);
    ctx.lineTo(-v.length / 2, v.width / 2);
    ctx.lineTo(-v.length / 2, -v.width / 2);
    ctx.closePath();
  } else {
    // Simple Rectangle
    ctx.rect(-v.length / 2, -v.width / 2, v.length, v.width);
  }
  
  ctx.stroke();

  // Add small schematic indicators (e.g. diagonal line)
  if (v.vType !== 'MOTORCYCLE') {
      ctx.beginPath();
      ctx.moveTo(-v.length / 2 + 2, -v.width / 2 + 2);
      ctx.lineTo(-v.length / 2 + v.length * 0.3, v.width / 2 - 2);
      ctx.stroke();
  }

  // Braking indicators (schematic red bars at the back)
  if (env.isBraking) {
    ctx.strokeStyle = '#F85149';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-v.length / 2 - 2, -v.width / 2 + 1);
    ctx.lineTo(-v.length / 2 - 2, v.width / 2 - 1);
    ctx.stroke();
  }
}
