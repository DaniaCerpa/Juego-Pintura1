# Pigmento — Game Design Document (GDD) y especificación técnica

**Versión:** 2.0 — 24 oct 2026 (reemplaza al GDD "Vial Lab" v1.0)
**Alcance de este documento:** Alcance 0 (prototipo web) y Alcance 1 (Android en Google Play). Los Alcances 2 (iOS) y 3 (UA pagada) se mencionan solo donde la arquitectura debe dejarlos preparados.
**Stack:** TypeScript + Phaser 3 + Vite, Vitest para tests, Capacitor para Android. Hosting del prototipo en GitHub Pages o Netlify.
**Género:** Puzzle hybrid-casual (sort puzzle con mezcla de colores)
**Mercado objetivo:** global, con prioridad en mercados de compras in-app (EE.UU., Canadá, Reino Unido, Japón). Soft launch en Chile. Idiomas desde el día 1: es, en.

---

## 0. Cómo usar este documento con Claude Code

Este archivo es la **fuente de verdad** del proyecto. Instrucciones para el agente:

1. Este archivo vive en `docs/GDD.md`. `CLAUDE.md` (plantilla en §16) lo referencia y fija la fase actual.
2. Trabaja **por fases** (§15). No empieces una fase sin que la anterior cumpla su "definición de hecho". No agregues features de fases posteriores aunque parezcan fáciles.
3. Todo número de diseño (capacidades, recompensas, frecuencias de ads, umbrales de estrellas) vive en `src/data/*.json`, nunca hardcodeado. El diseñador debe poder cambiar números sin tocar código.
4. `src/core/` es **TypeScript puro**: sin Phaser, sin DOM, sin Capacitor. Tiene tests en Vitest. El solver y el generador de niveles son la pieza más importante del juego.
5. Ads, IAP, analytics y guardado se implementan primero detrás de **interfaces con stubs** (§11, §12, §14.4). Los SDKs reales entran solo en la fase indicada.
6. Si una regla es ambigua o contradictoria, elige la opción más simple que respete los pilares (§1), anótala en `docs/DECISIONES.md` con fecha y sigue. Detente solo ante una decisión irreversible (publicar, borrar datos, cambiar de stack).
7. Commits chicos con prefijo `feat:`, `fix:`, `test:`, `data:`, `chore:`. Mensajes en español.

---

## 1. Visión y pilares

**Elevator pitch:** Pigmento es un puzzle de ordenar pinturas en frascos donde, además de verter, **mezclas colores para crear otros** (azul + amarillo = verde). Cada nivel que resuelves pinta una parte de un cuadro; cada 10 niveles cuelgas una obra en tu galería. Fácil de aprender en un toque, satisfactorio de ver y oír, y con una razón para volver mañana: el cuadro a medio pintar.

**Por qué es distinto:** en todos los *sort puzzles* del mercado las reglas de combinación son arbitrarias. En Pigmento la regla es teoría del color, que el jugador ya conoce. No hay nada que enseñar: la mecánica y el tema son la misma cosa.

**Pilares de diseño (en orden de prioridad):**

1. **Claridad total.** El jugador ve todo el tablero. Nada oculto, nada aleatorio durante la partida. Si pierde, fue por su decisión.
2. **Satisfacción sensorial.** Cada vertido tiene sonido, partículas y animación corta (≤ 350 ms). Una mezcla es el momento más vistoso del juego.
3. **Sesiones de 30–90 segundos.** Un nivel se termina en el ascensor. Cerrar el juego nunca castiga.
4. **Profundidad sin tutorial.** Las reglas nuevas se enseñan con niveles diseñados a mano, no con texto.
5. **Monetización respetuosa.** Ads opcionales (rewarded) o espaciados (intersticiales). El progreso nunca queda detrás de un pago.

**Lo que Pigmento NO es:** sin temporizador en modo normal, sin vidas, sin energía, sin loot boxes.

---

## 2. Alcances y fases

| Alcance | Fases | Entregable | Qué valida | Costo efectivo |
|---|---|---|---|---|
| **0 — Prototipo web** | F0 (core jugable) + F1 (profundidad) | PWA publicada en un link, jugable en cualquier teléfono | ¿Es divertido? Abandono por nivel, sesiones | ≈ $0 |
| **1 — Android en Play** | F2 (Android + ads + cierre) | APK/AAB en prueba cerrada → producción | D1/D7 reales, eCPM real, primeros ingresos | US$25 |
| 2 — iOS + IAP | F3 | App Store, compras, galería profunda | Conversión a pago | US$99/año + Mac |
| 3 — UA pagada | F4 | Campañas de prueba, sorteo por país | Unit economics | variable |

**Regla:** no se pasa al siguiente alcance sin el dato que el anterior valida (§13).

---

## 3. Reglas del core (F0)

### 3.1 Elementos

