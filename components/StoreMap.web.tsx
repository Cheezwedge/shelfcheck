import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { NearbyStore } from '../lib/stores';

const PRIMARY = '#1D9E75';
const DEFAULT_HEIGHT = 260;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 520;

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
  const [mapHeight, setMapHeight] = useState(DEFAULT_HEIGHT);
  const isDragging = useRef(false);

  // Keep callbacks in refs so Leaflet event handlers never go stale
  const onHoverRef = useRef(onHover);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Inject Leaflet CSS once
  useEffect(() => {
    if (document.getElementById('leaflet-css')) { setReady(true); return; }
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.onload = () => setReady(true);
    document.head.appendChild(link);
  }, []);

  // Notify Leaflet when container height changes
  useEffect(() => {
    if (mapRef.current) mapRef.current.invalidateSize();
  }, [mapHeight]);

  // Build/rebuild map when ready, stores, or center changes
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const L = require('leaflet');

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
    L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);

    // User location dot
    L.marker([center.lat, center.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:#3B82F6;border-radius:50%;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,0.25);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
      zIndexOffset: -1,
    }).addTo(map);

    stores.forEach((store, idx) => {
      const marker = L.marker([store.lat, store.lon], {
        icon: makeIcon(L, false, idx + 1),
      })
        .addTo(map)
        .bindPopup(makePopupHTML(store), {
          maxWidth: 220,
          closeButton: false,
          autoPan: false,   // ← prevents map from re-centering on popup open
        });

      marker.on('mouseover', () => onHoverRef.current(store.osmId));
      marker.on('mouseout', () => onHoverRef.current(null));
      marker.on('popupopen', () => {
        onHoverRef.current(store.osmId);
        // Wire up the Select button each time the popup opens
        requestAnimationFrame(() => {
          const btn = document.getElementById(`map-select-${store.osmId}`);
          if (btn) btn.onclick = () => onSelectRef.current(store);
        });
      });
      marker.on('popupclose', () => onHoverRef.current(null));

      markersRef.current.set(store.osmId, marker);
    });

    if (stores.length > 1) {
      const bounds = L.latLngBounds(stores.map((s) => [s.lat, s.lon]));
      bounds.extend([center.lat, center.lon]);
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    }

    mapRef.current = map;
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markersRef.current.clear(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stores, center]);

  // Update marker icons when selection changes — never rebuilds the map
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const L = require('leaflet');
    markersRef.current.forEach((marker, osmId) => {
      const idx = stores.findIndex((s) => s.osmId === osmId);
      marker.setIcon(makeIcon(L, osmId === selectedOsmId, idx + 1));
    });
  }, [selectedOsmId, ready, stores]);

  // ── Drag-to-resize handle ──────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startHeight = mapHeight;

    function onMove(ev: MouseEvent | TouchEvent) {
      if (!isDragging.current) return;
      const y = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + (y - startY)));
      setMapHeight(next);
    }
    function onEnd() {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchend', onEnd);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }, [mapHeight]);

  return (
    <div style={{ width: '100%', userSelect: 'none' }}>
      {!ready ? (
        <div style={{ height: mapHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6' }}>
          <span style={{ color: '#9CA3AF', fontSize: 13 }}>Loading map…</span>
        </div>
      ) : (
        <div ref={containerRef} style={{ height: mapHeight, width: '100%', background: '#e8f0e4' }} />
      )}

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        title="Drag to resize map"
        style={{
          height: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F9FAFB',
          borderBottom: '1px solid #F3F4F6',
          cursor: 'ns-resize',
          flexShrink: 0,
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#D1D5DB' }} />
      </div>
    </div>
  );
}

function makeIcon(L: any, selected: boolean, num: number) {
  const bg = selected ? PRIMARY : '#fff';
  const color = selected ? '#fff' : PRIMARY;
  const border = selected ? PRIMARY : '#D1D5DB';
  const shadow = selected ? '0 2px 8px rgba(29,158,117,0.5)' : '0 1px 4px rgba(0,0,0,0.2)';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;
      background:${bg};border-radius:50%;
      border:2px solid ${border};box-shadow:${shadow};
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
  const dist = store.distanceMi < 0.1 ? 'Less than 0.1 mi away' : `${store.distanceMi.toFixed(1)} mi away`;
  return `
    <div style="font-family:sans-serif;min-width:160px;padding:4px 2px;">
      <div style="font-weight:700;font-size:14px;color:#111827;margin-bottom:2px;">${store.name}</div>
      <div style="font-size:12px;color:#9CA3AF;margin-bottom:10px;">${dist}</div>
      <button id="map-select-${store.osmId}" style="
        width:100%;padding:8px 0;
        background:${PRIMARY};color:#fff;
        border:none;border-radius:8px;
        font-size:13px;font-weight:700;cursor:pointer;
      ">Select this store</button>
    </div>
  `;
}
