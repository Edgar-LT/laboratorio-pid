/**
 * @file Telemetry.js
 * @description Gestor de métricas transitorias formales de ingeniería de control:
 * - Sobreimpulso máximo formal (Mp) simétrico y direccional (compatible con escalones ascendentes y descendentes).
 * - Tiempo de establecimiento formal al ±2% (Ts) con persistencia temporal.
 * - Integral del error absoluto (IAE).
 * - Estado de convergencia (TRANSITORIO / ESTABLE / DIVERGENTE / SATURADO).
 */

export class Telemetry {
  constructor(domElements) {
    this.dom = domElements;

    this.stepInfo = {
      t0: 0,
      y0: 0,
      r: 1.0,
      extremeY: 0, // Máximo para r > y0, mínimo para r < y0
      hasCrossedReference: false,
      lastExitTime: 0,
      isSettled: false,
      ts: null
    };

    this.iae = 0;
    this.currentError = 0;
    this.currentU = 0;
    this.isSaturated = false;
    this.hasDiverged = false;
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
      extremeY: y,
      hasCrossedReference: false,
      lastExitTime: t,
      isSettled: false,
      ts: null
    };
  }

  /**
   * Actualiza las métricas en cada paso de simulación física.
   * @param {number} t Tiempo actual (s)
   * @param {number} y Salida actual
   * @param {number} r Referencia actual
   * @param {number} u Esfuerzo de control
   * @param {number} dt Paso de integración (s)
   * @param {boolean} saturated Estado de saturación del actuador
   * @param {number} wn Frecuencia natural
   * @param {number} zeta Factor de amortiguamiento
   * @param {boolean} diverged Estado de divergencia de la planta
   */
  update(t, y, r, u, dt, saturated, wn = 3.0, zeta = 0.3, diverged = false) {
    this.systemTime = t;
    this.currentError = r - y;
    this.currentU = u;
    this.isSaturated = saturated;
    this.hasDiverged = diverged;

    if (!diverged) {
      this.iae += Math.abs(this.currentError) * dt;
    }

    const deltaR = this.stepInfo.r - this.stepInfo.y0;
    const absDeltaR = Math.abs(deltaR);

    // Solo analizar transitorio de escalón si el cambio es significativo (|Δr| > 1e-4)
    if (absDeltaR > 1e-4 && !diverged) {
      const stepDir = Math.sign(deltaR);

      // Verificar si la respuesta cruzó la referencia deseada
      if (!this.stepInfo.hasCrossedReference) {
        if ((y - this.stepInfo.r) * stepDir >= 0) {
          this.stepInfo.hasCrossedReference = true;
          this.stepInfo.extremeY = y;
        }
      } else {
        // Registrar el valor extremo más allá del setpoint en la dirección del escalón
        if ((y - this.stepInfo.extremeY) * stepDir > 0) {
          this.stepInfo.extremeY = y;
        }
      }

      // Criterio formal de banda de asentamiento ±2% sobre la amplitud del escalón
      const tolerance = 0.02 * absDeltaR;
      const isOutsideBand = Math.abs(y - this.stepInfo.r) > tolerance;

      if (isOutsideBand) {
        this.stepInfo.lastExitTime = t;
        this.stepInfo.isSettled = false;
        this.stepInfo.ts = null;
      } else {
        // Tiempo de permanencia mínima antes de declarar estado estacionario asentado
        const tau = 1.0 / Math.max(0.1, zeta * wn);
        const requiredDwellTime = Math.max(0.6, Math.min(2.5, 3.0 * tau));

        if (t - this.stepInfo.lastExitTime >= requiredDwellTime) {
          this.stepInfo.isSettled = true;
          if (this.stepInfo.ts === null) {
            this.stepInfo.ts = Math.max(0, this.stepInfo.lastExitTime - this.stepInfo.t0);
          }
        }
      }
    }
  }

  /**
   * Retorna los límites de la banda de asentamiento activa.
   */
  getSettlingBand() {
    const absDeltaR = Math.abs(this.stepInfo.r - this.stepInfo.y0);
    if (absDeltaR < 1e-4) {
      return { active: false, bandMin: 0, bandMax: 0 };
    }
    const tol = 0.02 * absDeltaR;
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
    const absDeltaR = Math.abs(this.stepInfo.r - this.stepInfo.y0);

    // 1. Cálculo y muestra de Sobreimpulso (Mp)
    if (this.dom.mp) {
      if (absDeltaR > 1e-4 && this.stepInfo.hasCrossedReference) {
        const overshootMag = Math.abs(this.stepInfo.extremeY - this.stepInfo.r);
        const overshootPct = (overshootMag / absDeltaR) * 100;
        this.dom.mp.textContent = `${overshootPct.toFixed(1)}%`;
      } else if (absDeltaR > 1e-4) {
        this.dom.mp.textContent = '0.0%';
      } else {
        this.dom.mp.textContent = '--';
      }
    }

    // 2. Tiempo de Asentamiento (Ts ±2%)
    if (this.dom.ts) {
      this.dom.ts.textContent = this.stepInfo.isSettled && this.stepInfo.ts !== null
        ? `${this.stepInfo.ts.toFixed(2)}s`
        : '...';
    }

    // 3. Indicador de Estado Dinámico del Sistema
    if (this.dom.state) {
      if (this.hasDiverged) {
        this.dom.state.textContent = 'DIVERGENTE';
        this.dom.state.style.color = '#ff4d4f';
      } else if (this.isSaturated) {
        this.dom.state.textContent = this.stepInfo.isSettled ? 'ESTABLE (SAT)' : 'SATURADO';
        this.dom.state.style.color = '#ff9f43';
      } else if (this.stepInfo.isSettled) {
        this.dom.state.textContent = 'ESTABLE';
        this.dom.state.style.color = '#2ee6a6';
      } else {
        this.dom.state.textContent = 'TRANSITORIO';
        this.dom.state.style.color = '#f5c542';
      }
    }

    // 4. Variables analíticas instantáneas
    if (this.dom.err) this.dom.err.textContent = this.currentError.toFixed(4);
    if (this.dom.u) {
      this.dom.u.textContent = `${this.currentU.toFixed(3)}${this.isSaturated ? ' [SAT]' : ''}`;
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
    this.hasDiverged = false;
    this.systemTime = 0;
  }
}
