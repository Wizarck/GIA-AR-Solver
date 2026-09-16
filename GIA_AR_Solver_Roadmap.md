# GIA AR Solver

## 0. Objetivo

Construir una aplicación para iPhone que use la cámara para visualizar en tiempo real una pantalla donde se está ejecutando un test tipo GIA y superponer sobre el vídeo una indicación visual de la respuesta detectada.

La experiencia objetivo es:

```text
┌─────────────────────────────────────────────┐
│                 LIVE CAMERA                 │
│                                             │
│        ┌─────────────────────────┐          │
│        │       GIA QUESTION      │          │
│        │                         │          │
│        │      A   B   [ C ]  D  │ ◄─ AR    │
│        │                         │    stroke│
│        └─────────────────────────┘          │
│                                             │
└─────────────────────────────────────────────┘
```

La cámara debe seguir mostrando el vídeo real. El sistema debe detectar la pregunta, resolverla y dibujar un overlay alineado con la opción correspondiente.

> **Nota de alcance:** el desarrollo debe validarse primero con ejemplos/práctica autorizados. Antes de usar cualquier asistencia durante una evaluación real, comprobar las reglas del proveedor y del proceso de selección.

---

# 1. Principios de arquitectura

## 1.1 Vision-first, LLM-second

No utilizar un modelo multimodal para resolver todo indiscriminadamente.

Prioridad:

1. Computer Vision clásico cuando sea suficiente.
2. Algoritmos deterministas.
3. Modelos ML pequeños/especializados.
4. OCR/NLP.
5. Modelo multimodal/LLM como fallback para problemas que realmente requieran razonamiento.

Objetivo:

- menor latencia;
- mayor determinismo;
- menor coste;
- mejor capacidad de testing;
- funcionamiento local cuando sea posible.

## 1.2 Cámara y solver desacoplados

El pipeline de vídeo y el pipeline de resolución deben funcionar de forma independiente.

```text
Camera 30–60 FPS
       │
       ├──────────────► Tracking / Overlay
       │
       └──────────────► Solver 5–10 FPS
                            │
                            ▼
                       Answer + BBox
                            │
                            ▼
                       AR Overlay
```

No resolver cada frame.

## 1.3 Cachear preguntas

Si una pregunta no ha cambiado, no volver a resolverla.

```text
frame
  ↓
question crop
  ↓
perceptual hash
  ↓
same question?
 ┌──────┴──────┐
 YES           NO
  │             │
reuse          solve
answer         answer
```

---

# 2. Objetivo del MVP

## MVP-0

Resolver preguntas a partir de screenshots.

```text
Screenshot
    ↓
Question detector
    ↓
Solver
    ↓
Answer
```

Sin cámara todavía.

## MVP-1

Cámara en tiempo real.

```text
Camera
   ↓
Screen detection
   ↓
Perspective correction
   ↓
Question detection
```

## MVP-2

Primer solver completo:

**Spatial Visualisation**

```text
Camera
   ↓
Screen
   ↓
Question
   ↓
Spatial solver
   ↓
Answer coordinates
   ↓
Overlay
```

## MVP-3

Optimización de tiempo real.

Objetivo inicial de ingeniería:

- detección estable;
- respuesta correcta;
- overlay estable;
- latencia objetivo <300 ms desde una pregunta nueva hasta la primera indicación visual.

La latencia real se medirá; este valor es un objetivo inicial, no un resultado garantizado.

## MVP-4

Añadir:

- Perceptual Speed;
- Number Speed & Accuracy;
- Word Meaning;
- Reasoning.

---

# 3. Arquitectura de alto nivel