- **Frasco:** contenedor vertical con capacidad de **4 capas**. Vacío, parcial o lleno.
- **Capa:** una porción de pintura de un **pigmento** (color). Se apilan de abajo hacia arriba.
- **Pigmento:** identificador (`red`, `blue`, `yellow`, `white`, `green`, `orange`, `purple`, `pink`, `teal`, `brown`, `sky`, `cream`). Definidos en `src/data/pigments.json` con id, hex, nombre localizable y si es **primario** (red, blue, yellow, white) o **derivado** (resultado de una mezcla). Nunca referenciar colores por hex en código.
- **Tablero:** conjunto ordenado de T frascos, renderizado en filas de hasta 5.

### 3.2 Vertido (regla central)

El jugador toca un **frasco origen** (se eleva ~20 px) y luego un **frasco destino**. El vertido es válido si y solo si:

1. El origen no está vacío.
2. El destino no está lleno.
3. El destino está vacío, **o** su capa superior es del mismo pigmento que la capa superior del origen, **o** existe una mezcla válida entre ambos (§5; solo en niveles con mezclas habilitadas).

Si es válido, se vierten **todas las capas contiguas del mismo pigmento** desde el tope del origen, hasta llenar el destino (lo que ocurra primero). Ejemplo: origen `[blue, red, red, red]`, destino `[_, _, _, red]` (1 espacio libre) → se vierte 1 capa roja; quedan 2 en el origen.

Si no es válido: el origen vuelve con una animación de "rebote" (150 ms) y un sonido suave de error. No cuenta como movimiento.

Tocar el frasco seleccionado lo deselecciona.

### 3.3 Condición de victoria

Todos los frascos están **vacíos o llenos (4 capas) de un solo pigmento**.

### 3.4 Movimientos

Cada vertido válido cuenta **1 movimiento**, sin importar cuántas capas se vertieron. Se muestra el contador y el **par** del nivel (mínimo calculado por el solver). Sin límite de movimientos; sin derrota en F0.

### 3.5 Acciones de ayuda

| Acción | Nombre en juego | Comportamiento | F0 | F1+ |
|---|---|---|---|---|
| Deshacer | **Trapo** | Revierte el último vertido. Pila de hasta 20 estados. | Ilimitado | 3 gratis por nivel; luego rewarded = +3 |
| Reiniciar | **Lienzo nuevo** | Vuelve al estado inicial | Gratis | Gratis |
| Frasco extra | **Frasco vacío** | Agrega un frasco vacío temporal (máx. 1 por nivel) | Gratis | 1 rewarded o 150 monedas |

### 3.6 Modelo de datos (core)

```ts
// src/core/types.ts — puro, serializable
export type PigmentId = string;
export interface LevelState {
  jars: PigmentId[][];      // jars[i] = capas de abajo hacia arriba
  capacity: number;         // 4
  moveCount: number;
  drying: Record<number, number>; // índice de frasco → movimientos restantes (§6), vacío si no aplica
}
export interface LevelDef {
  id: number;
  capacity: number;
  jars: PigmentId[][];
  par: number;
  difficulty: number;
  rules: { mixes: string[]; drying: Array<{ jar: number; fuse: number }> };
  handmade: boolean;
  seed: number;
}
```

Los niveles se serializan a JSON con exactamente esos campos (`rules.mixes` = ids de recetas habilitadas, ej. `["blue+yellow"]`).

---

## 4. Solver y generador de niveles

### 4.1 Solver (`src/core/solver.ts`)

**Propósito:** (a) verificar que un nivel tiene solución, (b) calcular el **par**, (c) estimar dificultad.

**Algoritmo:** BFS sobre estados canónicos.
- **Canonicalización:** el orden de los frascos no importa → ordenar los frascos (serializados como string) antes de hashear. Los frascos con secado (§6) llevan su contador en la clave.
- **Podas:** no verter desde un frasco uniforme y lleno; no mover un frasco entero uniforme a uno vacío; no generar un estado idéntico al anterior.
- **Límites:** máximo 300.000 estados o 2 s (configurables). Si se excede → nivel descartado como "no verificable".
- Corre en un **Web Worker** cuando se usa en runtime (modo infinito), nunca en el hilo principal.

**Salida:** `{ solvable: boolean; par: number; statesExplored: number }`.

### 4.2 Generador (`src/core/generator.ts`)

**Entrada:** número de nivel N → parámetros de la tabla §4.3.
**Proceso:**

