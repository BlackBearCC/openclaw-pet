/**
 * generate-placeholder.js
 * 生成占位像素帧动画 spritesheet（纯 Node.js，无依赖）
 *
 * 生成一个小猫轮廓的像素帧动画：
 * - idle: 8帧（呼吸效果）
 * - walk: 8帧（走动）
 * - sit: 4帧
 * - sleep: 4帧
 * - click_react: 4帧
 * - drag: 2帧
 * - happy: 4帧
 * - sad: 4帧
 * - talk: 4帧
 *
 * 输出：assets/sprites/placeholder/spritesheet.png + spritesheet.json
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FRAME_SIZE = 128;
const ANIMATIONS = {
  idle:        { frames: 8, row: 0 },
  walk:        { frames: 8, row: 1 },
  sit:         { frames: 4, row: 2 },
  sleep:       { frames: 4, row: 3 },
  click_react: { frames: 4, row: 4 },
  drag:        { frames: 2, row: 5 },
  happy:       { frames: 4, row: 6 },
  sad:         { frames: 4, row: 7 },
  talk:        { frames: 4, row: 8 },
};

const COLS = 8;
const ROWS = Object.keys(ANIMATIONS).length;

// ===== 像素猫绘制 =====

// 基础猫咪模板 (32x32 grid mapped to 128x128)
// 1=body, 2=ear, 3=eye, 4=nose, 5=mouth, 6=tail, 7=paw
const CAT_BASE = [
  '00000000000000000000000000000000',
  '00000022000000000000220000000000',
  '00000222000000000000222000000000',
  '00002221000000000000122200000000',
  '00022211000000000000112200000000',
  '00221111111111111111111122000000',
  '00111111111111111111111111000000',
  '00111111111111111111111111000000',
  '00111111111111111111111111000000',
  '00111111113111111131111111000000',
  '00111111113111111131111111000000',
  '00111111111111411111111111000000',
  '00111111111115511111111111000000',
  '00011111111111111111111110000000',
  '00001111111111111111111100000000',
  '00000111111111111111111000000000',
  '00000011111111111111110000000000',
  '00000011111111111111110000000000',
  '00000011111111111111110000000000',
  '00000011111111111111110000000000',
  '00000011111111111111110000000000',
  '00000071111111111111170000000000',
  '00000077000000000000770000000000',
  '00000077000000000000770000000000',
  '00000000000000000000000000000000',
];

const COLORS = {
  0: [0, 0, 0, 0],         // transparent
  1: [255, 180, 100, 255],  // body (orange tabby)
  2: [255, 160, 80, 255],   // ears (darker orange)
  3: [40, 40, 40, 255],     // eyes (dark)
  4: [255, 130, 150, 255],  // nose (pink)
  5: [200, 140, 80, 255],   // mouth
  6: [255, 170, 90, 255],   // tail
  7: [220, 160, 90, 255],   // paws
};

function parseCatTemplate(template) {
  const pixels = [];
  for (let y = 0; y < template.length; y++) {
    const row = [];
    for (let x = 0; x < template[y].length; x++) {
      row.push(parseInt(template[y][x]));
    }
    pixels.push(row);
  }
  return pixels;
}

function drawCatFrame(imageData, offsetX, offsetY, frameWidth, frameHeight, catPixels, modFn) {
  const scale = 4; // 32 -> 128 (each pixel = 4x4)
  const catW = catPixels[0].length;
  const catH = catPixels.length;
  const startX = Math.floor((frameWidth - catW * scale) / 2);
  const startY = Math.floor((frameHeight - catH * scale) / 2) + 8; // slightly lower

  for (let cy = 0; cy < catH; cy++) {
    for (let cx = 0; cx < catW; cx++) {
      let colorIdx = catPixels[cy][cx];
      let color = [...COLORS[colorIdx]];

      if (modFn) {
        color = modFn(cx, cy, colorIdx, color);
      }

      if (color[3] === 0) continue;

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = offsetX + startX + cx * scale + sx;
          const py = offsetY + startY + cy * scale + sy;
          const idx = (py * imageData.width + px) * 4;
          imageData.data[idx] = color[0];
          imageData.data[idx + 1] = color[1];
          imageData.data[idx + 2] = color[2];
          imageData.data[idx + 3] = color[3];
        }
      }
    }
  }
}

// Animation frame modifiers
function idleModifier(frame) {
  const breathOffset = Math.sin(frame * Math.PI / 4) * 0.5;
  return (cx, cy, idx, color) => {
    // slight vertical bounce for breathing
    if (idx === 3 && frame % 4 < 2) {
      // blink every 4 frames
      return [0, 0, 0, 0]; // eyes closed
    }
    return color;
  };
}

function walkModifier(frame) {
  return (cx, cy, idx, color) => {
    // paw animation - alternate paws
    if (idx === 7) {
      const pawPhase = frame % 4;
      if (cx < 16 && pawPhase < 2) return [...color.slice(0, 3), 200];
      if (cx >= 16 && pawPhase >= 2) return [...color.slice(0, 3), 200];
    }
    return color;
  };
}

function sitModifier(frame) {
  return (cx, cy, idx, color) => color;
}

function sleepModifier(frame) {
  return (cx, cy, idx, color) => {
    // eyes always closed
    if (idx === 3) return [0, 0, 0, 0];
    // slightly dimmer
    return [color[0] * 0.9, color[1] * 0.9, color[2] * 0.9, color[3]];
  };
}

function clickReactModifier(frame) {
  return (cx, cy, idx, color) => {
    // eyes wide, brighter
    if (idx === 3) return [20, 20, 20, 255];
    return [
      Math.min(255, color[0] + 20),
      Math.min(255, color[1] + 20),
      Math.min(255, color[2] + 20),
      color[3]
    ];
  };
}

function dragModifier(frame) {
  return (cx, cy, idx, color) => {
    // surprised look
    if (idx === 3) return [60, 60, 60, 255]; // bigger eyes
    return color;
  };
}

function happyModifier(frame) {
  return (cx, cy, idx, color) => {
    if (idx === 3 && frame % 2 === 0) return [0, 0, 0, 0]; // winking
    if (idx === 5) return [255, 100, 120, 255]; // smile
    return [
      Math.min(255, color[0] + 15),
      Math.min(255, color[1] + 15),
      color[2], color[3]
    ];
  };
}

function sadModifier(frame) {
  return (cx, cy, idx, color) => {
    // droopy, blue-tinted
    return [
      color[0] * 0.85,
      color[1] * 0.85,
      Math.min(255, color[2] + 30),
      color[3]
    ];
  };
}

function talkModifier(frame) {
  return (cx, cy, idx, color) => {
    // mouth open/close animation
    if (idx === 5 && frame % 2 === 0) return [180, 80, 80, 255];
    return color;
  };
}

const MODIFIERS = {
  idle: idleModifier,
  walk: walkModifier,
  sit: sitModifier,
  sleep: sleepModifier,
  click_react: clickReactModifier,
  drag: dragModifier,
  happy: happyModifier,
  sad: sadModifier,
  talk: talkModifier,
};

// ===== PNG Encoder (minimal, no dependencies) =====

function createPNG(width, height, rgbaData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = rgbaData[srcIdx];
      rawData[dstIdx + 1] = rgbaData[srcIdx + 1];
      rawData[dstIdx + 2] = rgbaData[srcIdx + 2];
      rawData[dstIdx + 3] = rgbaData[srcIdx + 3];
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 for PNG
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ===== Main Generation =====

function generate() {
  const totalWidth = COLS * FRAME_SIZE;
  const totalHeight = ROWS * FRAME_SIZE;

  const imageData = {
    width: totalWidth,
    height: totalHeight,
    data: new Uint8Array(totalWidth * totalHeight * 4) // all zeros = transparent
  };

  const catPixels = parseCatTemplate(CAT_BASE);
  const spritesheetMeta = {
    frameSize: FRAME_SIZE,
    animations: {}
  };

  for (const [animName, animConfig] of Object.entries(ANIMATIONS)) {
    const modifierFactory = MODIFIERS[animName];
    const frames = [];

    for (let f = 0; f < animConfig.frames; f++) {
      const offsetX = f * FRAME_SIZE;
      const offsetY = animConfig.row * FRAME_SIZE;

      const modifier = modifierFactory ? modifierFactory(f) : null;
      drawCatFrame(imageData, offsetX, offsetY, FRAME_SIZE, FRAME_SIZE, catPixels, modifier);

      frames.push({
        x: offsetX,
        y: offsetY,
        w: FRAME_SIZE,
        h: FRAME_SIZE
      });
    }

    spritesheetMeta.animations[animName] = {
      frames,
      fps: animName === 'sleep' ? 4 : 8,
      loop: !['click_react', 'happy', 'sad'].includes(animName)
    };
  }

  // Write PNG
  const outDir = path.join(__dirname, '..', 'assets', 'sprites', 'placeholder');
  fs.mkdirSync(outDir, { recursive: true });

  const pngBuffer = createPNG(totalWidth, totalHeight, imageData.data);
  fs.writeFileSync(path.join(outDir, 'spritesheet.png'), pngBuffer);

  // Write JSON metadata
  fs.writeFileSync(
    path.join(outDir, 'spritesheet.json'),
    JSON.stringify(spritesheetMeta, null, 2)
  );

  console.log(`✅ Generated spritesheet: ${totalWidth}x${totalHeight}px`);
  console.log(`   Animations: ${Object.keys(ANIMATIONS).join(', ')}`);
  console.log(`   Output: ${outDir}/`);
}

generate();
