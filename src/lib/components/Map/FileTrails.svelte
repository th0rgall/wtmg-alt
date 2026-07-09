<script lang="ts">
  import type { ContextType } from './Map.svelte';
  import type GeoJSON from 'geojson';
  import { fileDataLayers, prefix } from '$lib/stores/file';
  import { getContext } from 'svelte';
  import { bbox } from '@turf/bbox';
  import key from './mapbox-context.js';
  import { ZOOM_LEVELS } from '$lib/constants';
  import type { FileDataLayer } from '$lib/types/DataLayer';
  import * as Sentry from '@sentry/sveltekit';
  import logger from '$lib/util/logger';

  type SourceData =
    | string
    | GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>
    | GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>
    | undefined;

  const { getMap } = getContext<ContextType>(key);
  const map = getMap();

  const updateVisibility = (id: string, visible?: boolean) => {
    const layer = map.getLayer(id);
    if (layer) {
      if (visible) map.setLayoutProperty(id, 'visibility', 'visible');
      else map.setLayoutProperty(id, 'visibility', 'none');
    }
  };

  const addTrail = ({ geoJson, id, animate }: FileDataLayer) => {
    // Zoom & pan the map to show the trail, but only if we added the route locally.
    if (animate) {
      try {
        const bboxBounds = <[number, number, number, number]>bbox(geoJson).slice(0, 4);
        map.fitBounds(bboxBounds, {
          padding: {
            top: 150,
            bottom: 150,
            left: 50,
            right: 50
          },
          maxZoom: ZOOM_LEVELS.ROAD,
          linear: true
        });
      } catch (error) {
        logger.error(error);
        Sentry.captureException(error, { extra: { context: 'Adding trail' } });
      }
    }

    // Add/update layer data
    if (map.getSource(id)) {
      map.getSource(id).setData(geoJson);
    } else {
      map.addSource(id, {
        type: 'geojson',
        data: geoJson
      });
    }

    // Add a presentation if not existing yet
    if (!map.getLayer(id)) {
      map.addLayer({
        id,
        type: 'line',
        source: id,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-width': 7,
          'line-color': 'indigo',
          'line-opacity': 0.7
        }
      });
    }
  };

  let prevFileDataLayerIds: string[] = [];

  // Subscribe to fileDataLayers store and update map layers accordingly when it changes (e.g. when a new file is loaded)
  fileDataLayers.subscribe((fileDataLayers) => {
    const fileDataLayerIds = fileDataLayers.map((fileDataLayer) => fileDataLayer.id);

    const idsToAdd = fileDataLayerIds.filter((id) => !prevFileDataLayerIds.includes(id)); // IDs that are in the new data, but not in the old data
    const idsToRemove = prevFileDataLayerIds.filter((id) => !fileDataLayerIds.includes(id)); // IDs that are in the old data, but not in the new data
    const idsToUpdate = fileDataLayerIds.filter((id) => prevFileDataLayerIds.includes(id)); // IDs that are in both the old and new data

    // Check

    // Add new layers
    idsToAdd.map((id) => {
      const fileDataLayer = fileDataLayers.find((fileDataLayer) => fileDataLayer.id === id);
      if (fileDataLayer) addTrail(fileDataLayer);
    });

    // Remove old layers
    idsToRemove.map((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });

    // Update visibility of existing layers
    idsToUpdate.map((id) => {
      const fileDataLayer = fileDataLayers.find((fileDataLayer) => fileDataLayer.id === id);
      if (fileDataLayer) updateVisibility(id, fileDataLayer.visible);
    });

    prevFileDataLayerIds = fileDataLayerIds;
  });
</script>
