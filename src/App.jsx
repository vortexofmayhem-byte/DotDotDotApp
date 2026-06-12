import { useState, useEffect, useRef, useCallback } from "react";

const YELLOW = "#FFE000";
const BLACK  = "#0a0a0a";
const GREEN  = "#00FF41";
const RED    = "#FF2020";

// ─── Fake users ───────────────────────────────────────────────────────────────
// NYC-specific users scattered across the five boroughs
const NYC_USERS = [
  { id:101, lon:-73.97, lat:40.78 }, { id:102, lon:-73.95, lat:40.75 }, // Manhattan
  { id:103, lon:-73.98, lat:40.72 }, { id:104, lon:-73.93, lat:40.82 },
  { id:105, lon:-73.95, lat:40.85 }, { id:106, lon:-73.99, lat:40.70 },
  { id:107, lon:-73.92, lat:40.65 }, { id:108, lon:-73.89, lat:40.67 }, // Brooklyn
  { id:109, lon:-73.96, lat:40.60 }, { id:110, lon:-73.87, lat:40.72 }, // Queens
  { id:111, lon:-73.90, lat:40.75 }, { id:112, lon:-73.83, lat:40.76 },
  { id:113, lon:-73.88, lat:40.85 }, { id:114, lon:-73.85, lat:40.88 }, // Bronx
  { id:115, lon:-73.92, lat:40.90 }, { id:116, lon:-74.12, lat:40.58 }, // Staten Island
  { id:117, lon:-74.18, lat:40.55 }, { id:118, lon:-74.08, lat:40.62 },
];

const FAKE_USERS = [
  { id: 1, lon: -74, lat: 40.7 },   { id: 2, lon: -0.1, lat: 51.5 },
  { id: 3, lon: 2.3, lat: 48.8 },   { id: 4, lon: 139.7, lat: 35.7 },
  { id: 5, lon: 151.2, lat: -33.8 },{ id: 6, lon: -43.1, lat: -22.9 },
  { id: 7, lon: 37.6, lat: 55.7 },  { id: 8, lon: 77.2, lat: 28.6 },
  { id: 9, lon: -87.6, lat: 41.8 }, { id: 10, lon: -118.2, lat: 34 },
  { id: 11, lon: 18.4, lat: -33.9 },{ id: 12, lon: 103.8, lat: 1.3 },
  { id: 13, lon: -58.4, lat: -34.6 },{ id: 14, lon: 28.9, lat: 41 },
  { id: 15, lon: 116.4, lat: 39.9 },{ id: 16, lon: -99.1, lat: 19.4 },
  { id: 17, lon: 31.2, lat: 30.1 }, { id: 18, lon: -46.6, lat: -23.5 },
  { id: 19, lon: 72.8, lat: 19 },   { id: 20, lon: -3.7, lat: 40.4 },
];

// ─── DEV: set to test borough highlight ("manhattan"|"brooklyn"|"queens"|"bronx"|"staten"|null) ──
const DEV_BOROUGH = "brooklyn"; // ← change this to test, set null for real IP detection

// ─── Borough detection ───────────────────────────────────────────────────────
const BOROUGH_BOUNDS = {
  manhattan: { latMin:40.68, latMax:40.88, lonMin:-74.02, lonMax:-73.91 },
  brooklyn:  { latMin:40.57, latMax:40.74, lonMin:-74.04, lonMax:-73.83 },
  queens:    { latMin:40.54, latMax:40.80, lonMin:-73.96, lonMax:-73.70 },
  bronx:     { latMin:40.78, latMax:40.92, lonMin:-73.93, lonMax:-73.75 },
  staten:    { latMin:40.50, latMax:40.65, lonMin:-74.26, lonMax:-74.05 },
};

function detectBorough(lat, lon) {
  for (const [name, b] of Object.entries(BOROUGH_BOUNDS)) {
    if (lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax)
      return name;
  }
  return null; // outside NYC
}

