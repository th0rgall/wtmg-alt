/**
 * Helpers for styling uploaded route (trail) files on the map.
 *
 * NOTE: part of a temporary prototype for route file display enhancements.
 */
import { along, distance, flatten, length, lineString } from '@turf/turf';
import type { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';

/**
 * Palette used to colour uploaded routes.
 *
 * The first colour is the original "dark purple" (indigo). The remaining four are
 * distinct, well-contrasting colours so that touching/overlapping routes can be told
 * apart. All are dark/saturated enough to stand out against the light green/yellow map.
 */
const ROUTE_COLORS = [
  '#4b0082', // indigo (original dark purple)
  '#d7263d', // crimson red
  '#1565c0', // strong blue
  '#d81b60', // magenta / deep pink
  '#e65100' // deep orange
];

/**
 * Returns the colour for the route at the given index (routes alternate through the
 * palette). Routes are ordered by upload date, so a route's colour is stable across
 * reloads.
 * @param index position of the route among the uploaded routes
 */
export const colorForRoute = (index: number): string => ROUTE_COLORS[index % ROUTE_COLORS.length];

/**
 * Extracts all usable line segments (>= 2 points) from a GeoJSON route. Turf's `flatten` expands
 * MultiLineStrings and GeometryCollections into individual features; anything
 * that isn't a LineString (points, polygons) is dropped.
 */
const flattenToLines = (geoJson: FeatureCollection | Feature): Position[][] =>
  flatten(geoJson)
    .features.map((f) => f.geometry)
    .filter((g): g is LineString => g?.type === 'LineString')
    .map((g) => g.coordinates)
    .filter((line) => line.length >= 2);

/**
 * Returns the first and last coordinate of a route, treating the route as the
 * concatenation of its line segments (first point of the first line, last point
 * of the last line).
 */
export const computeStartEnd = (
  geoJson: FeatureCollection | Feature
): { start: Position; end: Position } | null => {
  const lines = flattenToLines(geoJson);
  if (lines.length === 0) return null;
  const first = lines[0];
  const last = lines[lines.length - 1];
  return { start: first[0], end: last[last.length - 1] };
};

/**
 * Computes kilometre markers along a route at 1 km spacing (the finest interval shown).
 * Distances are accumulated across consecutive line segments so labels stay continuous
 * over multi-segment routes.
 *
 * Each marker carries `everyN`: the coarsest interval it belongs to (10 for multiples of
 * 10 km, else 5 for multiples of 5, else 1). The map layer uses this to reveal every 10th /
 * 5th / 1st marker as the user zoom in, without ever regenerating the marker data.
 */
export const computeKmMarkers = (
  geoJson: FeatureCollection | Feature
): FeatureCollection<Point, { label: string; everyN: number }> => {
  const features: Feature<Point, { label: string; everyN: number }>[] = [];
  const lines = flattenToLines(geoJson);

  const epsilon = 1e-9;
  let cumulative = 0; // total distance covered before the current segment
  let km = 1; // next whole-kilometre mark to place
  for (const coords of lines) {
    const ls = lineString(coords);
    const segmentLength = length(ls, { units: 'kilometers' });
    while (km <= cumulative + segmentLength + epsilon) {
      const distanceOnSegment = Math.max(0, km - cumulative);
      const point = along(ls, distanceOnSegment, { units: 'kilometers' });
      const everyN = km % 10 === 0 ? 10 : km % 5 === 0 ? 5 : 1;
      features.push({
        type: 'Feature',
        geometry: point.geometry,
        properties: { label: `${km}`, everyN }
      });
      km++;
    }
    cumulative += segmentLength;
  }

  return { type: 'FeatureCollection', features };
};

/**
 * A route extremity marker. `pause` is used for points produced by merging nearby
 * endpoints (see clusterEndpoints).
 */
export type RouteEndpoint = { type: 'start' | 'end' | 'pause'; lngLat: [number, number] };

/**
 * Merges endpoints that lie within `maxDistanceMeters` of each other into a single
 * marker placed at the cluster's midpoint (centroid). A merged cluster keeps its
 * shared type when all members are the same (start/end), and is rendered as a
 * `pause` marker when it mixes types.
 */
export const clusterEndpoints = (
  /**
   * Input RouteEndpoints will never be of the type "pause", that is what is being calculated in this function.
   */
  endpoints: RouteEndpoint[],
  maxDistanceMeters = 5
): RouteEndpoint[] => {
  const maxKm = maxDistanceMeters / 1000;
  const clusters: RouteEndpoint[][] = [];

  // Naïve O(n^2) (?) algorithm to cluster endpoints
  // Should be performant enough considering that the number of
  // endpoints is N_routes * 2, which should be reasonably limited.
  for (const ep of endpoints) {
    const cluster = clusters.find((c) =>
      c.some((m) => distance(m.lngLat, ep.lngLat, { units: 'kilometers' }) <= maxKm)
    );
    if (cluster) cluster.push(ep);
    else clusters.push([ep]);
  }

  return clusters.map((cluster) => {
    if (cluster.length === 1) return cluster[0];
    const lng = cluster.reduce((sum, m) => sum + m.lngLat[0], 0) / cluster.length;
    const lat = cluster.reduce((sum, m) => sum + m.lngLat[1], 0) / cluster.length;
    const allSameType = cluster.every((m) => m.type === cluster[0].type);
    const type = allSameType ? cluster[0].type : 'pause';
    return { type, lngLat: [lng, lat] };
  });
};