1. Elegir C pigmentos de la paleta, distinguibles entre sí (§10 accesibilidad).
2. Crear 4 capas por pigmento → 4·C capas.
3. Mezclar con RNG **sembrado con `seed = N`** (determinista: el nivel 37 es idéntico en todos los dispositivos). Repartir en C frascos llenos.
4. Agregar E frascos vacíos.
5. Si el nivel tiene mezclas: aplicar el procedimiento §5.3.
6. Rechazar si: algún frasco inicial ya es uniforme; el estado ya está resuelto; dos frascos son idénticos.
7. Correr el solver. Rechazar si no es resoluble o si `par` sale del rango objetivo.
8. Reintentar hasta 50 veces con `seed = N * 1000 + intento`. Si falla, bajar un escalón de dificultad y registrar warning.

**Precalculado:** `scripts/generate-levels.ts` produce `src/data/levels/levels_0001_0500.json`, versionado en el repo. El generador en runtime solo se usa desde el nivel 501 (modo infinito, "Taller abierto").

### 4.3 Curva de dificultad (`src/data/difficulty.json`)

| Niveles | Pigmentos (C) | Vacíos (E) | Par objetivo | Mezclas | Secado | Nota |
|---|---|---|---|---|---|---|
| 1–3 | 2 | 2 | 2–4 | no | no | Hechos a mano. Enseñan verter. |
| 4–10 | 3 | 2 | 5–9 | no | no | |
| 11–20 | 4 | 2 | 8–14 | no | no | |
| 21 | — | — | — | **hecho a mano**, enseña la mezcla | no | Irresoluble sin mezclar |
| 22–30 | 5 | 2 | 12–18 | 1 receta | no | |
| 31–50 | 5–6 | 2 | 15–24 | 1–2 recetas | no | |
| 51 | — | — | — | sí | **hecho a mano**, enseña el secado | Mecha generosa (12) |
| 52–80 | 6–7 | 2 | 20–30 | 1–2 | 1 frasco | |
| 81–150 | 7–9 | 2 | 25–40 | sí | 1 frasco | |
| 151–300 | 8–10 | 1–2 | 30–55 | sí | 1–2 | |
| 301+ | 9–12 | 1–2 | 40–70 | sí | 0–2 | |

**Respiro:** cada 5 niveles, uno es un escalón más fácil. Cada 10 niveles (10, 20, 30…) un **Encargo**: nivel hecho a mano con solución elegante; al ganarlo se completa el cuadro de esa decena (§7.3).

### 4.4 Niveles hechos a mano

`src/data/levels/handmade.json` con `"handmade": true`; tienen prioridad sobre el generador para ese id. Un test los valida con el solver y falla si alguno no es resoluble o si el 21 es resoluble sin mezclar.

---

## 5. Mezclas (teoría del color) — F1

### 5.1 Regla

Al verter el pigmento **A** sobre un frasco cuya capa superior es **B**, si existe la receta `A + B → P`:

- Se consume **1 capa de A** (la primera que cae) y **1 capa de B** (la superior del destino).
- Se producen **2 capas de P** en el destino (1 + 1 = 2, conservación de volumen).
- La mezcla **detiene el vertido** aunque el origen tuviera más capas de A. Ahora el tope del destino es P.
- Requiere al menos **1 espacio libre** en el destino. Si está lleno, no es válido.
- Las recetas son **simétricas**.
- Cuenta como **1 movimiento**.

### 5.2 Recetas (`src/data/mixes.json`)

| Reactivos | Producto | Se desbloquea en |
|---|---|---|
| blue + yellow | green | nivel 21 |
| red + yellow | orange | nivel 35 |
| red + blue | purple | nivel 45 |
| red + white | pink | nivel 60 |
| blue + white | sky | nivel 75 |
| blue + green | teal | nivel 90 |
| yellow + white | cream | nivel 110 |
| orange + purple | brown | nivel 140 |

Un nivel solo usa recetas ya desbloqueadas (`rules.mixes`). Las recetas siguen teoría del color real para que el jugador las anticipe sin aprenderlas.

### 5.3 Generación con mezclas

Partir del **estado resuelto final** (ej. un frasco lleno de green), reemplazar pares de capas de producto por sus reactivos (2 green → 1 blue + 1 yellow) en frascos distintos, mezclar con el RNG y validar con el solver. La victoria sigue siendo "frascos uniformes o vacíos": **un frasco lleno de reactivos sin mezclar también es victoria** si es uniforme; el jugador no está obligado a mezclar, pero el par asume que mezcla cuando es óptimo.

### 5.4 Feedback de mezcla

Remolino de partículas de los dos colores que converge en el producto (60–80 partículas), flash del color producto, sonido "swirl" (0,4 s), shake de 4 px / 120 ms. Primera vez que el jugador descubre una receta: popup "¡Nueva mezcla!", se agrega a la **Paleta** (§7.2) y da 100 monedas.

---

## 6. Secado (única fuente de derrota) — F1

Un frasco **abierto** tiene pintura que se seca: muestra una **mecha** F (6–12) como un anillo que se consume y un número.

