export type VehicleLabel = "BIKE" | "SUV" | "VAN";

export function pickKwikVehicle(totalKg: number): { label: VehicleLabel; vehicleId: number } {
  if (!Number.isFinite(totalKg) || totalKg < 0) totalKg = 0;

  const bike = Number(process.env.KWIK_VEHICLE_ID_BIKE);
  const suv = Number(process.env.KWIK_VEHICLE_ID_SUV);
  const van = Number(process.env.KWIK_VEHICLE_ID_VAN);

  if (!bike || !suv || !van) {
    throw new Error("Missing KWIK_VEHICLE_ID_BIKE / SUV / VAN in env");
  }

  if (totalKg <= 25) return { label: "BIKE", vehicleId: bike };
  if (totalKg <= 80) return { label: "SUV", vehicleId: suv };
  return { label: "VAN", vehicleId: van };
}
