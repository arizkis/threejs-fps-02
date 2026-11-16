import * as THREE from 'three';

// Shared by the world, operators, effects and minimap. Keep team hues distinct
// from the warm architecture; these helpers run during construction, not ticks.
export const PALETTE = Object.freeze({
  sand: 0xd39245,
  sandLight: 0xf4ba70,
  terracotta: 0xbb5532,
  wallLight: 0xde8550,
  concrete: 0xc29b67,
  steel: 0x31434b,
  steelDark: 0x192c36,
  copper: 0xb16b45,
  shadow: 0x276578,
  mirror: 0xf4f0d9,
  glint: 0xffcf81,
  tracerGold: 0xfff1bc,
  tracerRed: 0xff5426,
  orange: 0xf5a05d,
  sun: 0xff8833,
  skyTop: 0x28204f,
  skyMid: 0x6a3d70,
  skyHorizon: 0xf3a04d,
  fog: 0xc48952,
  solstice: 0x65dcc9,
  umbra: 0xfa737a,
  ink: 0x10232c,
  white: 0xf3ecdc,
  smoke: 0x78989b,
  hazard: 0xf6b459,
});

export const cssColor = color => typeof color === 'string'
  ? color : `#${color.toString(16).padStart(6, '0')}`;

export function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.88, metalness: 0, flatShading: true, ...options,
  });
}

export function unlit(color, options = {}) {
  return new THREE.MeshBasicMaterial({ color, ...options });
}

// Fixed seed: paint never depends on the match RNG or screenshot order.
function random(seed) {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function canvasTexture(width, height, paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('HELIOWORKS requires a 2D canvas for local textures.');
  paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

export function sandTexture(seed = 41, repeat = 12) {
  const rand = random(seed);
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f0c58b';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = i % 3 ? '#906e4925' : '#fff6dc65';
      const size = 0.5 + rand() * 1.4;
      ctx.fillRect(rand() * w, rand() * h, size, size * 0.65);
    }
    ctx.strokeStyle = '#a7896520';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const x = rand() * w, y = rand() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8 + rand() * 22, y - 2);
      ctx.stroke();
    }
  }, repeat, repeat);
}

export function concreteTexture(seed = 19, repeat = 1) {
  const rand = random(seed);
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e6cda8';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 850; i++) {
      ctx.fillStyle = i % 2 ? '#fffbea30' : '#67727120';
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand());
    }
    ctx.fillStyle = '#65736e55';
    ctx.fillRect(0, 0, w, 2);
    ctx.fillRect(0, 0, 2, h);
    ctx.fillRect(w / 2, 0, 1, h);
    ctx.fillStyle = '#fff9dd80';
    ctx.fillRect(2, 2, w - 2, 1);
    ctx.fillRect(2, 2, 1, h - 2);
    ctx.fillStyle = '#64716c70';
    for (const x of [8, w / 2 - 8, w / 2 + 8, w - 8]) {
      ctx.fillRect(x, 8, 2, 2);
      ctx.fillRect(x, h - 10, 2, 2);
    }
  }, repeat, repeat);
}

export function hazardTexture(repeat = 1) {
  return canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = cssColor(PALETTE.hazard);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = cssColor(PALETTE.steelDark);
    for (let x = -w; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 16 + h, h);
      ctx.lineTo(x + h, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#f6e3b680';
    ctx.fillRect(0, 1, w, 2);
    ctx.fillStyle = '#10232c70';
    ctx.fillRect(0, h - 3, w, 3);
  }, repeat, 1);
}

export function mirrorTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, h, w, 0);
    gradient.addColorStop(0, '#a3c5cd');
    gradient.addColorStop(0.46, '#e1e7de');
    gradient.addColorStop(0.5, '#fff8df');
    gradient.addColorStop(1, '#f7c08a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#fffcefaa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(13, h - 12);
    ctx.lineTo(w - 12, 13);
    ctx.stroke();
    ctx.strokeStyle = '#405d6655';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 3); ctx.lineTo(w / 2, h - 3);
    ctx.moveTo(3, h / 2); ctx.lineTo(w - 3, h / 2);
    ctx.stroke();
  });
}

export function skyTexture() {
  return canvasTexture(16, 256, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, cssColor(PALETTE.skyTop));
    gradient.addColorStop(0.28, cssColor(PALETTE.skyMid));
    gradient.addColorStop(0.5, cssColor(PALETTE.skyHorizon));
    gradient.addColorStop(1, '#f3a04d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

function fitText(ctx, text, maxWidth, size, weight = 800) {
  do {
    ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size <= 8) return;
    size -= 2;
  } while (size > 0);
}

// Arrow is 'left', 'right' or 'up'. All lettering is canvas-generated: no font loads.
export function signTexture(text, {
  subtitle = '', arrow = '', width = 512, height = 128,
  color = PALETTE.white, background = PALETTE.ink, accent = PALETTE.orange,
} = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = cssColor(background);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = cssColor(accent);
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = cssColor(accent);
    ctx.fillRect(12, 12, 5, h - 24);
    const left = 30, space = w - left - (arrow ? h : 24);
    ctx.fillStyle = cssColor(color);
    ctx.textBaseline = 'middle';
    const title = String(text).toUpperCase();
    fitText(ctx, title, space, Math.floor(h * 0.36));
    ctx.fillText(title, left, h * (subtitle ? 0.41 : 0.52));
    if (subtitle) {
      fitText(ctx, String(subtitle).toUpperCase(), space, Math.floor(h * 0.13), 600);
      ctx.fillStyle = cssColor(accent);
      ctx.fillText(String(subtitle).toUpperCase(), left, h * 0.75);
    }
    if (arrow) {
      ctx.save();
      ctx.translate(w - h * 0.48, h / 2);
      ctx.rotate(arrow === 'left' ? Math.PI : arrow === 'up' ? -Math.PI / 2 : 0);
      const r = h * 0.18;
      ctx.strokeStyle = cssColor(accent);
      ctx.lineWidth = Math.max(3, h * 0.045);
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r);
      ctx.stroke();
      ctx.restore();
    }
  });
}

// Construct once per world and share these materials between mesh instances.
export function createMaterials() {
  const panels = concreteTexture();
  return {
    sand: material(PALETTE.sand, { map: sandTexture() }),
    wall: material(PALETTE.terracotta, { map: panels }),
    wallLight: material(PALETTE.wallLight, { map: panels }),
    concrete: material(PALETTE.concrete, { map: panels }),
    steel: material(PALETTE.steel, { metalness: 0.45, roughness: 0.6 }),
    steelDark: material(PALETTE.steelDark, { metalness: 0.35 }),
    copper: material(PALETTE.copper, { metalness: 0.5, roughness: 0.5 }),
    shadow: material(PALETTE.shadow),
    mirror: material(PALETTE.mirror, {
      map: mirrorTexture(), metalness: 0.35, roughness: 0.24, side: THREE.DoubleSide,
    }),
    hazard: material(0xffffff, { map: hazardTexture(), side: THREE.DoubleSide }),
    solstice: material(PALETTE.solstice),
    umbra: material(PALETTE.umbra),
    white: material(PALETTE.white),
    sun: unlit(PALETTE.sun, { toneMapped: false, fog: false }),
    receiver: material(PALETTE.sun, {
      emissive: PALETTE.sun, emissiveIntensity: 2, roughness: 0.35,
    }),
    glint: unlit(PALETTE.glint, { toneMapped: false, side: THREE.DoubleSide }),
  };
}
