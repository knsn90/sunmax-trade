/**
 * ModelViewer.tsx
 *
 * Basic 3D dental model viewer built on Three.js.
 * Runs only on web (rendered inside a <canvas> element).
 *
 * Current capabilities
 * ─────────────────────
 *  • Drag-and-drop STL file loading (binary + ASCII)
 *  • Multi-model support (upper jaw, lower jaw, or any extras)
 *  • Orbit controls  – rotate / zoom / pan
 *  • Basic three-point lighting  – ambient + two directional lights
 *
 * Extension points (not implemented yet)
 * ───────────────────────────────────────
 *  • Measurement tool  → attach to `toolRef` callbacks
 *  • Cross-section tool → manipulate `ClippingPlane` on the renderer
 *  • Occlusion analysis → custom ShaderMaterial swapped onto models
 *
 * Public API
 * ───────────
 *  <ModelViewer
 *    initialModels={[{ id, label, color, url }]}   // optional pre-loaded files
 *    onModelLoad={(model) => void}                  // called after each load
 *    onError={(msg) => void}                        // called on load failure
 *  />
 */

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DentalModel {
  /** Unique identifier, e.g. "upper" | "lower" | uuid */
  id: string;
  /** Human-readable label shown in the legend */
  label: string;
  /** Hex color string, e.g. "#e8d5c4" */
  color: string;
  /** Remote URL or object-URL (File → URL.createObjectURL) */
  url: string;
}

export interface ModelViewerProps {
  /** Pre-load these models on mount */
  initialModels?: DentalModel[];
  /** Called with a DentalModel whenever a file finishes loading */
  onModelLoad?: (model: DentalModel) => void;
  /** Called with an error message when loading fails */
  onError?: (message: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_UPPER_COLOR = '#e8d5c4'; // ivory / tooth color
const DEFAULT_LOWER_COLOR = '#c8bdb8'; // slightly darker plaster
const BACKGROUND_COLOR    = 0x1a1a2e;  // deep navy – comfortable for dental review
const GRID_COLOR          = 0x2a2a4a;

// ─── Scene helpers ────────────────────────────────────────────────────────────

/** Build a Three.js scene with floor grid + sky gradient background */
function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);

  // Subtle floor grid – gives spatial reference without distracting
  const grid = new THREE.GridHelper(200, 40, GRID_COLOR, GRID_COLOR);
  (grid.material as THREE.Material).opacity = 0.3;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  return scene;
}

/**
 * Three-point lighting rig:
 *  1. Ambient  – fills shadows softly
 *  2. Key      – primary directional from upper-front-right
 *  3. Fill     – softer light from left to reduce harsh shadows
 */
function createLights(): THREE.Object3D[] {
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);

  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(60, 80, 60);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);

  const fill = new THREE.DirectionalLight(0xffeedd, 0.4);
  fill.position.set(-60, 40, -20);

  return [ambient, key, fill];
}

/** Create a PerspectiveCamera positioned above and in front of origin */
function createCamera(width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
  camera.position.set(0, 60, 120);
  camera.lookAt(0, 0, 0);
  return camera;
}

/** Configure OrbitControls for dental review workflow */
function createControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;   // smooth deceleration
  controls.dampingFactor = 0.08;
  controls.minDistance = 20;
  controls.maxDistance = 500;
  controls.maxPolarAngle = Math.PI; // allow full vertical rotation
  controls.screenSpacePanning = true;
  return controls;
}

// ─── STL loading ─────────────────────────────────────────────────────────────

/**
 * Load an STL file from a URL and return a Three.js Mesh.
 * Centers the geometry at origin and scales it to fit a 100-unit bounding box.
 */
