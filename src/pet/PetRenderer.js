/**
 * PetRenderer.js
 * Canvas 帧动画渲染器
 *
 * 职责：
 * - 管理 Canvas 元素
 * - 按帧率从 SpriteSheet 中绘制当前动画帧
 * - 支持水平翻转（左右走动）
 * - 透明背景渲染
 */

export class PetRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./SpriteSheet').SpriteSheet} spriteSheet
   * @param {number} renderSize - 渲染尺寸（正方形）
   */
  constructor(canvas, spriteSheet, renderSize = 128) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.spriteSheet = spriteSheet;
    this.renderSize = renderSize;

    // 设置 canvas 尺寸
    this.canvas.width = renderSize;
    this.canvas.height = renderSize;

    // 动画状态
    this.currentAnimation = 'idle';
    this.currentFrame = 0;
    this.frameAccumulator = 0; // 帧时间累加器
    this.flipX = false;
    this.isPlaying = true;

    // 渲染循环
    this._lastTime = 0;
    this._animFrameId = null;

    // 呼吸效果
    this._totalTime = 0;
    this._breathPeriod = 3200;  // 一次完整呼吸 3.2s
    this._breathAmount = 0.018; // 垂直缩放幅度 ±1.8%

    // 启用像素风格渲染（锐利边缘）
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * 设置当前动画
   * @param {string} animationName
   * @param {boolean} resetFrame - 是否重置到第0帧
   */
  setAnimation(animationName, resetFrame = true) {
    if (this.currentAnimation === animationName && !resetFrame) return;

    const anim = this.spriteSheet.getAnimation(animationName);
    if (!anim) {
      console.warn(`Animation "${animationName}" not found, keeping current`);
      return;
    }

    this.currentAnimation = animationName;
    if (resetFrame) {
      this.currentFrame = 0;
      this.frameAccumulator = 0;
    }
  }

  /**
   * 设置水平翻转
   */
  setFlipX(flip) {
    this.flipX = flip;
  }

  /**
   * 启动渲染循环
   */
  start() {
    this.isPlaying = true;
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  /**
   * 停止渲染循环
   */
  stop() {
    this.isPlaying = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  /**
   * 渲染循环
   */
  _loop(timestamp) {
    if (!this.isPlaying) return;

    const deltaMs = timestamp - this._lastTime;
    this._lastTime = timestamp;

    this._updateFrame(deltaMs);
    this._render();

    this._animFrameId = requestAnimationFrame((t) => this._loop(t));
  }

  /**
   * 更新帧
   */
  _updateFrame(deltaMs) {
    this._totalTime += deltaMs;
    const fps = this.spriteSheet.getFPS(this.currentAnimation);
    const frameDuration = 1000 / fps;
    const anim = this.spriteSheet.getAnimation(this.currentAnimation);
    if (!anim) return;

    this.frameAccumulator += deltaMs;

    while (this.frameAccumulator >= frameDuration) {
      this.frameAccumulator -= frameDuration;
      this.currentFrame++;

      if (this.currentFrame >= anim.frames.length) {
        if (anim.loop) {
          this.currentFrame = 0;
        } else {
          this.currentFrame = anim.frames.length - 1;
          // 非循环动画播放完毕，触发回调
          if (this.onAnimationEnd) {
            this.onAnimationEnd(this.currentAnimation);
          }
        }
      }
    }
  }

  /**
   * 渲染当前帧
   */
  _render() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 清除画布（透明）
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.imageSmoothingEnabled = false;

    // 呼吸效果：以底部为锚点，垂直轻微缩放
    const breathPhase = (this._totalTime % this._breathPeriod) / this._breathPeriod;
    const breathScale = 1 + this._breathAmount * Math.sin(breathPhase * Math.PI * 2);

    this.ctx.save();
    this.ctx.translate(w / 2, h);          // 锚点移到底部中心
    this.ctx.scale(1, breathScale);         // 仅垂直方向缩放
    this.ctx.translate(-w / 2, -h);        // 还原

    // 绘制当前帧
    this.spriteSheet.drawFrame(
      this.ctx,
      this.currentAnimation,
      this.currentFrame,
      0, 0,
      this.renderSize, this.renderSize,
      this.flipX
    );

    this.ctx.restore();
  }

  /**
   * 手动渲染单帧（用于暂停状态下的更新）
   */
  renderOnce() {
    this._render();
  }

  /**
   * 获取当前动画名
   */
  getCurrentAnimation() {
    return this.currentAnimation;
  }

  /**
   * 获取当前帧号
   */
  getCurrentFrame() {
    return this.currentFrame;
  }

  /**
   * 设置动画结束回调
   */
  setOnAnimationEnd(callback) {
    this.onAnimationEnd = callback;
  }

  /**
   * 销毁
   */
  destroy() {
    this.stop();
    this.onAnimationEnd = null;
  }
}
