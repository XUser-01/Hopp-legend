import * as THREE from 'three';
import { ArenaTheme, PlayerCard } from './types';

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export interface CourtTextureSet {
  colorMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/**
 * Generates ultra-crisp procedural hardwood / streetball court albedo + roughness + bump textures
 * with full NBA-grade markings, lane hash marks, restricted arcs, wood bevels, and subtle court scuffs.
 */
export function createCourtTextures(theme: ArenaTheme, maxAnisotropy: number): CourtTextureSet {
  const width = 1024;
  const height = 1536;
  const [canvas, ctx] = createCanvas(width, height);
  const [roughCanvas, rCtx] = createCanvas(width, height);
  const [bumpCanvas, bCtx] = createCanvas(width, height);

  if (theme === 'pro') {
    // Rich maple hardwood planks with high-gloss broadcast lacquer
    ctx.fillStyle = '#BA7D45';
    ctx.fillRect(0, 0, width, height);
    rCtx.fillStyle = '#2A2A2A'; // ~0.16 gloss varnish for realistic stadium spotlight reflections
    rCtx.fillRect(0, 0, width, height);
    bCtx.fillStyle = '#909090';
    bCtx.fillRect(0, 0, width, height);

    const plankCols = 28;
    const plankW = width / plankCols;
    for (let col = 0; col < plankCols; col++) {
      const x = col * plankW;
      let y = (col % 4) * -42;
      while (y < height) {
        const plankH = 104 + ((col * 37 + y * 13) % 72);
        const shade = ((col * 17 + y * 29) % 26) - 13;
        const warmTint = ((col * 7 + y * 11) % 10) - 5;
        const r = Math.min(255, Math.max(0, 202 + shade + warmTint));
        const g = Math.min(255, Math.max(0, 142 + Math.round(shade * 0.78)));
        const b = Math.min(255, Math.max(0, 80 + Math.round(shade * 0.52)));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + 1, y + 1, plankW - 1.5, plankH - 1.5);

        // Bevel seam groove in bump map
        bCtx.strokeStyle = '#505050';
        bCtx.lineWidth = 1.5;
        bCtx.strokeRect(x + 0.5, y + 0.5, plankW - 1, plankH - 1);

        // Fine natural maple wood grain streaks
        ctx.strokeStyle = 'rgba(92, 46, 16, 0.14)';
        ctx.lineWidth = 1;
        for (let gLine = 0; gLine < 5; gLine++) {
          const gx = x + 3 + gLine * (plankW / 5.4);
          ctx.beginPath();
          ctx.moveTo(gx, y + 2);
          ctx.bezierCurveTo(
            gx + ((gLine % 2) * 2 - 1) * 1.5,
            y + plankH * 0.35,
            gx - ((gLine % 2) * 2 - 1) * 1.5,
            y + plankH * 0.7,
            gx + ((gLine % 2) * 2 - 1) * 1.2,
            y + plankH - 2
          );
          ctx.stroke();
        }

        // Subtle plank-to-plank varnish sheen variation
        const roughShade = 36 + ((col * 19 + y * 7) % 24);
        rCtx.fillStyle = `rgb(${roughShade},${roughShade},${roughShade})`;
        rCtx.fillRect(x + 1, y + 1, plankW - 1.5, plankH - 1.5);
        y += plankH;
      }
    }
  } else if (theme === 'venice') {
    // Sun-baked coastal streetball asphalt with mineral aggregate texture
    ctx.fillStyle = '#3B424E';
    ctx.fillRect(0, 0, width, height);
    rCtx.fillStyle = '#B8B8B8';
    rCtx.fillRect(0, 0, width, height);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, width, height);
    for (let i = 0; i < 8500; i++) {
      const px = (i * 193) % width;
      const py = (i * 317) % height;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
      ctx.fillRect(px, py, 3, 3);
      bCtx.fillStyle = i % 2 === 0 ? '#A4A4A4' : '#5E5E5E';
      bCtx.fillRect(px, py, 2, 2);
    }
  } else {
    // Tokyo night rooftop dark slate court
    ctx.fillStyle = '#151C2A';
    ctx.fillRect(0, 0, width, height);
    rCtx.fillStyle = '#4C4C4C';
    rCtx.fillRect(0, 0, width, height);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, width, height);
    for (let i = 0; i < 6000; i++) {
      const px = (i * 227) % width;
      const py = (i * 419) % height;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(148,163,184,0.06)' : 'rgba(0,0,0,0.16)';
      ctx.fillRect(px, py, 2, 2);
      bCtx.fillStyle = i % 2 === 0 ? '#969696' : '#6A6A6A';
      bCtx.fillRect(px, py, 2, 2);
    }
  }

  // Painted apron & keys
  const paintColor =
    theme === 'pro' ? '#121E36' : theme === 'venice' ? '#C2410C' : '#1E3A8A';
  const accentColor =
    theme === 'pro' ? '#F59E0B' : theme === 'venice' ? '#FDBA74' : '#38BDF8';
  const lineColor = '#F8FAFC';

  const padX = 56;
  const padY = 64;
  const cw = width - padX * 2;
  const ch = height - padY * 2;

  // Outer apron
  ctx.fillStyle = paintColor;
  ctx.fillRect(0, 0, width, padY);
  ctx.fillRect(0, height - padY, width, padY);
  ctx.fillRect(0, 0, padX, height);
  ctx.fillRect(width - padX, 0, padX, height);

  // Two painted keys
  const keyW = cw * 0.34;
  const keyH = ch * 0.21;
  ctx.fillStyle = paintColor;
  ctx.fillRect(width / 2 - keyW / 2, padY, keyW, keyH);
  ctx.fillRect(width / 2 - keyW / 2, height - padY - keyH, keyW, keyH);

  // Satin matte roughness on painted keys & apron
  rCtx.fillStyle = '#686868';
  rCtx.fillRect(width / 2 - keyW / 2, padY, keyW, keyH);
  rCtx.fillRect(width / 2 - keyW / 2, height - padY - keyH, keyW, keyH);
  rCtx.fillRect(0, 0, width, padY);
  rCtx.fillRect(0, height - padY, width, padY);

  // Subtle sneaker scuff marks around free throw & paint (realistic game wear)
  ctx.strokeStyle = theme === 'pro' ? 'rgba(20, 20, 20, 0.12)' : 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  for (let s = 0; s < 42; s++) {
    const sx = width / 2 + ((s * 97) % Math.round(keyW * 1.4)) - keyW * 0.7;
    const sy = s % 2 === 0 ? padY + 60 + ((s * 43) % 240) : height - padY - 60 - ((s * 43) % 240);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 8, sy + 6, sx + 14, sy - 4);
    ctx.stroke();
  }

  // Center circle crest
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 108, 0, Math.PI * 2);
  ctx.fillStyle = paintColor;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accentColor;
  ctx.stroke();

  ctx.fillStyle = accentColor;
  ctx.font = '800 58px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HL', width / 2, height / 2 - 4);
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('HOOP LEGENDS', width / 2, height / 2 + 34);

  // Crisp white regulation court lines
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 6;

  // Boundary & Half-court line
  ctx.strokeRect(padX, padY, cw, ch);
  ctx.beginPath();
  ctx.moveTo(padX, height / 2);
  ctx.lineTo(width - padX, height / 2);
  ctx.stroke();

  // Coach box & substitution hash marks along sidelines
  ctx.lineWidth = 4;
  [height * 0.28, height * 0.44, height * 0.56, height * 0.72].forEach((hy) => {
    ctx.beginPath();
    ctx.moveTo(padX - 18, hy);
    ctx.lineTo(padX, hy);
    ctx.moveTo(width - padX, hy);
    ctx.lineTo(width - padX + 18, hy);
    ctx.stroke();
  });
  ctx.lineWidth = 6;

  // Keys + Free-throw circles + lane blocks
  ctx.strokeRect(width / 2 - keyW / 2, padY, keyW, keyH);
  ctx.strokeRect(width / 2 - keyW / 2, height - padY - keyH, keyW, keyH);

  // Lane hash marks (rebound spots)
  const laneXLeft = width / 2 - keyW / 2;
  const laneXRight = width / 2 + keyW / 2;
  [0.28, 0.48, 0.68, 0.85].forEach((frac) => {
    const ty = padY + keyH * frac;
    const by = height - padY - keyH * frac;
    ctx.beginPath();
    ctx.moveTo(laneXLeft - 14, ty);
    ctx.lineTo(laneXLeft, ty);
    ctx.moveTo(laneXRight, ty);
    ctx.lineTo(laneXRight + 14, ty);
    ctx.moveTo(laneXLeft - 14, by);
    ctx.lineTo(laneXLeft, by);
    ctx.moveTo(laneXRight, by);
    ctx.lineTo(laneXRight + 14, by);
    ctx.stroke();
  });

  // Free throw solid & dashed arcs
  ctx.beginPath();
  ctx.arc(width / 2, padY + keyH, keyW / 2, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width / 2, height - padY - keyH, keyW / 2, Math.PI, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.setLineDash([14, 14]);
  ctx.beginPath();
  ctx.arc(width / 2, padY + keyH, keyW / 2, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width / 2, height - padY - keyH, keyW / 2, 0, Math.PI);
  ctx.stroke();
  ctx.restore();

  // Restricted area arcs under hoops
  const hoopOffsetPx = 95;
  ctx.beginPath();
  ctx.arc(width / 2, padY + hoopOffsetPx, 72, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width / 2, height - padY - hoopOffsetPx, 72, Math.PI, Math.PI * 2);
  ctx.stroke();

  // 3-point arcs
  const threeRadiusPx = 376;
  ctx.beginPath();
  ctx.arc(width / 2, padY + hoopOffsetPx, threeRadiusPx, 0.14 * Math.PI, 0.86 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width / 2 - Math.cos(0.14 * Math.PI) * threeRadiusPx, padY);
  ctx.lineTo(
    width / 2 - Math.cos(0.14 * Math.PI) * threeRadiusPx,
    padY + hoopOffsetPx + Math.sin(0.14 * Math.PI) * threeRadiusPx
  );
  ctx.moveTo(width / 2 + Math.cos(0.14 * Math.PI) * threeRadiusPx, padY);
  ctx.lineTo(
    width / 2 + Math.cos(0.14 * Math.PI) * threeRadiusPx,
    padY + hoopOffsetPx + Math.sin(0.14 * Math.PI) * threeRadiusPx
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(width / 2, height - padY - hoopOffsetPx, threeRadiusPx, 1.14 * Math.PI, 1.86 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width / 2 - Math.cos(0.14 * Math.PI) * threeRadiusPx, height - padY);
  ctx.lineTo(
    width / 2 - Math.cos(0.14 * Math.PI) * threeRadiusPx,
    height - padY - hoopOffsetPx - Math.sin(0.14 * Math.PI) * threeRadiusPx
  );
  ctx.moveTo(width / 2 + Math.cos(0.14 * Math.PI) * threeRadiusPx, height - padY);
  ctx.lineTo(
    width / 2 + Math.cos(0.14 * Math.PI) * threeRadiusPx,
    height - padY - hoopOffsetPx - Math.sin(0.14 * Math.PI) * threeRadiusPx
  );
  ctx.stroke();

  const colorMap = new THREE.CanvasTexture(canvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  return { colorMap, roughnessMap, bumpMap };
}

/**
 * Generates realistic pebbled leather basketball texture + bump map.
 */
export function createBasketballTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const [canvas, ctx] = createCanvas(size, size);
  const [bumpCanvas, bCtx] = createCanvas(size, size);

  ctx.fillStyle = '#D96420';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 5200; i++) {
    const x = (i * 157) % size;
    const y = (i * 263) % size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,140,60,0.16)' : 'rgba(110,40,10,0.18)';
    ctx.fillRect(x, y, 2, 2);
    bCtx.fillStyle = i % 2 === 0 ? '#A8A8A8' : '#585858';
    bCtx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = '#181412';
  ctx.lineWidth = 10;
  bCtx.strokeStyle = '#202020';
  bCtx.lineWidth = 12;

  const drawSeams = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(0, size / 2);
    c.lineTo(size, size / 2);
    c.stroke();

    c.beginPath();
    c.moveTo(size / 2, 0);
    c.lineTo(size / 2, size);
    c.stroke();

    c.beginPath();
    c.ellipse(size * 0.22, size / 2, size * 0.16, size * 0.48, 0, 0, Math.PI * 2);
    c.stroke();

    c.beginPath();
    c.ellipse(size * 0.78, size / 2, size * 0.16, size * 0.48, 0, 0, Math.PI * 2);
    c.stroke();
  };

  drawSeams(ctx);
  drawSeams(bCtx);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  return { map, bumpMap };
}

