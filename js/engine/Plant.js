/**
 * @file Plant.js
 * @description Modelo de planta electromecánica continua de segundo orden.
 * Ecuación diferencial: y'' + 2ζωn·y' + ωn²·y = ωn²·(u + d)
 * Integra numéricamente a paso fijo mediante el método simpléctico / Euler semi-implícito.
 * Incorpora detección formal de divergencia dinámica y desacoplamiento de fallos.
 */

export class Plant {
  /**
   * @param {Object} params
   * @param {number} params.wn Frecuencia natural no amortiguada (rad/s)
   * @param {number} params.zeta Razón de amortiguamiento adimensional
   */
  constructor({ wn = 3.0, zeta = 0.3 } = {}) {
    this.wn = wn;
    this.zeta = zeta;

    // Variables de estado dinámico
    this.t = 0;
    this.y = 0;   // Posición / salida
    this.v = 0;   // Velocidad (dy/dt)

    // Perturbaciones y ruido
    this.disturbance = 0;
    this.disturbanceUntil = 0;
    this.noiseEnabled = false;
    this.noiseAmplitude = 0.04;

    // Estado de estabilidad numérica
    this.hasDiverged = false;
  }

  /**
   * Actualiza los parámetros físicos del sistema dinámico.
   * @param {number} wn Frecuencia natural (rad/s)
   * @param {number} zeta Coeficiente de amortiguamiento
   */
  setParameters(wn, zeta) {
    if (Number.isFinite(wn) && wn > 0) this.wn = wn;
    if (Number.isFinite(zeta) && zeta >= 0) this.zeta = zeta;
  }

  /**
   * Inyecta una perturbación de carga externa por un intervalo determinado.
   * @param {number} magnitude Amplitud de la perturbación
   * @param {number} duration Duración en segundos
   */
  injectDisturbance(magnitude, duration = 1.5) {
    this.disturbance = magnitude;
    this.disturbanceUntil = this.t + duration;
  }

  /**
   * Activa o desactiva el ruido estocástico de medición del sensor.
   * @param {boolean} enabled
   */
  setNoiseEnabled(enabled) {
    this.noiseEnabled = Boolean(enabled);
  }

  /**
   * Lee la salida medida por el sensor (con ruido si está habilitado).
   * @returns {number}
   */
  getMeasuredOutput() {
    if (!this.noiseEnabled) return this.y;
    // Generación estocástica uniforme [-0.5, 0.5] * noiseAmplitude
    const noise = (Math.random() - 0.5) * this.noiseAmplitude;
    return this.y + noise;
  }

  /**
   * Ejecuta un paso de integración numérica elemental (dt fijo).
   * @param {number} u Señal de control del actuador
   * @param {number} dt Paso de integración (s)
   */
  step(u, dt) {
    if (this.hasDiverged) return;

    const d = (this.t < this.disturbanceUntil) ? this.disturbance : 0;

    // Aceleración: a = y'' = ωn² * (u + d - y) - 2 * ζ * ωn * v
    const wn2 = this.wn * this.wn;
    const accel = wn2 * (u + d - this.y) - 2 * this.zeta * this.wn * this.v;

    // Integración simpléctica (Euler semi-implícito)
    const nextV = this.v + accel * dt;
    const nextY = this.y + nextV * dt;

    // Validación rigurosa de integridad numérica (evitar propagación de NaN o desbordamiento físico)
    if (!Number.isFinite(nextY) || !Number.isFinite(nextV) || Math.abs(nextY) > 1e4 || Math.abs(nextV) > 1e5) {
      this.hasDiverged = true;
      this.y = Math.sign(nextY || this.y) * 1e4;
      this.v = 0;
      return;
    }

    this.v = nextV;
    this.y = nextY;
    this.t += dt;
  }

  /**
   * Reinicia el estado dinámico a reposo.
   * @param {number} initialY Posición inicial opcional
   */
  reset(initialY = 0) {
    this.t = 0;
    this.y = initialY;
    this.v = 0;
    this.disturbance = 0;
    this.disturbanceUntil = 0;
    this.hasDiverged = false;
  }
}
