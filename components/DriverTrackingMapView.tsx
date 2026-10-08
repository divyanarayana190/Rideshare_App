/**
 * DriverTrackingMapView — platform entry point.
 *
 * Metro resolves:
 *   .web.tsx    on web
 *   .native.tsx on iOS / Android
 *
 * This file is the TypeScript type-resolution fallback and the
 * default implementation when no platform suffix matches.
 */
export { default, type DriverTrackingMapViewProps, type StopMarker } from "./DriverTrackingMapView.web";