- F baja **1 por cada movimiento** del jugador (cualquier frasco), mientras el frasco no esté resuelto (uniforme lleno o vacío).
- Al llegar a 0 la pintura **se seca**: derrota. Pantalla con "Diluir (ver anuncio)" (rewarded: repone F y continúa) o "Lienzo nuevo".
- Cuando el frasco queda resuelto, la mecha se apaga.
- Deshacer repone 1 punto (consistente: revierte el estado completo).
- El generador marca como abierto el frasco cuyo pigmento requiere más movimientos según el solver y fija `F = par_de_ese_frasco + 3` (configurable).

---

## 7. Progresión y meta — F1

### 7.1 Estrellas

| Movimientos | Estrellas |
|---|---|
| ≤ par + 2 | ★★★ |
| ≤ par + 6 | ★★ |
| otro | ★ |

Umbrales en `src/data/economy.json`. Se guarda el mejor resultado. Rejugar paga solo la diferencia por estrellas nuevas.

### 7.2 Paleta de mezclas

Pantalla de colección: una **rueda de color** donde cada receta descubierta se ilumina con su animación, fecha y usos. Las no descubiertas aparecen en gris con "?". Completar la paleta da 1.000 monedas y un marco exclusivo.

### 7.3 Galería de cuadros (meta principal)

- Cada decena de niveles (1–10, 11–20, …) corresponde a **un cuadro**. Cada nivel ganado **pinta el 10 %** del cuadro (revelado por máscara, de boceto a color). El Encargo (nivel 10, 20, …) completa la obra con una animación de "firma" y la cuelga en la galería.
- **Los cuadros son originales**, nunca obras reales ni imitaciones reconocibles. En F0/F1 se generan **por procedimiento** (composiciones abstractas o paisajes geométricos a partir de la semilla de la decena, con la paleta de pigmentos de esos niveles). Costo de arte: cero. Arte dibujado a mano puede reemplazarlos en F3 sin tocar el sistema.
- La **Galería** es la pantalla de inicio: paredes con los cuadros colgados, el cuadro actual a medio pintar en el caballete, botón grande "Pintar nivel N".
- Marcos y paredes cosméticos: **F3**, no antes. El sistema de slots queda definido en `src/data/gallery.json` desde F1 pero sin tienda.

### 7.4 Economía (`src/data/economy.json`)

| Fuente | Monedas |
|---|---|
| Ganar nivel | 25 |
| Por cada ★ | +10 |
| Primera vez ★★★ | +20 |
| Encargo (cada 10) | 150 |
| Descubrir mezcla | 100 |
| Rewarded "monedas" (1/día) | 100 |
| Regalo diario (racha 1→7: 50, 60, 75, 90, 110, 130, 200) | — |

| Gasto | Monedas |
|---|---|
| Frasco vacío | 150 |
| Pack 3 trapos | 100 |
| Diluir (repone mecha) | 200 |

Balance objetivo: 10 niveles/día con 2★ promedio ≈ 450 monedas/día. Ajustar números con datos; no cambiar la estructura. En F3 se agrega la capa de gasto para mercados tier-1 (marcos, pase mensual con cuadros exclusivos, suscripción); la economía de F1 debe dejar las monedas como moneda blanda y reservar una moneda dura para F3.

---

## 8. Onboarding (sin texto)

- **Nivel 1:** 2 pigmentos, 3 frascos, par 2. El frasco origen pulsa suavemente; al seleccionarlo, pulsa el destino. Solo aquí.
- **Nivel 2:** 2 pigmentos, 4 frascos, par 3. Sin hints.
- **Nivel 3:** enseña que se vierten varias capas juntas.
- **Nivel 21:** mezcla obligatoria. Tras 8 s sin movimiento, los dos frascos involucrados brillan.
- **Nivel 51:** secado con mecha 12.
- Cada acción de ayuda muestra un tooltip de una línea la primera vez que está disponible.

---

## 9. UX, pantallas y flujo

### 9.1 Pantallas (escenas Phaser)

1. **Boot** → carga de datos y assets.
2. **Galería (Home):** cuadros colgados, caballete con el cuadro actual, "Pintar nivel N", acceso a Paleta, Ajustes, Regalo diario.
3. **Nivel:** tablero centrado; arriba nivel, movimientos/par, monedas; abajo Trapo, Frasco vacío, Lienzo nuevo; pausa.
4. **Victoria:** estrellas animadas, monedas, "la pincelada" (animación del 10 % del cuadro que se pinta), "Siguiente" grande y "Rejugar". El intersticial, si corresponde, va **antes** de esta pantalla (§11.2).
5. **Derrota** (solo con secado): "Diluir (ver anuncio)" / "Lienzo nuevo".
6. **Pausa:** continuar, lienzo nuevo, ajustes, salir a la galería.
7. **Paleta de mezclas.**
8. **Ajustes:** sonido, música, vibración, idioma, modo accesibilidad.

