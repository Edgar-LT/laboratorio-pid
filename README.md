# Laboratorio de Control PID & Telemetría en Tiempo Real

Simulador interactivo en lazo cerrado para sintonizar controladores PID (Kp, Ki, Kd) sobre un actuador electromecánico de segundo orden, con inyección de perturbaciones y osciloscopio digital.

**Demo:** https://edgar-lt.github.io/laboratorio-pid/

## Características
- Planta de 2º orden configurable (ωn, ζ): `y'' + 2ζωn·y' + ωn²·y = ωn²·(u + d)`
- PID con anti-windup y derivada filtrada sobre la medición
- Osciloscopio en HTML5 Canvas con banda de ±2 %
- Telemetría: sobreimpulso (Mp), tiempo de establecimiento (Ts), IAE, saturación
- Perturbaciones y ruido de sensor

## Tecnologías
JavaScript ES6+, HTML5 Canvas, CSS. Sin dependencias.

## Uso local
Abre `index.html` en el navegador o ejecuta `python -m http.server`.