/**
 * Generates dynamic jersey texture with micro-perforated mesh, curved collar trim, side vents, number, and back surname.
 */
export function createJerseyTexture(
  primaryColor: string,
  secondaryColor: string,
  jerseyNumber: number,
  shortName: string
): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 512);
  ctx.fillStyle = primaryColor;
  ctx.fillRect(0, 0, 512, 512);

  // Breathable mesh micro-weave
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < 512; y += 6) {
    for (let x = y % 12 === 0 ? 0 : 3; x < 512; x += 6) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Subtle fabric vertical fold shading
  const shadeGrad = ctx.createLinearGradient(0, 0, 512, 0);
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
  shadeGrad.addColorStop(0.25, 'rgba(0,0,0,0.1)');
  shadeGrad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  shadeGrad.addColorStop(0.75, 'rgba(0,0,0,0.1)');
  shadeGrad.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Collar, hem & athletic side accent stripes
  ctx.fillStyle = secondaryColor;
  ctx.fillRect(0, 0, 512, 22);
  ctx.fillRect(0, 488, 512, 24);
  ctx.fillRect(118, 0, 18, 512);
  ctx.fillRect(376, 0, 18, 512);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // BACK OF JERSEY (u = 0.5 -> x = 256, faces -Z toward follow camera)
  const cleanName = shortName.replace(/^[A-Z]\.\s*/, '').slice(0, 10);
  ctx.font = '700 24px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(cleanName, 256, 126);

  ctx.strokeStyle = secondaryColor;
  ctx.lineWidth = 4;
  ctx.font = '800 124px "Barlow Condensed", sans-serif';
  ctx.strokeText(String(jerseyNumber), 256, 256);
  ctx.fillText(String(jerseyNumber), 256, 256);

  // FRONT CHEST NUMBER (u = 0/1 seam -> x = 0 and x = 512, faces +Z)
  ctx.font = '800 108px "Barlow Condensed", sans-serif';
  ctx.strokeText(String(jerseyNumber), 0, 246);
  ctx.fillText(String(jerseyNumber), 0, 246);
  ctx.strokeText(String(jerseyNumber), 512, 246);
  ctx.fillText(String(jerseyNumber), 512, 246);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates realistic basketball shorts mesh texture with side vent stripes and hem trim band.
 */
export function createShortsTexture(
  primaryColor: string,
  secondaryColor: string
): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.fillStyle = primaryColor;
  ctx.fillRect(0, 0, 256, 256);

  // Breathable athletic mesh weave
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < 256; y += 5) {
    for (let x = y % 10 === 0 ? 0 : 2; x < 256; x += 5) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Subtle vertical pleat shading
  const shadeGrad = ctx.createLinearGradient(0, 0, 256, 0);
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
  shadeGrad.addColorStop(0.25, 'rgba(0,0,0,0.11)');
  shadeGrad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  shadeGrad.addColorStop(0.75, 'rgba(0,0,0,0.11)');
  shadeGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Side accent stripes & bottom hem trim band (maps cleanly to dynamic cloth hem)
  ctx.fillStyle = secondaryColor;
  ctx.fillRect(58, 0, 14, 256);
  ctx.fillRect(184, 0, 14, 256);
  ctx.fillRect(0, 232, 256, 24);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates an expressive, recognizable procedural face texture mapped to the sculpted cranium (+Z face at u=0.75 or u=0.5 depending on rotation).
 * Note: Three.js SphereGeometry places +Z at u = 0.25 (phiStart = 0 -> -X -> +Z at PI/2 -> +X -> -Z).
 * We orient the cranium so u = 0.5 (x = 256) sits cleanly at local +Z!
 */
export function createFaceTexture(
  skinTone: string,
  hairColor: string,
  facialHair: PlayerCard['appearance']['facialHair'],
  eyeColor = '#2A1D15',
  isStern = false
): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 256);

  // Base skin tone + natural subsurface warmth
  ctx.fillStyle = skinTone;
  ctx.fillRect(0, 0, 512, 256);

  // Cheekbone & forehead studio shading
  const faceGrad = ctx.createRadialGradient(256, 118, 20, 256, 128, 120);
  faceGrad.addColorStop(0, 'rgba(255, 228, 204, 0.14)');
  faceGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0)');
  faceGrad.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
  ctx.fillStyle = faceGrad;
  ctx.fillRect(130, 30, 252, 200);

  // Eye sockets soft shadow
  ctx.fillStyle = 'rgba(20, 10, 6, 0.22)';
  ctx.beginPath();
  ctx.ellipse(228, 114, 16, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(284, 114, 16, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sclera (eyes) + irises + pupils + catchlight
  [228, 284].forEach((ex) => {
    ctx.fillStyle = '#F8F5F0';
    ctx.beginPath();
    ctx.ellipse(ex, 114, 11.5, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(ex, 114, 5.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.arc(ex, 114, 2.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(ex + 1.6, 112.2, 1.3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Expressive eyebrows
  ctx.strokeStyle = hairColor;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const tilt = isStern ? 4.5 : 1.5;
  ctx.beginPath();
  ctx.moveTo(212, 99 - tilt);
  ctx.quadraticCurveTo(228, 95, 242, 100 + tilt * 0.6);
  ctx.moveTo(270, 100 + tilt * 0.6);
  ctx.quadraticCurveTo(284, 95, 300, 99 - tilt);
  ctx.stroke();

  // Nose bridge highlight & nostrils shadow
  ctx.fillStyle = 'rgba(255, 240, 224, 0.16)';
  ctx.fillRect(253, 112, 6, 26);
  ctx.fillStyle = 'rgba(20, 10, 6, 0.34)';
  ctx.beginPath();
  ctx.ellipse(249, 140, 4.8, 3.2, 0, 0, Math.PI * 2);
  ctx.ellipse(263, 140, 4.8, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cheekbone contour lines
  ctx.strokeStyle = 'rgba(30, 14, 8, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(214, 134);
  ctx.quadraticCurveTo(224, 146, 238, 152);
  ctx.moveTo(298, 134);
  ctx.quadraticCurveTo(288, 146, 274, 152);
  ctx.stroke();

  // Mouth & lips
  ctx.fillStyle = 'rgba(72, 28, 24, 0.62)';
  ctx.beginPath();
  ctx.ellipse(256, 160, 17, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 8, 6, 0.6)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(239, 160);
  ctx.lineTo(273, 160);
  ctx.stroke();

  // Facial hair texture layer (stubble / goatee / full beard)
  if (facialHair === 'stubble') {
    ctx.fillStyle = `${hairColor}44`;
    for (let i = 0; i < 450; i++) {
      const sx = 212 + ((i * 53) % 88);
      const sy = 150 + ((i * 31) % 44);
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
  } else if (facialHair === 'goatee') {
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.roundRect(236, 150, 40, 6, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(256, 176, 17, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (facialHair === 'full_beard') {
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.moveTo(202, 132);
    ctx.quadraticCurveTo(204, 198, 256, 204);
    ctx.quadraticCurveTo(308, 198, 310, 132);
    ctx.lineTo(298, 134);
    ctx.quadraticCurveTo(290, 166, 256, 168);
    ctx.quadraticCurveTo(222, 166, 214, 134);
    ctx.closePath();
    ctx.fill();
    // Mustache bridge
    ctx.beginPath();
    ctx.roundRect(234, 149, 44, 7, 3);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates NBA-authentic grey & black vertical striped referee shirt texture.
 */
export function createRefereeTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#111827';
  const stripeW = 16;
  for (let x = 0; x < 256; x += stripeW * 2) {
    ctx.fillRect(x, 0, stripeW, 256);
  }
  // Black collar & cuffs + subtle chest badge
  ctx.fillRect(0, 0, 256, 18);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(10, 56, 18, 12);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates broadcast Jumbotron 4-sided LED display texture.
 */
export function createJumbotronTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 256);
  const grad = ctx.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, '#090D18');
  grad.addColorStop(0.5, '#131C33');
  grad.addColorStop(1, '#090D18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Top & bottom amber LED accents
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 0, 512, 10);
  ctx.fillRect(0, 246, 512, 10);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F59E0B';
  ctx.font = '800 54px "Barlow Condensed", sans-serif';
  ctx.fillText('HOOP LEGENDS ARENA', 256, 86);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 32px "JetBrains Mono", monospace';
  ctx.fillText('LIVE BROADCAST · 24s', 256, 152);

  ctx.fillStyle = '#38BDF8';
  ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('CHAMPIONSHIP COURT', 256, 202);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates courtside LED scorer's table ribbon texture.
 */
export function createScorersTableTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(1024, 128);
  ctx.fillStyle = '#0A0F1C';
  ctx.fillRect(0, 0, 1024, 128);

  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 0, 1024, 8);
  ctx.fillRect(0, 120, 1024, 8);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 44px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText('HOOP LEGENDS   ·   WORLD SERIES   ·   DREAM SQUAD LIVE', 512, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates soft radial contact shadow disc texture for players, feet, and ball.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
