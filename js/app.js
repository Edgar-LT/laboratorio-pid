/**
 * @file app.js
 * @description Orquestador principal del Laboratorio de Control PID.
 * Implementa el patrón desacoplado de física y renderizado mediante
 * Acumulador de Tiempo Fijo (Fixed Timestep Accumulator a 500 Hz) independiente de los hercios del monitor.
 */

import { Plant } from './engine/Plant.js';
import { PIDController } from './engine/PIDController.js';
import { RingBuffer } from './engine/RingBuffer.js';
import { Oscilloscope } from './ui/Oscilloscope.js';
import { Telemetry } from './ui/Telemetry.js';

class PIDLabApp {
  constructor() {
    this.DT = 0.002; // Paso de integración física fija: 500 Hz
    this.SAMPLE_INTERVAL = 1 / 60; // Muestreo para graficación a 60 Hz
    
    // Instanciación de Capas de Dominio
    this.plant = new Plant({ wn: 3.0, zeta: 0.3 });
    this.pid = new PIDController({ kp: 4.0, ki: 1.5, kd: 0.6, uMax: 20.0 });
    this.ringBuffer = new RingBuffer(600); // 10 segundos a 60 Hz
    
    // Estado de ejecución y tiempo
    this.setpoint = 1.0;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.timeSinceLastSample = 0;
    
    // Referencias DOM
    this.cacheDOM();
    
    // UI y Telemetría
    this.scope = new Oscilloscope(this.dom.canvas, { windowDuration: 10.0 });
    this.telemetry = new Telemetry(this.dom);
  }

  cacheDOM() {
    const $ = (id) => document.getElementById(id);
    this.dom = {
      canvas: $('scope'),
      clock: $('clock'),
      kp: $('kp'),
      ki: $('ki'),
      kd: $('kd'),
      wn: $('wn'),
      z: $('z'),
      sp: $('sp'),
      kpV: $('kpV'),
      kiV: $('kiV'),
      kdV: $('kdV'),
      wnV: $('wnV'),
      zV: $('zV'),
      spV: $('spV'),
      noise: $('noise'),
      stepBtn: $('step'),
      distBtn: $('dist'),
      pauseBtn: $('pause'),
      resetBtn: $('reset'),
      exportBtn: $('export-csv'),
      presetSelect: $('preset-select'),
      mp: $('mp'),
      ts: $('ts'),
      err: $('err'),
      u: $('u'),
      iae: $('iae'),
      state: $('state')
    };
  }

  init() {
    this.bindEvents();
    this.readSliderParams();
    this.resetSimulation();
    this.startLoop();
  }

  bindEvents() {
    const sliders = ['kp', 'ki', 'kd', 'wn', 'z', 'sp'];
    sliders.forEach((id) => {
      const el = this.dom[id];
      if (!el) return;
      el.addEventListener('input', () => {
        const oldSp = this.setpoint;
        this.readSliderParams();
        if (id === 'sp' && oldSp !== this.setpoint) {
          this.telemetry.startNewStep(this.plant.t, this.plant.y, this.setpoint);
        }
      });
    });

    if (this.dom.noise) {
      this.dom.noise.addEventListener('change', (e) => {
        this.plant.setNoiseEnabled(e.target.checked);
      });
    }

    if (this.dom.stepBtn) {
      this.dom.stepBtn.addEventListener('click', () => {
        this.setpoint = (Math.abs(this.setpoint - 1.0) < 1e-4) ? 0.0 : 1.0;
        this.dom.sp.value = this.setpoint.toString();
        this.dom.spV.textContent = this.setpoint.toFixed(2);
        this.telemetry.startNewStep(this.plant.t, this.plant.y, this.setpoint);
      });
    }

    if (this.dom.distBtn) {
      this.dom.distBtn.addEventListener('click', () => {
        const distMag = -0.5 * (Math.abs(this.setpoint) > 0.1 ? this.setpoint : 1.0);
        this.plant.injectDisturbance(distMag, 1.5);
      });
    }

    if (this.dom.pauseBtn) {
      this.dom.pauseBtn.addEventListener('click', () => {
        this.isPaused = !this.isPaused;
        this.dom.pauseBtn.textContent = this.isPaused ? 'Reanudar' : 'Pausa';
      });
    }

    if (this.dom.resetBtn) {
      this.dom.resetBtn.addEventListener('click', () => this.resetSimulation());
    }

    if (this.dom.exportBtn) {
      this.dom.exportBtn.addEventListener('click', () => this.exportCSV());
    }

    if (this.dom.presetSelect) {
      this.dom.presetSelect.addEventListener('change', (e) => this.applyPreset(e.target.value));
    }
  }