```text
                         ┌─────────────────┐
                         │     iPhone      │
                         │                 │
                         │     Camera      │
                         └────────┬────────┘
                                  │
                                  ▼
                       ┌────────────────────┐
                       │ Frame Acquisition  │
                       └─────────┬──────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │                           │
                   ▼                           ▼
          ┌─────────────────┐         ┌─────────────────┐
          │ Tracking Engine │         │ Solver Pipeline │
          └────────┬────────┘         └────────┬────────┘
                   │                            │
                   │                            ▼
                   │                   ┌─────────────────┐
                   │                   │ Screen Detector │
                   │                   └────────┬────────┘
                   │                            │
                   │                            ▼
                   │                   ┌─────────────────┐
                   │                   │ Perspective Warp│
                   │                   └────────┬────────┘
                   │                            │
                   │                            ▼
                   │                   ┌─────────────────┐
                   │                   │Question Detector│
                   │                   └────────┬────────┘
                   │                            │
                   │                            ▼
                   │                   ┌─────────────────┐
                   │                   │ Test Classifier │
                   │                   └────────┬────────┘
                   │                            │
                   │          ┌─────────────────┼─────────────────┐
                   │          ▼                 ▼                 ▼
                   │      Spatial          Numeric          Perceptual
                   │       Solver           Solver             Solver
                   │          │                 │                 │
                   │          └─────────────────┼─────────────────┘
                   │                            ▼
                   │                     NLP / Reasoning
                   │                       fallback
                   │                            │
                   │                            ▼
                   │                   Answer + Confidence
                   │                            │
                   └────────────────────────────┤
                                                ▼
                                      ┌──────────────────┐
                                      │   AR Overlay     │
                                      │                  │
                                      │   Stroke / Box   │
                                      └──────────────────┘
```

---

# 4. Componentes del sistema

## 4.1 Camera Engine

Responsabilidades:

- abrir cámara;
- seleccionar cámara trasera;
- controlar resolución;
- capturar frames;
- timestamp de frames;
- controlar FPS;
- entregar frames al pipeline CV.

### iOS

Candidato:

- AVFoundation.

### Web POC

Candidato:

- `getUserMedia()`;
- Canvas/WebGL.

---

# 5. Screen Detector

Detectar la pantalla donde aparece el test.

Input:

```text
camera frame
```

Output:

```json
{
  "screen": {
    "corners": [
      [x1, y1],
      [x2, y2],
      [x3, y3],
      [x4, y4]
    ]
  },
  "confidence": 0.98
}
```

Debe funcionar aunque:

- la cámara esté inclinada;
- exista perspectiva;
- haya movimiento;
- el monitor ocupe solo una parte del frame.

---

# 6. Perspective Correction

Aplicar homografía.

```text
Camera view

      ╱────────────╲
     ╱              ╲
    ╱     SCREEN     ╲
    ╲                ╱
     ╲──────────────╱

            ↓

┌────────────────────────┐
│                        │
│       RECTIFIED        │
│        SCREEN          │
│                        │
└────────────────────────┘
```

El resto de los módulos trabajan preferentemente sobre la imagen rectificada.

---

# 7. Question Detector

Detectar:

- área de pregunta;
- área de respuestas;
- número de opciones;
- timer si es necesario;
- elementos persistentes de UI.

Output conceptual:

```json
{
  "questionRegion": {
    "x": 0.12,
    "y": 0.20,
    "width": 0.76,
    "height": 0.55
  },
  "answers": [
    {
      "id": "A",
      "bbox": [0.10, 0.80, 0.15, 0.10]
    },
    {
      "id": "B",
      "bbox": [0.30, 0.80, 0.15, 0.10]
    },
    {
      "id": "C",
      "bbox": [0.50, 0.80, 0.15, 0.10]
    },
    {
      "id": "D",
      "bbox": [0.70, 0.80, 0.15, 0.10]
    }
  ]
}
```

---

# 8. Test Classifier

Determinar qué tipo de prueba está activa.

Tipos iniciales:

```text
SPATIAL
PERCEPTUAL
NUMERIC
VERBAL
REASONING
```

La clasificación puede utilizar:

- layout;
- UI;
- características visuales;
- OCR;
- templates.

No depender exclusivamente de un LLM.

---

