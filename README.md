# Laboratorio de Control PID & Telemetría en Tiempo Real

> **Simulador interactivo en lazo cerrado para sintonizar controladores PID ($K_p$, $K_i$, $K_d$) sobre una planta electromecánica de segundo orden con telemetría en tiempo real, osciloscopio digital y exportación de datos.**

**Demo en Vivo:** [https://edgar-lt.github.io/laboratorio-pid/](https://edgar-lt.github.io/laboratorio-pid/)

---

## 🚀 Arquitectura de Ingeniería & Características

### 1. Desacoplamiento Estricto de Física y Renderizado (Fixed Timestep Accumulator)
- **Integración Numérica a 500 Hz ($DT = 0.002\text{ s}$):** El paso físico está completamente desacoplado de la tasa de refresco del monitor mediante un acumulador de tiempo delta real (`performance.now()`). La simulación se ejecuta con idéntica precisión física en pantallas de 60 Hz, 120 Hz, 144 Hz (ProMotion) o en dispositivos móviles.
- **Integrador Euler Semi-implícito:** Conserva la estabilidad numérica de la planta sin introducir la energía espuria característica del Euler explícito.

### 2. Planta Electromecánica Continua (2º Orden)
$$\ddot{y} + 2\zeta\omega_n \dot{y} + \omega_n^2 y = \omega_n^2 (u + d)$$
- $\omega_n$: Frecuencia natural no amortiguada ($\text{rad/s}$).
- $\zeta$: Coeficiente de amortiguamiento adimensional.
- $u(t)$: Acción de control generada por el PID.
- $d(t)$: Perturbación de carga externa inyectable en caliente.
- Ruido de sensor estocástico opcional.

### 3. Controlador PID Industrial con Protecciones Realistas
- **Derivada sobre la Medición:** Calcula $- \frac{dy}{dt}$ en lugar de $\frac{de}{dt}$ para eliminar el *derivative kick* ante cambios escalón en la referencia.
- **Filtro Derivativo de 1er Orden:** Atenúa el ruido de alta frecuencia del sensor.
- **Anti-Windup por Integración Condicional (Clamping):** Congela la acción integral cuando el actuador alcanza la saturación ($|u| \ge U_{MAX}$), salvo que el error contribuya a desaturarlo.
- **Saturación Física Simétrica:** Límites realistas de tensión/torque fijados en $\pm 20$.

### 4. Búfer Circular Estático Zero-GC (`RingBuffer`)
- Reemplaza el antipatrón de reindexación en arrays (`shift()` $\mathcal{O}(N)$) por un búfer circular tipado (`Float64Array`) de capacidad fija (600 muestras = 10 segundos a 60 Hz).
- Cero asignaciones en memoria en el bucle caliente de renderizado a 60 FPS.

### 5. Osciloscopio Digital High-DPI & Métricas Formales
- Soporte nativo para pantallas Retina mediante `window.devicePixelRatio`.
- Banda de asentamiento formal al $\pm 2\%$.
- Telemetría en tiempo real: Sobreimpulso porcentual ($M_p$), Tiempo de establecimiento formal ($T_s$), Error instantáneo $e(t)$, Acción de control $u(t)$ e Integral del Error Absoluto ($IAE$).
- **Exportación CSV:** Permite descargar el registro histórico para análisis en MATLAB, Python o Excel con un solo clic.

---

## 🏗️ Estructura del Proyecto (Clean Architecture)

```
laboratorio-pid/
├── js/
│   ├── engine/
│   │   ├── Plant.js             # Modelo continuo de 2º orden y paso Euler
│   │   ├── PIDController.js     # PID con derivada filtrada y anti-windup
│   │   └── RingBuffer.js        # Búfer circular Float64Array Zero-GC
│   ├── ui/
│   │   ├── Oscilloscope.js      # Canvas 2D con auto-escala y banda ±2%
│   │   └── Telemetry.js         # Métricas formales Mp, Ts, IAE y estados
│   └── app.js                   # Orquestador con acumulador de tiempo fijo
├── index.html                   # Interfaz Bento Grid (Luxury Editorial UI)
├── style.css                    # Estilos en Obsidiana, Titanio, Oro y Azul Óptico
└── README.md                    # Documentación técnica
```

---

## 💻 Ejecución Local

No requiere Node.js ni instalación de dependencias:

```bash
# Con el servidor HTTP integrado de Python
python -m http.server 8080
```

Abre en tu navegador: `http://localhost:8080`
