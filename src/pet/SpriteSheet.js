/**
 * SpriteSheet.js
 * Spritesheet 加载与解析
 *
 * 加载 spritesheet.png + spritesheet.json，提供按动画名+帧号获取帧数据的接口
 */

export class SpriteSheet {
  constructor() {
    this.image = null;
    this.meta = null;
    this.loaded = false;
  }

  /**
   * 加载 spritesheet 图片和元数据
   * @param {string} imagePath - spritesheet.png 路径
   * @param {string} metaPath - spritesheet.json 路径
   */
  async load(imagePath, metaPath) {
    const [image, metaResponse] = await Promise.all([
      this._loadImage(imagePath),
      fetch(metaPath).then(r => r.json())
    ]);

    this.image = image;
    this.meta = metaResponse;
    this.loaded = true;
  }

  _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error(`Failed to load spritesheet: ${src}`));
      img.src = src;
    });
  }

  /**
   * 获取动画配置
   * @param {string} animationName
   * @returns {{ frames: Array, fps: number, loop: boolean }}
   */
  getAnimation(animationName) {
    if (!this.meta || !this.meta.animations[animationName]) {
      console.warn(`Animation "${animationName}" not found in spritesheet`);
      return null;
    }
    return this.meta.animations[animationName];
  }

  /**
   * 获取指定动画的指定帧
   * @param {string} animationName
   * @param {number} frameIndex
   * @returns {{ x, y, w, h } | null}
   */
  getFrame(animationName, frameIndex) {
    const anim = this.getAnimation(animationName);
    if (!anim) return null;
    const idx = frameIndex % anim.frames.length;
    return anim.frames[idx];
  }

  /**
   * 在 Canvas 上绘制指定帧
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} animationName
   * @param {number} frameIndex
   * @param {number} dx - 目标 x
   * @param {number} dy - 目标 y
   * @param {number} dw - 目标宽度
   * @param {number} dh - 目标高度
   * @param {boolean} flipX - 是否水平翻转
   */
  drawFrame(ctx, animationName, frameIndex, dx, dy, dw, dh, flipX = false) {
    if (!this.loaded) return;

    const frame = this.getFrame(animationName, frameIndex);
    if (!frame) return;

    ctx.save();

    if (flipX) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.image,
        frame.x, frame.y, frame.w, frame.h,
        0, 0, dw, dh
      );
    } else {
      ctx.drawImage(
        this.image,
        frame.x, frame.y, frame.w, frame.h,
        dx, dy, dw, dh
      );
    }

    ctx.restore();
  }

  /**
   * 获取动画帧数
   */
  getFrameCount(animationName) {
    const anim = this.getAnimation(animationName);
    return anim ? anim.frames.length : 0;
  }

  /**
   * 获取动画帧率
   */
  getFPS(animationName) {
    const anim = this.getAnimation(animationName);
    return anim ? anim.fps : 8;
  }

  /**
   * 获取所有动画名
   */
  getAnimationNames() {
    return this.meta ? Object.keys(this.meta.animations) : [];
  }
}
