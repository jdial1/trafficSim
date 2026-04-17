import type { Vehicle, Lane } from './types';
import { renderMotorcycle } from './designs/MotorcycleDesign';
import { renderCar } from './designs/CarDesign';
import { renderTruck } from './designs/TruckDesign';
import { renderBus } from './designs/BusDesign';

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
  env.ctx.shadowColor = 'transparent';
  env.ctx.shadowBlur = 0;
  env.ctx.shadowOffsetX = 0;
  env.ctx.shadowOffsetY = 0;

  switch (env.v.vType) {
    case 'MOTORCYCLE':
      return renderMotorcycle(env);
    case 'CAR':
      return renderCar(env);
    case 'TRUCK':
      return renderTruck(env);
    case 'BUS':
      return renderBus(env);
  }
}
