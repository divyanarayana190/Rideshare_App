/**
 * GoogleMapView — platform entry point.
 *
 * Metro resolves:
 *   .web.tsx    on web
 *   .native.tsx on iOS / Android
 *
 * This file is the TypeScript type-resolution fallback.
 */
export { default, type GoogleMapViewProps, type DriverMarker, type MapViewCommands } from "./GoogleMapView.web";