# 9. Solver Architecture

Todos los solvers deben exponer una interfaz común.

```text
solve(question) -> Solution
```

Modelo:

```json
{
  "answerId": "C",
  "confidence": 0.997,
  "reason": "optional internal diagnostic",
  "latencyMs": 42
}
```

Para el overlay también necesitamos:

```json
{
  "answerId": "C",
  "bbox": [x, y, width, height]
}
```

---

# 10. Spatial Solver — prioridad #1

## Objetivo

Resolver transformaciones/rotaciones de figuras y determinar la opción correcta.

Pipeline:

```text
Question image
      ↓
Detect symbols
      ↓
Segment shapes
      ↓
Normalize
      ↓
Generate rotations
      ↓
Compare
      ↓
Classify
      ↓
Answer
```

Comparación:

```text
symbol A
   │
   ├── 0°
   ├── 90°
   ├── 180°
   └── 270°
          │
          ▼
       compare
          │
          ▼
       match?
```

Herramientas candidatas:

- OpenCV;
- contours;
- binary masks;
- image moments;
- template matching;
- pixel similarity;
- rotation normalization.

## Métricas

Medir:

- accuracy;
- false positives;
- false negatives;
- latency;
- robustness ante perspectiva;
- robustness ante ruido de cámara.

---

# 11. Perceptual Solver

Pipeline:

```text
Question
   ↓
Detect objects / characters
   ↓
Normalize
   ↓
Compare
   ↓
Determine match/difference
   ↓
Answer
```

Candidatos:

- OpenCV;
- template matching;
- OCR;
- feature descriptors;
- pequeño modelo CV si fuese necesario.

---

# 12. Numeric Solver

Pipeline:

```text
Camera
  ↓
Crop
  ↓
OCR
  ↓
Expression parser
  ↓
Arithmetic
  ↓
Match answer option
```

Debe soportar:

- suma;
- resta;
- multiplicación;
- división;
- comparaciones;
- formatos específicos encontrados en el dataset.

---

# 13. Word Meaning Solver

Pipeline:

```text
Camera
   ↓
OCR
   ↓
Words
   ↓
Semantic similarity
   ↓
Candidate ranking
   ↓
Answer
```

Candidatos:

- embeddings;
- diccionario/WordNet;
- modelo multilingual;
- LLM fallback.

No asumir que una traducción literal determina siempre la respuesta.

---

# 14. Reasoning Solver

Este será el módulo con mayor dependencia de ML.

Pipeline:

```text
Question image
      ↓
OCR + visual extraction
      ↓
Structured representation
      ↓
Reasoning model
      ↓
Candidate answers
      ↓
Validation
      ↓
Answer
```

Siempre que sea posible:

```text
visual input
   ↓
structured data
   ↓
deterministic reasoning
```

antes de usar un modelo generativo.

---

# 15. Confidence Engine

Cada solver devuelve confianza.

Estados:

```text
HIGH
MEDIUM
LOW
UNKNOWN
```

Comportamiento:

```text
HIGH
  ↓
mostrar respuesta

MEDIUM
  ↓
mostrar respuesta + indicador de incertidumbre

LOW
  ↓
fallback / reprocess

UNKNOWN
  ↓
no marcar una respuesta incorrecta
```

Regla importante:

**No inventar una respuesta cuando la confianza es baja.**

---

# 16. AR Overlay Engine

Este es uno de los componentes centrales del producto.

Input:

```json
{
  "answerId": "C",
  "bbox": [x, y, width, height],
  "confidence": 0.997
}
```

Output visual:

```text
LIVE VIDEO
────────────────────────

       A     B    ╭────C────╮    D
                   │         │
                   ╰─────────╯

────────────────────────
```

El stroke debe seguir la posición real de la opción.

## Tracking

Entre soluciones:

```text
Frame N:
answer bbox = X

Frame N+1:
track X

Frame N+2:
track X
```

No recalcular toda la geometría continuamente.

---

