// RideShare App — Mock Data for Demo

import type { AvailableSharedRide, Driver, Passenger, Ride, RideLocation } from "./types";

export const POPULAR_LOCATIONS: RideLocation[] = [
  { address: "Times Square, New York, NY", lat: 40.758, lng: -73.9855, shortName: "Times Square" },
  { address: "Penn Station, New York, NY", lat: 40.7506, lng: -73.9971, shortName: "Penn Station" },
  { address: "JFK Airport, Queens, NY", lat: 40.6413, lng: -73.7781, shortName: "JFK Airport" },
  { address: "Newark Penn Station, NJ", lat: 40.7349, lng: -74.1641, shortName: "Newark Penn" },
  { address: "Hoboken Terminal, NJ", lat: 40.7359, lng: -74.0244, shortName: "Hoboken" },
  { address: "Jersey City, NJ", lat: 40.7178, lng: -74.0431, shortName: "Jersey City" },
  { address: "Princeton, NJ", lat: 40.3573, lng: -74.6672, shortName: "Princeton" },
  { address: "Brooklyn Bridge, NY", lat: 40.7061, lng: -73.9969, shortName: "Brooklyn Bridge" },
  { address: "LaGuardia Airport, NY", lat: 40.7769, lng: -73.874, shortName: "LaGuardia" },
  { address: "Midtown Manhattan, NY", lat: 40.7549, lng: -73.984, shortName: "Midtown" },
];

export const MOCK_DRIVERS: Driver[] = [
  {
    id: "d1",
    name: "Marcus Johnson",
    avatar: "MJ",
    rating: 4.9,
    vehicle: "Toyota Camry",
    vehicleColor: "Silver",
    licensePlate: "NJ-4821",
    totalTrips: 1847,
  },
  {
    id: "d2",
    name: "Sarah Chen",
    avatar: "SC",
    rating: 4.8,
    vehicle: "Honda Accord",
    vehicleColor: "Black",
    licensePlate: "NY-7734",
    totalTrips: 2103,
  },
  {
    id: "d3",
    name: "David Okafor",
    avatar: "DO",
    rating: 4.95,
    vehicle: "Tesla Model 3",
    vehicleColor: "White",
    licensePlate: "NJ-9901",
    totalTrips: 3412,
  },
  {
    id: "d4",
    name: "Priya Patel",
    avatar: "PP",
    rating: 4.7,
    vehicle: "Ford Fusion",
    vehicleColor: "Blue",
    licensePlate: "NY-5567",
    totalTrips: 987,
  },
];

export const MOCK_PASSENGERS: Passenger[] = [
  {
    id: "p2",
    name: "Alex Rivera",
    avatar: "AR",
    rating: 4.8,
    pickup: POPULAR_LOCATIONS[0],
    dropoff: POPULAR_LOCATIONS[5],
    fareShare: 8.5,
    distanceKm: 22,
  },
  {
    id: "p3",
    name: "Emma Wilson",
    avatar: "EW",
    rating: 4.9,
    pickup: POPULAR_LOCATIONS[1],
    dropoff: POPULAR_LOCATIONS[3],
    fareShare: 11.0,
    distanceKm: 28,
  },
  {
    id: "p4",
    name: "James Kim",
    avatar: "JK",
    rating: 4.6,
    pickup: POPULAR_LOCATIONS[0],
    dropoff: POPULAR_LOCATIONS[6],
    fareShare: 14.5,
    distanceKm: 85,
  },
];