async function loadSTL(
  url: string,
  color: string,
): Promise<THREE.Mesh> {
  return new Promise((resolve, reject) => {
    const loader = new STLLoader();
    loader.load(
      url,
      (geometry) => {
        // Center geometry at its own bounding-box midpoint
        geometry.computeBoundingBox();
        const box    = geometry.boundingBox!;
        const center = new THREE.Vector3();
        box.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);

        // Uniform scale so all models fit within ~100 units
        const size   = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale  = maxDim > 0 ? 100 / maxDim : 1;
        geometry.scale(scale, scale, scale);

        // Smooth normals for a nicer render
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color:     new THREE.Color(color),
          roughness: 0.55,
          metalness: 0.05,
          side:      THREE.DoubleSide,
        });

        resolve(new THREE.Mesh(geometry, material));
      },
      undefined,        // onProgress — not needed here
      (err) => reject(err),
    );
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ModelViewer({
  initialModels = [],
  onModelLoad,
  onError,
}: ModelViewerProps) {
  const canvasRef  = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const frameIdRef   = useRef<number>(0);
  /** Map from DentalModel.id → Three.js Mesh, for future tool operations */
  const meshMapRef   = useRef<Map<string, THREE.Mesh>>(new Map());

  const [loadedModels, setLoadedModels] = useState<DentalModel[]>([]);
  const [isDragOver,   setIsDragOver]   = useState(false);
  const [isLoading,    setIsLoading]    = useState(false);

  // ── Scene initialisation ──────────────────────────────────────────────────

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene + camera + controls
    const scene    = createScene();
    const camera   = createCamera(W, H);
    const controls = createControls(camera, renderer.domElement);
    sceneRef.current   = scene;
    cameraRef.current  = camera;
    controlsRef.current = controls;

    // Lights
    createLights().forEach((light) => scene.add(light));

    // Animation loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer – keeps canvas filling its container
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // ── Load initial models from props ────────────────────────────────────────

  useEffect(() => {
    if (!initialModels.length) return;
    initialModels.forEach((model) => addModelToScene(model));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core: add a model to the Three.js scene ───────────────────────────────

  const addModelToScene = useCallback(
    async (model: DentalModel) => {
      const scene = sceneRef.current;
      if (!scene) return;

      setIsLoading(true);
      try {
        // Remove old mesh with the same id if it exists (re-load scenario)
        const existing = meshMapRef.current.get(model.id);
        if (existing) {
          scene.remove(existing);
          existing.geometry.dispose();
          (existing.material as THREE.Material).dispose();
          meshMapRef.current.delete(model.id);
        }

        const mesh = await loadSTL(model.url, model.color);
        mesh.name  = model.id;
        mesh.receiveShadow = true;
        mesh.castShadow    = true;

        // Offset upper/lower jaw so they don't overlap when both are loaded
        if (model.id === 'upper') mesh.position.y =  12;
        if (model.id === 'lower') mesh.position.y = -12;

        scene.add(mesh);
        meshMapRef.current.set(model.id, mesh);

        setLoadedModels((prev) => {
          const filtered = prev.filter((m) => m.id !== model.id);
          return [...filtered, model];
        });

        onModelLoad?.(model);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onError?.(`Failed to load "${model.label}": ${msg}`);
      } finally {
        setIsLoading(false);
      }
    },
    [onModelLoad, onError],
  );

  // ── Drag & drop handlers ──────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith('.stl'),
      );

      if (!files.length) {
        onError?.('Please drop one or more .stl files.');
        return;
      }

      files.forEach((file, index) => {
        const objectUrl = URL.createObjectURL(file);
        const isUpper   = file.name.toLowerCase().includes('upper') || file.name.toLowerCase().includes('ust');
        const isLower   = file.name.toLowerCase().includes('lower') || file.name.toLowerCase().includes('alt');

        // Auto-assign id/color based on filename hints; fall back to index
        const id    = isUpper ? 'upper' : isLower ? 'lower' : `model_${Date.now()}_${index}`;
        const color = isUpper
          ? DEFAULT_UPPER_COLOR
          : isLower
          ? DEFAULT_LOWER_COLOR
          : '#b0c4de';

        const model: DentalModel = {
          id,
          label: file.name.replace(/\.stl$/i, ''),
          color,
          url: objectUrl,
        };

        addModelToScene(model);
      });
    },
    [addModelToScene, onError],
  );

  // ── Remove a model ────────────────────────────────────────────────────────

  const removeModel = useCallback((id: string) => {
    const scene = sceneRef.current;
    const mesh  = meshMapRef.current.get(id);
    if (scene && mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      meshMapRef.current.delete(id);
    }
    setLoadedModels((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ── Reset camera to default position ─────────────────────────────────────

  const resetCamera = useCallback(() => {
    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(0, 60, 120);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrapper}>
      {/* ── 3D canvas ───────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        style={{
          ...styles.canvas,
          outline: isDragOver ? '3px dashed #2563EB' : '3px dashed transparent',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />

      {/* ── Drop overlay ────────────────────────────────────────────── */}
      {isDragOver && (
        <div style={styles.dropOverlay}>
          <span style={styles.dropLabel}>Drop STL files here</span>
        </div>
      )}

      {/* ── Loading spinner ─────────────────────────────────────────── */}
      {isLoading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.spinner} />
        </div>
      )}

      {/* ── Empty state hint ────────────────────────────────────────── */}
      {!isLoading && loadedModels.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>⬆</div>
          <p style={styles.emptyTitle}>Drag & drop STL files</p>
          <p style={styles.emptySubtitle}>
            Name files with "upper" / "alt" for upper jaw
            <br />
            or "lower" / "ust" for lower jaw
          </p>
        </div>
      )}

      {/* ── Toolbar (top-right) ─────────────────────────────────────── */}
      <div style={styles.toolbar}>
        <button style={styles.toolBtn} onClick={resetCamera} title="Reset camera">
          ⟳
        </button>
      </div>

      {/* ── Legend (bottom-left) ────────────────────────────────────── */}
      {loadedModels.length > 0 && (
        <div style={styles.legend}>
          {loadedModels.map((m) => (
            <div key={m.id} style={styles.legendRow}>
              <span style={{ ...styles.legendDot, background: m.color }} />
              <span style={styles.legendLabel}>{m.label}</span>
              <button
                style={styles.legendRemove}
                onClick={() => removeModel(m.id)}
                title="Remove model"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position:        'relative',
    width:           '100%',
    height:          '100%',
    minHeight:       480,
    borderRadius:    12,
    overflow:        'hidden',
    backgroundColor: '#1a1a2e',
  },
  canvas: {
    width:          '100%',
    height:         '100%',
    display:        'block',
    borderRadius:   12,
    transition:     'outline 0.15s',
  },
  dropOverlay: {
    position:       'absolute',
    inset:          0,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     'rgba(37,99,235,0.18)',
    borderRadius:   12,
    pointerEvents:  'none',
  },
  dropLabel: {
    color:      '#93c5fd',
    fontSize:   22,
    fontWeight: 600,
    letterSpacing: 0.5,
  },
  loadingOverlay: {
    position:       'absolute',
    inset:          0,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     'rgba(0,0,0,0.35)',
    borderRadius:   12,
  },
  spinner: {
    width:        40,
    height:       40,
    borderRadius: '50%',
    border:       '3px solid rgba(255,255,255,0.15)',
    borderTop:    '3px solid #2563EB',
    animation:    'spin 0.8s linear infinite',
  },
  emptyState: {
    position:       'absolute',
    inset:          0,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    pointerEvents:  'none',
    gap:            8,
  },
  emptyIcon: {
    fontSize:   48,
    color:      '#334155',
    lineHeight: 1,
  },
  emptyTitle: {
    margin:     0,
    color:      '#64748b',
    fontSize:   18,
    fontWeight: 600,
  },
  emptySubtitle: {
    margin:     0,
    color:      '#475569',
    fontSize:   13,
    textAlign:  'center',
    lineHeight: 1.6,
  },
  toolbar: {
    position:  'absolute',
    top:       12,
    right:     12,
    display:   'flex',
    flexDirection: 'column',
    gap:       6,
  },
  toolBtn: {
    width:           36,
    height:          36,
    borderRadius:    8,
    border:          '1px solid rgba(255,255,255,0.12)',
    background:      'rgba(15,23,42,0.75)',
    color:           '#94a3b8',
    fontSize:        18,
    cursor:          'pointer',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    backdropFilter:  'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  },
  legend: {
    position:        'absolute',
    bottom:          14,
    left:            14,
    background:      'rgba(15,23,42,0.78)',
    border:          '1px solid rgba(255,255,255,0.08)',
    borderRadius:    10,
    padding:         '8px 12px',
    display:         'flex',
    flexDirection:   'column',
    gap:             6,
    backdropFilter:  'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  },
  legendRow: {
    display:     'flex',
    alignItems:  'center',
    gap:         8,
  },
  legendDot: {
    width:        12,
    height:       12,
    borderRadius: '50%',
    flexShrink:   0,
    border:       '1px solid rgba(255,255,255,0.2)',
  },
  legendLabel: {
    color:      '#cbd5e1',
    fontSize:   13,
    flexGrow:   1,
    whiteSpace: 'nowrap',
  },
  legendRemove: {
    background:  'none',
    border:      'none',
    color:       '#475569',
    cursor:      'pointer',
    fontSize:    11,
    padding:     '0 2px',
    lineHeight:  1,
  },
};