# 17. Coordinate Mapping

Necesitamos transformar:

```text
coordinates in rectified image
```

a:

```text
coordinates in camera preview
```

Pipeline:

```text
Camera coordinates
       ↕
Screen homography
       ↕
Rectified coordinates
       ↕
Question coordinates
       ↕
Answer coordinates
```

Este módulo debe estar muy bien testeado porque un solver correcto con un overlay mal alineado produce una UX incorrecta.

---

# 18. Question Change Detection

Detectar cuándo aparece una nueva pregunta.

Métodos candidatos:

### A. Perceptual hash

```text
crop → pHash → compare
```

### B. Image similarity

```text
previous crop ↔ current crop
```

### C. DOM/UI signal

Solo disponible si controlamos la aplicación web del test; no asumirlo para una cámara externa.

### D. Timer/visual transition

Fallback.

---

# 19. Performance Architecture

Objetivo:

```text
Camera:
30–60 FPS

Tracking:
30–60 FPS

Question detection:
5–15 FPS

Solver:
on-demand

Overlay:
30–60 FPS
```

Utilizar:

- frame skipping;
- caching;
- ROI processing;
- Web Workers en web;
- Metal/Core ML en iOS cuando proceda.

---

# 20. Dataset

Necesitamos un dataset de desarrollo separado por prueba.

```text
dataset/
├── spatial/
├── perceptual/
├── numeric/
├── verbal/
└── reasoning/
```

Cada ejemplo debería contener:

```json
{
  "id": "spatial-001",
  "type": "spatial",
  "image": "001.png",
  "answer": "C",
  "answerBBox": [x, y, w, h],
  "source": "authorized-practice",
  "notes": ""
}
```

Idealmente tendremos:

```text
train/
validation/
test/
```

y nunca usar el conjunto `test` para ajustar el solver.

---

# 21. Dataset de cámara

Después del dataset limpio, crear variaciones reales:

- diferentes iPhones;
- diferentes distancias;
- diferentes ángulos;
- diferentes monitores;
- diferentes niveles de brillo;
- reflejos;
- movimiento;
- resolución;
- iluminación;
- moiré.

Ejemplo:

```text
same question

             clean
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
   angled    blurry   low-light
```

---

# 22. Benchmark

Crear un benchmark automático.

```text
100 questions
     ↓
solver
     ↓
predictions
     ↓
ground truth
     ↓
metrics
```

Métricas mínimas:

| Métrica | Objetivo inicial |
|---|---:|
| Accuracy | >99% para solvers deterministas |
| P95 latency | <300 ms |
| Screen detection | >99% |
| Answer localization | >99% |
| False answer rate | minimizar |
| Question change detection | >99% |

Los objetivos son hipótesis de ingeniería y deberán ajustarse después de medir.

---

# 23. Tecnología

## POC

```text
Python
OpenCV
NumPy
pytest
```

Objetivo:

resolver screenshots y crear el benchmark.

## Web prototype

```text
TypeScript
React
Vite
Canvas/WebGL
OpenCV.js
ONNX Runtime Web
Web Workers
```

## iOS

```text
Swift
SwiftUI
AVFoundation
Vision
Core ML
Metal
```

La app iOS debería ser el destino si el POC demuestra que necesitamos máximo rendimiento y procesamiento local.

---

# 24. Repositorio

Propuesta:

```text
gia-ar-solver/
│
├── README.md
├── docs/
│   ├── architecture.md
│   ├── roadmap.md
│   ├── dataset.md
│   ├── vision-pipeline.md
│   └── solver-contract.md
│
├── dataset/
│
├── benchmarks/
│
├── solvers/
│   ├── spatial/
│   ├── perceptual/
│   ├── numeric/
│   ├── verbal/
│   └── reasoning/
│
├── vision/
│   ├── screen_detector/
│   ├── perspective/
│   ├── question_detector/
│   └── tracking/
│
├── overlay/
│
├── web/
│
├── ios/
│
└── tests/
```

