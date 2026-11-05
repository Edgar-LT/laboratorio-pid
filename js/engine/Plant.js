/**
 * @file Plant.js
 * @description Modelo de planta electromecánica continua de segundo orden.
 * Ecuación diferencial: y'' + 2ζωn·y' + ωn²·y = ωn²·(u + d)
 * Integra numéricamente a paso fijo mediante el método de Euler semi-implícito.
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

    // Variables de estado
    this.t = 0;
    this.y = 0;   // Posición / salida
    this.v = 0;   // Velocidad (dy/dt)

    // Perturbaciones y ruido
    this.disturbance = 0;
    this.disturbanceUntil = 0;
    this.noiseEnabled = false;
    this.noiseAmplitude = 0.04;
  }

  /**
   * Actualiza los parámetros físicos del sistema dinámico.
   * @param {number} wn Frecuencia natural
   * @param {number} zeta Coeficiente de amortiguamiento
   */
  setParameters(wn, zeta) {
    if (Number.isFinite(wn) && wn > 0) this.wn = wn;
    if (Number.isFinite(zeta)) this.zeta = zeta;
  }

  /**
   * Inyecta una perturbación de carga temporal (escalón de fuerza resistiva o par externo).
   * @param {number} magnitude Amplitud de la perturbación
   * @param {number} duration Duración en segundos
   */
  injectDisturbance(magnitude, duration = 1.5) {
    this.disturbance = magnitude;
    this.disturbanceUntil = this.t + duration;
  }

  /**
   * Habilita o deshabilita el ruido pseudo-aleatorio de medición del sensor.
   * @param {boolean} enabled
   */
  setNoiseEnabled(enabled) {
    this.noiseEnabled = Boolean(enabled);
  }

  /**
   * Lee la salida con ruido del sensor si está activo.
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
   * Utiliza el método simpléctico / Euler semi-implícito para conservar energía orbital.
   * @param {number} u Señal de control aplicada
   * @param {number} dt Paso de integración (segundos, típicamente 0.002 s = 500 Hz)
   */
  step(u, dt) {
    const d = (this.t < this.disturbanceUntil) ? this.disturbance : 0;

    // Aceleración: a = y'' = ωn² * (u + d - y) - 2 * ζ * ωn * v
    const wn2 = this.wn * this.wn;
    const accel = wn2 * (u + d - this.y) - 2 * this.zeta * this.wn * this.v;

    // Euler semi-implícito: actualizar primero velocidad, luego posición
    this.v += accel * dt;
    this.y += this.v * dt;
    this.t += dt;

    // Salvaguarda contra divergencias numéricas
    if (!Number.isFinite(this.y) || !Number.isFinite(this.v)) {
      this.reset();
    }
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
  }
}