// ─── Globe ────────────────────────────────────────────────────────────────────
function Globe({ onRegionSelect }) {
  const rotRef  = useRef({ y: 0, x: 15 });   // actual rotation (not in state — updated in rAF)
  const velRef  = useRef({ y: 0.3, x: 0 });  // angular velocity
  const [rot, setRot]   = useState({ y: 0, x: 15 }); // for render
  const [hovered, setHovered] = useState(null);
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0, t: 0 });
  const recentRef = useRef([]); // last few move events for throw velocity
  const rafRef = useRef(null);

  // ── Option B constellation reveal ──
  const [ringOpacity, setRingOpacity]   = useState(0);
  const [dotsOpacity, setDotsOpacity]   = useState(0);
  const [gridOpacity, setGridOpacity]   = useState(0);
  const [contOpacity, setContOpacity]   = useState(0);

  useEffect(() => {
    const t0 = setTimeout(() => setRingOpacity(1),  100);
    const t1 = setTimeout(() => setDotsOpacity(1),  280);
    const t2 = setTimeout(() => setGridOpacity(1),  650);
    const t3 = setTimeout(() => setContOpacity(1), 1000);
    return () => [t0,t1,t2,t3].forEach(clearTimeout);
  }, []);

  // Physics loop — runs every frame
  useEffect(() => {
    const FRICTION_Y  = 0.97;
    const FRICTION_X  = 0.94;
    const AUTO_SPIN   = 0.18; // gentle idle spin added when vel is low
    const MAX_X       = 55;

    function loop() {
      if (!draggingRef.current) {
        // Apply friction
        velRef.current.y *= FRICTION_Y;
        velRef.current.x *= FRICTION_X;
        // Gentle idle spin when nearly stopped
        if (Math.abs(velRef.current.y) < 0.25) {
          velRef.current.y += (AUTO_SPIN - velRef.current.y) * 0.04;
        }
        // Clamp X and add spring back to 0
        rotRef.current.x += velRef.current.x;
        rotRef.current.x = Math.max(-MAX_X, Math.min(MAX_X, rotRef.current.x));
        if (Math.abs(rotRef.current.x) > MAX_X * 0.9) {
          velRef.current.x *= -0.3; // bounce
        }
        // Spring X back toward 0 gently
        rotRef.current.x += (0 - rotRef.current.x) * 0.02;
      }
      rotRef.current.y += velRef.current.y;
      setRot({ y: rotRef.current.y, x: rotRef.current.x });
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  function getClient(e) {
    return e.touches
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };
  }

  const dragDistRef = useRef(0);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });

  const onMouseDown = (e) => {
    draggingRef.current = true;
    const c = getClient(e);
    lastMouseRef.current = { ...c, t: performance.now() };
    recentRef.current = [{ ...c, t: performance.now() }];
    mouseDownPosRef.current = { x: c.x, y: c.y };
    dragDistRef.current = 0;
    velRef.current = { y: 0, x: 0 };
  };

  const onMouseMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const c  = getClient(e);
    const dx = c.x - lastMouseRef.current.x;
    const dy = c.y - lastMouseRef.current.y;
    rotRef.current.y += dx * 0.55;
    rotRef.current.x += dy * 0.35;
    dragDistRef.current += Math.hypot(dx, dy);
    lastMouseRef.current = { ...c, t: performance.now() };
    recentRef.current.push({ ...c, t: performance.now() });
    if (recentRef.current.length > 6) recentRef.current.shift();
  }, []);

  const onMouseUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    // Compute throw velocity from recent pointer history
    const pts = recentRef.current;
    if (pts.length >= 2) {
      const first = pts[0];
      const last  = pts[pts.length - 1];
      const dt    = Math.max(1, last.t - first.t);
      velRef.current.y = ((last.x - first.x) / dt) * 14;
      velRef.current.x = ((last.y - first.y) / dt) * 8;
      // Cap velocity
      velRef.current.y = Math.max(-18, Math.min(18, velRef.current.y));
      velRef.current.x = Math.max(-10, Math.min(10, velRef.current.x));
    }
  };

  const onTouchStart = (e) => onMouseDown(e);
  const onTouchMove  = (e) => { e.preventDefault(); onMouseMove(e); };
  const onTouchEnd   = () => onMouseUp();

  const rotY = rot.y;
  const rotX = rot.x;

  const R = 130;
  function project(lon, lat) {
    const phi = (lat * Math.PI) / 180;
    const theta = ((lon + rotY) * Math.PI) / 180;
    const tiltRad = (rotX * Math.PI) / 180;
    const x = Math.cos(phi) * Math.sin(theta);
    const y = Math.sin(phi) * Math.cos(tiltRad) - Math.cos(phi) * Math.cos(theta) * Math.sin(tiltRad);
    const z = Math.sin(phi) * Math.sin(tiltRad) + Math.cos(phi) * Math.cos(theta) * Math.cos(tiltRad);
    return { sx: x * R, sy: -y * R, z };
  }
  function latCircle(lat, seg = 60) {
    return Array.from({ length: seg + 1 }, (_, i) => project((i / seg) * 360 - 180, lat));
  }
  function lonLine(lon, seg = 30) {
    return Array.from({ length: seg + 1 }, (_, i) => project(lon, -90 + (i / seg) * 180));
  }
  function ptsToPath(pts) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${(p.sx + 160).toFixed(1)} ${(p.sy + 160).toFixed(1)}`).join(" ");
  }
  const continents = {
    na: [[-165,70],[-50,70],[-50,25],[-80,10],[-110,15],[-165,60]],
    sa: [[-80,10],[-50,10],[-35,-5],[-40,-55],[-70,-55],[-80,0]],
    eu: [[-10,35],[40,35],[40,70],[-10,70]],
    af: [[-18,35],[50,35],[50,-35],[-18,-35]],
    as: [[40,10],[145,10],[145,70],[40,70]],
    oc: [[110,-10],[160,-10],[160,-50],[110,-50]],
  };
  function continentPath(pts) {
    return pts.map((p, i) => { const pr = project(p[0], p[1]); return `${i === 0 ? "M" : "L"} ${(pr.sx + 160).toFixed(1)} ${(pr.sy + 160).toFixed(1)}`; }).join(" ") + " Z";
  }
  function regionCenter(pts) {
    let ax = 0, ay = 0;
    pts.forEach(p => { ax += p[0]; ay += p[1]; });
    return project(ax / pts.length, ay / pts.length);
  }
  const latLines = [-60, -30, 0, 30, 60];
  const lonLines = Array.from({ length: 12 }, (_, i) => i * 30);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
      <div style={{ fontFamily: "'Courier New', monospace", color: GREEN, fontSize: "clamp(11px,2vw,14px)", letterSpacing: "0.3em", opacity: 0.8 }}>◈ SELECT REGION ◈</div>
      <div onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ cursor: draggingRef.current ? "grabbing" : "grab", userSelect: "none" }}>
        <svg width="320" height="320" viewBox="0 0 320 320" style={{ filter: "drop-shadow(0 0 30px rgba(0,255,65,0.3))" }}>
          {/* Outer ring */}
          <circle cx="160" cy="160" r={R + 4} fill="none" stroke={GREEN} strokeWidth="0.5"
            opacity={0.3 * ringOpacity} style={{ transition:"opacity 0.5s ease" }} />
          <circle cx="160" cy="160" r={R} fill="rgba(0,0,0,0.85)" />

          {/* Grid — fades in as block */}
          <g opacity={gridOpacity} style={{ transition:"opacity 0.7s ease" }}>
            {latLines.map(lat => <path key={`lat-${lat}`} d={ptsToPath(latCircle(lat))} fill="none" stroke={GREEN} strokeWidth="0.4" opacity="0.15" />)}
            {lonLines.map(lon => <path key={`lon-${lon}`} d={ptsToPath(lonLine(lon))} fill="none" stroke={GREEN} strokeWidth="0.4" opacity="0.15" />)}
          </g>

          {/* Continents — materialise last */}
          {Object.entries(continents).map(([key, pts]) => {
            const center = regionCenter(pts);
            const isH = hovered === key;
            if (!pts.every(p => project(p[0], p[1]).z > -0.1)) return null;
            return (
              <path key={key} d={continentPath(pts)}
                fill={isH ? "rgba(0,255,65,0.25)" : "rgba(0,255,65,0.08)"}
                stroke={GREEN} strokeWidth={isH ? 1.5 : 0.8}
                opacity={center.z < 0 ? 0 : Math.min(contOpacity, center.z + 0.5)}
                style={{ cursor: "pointer", transition: "opacity 0.6s ease, fill 0.15s" }}
                onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)}
                onClick={() => { if (dragDistRef.current < 6) onRegionSelect(key); }} />
            );
          })}

          {/* User dots — spark in first, staggered */}
          {FAKE_USERS.map((u, i) => {
            const p = project(u.lon, u.lat);
            if (p.z < 0.1) return null;
            return <circle key={u.id} cx={p.sx + 160} cy={p.sy + 160} r={2.5}
              fill={YELLOW}
              opacity={dotsOpacity * Math.min(1, p.z + 0.3)}
              style={{ transition:`opacity 0.25s ease ${i * 0.07}s` }} />;
          })}

          {/* Hover labels */}
          {Object.entries(continents).map(([key, pts]) => {
            if (hovered !== key) return null;
            const center = regionCenter(pts);
            if (center.z < 0.1) return null;
            const label = { na:"N. AMERICA", sa:"S. AMERICA", eu:"EUROPE", af:"AFRICA", as:"ASIA", oc:"OCEANIA" }[key];
            return <text key={`lbl-${key}`} x={center.sx + 160} y={center.sy + 160} textAnchor="middle" dominantBaseline="middle" fill={YELLOW} fontSize="9" fontFamily="'Courier New', monospace" fontWeight="bold" style={{ pointerEvents: "none" }}>{label}</text>;
          })}

          {/* Outer border ring */}
          <circle cx="160" cy="160" r={R} fill="none" stroke={GREEN} strokeWidth="1.5"
            opacity={ringOpacity} style={{ transition:"opacity 0.5s ease" }} />
        </svg>
      </div>
      <div style={{ fontFamily: "'Courier New', monospace", color: GREEN, fontSize: "11px", opacity: 0.5, letterSpacing: "0.2em" }}>DRAG TO ROTATE · CLICK REGION</div>
    </div>
  );
}

// ─── MapDot — individual dot with its own interaction state ─────────────────
// ─── MapDot ──────────────────────────────────────────────────────────────────
function MapDot({ pos, dotRef, isConnected, onConnect, dimmed, dragOffset, collapseScale, reappearing, onMouseDown, onTouchStart: onTouchStartProp }) {
  const [phase, setPhase] = useState("idle"); // idle | hovered | connected

  useEffect(() => {
    if (!isConnected && (phase === "connected")) setPhase("idle");
  }, [isConnected]);

  function handleMouseEnter() {
    if (phase === "idle" && !dimmed) setPhase("hovered");
  }
  function handleMouseLeave() {
    if (phase === "hovered") setPhase("idle");
  }
  function handleClick() {
    if (phase === "hovered") { setPhase("connected"); onConnect(); }
  }

  // Hit area is always 34px so hover triggers as cursor approaches the dot
  const outerSize  = 34;
  const outerBg    = phase === "idle" ? "transparent" : phase === "hovered" ? YELLOW : GREEN;
  const outerBorder = "none";
  const innerSize  = phase === "idle" ? 0 : 13;

  // The visible dot — 11px idle, expands to full on hover
  const visibleSize = phase === "idle" ? 11 : 34;
  const visibleBorder = phase === "idle" ? `1.5px solid ${GREEN}` : "none";

  // When being dragged, offset the dot visually
  const tx = isConnected && dragOffset ? dragOffset.x : 0;
  const ty = isConnected && dragOffset ? dragOffset.y : 0;

  return (
    <div
      ref={dotRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStartProp}
      style={{
        position: "absolute",
        left: `${pos.x}%`, top: `${pos.y}%`,
        transform: reappearing
          ? undefined  // handled by animation
          : `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${collapseScale ?? 1})`,
        animation: reappearing ? "dot-reappear 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards" : "none",
        cursor: phase === "connected" ? "grab" : phase === "idle" ? "default" : "pointer",
        zIndex: phase === "connected" ? 30 : phase !== "idle" ? 20 : 10,
        width: outerSize, height: outerSize,
        borderRadius: "50%",
        background: outerBg,
        border: outerBorder,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: collapseScale === 0
          ? "transform 0.13s cubic-bezier(0.9,0,1,0.6), opacity 0.13s"
          : dragOffset
          ? "width 0.15s, height 0.15s, background 0.15s"
          : "width 0.22s cubic-bezier(0.34,1.4,0.64,1), height 0.22s cubic-bezier(0.34,1.4,0.64,1), background 0.18s, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        opacity: dimmed ? 0.2 : 1,
        boxShadow: "none",
        touchAction: "none",
      }}
    >
      {phase === "idle" && (
        <div style={{
          position: "absolute", inset: "-4px", borderRadius: "50%",
          border: `1px solid ${GREEN}`,
          animation: "pulse-ring 2.2s ease-out infinite",
          opacity: 0.3, pointerEvents: "none",
        }} />
      )}
      {/* Visible dot — grows from 11px to 34px on approach */}
      <div style={{
        width: visibleSize, height: visibleSize,
        borderRadius: "50%",
        background: outerBg,
        border: visibleBorder,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "width 0.18s cubic-bezier(0.34,1.4,0.64,1), height 0.18s cubic-bezier(0.34,1.4,0.64,1), background 0.15s, border 0.15s",
        flexShrink: 0,
        boxShadow: "none",
      }}>
        {phase !== "idle" && (
          <div style={{
            width: innerSize, height: innerSize, borderRadius: "50%",
            background: BLACK,
            transition: "width 0.18s ease, height 0.18s ease",
            flexShrink: 0,
          }} />
        )}
      </div>
    </div>
  );
}

// ─── Map karaoke hint ────────────────────────────────────────────────────────
function MapKaraoke({ text }) {
  const words = text.split(" ");
  const [activeWord, setActiveWord] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    setActiveWord(0);
    let i = 0;
    function step() {
      i++;
      if (i < words.length) {
        setActiveWord(i);
        timerRef.current = setTimeout(step, 420);
      } else {
        // loop back after pause
        timerRef.current = setTimeout(() => {
          setActiveWord(0);
          i = 0;
          timerRef.current = setTimeout(step, 420);
        }, 1200);
      }
    }
    timerRef.current = setTimeout(step, 420);
    return () => clearTimeout(timerRef.current);
  }, [text]);

  return (
    <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:"0 8px" }}>
      {words.map((word, i) => (
        <span key={i} style={{
          fontFamily:"'Courier New', monospace",
          fontSize:"11px",
          letterSpacing:"0.18em",
          color: i === activeWord ? GREEN : "rgba(0,255,65,0.22)",
          textShadow: i === activeWord ? `0 0 10px ${GREEN}` : "none",
          fontWeight: i === activeWord ? "bold" : "normal",
          transition:"color 0.12s ease, text-shadow 0.12s ease",
        }}>
          {word}
        </span>
      ))}
    </div>
  );
}

// ─── Map cycle title — rotates region name and instruction ──────────────────
function MapCycleTitle({ regionId, regionLabels }) {
  const lines = [
    regionLabels[regionId] || regionId.toUpperCase(),
    "CLICK DOT TO CALL",
    "DRAG TO RED TO LEAVE",
  ];
  const colors = [GREEN, YELLOW, YELLOW];
  const [idx, setIdx]             = useState(0);
  const [animating, setAnimating] = useState(false);
  const [next, setNext]           = useState(1);

  useEffect(() => { setIdx(0); setAnimating(false); }, [regionId]);

  useEffect(() => {
    const t = setInterval(() => {
      const n = (idx + 1) % lines.length;
      setNext(n); setAnimating(true);
      setTimeout(() => { setIdx(n); setAnimating(false); }, 400);
    }, 3000);
    return () => clearInterval(t);
  }, [idx, regionId]);

  return (
    <div style={{ height:20, overflow:"hidden", position:"relative", display:"flex", justifyContent:"center", alignItems:"center", minWidth:220 }}>
      <div style={{
        position:"absolute",
        fontFamily:"'Courier New', monospace", fontSize:"13px", letterSpacing:"0.25em",
        color: colors[idx], opacity: animating ? 0 : 0.8,
        transform: animating ? "translateY(-120%)" : "translateY(0)",
        transition: animating ? "transform 0.35s ease-in, opacity 0.2s ease" : "none",
        whiteSpace:"nowrap",
      }}>
        {lines[idx]}
      </div>
      {animating && (
        <div style={{
          position:"absolute",
          fontFamily:"'Courier New', monospace", fontSize:"13px", letterSpacing:"0.25em",
          color: colors[next], opacity:0.8,
          whiteSpace:"nowrap",
          animation:"mct-up 0.35s ease-out forwards",
        }}>
          {lines[next]}
        </div>
      )}
      <style>{`@keyframes mct-up { from{transform:translateY(120%);opacity:0} to{transform:translateY(0);opacity:0.8} }`}</style>
    </div>
  );
}

// ─── Back button with hover ──────────────────────────────────────────────────
function BackButton({ onBack }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onBack}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? BLACK : "none",
        border: hov ? `1px solid ${GREEN}` : "1px solid transparent",
        color: hov ? GREEN : GREEN,
        fontFamily:"'Courier New', monospace",
        fontSize:"13px", letterSpacing:"0.2em",
        cursor:"pointer", opacity: 1,
        padding:"3px 10px",
        transition:"all 0.15s ease",
        pointerEvents:"all",
      }}
    >
      <span style={{ display:"inline-flex", alignItems:"center", gap:6, lineHeight:1 }}>
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none"
          style={{ display:"block", animation:"arrow-bounce 1.2s ease-in-out infinite", flexShrink:0, position:"relative", top:"0.5px" }}>
          <polyline points="8,2 3,7 8,12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="3" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        BACK
      </span>
    </button>
  );
}

// ─── MapView ──────────────────────────────────────────────────────────────────
function MapView({ regionId, onBack, borough }) {
  const [connectedId, setConnectedId] = useState(null);

  // ── Pan state (canvas drag via any idle dot) ──
  const [panOffset, setPanOffset]     = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning]     = useState(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const [nearDot, setNearDot] = useState(false);
  const PAN_LIMIT = 320; // max px you can drag before elastic resistance kicks in
  const [edges, setEdges] = useState({ left:false, right:false, top:false, bottom:false });
  const [showHint, setShowHint] = useState(true);

  // ── Connected dot drag state (hang-up) ──
  const [dragging, setDragging]       = useState(false);
  const [dragOffset, setDragOffset]   = useState({ x: 0, y: 0 });
  const hangTimers = useRef([]);

  // ── Globe audio ──
  const globeAudioCtx = useRef(null);
  const globeRingRef  = useRef(null);

  function getGlobeCtx() {
    if (!globeAudioCtx.current)
      globeAudioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    return globeAudioCtx.current;
  }

  function playGlobeRingBurst() {
    const ctx = getGlobeCtx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.setValueAtTime(0.15, now + 0.38);
    gain.gain.linearRampToValueAtTime(0, now + 0.42);
    gain.connect(ctx.destination);
    [350, 440].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.44);
    });
  }

  function startGlobeRinging() {
    playGlobeRingBurst();
    globeRingRef.current = setInterval(playGlobeRingBurst, 1200);
  }

  function stopGlobeRinging() {
    clearInterval(globeRingRef.current);
    globeRingRef.current = null;
  }

  function playGlobeConnect() {
    stopGlobeRinging();
    const ctx = getGlobeCtx();
    const now = ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.1 + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.2);
    });
  }

  function playGlobeHangUp() {
    stopGlobeRinging();
    const ctx = getGlobeCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.linearRampToValueAtTime(300, now + 0.3);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  // ── Hang-up animation phases ──
  const [hangPhase, setHangPhase]     = useState(null);
  const [reappearId, setReappearId]   = useState(null);

  const dragStart   = useRef({ mx: 0, my: 0 });
  const dotRefs     = useRef({});
  const containerRef = useRef(null);
  // Absolute screen position of connected dot for floating render outside pan canvas
  const [floatingDotBase, setFloatingDotBase] = useState(null);

  const regionBounds = {
    na:{lonMin:-165,lonMax:-50,latMin:10,latMax:75}, sa:{lonMin:-85,lonMax:-30,latMin:-60,latMax:15},
    eu:{lonMin:-15,lonMax:45,latMin:30,latMax:75},   af:{lonMin:-20,lonMax:55,latMin:-40,latMax:40},
    as:{lonMin:35,lonMax:150,latMin:0,latMax:75},    oc:{lonMin:105,lonMax:180,latMin:-50,latMax:0},
    // NYC boroughs — tight lon/lat boxes
    manhattan:{lonMin:-74.02,lonMax:-73.91,latMin:40.68,latMax:40.88},
    brooklyn: {lonMin:-74.04,lonMax:-73.83,latMin:40.57,latMax:40.74},
    queens:   {lonMin:-73.96,lonMax:-73.70,latMin:40.54,latMax:40.80},
    bronx:    {lonMin:-73.93,lonMax:-73.75,latMin:40.78,latMax:40.92},
    staten:   {lonMin:-74.26,lonMax:-74.05,latMin:40.50,latMax:40.65},
  };
  const bounds = regionBounds[regionId];
  const nycBoroughs = ["manhattan","brooklyn","queens","bronx","staten"];
  const liveUsers = usePresence(regionId);
  // Use live users if any, fallback to fake for dev/demo
  const userPool = liveUsers.length > 0 ? liveUsers :
    (nycBoroughs.includes(regionId) ? NYC_USERS : FAKE_USERS);
  const regionUsers = userPool.filter(u =>
    !u.lon || (u.lon >= bounds.lonMin && u.lon <= bounds.lonMax &&
    u.lat >= bounds.latMin && u.lat <= bounds.latMax)
  );
  const [jittered] = useState(() => regionUsers.map(u => {
    // If user has real coords use them, otherwise seed random from uid
    if (u.lon && u.lat) return { ...u };
    const seed = (u.uid || u.id || "").split("").reduce((a,c)=>a+c.charCodeAt(0),0);
    const lonRange = bounds.lonMax - bounds.lonMin;
    const latRange = bounds.latMax - bounds.latMin;
    return {
      ...u,
      lon: bounds.lonMin + ((seed * 7919) % 1000) / 1000 * lonRange,
      lat: bounds.latMin + ((seed * 6271) % 1000) / 1000 * latRange,
    };
  }));

  function userToPercent(u) {
    return {
      x: Math.max(4, Math.min(96, ((u.lon - bounds.lonMin) / (bounds.lonMax - bounds.lonMin)) * 100)),
      y: Math.max(4, Math.min(90, ((bounds.latMax - u.lat) / (bounds.latMax - bounds.latMin)) * 100)),
    };
  }
  const regionLabels = { na:"NORTH AMERICA", sa:"SOUTH AMERICA", eu:"EUROPE", af:"AFRICA", as:"ASIA", oc:"OCEANIA", manhattan:"MANHATTAN", brooklyn:"BROOKLYN", queens:"QUEENS", bronx:"THE BRONX", staten:"STATEN ISLAND" };

  function getRedCenter() {
    const con = containerRef.current;
    if (!con) return { x: 0, y: 0 };
    const r = con.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // ── Pan: start when grabbing an idle dot ──
  function startPan(e) {
    if (connectedId !== null) return; // lock pan during call
    e.preventDefault();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    setIsPanning(true);
    panStart.current = { mx: cx, my: cy, px: panOffset.x, py: panOffset.y };
  }

  // ── Hang-up drag: start when grabbing the connected dot ──
  function startDrag(e) {
    if (connectedId === null || hangPhase) return;
    e.preventDefault();
    e.stopPropagation();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    // Set floating base to current dot screen position
    const el = dotRefs.current[connectedId];
    const con = containerRef.current;
    if (el && con) {
      const er = el.getBoundingClientRect();
      const cr = con.getBoundingClientRect();
      setFloatingDotBase({ x: er.left + er.width/2 - cr.left, y: er.top + er.height/2 - cr.top });
    }
    setDragging(true);
    setDragOffset({ x: 0, y: 0 });
    dragStart.current = { mx: cx, my: cy };
  }

  // ── Unified move handler ──
  function onPointerMove(e) {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;

    if (isPanning) {
      const rawX = panStart.current.px + (cx - panStart.current.mx);
      const rawY = panStart.current.py + (cy - panStart.current.my);
      // Elastic resistance beyond PAN_LIMIT — compress extra distance by 70%
      const elasticClamp = (v, limit) => {
        if (Math.abs(v) <= limit) return v;
        const sign = v > 0 ? 1 : -1;
        const over = Math.abs(v) - limit;
        return sign * (limit + over * 0.28);
      };
      const ex = elasticClamp(rawX, PAN_LIMIT);
      const ey = elasticClamp(rawY, PAN_LIMIT);
      setPanOffset({ x: ex, y: ey });
      // Which edges are we pressing against?
      setEdges({
        left:   rawX >  PAN_LIMIT * 0.85,
        right:  rawX < -PAN_LIMIT * 0.85,
        top:    rawY >  PAN_LIMIT * 0.85,
        bottom: rawY < -PAN_LIMIT * 0.85,
      });
    }
    if (dragging) {
      setDragOffset({ x: cx - dragStart.current.mx, y: cy - dragStart.current.my });
    }

    // Check if cursor is near any dot (50px radius) — switch cursor to default
    const close = Object.values(dotRefs.current).some(el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      return Math.hypot(cx - ex, cy - ey) < 50;
    });
    setNearDot(close);
  }

  // ── Unified release handler ──
  function onPointerUp() {
    if (isPanning) {
      setIsPanning(false);
      setEdges({ left:false, right:false, top:false, bottom:false });
      setShowHint(false); // hide once they've panned
      // Snap back within bounds if over-stretched
      setPanOffset(prev => ({
        x: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, prev.x)),
        y: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, prev.y)),
      }));
    }
    if (dragging) {
      setDragging(false);
      // Use the floating dot's actual screen position (base + drag offset)
      if (floatingDotBase) {
        const con = containerRef.current;
        if (con) {
          const cr = con.getBoundingClientRect();
          // Floating dot position in screen coords
          const dotScreenX = cr.left + floatingDotBase.x + dragOffset.x;
          const dotScreenY = cr.top  + floatingDotBase.y + dragOffset.y;
          const red = getRedCenter();
          const dist = Math.hypot(dotScreenX - red.x, dotScreenY - red.y);
          if (dist < 60) { triggerAbsorb(); return; }
        }
      }
      setDragOffset({ x: 0, y: 0 });
      setFloatingDotBase(null);
    }
  }

  function clearHangTimers() { hangTimers.current.forEach(clearTimeout); hangTimers.current = []; }

  function triggerAbsorb() {
    clearHangTimers();
    playGlobeHangUp();
    if (onHangUp) onHangUp();
    setDragging(false);
    const id = connectedId;
    setHangPhase('sucking');
    setDragOffset({ x: 0, y: 0 });
    hangTimers.current.push(setTimeout(() => setHangPhase('xflash'), 130));
    hangTimers.current.push(setTimeout(() => {
      setHangPhase('reappear');
      setReappearId(id);
      setConnectedId(null);
    }, 280));
    hangTimers.current.push(setTimeout(() => {
      setHangPhase(null);
      setReappearId(null);
      setFloatingDotBase(null);
    }, 650));
  }

  useEffect(() => () => clearHangTimers(), []);

  // ── Positions ──
  const [connectedDotPos, setConnectedDotPos] = useState(null);
  const [containerSize, setContainerSize]     = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setContainerSize({ w: r.width, h: r.height });
  }, [connectedId]);

  useEffect(() => {
    if (connectedId === null) { setConnectedDotPos(null); return; }
    const con = containerRef.current;
    const dotEl = dotRefs.current[connectedId];
    if (!con || !dotEl) return;
    const conRect = con.getBoundingClientRect();
    const dotRect = dotEl.getBoundingClientRect();
    setConnectedDotPos({
      x: dotRect.left + dotRect.width / 2 - conRect.left,
      y: dotRect.top  + dotRect.height / 2 - conRect.top,
    });
  }, [connectedId, panOffset]);

  const redCenter  = { x: containerSize.w / 2, y: containerSize.h / 2 };
  const liveDotPos = connectedDotPos
    ? { x: connectedDotPos.x + dragOffset.x, y: connectedDotPos.y + dragOffset.y }
    : null;

  const redSize = (hangPhase === 'sucking' || hangPhase === 'xflash' || hangPhase === 'reappear') ? 0 : 52;
  const midX = liveDotPos ? (liveDotPos.x + redCenter.x) / 2 : 0;
  const midY = liveDotPos ? (liveDotPos.y + redCenter.y) / 2 : 0;

  const showTether = connectedId !== null && liveDotPos && !hangPhase;
  const showRedDot = connectedId !== null && hangPhase !== 'xflash' && hangPhase !== 'reappear';
  const showXFlash = hangPhase === 'xflash';

  return (
    <div
      ref={containerRef}
      onMouseDown={e => { if (e.target === e.currentTarget) startPan(e); }}
      onTouchStart={e => { if (e.target === e.currentTarget) startPan(e); }}
      style={{ position:"fixed", inset:0, background:"#050f05", zIndex:50, overflow:"hidden", userSelect:"none", cursor: isPanning ? "grabbing" : nearDot ? "default" : "grab" }}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onTouchMove={e => { e.preventDefault(); onPointerMove(e); }}
      onTouchEnd={onPointerUp}
    >
      {/* Pannable canvas — drag the background to pan */}
      <div
        onMouseDown={e => { if (e.target === e.currentTarget) startPan(e); }}
        onTouchStart={e => { if (e.target === e.currentTarget) startPan(e); }}
        style={{
          position:"absolute", inset:0,
          transform:`translate(${panOffset.x}px, ${panOffset.y}px)`,
          transition: isPanning ? "none" : "transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
          cursor: isPanning ? "grabbing" : nearDot ? "default" : "grab",
        }}>
        {/* Grid */}
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }}>
          {Array.from({length:13},(_,i)=><line key={`v${i}`} x1={`${(i/12)*100}%`} y1="0" x2={`${(i/12)*100}%`} y2="100%" stroke={GREEN} strokeWidth="0.4" opacity="0.07"/>)}
          {Array.from({length:9},(_,i)=><line key={`h${i}`} x1="0" y1={`${(i/8)*100}%`} x2="100%" y2={`${(i/8)*100}%`} stroke={GREEN} strokeWidth="0.4" opacity="0.07"/>)}
        </svg>

        {/* Dots */}
        {jittered.map(u => {
          const pos    = userToPercent(u);
          const isConn = connectedId === u.id;
          const isReapp = reappearId === u.id;
          return (
            <MapDot
              key={u.id}
              dotRef={el => dotRefs.current[u.id] = el}
              pos={pos}
              isConnected={isConn}
              onConnect={() => {
                setConnectedId(u.id);
                setDragOffset({ x:0,y:0 });
                // Start ringing, then connect sound after short delay
                startGlobeRinging();
                setTimeout(() => playGlobeConnect(), 1400);
                // Capture screen pos for floating layer
                setTimeout(() => {
                  const el = dotRefs.current[u.id];
                  const con = containerRef.current;
                  if (el && con) {
                    const er = el.getBoundingClientRect();
                    const cr = con.getBoundingClientRect();
                    setFloatingDotBase({ x: er.left + er.width/2 - cr.left, y: er.top + er.height/2 - cr.top });
                  }
                }, 0);
              }}
              dimmed={connectedId !== null && !isConn && !isReapp}
              dragOffset={null}
              collapseScale={isConn && (dragging || hangPhase === 'sucking') ? 0 : 1}
              reappearing={isReapp}
              onMouseDown={isConn ? startDrag : undefined}
              onTouchStart={isConn ? startDrag : undefined}
            />
          );
        })}
      </div>

      {/* Floating green dot — rendered OUTSIDE pan canvas so it's always above red */}
      {floatingDotBase && connectedId !== null && (
        <div
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          style={{
            position: "absolute",
            left: floatingDotBase.x + (dragging ? dragOffset.x : 0),
            top:  floatingDotBase.y + (dragging ? dragOffset.y : 0),
            width: 34, height: 34,
            borderRadius: "50%",
            background: GREEN,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 60,
            cursor: dragging ? "grabbing" : "grab",
            transform: `translate(-50%, -50%) scale(${hangPhase === 'sucking' ? 0 : 1})`,
            transition: hangPhase === 'sucking'
              ? "transform 0.13s cubic-bezier(0.9,0,1,0.6)"
              : "none",
            boxShadow: "none",
          }}>
          <div style={{ width: 13, height: 13, borderRadius: "50%", background: BLACK }} />
        </div>
      )}

      {/* Tether line — fixed coords, outside pan canvas */}
      {showTether && (
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:25 }}>
          <line x1={floatingDotBase ? floatingDotBase.x + dragOffset.x : (liveDotPos ? liveDotPos.x : 0)} y1={floatingDotBase ? floatingDotBase.y + dragOffset.y : (liveDotPos ? liveDotPos.y : 0)} x2={redCenter.x} y2={redCenter.y}
            stroke={RED} strokeWidth="1.2" strokeDasharray="5 6" opacity="0.4" />
        </svg>
      )}
      {showTether && (
        <div style={{
          position:"absolute", left:midX, top:midY, transform:"translate(-50%,-50%)",
          fontFamily:"'Courier New', monospace", fontSize:"10px", letterSpacing:"0.18em",
          color:RED, opacity:0.9, whiteSpace:"nowrap", pointerEvents:"none", zIndex:25,
        }}>DRAG HERE TO HANG UP</div>
      )}

      {/* Red dot — center of screen, outside pan canvas */}
      {showRedDot && (
        <div style={{
          position:"absolute", left:"50%", top:"50%",
          transform:"translate(-50%,-50%)",
          width:redSize, height:redSize,
          borderRadius:"50%", background:RED,
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"width 0.12s ease, height 0.12s ease",
          animation:(dragging || hangPhase) ? "none" : "red-breathe 2.4s ease-in-out infinite",
          pointerEvents:"none", zIndex:5,
        }}>
          {redSize > 14 && <div style={{ width:Math.min(18,redSize*0.45), height:Math.min(18,redSize*0.45), borderRadius:"50%", background:BLACK }} />}
        </div>
      )}

      {/* X flash */}
      {showXFlash && (
        <div style={{
          position:"absolute", left:"50%", top:"50%",
          transform:"translate(-50%,-50%)",
          color:RED, fontSize:"28px", fontWeight:"bold",
          fontFamily:"'Courier New', monospace",
          animation:"x-flash 0.15s ease-out forwards",
          pointerEvents:"none", zIndex:35,
        }}>✕</div>
      )}

      {/* Edge indicators — dashed lines that appear when hitting pan limits */}
      {edges.left && (
        <div style={{
          position:"absolute", left:0, top:0, bottom:0, width:3,
          borderLeft: `2px dashed ${GREEN}`,
          opacity: 0.5, pointerEvents:"none", zIndex:45,
          animation: "edge-pulse 0.8s ease-in-out infinite",
        }} />
      )}
      {edges.right && (
        <div style={{
          position:"absolute", right:0, top:0, bottom:0, width:3,
          borderRight: `2px dashed ${GREEN}`,
          opacity: 0.5, pointerEvents:"none", zIndex:45,
          animation: "edge-pulse 0.8s ease-in-out infinite",
        }} />
      )}
      {edges.top && (
        <div style={{
          position:"absolute", top:0, left:0, right:0, height:3,
          borderTop: `2px dashed ${GREEN}`,
          opacity: 0.5, pointerEvents:"none", zIndex:45,
          animation: "edge-pulse 0.8s ease-in-out infinite",
        }} />
      )}
      {edges.bottom && (
        <div style={{
          position:"absolute", bottom:0, left:0, right:0, height:3,
          borderBottom: `2px dashed ${GREEN}`,
          opacity: 0.5, pointerEvents:"none", zIndex:45,
          animation: "edge-pulse 0.8s ease-in-out infinite",
        }} />
      )}

      {/* Top bar — fixed, outside pan */}
      <div style={{
        position:"absolute", top:20, left:0, right:0,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"0 24px",
        background:"linear-gradient(to bottom, rgba(5,15,5,0.98) 0%, transparent 100%)",
        zIndex:40, pointerEvents:"none",
      }}>
        <BackButton onBack={onBack} />
        <MapCycleTitle regionId={regionId} regionLabels={regionLabels} />
        <div style={{ fontFamily:"'Courier New', monospace", color:YELLOW, fontSize:"13px", letterSpacing:"0.2em", opacity:0.8 }}>{regionUsers.length} ONLINE</div>
      </div>

      {connectedId === null && !hangPhase && regionUsers.length === 0 && (
        <div style={{ position:"absolute", bottom:76, left:0, right:0, textAlign:"center", pointerEvents:"none" }}>
          <div style={{ fontFamily:"'Courier New', monospace", color:GREEN, fontSize:"11px", opacity:0.25, letterSpacing:"0.2em" }}>NO ONE ONLINE IN THIS REGION</div>
        </div>
      )}

      {/* Subtle drag hint — fades in once then dissolves, gone after first pan */}
      {showHint && connectedId === null && !hangPhase && (
        <div style={{
          position:"absolute",
          bottom:96, left:0, right:0,
          textAlign:"center",
          pointerEvents:"none", zIndex:45,
        }}>
          <span style={{
            fontFamily:"'Courier New', monospace",
            fontSize:"10px",
            letterSpacing:"0.25em",
            color:"rgba(255,255,255,0.45)",
            animation:"hint-fadeinout 2.8s ease-in-out 0.4s 1 forwards",
            opacity:0,
          }}>
            drag to explore
          </span>
        </div>
      )}

      <style>{`
        @keyframes arrow-bounce { 0%,100%{transform:translateX(0)} 50%{transform:translateX(-4px)} }
        @keyframes hint-fadeinout {
          0%   { opacity: 0;    }
          20%  { opacity: 0.45; }
          70%  { opacity: 0.45; }
          100% { opacity: 0;    }
        }
        @keyframes edge-pulse {
          0%,100% { opacity: 0.35; }
          50%     { opacity: 0.7;  }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.9); opacity: 0.3; }
          70%  { transform: scale(1.5); opacity: 0;   }
          100% { transform: scale(0.9); opacity: 0;   }
        }
        @keyframes red-breathe {
          0%,100% { transform: translate(-50%,-50%) scale(1); }
          50%     { transform: translate(-50%,-50%) scale(1.07); }
        }
        @keyframes x-flash {
          0%   { transform: translate(-50%,-50%) scale(0.6); opacity: 1; }
          50%  { transform: translate(-50%,-50%) scale(1.1);  opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1);    opacity: 0; }
        }
        @keyframes dot-reappear {
          0%   { transform: translate(-50%,-50%) scale(0);    opacity: 0; }
          60%  { transform: translate(-50%,-50%) scale(1.25); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Incoming Call Screen ────────────────────────────────────────────────────
function IncomingCall({ borough, onAnswer, onDecline }) {
  const [ringScale, setRingScale] = useState(1);
  const rafRef = useRef(null);

  useEffect(() => {
    let t = 0;
    function pulse() {
      t += 0.05;
      setRingScale(1 + Math.sin(t) * 0.07);
      rafRef.current = requestAnimationFrame(pulse);
    }
    rafRef.current = requestAnimationFrame(pulse);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const label = {
    manhattan:"MANHATTAN", brooklyn:"BROOKLYN", queens:"QUEENS",
    bronx:"THE BRONX", staten:"STATEN ISLAND",
    na:"N. AMERICA", sa:"S. AMERICA", eu:"EUROPE",
    af:"AFRICA", as:"ASIA", oc:"OCEANIA",
  }[borough] || (borough || "").toUpperCase();

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      background:"rgba(0,0,0,0.82)",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      animation:"sheet-in 0.35s cubic-bezier(0.25,0.46,0.45,0.94) forwards",
    }}>
      <div style={{ fontFamily:"'Courier New', monospace", fontSize:10, letterSpacing:"0.35em", color:GREEN, opacity:0.5, marginBottom:4 }}>
        INCOMING CALL
      </div>
      <div style={{ fontFamily:"'Courier New', monospace", fontSize:13, letterSpacing:"0.3em", color:GREEN, opacity:0.85, marginBottom:40, fontWeight:"bold" }}>
        {label}
      </div>

      {/* Ripple rings + dot */}
      <div style={{ position:"relative", display:"flex", alignItems:"center", justifyContent:"center", width:180, height:180 }}>
        {[1,2,3].map(i => (
          <div key={i} style={{
            position:"absolute",
            width: 80 + i*40, height: 80 + i*40,
            borderRadius:"50%",
            border:`1px solid rgba(0,255,65,${0.2 - i*0.05})`,
            animation:`incoming-ripple 2s ease-out ${i*0.4}s infinite`,
          }}/>
        ))}
        <div style={{
          width:80, height:80, borderRadius:"50%",
          background:GREEN,
          transform:`scale(${ringScale})`,
          transition:"transform 0.05s linear",
          boxShadow:`0 0 30px rgba(0,255,65,0.4)`,
        }}/>
      </div>

      {/* Answer / Decline */}
      <div style={{ display:"flex", gap:24, marginTop:48 }}>
        {/* Decline */}
        <div onClick={onDecline} style={{
          width:72, height:72, borderRadius:"50%",
          border:`1px solid ${RED}`,
          background:"rgba(255,32,32,0.1)",
          display:"flex", alignItems:"center", justifyContent:"center",
          cursor:"pointer",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke={RED} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        {/* Answer */}
        <div onClick={onAnswer} style={{
          width:72, height:72, borderRadius:"50%",
          border:`1px solid ${GREEN}`,
          background:"rgba(0,255,65,0.1)",
          display:"flex", alignItems:"center", justifyContent:"center",
          cursor:"pointer",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      <style>{`
        @keyframes incoming-ripple { 0%{transform:scale(0.8);opacity:0.5} 100%{transform:scale(1.5);opacity:0} }
        @keyframes sheet-in { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

// ─── DotScreen ────────────────────────────────────────────────────────────────
function DotScreen({ borough, callState, onCall, onHangUp, onCancel }) {
  // phases: idle | searching | connecting | incall | sucking | xflash | growing
  const [phase, setPhase] = useState("idle");
  const [hovering, setHovering] = useState(false);

  const [dotPos, setDotPos]     = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, dx: 0, dy: 0 });
  const containerRef = useRef(null);
  const timers = useRef([]);

  // Red dot state
  const [redRisen, setRedRisen] = useState(false);

  // grow-back scale
  const [growScale, setGrowScale] = useState(1);

  function clearTimers() { timers.current.forEach(clearTimeout); timers.current = []; }

  // ── Audio ──
  const audioCtx = useRef(null);
  const ringIntervalRef = useRef(null);

  function getAudioCtx() {
    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx.current;
  }

  // Single ring burst: two tones (350Hz + 440Hz) for 0.4s, silence for 0.2s — classic phone ring
  function playRingBurst() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.setValueAtTime(0.18, now + 0.38);
    gain.gain.linearRampToValueAtTime(0, now + 0.42);
    gain.connect(ctx.destination);

    [350, 440].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.44);
    });
  }

  function startRinging() {
    playRingBurst();
    ringIntervalRef.current = setInterval(playRingBurst, 1200);
  }

  function stopRinging() {
    clearInterval(ringIntervalRef.current);
    ringIntervalRef.current = null;
  }

  // Connect sound — short rising two-tone chime
  function playConnectSound() {
    stopRinging();
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.1 + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.2);
    });
  }

  // Hang up sound — short descending tone
  function playHangUpSound() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.linearRampToValueAtTime(300, now + 0.3);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  // ── State machine ──
  useEffect(() => {
    if (phase === "searching") {
      startRinging();
      const t = 1800 + Math.random() * 1500;
      const tid = setTimeout(() => setPhase("connecting"), t);
      return () => { clearTimeout(tid); stopRinging(); };
    }
    if (phase === "connecting") {
      const tid = setTimeout(() => {
        setPhase("incall");
        playConnectSound();
        setRedRisen(false);
        setTimeout(() => setRedRisen(true), 300);
      }, 1100);
      return () => clearTimeout(tid);
    }
    if (phase === "idle") {
      setDotPos({ x: 0, y: 0 });
      setRedRisen(false);
      clearTimers();
    }
  }, [phase]);

  useEffect(() => () => clearTimers(), []);

  // ── Helpers ──
  function getRedCenter() {
    // Red dot sits at bottom: 76px from bottom edge, horizontally centered
    const con = containerRef.current;
    if (!con) return { x: 0, y: 0 };
    const r = con.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom - 76 - 18 }; // 18 = half red dot size
  }

  function getDotCenter() {
    const con = containerRef.current;
    if (!con) return { x: 0, y: 0 };
    const r = con.getBoundingClientRect();
    // dot starts at center of container + drag offset
    return { x: r.left + r.width / 2 + dotPos.x, y: r.top + r.height / 2 + dotPos.y };
  }

  // ── Drag ──
  function startDrag(clientX, clientY) {
    if (phase !== "incall") return;
    setIsDragging(true);
    dragStart.current = { mx: clientX, my: clientY, dx: dotPos.x, dy: dotPos.y };
  }

  function moveDrag(clientX, clientY) {
    if (!isDragging || phase !== "incall") return;
    const nx = dragStart.current.dx + (clientX - dragStart.current.mx);
    const ny = dragStart.current.dy + (clientY - dragStart.current.my);
    setDotPos({ x: nx, y: ny });
  }

  function endDrag() {
    if (!isDragging) return;
    setIsDragging(false);

    // Check if black dot overlaps red dot on release
    const dot = getDotCenter();
    const red = getRedCenter();
    const dist = Math.hypot(dot.x - red.x, dot.y - red.y);
    const dotR = 80; // approx half of clamp(120px,30vw,200px) at mid size
    const redR = 18;

    if (dist < dotR + redR) {
      triggerHangUp();
    } else {
      setDotPos({ x: 0, y: 0 });
    }
  }

  function triggerHangUp() {
    clearTimers();
    stopRinging();
    playHangUpSound();
    setPhase("sucking"); // green snaps to nothing instantly
    timers.current.push(setTimeout(() => setPhase("xflash"), 130));
    timers.current.push(setTimeout(() => setPhase("growing"), 280));
    timers.current.push(setTimeout(() => {
      setGrowScale(0);
      setDotPos({ x: 0, y: 0 });
    }, 290));
    timers.current.push(setTimeout(() => {
      setGrowScale(1);
    }, 370));
    timers.current.push(setTimeout(() => setPhase("idle"), 700));
  }

  // ── Derived visuals ──
  const bgColor = (phase === "searching" || phase === "connecting" || phase === "incall" || phase === "sucking" || phase === "xflash" || phase === "growing")
    ? "#00c832" : YELLOW;

  // Proximity of black dot to red dot (0 = far, 1 = touching)
  const redCenter = getRedCenter();
  const conRect = containerRef.current?.getBoundingClientRect();
  const conCenterX = conRect ? conRect.left + conRect.width / 2 : 0;
  const conCenterY = conRect ? conRect.top + conRect.height / 2 : 0;
  const dotAbsX = conCenterX + dotPos.x;
  const dotAbsY = conCenterY + dotPos.y;
  const distToRed = Math.hypot(dotAbsX - redCenter.x, dotAbsY - redCenter.y);
  const proximity = isDragging ? Math.max(0, 1 - distToRed / 220) : 0;

  // Black dot scale: shrinks as it approaches red, snaps to 0 on suck
  const blackScale = phase === "sucking" ? 0
    : phase === "growing" ? growScale
    : isDragging ? 1 - proximity * 0.45
    : 1;

  // Red dot: shrinks to black dot size when overlapping
  const blackVisualSize = 160 * (isDragging ? 1 - proximity * 0.45 : 1);
  const redNaturalSize = 36;
  const redTargetSize = isDragging && proximity > 0.5
    ? redNaturalSize - (redNaturalSize - blackVisualSize * 0.3) * ((proximity - 0.5) * 2)
    : redNaturalSize;
  const redSize = Math.max(0, Math.min(redNaturalSize, redTargetSize));

  const showBlack   = phase !== "xflash";
  const showRed     = (phase === "incall" || phase === "sucking") && redRisen;
  const showX       = phase === "xflash";
  const blackOpacity = phase === "sucking" ? 0 : 1;

  const dotAnim = phase === "searching"
    ? "dot-pulse 1.6s ease-in-out infinite"
    : phase === "incall"
    ? "dot-breathe 3s ease-in-out infinite"
    : "none";

  const statusText = {
    idle: "", searching: "searching...", connecting: "connecting...",
    incall: "drag ● to hang up", sucking: "", xflash: "", growing: "",
  }[phase] ?? "";

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%", height: "100%", position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: bgColor,
        userSelect: "none",
      }}
      onMouseMove={e => moveDrag(e.clientX, e.clientY)}
      onMouseUp={endDrag}
      onTouchMove={e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); }}
      onTouchEnd={endDrag}
    >
      {/* Red dot — rises from bottom */}
      {showRed && (
        <div style={{
          position: "absolute",
          bottom: redRisen ? 76 : -60,
          left: "50%",
          transform: "translateX(-50%)",
          width: redSize, height: redSize,
          borderRadius: "50%",
          background: RED,
          transition: isDragging
            ? "width 0.1s ease, height 0.1s ease"
            : "bottom 0.6s cubic-bezier(0.34,1.4,0.64,1), width 0.3s, height 0.3s",
          pointerEvents: "none",
          zIndex: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ width: redSize * 0.3, height: redSize * 0.3, borderRadius: "50%", background: BLACK }} />
        </div>
      )}

      {/* X flash */}
      {showX && (
        <div style={{
          position: "absolute",
          bottom: 76 + 18 - 20,
          left: "50%", transform: "translateX(-50%)",
          color: RED, fontSize: 38,
          fontFamily: "'Courier New', monospace", fontWeight: "bold",
          animation: "sharp-x 0.15s ease-out forwards",
          zIndex: 15, pointerEvents: "none",
        }}>✕</div>
      )}

      {/* Black dot */}
      {showBlack && (
        <div
          onMouseEnter={() => { if (phase === "idle") setHovering(true); }}
          onMouseLeave={() => setHovering(false)}
          onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
          onTouchStart={e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
          onClick={() => {
            if (phase === "idle") setPhase("searching");
            else if (phase === "searching") { stopRinging(); setPhase("idle"); }
          }}
          style={{
            position: "absolute",
            left: "50%", top: "50%",
            width: "clamp(120px, 30vw, 200px)",
            height: "clamp(120px, 30vw, 200px)",
            borderRadius: "50%",
            background: BLACK,
            transform: `translate(calc(-50% + ${dotPos.x}px), calc(-50% + ${dotPos.y}px)) scale(${blackScale * (hovering && phase === "idle" ? 1.06 : 1)})`,
            transition: phase === "sucking"
              ? "transform 0.13s cubic-bezier(0.9,0,1,0.6), opacity 0.13s"
              : phase === "growing"
              ? "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"
              : isDragging
              ? "transform 0.04s linear"
              : "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)",
            opacity: blackOpacity,
            animation: dotAnim,
            cursor: phase === "incall" ? "grab" : phase === "idle" ? "pointer" : "default",
            zIndex: isDragging ? 12 : 10,
            WebkitUserSelect: "none",
            touchAction: "none",
          }}
        />
      )}



      {/* Status */}
      <div style={{
        position: "absolute",
        bottom: "clamp(80px, 15%, 120px)",
        left: "50%", transform: "translateX(-50%)",
        fontFamily: "'Courier New', monospace",
        fontSize: "clamp(10px, 2.5vw, 13px)",
        color: phase === "incall" ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.4)",
        letterSpacing: "0.18em",
        whiteSpace: "nowrap",
        opacity: statusText ? 1 : 0,
        transition: "opacity 0.4s",
        pointerEvents: "none",
      }}>
        {statusText}
      </div>

      <style>{`
        @keyframes dot-pulse {
          0%,100% { transform: translate(calc(-50% + ${dotPos.x}px), calc(-50% + ${dotPos.y}px)) scale(1); }
          50%      { transform: translate(calc(-50% + ${dotPos.x}px), calc(-50% + ${dotPos.y}px)) scale(0.9); }
        }
        @keyframes dot-breathe {
          0%,100% { box-shadow: 0 8px 40px rgba(0,0,0,0.2); }
          50%      { box-shadow: 0 12px 60px rgba(0,0,0,0.35); }
        }
        @keyframes sharp-x {
          0%   { transform: translateX(-50%) scale(0.6); opacity: 1; }
          50%  { transform: translateX(-50%) scale(1.1); opacity: 1; }
          100% { transform: translateX(-50%) scale(1);   opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── NYC + Globe data ────────────────────────────────────────────────────────
const BOROUGHS = [
  { id:"manhattan", label:"MANHATTAN",     path:"M 155 45 L 168 42 L 178 55 L 182 75 L 180 105 L 175 135 L 168 160 L 160 175 L 150 178 L 142 170 L 138 150 L 136 120 L 138 90 L 142 65 Z", cx:160, cy:110, users:4 },
  { id:"brooklyn",  label:"BROOKLYN",      path:"M 148 178 L 162 175 L 185 180 L 210 185 L 230 195 L 235 215 L 220 235 L 195 245 L 168 242 L 148 230 L 135 210 L 132 192 Z",              cx:183, cy:210, users:7 },
  { id:"queens",    label:"QUEENS",        path:"M 185 130 L 210 125 L 250 128 L 278 140 L 282 165 L 270 188 L 240 198 L 210 195 L 188 185 L 180 165 L 182 148 Z",                      cx:230, cy:160, users:5 },
  { id:"bronx",     label:"THE BRONX",     path:"M 165 42 L 178 38 L 200 35 L 228 42 L 245 58 L 248 78 L 235 92 L 212 98 L 190 95 L 175 82 L 168 65 Z",                               cx:208, cy:68,  users:3 },
  { id:"staten",    label:"STATEN ISLAND", path:"M 88 195 L 108 188 L 125 192 L 130 210 L 125 235 L 112 255 L 95 262 L 80 255 L 72 238 L 74 218 Z",                                    cx:101, cy:225, users:2 },
];
const NYC_DOTS = [
  {id:1,x:158,y:100},{id:2,x:164,y:130},{id:3,x:155,y:155},{id:4,x:172,y:85},
  {id:5,x:190,y:215},{id:6,x:178,y:200},{id:7,x:200,y:225},{id:8,x:215,y:165},
  {id:9,x:238,y:155},{id:10,x:225,y:145},{id:11,x:205,y:55},{id:12,x:215,y:72},
  {id:13,x:95,y:222},{id:14,x:105,y:238},{id:15,x:162,y:118},
];
const GLOBE_CONTS = {
  na:[[-165,70],[-50,70],[-50,25],[-80,10],[-110,15],[-165,60]],
  sa:[[-80,10],[-50,10],[-35,-5],[-40,-55],[-70,-55],[-80,0]],
  eu:[[-10,35],[40,35],[40,70],[-10,70]],
  af:[[-18,35],[50,35],[50,-35],[-18,-35]],
  as:[[40,10],[145,10],[145,70],[40,70]],
  oc:[[110,-10],[160,-10],[160,-50],[110,-50]],
};

// ─── Stagger header ──────────────────────────────────────────────────────────
function StaggerHeader({ text, trigger }) {
  const [visible, setVisible] = useState([]);

  useEffect(() => {
    setVisible([]);
    text.split("").forEach((_, i) => {
      setTimeout(() => setVisible(v => [...v, i]), i * 55);
    });
  }, [text, trigger]);

  return (
    <div style={{
      fontFamily:"'Courier New', monospace",
      fontSize:13, letterSpacing:"0.35em",
      display:"flex", justifyContent:"center",
    }}>
      {text.split("").map((char, i) => (
        <span key={i} style={{
          color:GREEN,
          opacity: visible.includes(i) ? 0.8 : 0,
          transition:"opacity 0.3s ease",
        }}>
          {char === " " ? " " : char}
        </span>
      ))}
    </div>
  );
}

// ─── Karaoke hint text ───────────────────────────────────────────────────────
const HINT_LINES = {
  nyc:   ["PICK A BOROUGH · SEE WHO ANSWERS", "A CITY OF INFINITE MISSED CONNECTIONS"],
  globe: ["PICK A NATION · SEE WHO ANSWERS",  "A PLANET OF ENDLESS MISSED CONNECTIONS"],
};

function KaraokeText({ text }) {
  // Split on spaces but keep the · separator as its own token
  const words = text.split(" ");
  const [activeWord, setActiveWord] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    setActiveWord(0);
    let i = 0;
    function step() {
      i++;
      if (i < words.length) {
        setActiveWord(i);
        // Longer pause on last word
        timerRef.current = setTimeout(step, i === words.length - 1 ? 420 : 420);
      }
    }
    timerRef.current = setTimeout(step, 420);
    return () => clearTimeout(timerRef.current);
  }, [text]);

  return (
    <div style={{
      display:"flex", flexWrap:"wrap", justifyContent:"center",
      gap:"0 10px", fontFamily:"'Courier New', monospace",
      fontSize:13, letterSpacing:"0.18em",
    }}>
      {words.map((word, i) => {
        const isActive = i === activeWord;
        const isDot = word === "·";
        return (
          <span key={i} style={{
            color: isActive ? GREEN : "rgba(0,255,65,0.28)",
            textShadow: isActive ? `0 0 12px ${GREEN}, 0 0 24px ${GREEN}` : "none",
            transition: isActive
              ? "color 0.08s ease, text-shadow 0.08s ease, transform 0.08s ease"
              : "color 0.4s ease, text-shadow 0.4s ease, transform 0.15s ease",
            fontWeight: isActive ? "bold" : "normal",
            transform: isActive ? "scale(1.08)" : "scale(1)",
            display:"inline-block",
          }}>
            {word}
          </span>
        );
      })}
    </div>
  );
}

function CyclingHint({ slide }) {
  const lines = HINT_LINES[slide] || HINT_LINES.nyc;
  const [idx, setIdx] = useState(0);
  const [key, setKey] = useState(0); // force remount to restart karaoke

  useEffect(() => { setIdx(0); setKey(k => k + 1); }, [slide]);

  useEffect(() => {
    const t = setInterval(() => {
      setIdx(i => {
        const next = (i + 1) % lines.length;
        setKey(k => k + 1);
        return next;
      });
    }, 7000);
    return () => clearInterval(t);
  }, [lines]);

  return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:24 }}>
      <KaraokeText key={key} text={lines[idx]} />
    </div>
  );
}

// ─── Mobile nav circle ───────────────────────────────────────────────────────
function NavCircle({ dir, active, onClick }) {
  const [hov, setHov] = useState(false);
  const right = dir === "right";
  return (
    <div
      onClick={active ? onClick : null}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width:45, height:45, borderRadius:"50%",
        border:`1px solid ${active ? (hov ? GREEN : "rgba(0,255,65,0.5)") : "rgba(0,255,65,0.15)"}`,
        background: active && hov ? GREEN : "transparent",
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor: active ? "pointer" : "default",
        transition:"all 0.18s ease",
        opacity: active ? 1 : 0.3,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
        {right
          ? <polyline points="4,2 10,7 4,12" stroke={active && hov ? BLACK : GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          : <polyline points="10,2 4,7 10,12" stroke={active && hov ? BLACK : GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        }
      </svg>
    </div>
  );
}

// ─── GlobeMode ────────────────────────────────────────────────────────────────
// ─── Scramble text effect ────────────────────────────────────────────────────
function ScrambleText({ target, trigger }) {
  const [display, setDisplay] = useState(target);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ·◈/\\[]{}!@#%^&*";
  const rafRef = useRef(null);
  const prevTarget = useRef(target);

  useEffect(() => {
    if (!trigger) return;
    let iteration = 0;
    const totalFrames = 18;
    cancelAnimationFrame(rafRef.current);
    function frame() {
      setDisplay(target.split("").map((char, i) => {
        if (char === " ") return " ";
        if (i < iteration) return target[i];
        return chars[Math.floor(Math.random() * chars.length)];
      }).join(""));
      if (iteration < target.length) {
        iteration += 0.6;
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setDisplay(target);
      }
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trigger, target]);

  // Also update instantly if target changes without trigger
  useEffect(() => {
    if (!trigger) setDisplay(target);
  }, [target]);

  return <span>{display}</span>;
}

function GlobeMode({ borough }) {
  const [slide, setSlide] = useState("nyc");
  const [scramble, setScramble] = useState(0); // increment to re-trigger
  const [region, setRegion] = useState(null);

  const [globeScale, setGlobeScale] = useState(1);
  const [nycScale, setNycScale]     = useState(1);

  useEffect(() => {
    // Grow NYC map on first load
    const t = setTimeout(() => setNycScale(1.04), 80);
    return () => clearTimeout(t);
  }, []);

  function goGlobe() {
    setSlide("globe");
    setScramble(s => s + 1);
    setGlobeScale(1);
    setNycScale(1); // reset NYC for next return
    setTimeout(() => setGlobeScale(1.12), 420);
  }
  function goNYC() {
    setSlide("nyc");
    setScramble(s => s + 1);
    setGlobeScale(1);
    setNycScale(1);
    setTimeout(() => setNycScale(1.04), 420);
  }

  const topLabel    = slide === "nyc" ? "NEW YORK CITY" : "PLANET EARTH";

  if (region) return <MapView regionId={region} onBack={() => setRegion(null)} borough={borough} />;

  return (
    <div style={{ position:"relative", width:"100%", height:"100%", overflow:"hidden" }}>

      {/* Fixed top label — letters stagger in on each transition */}
      <div style={{
        position:"absolute", top:20, left:0, right:0,
        textAlign:"center", zIndex:60, pointerEvents:"none",
      }}>
        <StaggerHeader text={topLabel} trigger={scramble} />
      </div>

      {/* Fixed bottom label — cycles every 7s with slide-up */}
      <div style={{
        position:"absolute", bottom:100, left:0, right:0,
        textAlign:"center", zIndex:60, pointerEvents:"none",
      }}>
        <CyclingHint slide={slide} />
      </div>

      {/* NYC slide — no labels inside */}
      <div style={{
        position:"absolute", inset:0,
        transform: slide === "nyc" ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)",
      }}>
        <NYCPanel onRegion={r => setRegion(r)} scale={nycScale} userBorough={borough} />
      </div>

      {/* Globe slide — no labels inside */}
      <div style={{
        position:"absolute", inset:0,
        transform: slide === "globe" ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)",
      }}>
        <GlobePanel onRegion={r => setRegion(r)} scale={globeScale} />
      </div>

      {/* Arrows */}
      {slide === "nyc"   && <SlideArrow dir="right" onClick={goGlobe} />}
      {slide === "globe" && <SlideArrow dir="left"  onClick={goNYC}   />}
    </div>
  );
}

// ─── Slide arrow ──────────────────────────────────────────────────────────────
function SlideArrow({ dir, onClick }) {
  const [hov, setHov] = useState(false);
  const right = dir === "right";
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position:"absolute",
        top:"50%",
        left: right ? "75%" : "25%",
        transform:"translate(-50%, -50%)",
        width:38, height:38,
        borderRadius:"50%",
        border:`1px solid ${hov ? GREEN : "rgba(0,255,65,0.3)"}`,
        background: hov ? GREEN : "transparent",
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor:"pointer",
        transition:"background 0.15s ease, border-color 0.15s ease",
        zIndex:100,
        userSelect:"none",
      }}
    >
      <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
        {right
          ? <polyline points="2,2 8,8 2,14" stroke={hov ? BLACK : "rgba(0,255,65,0.5)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{transition:"stroke 0.15s ease"}}/>
          : <polyline points="8,2 2,8 8,14" stroke={hov ? BLACK : "rgba(0,255,65,0.5)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{transition:"stroke 0.15s ease"}}/>
        }
      </svg>
    </div>
  );
}
// ─── NYC Panel ────────────────────────────────────────────────────────────────
function NYCPanel({ onRegion, scale = 1, userBorough }) {
  const isMobile = window.innerWidth < 768;
  const [bHov, setBHov] = useState(null);
  const [dHov, setDHov] = useState(null);
  const [autoIdx, setAutoIdx] = useState(0);
  const autoTimer = useRef(null);

  // On mobile, cycle through boroughs automatically
  useEffect(() => {
    if (!isMobile) return;
    setBHov(BOROUGHS[0].id);
    autoTimer.current = setInterval(() => {
      setAutoIdx(i => {
        const next = (i + 1) % BOROUGHS.length;
        setBHov(BOROUGHS[next].id);
        return next;
      });
    }, 2000);
    return () => clearInterval(autoTimer.current);
  }, [isMobile]);

  // On mobile, tap overrides auto and goes to MapView
  function handleBoroughClick(id) {
    clearInterval(autoTimer.current);
    onRegion && onRegion(id);
  }

  const hovBorough = BOROUGHS.find(b => b.id === bHov);

  return (
    <div style={{
      width:"100%", height:"100%",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      gap:10, padding:"16px 20px", boxSizing:"border-box",
      position:"relative",
    }}>
      <div style={{ position:"relative", width:"100%", maxWidth:360 }}>
        <svg viewBox="55 28 240 248" style={{ width:"100%", height:"auto", overflow:"visible", transform:`scale(${scale})`, transition:"transform 1.2s cubic-bezier(0.25,0.46,0.45,0.94)", transformOrigin:"center" }}>
          {BOROUGHS.map(b => {
            const h = bHov === b.id;
            const dimmed = bHov && !h;
            return (
              <g key={b.id}
                onMouseEnter={() => setBHov(b.id)} onMouseLeave={() => setBHov(null)}
                onClick={() => handleBoroughClick(b.id)}
                style={{ transformOrigin:`${b.cx}px ${b.cy}px`, transform:h?"scale(1.1)":"scale(1)", transition:"transform 0.22s cubic-bezier(0.34,1.4,0.64,1)", opacity: dimmed ? 0.2 : 1, cursor:"pointer" }}
              >
                {/* Large invisible hit area */}
                <circle cx={b.cx} cy={b.cy} r={32} fill="transparent"/>
                <path d={b.path}
                  fill={h?"rgba(255,224,0,0.2)":b.id===userBorough?"rgba(255,224,0,0.12)":"rgba(0,255,65,0.06)"}
                  stroke={h?YELLOW:b.id===userBorough?YELLOW:"rgba(0,255,65,0.4)"}
                  strokeWidth={h?1.5:b.id===userBorough?1:0.6}
                  style={{transition:"all 0.15s"}}
                />
              </g>
            );
          })}
          {NYC_DOTS.map(d => (
            <g key={d.id} style={{ opacity: bHov ? 0.2 : 1, transition:"opacity 0.15s" }}>
              {dHov===d.id && <circle cx={d.x} cy={d.y} r={6} fill="none" stroke={YELLOW} strokeWidth="0.8" opacity="0.5"/>}
              <circle cx={d.x} cy={d.y} r={dHov===d.id?3:2} fill={dHov===d.id?YELLOW:BLACK} stroke={dHov===d.id?YELLOW:GREEN} strokeWidth="0.8" style={{cursor:"pointer",transition:"all 0.12s"}} onMouseEnter={()=>setDHov(d.id)} onMouseLeave={()=>setDHov(null)}/>
            </g>
          ))}
          <text x="272" y="222" fill={GREEN} fontSize="4" fontFamily="'Courier New', monospace" opacity="0.15" textAnchor="middle">ATLANTIC</text>
          <text x="272" y="228" fill={GREEN} fontSize="4" fontFamily="'Courier New', monospace" opacity="0.15" textAnchor="middle">OCEAN</text>
        </svg>

        {/* Rising yellow tag — Option B */}
        {hovBorough && (
          <div style={{
            position:"absolute",
            left:`${((hovBorough.cx - 55) / 240) * 100}%`,
            top:`${((hovBorough.cy - 28) / 248) * 100}%`,
            transform:"translate(-50%, -100%) translateY(-12px)",
            pointerEvents:"none", zIndex:20,
            animation:"rise-up 0.22s cubic-bezier(0.34,1.4,0.64,1) forwards",
          }}>
            <div style={{
              background: YELLOW,
              color: BLACK,
              fontFamily:"'Courier New', monospace",
              fontWeight:"bold",
              fontSize:13,
              letterSpacing:"0.18em",
              padding:"6px 14px",
              whiteSpace:"nowrap",
            }}>
              {hovBorough.label}
            </div>
            <div style={{
              width:0, height:0,
              borderLeft:"6px solid transparent",
              borderRight:"6px solid transparent",
              borderTop:`6px solid ${YELLOW}`,
              margin:"0 auto",
            }}/>
          </div>
        )}
      </div>

      <style>{`
        @keyframes rise-up {
          from { opacity:0; transform:translate(-50%,-80%) translateY(-12px); }
          to   { opacity:1; transform:translate(-50%,-100%) translateY(-12px); }
        }
      `}</style>
    </div>
  );
}

// ─── Globe Panel ──────────────────────────────────────────────────────────────
function GlobePanel({ onRegion, scale = 1 }) {
  const rotRef = useRef({ y:0, x:15 });
  const velRef = useRef({ y:0.3, x:0 });
  const [rot, setRot]     = useState({ y:0, x:15 });
  const [ringO, setRingO] = useState(0);
  const [dotsO, setDotsO] = useState(0);
  const [gridO, setGridO] = useState(0);
  const [contO, setContO] = useState(0);
  const [hov, setHov]       = useState(null);
  const [rejected, setRejected] = useState(null);
  const rejTimer = useRef(null);
  const dragging = useRef(false);
  const last     = useRef({ x:0, y:0, t:0 });
  const recent   = useRef([]);
  const raf      = useRef(null);
  const dist     = useRef(0);

  useEffect(() => {
    const t0=setTimeout(()=>setRingO(1),100), t1=setTimeout(()=>setDotsO(1),280),
          t2=setTimeout(()=>setGridO(1),650), t3=setTimeout(()=>setContO(1),1000);
    return () => [t0,t1,t2,t3].forEach(clearTimeout);
  }, []);

  useEffect(() => {
    function loop() {
      if (!dragging.current) {
        velRef.current.y*=0.97; velRef.current.x*=0.94;
        if(Math.abs(velRef.current.y)<0.25) velRef.current.y+=(0.18-velRef.current.y)*0.04;
        rotRef.current.x=Math.max(-55,Math.min(55,rotRef.current.x+velRef.current.x));
        rotRef.current.x+=(0-rotRef.current.x)*0.02;
      }
      rotRef.current.y+=velRef.current.y;
      setRot({y:rotRef.current.y,x:rotRef.current.x});
      raf.current=requestAnimationFrame(loop);
    }
    raf.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(raf.current);
  },[]);

  function gc(e){return e.touches?{x:e.touches[0].clientX,y:e.touches[0].clientY}:{x:e.clientX,y:e.clientY};}
  function onDown(e){dragging.current=true;const c=gc(e);last.current={...c,t:performance.now()};recent.current=[{...c,t:performance.now()}];dist.current=0;velRef.current={y:0,x:0};}
  function onMove(e){if(!dragging.current)return;const c=gc(e);const dx=c.x-last.current.x,dy=c.y-last.current.y;rotRef.current.y+=dx*0.55;rotRef.current.x+=dy*0.35;dist.current+=Math.hypot(dx,dy);last.current={...c,t:performance.now()};recent.current.push({...c,t:performance.now()});if(recent.current.length>6)recent.current.shift();}
  function onUp(){if(!dragging.current)return;dragging.current=false;const pts=recent.current;if(pts.length>=2){const f=pts[0],l=pts[pts.length-1],dt=Math.max(1,l.t-f.t);velRef.current.y=Math.max(-18,Math.min(18,((l.x-f.x)/dt)*14));velRef.current.x=Math.max(-10,Math.min(10,((l.y-f.y)/dt)*8));}}

  const R=130, rotY=rot.y, rotX=rot.x;
  function proj(lon,lat){const phi=(lat*Math.PI)/180,theta=((lon+rotY)*Math.PI)/180,tr=(rotX*Math.PI)/180;return{sx:Math.cos(phi)*Math.sin(theta)*R,sy:-(Math.sin(phi)*Math.cos(tr)-Math.cos(phi)*Math.cos(theta)*Math.sin(tr))*R,z:Math.sin(phi)*Math.sin(tr)+Math.cos(phi)*Math.cos(theta)*Math.cos(tr)};}
  function lc(lat,s=60){return Array.from({length:s+1},(_,i)=>proj((i/s)*360-180,lat));}
  function ll(lon,s=30){return Array.from({length:s+1},(_,i)=>proj(lon,-90+(i/s)*180));}
  function pp(pts){return pts.map((p,i)=>`${i?"L":"M"} ${(p.sx+160).toFixed(1)} ${(p.sy+160).toFixed(1)}`).join(" ");}
  function cp(pts){return pts.map((p,i)=>{const q=proj(p[0],p[1]);return`${i?"L":"M"} ${(q.sx+160).toFixed(1)} ${(q.sy+160).toFixed(1)}`;}).join(" ")+" Z";}
  function rc(pts){let ax=0,ay=0;pts.forEach(p=>{ax+=p[0];ay+=p[1];});return proj(ax/pts.length,ay/pts.length);}

  const REGION_LABELS = {na:"N. AMERICA",sa:"S. AMERICA",eu:"EUROPE",af:"AFRICA",as:"ASIA",oc:"OCEANIA"};
  // Get hovered region centroid in SVG px (SVG is 300px wide, viewBox 320, centred at 160,160)
  const activeKey = rejected || hov;
  const hovCenter = activeKey ? (() => { const c = rc(GLOBE_CONTS[activeKey]); return c.z > 0.1 ? { x:(c.sx+160)*(300/320), y:(c.sy+160)*(300/320) } : null; })() : null;

  return (
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:"16px 20px",boxSizing:"border-box"}}>
      <div style={{ position:"relative", display:"inline-block" }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={e=>{onUp();setHov(null);}}
        onTouchStart={onDown} onTouchMove={e=>{e.preventDefault();onMove(e);}} onTouchEnd={onUp}
      >
        <div style={{cursor:"grab",userSelect:"none",filter:"drop-shadow(0 0 24px rgba(0,255,65,0.2))",transform:`scale(${scale})`,transition:"transform 1.4s cubic-bezier(0.25,0.46,0.45,0.94)",transformOrigin:"center"}}>
          <svg width="300" height="300" viewBox="0 0 320 320">
            <circle cx="160" cy="160" r={R+4} fill="none" stroke={GREEN} strokeWidth="0.5" opacity={0.3*ringO} style={{transition:"opacity 0.5s"}}/>
            <circle cx="160" cy="160" r={R} fill="rgba(0,0,0,0.85)"/>
            <g opacity={gridO} style={{transition:"opacity 0.7s"}}>
              {[-60,-30,0,30,60].map(lat=><path key={lat} d={pp(lc(lat))} fill="none" stroke={GREEN} strokeWidth="0.4" opacity="0.15"/>)}
              {Array.from({length:12},(_,i)=>i*30).map(lon=><path key={lon} d={pp(ll(lon))} fill="none" stroke={GREEN} strokeWidth="0.4" opacity="0.15"/>)}
            </g>
            {Object.entries(GLOBE_CONTS).map(([key,pts])=>{
              const c=rc(pts),h=hov===key,isRej=rejected===key,dimmed=(hov||rejected)&&!h&&!isRej;
              if(!pts.every(p=>proj(p[0],p[1]).z>-0.1))return null;
              return <path key={key} d={cp(pts)}
                fill={isRej?"rgba(255,32,32,0.15)":h?"rgba(255,224,0,0.2)":"rgba(0,255,65,0.08)"}
                stroke={isRej?RED:h?YELLOW:GREEN} strokeWidth={h||isRej?1.5:0.8}
                opacity={c.z<0?0:dimmed?0.2:Math.min(contO,c.z+0.5)}
                style={{cursor:"pointer",transition:"opacity 0.15s,fill 0.15s,stroke 0.15s"}}
                onMouseEnter={()=>{ if(!rejected) setHov(key); }} onMouseLeave={()=>setHov(null)}
                onClick={()=>{
                if(dist.current<6){
                  clearTimeout(rejTimer.current);
                  setRejected(key);
                  rejTimer.current=setTimeout(()=>setRejected(null),1400);
                }
              }}/>;
            })}
            {FAKE_USERS.map((u,i)=>{const p=proj(u.lon,u.lat);if(p.z<0.1)return null;return <circle key={u.id} cx={p.sx+160} cy={p.sy+160} r={2.5} fill={YELLOW} opacity={hov?0.15:dotsO*Math.min(1,p.z+0.3)} style={{transition:`opacity 0.15s`}}/>;  })}
            <circle cx="160" cy="160" r={R} fill="none" stroke={GREEN} strokeWidth="1.5" opacity={ringO} style={{transition:"opacity 0.5s"}}/>
          </svg>
        </div>

        {/* Rising tag — yellow on hover, flips red NOT YET on click */}
        {(hov || rejected) && hovCenter && (
          <div style={{
            position:"absolute",
            left: hovCenter.x,
            top:  hovCenter.y,
            transform:"translate(-50%, -100%) translateY(-14px)",
            pointerEvents:"none", zIndex:20,
            animation:"globe-rise-up 0.22s cubic-bezier(0.34,1.4,0.64,1) forwards",
          }}>
            <div style={{
              background: rejected ? RED : YELLOW,
              color: BLACK,
              fontFamily:"'Courier New', monospace",
              fontWeight:"bold",
              fontSize:13,
              letterSpacing:"0.18em",
              padding:"6px 14px",
              whiteSpace:"nowrap",
              transition:"background 0.15s ease",
            }}>
              {rejected ? "NOT YET" : REGION_LABELS[hov]}
            </div>
            <div style={{
              width:0, height:0,
              borderLeft:"6px solid transparent",
              borderRight:"6px solid transparent",
              borderTop:`6px solid ${rejected ? RED : YELLOW}`,
              margin:"0 auto",
              transition:"border-top-color 0.15s ease",
            }}/>
          </div>
        )}
      </div>

      <style>{`
        @keyframes globe-rise-up {
          from { opacity:0; transform:translate(-50%,-80%) translateY(-14px); }
          to   { opacity:1; transform:translate(-50%,-100%) translateY(-14px); }
        }
      `}</style>
    </div>
  );
}

// ─── NavPill ─────────────────────────────────────────────────────────────────
function NavPill({ mode, onSwitch }) {
  const [hovered, setHovered] = useState(false);
  const onDot = mode === "dot";

  const label  = onDot ? "ATLAS" : "DOT";
  const target = onDot ? "globe" : "dot";

  // DOT page:   yellow bg, black text, black outline  → hover: black bg, green text, green outline
  // GLOBE page: black bg,  green text, green outline  → hover: black bg, yellow text, yellow outline
  const bg     = onDot ? (hovered ? BLACK  : YELLOW) : BLACK;
  const color  = onDot ? (hovered ? GREEN  : BLACK)  : (hovered ? YELLOW : GREEN);
  const border = onDot
    ? (hovered ? `1.5px solid ${GREEN}`  : `1.5px solid ${BLACK}`)
    : (hovered ? `1.5px solid ${YELLOW}` : `1.5px solid ${GREEN}`);

  return (
    <button
      onClick={() => onSwitch(target)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
        zIndex: 100,
        padding: "9px 28px",
        fontFamily: "'Courier New', monospace",
        fontSize: "11px",
        letterSpacing: "0.2em",
        fontWeight: "bold",
        border,
        borderRadius: 999,
        background: bg,
        color,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────
// ─── usePresence hook — reads live users from Firebase ───────────────────────
function usePresence(borough) {
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!borough) return;
    // Wait for Firebase to be ready
    let unsub = null;
    const interval = setInterval(() => {
      if (!window.firebase?.apps?.length) return;
      clearInterval(interval);
      const db = window.firebase.database();
      const ref = db.ref(`presence/${borough}`);
      ref.on("value", snap => {
        const val = snap.val() || {};
        const users = Object.values(val).filter(u => u.uid !== USER_ID);
        setOnlineUsers(users);
      });
      unsub = () => ref.off();
    }, 500);
    return () => {
      clearInterval(interval);
      if (unsub) unsub();
    };
  }, [borough]);

  return onlineUsers;
}

// ─── SDK config ──────────────────────────────────────────────────────────────
const AGORA_APP_ID  = "e68f0a27092c43cdbe6cb804961b5cec";
const AGORA_CERT    = "f803225c30d74c1fa4c603544db48e5f";
const FIREBASE_CFG  = {
  apiKey:            "AIzaSyAKZ1CaRZAKJ4apkF3bkHwEZCssB2Yv8ds",
  authDomain:        "dotdotdot-e952d.firebaseapp.com",
  databaseURL:       "https://dotdotdot-e952d-default-rtdb.firebaseio.com",
  projectId:         "dotdotdot-e952d",
  storageBucket:     "dotdotdot-e952d.firebasestorage.app",
  messagingSenderId: "320164100708",
  appId:             "1:320164100708:web:ccd2ceba8c8e7eb9a37d71",
};

// Lazy-load scripts and return promise
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// Generate a random user ID stored in sessionStorage
function getUserId() {
  let id = sessionStorage.getItem("atlas_uid");
  if (!id) { id = "u_" + Math.random().toString(36).slice(2, 10); sessionStorage.setItem("atlas_uid", id); }
  return id;
}

const USER_ID = getUserId();

// ─── useAtlasCall hook ────────────────────────────────────────────────────────
// Handles presence, matchmaking, and Agora call lifecycle
function useAtlasCall(borough) {
  const [sdkReady, setSdkReady]       = useState(false);
  const [callState, setCallState]     = useState("idle"); // idle | searching | incall
  const [incomingCall, setIncomingCall] = useState(null); // { callId, borough }
  const dbRef    = useRef(null);
  const agoraRef = useRef(null);
  const clientRef = useRef(null);
  const tracksRef = useRef([]);
  const callIdRef = useRef(null);

  // Load SDKs once
  useEffect(() => {
    async function load() {
      try {
        await loadScript("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
        await loadScript("https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js");
        await loadScript("https://download.agora.io/sdk/release/AgoraRTC_N.js");

        if (!window.firebase.apps.length) window.firebase.initializeApp(FIREBASE_CFG);
        dbRef.current    = window.firebase.database();
        agoraRef.current = window.AgoraRTC;
        setSdkReady(true);
      } catch(e) { console.error("SDK load failed", e); }
    }
    load();
  }, []);

  // Write presence when borough known
  useEffect(() => {
    if (!sdkReady || !borough) return;
    const db       = dbRef.current;
    const presRef  = db.ref(`presence/${borough}/${USER_ID}`);
    presRef.set({ uid: USER_ID, borough, ts: Date.now() });
    presRef.onDisconnect().remove();
    return () => presRef.remove();
  }, [sdkReady, borough]);

  // Listen for incoming calls
  useEffect(() => {
    if (!sdkReady || !borough) return;
    const db = dbRef.current;
    const callsRef = db.ref(`calls/${borough}`);

    callsRef.on("child_added", snap => {
      const call = snap.val();
      if (!call) return;
      // Only show incoming if caller isn't us and call is ringing
      if (call.caller !== USER_ID && call.status === "ringing" && callState === "idle") {
        setIncomingCall({ callId: snap.key, borough: call.borough, callerId: call.caller });
      }
    });

    return () => callsRef.off();
  }, [sdkReady, borough, callState]);

  // Start a call (caller side)
  async function startCall() {
    if (!sdkReady || !borough || callState !== "idle") return;
    const db = dbRef.current;
    const callId = `call_${Date.now()}_${USER_ID}`;
    callIdRef.current = callId;
    setCallState("searching");

    await db.ref(`calls/${borough}/${callId}`).set({
      caller: USER_ID, borough, status: "ringing", ts: Date.now(),
    });

    // Listen for answer
    db.ref(`calls/${borough}/${callId}/status`).on("value", async snap => {
      const status = snap.val();
      if (status === "answered") {
        await joinAgoraChannel(callId);
        setCallState("incall");
      } else if (status === "declined" || status === "cancelled") {
        setCallState("idle");
        callIdRef.current = null;
      }
    });

    // Auto-cancel after 30s if no answer
    setTimeout(async () => {
      if (callState === "searching") {
        await db.ref(`calls/${borough}/${callId}`).remove();
        setCallState("idle");
      }
    }, 30000);
  }

  // Cancel an outgoing call
  async function cancelCall() {
    if (!callIdRef.current || !borough) return;
    await dbRef.current.ref(`calls/${borough}/${callIdRef.current}`).update({ status: "cancelled" });
    await leaveAgoraChannel();
    setCallState("idle");
    callIdRef.current = null;
  }

  // Answer an incoming call
  async function answerCall() {
    if (!incomingCall) return;
    const { callId } = incomingCall;
    callIdRef.current = callId;
    await dbRef.current.ref(`calls/${incomingCall.borough}/${callId}`).update({ status: "answered", callee: USER_ID });
    await joinAgoraChannel(callId);
    setCallState("incall");
    setIncomingCall(null);
  }

  // Decline an incoming call
  async function declineCall() {
    if (!incomingCall) return;
    await dbRef.current.ref(`calls/${incomingCall.borough}/${incomingCall.callId}`).update({ status: "declined" });
    setIncomingCall(null);
  }

  // End a call
  async function endCall() {
    if (callIdRef.current && borough) {
      await dbRef.current.ref(`calls/${borough}/${callIdRef.current}`).remove();
    }
    await leaveAgoraChannel();
    setCallState("idle");
    callIdRef.current = null;
  }

  // Join Agora channel
  async function joinAgoraChannel(channelName) {
    const AgoraRTC = agoraRef.current;
    if (!AgoraRTC) return;
    try {
      clientRef.current = AgoraRTC.createClient({ mode:"rtc", codec:"vp8" });
      await clientRef.current.join(AGORA_APP_ID, channelName, null, USER_ID);
      const [micTrack] = await AgoraRTC.createMicrophoneAudioTrack();
      tracksRef.current = [micTrack];
      await clientRef.current.publish([micTrack]);
      clientRef.current.on("user-published", async (user, mediaType) => {
        await clientRef.current.subscribe(user, mediaType);
        if (mediaType === "audio") user.audioTrack?.play();
      });
    } catch(e) { console.error("Agora join failed", e); }
  }

  // Leave Agora channel
  async function leaveAgoraChannel() {
    try {
      tracksRef.current.forEach(t => { t.stop(); t.close(); });
      tracksRef.current = [];
      if (clientRef.current) { await clientRef.current.leave(); clientRef.current = null; }
    } catch(e) {}
  }

  return { sdkReady, callState, incomingCall, startCall, cancelCall, answerCall, declineCall, endCall };
}

export default function App() {
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `* { box-sizing: border-box; } html, body { margin: 0; padding: 0; overflow: hidden; background: #0a0a0a; }`;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  const [mode, setMode]       = useState("dot");
  const [borough, setBorough] = useState(null);
  const [locStatus, setLocStatus] = useState("loading");

  const { sdkReady, callState, incomingCall, startCall, cancelCall, answerCall, declineCall, endCall } = useAtlasCall(borough);

  useEffect(() => {
    async function detectLocation() {
      // DEV override — skip IP fetch if DEV_BOROUGH is set
      if (DEV_BOROUGH !== null) {
        setBorough(DEV_BOROUGH);
        setLocStatus("nyc");
        if (DEV_INCOMING) setIncomingCall({ borough: DEV_BOROUGH });
        return;
      }
      try {
        const res  = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        const lat  = data.latitude;
        const lon  = data.longitude;
        if (!lat || !lon) { setLocStatus("error"); return; }
        const b = detectBorough(lat, lon);
        if (b) {
          setBorough(b);
          setLocStatus("nyc");
        } else {
          setLocStatus("outside");
        }
      } catch(e) {
        setLocStatus("error");
      }
    }
    detectLocation();
  }, []);

  // Show loading screen briefly
  if (locStatus === "loading") {
    return (
      <div style={{ width:"100vw", height:"100svh", background:"#050f05", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontFamily:"'Courier New', monospace", color:GREEN, fontSize:11, letterSpacing:"0.3em", animation:"hint-fadeinout 1.5s ease-in-out infinite" }}>
          LOCATING...
        </div>
        <style>{`@keyframes hint-fadeinout { 0%,100%{opacity:0.2} 50%{opacity:1} }`}</style>
      </div>
    );
  }

  // Outside NYC — show holding screen
  if (locStatus === "outside") {
    return (
      <div style={{ width:"100vw", height:"100svh", background:YELLOW, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
        <div style={{
          width:"clamp(120px,30vw,200px)", height:"clamp(120px,30vw,200px)",
          borderRadius:"50%", background:BLACK,
          opacity:0.3,
        }}/>
        <div style={{ fontFamily:"'Courier New', monospace", fontSize:11, letterSpacing:"0.25em", color:BLACK, opacity:0.5, textAlign:"center", lineHeight:1.8 }}>
          ATLAS IS ONLY AVAILABLE<br/>IN NEW YORK CITY
        </div>
      </div>
    );
  }

  // NYC user — full app, borough context passed down
  return (
    <div style={{
      width:"100vw", height:"100svh",
      display:"flex", flexDirection:"column",
      overflow:"hidden",
      background: mode === "globe" ? "#050f05" : YELLOW,
    }}>
      {/* Incoming call overlay — sits above everything */}
      {incomingCall && (
        <IncomingCall
          borough={incomingCall.borough}
          onAnswer={answerCall}
          onDecline={declineCall}
        />
      )}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        {mode === "dot"   && <DotScreen borough={borough} callState={callState} onCall={startCall} onHangUp={endCall} onCancel={cancelCall} />}
        {mode === "globe" && <GlobeMode borough={borough} />}
      </div>
      <NavPill mode={mode} onSwitch={setMode} />
    </div>
  );
}
