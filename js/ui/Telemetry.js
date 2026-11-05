/**
 * @file Telemetry.js
 * @description Gestor de métricas transitorias formales de ingeniería de control:
 * - Sobreimpulso máximo (Mp)
 * - Tiempo de establecimiento formal al ±2% (Ts)
 * - Integral del error absoluto (IAE)
 * - Estado de convergencia (TRANSITORIO / ESTABLE)
 */

export class Telemetry {
  constructor(domElements) {
    this.dom = domElements;

    this.stepInfo = {
      t0: 0,
      y0: 0,
      r: 1.0,
      peak: 0,
      lastExitTime: 0,
      isSettled: false,
      ts: null
    };

    this.iae = 0;
    this.currentError = 0;
    this.currentU = 0;
    this.isSaturated = false;
    this.systemTime = 0;
  }

  /**
   * Registra el inicio de un nuevo escalón de referencia.
   * @param {number} t Tiempo actual
   * @param {number} y Salida actual
   * @param {number} r Nuevo setpoint
   */
  startNewStep(t, y, r) {
    this.stepInfo = {
      t0: t,
      y0: y,
      r: r,
      peak: y,
      lastExitTime: t,
      isSettled: false,
      ts: null
    };
  }

  /**
   * Actualiza las métricas en cada paso de simulación.
   * @param {number} t Tiempo actual (s)
   * @param {number} y Salida actual
   * @param {number} r Referencia actual
   * @param {number} u Esfuerzo de control
   * @param {number} dt Paso de integración (s)
   * @param {boolean} saturated
   * @param {number} wn Frecuencia natural
   * @param {number} zeta Factor de amortiguamiento
   */
  update(t, y, r, u, dt, saturated, wn = 3.0, zeta = 0.3) {
    this.systemTime = t;
    this.currentError = r - y;
    this.currentU = u;
    this.isSaturated = saturated;
    this.iae += Math.abs(this.currentError) * dt;

    const amp = this.stepInfo.r - this.stepInfo.y0;
    if (Math.abs(amp) > 1e-5) {
      // Registrar pico según el sentido del escalón
      if ((y - this.stepInfo.peak) * Math.sign(amp) > 0) {
        this.stepInfo.peak = y;
      }

      // Criterio de banda de asentamiento ±2%
      const tolerance = 0.02 * Math.abs(amp);
      const isOutsideBand = Math.abs(y - this.stepInfo.r) > tolerance;

      if (isOutsideBand) {
        this.stepInfo.lastExitTime = t;
        this.stepInfo.isSettled = false;
      } else {
        // Ventana de confirmación de estabilidad: al menos 4 constantes de tiempo (4 / (zeta * wn))
        const tau = 1.0 / Math.max(0.1, zeta * wn);
        const requiredDwellTime = Math.max(0.8, Math.min(3.0, 3.5 * tau));
        
        if (t - this.stepInfo.lastExitTime >= requiredDwellTime) {
          this.stepInfo.isSettled = true;
          this.stepInfo.ts = Math.max(0, this.stepInfo.lastExitTime - this.stepInfo.t0);
        }
      }
    }
  }

  /**
   * Retorna los límites de la banda de asentamiento activa.
   */
  getSettlingBand() {
    const amp = this.stepInfo.r - this.stepInfo.y0;
    if (Math.abs(amp) < 1e-5) {
      return { active: false, bandMin: 0, bandMax: 0 };
    }
    const tol = 0.02 * Math.abs(amp);
    return {
      active: true,
      bandMin: this.stepInfo.r - tol,
      bandMax: this.stepInfo.r + tol
    };
  }

  /**
   * Refresca los indicadores numéricos en el DOM.
   */
  updateDOM() {
    const amp = this.stepInfo.r - this.stepInfo.y0;
    if (Math.abs(amp) > 1e-5) {
      const overshoot = Math.max(0, ((this.stepInfo.peak - this.stepInfo.r) / amp) * 100);
      if (this.dom.mp) this.dom.mp.textContent = `${overshoot.toFixed(1)}%`;

      if (this.dom.ts) {
        this.dom.ts.textContent = this.stepInfo.isSettled && this.stepInfo.ts !== null
          ? `${this.stepInfo.ts.toFixed(2)}s`
          : '...';
      }

      if (this.dom.state) {
        this.dom.state.textContent = this.stepInfo.isSettled ? 'ESTABLE' : 'TRANSITORIO';
        this.dom.state.style.color = this.stepInfo.isSettled ? '#2ee6a6' : '#f5c542';
      }
    }

    if (this.dom.err) this.dom.err.textContent = this.currentError.toFixed(4);
    if (this.dom.u) {
      this.dom.u.textContent = `${this.currentU.toFixed(3)}${this.isSaturated ? ' (SAT)' : ''}`;
      this.dom.u.style.color = this.isSaturated ? '#ff6b6b' : 'inherit';
    }
    if (this.dom.iae) this.dom.iae.textContent = this.iae.toFixed(3);
    if (this.dom.clock) this.dom.clock.textContent = `t = ${this.systemTime.toFixed(2)} s`;
  }

  reset() {
    this.iae = 0;
    this.currentError = 0;
    this.currentU = 0;
    this.isSaturated = false;
    this.systemTime = 0;
  }
}