### 9.2 Layout y escalado

- Lienzo lógico **1080×1920** (9:16). `Phaser.Scale.FIT` con `autoCenter`, soporta 20:9 y 4:3 con bandas del color de fondo. En navegador de escritorio, el juego se centra con ancho máximo 480 px.
- Frascos en filas de máximo 5. T ≤ 5: 1 fila; 6–10: 2; 11–14: 3. El tamaño escala para que todo quepa con 24 px de margen.
- Área táctil mínima por frasco: 96×96 px lógicos.
- Safe areas: respetar `env(safe-area-inset-*)` en el contenedor y, en Capacitor, el plugin StatusBar.

### 9.3 Animaciones (Phaser Tweens, todas interrumpibles)

| Evento | Duración |
|---|---|
| Seleccionar frasco | 120 ms |
| Vertido (origen se inclina sobre destino + chorro + nivel sube) | 300–350 ms |
| Rebote inválido | 150 ms |
| Mezcla | 500 ms |
| Frasco completado (brillo + pop) | 250 ms |
| Pincelada del cuadro | 600 ms |
| Victoria (confeti + estrellas) | 1,2 s, saltable |

Si el jugador toca durante una animación, la animación termina instantáneamente y el input se procesa. Nunca ignorar input. Debounce de 80 ms entre toques en el tablero.

---

## 10. Arte, audio y accesibilidad

