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
   * @param {import('./SpriteSheet').SpriteSheet} spriteSheetKitten - 幼猫 spritesheet（stage 0 使用）
   * @param {number} renderSize - 渲染尺寸（正方形）
   */
  constructor(canvas, spriteSheet, spriteSheetKitten, renderSize = 128) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.spriteSheet = spriteSheet;
    this.spriteSheetKitten = spriteSheetKitten;
    this.renderSize = renderSize;
    this._growthStage = 0;

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

    // overlay 绘制回调（用于叠加动画，如喂食特效）
    this.overlayDrawFn = null;   // 兼容旧 API
    this._overlays = [];         // 多 overlay 数组

    // 启用像素风格渲染（锐利边缘）
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * 设置成长阶段（影响使用的 spritesheet 和滤镜）
   * @param {number} stage 0-3
   */
  setGrowthStage(stage) {
    this._growthStage = stage;
  }

  /** 添加 overlay 绘制回调 */
  addOverlay(fn) { this._overlays.push(fn); }

  /** 移除 overlay 绘制回调 */
  removeOverlay(fn) { this._overlays = this._overlays.filter(f => f !== fn); }

  /**
   * 设置当前动画
   * @param {string} animationName
   * @param {boolean} resetFrame - 是否重置到第0帧
   */
  setAnimation(animationName, resetFrame = true) {
    // 状态→动画名映射（某些状态复用已有动画）
    const animMap = { edge_idle: 'sit' };
    const resolved = animMap[animationName] || animationName;

    if (this.currentAnimation === resolved && !resetFrame) return;

    const sheet = this._getActiveSheet();
    const anim = sheet.getAnimation(resolved);
    if (!anim) {
      console.warn(`Animation "${animationName}" not found, keeping current`);
      return;
    }

    this.currentAnimation = resolved;
    if (resetFrame) {
      this.currentFrame = 0;
      this.frameAccumulator = 0;
    }
  }

  /** 根据成长阶段选择当前使用的 spritesheet */
  _getActiveSheet() {
    if (this._growthStage === 0 && this.spriteSheetKitten?.loaded) {
      return this.spriteSheetKitten;
    }
    return this.spriteSheet;
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
    const sheet = this._getActiveSheet();
    const fps = sheet.getFPS(this.currentAnimation);
    const frameDuration = 1000 / fps;
    const anim = sheet.getAnimation(this.currentAnimation);
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

    // 根据成长阶段选择 spritesheet 和 CSS filter
    const sheet = this._getActiveSheet();
    const stageFilters = [
      null,                               // 0: 幼猫 sprite 自带特征
      'brightness(1.12) saturate(0.8)',  // 1: 少年猫，偏亮淡
      null,                               // 2: 成年默认
      'saturate(1.25) brightness(0.92)', // 3: 更饱和
    ];
    const stageFilter = stageFilters[this._growthStage] || null;

    if (stageFilter) {
      this.ctx.filter = stageFilter;
    }

    // 呼吸效果：以底部为锚点，垂直轻微缩放
    const breathPhase = (this._totalTime % this._breathPeriod) / this._breathPeriod;
    const breathScale = 1 + this._breathAmount * Math.sin(breathPhase * Math.PI * 2);

    this.ctx.save();
    this.ctx.translate(w / 2, h);          // 锚点移到底部中心

    // 幼猫缩小 0.85x，以底部为锚点
    if (this._growthStage === 0) {
      this.ctx.scale(0.85, 0.85);
    }

    this.ctx.scale(1, breathScale);         // 仅垂直方向缩放
    this.ctx.translate(-w / 2, -h);        // 还原

    // 绘制当前帧
    sheet.drawFrame(
      this.ctx,
      this.currentAnimation,
      this.currentFrame,
      0, 0,
      this.renderSize, this.renderSize,
      this.flipX
    );

    this.ctx.restore();
    this.ctx.filter = 'none'; // 重置滤镜

    // overlay 绘制（叠加在猫咪之上）
    if (this.overlayDrawFn) {
      this.overlayDrawFn(this.ctx, w, h);
    }
    for (const fn of this._overlays) {
      fn(this.ctx, w, h);
    }
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
