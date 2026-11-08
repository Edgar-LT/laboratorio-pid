/**
 * @file PIDController.js
 * @description Controlador PID de grado industrial con protecciones formales:
 * 1. Derivada sobre la medición (elimina el "derivative kick" ante escalones de setpoint).
 * 2. Filtro pasabajas exacto de primer orden (Tustin / backward-euler discretizado):
 *    alpha = dt / (tau + dt), matemáticamente estable incluso para dt >= tau.
 * 3. Anti-windup por Clamping estricto (integración condicional bidireccional):
 *    Desactiva la integración solo cuando el actuador satura y el error empeora la saturación.
 * 4. Saturación física simétrica en el actuador [-uMax, uMax].
 */

export class PIDController {
  /**
   * @param {Object} params
   * @param {number} params.kp Ganancia proporcional
   * @param {number} params.ki Ganancia integral
   * @param {number} params.kd Ganancia derivativa
   * @param {number} params.uMax Límite de saturación física del actuador
   * @param {number} params.filterTimeConst Constante de tiempo tau del filtro derivativo (s)
   */
  constructor({
    kp = 4.0,
    ki = 1.5,
    kd = 0.6,
    uMax = 20.0,
    filterTimeConst = 0.01
  } = {}) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.uMax = uMax;
    this.tau = filterTimeConst;

    // Estados internos del controlador
    this.integral = 0;
    this.prevMeasurement = 0;
    this.dFiltered = 0;
    this.isSaturated = false;
    this.initialized = false;
  }

  setGains(kp, ki, kd) {
    if (Number.isFinite(kp)) this.kp = Math.max(0, kp);
    if (Number.isFinite(ki)) this.ki = Math.max(0, ki);
    if (Number.isFinite(kd)) this.kd = Math.max(0, kd);
  }

  /**
   * Calcula la señal de control u(t) para el paso de integración actual.
   * @param {number} setpoint Referencia r(t)
   * @param {number} measuredOutput Salida medida y(t)
   * @param {number} dt Paso de tiempo (s)
   * @returns {{ u: number, error: number, saturated: boolean, dFiltered: number, integral: number }}
   */
  compute(setpoint, measuredOutput, dt) {
    if (dt <= 1e-9) {
      return {
        u: 0,
        error: setpoint - measuredOutput,
        saturated: this.isSaturated,
        dFiltered: this.dFiltered,
        integral: this.integral
      };
    }

    if (!this.initialized) {
      this.prevMeasurement = measuredOutput;
      this.initialized = true;
    }

    const error = setpoint - measuredOutput;

    // 1. Acción derivativa sobre la medición: rawD = -dy/dt
    const deltaY = measuredOutput - this.prevMeasurement;
    this.prevMeasurement = measuredOutput;
    const rawD = -deltaY / dt;

    // Filtro pasabajas discretizado exacto: alpha = dt / (tau + dt)
    // Garantiza 0 < alpha <= 1 para cualquier dt > 0 y tau >= 0 sin divergencia
    const effectiveTau = Math.max(1e-4, this.tau);
    const alpha = dt / (effectiveTau + dt);
    this.dFiltered += alpha * (rawD - this.dFiltered);

    // 2. Componentes proporcional y derivativa
    const uProportional = this.kp * error;
    const uDerivative = this.kd * this.dFiltered;

    // 3. Salida tentativa previa a saturación (con integrador actual)
    const uCandidate = uProportional + (this.ki * this.integral) + uDerivative;

    // 4. Anti-windup por Clamping condicional formal:
    // Identificar si satura en cota superior o inferior
    const saturatedHigh = uCandidate >= this.uMax;
    const saturatedLow = uCandidate <= -this.uMax;
    this.isSaturated = saturatedHigh || saturatedLow;

    // Solo se integra si el actuador no está saturado O si el signo del error tiende a reducir la saturación
    const errorRelievesHighSaturation = saturatedHigh && error < 0;
    const errorRelievesLowSaturation = saturatedLow && error > 0;

    if (!this.isSaturated || errorRelievesHighSaturation || errorRelievesLowSaturation) {
      this.integral += error * dt;
    }

    // 5. Saturación física del actuador
    const uSaturated = Math.max(-this.uMax, Math.min(this.uMax, uProportional + (this.ki * this.integral) + uDerivative));

    return {
      u: uSaturated,
      error,
      saturated: this.isSaturated,
      dFiltered: this.dFiltered,
      integral: this.integral
    };
  }

  /**
   * Reinicia los estados internos a condiciones de reposo.
   * @param {number} initialMeasurement
   */
  reset(initialMeasurement = 0) {
    this.integral = 0;
    this.prevMeasurement = initialMeasurement;
    this.dFiltered = 0;
    this.isSaturated = false;
    this.initialized = false;
  }
}
