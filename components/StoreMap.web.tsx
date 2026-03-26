import React, { useEffect, useRef, useState } from 'react';
import type { NearbyStore } from '../lib/stores';

const PRIMARY = '#1D9E75';
const MAP_HEIGHT = 260;

interface Props {
  stores: NearbyStore[];
  center: { lat: number; lon: number };
  selectedOsmId: string | null;
  onHover: (osmId: string | null) => void;
  onSelect: (store: NearbyStore) => void;
}

export default function StoreMap({ stores, center, selectedOsmId, onHover, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [ready, setReady] = useState(false);

  // Inject Leaflet CSS once
  useEffect(() => {
    if (document.getElementById('leaflet-css')) {
      setReady(true);
      return;
    }
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.onload = () => setReady(true);
    document.head.appendChild(link);
  }, []);

  // Build/rebuild map when ready and stores change
  useEffect(() => {
    if (!ready || !containerRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const L = require('leaflet');

    // Remove old map if it exists
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markersRef.current.clear();
    }

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lon],
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Small attribution
    L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);

    // User location pulse marker
    const pulseIcon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;background:#3B82F6;border-radius:50%;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,0.25);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    L.marker([center.lat, center.lon], { icon: pulseIcon, zIndexOffset: -1 }).addTo(map);

    stores.forEach((store, idx) => {
      const isSelected = store.osmId === selectedOsmId;
      const icon = makeIcon(L, isSelected, idx + 1);
      const marker = L.marker([store.lat, store.lon], { icon })
        .addTo(map)
        .bindPopup(makePopupHTML(store), { maxWidth: 220, closeButton: false });

      marker.on('mouseover', () => onHover(store.osmId));
      marker.on('mouseout', () => onHover(null));
      marker.on('popupopen', () => onHover(store.osmId));
      marker.on('popupclose', () => onHover(null));

      // Wire up the Select button inside the popup
      marker.on('popupopen', () => {
        const btn = document.getElementById(`map-select-${store.osmId}`);
        if (btn) btn.onclick = () => onSelect(store);
      });

      markersRef.current.set(store.osmId, marker);
    });

    // Fit bounds to all stores if more than one
    if (stores.length > 1) {
      const bounds = L.latLngBounds(stores.map((s) => [s.lat, s.lon]));
      bounds.extend([center.lat, center.lon]);
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    }

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current.clear();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stores, center]);

  // Update marker icon when selectedOsmId changes without rebuilding map
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const L = require('leaflet');
    markersRef.current.forEach((marker, osmId) => {
      const idx = stores.findIndex((s) => s.osmId === osmId);
      marker.setIcon(makeIcon(L, osmId === selectedOsmId, idx + 1));
    });
  }, [selectedOsmId, ready, stores]);

  if (!ready) {
    return (
      <div style={loadingStyle}>
        <span style={{ color: '#9CA3AF', fontSize: 13 }}>Loading map…</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height: MAP_HEIGHT, width: '100%', background: '#e8f0e4' }}
    />
  );
}

function makeIcon(L: any, selected: boolean, num: number) {
  const bg = selected ? PRIMARY : '#fff';
  const color = selected ? '#fff' : PRIMARY;
  const border = selected ? PRIMARY : '#D1D5DB';
  const shadow = selected
    ? '0 2px 8px rgba(29,158,117,0.5)'
    : '0 1px 4px rgba(0,0,0,0.2)';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;
      background:${bg};
      border-radius:50%;
      border:2px solid ${border};
      box-shadow:${shadow};
      display:flex;align-items:center;justify-content:center;
      color:${color};font-size:11px;font-weight:700;font-family:sans-serif;
      transition:transform 0.15s;
      transform:${selected ? 'scale(1.25)' : 'scale(1)'};
    ">${num}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function makePopupHTML(store: NearbyStore): string {
  const dist =
    store.distanceMi < 0.1
      ? 'Less than 0.1 mi away'
      : `${store.distanceMi.toFixed(1)} mi away`;
  return `
    <div style="font-family:sans-serif;min-width:160px;padding:4px 2px;">
      <div style="font-weight:700;font-size:14px;color:#111827;margin-bottom:2px;">${store.name}</div>
      <div style="font-size:12px;color:#9CA3AF;margin-bottom:10px;">${dist}</div>
      <button id="map-select-${store.osmId}" style="
        width:100%;padding:8px 0;
        background:${PRIMARY};color:#fff;
        border:none;border-radius:8px;
        font-size:13px;font-weight:700;
        cursor:pointer;
      ">Select this store</button>
    </div>
  `;
}

const loadingStyle: React.CSSProperties = {
  height: MAP_HEIGHT,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#F3F4F6',
};
