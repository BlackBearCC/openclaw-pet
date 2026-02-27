/**
 * StateMachine.js
 * 动画状态机 — 管理宠物的动画状态转换
 *
 * 状态转换规则：
 *   idle → walk（随机触发）
 *   idle → sit（随机）
 *   idle → sleep（无交互 >60s）
 *   any → drag（鼠标按下）
 *   drag → idle（鼠标释放）
 *   any → click_react（点击，持续后回到前状态）
 *   any → talk（收到消息）
 *   any → happy/sad（根据情绪）
 */

export class StateMachine {
  constructor() {
    this.currentState = 'idle';
    this.previousState = 'idle';
    this.stateTime = 0;          // 当前状态持续时间(ms)
    this.listeners = new Map();   // 状态变化监听器
    this.locked = false;          // 是否锁定状态（用于临时动画）
    this.lockTimer = null;
    this.transitions = this._buildTransitions();
  }

  _buildTransitions() {
    // 定义允许的状态转换
    return {
      idle: ['walk', 'sit', 'sleep', 'drag', 'click_react', 'talk', 'happy', 'sad'],
      walk: ['idle', 'drag', 'click_react', 'talk', 'happy', 'sad'],
      sit: ['idle', 'drag', 'click_react', 'talk', 'happy', 'sad'],
      sleep: ['idle', 'drag', 'click_react', 'talk', 'happy', 'sad'],
      drag: ['idle'],
      click_react: ['idle', 'walk', 'sit', 'sleep'], // 回到之前的状态
      talk: ['idle'],
      happy: ['idle'],
      sad: ['idle'],
    };
  }

  /**
   * 尝试切换状态
   * @param {string} newState
   * @param {object} options - { force: bool, duration: number (ms) }
   * @returns {boolean} 是否成功切换
   */
  transition(newState, options = {}) {
    const { force = false, duration = 0 } = options;

    // 如果锁定且非强制，拒绝切换
    if (this.locked && !force) return false;

    // 检查转换是否合法
    const allowed = this.transitions[this.currentState];
    if (!force && allowed && !allowed.includes(newState)) {
      return false;
    }

    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateTime = 0;

    // 清除旧的锁定计时器
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }

    // 如果指定了持续时间，锁定状态并在结束后回到之前状态
    if (duration > 0) {
      this.locked = true;
      this.lockTimer = setTimeout(() => {
        this.locked = false;
        this.lockTimer = null;
        this.transition(this._getReturnState());
      }, duration);
    } else {
      this.locked = false;
    }

    // 触发监听器
    this._emit('stateChange', {
      from: this.previousState,
      to: this.currentState,
      duration
    });

    return true;
  }

  /**
   * 获取临时状态结束后应该返回的状态
   */
  _getReturnState() {
    // 如果之前是临时状态，返回 idle
    const tempStates = ['click_react', 'happy', 'sad', 'talk', 'drag'];
    if (tempStates.includes(this.previousState)) {
      return 'idle';
    }
    return this.previousState;
  }

  /**
   * 更新状态时间
   * @param {number} deltaMs
   */
  update(deltaMs) {
    this.stateTime += deltaMs;
  }

  /**
   * 监听状态变化
   * @param {string} event - 'stateChange'
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(callback);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  _emit(event, data) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach(cb => cb(data));
    }
  }

  /**
   * 获取当前状态
   */
  getState() {
    return this.currentState;
  }

  /**
   * 获取当前状态持续时间
   */
  getStateTime() {
    return this.stateTime;
  }

  /**
   * 是否处于锁定状态
   */
  isLocked() {
    return this.locked;
  }

  /**
   * 强制解锁
   */
  unlock() {
    this.locked = false;
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
  }

  /**
   * 销毁
   */
  destroy() {
    this.unlock();
    this.listeners.clear();
  }
}
