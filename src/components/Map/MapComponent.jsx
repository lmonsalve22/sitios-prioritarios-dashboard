import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { Search, Layers } from 'lucide-react';
import { FORMATION_COLORS } from '../../constants';

// Register the PMTiles protocol
let protocol = new Protocol();
maplibregl.addProtocol("pmtiles", (request) => {
    return new Promise((resolve, reject) => {
        const callback = (err, data) => {
            if (err) {
                console.error("PMTiles Protocol Error:", err, request.url);
                reject(err);
            } else {
                resolve({ data });
            }
        };
        protocol.tile(request, callback);
    });
});

const MapComponent = ({ onEcosystemSelect, activeLayers, ecosystemStats, searchTerm }) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [hoveredFeature, setHoveredFeature] = useState(null); // { id, source, sourceLayer }
    const [relations, setRelations] = useState({});
    const [bounds, setBounds] = useState({});

    // Fetch Data
    useEffect(() => {
        Promise.all([
            fetch('/data/relations.json').then(res => res.json()),
            fetch('/data/bounds.json').then(res => res.json())
        ]).then(([relData, boundsData]) => {
            setRelations(relData);
            setBounds(boundsData);
        }).catch(err => console.error("Failed to load map data:", err));
    }, []);

    // Prepare Color Expression for Formacion
    const formationColorExpression = ['match', ['get', 'FORMACION']];
    Object.entries(FORMATION_COLORS).forEach(([name, color]) => {
        formationColorExpression.push(name, color);
    });
    formationColorExpression.push('#94a3b8'); // default value

    useEffect(() => {
        if (map.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                sources: {
                    'carto-dark': {
                        type: 'raster',
                        tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
                        tileSize: 256,
                        attribution: '&copy; CartoDB & OpenStreetMap'
                    },
                    // --- Sources ---
                    'ecosistemas_formaciones': {
                        type: 'vector',
                        url: 'pmtiles://data/ecosistemas.pmtiles',
                        promoteId: 'CODIGO'
                    },
                    'ecosistemas_integrados': {
                        type: 'vector',
                        url: 'pmtiles://data/ecosistemas_integrados.pmtiles',
                        promoteId: 'CODIGO'
                    },
                    'areas_protegidas': {
                        type: 'vector',
                        url: 'pmtiles://data/areas_protegidas.pmtiles'
                    },
                    'sitios_prioritarios': {
                        type: 'vector',
                        url: 'pmtiles://data/sitios_prioritarios.pmtiles'
                    }
                },
                layers: [
                    {
                        id: 'base-map',
                        type: 'raster',
                        source: 'carto-dark',
                        minzoom: 0,
                        maxzoom: 22
                    },
                    // --- Ecosystems (Formations) ---
                    // Shows the colorful base layer using Formacion attribute
                    // GRAY STYLE as requested
                    {
                        id: 'ecosistemas-formaciones-fill',
                        type: 'fill',
                        source: 'ecosistemas_formaciones',
                        'source-layer': 'Ecosistemas',
                        paint: {
                            'fill-color': [
                                'case',
                                ['boolean', ['feature-state', 'hover'], false],
                                '#fbbf24', // hover color (amber)
                                '#94a3b8'  // normal color (gray)
                            ],
                            'fill-opacity': 0.8,
                            'fill-outline-color': '#ffffff'
                        }
                    },
                    {
                        id: 'ecosistemas-formaciones-line',
                        type: 'line',
                        source: 'ecosistemas_formaciones',
                        'source-layer': 'Ecosistemas',
                        paint: {
                            'line-color': '#ffffff',
                            'line-width': 1,
                            'line-opacity': 0.5
                        }
                    },
                    // --- Ecosystems (Integrated/Cruce) ---
                    // Shows the intersections with AP/SP. 
                    // Placed on top. Transparent fill (so we see colors below) but clickable.
                    {
                        id: 'ecosistemas-integrados-fill',
                        type: 'fill',
                        source: 'ecosistemas_integrados',
                        'source-layer': 'EcosistemasxAPxSP',
                        paint: {
                            'fill-color': 'cyan',
                            'fill-opacity': 0.0, // Transparent as requested (only border visible)
                            'fill-outline-color': 'cyan'
                        }
                    },
                    {
                        id: 'ecosistemas-integrados-line',
                        type: 'line',
                        source: 'ecosistemas_integrados',
                        'source-layer': 'EcosistemasxAPxSP',
                        paint: {
                            'line-color': 'cyan', // Distinct color for the cuts
                            'line-width': 1,
                            'line-opacity': 0.3
                        }
                    },
                    // --- Protected Areas ---
                    {
                        id: 'areas_protegidas-fill',
                        type: 'fill',
                        source: 'areas_protegidas',
                        'source-layer': 'Areas_Protegidas',
                        layout: { visibility: 'visible' },
                        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.6 }
                    },
                    {
                        id: 'areas_protegidas-line',
                        type: 'line',
                        source: 'areas_protegidas',
                        'source-layer': 'Areas_Protegidas',
                        layout: {
                            visibility: 'visible'
                        },
                        paint: { 'line-color': '#60a5fa', 'line-width': 1 }
                    },
                    // --- Sitios Prioritarios ---
                    {
                        id: 'sitios_prioritarios-fill',
                        type: 'fill',
                        source: 'sitios_prioritarios',
                        'source-layer': 'sitios_prior_integrados',
                        layout: { visibility: 'visible' },
                        paint: { 'fill-color': '#a855f7', 'fill-opacity': 0.6 }
                    },
                    {
                        id: 'sitios_prioritarios-line',
                        type: 'line',
                        source: 'sitios_prioritarios',
                        'source-layer': 'sitios_prior_integrados',
                        layout: {
                            visibility: 'visible'
                        },
                        paint: { 'line-color': '#c084fc', 'line-width': 1 }
                    }
                ]
            },
            center: [-71.5, -33.5],
            zoom: 6
        });

        // Controls
        map.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');
        map.current.addControl(new maplibregl.FullscreenControl(), 'bottom-right');

        // Events: Combined Click Handler
        const clickableLayers = [
            'ecosistemas-integrados-fill',
            'ecosistemas-formaciones-fill',
            'areas_protegidas-fill',
            'sitios_prioritarios-fill'
        ];

        map.current.on('click', clickableLayers, (e) => {
            if (e.features.length > 0) {
                const feature = e.features[0];

                // If selection on either ecosystem layer
                if (feature.layer.id.includes('ecosistemas')) {
                    const ecoId = feature.properties.CODIGO;
                    onEcosystemSelect(ecoId);
                }

                // Build Table
                let propertiesHtml = '<div style="max-height: 200px; overflow-y: auto; font-size: 11px;">';
                propertiesHtml += '<table style="width: 100%; border-collapse: collapse; color: #333;">';
                Object.entries(feature.properties).forEach(([key, value]) => {
                    propertiesHtml += `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 2px 4px; font-weight: bold; color: #555;">${key}</td>
                        <td style="padding: 2px 4px;">${value}</td>
                    </tr>
                   `;
                });
                propertiesHtml += '</table></div>';

                let title = "Detalle";
                if (feature.layer.id.includes('ecosistemas-integrados')) title = "Ecosistema (Cruce)";
                else if (feature.layer.id.includes('ecosistemas-formaciones')) title = "Ecosistema (Formación)";
                else if (feature.layer.id.includes('areas_protegidas')) title = "Área Protegida";
                else if (feature.layer.id.includes('sitios_prioritarios')) title = "Sitio Prioritario";

                new maplibregl.Popup({ maxWidth: '300px' })
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="font-family: sans-serif; padding: 4px;">
                            <strong style="font-size: 1.1em; color: #1e293b; display:block; margin-bottom:4px;">${title}</strong>
                            ${propertiesHtml}
                        </div>
                    `)
                    .addTo(map.current);
            }
        });

        // Hover Effect Handlers
        const ecosystemLayers = ['ecosistemas-integrados-fill', 'ecosistemas-formaciones-fill'];

        map.current.on('mousemove', ecosystemLayers, (e) => {
            if (e.features.length > 0) {
                const feature = e.features[0];
                const id = feature.id; // promotedId
                const source = feature.source;
                const sourceLayer = feature.sourceLayer;

                // If hovering over a new feature
                if (!hoveredFeature || hoveredFeature.id !== id || hoveredFeature.source !== source) {
                    // Turn off previous
                    if (hoveredFeature) {
                        map.current.setFeatureState(
                            { source: hoveredFeature.source, sourceLayer: hoveredFeature.sourceLayer, id: hoveredFeature.id },
                            { hover: false }
                        );
                    }

                    // Turn on new
                    if (id !== undefined) {
                        setHoveredFeature({ id, source, sourceLayer });
                        map.current.setFeatureState(
                            { source, sourceLayer, id },
                            { hover: true }
                        );
                    }
                }
                map.current.getCanvas().style.cursor = 'pointer';
            }
        });

        map.current.on('mouseleave', ecosystemLayers, () => {
            if (hoveredFeature) {
                map.current.setFeatureState(
                    { source: hoveredFeature.source, sourceLayer: hoveredFeature.sourceLayer, id: hoveredFeature.id },
                    { hover: false }
                );
            }
            setHoveredFeature(null);
            map.current.getCanvas().style.cursor = '';
        });

        // Al desmontar hay que destruir el mapa: remove() libera el contexto
        // WebGL y da de baja los listeners registrados mas arriba.
        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };

    }, []);

    // Effect: Visibility Updates
    useEffect(() => {
        if (!map.current) return;

        // Toggle AP/SP
        ['areas_protegidas', 'sitios_prioritarios'].forEach(layer => {
            const visibility = activeLayers[layer] ? 'visible' : 'none';
            if (map.current.getLayer(`${layer}-fill`)) {
                map.current.setLayoutProperty(`${layer}-fill`, 'visibility', visibility);
                map.current.setLayoutProperty(`${layer}-line`, 'visibility', visibility);
            }
        });

        // Toggle Ecosystem Layers
        const formVis = activeLayers['ecosistemas_formaciones'] ? 'visible' : 'none';
        if (map.current.getLayer('ecosistemas-formaciones-fill')) {
            map.current.setLayoutProperty('ecosistemas-formaciones-fill', 'visibility', formVis);
            map.current.setLayoutProperty('ecosistemas-formaciones-line', 'visibility', formVis);
        }

        const intVis = activeLayers['ecosistemas_integrados'] ? 'visible' : 'none';
        if (map.current.getLayer('ecosistemas-integrados-fill')) {
            map.current.setLayoutProperty('ecosistemas-integrados-fill', 'visibility', intVis);
            map.current.setLayoutProperty('ecosistemas-integrados-line', 'visibility', intVis);
        }

    }, [activeLayers]);

    // Effect: Filtering & Zoom
    useEffect(() => {
        if (!map.current || !map.current.getLayer('ecosistemas-formaciones-fill')) return;

        if (searchTerm && ecosystemStats) {
            const eco = ecosystemStats.find(s => s.name === searchTerm);
            if (eco) {
                console.log("Filtering Map to Ecosystem:", eco.name, eco.id);
                // 1. ZOOM to Bounds (New)
                if (bounds[eco.id]) {
                    map.current.fitBounds(bounds[eco.id], { padding: 50, maxZoom: 12 });
                }

                // 2. Filter Ecosystems Layer
                const filter = ['==', 'CODIGO', eco.id];

                // Apply filter to BOTH ecosystem layers
                map.current.setFilter('ecosistemas-formaciones-fill', filter);
                map.current.setFilter('ecosistemas-formaciones-line', filter);
                map.current.setFilter('ecosistemas-integrados-fill', filter);
                map.current.setFilter('ecosistemas-integrados-line', filter);

                // 3. Cross-filtering for AP/SP
                if (relations[eco.id]) {
                    const { aps, sps } = relations[eco.id];

                    if (aps && aps.length > 0) {
                        const apFilter = ['in', 'Codrnap', ...aps];
                        map.current.setFilter('areas_protegidas-fill', apFilter);
                        map.current.setFilter('areas_protegidas-line', apFilter);
                    } else {
                        map.current.setFilter('areas_protegidas-fill', ['in', 'Codrnap', 'NO_MATCH']);
                        map.current.setFilter('areas_protegidas-line', ['in', 'Codrnap', 'NO_MATCH']);
                    }

                    if (sps && sps.length > 0) {
                        const spFilter = ['in', 'Name', ...sps];
                        map.current.setFilter('sitios_prioritarios-fill', spFilter);
                        map.current.setFilter('sitios_prioritarios-line', spFilter);
                    } else {
                        map.current.setFilter('sitios_prioritarios-fill', ['in', 'Name', 'NO_MATCH']);
                        map.current.setFilter('sitios_prioritarios-line', ['in', 'Name', 'NO_MATCH']);
                    }
                } else {
                    // No relations -> hide dependent layers
                    map.current.setFilter('areas_protegidas-fill', ['in', 'Codrnap', 'NO_MATCH']);
                    map.current.setFilter('areas_protegidas-line', ['in', 'Codrnap', 'NO_MATCH']);
                    map.current.setFilter('sitios_prioritarios-fill', ['in', 'Name', 'NO_MATCH']);
                    map.current.setFilter('sitios_prioritarios-line', ['in', 'Name', 'NO_MATCH']);
                }

            }
        } else {
            // Clear all filters
            console.log("Clearing Map Filter");
            ['ecosistemas-formaciones', 'ecosistemas-integrados'].forEach(base => {
                map.current.setFilter(`${base}-fill`, null);
                map.current.setFilter(`${base}-line`, null);
            });
            map.current.setFilter('areas_protegidas-fill', null);
            map.current.setFilter('areas_protegidas-line', null);
            map.current.setFilter('sitios_prioritarios-fill', null);
            map.current.setFilter('sitios_prioritarios-line', null);
        }
    }, [searchTerm, ecosystemStats, relations, bounds]);

    return <div ref={mapContainer} style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' }} />;
};

export default MapComponent;
