<script lang="ts">
  import type { Garden } from '$lib/types/Garden';
  import type { ContextType } from './Map.svelte';
  import type GeoJSON from 'geojson';

  import { getContext, onMount } from 'svelte';
  import key from './mapbox-context.js';
  import { nonMemberMaxZoom } from '$lib/constants';
  import { loadImg } from '$lib/api/mapbox';
  import { gardenLayerLoaded } from '$lib/stores/app';
  import { user } from '$lib/stores/auth';
  import GardenContextMenu from './GardenContextMenu.svelte';
  import * as Sentry from '@sentry/sveltekit';
  import logger from '$lib/util/logger';

  type GardenFeatureProperties = Garden & {
    icon: string;
    lnglat: [number, number];
  };
  interface Props {
    allGardens: Garden[];
    selectedGardenId?: string | null;
    showGardens: boolean;
    showSavedGardens: boolean;
    savedGardens?: any;
    onGardenClick: (garden: Garden) => void;
  }

  let {
    allGardens,
    selectedGardenId = null,
    showGardens,
    showSavedGardens,
    savedGardens = [] as string[],
    onGardenClick
  }: Props = $props();

  type GardenFeatureCollection = {
    type: 'FeatureCollection';
    features: GeoJSON.Feature[];
  };

  const { getMap } = getContext<ContextType>(key);
  const map = getMap();

  const savedGardenSourceId = 'saved-gardens';
  const gardensAllSourceId = 'gardens-all';
  const savedGardenLayerId = 'saved-gardens-layer';
  const clustersLayerId = 'clusters';
  const clusterCountLayerId = 'cluster-count';
  const unclusteredPointLayerId = 'unclustered-point';

  let mapReady = $state(false);

  const fcAllGardens: GardenFeatureCollection = {
    type: 'FeatureCollection',
    features: []
  };

  const fcSavedGardens: GardenFeatureCollection = {
    type: 'FeatureCollection',
    features: []
  };

  const constructMapFeatures = () => {
    fcAllGardens.features = [];
    fcSavedGardens.features = [];

    allGardens.forEach((garden: Garden) => {
      if (!garden.id) return;

      const gardenId = garden.id;
      // Check if garden id is in savedGardens
      const isSaved = savedGardens.includes(gardenId);

      const gardenProperties = {
        ...garden,
        // icon: isSaved ? 'tent-saved' : 'tent',
        icon:
          isSaved && selectedGardenId === gardenId
            ? 'tent-saved-selected' // selected saved garden
            : selectedGardenId === gardenId
              ? 'tent-filled' // selected garden
              : isSaved
                ? 'tent-saved' // saved garden
                : 'tent', // garden
        lnglat: [garden.location.longitude, garden.location.latitude]
      } satisfies GardenFeatureProperties;

      let gardenFeature = {
        type: 'Feature',
        properties: gardenProperties,
        geometry: {
          type: 'Point',
          coordinates: [garden.location.longitude, garden.location.latitude]
        }
      };

      fcAllGardens.features.push(gardenFeature);

      if (isSaved) fcSavedGardens.features.push(gardenFeature);
    });
  };

  // Context menu shown to zoom-restricted (non-member) viewers when a single click hits more
  // than one overlapping garden icon, so they can still reach each garden (partially) hidden by overlap.
  let contextMenuGardens = $state<Garden[] | null>(null);
  let contextMenuLngLat = $state<[number, number]>([0, 0]);

  const closeContextMenu = () => {
    contextMenuGardens = null;
  };

  const _onGardenClick = (e: mapboxgl.MapMouseEvent) => {
    // Mapbox appends marker elements inside the canvas container, so clicks on our (marker-based)
    // context menu still bubble up and hit-test against the garden layers. Ignore those, so
    // interacting with the menu never triggers a garden that happens to sit underneath it.
    const target = e.originalEvent?.target as Element | null;
    if (target?.closest?.('.garden-context-menu')) return;

    // `e.features` is Mapbox's own hit-test for the clicked garden layers at this point: it may
    // contain several overlapping icons. Dedupe by id (a saved garden appears in both layers) and
    // resolve to the full Garden objects (feature properties are serialized by Mapbox).
    const seen = new Set<string>();
    const hitGardens: Garden[] = [];
    for (const feature of e.features ?? []) {
      const id = feature.properties?.id as string | undefined;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const garden = allGardens.find((g) => g.id === id);
      if (garden) hitGardens.push(garden);
    }

    if (hitGardens.length === 0) return;

    if (hitGardens.length === 1) {
      onGardenClick(hitGardens[0]);
      return;
    }

    // More than one garden icon was hit by this single click.
    if ($user?.superfan) {
      // Members aren't zoom-restricted: zoom in on the click to pull the icons apart.
      map.easeTo({
        center: e.lngLat,
        zoom: Math.min(map.getMaxZoom(), map.getZoom() + 4)
      });
    } else {
      // Non-members are zoom-capped and can't separate them, so list them in a small overlay.
      contextMenuGardens = hitGardens;
      contextMenuLngLat = [e.lngLat.lng, e.lngLat.lat];
    }
  };

  function addPointerOnHover(layerId: string) {
    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
    });
  }

  const initializeMap = async () => {
    // Catch all errors to avoid having to reload when working on this component in development
    try {
      const images = [
        { url: '/images/markers/tent-neutral.png', id: 'tent' },
        { url: '/images/markers/tent-filled.png', id: 'tent-filled' },
        { url: '/images/markers/tent-yellow-dark.png', id: 'tent-saved-selected' },
        { url: '/images/markers/tent-yellow.png', id: 'tent-saved' }
      ];

      await Promise.all(images.map((img) => loadImg(map, img)));

      constructMapFeatures();

      // Add map data sources based on constructed feature sets

      map.addSource(gardensAllSourceId, {
        type: 'geojson',
        data: fcAllGardens,
        cluster: true,
        /** Max zoom on which to cluster points if clustering is enabled.
         * Defaults to one zoom less than maxzoom (so that last zoom features are not clustered).
         * https://docs.mapbox.com/mapbox-gl-js/style-spec/sources/#geojson-clusterMaxZoom
         *
         * Note: the non-member max zoom should be more zoomed out than the member max zoom.
         */
        clusterMaxZoom: nonMemberMaxZoom - 1,
        clusterRadius: 50
      });

      map.addSource(savedGardenSourceId, {
        type: 'geojson',
        data: fcSavedGardens
      });

      // Add layers based on map sources

      // > Layers based on the "all gardens" source
      map.addLayer({
        id: clustersLayerId,
        type: 'circle',
        source: gardensAllSourceId,
        filter: ['has', 'point_count'],
        paint: {
          // https://docs.mapbox.com/mapbox-gl-js/style-spec/#expressions-step
          //   * Blue, 20px circles when point count is less than 20
          //   * Yellow, 30px circles when point count is between 30 and 40
          //   * Pink, 40px circles when point count is greater than or equal to 40
          // --color-0: '#EC9570'; --color-1: '#F6C4B7'; --color-2: '#F4E27E';
          // --color-3: '#59C29D'; --color-4: '#A2D0D3'; --color-5: '#2E5F63';

          // 'circle-color': ['step', ['get', 'point_count'], '#A2D0D3', 20, '#F6C4B7', 80, '#EC9570'],
          // 'circle-radius': ['step', ['get', 'point_count'], 20, 20, 30, 40, 40]

          // Original colors and sizes
          'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 20, '#f1f075', 40, '#f28cb1'],
          'circle-radius': ['step', ['get', 'point_count'], 20, 20, 30, 40, 40]
        }
      });

      map.addLayer({
        id: clusterCountLayerId,
        type: 'symbol',
        source: gardensAllSourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 13
          // 'text-allow-overlap': true
        }
      });

      map.addLayer({
        id: unclusteredPointLayerId,
        type: 'symbol',
        source: gardensAllSourceId,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': 0.4,
          // Needs to be true, otherwise a city/town name on the map will overlap a garden.
          // http://localhost:5173/explore/garden/XFVhmDog6xQprHRJuy1UkThRUVh2 and the name "Spalbeek"
          'icon-allow-overlap': true
        }
      });

      // > Layers based on the "saved gardens" source
      map.addLayer({
        id: savedGardenLayerId,
        type: 'symbol',
        source: savedGardenSourceId,
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': 0.4,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      // Add behavior

      // Inspect a cluster on click
      map.on('click', clustersLayerId, (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [clustersLayerId]
        });
        const clusterId = features[0].properties?.cluster_id;
        map.getSource(gardensAllSourceId).getClusterExpansionZoom(clusterId, function (err, zoom) {
          if (err) return logger.log(err);

          map.easeTo({
            center: features[0].geometry.coordinates,
            zoom: zoom
          });
        });
      });

      // Listen on both garden layers at once so a single click reports every overlapping garden
      // icon it hit (across the "all" and "saved" layers) in `e.features`.
      map.on('click', [unclusteredPointLayerId, savedGardenLayerId], _onGardenClick);

      [clustersLayerId, unclusteredPointLayerId, savedGardenLayerId].forEach(addPointerOnHover);
    } catch (err) {
      // should not error in prod
      logger.error(err);
      Sentry.captureException(err, {
        extra: { context: 'Initializing the map layers and behavior' }
      });
    } finally {
      mapReady = true;
      $gardenLayerLoaded = true;
    }
  };

  const updateGardensAllVisibility = (visible: boolean) => {
    map.setLayoutProperty(clustersLayerId, 'visibility', visible ? 'visible' : 'none');
    map.setLayoutProperty(clusterCountLayerId, 'visibility', visible ? 'visible' : 'none');
    map.setLayoutProperty(unclusteredPointLayerId, 'visibility', visible ? 'visible' : 'none');
  };

  const updateSavedGardensVisibility = (visible: boolean) => {
    map.setLayoutProperty(savedGardenLayerId, 'visibility', visible ? 'visible' : 'none');
  };

  $effect(() => {
    if (mapReady) {
      // update featurecollections when allGardens or savedGardens change and selectedGardenId
      constructMapFeatures();
      map.getSource(gardensAllSourceId).setData(fcAllGardens);
      map.getSource(savedGardenSourceId).setData(fcSavedGardens);
      // Update visibility when showGardens or showSavedGardens change
      updateGardensAllVisibility(showGardens);
      updateSavedGardensVisibility(showSavedGardens);
    }
  });

  onMount(() => {
    initializeMap();
  });
</script>

{#if contextMenuGardens}
  <GardenContextMenu
    gardens={contextMenuGardens}
    lngLat={contextMenuLngLat}
    onSelectGarden={onGardenClick}
    onClose={closeContextMenu}
  />
{/if}
