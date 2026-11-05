/**
 * @file Oscilloscope.js
 * @description Osciloscopio digital en HTML5 Canvas con soporte High-DPI (Retina),
 * caché de dimensiones libre de DOM Thrashing, rejilla horológica y banda de asentamiento ±2%.
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

    // Caché de dimensiones para evitar layout thrashing (forced reflow) en render()
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
      window.addEventListener('resize', updateSize);
    }
  }

  /**
   * Dibuja un fotograma completo del osciloscopio a partir del RingBuffer.
   * @param {import('../engine/RingBuffer.js').RingBuffer} buffer
   * @param {number} currentR Setpoint actual
   * @param {{ bandMin: number, bandMax: number, active: boolean }} settlingBand
   * @param {number} currentTime Tiempo actual del sistema
   */
  render(buffer, currentR, settlingBand, currentTime) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    if (W === 0 || H === 0) return;

    // Ajustar escala de renderizado al DPR de la pantalla
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Determinar límites temporales
    const tEnd = Math.max(this.windowDuration, currentTime);
    const tStart = tEnd - this.windowDuration;

    // Calcular límites de amplitud vertical (con auto-escala suave)
    let yMin = -0.5;
    let yMax = 1.5;

    buffer.forEach((t, y, r) => {
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
      if (r < yMin) yMin = r;
      if (r > yMax) yMax = r;
    });

    const pad = (yMax - yMin) * 0.12;
    yMin -= pad;
    yMax += pad;

    const mapX = (t) => ((t - tStart) / this.windowDuration) * W;
    const mapY = (v) => H - ((v - yMin) / (yMax - yMin)) * H;

    // 1. Rejilla de Fondo Técnica de Precisión
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

    // 2. Banda de Asentamiento ±2%
    if (settlingBand && settlingBand.active) {
      const yTop = mapY(settlingBand.bandMax);
      const yBottom = mapY(settlingBand.bandMin);
      ctx.fillStyle = 'rgba(46, 230, 166, 0.08)';
      ctx.fillRect(0, yTop, W, Math.max(2, yBottom - yTop));

      ctx.strokeStyle = 'rgba(46, 230, 166, 0.25)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, yTop);
      ctx.lineTo(W, yTop);
      ctx.moveTo(0, yBottom);
      ctx.lineTo(W, yBottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Trazado de Señales

    // Señal de Control u(t) escalada x0.1 (Rojo Carmesí)
    this.plotSignal(buffer, mapX, (u) => mapY(u * 0.1), 'rgba(255, 107, 107, 0.65)', 1.5, [3, 3]);

    // Referencia r(t) (Oro Champán)
    this.plotSignal(buffer, mapX, (r) => mapY(r), '#f5c542', 2.0, [6, 4]);

    // Salida Real y(t) (Azul Óptico / Esmeralda)
    this.plotSignal(buffer, mapX, (y) => mapY(y), '#2997ff', 2.5, []);

    // Leyenda de escala de control
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText('u(t) ×0.1', W - 65, 16);
  }

  /**
   * Traza una curva continua recorriendo el búfer circular sin instanciar arreglos.
   */
  plotSignal(buffer, mapX, mapYVal, strokeStyle, lineWidth, dash = []) {
    const ctx = this.ctx;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();

    let isFirst = true;
    buffer.forEach((t, y, r, u) => {
      let val = y;
      if (strokeStyle.includes('f5c542')) val = r;
      else if (strokeStyle.includes('255, 107, 107')) val = u;

      const px = mapX(t);
      const py = mapYVal(val);

      if (isFirst) {
        ctx.moveTo(px, py);
        isFirst = false;
      } else {
        ctx.lineTo(px, py);
      }
    });

    ctx.stroke();
    ctx.setLineDash([]);
  }
}