export const MOCK_AVAILABLE_RIDES: AvailableSharedRide[] = [
  {
    id: "ar1",
    driver: MOCK_DRIVERS[0],
    pickup: POPULAR_LOCATIONS[0],
    dropoff: POPULAR_LOCATIONS[5],
    passengers: [MOCK_PASSENGERS[0]],
    seatsAvailable: 2,
    routeOverlapPercent: 92,
    estimatedFareShare: 9.5,
    fullFare: 28.0,
    departureMinutes: 3,
    distanceKm: 22,
  },
  {
    id: "ar2",
    driver: MOCK_DRIVERS[1],
    pickup: POPULAR_LOCATIONS[1],
    dropoff: POPULAR_LOCATIONS[3],
    passengers: [MOCK_PASSENGERS[1]],
    seatsAvailable: 1,
    routeOverlapPercent: 87,
    estimatedFareShare: 12.0,
    fullFare: 32.0,
    departureMinutes: 7,
    distanceKm: 28,
  },
  {
    id: "ar3",
    driver: MOCK_DRIVERS[2],
    pickup: POPULAR_LOCATIONS[0],
    dropoff: POPULAR_LOCATIONS[6],
    passengers: [MOCK_PASSENGERS[2]],
    seatsAvailable: 2,
    routeOverlapPercent: 78,
    estimatedFareShare: 18.0,
    fullFare: 52.0,
    departureMinutes: 12,
    distanceKm: 85,
  },
  {
    id: "ar4",
    driver: MOCK_DRIVERS[3],
    pickup: POPULAR_LOCATIONS[9],
    dropoff: POPULAR_LOCATIONS[4],
    passengers: [],
    seatsAvailable: 3,
    routeOverlapPercent: 95,
    estimatedFareShare: 7.5,
    fullFare: 18.0,
    departureMinutes: 5,
    distanceKm: 14,
  },
];

export const MOCK_MY_RIDES: Ride[] = [
  {
    id: "r1",
    mode: "share",
    status: "completed",
    pickup: POPULAR_LOCATIONS[0],
    dropoff: POPULAR_LOCATIONS[5],
    driver: MOCK_DRIVERS[0],
    passengers: [MOCK_PASSENGERS[0]],
    totalFare: 28.0,
    myFare: 9.5,
    distanceKm: 22,
    estimatedMinutes: 35,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000).toISOString(),
    myPassengerId: "me",
  },
  {
    id: "r2",
    mode: "solo",
    status: "completed",
    pickup: POPULAR_LOCATIONS[1],
    dropoff: POPULAR_LOCATIONS[2],
    driver: MOCK_DRIVERS[1],
    passengers: [],
    totalFare: 45.0,
    myFare: 45.0,
    distanceKm: 40,
    estimatedMinutes: 55,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 55 * 60 * 1000).toISOString(),
    myPassengerId: "me",
  },
  {
    id: "r3",
    mode: "share",
    status: "completed",
    pickup: POPULAR_LOCATIONS[9],
    dropoff: POPULAR_LOCATIONS[3],
    driver: MOCK_DRIVERS[2],
    passengers: [MOCK_PASSENGERS[1], MOCK_PASSENGERS[2]],
    totalFare: 38.0,
    myFare: 11.5,
    distanceKm: 30,
    estimatedMinutes: 42,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 42 * 60 * 1000).toISOString(),
    myPassengerId: "me",
  },
];

// Fare calculation utility
export function calculateFareSplit(
  passengers: Array<{ distanceKm: number }>,
  baseFarePerKm = 1.2,
  baseFare = 3.5
): number[] {
  const totalDistance = passengers.reduce((sum, p) => sum + p.distanceKm, 0);
  const totalFare = baseFare + totalDistance * baseFarePerKm;

  return passengers.map((p) => {
    const proportion = p.distanceKm / totalDistance;
    return Math.round(totalFare * proportion * 100) / 100;
  });
}

export function estimateFare(distanceKm: number, mode: "solo" | "share"): number {
  const baseFare = 3.5;
  const perKm = mode === "solo" ? 1.8 : 1.2;
  return Math.round((baseFare + distanceKm * perKm) * 100) / 100;
}

export function estimateTime(distanceKm: number): number {
  // Approx 40 km/h average in city
  return Math.round((distanceKm / 40) * 60);
}
