/**
 * @file RingBuffer.js
 * @description Búfer circular estático de alto rendimiento para telemetría continua a 60 Hz.
 * - Cero Asignación de Memoria en el bucle caliente (Zero-GC).
 * - Indexación directa O(1) cronológica sin closures ni callbacks funcionales.
 * - Exportación de telemetría por chunks de memoria para evitar picos de Garbage Collection (OOM-free).
 */

export class RingBuffer {
  /**
   * @param {number} capacity Capacidad máxima de puntos en memoria (ej. 10 s a 60 Hz = 600 puntos)
   */
  constructor(capacity = 600) {
    this.capacity = capacity;
    this.time = new Float64Array(capacity);
    this.y = new Float32Array(capacity);
    this.r = new Float32Array(capacity);
    this.u = new Float32Array(capacity);
    
    this.head = 0;
    this.count = 0;
  }

  /**
   * Agrega una muestra en tiempo O(1) con cero asignación en el heap.
   * @param {number} t Tiempo (s)
   * @param {number} y Salida del sistema
   * @param {number} r Referencia / Setpoint
   * @param {number} u Señal de control
   */
  push(t, y, r, u) {
    const idx = this.head;
    this.time[idx] = t;
    this.y[idx] = y;
    this.r[idx] = r;
    this.u[idx] = u;

    this.head = (idx + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Obtiene el índice físico en los arreglos para una posición lógica [0, count - 1]
   * en estricto orden cronológico (0 = muestra más antigua, count - 1 = más reciente).
   * @param {number} logicalIndex
   * @returns {number}
   */
  getPhysicalIndex(logicalIndex) {
    const startIdx = (this.count === this.capacity) ? this.head : 0;
    return (startIdx + logicalIndex) % this.capacity;
  }

  /**
   * Itera sobre las muestras en orden cronológico (compatibilidad retroactiva).
   * @param {function(number, number, number, number, number): void} callback (t, y, r, u, index)
   */
  forEach(callback) {
    const n = this.count;
    if (n === 0) return;
    const startIdx = (n === this.capacity) ? this.head : 0;

    for (let i = 0; i < n; i++) {
      const idx = (startIdx + i) % this.capacity;
      callback(this.time[idx], this.y[idx], this.r[idx], this.u[idx], i);
    }
  }

  /**
   * Obtiene la muestra más reciente ingresada al búfer en O(1).
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
   * Exporta la telemetría acumulada generando un Blob particionado por bloques (Chunked Streaming),
   * eliminando la creación de arreglos masivos de strings y pausas de GC.
   * @returns {Blob}
   */
  toBlob() {
    const CHUNK_SIZE = 4096;
    const chunks = ['tiempo_s,setpoint_r,salida_y,control_u,error_e\n'];
    let buffer = '';
    const n = this.count;

    for (let i = 0; i < n; i++) {
      const idx = this.getPhysicalIndex(i);
      const t = this.time[idx];
      const r = this.r[idx];
      const y = this.y[idx];
      const u = this.u[idx];
      const e = r - y;

      buffer += `${t.toFixed(4)},${r.toFixed(4)},${y.toFixed(4)},${u.toFixed(4)},${e.toFixed(4)}\n`;

      if (buffer.length >= CHUNK_SIZE) {
        chunks.push(buffer);
        buffer = '';
      }
    }

    if (buffer.length > 0) {
      chunks.push(buffer);
    }

    return new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * Exporta a string CSV estándar (para compatibilidad de interfaz existente).
   * @returns {string}
   */
  toCSV() {
    const n = this.count;
    const lines = new Array(n + 1);
    lines[0] = 'tiempo_s,setpoint_r,salida_y,control_u,error_e';
    for (let i = 0; i < n; i++) {
      const idx = this.getPhysicalIndex(i);
      const t = this.time[idx];
      const r = this.r[idx];
      const y = this.y[idx];
      const u = this.u[idx];
      lines[i + 1] = `${t.toFixed(4)},${r.toFixed(4)},${y.toFixed(4)},${u.toFixed(4)},${(r - y).toFixed(4)}`;
    }
    return lines.join('\n');
  }
}
