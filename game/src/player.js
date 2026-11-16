import * as THREE from 'three';
import { move, collide, spawns } from './world.js';

const STAND = 1.75, CROUCH = 1.1;
// Feet positions and the same move/health interface are shared with bot actors.
export class Player {
  constructor(camera, input, { onSound = null, onDamage = null, onDeath = null } = {}) {
    this.name = 'You'; this.team = 'solstice'; this.camera = camera; this.input = input;
    this.position = new THREE.Vector3(); this.velocity = new THREE.Vector3();
    this.radius = 0.32; this.height = STAND; this.headRadius = 0.18;
    this.health = 100; this.armour = 0; this.helmet = false; this.alive = true;
    this.yaw = -Math.PI / 2; this.pitch = 0; this.sensitivity = 0.0021;
    this.grounded = true; this.crouched = this.walking = this.aiming = false;
    this.speed = 0; this.eyeHeight = 1.6; this.ads = 0;
    this.baseFov = camera.fov || 75; this.adsFov = 61;
    this.onSound = onSound; this.onDamage = onDamage; this.onDeath = onDeath;
    this._delta = new THREE.Vector3(); this._look = { x: 0, y: 0 };
    this._motion = { grounded: false, hitX: false, hitY: false, hitZ: false, stepped: false };
    this._stepDistance = 0; this._bob = 0; this._time = 0; this._shake = 0; this.flash = 0;
    this._sound = { type: 'footstep', position: new THREE.Vector3(), radius: 10, actor: this, team: this.team };
    camera.rotation.order = 'YXZ';
    this.respawn(spawns.solstice[2]);
  }

  respawn(position = spawns.solstice[2], yaw = -Math.PI / 2, armour = 0, helmet = false) {
    this.position.copy(position); this.velocity.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.health = 100;
    this.armour = armour; this.helmet = helmet; this.alive = true;
    this.grounded = true; this.height = STAND; this.eyeHeight = 1.6;
    this.crouched = this.walking = this.aiming = false;
    this.ads = this.speed = this._stepDistance = this._bob = this._shake = this.flash = 0;
    this.input.reset(); this.syncCamera();
    return this;
  }

  update(dt, active = true) {
    this._time += dt; this._shake = Math.max(0, this._shake - dt * 1.8);
    this.flash = Math.max(0, this.flash - dt);
    const input = this.input, control = active && this.alive && input.locked;
    input.consumeLook(this._look);
    if (control) {
      this.yaw -= this._look.x * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - this._look.y * this.sensitivity, -1.48, 1.48);
    }
    const crouch = control && (input.down('ControlLeft') || input.down('ControlRight') || input.down('KeyC'));
    this.crouched = crouch || (this.crouched && collide(this.position, this.radius, STAND));
    this.height = this.crouched ? CROUCH : STAND;
    this.walking = control && (input.down('ShiftLeft') || input.down('ShiftRight'));
    this.aiming = control && input.mouseDown(2);
    this.ads += ((this.aiming ? 1 : 0) - this.ads) * (1 - Math.exp(-14 * dt));
    this.eyeHeight += ((this.alive ? this.crouched ? 0.95 : 1.6 : 0.55) - this.eyeHeight) * (1 - Math.exp(-18 * dt));
    let forward = 0, side = 0;
    if (control) {
      forward = Number(input.down('KeyW')) - Number(input.down('KeyS'));
      side = Number(input.down('KeyD')) - Number(input.down('KeyA'));
    }
    const length = Math.hypot(forward, side), speed = this.crouched ? 1.8 : this.walking ? 3 : 5.4;
    let wishX = 0, wishZ = 0;
    if (length) {
      const scale = speed / length, sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      wishX = (side * cos - forward * sin) * scale;
      wishZ = (-side * sin - forward * cos) * scale;
    }
    if (!length && this.grounded) {
      const friction = Math.exp(-12 * dt);
      this.velocity.x *= friction; this.velocity.z *= friction;
      if (Math.hypot(this.velocity.x, this.velocity.z) < 0.015) this.velocity.x = this.velocity.z = 0;
    } else {
      const dx = wishX - this.velocity.x, dz = wishZ - this.velocity.z;
      const change = Math.hypot(dx, dz), acceleration = (this.grounded ? 34 : 9) * dt;
      const ratio = change > acceleration ? acceleration / change : 1;
      this.velocity.x += dx * ratio; this.velocity.z += dz * ratio;
    }
    if (control && input.consumePress('Space') && this.grounded && !this.crouched) {
      this.velocity.y = 5.6; this.grounded = false;
    }
    this.velocity.y -= 18 * dt;
    this._delta.copy(this.velocity).multiplyScalar(dt);
    const x = this.position.x, z = this.position.z;
    move(this.position, this._delta, this.radius, this.height, 0.26, this._motion);
    this.grounded = this._motion.grounded;
    if (this._motion.hitX) this.velocity.x = 0;
    if (this._motion.hitZ) this.velocity.z = 0;
    if (this._motion.hitY || this.grounded) this.velocity.y = 0;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    const distance = Math.hypot(this.position.x - x, this.position.z - z);
    if (this.grounded && this.alive) {
      this._stepDistance += distance; this._bob += distance * 3.6;
      const stride = this.crouched ? 1.3 : this.walking ? 1.65 : 2.1;
      if (this._stepDistance >= stride) {
        this._stepDistance %= stride;
        this._sound.position.copy(this.position);
        this._sound.radius = this.crouched ? 2.4 : this.walking ? 4 : 10;
        this.onSound?.(this._sound); // Synchronous callback; bus may copy into its pool.
      }
    }
    this.syncCamera();
  }

  syncCamera() {
    const bob = this.grounded ? Math.sin(this._bob) * Math.min(this.speed / 5.4, 1) * 0.025 * (1 - this.ads * 0.7) : 0;
    this.camera.position.copy(this.position);
    this.camera.position.y += this.eyeHeight + bob;
    this.camera.rotation.set(
      this.pitch + Math.sin(this._time * 71) * this._shake * 0.025,
      this.yaw + Math.sin(this._time * 53) * this._shake * 0.018, 0,
    );
    const fov = this.baseFov + (this.adsFov - this.baseFov) * this.ads;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.updateMatrixWorld(true);
  }

  getEye(out) { return out.copy(this.camera.position); }
  recoil(pitch, yaw = 0) {
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitch, -1.48, 1.48);
    this.yaw += yaw;
  }
  shake(strength = 0.2) { this._shake = Math.max(this._shake, strength); }
  equipArmour(helmet = false) { this.armour = 100; this.helmet = helmet; }

  // Weapons apply the hit-region multiplier first. Armour spends one point for
  // each point absorbed, including a partially exhausted vest on the final hit.
  takeDamage(amount, source = null, part = 'torso') {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return 0;
    const absorbed = Math.min(this.armour, amount * 0.6);
    this.armour -= absorbed;
    const damage = Math.min(this.health, amount - absorbed);
    this.health -= damage; this.shake(0.15);
    this.onDamage?.(this, damage, source, part);
    if (this.health <= 0) {
      this.alive = false; this.aiming = false;
      this.onDeath?.(this, source, part);
    }
    return damage;
  }
}