---

# 25. Roadmap

## Phase 0 — Reconocimiento

### P0.1 — Analizar el test

- [ ] identificar las cinco pruebas;
- [ ] documentar layouts;
- [ ] documentar tipos de pregunta;
- [ ] documentar tipos de respuesta;
- [ ] identificar elementos comunes de UI;
- [ ] identificar variaciones.

### P0.2 — Legal / usage boundaries

- [ ] identificar ejemplos/práctica autorizados;
- [ ] revisar condiciones de uso;
- [ ] separar dataset de práctica de cualquier evaluación real;
- [ ] documentar límites de uso.

### P0.3 — Dataset inicial

- [ ] recopilar ejemplos autorizados;
- [ ] etiquetar respuestas;
- [ ] etiquetar bounding boxes;
- [ ] separar train/validation/test.

---

# 26. Phase 1 — Spatial Solver

### P1.1

- [ ] detector de figuras;
- [ ] segmentation;
- [ ] normalization;
- [ ] rotation engine;
- [ ] similarity algorithm.

### P1.2

- [ ] solver end-to-end;
- [ ] tests unitarios;
- [ ] benchmark;
- [ ] latency profiling.

### Exit criteria

```text
Screenshot → answer

reliability suficiente sobre dataset de validación
latencia medida
```

---

# 27. Phase 2 — Camera

### P2.1

- [ ] camera capture;
- [ ] frame pipeline;
- [ ] screen detection;
- [ ] perspective correction.

### P2.2

- [ ] question region;
- [ ] answer regions;
- [ ] coordinate mapping.

### Exit criteria

```text
Camera → rectified test screen
```

---

# 28. Phase 3 — AR Overlay

### P3.1

- [ ] transparent overlay;
- [ ] answer stroke;
- [ ] bbox mapping;
- [ ] tracking;
- [ ] smoothing.

### P3.2

- [ ] question change detection;
- [ ] answer cache;
- [ ] solver trigger.

### Exit criteria

```text
Camera → question → answer → stroke
```

en tiempo real.

---

# 29. Phase 4 — Performance

- [ ] FPS optimization;
- [ ] ROI processing;
- [ ] frame skipping;
- [ ] worker/thread separation;
- [ ] memory profiling;
- [ ] battery impact;
- [ ] thermal behavior;
- [ ] latency telemetry local.

---

# 30. Phase 5 — Remaining Solvers

Orden propuesto:

```text
1. Spatial
2. Perceptual
3. Numeric
4. Verbal
5. Reasoning
```

Cada uno debe pasar por:

```text
Dataset
  ↓
Offline solver
  ↓
Benchmark
  ↓
Camera integration
  ↓
Overlay
  ↓
Performance
```

No integrar un solver directamente en producción sin benchmark.

---

# 31. Phase 6 — iOS Product

Si el web prototype valida la arquitectura:

- [ ] SwiftUI UI;
- [ ] AVFoundation;
- [ ] Vision;
- [ ] Core ML;
- [ ] Metal;
- [ ] local inference;
- [ ] device profiling;
- [ ] camera permissions;
- [ ] privacy model;
- [ ] offline mode.

---

# 32. UX objetivo

Pantalla inicial:

```text
GIA AR SOLVER

[ Start Camera ]

Point the camera at the test screen.
```

Después:

```text
┌─────────────────────────────────────┐
│                                     │
│            LIVE CAMERA              │
│                                     │
│       ┌───────────────────┐         │
│       │                   │         │
│       │     QUESTION      │         │
│       │                   │         │
│       └───────────────────┘         │
│                                     │
│      A       B      ╭────╮      D  │
│                     │ C  │         │
│                     ╰────╯         │
│                                     │
│              99.7%                  │
└─────────────────────────────────────┘
```

La UI debe ser mínima. El usuario no debería tener que interactuar con la aplicación durante el procesamiento.

---

# 33. Telemetría local

Para debugging:

