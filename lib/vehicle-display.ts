/** Static vehicle thumbnails bundled with the app */
export const VEHICLE_IMAGES = {
  'tesla-model-3': require('@/assets/images/vehicles/tesla-model-3.png'),
  'sedan-default': require('@/assets/images/vehicles/sedan-default.png'),
} as const;

export type VehicleImageSource = (typeof VEHICLE_IMAGES)[keyof typeof VEHICLE_IMAGES] | { uri: string };

const SEATS_BY_TYPE: Record<string, number> = {
  sedan: 5,
  suv: 5,
  van: 7,
  truck: 3,
  luxury: 4,
};

const ELECTRIC_MAKES = ['tesla', 'rivian', 'lucid', 'polestar', 'fisker'];

export type VehicleFuelType = 'electric' | 'hybrid' | 'gasoline';

export function inferFuelType(
  make?: string | null,
  model?: string | null,
  fuelType?: VehicleFuelType | null,
): VehicleFuelType {
  if (fuelType) return fuelType;
  const haystack = `${make ?? ''} ${model ?? ''}`.toLowerCase();
  if (ELECTRIC_MAKES.some((m) => haystack.includes(m))) return 'electric';
  if (haystack.includes('hybrid') || haystack.includes('prius')) return 'hybrid';
  return 'gasoline';
}

export function formatFuelLabel(fuel: VehicleFuelType): string {
  if (fuel === 'electric') return 'Electric';
  if (fuel === 'hybrid') return 'Hybrid';
  return 'Gasoline';
}

export function resolveSeatCount(
  seatCount?: number | null,
  vehicleType?: string | null,
): number | null {
  if (seatCount != null && seatCount > 0) return seatCount;
  if (vehicleType && SEATS_BY_TYPE[vehicleType]) return SEATS_BY_TYPE[vehicleType];
  return null;
}

/** Resolve bundled image or remote URL for vehicle thumbnail */
export function resolveVehicleImageSource(params: {
  make?: string | null;
  model?: string | null;
  photoUrl?: string | null;
}): VehicleImageSource {
  const photoUrl = params.photoUrl ?? '';
  if (photoUrl.includes('tesla-model-3')) {
    return VEHICLE_IMAGES['tesla-model-3'];
  }
  if (photoUrl.startsWith('http') || photoUrl.startsWith('/uploads')) {
    return { uri: photoUrl };
  }

  const make = (params.make ?? '').toLowerCase();
  const model = (params.model ?? '').toLowerCase();

  if (make.includes('tesla') && model.includes('model 3')) {
    return VEHICLE_IMAGES['tesla-model-3'];
  }
  if (make.includes('tesla')) {
    return VEHICLE_IMAGES['tesla-model-3'];
  }

  return VEHICLE_IMAGES['sedan-default'];
}

export function buildVehicleSpecsLine(params: {
  color?: string | null;
  fuelType?: VehicleFuelType | null;
  make?: string | null;
  model?: string | null;
  seatCount?: number | null;
  vehicleType?: string | null;
}): string {
  const parts: string[] = [];
  if (params.color) {
    parts.push(params.color.charAt(0).toUpperCase() + params.color.slice(1));
  }
  const fuel = inferFuelType(params.make, params.model, params.fuelType);
  parts.push(formatFuelLabel(fuel));
  const seats = resolveSeatCount(params.seatCount, params.vehicleType);
  if (seats != null) parts.push(`${seats} Seats`);
  return parts.join('  •  ');
}
