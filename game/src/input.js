const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyE', 'KeyR', 'KeyB',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Space', 'Tab',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7',
  'Digit8', 'Digit9',
]);

function editing(target) {
  return target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName);
}

// Use KeyboardEvent.code (KeyW, Space, Digit1...). Poll held state freely.
// consumePress handles one-off UI actions even across multiple fixed substeps.
// Call endFrame after the input-consuming update; consumeLook accepts a reused
// {x,y} object so player movement never needs a per-tick input allocation.
export class Input {
  constructor(element, { onLockChange = null } = {}) {
    if (!element?.addEventListener) throw new TypeError('Input needs a game canvas.');
    this.element = element;
    this.document = element.ownerDocument;
    this.window = this.document.defaultView;
    this.keys = new Set();
    this.buttons = new Set();
    this.look = { x: 0, y: 0 };
    this.wheel = 0;
    this.locked = this.document.pointerLockElement === element;
    this.lockError = '';
    this.onLockChange = onLockChange;
    this._pressed = new Set();
    this._released = new Set();
    this._mousePressed = new Set();
    this._mouseReleased = new Set();
    this._listeners = [];
    this._disposed = false;
    this._lockPending = false;

    this._listen(this.document, 'keydown', event => {
      if (editing(event.target) || !event.code) return;
      if (this.locked && GAME_KEYS.has(event.code)) event.preventDefault();
      if (!event.repeat && !this.keys.has(event.code)) this._pressed.add(event.code);
      this.keys.add(event.code);
    });
    this._listen(this.document, 'keyup', event => {
      if (this.keys.delete(event.code)) this._released.add(event.code);
      if (this.locked && GAME_KEYS.has(event.code) && !editing(event.target)) {
        event.preventDefault();
      }
    });
    this._listen(this.document, 'mousemove', event => {
      if (!this.locked) return;
      this.look.x += event.movementX || 0;
      this.look.y += event.movementY || 0;
    });
    this._listen(this.document, 'mousedown', event => {
      if (!this.locked) return;
      if (!this.buttons.has(event.button)) this._mousePressed.add(event.button);
      this.buttons.add(event.button);
      event.preventDefault();
    });
    this._listen(this.window, 'mouseup', event => {
      if (this.buttons.delete(event.button)) this._mouseReleased.add(event.button);
    });
    this._listen(element, 'mousedown', event => {
      if (!this.locked && event.button === 0 && !event.defaultPrevented) void this.lock();
    });
    this._listen(this.document, 'wheel', event => {
      if (!this.locked) return;
      this.wheel += Math.sign(event.deltaY);
      event.preventDefault();
    }, { passive: false });
    this._listen(this.document, 'contextmenu', event => {
      if (this.locked || element.contains(event.target)) event.preventDefault();
    });
    this._listen(this.document, 'pointerlockchange', () => {
      const locked = this.document.pointerLockElement === element;
      if (locked === this.locked) return;
      this.locked = locked;
      this.reset();
      if (locked) this.lockError = '';
      this.onLockChange?.(locked);
    });
    this._listen(this.document, 'pointerlockerror', () => {
      this.lockError = 'Mouse capture was denied. Click to play again.';
    });
    this._listen(this.window, 'blur', () => this.reset());
    this._listen(this.document, 'visibilitychange', () => {
      if (this.document.hidden) this.reset();
    });
  }

  _listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this._listeners.push({ target, type, listener, options });
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this._pressed.has(code); }
  released(code) { return this._released.has(code); }
  consumePress(code) { return this._pressed.delete(code); }
  mouseDown(button = 0) { return this.buttons.has(button); }
  mousePressed(button = 0) { return this._mousePressed.has(button); }
  mouseReleased(button = 0) { return this._mouseReleased.has(button); }
  consumeMousePress(button = 0) { return this._mousePressed.delete(button); }

  consumeLook(out) {
    out.x = this.look.x;
    out.y = this.look.y;
    this.look.x = this.look.y = 0;
    return out;
  }

  consumeWheel() {
    const amount = this.wheel;
    this.wheel = 0;
    return amount;
  }

  endFrame() {
    this._pressed.clear();
    this._released.clear();
    this._mousePressed.clear();
    this._mouseReleased.clear();
    this.look.x = this.look.y = this.wheel = 0;
  }

  reset() {
    this.keys.clear();
    this.buttons.clear();
    this.endFrame();
  }

  // Call directly from a click gesture. Catch promise-based and synchronous
  // failures; the pointerlockchange event is the authority for `locked`.
  async lock() {
    if (this._disposed || this._lockPending) return false;
    if (this.document.pointerLockElement === this.element) return true;
    if (!this.element.requestPointerLock) {
      this.lockError = 'This browser does not support mouse capture.';
      return false;
    }
    this._lockPending = true;
    this.lockError = '';
    try {
      await this.element.requestPointerLock();
      if (this._disposed) this.unlock();
      return !this._disposed;
    } catch (error) {
      this.lockError = error?.message || 'Mouse capture failed. Click to play again.';
      return false;
    } finally {
      this._lockPending = false;
    }
  }

  unlock() {
    if (this.document.pointerLockElement === this.element) this.document.exitPointerLock();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.unlock();
    for (const { target, type, listener, options } of this._listeners) {
      target.removeEventListener(type, listener, options);
    }
    this._listeners.length = 0;
    this.locked = false;
    this.reset();
  }
}
