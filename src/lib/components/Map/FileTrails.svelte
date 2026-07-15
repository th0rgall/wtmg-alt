<script lang="ts">
  import type { ContextType } from './Map.svelte';
  import type { ExpressionSpecification, GeoJSONSource } from 'mapbox-gl';
  import { fileDataLayers } from '$lib/stores/file';
  import { getContext, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import type { ExpressionSpecification, GeoJSONSource, Marker } from 'mapbox-gl';
  import mapboxgl from 'mapbox-gl';
  import { fileDataLayers } from '$lib/stores/file';
  import { getContext, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { bbox } from '@turf/bbox';
  import key from './mapbox-context.js';
  import { ZOOM_LEVELS } from '$lib/constants';
  import type { FileDataLayer } from '$lib/types/DataLayer';
  import type { FeatureCollection, Point } from 'geojson';
  import {
    clusterEndpoints,
    colorForRoute,
    computeKmMarkers,
    computeStartEnd,
    type RouteEndpoint
  } from '$lib/util/map/util';
  import { ENDPOINT_ICONS, ensureEndpointIcons } from './endpointIcon';
  import * as Sentry from '@sentry/sveltekit';
  import logger from '$lib/util/logger';

  const { getMap } = getContext<ContextType>(key);
  const map = getMap();

  // Km markers are generated once at 1 km spacing (see computeKmMarkers) and tagged with
  // `everyN` (the coarsest interval they belong to: 10, 5 or 1). Zoom-driven `step`
  // expressions reveal every 10th / 5th / 1st marker as the map zooms in and hide them all
  // below zoom 8, without ever re-uploading the marker data. The reveal thresholds are
  // INTEGER zoom levels so the circle (revealed just below via a paint-opacity step) and the
  // label (revealed via its text-field — see the km label layer in renderTrail) snap in
  // together: symbol layers sample paint opacity only at integer zoom stops and interpolate
  // between them, so a fractional threshold would smear the label half-transparent across a
  // zoom band while the circle stayed hidden.
  const KM_ZOOM_10 = 8; // every 10th km marker appears here
  const KM_ZOOM_5 = 10; // every 5th (and 10th) from here
  const KM_ZOOM_1 = 12; // every km from here
  const KM_VISIBILITY: ExpressionSpecification = [
    'step',
    ['zoom'],
    0,
    KM_ZOOM_10,
    ['case', ['>=', ['get', 'everyN'], 10], 1, 0],
    KM_ZOOM_5,
    ['case', ['>=', ['get', 'everyN'], 5], 1, 0],
    KM_ZOOM_1,
    1
  ];

  // Route lines are drawn semi-transparently once the map is zoomed in far enough to look at
  // the route in detail (>= road zoom) so the underlying street stays visible; fully opaque
  // below that.
  const lineOpacity = () => (map.getZoom() >= ZOOM_LEVELS.ROAD ? 0.45 : 0.8);

  // Layer/source id helpers. The base `id` is the line layer/source (kept for backwards
  // compat); it also backs the name label, which draws along the same line geometry, so no
  // separate name source is needed.
  const kmSourceId = (id: string) => `${id}__km`;
  const kmCircleId = (id: string) => `${id}__km-circle`;
  const kmLabelId = (id: string) => `${id}__km-label`;
  const nameLabelId = (id: string) => `${id}__name`;

  // Track rendered trail layers.
  const rendered = new Set<string>();

  // --- Start/end badges ---
  // Drawn as a single symbol layer (one feature per clustered endpoint) so their
  // visibility can be driven by the same kind of zoom step expression as the km markers.
  // The badge icons themselves live in ./endpointIcon.
  const ENDPOINT_SOURCE = '__route-endpoints';
  const ENDPOINT_LAYER = '__route-endpoints-layer';

  const fitToTrail = (geoJson: FileDataLayer['geoJson']) => {
    try {
      const bboxBounds = <[number, number, number, number]>bbox(geoJson).slice(0, 4);
      map.fitBounds(bboxBounds, {
        padding: { top: 150, bottom: 150, left: 50, right: 50 },
        maxZoom: ZOOM_LEVELS.ROAD,
        linear: true
      });
    } catch (error) {
      logger.error(error);
      Sentry.captureException(error, { extra: { context: 'Adding trail' } });
    }
  };

  const setLayerVisibility = (id: string, visible: boolean) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  };

  /** Removes the endpoint layer and its source. */
  const removeEndpointLayer = () => {
    if (map.getLayer(ENDPOINT_LAYER)) map.removeLayer(ENDPOINT_LAYER);
    if (map.getSource(ENDPOINT_SOURCE)) map.removeSource(ENDPOINT_SOURCE);
  };

  /**
   * Rebuilds the endpoint layer from all *visible* trails, merging endpoints within 5 m
   * of each other into a single badge (see clusterEndpoints).
   */
  const rebuildEndpoints = () => {
    const endpoints: RouteEndpoint[] = [];
    for (const layer of get(fileDataLayers)) {
      if (layer.visible === false) continue;
      const ends = computeStartEnd(layer.geoJson);
      if (!ends) continue;
      endpoints.push({ type: 'start', lngLat: ends.start as [number, number] });
      endpoints.push({ type: 'end', lngLat: ends.end as [number, number] });
    }

    const data: FeatureCollection<Point, { type: RouteEndpoint['type'] }> = {
      type: 'FeatureCollection',
      features: clusterEndpoints(endpoints).map((ep) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: ep.lngLat },
        properties: { type: ep.type }
      }))
    };

    if (!map.getSource(ENDPOINT_SOURCE)) {
      map.addSource(ENDPOINT_SOURCE, { type: 'geojson', data });
    } else {
      (map.getSource(ENDPOINT_SOURCE) as GeoJSONSource | undefined)?.setData(data);
    }

    if (!map.getLayer(ENDPOINT_LAYER)) {
      ensureEndpointIcons(map);
      map.addLayer({
        id: ENDPOINT_LAYER,
        type: 'symbol',
        source: ENDPOINT_SOURCE,
        layout: {
          // Green = start, red = end, split red|green = a merged start+end ("pause").
          'icon-image': [
            'match',
            ['get', 'type'],
            'start',
            ENDPOINT_ICONS.start,
            'end',
            ENDPOINT_ICONS.end,
            ENDPOINT_ICONS.pause
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        },
        // Badges appear together with the km markers (from zoom 8) at a fixed size — no
        // fading or resizing. `icon-opacity` is a paint property, so this snaps at the
        // threshold.
        paint: { 'icon-opacity': ['step', ['zoom'], 0, 8, 1] }
      });
    }
  };

  const applyVisibility = (layer: FileDataLayer) => {
    const lineVisible = layer.visible !== false;
    setLayerVisibility(layer.id, lineVisible);
    setLayerVisibility(kmCircleId(layer.id), lineVisible);
    setLayerVisibility(kmLabelId(layer.id), lineVisible);
    setLayerVisibility(nameLabelId(layer.id), lineVisible);
  };

  const renderTrail = (layer: FileDataLayer, color: string) => {
    const { id, geoJson } = layer;
    const isNew = !map.getSource(id);

    // --- Route line ---

    // Add or update source data depending
    if (isNew) {
      map.addSource(id, { type: 'geojson', data: geoJson });
    } else {
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(geoJson);
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(geoJson);
    }

    if (!map.getLayer(id)) {
      map.addLayer({
        id,
        type: 'line',
        source: id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-width': 7, 'line-color': color, 'line-opacity': lineOpacity() }
      });
    } else {
      map.setPaintProperty(id, 'line-color', color);
      map.setPaintProperty(id, 'line-opacity', lineOpacity());
    }

    // Zoom to the trail only when we just added it locally.
    if (isNew && layer.animate) fitToTrail(geoJson);

    // --- Kilometre markers ---
    // Generated once at 1 km spacing; the current zoom's subset is revealed by KM_VISIBILITY.
    const kmData = computeKmMarkers(geoJson);
    if (!map.getSource(kmSourceId(id))) {
      map.addSource(kmSourceId(id), { type: 'geojson', data: kmData });
    } else {
      (map.getSource(kmSourceId(id)) as GeoJSONSource | undefined)?.setData(kmData);
    }

    if (!map.getLayer(kmCircleId(id))) {
      map.addLayer({
        id: kmCircleId(id),
        type: 'circle',
        source: kmSourceId(id),
        paint: {
          // Fully white background so the underlying map never shows through the marker.
          'circle-color': 'rgba(255, 255, 255, 1)',
          'circle-radius': 9,
          'circle-opacity': KM_VISIBILITY,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': color,
          'circle-stroke-opacity': KM_VISIBILITY
        }
      });
    } else {
      map.setPaintProperty(kmCircleId(id), 'circle-stroke-color', color);
    }

    if (!map.getLayer(kmLabelId(id))) {
      map.addLayer({
        id: kmLabelId(id),
        type: 'symbol',
        source: kmSourceId(id),
        layout: {
          // Reveal the label through its text-field (a LAYOUT property, re-evaluated on
          // integer zoom change), NOT paint opacity — see the note by KM_VISIBILITY. Same
          // reveal schedule & integer thresholds as the circle, so the digits snap in with
          // it: the label string when the marker should show, otherwise '' (nothing drawn).
          'text-field': [
            'step',
            ['zoom'],
            '',
            KM_ZOOM_10,
            ['case', ['>=', ['get', 'everyN'], 10], ['get', 'label'], ''],
            KM_ZOOM_5,
            ['case', ['>=', ['get', 'everyN'], 5], ['get', 'label'], ''],
            KM_ZOOM_1,
            ['get', 'label']
          ],
          // Slightly smaller for labels with more than 2 digits (> 99) so the number still
          // fits inside the marker.
          'text-size': ['case', ['>', ['to-number', ['get', 'label']], 99], 8, 10],
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: { 'text-color': color }
      });
    } else {
      map.setPaintProperty(kmLabelId(id), 'text-color', color);
    }

    // --- Route name label (drawn along the full route) ---
    // The label is the file name minus its extension. It reuses the base line source (`id`)
    // — same geometry, no need for a second copy — and is placed along the line (so it
    // follows the curvature), repeated, offset to the side, in a zoom-scaled font.
    const routeName = (layer.originalFileName ?? '').replace(/\.[^./\\]+$/, '');
    if (!map.getLayer(nameLabelId(id))) {
      map.addLayer({
        id: nameLabelId(id),
        type: 'symbol',
        source: id,
        layout: {
          'symbol-placement': 'line',
          // Repeat the name every 250px, tripling the gap once zoomed in past ~14 so it
          // doesn't repeat too densely when looking at the route up close.
          'symbol-spacing': ['step', ['zoom'], 250, 14, 250 * 3],
          'text-field': routeName,
          // Font grows with zoom: 9px at zoom 6 (and below) to 15px at zoom 12 (and above).
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9, 12, 15],
          // Perpendicular (screen-space) offset lifting the name off the line.
          'text-offset': [0, -1.3],
          'text-max-angle': 40,
          'text-keep-upright': true,
          // Leave Mapbox's built-in collision detection on (the default) so route names
          // dodge each other instead of piling up where routes run close together. The
          // trade-off: a name may be dropped at some zooms when it collides with another
          // label (a base-map street name, another route's name, or a km/endpoint label).
          'text-allow-overlap': false,
          'text-ignore-placement': false
        },
        paint: {
          'text-color': color,
          'text-halo-color': 'rgba(255, 255, 255, 0.9)',
          'text-halo-width': 2.5
        }
      });
    } else {
      map.setLayoutProperty(nameLabelId(id), 'text-field', routeName);
      map.setPaintProperty(nameLabelId(id), 'text-color', color);
    }

    // Start/end badges are managed globally (see rebuildEndpoints).

    applyVisibility(layer);
    rendered.add(id);
  };

  const removeTrail = (id: string) => {
    [nameLabelId(id), kmLabelId(id), kmCircleId(id), id].forEach((layerId) => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    });
    if (map.getSource(kmSourceId(id))) map.removeSource(kmSourceId(id));
    if (map.getSource(id)) map.removeSource(id);

    rendered.delete(id);
  };

  /**
   * The id of the lowest-stacked garden layer currently present, used as the `beforeId` when
   * raising route layers so they never end up on top of the garden icons (uploaded route
   * layers are always kept below these so the garden icons stay visible). The list is the
   * WTMG garden layers (see GardenLayer.svelte) in the order they are added — i.e.
   * bottom-to-top in the style — so `.find` returns the lowest one present.
   */
  const gardenFloorLayerId = () =>
    ['clusters', 'cluster-count', 'unclustered-point', 'saved-gardens-layer'].find((id) =>
      map.getLayer(id)
    );

  // Raise a layer as high as possible while staying below the garden layers.
  const moveToTop = (layerId: string) => {
    if (map.getLayer(layerId)) map.moveLayer(layerId, gardenFloorLayerId());
  };

  const currentTrailIds = () =>
    get(fileDataLayers)
      .map((layer) => layer.id)
      .filter((id) => map.getLayer(id));

  /**
   * Stacks the layers: route lines at the bottom (oldest → newest, so the most recently
   * uploaded route sits on top of older ones), then all km markers, route names and
   * start/end badges above every route line (kept below the garden layers). This keeps the
   * km markers, names & badges readable wherever routes cross or overlap.
   */
  const applyLayerOrder = () => {
    // currentTrailIds() follows the store order, which is sorted oldest → newest, so moving
    // each up in turn leaves the most recently uploaded route line topmost.
    const ids = currentTrailIds();
    ids.forEach((id) => moveToTop(id));
    ids.forEach((id) => moveToTop(nameLabelId(id)));
    ids.forEach((id) => moveToTop(kmCircleId(id)));
    ids.forEach((id) => moveToTop(kmLabelId(id)));
    moveToTop(ENDPOINT_LAYER);
  };

  /** Full reconcile of the map against the current trails + tweaks state. */
  const sync = () => {
    const layers = get(fileDataLayers);

    const wantedIds = new Set(layers.map((layer) => layer.id));
    // Remove trails that are no longer present.
    [...rendered].forEach((id) => {
      if (!wantedIds.has(id)) removeTrail(id);
    });

    // Add/update remaining trails. Index (upload order) drives the alternating colour.
    layers.forEach((layer, index) => renderTrail(layer, colorForRoute(index)));

    // Rebuild the global (clustered) start/end badges from the current state.
    rebuildEndpoints();

    // Stack everything (km markers & badges on top of all route lines).
    applyLayerOrder();
  };

  /**
   * On zoom: update only the zoom-dependent route-line transparency. (Km markers and
   * start/end badges reveal themselves via their own zoom `step` expressions, so they need
   * no per-zoom handling here.)
   */
  const onZoom = () => {
    // Route-line transparency depends on the zoom level.
    rendered.forEach((id) => {
      if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', lineOpacity());
    });
  };

  map.on('zoom', onZoom);

  const unsubscribeLayers = fileDataLayers.subscribe(sync);

  onDestroy(() => {
    unsubscribeLayers();
    map.off('zoom', onZoom);
    // Guard against the map having been torn down already (e.g. on navigation away).
    try {
      removeEndpointLayer();
      [...rendered].forEach(removeTrail);
    } catch {
      // The map/style is gone; nothing left to clean up.
    }
  });
</script>