- **Estilo:** flat con textura sutil de lienzo en el fondo (#2A2621 aprox., tono taller con luz cálida). Frascos de vidrio con borde claro y reflejo. Los pigmentos son los protagonistas; todo lo demás es neutro. HUD con tipografía humanista (Google Fonts, gratis).
- **Paleta:** 12 pigmentos en `pigments.json`, verificados para deuteranopia/protanopia. En niveles con C ≤ 6 no combinar red y green; con C ≥ 7 activar **símbolos** sobre cada capa (modo accesibilidad, en Ajustes, activado por defecto si `prefers-contrast` o `forced-colors` lo sugieren).
- **Audio:** vertido (3 variantes "glug"), mezcla ("swirl"), frasco completo (nota ascendente por cada frasco resuelto en la sesión: do, re, mi…), victoria, error. Fuentes CC0 (Kenney, Freesound). Música lo-fi opcional, apagada por defecto. Audio desbloqueado tras el primer toque (requisito de navegadores móviles).
- **Haptics:** `navigator.vibrate` en web / plugin Haptics en Capacitor. 10 ms al completar frasco, 30 ms en mezcla. Desactivable.
- **Placeholders:** F0 y F1 usan gráficos generados por código (`Phaser.GameObjects.Graphics`) y cuadros procedurales. No bloquear nada esperando arte.

---

## 11. Monetización — F2 (Android)

### 11.1 Rewarded video

| Placement | Recompensa | Dónde |
|---|---|---|
| `rw_extra_jar` | +1 frasco vacío | En nivel, cuando no alcanzan las monedas |
| `rw_undo_pack` | +3 trapos | Al agotar los 3 gratis |
| `rw_dilute` | Repone mecha | Derrota |
| `rw_daily_coins` | +100 monedas | Galería, 1/día |
| `rw_double_reward` | Duplica monedas del nivel | Victoria, solo con ★★ o ★★★ |

Sin fill → el botón se oculta. Ad cerrado antes de tiempo → sin recompensa ni castigo.

### 11.2 Intersticiales

Después de ganar, antes de la pantalla de victoria. Reglas en `src/data/ads.json`: nunca antes del nivel 8; máximo 1 cada 3 niveles ganados; mínimo 90 s desde el último ad; nunca justo después de un rewarded. Precargar el siguiente al cerrar el anterior. La lógica "¿toca intersticial?" es **pura** (`src/core/adPolicy.ts`) y tiene tests.

### 11.3 Compras (F3, no en este documento)

`remove_ads`, packs de monedas, marcos, pase mensual, suscripción semanal. Se deja la interfaz `IapService` como stub en F2.

### 11.4 Interfaz `AdsService` (stub desde F0)

```ts
export interface AdsService {
  isRewardedReady(placement: string): Promise<boolean>;
  showRewarded(placement: string): Promise<'completed' | 'skipped' | 'failed'>;
  maybeShowInterstitial(context: string): Promise<boolean>; // aplica adPolicy
  setAdsRemoved(removed: boolean): void;
}
```

- `StubAdsService` (F0/F1): muestra un overlay "ANUNCIO (stub) — 2 s" y devuelve `completed`.
- `AdMobAdsService` (F2): `@capacitor-community/admob` con **IDs de prueba** hasta el release. En web (PWA) se mantiene el stub o se oculta todo lo de ads.
- Consentimiento: en F2, inicializar el formulario de consentimiento (UMP) de AdMob antes del primer ad. Es obligatorio para UE/UK aunque el soft launch sea en Chile.

---

## 12. Analytics y KPIs

### 12.1 Interfaz (`AnalyticsService`)

```ts
export interface AnalyticsService { log(event: string, params?: Record<string, unknown>): void; }
```

- F0: `PostHogAnalytics` (plan gratuito) o `ConsoleAnalytics` + buffer a `localStorage` si no hay red. Sin PII; `distinct_id` anónimo generado en el dispositivo.
- F2: Firebase Analytics vía Capacitor (opcional; PostHog sirve igual en Android).

### 12.2 Eventos obligatorios

`session_start`, `session_end{duration_s, levels_played}`, `level_start{level, difficulty}`, `level_win{level, moves, par, stars, undo_used, extra_jar_used, duration_s}`, `level_fail{level, moves, reason}`, `level_quit{level, moves}`, `mix_discovered{recipe}`, `booster_used{type, paid_with}`, `ad_shown{type, placement}`, `ad_rewarded{placement}`, `daily_gift_claimed{day}`, `painting_completed{painting_id}`.

### 12.3 Metas por alcance

| KPI | Alcance 0 (web, 10–20 testers) | Alcance 1 (Play, orgánico) |
|---|---|---|
| Testers que llegan al nivel 20 | ≥ 60 % | — |
| Abandono por nivel (1–20) | ≤ 5 % en cualquier nivel | ≤ 3 % |
| Niveles por sesión | ≥ 4 | ≥ 4 |
| Retención D1 | — | ≥ 35 % |
| Retención D7 | — | ≥ 12 % |
| Rewarded views / DAU | — | ≥ 1,5 |
| Crash-free sessions | — | ≥ 99,5 % |

Un nivel con abandono sobre el umbral se marca para rediseño a mano.

---

## 13. Criterios de avance entre alcances

- **0 → 1:** 10+ testers, ≥ 60 % llega al nivel 20, ningún nivel con abandono > 5 %, y al menos 3 testers vuelven solos al día siguiente sin que se les pida.
- **1 → 2:** 14 días en producción en Play con D7 ≥ 12 % y eCPM medido.
- **2 → 3:** conversión a pago ≥ 1,5 % y ARPDAU conocido por país.

---

## 14. Arquitectura técnica

### 14.1 Stack y versiones

- Node 20 LTS, **Vite 5**, **TypeScript 5** (strict), **Phaser 3.80+**, **Vitest** (tests de core), **ESLint + Prettier**.
- **vite-plugin-pwa** para manifest, service worker y modo offline (Alcance 0).
- **Capacitor 6** (`@capacitor/android`, `@capacitor/preferences`, `@capacitor/haptics`, `@capacitor/status-bar`, `@capacitor/app`) — F2.
- Hosting del prototipo: GitHub Pages (workflow) o Netlify. Dominio: no necesario.
- CI: GitHub Actions — `lint`, `test`, `build` en cada push; deploy a Pages en `main`.

### 14.2 Estructura de carpetas

```
/
  CLAUDE.md
  docs/GDD.md
  docs/DECISIONES.md
  docs/ESTADO.md
  package.json, vite.config.ts, tsconfig.json, capacitor.config.ts (F2)
  index.html
  public/            # icons, manifest assets, privacy.html (F2)
  scripts/
    generate-levels.ts   # regenera src/data/levels/*.json
  src/
    main.ts            # bootstrap Phaser
    core/              # TS PURO. Sin Phaser, DOM ni Capacitor.
      types.ts
      rules.ts         # tryPour, isSolved, tickDrying, applyMix
      solver.ts
      generator.ts
      difficulty.ts
      stars.ts
      economy.ts
      adPolicy.ts
      rng.ts           # PRNG sembrado (mulberry32 o similar)
      painting.ts      # generador procedural de cuadros (devuelve una descripción, no dibuja)
    data/
      pigments.json, mixes.json, difficulty.json, economy.json, ads.json, gallery.json
      levels/handmade.json, levels/levels_0001_0500.json
      i18n/es.json, i18n/en.json
    services/          # interfaces + implementaciones
      ads/ (AdsService, StubAdsService, AdMobAdsService)
      analytics/ (AnalyticsService, ConsoleAnalytics, PostHogAnalytics)
      storage/ (StorageService, WebStorage, CapacitorStorage)
      iap/ (IapService, StubIapService)
      platform.ts      # detecta web / android / ios
    state/
      gameState.ts     # progreso, monedas, estrellas, recetas, settings; emite eventos
      save.ts          # esquema versionado + migraciones
    scenes/
      BootScene.ts, GalleryScene.ts, LevelScene.ts, VictoryScene.ts, DefeatScene.ts,
      PauseScene.ts, PaletteScene.ts, SettingsScene.ts
    objects/
      Jar.ts, Liquid.ts, PourFX.ts, MixFX.ts, Confetti.ts, PaintingCanvas.ts
    ui/
      Button.ts, Hud.ts, Toast.ts, i18n.ts
  tests/
    rules.test.ts, solver.test.ts, generator.test.ts, stars.test.ts, economy.test.ts,
    adPolicy.test.ts, save.test.ts, handmade.test.ts, painting.test.ts
  android/           # generado por Capacitor en F2, versionado
```

### 14.3 Principios

- **Separación estricta:** `core/` no importa nada fuera de `core/`. Las escenas observan `gameState` y renderizan. Todo cambio de estado de nivel pasa por `rules.ts`.
- **Datos, no código:** números de diseño en `src/data/`. Importados como JSON tipado; validados al arrancar con un esquema (zod o validación manual) para que un JSON malformado falle en desarrollo, no en producción.
- **Determinismo:** PRNG sembrado en `core/rng.ts`. Nunca `Math.random()` en `core/`.
- **Guardado:** `StorageService` con clave única `pigmento.save.v1`: `{ schema: 1, level, coins, stars: {id: n}, mixes: [], paintings: {id: pct}, settings, adsRemoved, daily, distinctId }`. Guardar tras cada evento relevante. Migraciones por `schema`. Web: `localStorage`; Capacitor: `@capacitor/preferences`.
- **Rendimiento:** 60 fps en Android de gama baja. Sin `update()` por frasco; todo por tweens y eventos. Partículas con límite global de 200. Atlas de texturas único generado en Boot. Bundle objetivo < 3 MB.
- **Input:** `pointerdown` únicamente (no `click`, evita el delay de 300 ms). Soporta mouse para desarrollo.
- **Tests:** `core/` con cobertura de todas las reglas (§3, §5, §6), propiedades del generador (todo nivel generado es resoluble, par en rango) y `handmade.json` validado. Test de propiedad: 50 niveles por fila de la tabla §4.3.
- **PWA:** instalable, offline tras la primera carga, `display: standalone`, orientación `portrait`.
- **Android (F2):** `minSdk 24`, `targetSdk` según exigencia vigente de Play, AAB firmado para release, permisos mínimos (Internet y, con AdMob, los que el SDK requiera). `android/` versionado.

### 14.4 Flujo de un turno

```
pointerdown(jar_i)
  ├─ sin selección → seleccionar i (anim elevar)
  ├─ selección == i → deseleccionar
  └─ selección s:
       r = rules.tryPour(state, s, i, levelRules)
       ├─ !r.ok → anim rebote, sonido error, deseleccionar
       └─ ok → push history; state = r.next; anim vertido o mezcla
              → rules.tickDrying(state) → si secó → DefeatScene
              → si jar_i quedó uniforme-lleno → anim completado
              → si rules.isSolved(state) → stars → economy → painting +10 %
                 → adsService.maybeShowInterstitial('level_win') → VictoryScene
```

---

## 15. Plan de trabajo por fases

### F0 — Core jugable (Alcance 0, parte 1)

1. Repo con Vite + TS + Phaser + Vitest + ESLint; CI con `lint`, `test`, `build`; deploy automático a GitHub Pages desde `main`.
2. `core/types.ts`, `core/rules.ts` (`tryPour`, `isSolved`) con tests: destino vacío, mismo pigmento parcial, lleno, vertido parcial, origen vacío, deseleccionar.
3. `core/rng.ts`, `core/solver.ts` con tests: niveles de 2–5 pigmentos con par conocido; uno irresoluble; límite de estados.
4. `core/generator.ts` + `difficulty.ts`; test de propiedad (50 niveles por fila, todos resolubles, par en rango).
5. `scripts/generate-levels.ts` → `levels_0001_0500.json` versionado (sin mezclas ni secado todavía: generar solo filas sin esas reglas, dejar placeholders para 21–50 y 51+ que F1 regenera).
6. Niveles 1–3 a mano.
7. `LevelScene` con frascos como `Graphics`, input, tweens de selección/vertido/rebote, HUD, Trapo/Lienzo nuevo/Frasco vacío (gratis).
8. `VictoryScene` mínima; `gameState` + `save.ts`; `GalleryScene` provisional con "Pintar nivel N".
9. Sonidos CC0; PWA instalable; `ConsoleAnalytics` con buffer.
10. `docs/ESTADO.md` con resumen.

**Definición de hecho:** link público donde cualquiera juega los niveles 1–50 de corrido en Android e iPhone sin errores; tests en verde; el solver resuelve el nivel 50 en < 1 s en desktop; bundle < 3 MB; 60 fps en un Android medio.

### F1 — Profundidad (Alcance 0, parte 2)

1. Mezclas (§5) en `rules`, solver y generador con tests; nivel 21 a mano; test de que el 21 es irresoluble sin mezclar.
2. Secado (§6) + nivel 51 a mano; `DefeatScene`.
3. Regenerar niveles 1–500 con la tabla completa.
4. Estrellas, monedas, costos de ayudas, regalo diario (§7).
5. `core/painting.ts` + `PaintingCanvas`: cuadros procedurales, revelado por 10 %, animación de pincelada y firma en Encargos.
6. `GalleryScene` real; `PaletteScene`; `SettingsScene` con i18n es/en y accesibilidad.
7. `StubAdsService` con overlay visible en los 5 placements (§11.1) y `adPolicy` con tests.
8. `PostHogAnalytics` con todos los eventos de §12.2.
9. Reclutar 10–20 testers por link; medir 7 días; `docs/ESTADO.md` con el embudo por nivel.

**Definición de hecho:** 150 niveles jugables; un tester nuevo entiende la mezcla sin explicación; tests al 100 %; criterio 0 → 1 (§13) cumplido o, si no, lista de niveles a rediseñar.

### F2 — Android en Play (Alcance 1)

1. Capacitor 6 + Android; `CapacitorStorage`, Haptics, StatusBar; `android/` versionado; build debug firmada.
2. `AdMobAdsService` con IDs de prueba, consentimiento UMP, reglas §11.2 verificadas en dispositivo.
3. `public/privacy.html` publicada en el mismo hosting; formulario de seguridad de datos de Play completado.
4. Ícono, feature graphic y 4 capturas (generadas desde el propio juego).
5. Prueba cerrada: 12 testers, 14 días, con uso real (Play lo verifica). Corregir lo que salga.
6. Cambiar a IDs reales de AdMob, AAB de release, solicitar producción. Países: Chile primero; abrir el resto cuando D7 esté medido.
7. `docs/ESTADO.md` con KPIs de §12.3.

**Definición de hecho:** app en producción en Play, crash-free ≥ 99,5 %, primeros ingresos de AdMob visibles en el panel, D1/D7 medidos 14 días.

---

## 16. Plantilla de `CLAUDE.md`

```markdown
# Pigmento

Puzzle móvil hybrid-casual (sort + mezcla de colores) en TypeScript + Phaser 3 + Vite, empaquetado con Capacitor. La especificación completa está en `docs/GDD.md` y es la fuente de verdad: léela antes de cualquier tarea.

## Reglas de trabajo
- Fase actual: **F0** (GDD §15). No implementar nada de fases posteriores.
- `src/core/` es TypeScript puro sin Phaser/DOM/Capacitor, con tests en Vitest. Cualquier cambio de reglas pasa por `src/core/rules.ts` y sus tests.
- Números de diseño solo en `src/data/*.json`. Nunca hardcodear.
- Antes de dar por terminada una tarea: `npm run lint && npm test && npm run build` en verde.
- Ambigüedad → elegir lo más simple que respete los pilares (GDD §1) y anotarlo en `docs/DECISIONES.md`. Detenerse solo ante decisiones irreversibles.
- Al cerrar cada fase: actualizar `docs/ESTADO.md` (qué se hizo, qué queda, decisiones tomadas).
- Commits pequeños, mensajes en español: `feat:`, `fix:`, `test:`, `data:`, `chore:`.

## Comandos
- Desarrollo: `npm run dev`
- Tests: `npm test`
- Regenerar niveles: `npm run levels`
- Build web: `npm run build` (deploy automático a Pages en `main`)
- Android (F2): `npx cap sync android && npx cap open android`
```

---

## 17. Preguntas abiertas (resolver antes de F1)

1. Capacidad fija en 4 capas. **Decidido: sí.**
2. Mezcla 1+1→2 (conservación). **Decidido: sí**; la variante 1+1→1 queda como posible modo "Encargo especial" para F3.
3. Modo infinito desde el 501 ("Taller abierto"). **Decidido: sí**, con generador en Web Worker.
4. Cuadros procedurales: ¿abstractos o paisajes geométricos? **Propuesta: abstractos en F0, paisajes geométricos desde F1** (más reconocibles y compartibles).
5. Nombre comercial definitivo y disponibilidad en tiendas: verificar "Pigmento" antes de F2.

---

## 18. Glosario

- **Par:** mínimo de movimientos de un nivel, calculado por el solver.
- **Pigmento:** color base o derivado de una capa.
- **Mezcla:** receta A + B → P según teoría del color.
- **Secado:** frasco abierto con mecha; única fuente de derrota.
- **Encargo:** nivel hecho a mano cada 10 niveles que completa un cuadro.
- **Rewarded / intersticial:** ad elegido por el jugador a cambio de recompensa / ad de pantalla completa entre niveles.
- **D1 / D7:** porcentaje de instaladores que vuelve al día 1 / 7.
- **eCPM:** ingreso por cada 1.000 impresiones de ads.