  readSliderParams() {
    const kp = parseFloat(this.dom.kp.value);
    const ki = parseFloat(this.dom.ki.value);
    const kd = parseFloat(this.dom.kd.value);
    const wn = parseFloat(this.dom.wn.value);
    const z = parseFloat(this.dom.z.value);
    this.setpoint = parseFloat(this.dom.sp.value);

    this.dom.kpV.textContent = kp.toFixed(2);
    this.dom.kiV.textContent = ki.toFixed(2);
    this.dom.kdV.textContent = kd.toFixed(2);
    this.dom.wnV.textContent = wn.toFixed(2);
    this.dom.zV.textContent = z.toFixed(2);
    this.dom.spV.textContent = this.setpoint.toFixed(2);

    this.pid.setGains(kp, ki, kd);
    this.plant.setParameters(wn, z);
  }

  applyPreset(presetKey) {
    const presets = {
      underdamped: { kp: 4.0, ki: 1.5, kd: 0.6, wn: 3.0, z: 0.3 },
      critical: { kp: 6.0, ki: 2.0, kd: 1.2, wn: 3.0, z: 1.0 },
      overdamped: { kp: 8.0, ki: 3.0, kd: 1.8, wn: 2.0, z: 1.8 },
      fast: { kp: 12.0, ki: 4.5, kd: 1.5, wn: 5.0, z: 0.5 }
    };

    const p = presets[presetKey];
    if (!p) return;

    this.dom.kp.value = p.kp;
    this.dom.ki.value = p.ki;
    this.dom.kd.value = p.kd;
    this.dom.wn.value = p.wn;
    this.dom.z.value = p.z;

    this.readSliderParams();
    this.resetSimulation();
  }

  resetSimulation() {
    this.plant.reset(0);
    this.pid.reset(0);
    this.ringBuffer.clear();
    this.telemetry.reset();
    this.telemetry.startNewStep(0, 0, this.setpoint);
    this.accumulator = 0;
    this.timeSinceLastSample = 0;
    this.lastTime = performance.now();
  }

  exportCSV() {
    const csvContent = this.ringBuffer.toCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `telemetria_pid_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Bucle Principal con Acumulador de Tiempo Fijo (Fixed Timestep)
   * Resuelve el desacoplamiento estricto de física y tasa de refresco (60Hz, 120Hz, 144Hz)
   */
  startLoop() {
    const tick = (now) => {
      // Delta time real entre fotogramas del navegador (segundos)
      const dtReal = Math.min((now - this.lastTime) / 1000, 0.1); // Clamp contra espiral de muerte
      this.lastTime = now;

      if (!this.isPaused) {
        this.accumulator += dtReal;

        // Limitar pasos físicos máximos por fotograma para proteger contra caídas severas de CPU
        const MAX_SUB_STEPS = 60;
        let subSteps = 0;

        while (this.accumulator >= this.DT && subSteps < MAX_SUB_STEPS) {
          // 1. Obtener medición con posible ruido
          const yMeas = this.plant.getMeasuredOutput();

          // 2. Ejecutar controlador PID con derivada sobre medición y anti-windup
          const ctrl = this.pid.compute(this.setpoint, yMeas, this.DT);

          // 3. Integración física de la planta electromecánica
          this.plant.step(ctrl.u, this.DT);

          // 4. Actualizar métricas formales de telemetría transitoria
          this.telemetry.update(
            this.plant.t,
            this.plant.y,
            this.setpoint,
            ctrl.u,
            this.DT,
            ctrl.saturated,
            this.plant.wn,
            this.plant.zeta
          );

          this.timeSinceLastSample += this.DT;
          if (this.timeSinceLastSample >= this.SAMPLE_INTERVAL) {
            this.ringBuffer.push(this.plant.t, this.plant.y, this.setpoint, ctrl.u);
            this.timeSinceLastSample -= this.SAMPLE_INTERVAL;
          }

          this.accumulator -= this.DT;
          subSteps++;
        }

        // Si se sobrepasó el límite, descartar acumulador residual para evitar congelamientos
        if (subSteps >= MAX_SUB_STEPS) {
          this.accumulator = 0;
        }

        this.telemetry.updateDOM();
      }

      // Renderizado del osciloscopio en cada fotograma del navegador
      const band = this.telemetry.getSettlingBand();
      this.scope.render(this.ringBuffer, this.setpoint, band, this.plant.t);

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }
}

// Inicialización de la aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  const app = new PIDLabApp();
  app.init();
});
