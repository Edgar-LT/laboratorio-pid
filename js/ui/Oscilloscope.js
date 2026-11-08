/**
 * @file Oscilloscope.js
 * @description Osciloscopio digital en HTML5 Canvas con soporte High-DPI (Retina).
 * Arquitectura de alto rendimiento:
 * 1. Single-Pass Execution: Calcula límites de escala y construye los paths en un único recorrido por muestra.
 * 2. Cero matching por texto/colores en bucle caliente.
 * 3. Cacheo estricto de dimensiones y gestión de ciclo de vida con destroy().
 */

export class Oscilloscope {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options
   * @param {number} options.windowDuration Duración en segundos de la ventana visible
   */
  constructor(canvas, { windowDuration = 10.0 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.windowDuration = windowDuration;

    // Caché de dimensiones para evitar layout thrashing (forced reflow)
    this.width = 0;
    this.height = 0;
    this.dpr = window.devicePixelRatio || 1;

    this.setupResizeObserver();
  }

  setupResizeObserver() {
    const updateSize = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      this.dpr = window.devicePixelRatio || 1;

      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
    };

    updateSize();

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => updateSize());
      this.resizeObserver.observe(this.canvas);
    } else {
      this.resizeHandler = updateSize;
      window.addEventListener('resize', this.resizeHandler);
    }
  }

  /**
   * Desconecta observadores y limpia referencias para evitar fugas de memoria.
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
  }

  /**
   * Dibuja un fotograma completo del osciloscopio en un solo recorrido de memoria.
   * @param {import('../engine/RingBuffer.js').RingBuffer} buffer
   * @param {number} currentR Setpoint actual
   * @param {{ bandMin: number, bandMax: number, active: boolean }} settlingBand
   * @param {number} currentTime Tiempo actual del sistema
   */
  render(buffer, currentR, settlingBand, currentTime) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const count = buffer.count;
    if (W === 0 || H === 0) return;

    // Ajustar escala de renderizado al DPR de la pantalla
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Determinar límites temporales
    const tEnd = Math.max(this.windowDuration, currentTime);
    const tStart = tEnd - this.windowDuration;
    const invDuration = 1.0 / this.windowDuration;

    // 1. Cálculo de límites verticales dinámicos
    let yMin = -0.5;
    let yMax = 1.5;

    for (let i = 0; i < count; i++) {
      const idx = buffer.getPhysicalIndex(i);
      const valY = buffer.y[idx];
      const valR = buffer.r[idx];
      if (valY < yMin) yMin = valY;
      if (valY > yMax) yMax = valY;
      if (valR < yMin) yMin = valR;
      if (valR > yMax) yMax = valR;
    }

    const pad = (yMax - yMin) * 0.12;
    yMin -= pad;
    yMax += pad;
    const invYRange = 1.0 / (yMax - yMin);

    // Funciones en línea directas de transformación a coordenadas de pantalla
    const mapX = (t) => ((t - tStart) * invDuration) * W;
    const mapY = (v) => H - ((v - yMin) * invYRange) * H;

    // 2. Rejilla de Fondo Técnica de Precisión
    this.renderGrid(ctx, W, H, yMin, yMax);

    // 3. Banda de Asentamiento ±2%
    if (settlingBand && settlingBand.active) {
      const yTop = mapY(settlingBand.bandMax);
      const yBottom = mapY(settlingBand.bandMin);
      ctx.fillStyle = 'rgba(46, 230, 166, 0.08)';
      ctx.fillRect(0, yTop, W, Math.max(2, yBottom - yTop));

      ctx.strokeStyle = 'rgba(46, 230, 166, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, yTop);
      ctx.lineTo(W, yTop);
      ctx.moveTo(0, yBottom);
      ctx.lineTo(W, yBottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (count === 0) return;

    // 4. Construcción simultánea de paths vectoriales (Zero String Matching)
    const pathU = new Path2D();
    const pathR = new Path2D();
    const pathY = new Path2D();

    for (let i = 0; i < count; i++) {
      const idx = buffer.getPhysicalIndex(i);
      const px = mapX(buffer.time[idx]);
      const pyU = mapY(buffer.u[idx] * 0.1);
      const pyR = mapY(buffer.r[idx]);
      const pyY = mapY(buffer.y[idx]);

      if (i === 0) {
        pathU.moveTo(px, pyU);
        pathR.moveTo(px, pyR);
        pathY.moveTo(px, pyY);
      } else {
        pathU.lineTo(px, pyU);
        pathR.lineTo(px, pyR);
        pathY.lineTo(px, pyY);
      }
    }

    // Trazo Canal Control u(t) × 0.1 (Rojo Carmesí)
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke(pathU);

    // Trazo Canal Referencia r(t) (Oro Champán)
    ctx.strokeStyle = '#f5c542';
    ctx.lineWidth = 2.0;
    ctx.setLineDash([6, 4]);
    ctx.stroke(pathR);

    // Trazo Canal Salida Planta y(t) (Azul Óptico / Cian)
    ctx.strokeStyle = '#2997ff';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.stroke(pathY);

    // Leyenda de escala
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '10px "JetBrains Mono", Consolas, monospace';
    ctx.fillText('u(t) ×0.1', W - 65, 16);
  }

  renderGrid(ctx, W, H, yMin, yMax) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6f8aa3';
    ctx.font = '10px "JetBrains Mono", Consolas, monospace';

    // Líneas verticales de tiempo
    const timeDivs = 10;
    for (let i = 0; i <= timeDivs; i++) {
      const x = (i / timeDivs) * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // Líneas horizontales de amplitud con marcas numéricas
    const ampDivs = 8;
    for (let i = 0; i <= ampDivs; i++) {
      const y = (i / ampDivs) * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();

      const labelVal = yMax - (i / ampDivs) * (yMax - yMin);
      ctx.fillText(labelVal.toFixed(2), 6, y - 3);
    }
  }
}
