/**
 * @file RingBuffer.js
 * @description Búfer circular estático de alto rendimiento para telemetría continua a 60 Hz.
 * Elimina totalmente el uso de Array.shift() (O(N)) y garantiza Cero Asignación (Zero-GC) en el bucle caliente.
 */

export class RingBuffer {
  /**
   * @param {number} capacity Capacidad máxima de puntos en memoria (ej. 10 s a 60 Hz = 600 puntos)
   */
  constructor(capacity = 600) {
    this.capacity = capacity;
    this.time = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
    this.r = new Float64Array(capacity);
    this.u = new Float64Array(capacity);
    
    this.head = 0;
    this.count = 0;
  }

  /**
   * Agrega una muestra en tiempo O(1) sin recolocación de memoria.
   * @param {number} t Tiempo (s)
   * @param {number} y Salida del sistema
   * @param {number} r Referencia / Setpoint
   * @param {number} u Señal de control
   */
  push(t, y, r, u) {
    this.time[this.head] = t;
    this.y[this.head] = y;
    this.r[this.head] = r;
    this.u[this.head] = u;

    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Itera sobre las muestras en estricto orden cronológico (de la más antigua a la más reciente).
   * @param {function(number, number, number, number, number): void} callback (t, y, r, u, index)
   */
  forEach(callback) {
    if (this.count === 0) return;

    const startIdx = (this.count === this.capacity) ? this.head : 0;
    for (let i = 0; i < this.count; i++) {
      const idx = (startIdx + i) % this.capacity;
      callback(this.time[idx], this.y[idx], this.r[idx], this.u[idx], i);
    }
  }

  /**
   * Obtiene la muestra más reciente ingresada al búfer.
   */
  getLatest() {
    if (this.count === 0) return null;
    const lastIdx = (this.head - 1 + this.capacity) % this.capacity;
    return {
      t: this.time[lastIdx],
      y: this.y[lastIdx],
      r: this.r[lastIdx],
      u: this.u[lastIdx]
    };
  }

  /**
   * Limpia el búfer sin destruir los arreglos tipados.
   */
  clear() {
    this.head = 0;
    this.count = 0;
  }

  /**
   * Exporta la telemetría acumulada en formato CSV estándar.
   * @returns {string}
   */
  toCSV() {
    const lines = ['tiempo_s,setpoint_r,salida_y,control_u,error_e'];
    this.forEach((t, y, r, u) => {
      const e = r - y;
      lines.push(`${t.toFixed(4)},${r.toFixed(4)},${y.toFixed(4)},${u.toFixed(4)},${e.toFixed(4)}`);
    });
    return lines.join('\n');
  }
}
