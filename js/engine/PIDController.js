/**
 * @file PIDController.js
 * @description Controlador PID de grado industrial con protecciones realistas:
 * 1. Derivada sobre la medición (evita el "derivative kick" ante cambios escalón del setpoint).
 * 2. Filtro pasabajas de primer orden sobre la acción derivativa (suprime ruido de alta frecuencia).
 * 3. Anti-windup por integración condicional (clamping del integrador durante saturación).
 * 4. Límites simétricos de saturación de actuador [-U_MAX, U_MAX].
 */

export class PIDController {
  /**
   * @param {Object} params
   * @param {number} params.kp Ganancia proporcional
   * @param {number} params.ki Ganancia integral
   * @param {number} params.kd Ganancia derivativa
   * @param {number} params.uMax Límite de saturación del actuador
   * @param {number} params.filterTimeConst Constante de tiempo del filtro derivativo (s)
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
    this.filterTimeConst = filterTimeConst;

    // Estados internos del controlador
    this.integral = 0;
    this.prevMeasurement = 0;
    this.dFiltered = 0;
    this.isSaturated = false;
  }

  setGains(kp, ki, kd) {
    if (Number.isFinite(kp)) this.kp = Math.max(0, kp);
    if (Number.isFinite(ki)) this.ki = Math.max(0, ki);
    if (Number.isFinite(kd)) this.kd = Math.max(0, kd);
  }

  /**
   * Calcula la señal de control u(t) para el paso actual.
   * @param {number} setpoint Valor deseado r(t)
   * @param {number} measuredOutput Valor medido y(t)
   * @param {number} dt Paso de tiempo (s)
   * @returns {{ u: number, error: number, saturated: boolean, dFiltered: number, integral: number }}
   */
  compute(setpoint, measuredOutput, dt) {
    const error = setpoint - measuredOutput;

    // 1. Acción derivativa sobre la medición: rawD = -dy/dt
    // Se invierte el signo para que responda a la tasa de variación de la salida sin brincos por setpoint
    const rawD = (dt > 1e-9) ? -(measuredOutput - this.prevMeasurement) / dt : 0;
    this.prevMeasurement = measuredOutput;

    // Filtro pasabajas discreto de primer orden: dFiltered += (rawD - dFiltered) * alpha
    const alpha = (dt > 0) ? Math.min(1.0, dt / Math.max(1e-4, this.filterTimeConst)) : 1.0;
    this.dFiltered += (rawD - this.dFiltered) * alpha;

    // 2. Cálculo previo de salida para verificar saturación
    const uProportional = this.kp * error;
    const uDerivative = this.kd * this.dFiltered;
    let uUnclamped = uProportional + (this.ki * this.integral) + uDerivative;

    // 3. Anti-windup por integración condicional:
    // Solo integrar si NO está saturado, O si el signo del error tiende a desaturar el actuador
    const isActuatorSaturated = Math.abs(uUnclamped) >= this.uMax;
    const helpsDesaturate = Math.sign(error) !== Math.sign(uUnclamped);

    if (!isActuatorSaturated || helpsDesaturate) {
      this.integral += error * dt;
      // Recalcular con el nuevo valor integral
      uUnclamped = uProportional + (this.ki * this.integral) + uDerivative;
    }

    // 4. Saturación física del actuador
    const uSaturated = Math.max(-this.uMax, Math.min(this.uMax, uUnclamped));
    this.isSaturated = (Math.abs(uSaturated) >= this.uMax - 1e-4);

    return {
      u: uSaturated,
      error,
      saturated: this.isSaturated,
      dFiltered: this.dFiltered,
      integral: this.integral
    };
  }

  /**
   * Reinicia los estados del integrador y derivador.
   * @param {number} initialMeasurement
   */
  reset(initialMeasurement = 0) {
    this.integral = 0;
    this.prevMeasurement = initialMeasurement;
    this.dFiltered = 0;
    this.isSaturated = false;
  }
}