```json
{
  "timestamp": "...",
  "testType": "spatial",
  "screenDetectionMs": 12,
  "questionDetectionMs": 8,
  "solverMs": 31,
  "overlayMs": 2,
  "totalMs": 53,
  "confidence": 0.997
}
```

No almacenar imágenes de cámara por defecto.

---

# 34. Seguridad y privacidad

Principio:

**camera frames should remain local whenever possible.**

Si se utiliza backend:

- [ ] documentar qué imágenes salen del dispositivo;
- [ ] cifrado;
- [ ] retención mínima;
- [ ] no almacenar frames por defecto;
- [ ] consentimiento explícito si fuese necesario.

Objetivo final:

```text
Camera
  ↓
Local CV
  ↓
Local solver
  ↓
Local overlay
```

---

# 35. Decisiones pendientes

## D1 — Web vs iOS primero

Propuesta:

**Web/PWA para POC → iOS nativo para producto final.**

## D2 — Processing local vs backend

Propuesta:

**local-first**, backend únicamente como fallback durante desarrollo.

## D3 — Modelo multimodal

No elegir todavía.

Primero benchmark de:

- CV clásico;
- OCR;
- modelos pequeños;
- después multimodal.

## D4 — Framework AR

No asumir ARKit inicialmente.

La experiencia que queremos puede implementarse como:

```text
Camera Preview
+
Transparent Overlay
```

sin necesitar un sistema AR espacial completo.

ARKit sería necesario si posteriormente queremos tracking espacial más sofisticado.

---

# 36. Definition of Done — MVP

El MVP estará terminado cuando podamos:

1. abrir la cámara del iPhone;
2. detectar la pantalla;
3. corregir perspectiva;
4. detectar una pregunta;
5. identificar Spatial Visualisation;
6. resolverla;
7. localizar la opción correcta;
8. transformar sus coordenadas al preview;
9. dibujar un stroke sobre la respuesta;
10. mantener el stroke estable mientras la cámara se mueve;
11. detectar una pregunta nueva;
12. resolverla sin intervención manual;
13. hacerlo suficientemente rápido para que el overlay aparezca inmediatamente después de detectar la nueva pregunta.

---

# 37. Primer Sprint recomendado

No empezar todavía por Swift ni por la cámara.

### Sprint 0 — Spatial Solver POC

**Objetivo:** demostrar que podemos resolver automáticamente el primer tipo de pregunta.

### Tareas

```text
[ ] crear repositorio
[ ] crear estructura de proyecto
[ ] obtener dataset autorizado
[ ] crear formato de annotations
[ ] crear image viewer/debugger
[ ] implementar preprocessing
[ ] detectar figuras
[ ] implementar rotation matching
[ ] implementar answer solver
[ ] crear tests
[ ] crear benchmark
[ ] medir accuracy
[ ] medir latency
```

### Resultado esperado

Un comando conceptual:

```bash
python solve.py --image question.png
```

que produzca:

```text
Test: Spatial
Answer: C
Confidence: 0.997
Latency: 38ms
```

Y una herramienta de debug que genere:

```text
original image
        +
detected regions
        +
predicted answer
        +
confidence
```

Una vez conseguido esto, pasamos a **Camera + Screen Detection + AR Overlay**.

---

# 38. North Star

El producto final debe sentirse así:

```text
                 REAL WORLD
                     │
                     ▼
              ┌─────────────┐
              │   CAMERA    │
              └──────┬──────┘
                     │
                     ▼
              COMPUTER VISION
                     │
                     ▼
                 SOLVER
                     │
                     ▼
               COORDINATES
                     │
                     ▼
              ┌─────────────┐
              │ AR OVERLAY  │
              └──────┬──────┘
                     │
                     ▼

        "La respuesta aparece marcada
         directamente sobre la pantalla."
```

La métrica de producto más importante no es simplemente la accuracy del modelo. Es:

**Correct Answer + Correct Location + Low Latency + Stable Overlay.**
