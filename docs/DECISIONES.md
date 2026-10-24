# Decisiones de diseño e implementación

Registro de ambigüedades del GDD resueltas eligiendo la opción más simple que respeta los pilares (§1). Fecha · decisión · motivo.

## 2026-10-24 (F0)

- **Audio sintetizado con WebAudio en vez de archivos CC0.** Glug ×3, error, nota ascendente por frasco, arpegio de victoria y swirl se generan por código (`src/services/audio.ts`). Cero bytes de assets, sin licencias que rastrear, y se pueden sustituir por archivos Kenney/Freesound sin tocar las escenas (misma interfaz `AudioService.play(name)`).
- **Niveles 1–500 generados en F0 como sort puro.** El GDD §15 F0.5 pide placeholders para 21+; se generan todos los niveles ignorando las columnas de mezclas/secado para que el juego sea jugable de corrido. F1 regenera el archivo con la tabla completa.
- **Respiro (cada 5 niveles) = pigmentos y par de la fila anterior**, manteniendo las reglas (mezclas/secado) de su propia fila para no "des-enseñar" mecánicas. Filas de un solo nivel (21, 51) se saltan al buscar la fila anterior.
- **Encargos (nivel 10, 20, …) se generan proceduralmente** en F0/F1 con los parámetros de su fila; un nivel hecho a mano en `handmade.json` tiene prioridad si existe. Diseñar 50 encargos a mano no bloquea el prototipo.
- **Reintento del generador:** 50 intentos con la fila; si ninguno cae en el rango de par, 50 más con un escalón menos (warning); si tampoco, se toma el candidato con par más cercano al rango (warning). Así el archivo de niveles siempre queda completo y determinista.
- **Estimación de dificultad** (`difficulty` en `LevelDef`): `clamp(round(par/7 + 0.5·mezclas + 1·secado), 1, 10)`. Monótona y suficiente para analytics; no se usa en reglas.
- **El toque se resuelve contra la "ranura" del frasco (posición base), no contra el sprite.** Durante un vertido el frasco origen se desplaza; con hit-test por sprite un toque en su sitio se perdía. Con ranuras, cualquier toque termina la animación y se procesa (GDD §9.3: nunca ignorar input).
- **`?renderer=canvas` fuerza el renderer Canvas.** Respaldo para dispositivos sin WebGL y para pruebas E2E headless (donde WebGL por software corre a 4 fps). Por eso las capas, partículas y superficies usan texturas de color por pigmento en lugar de `tint` (solo WebGL).
- **Pares de pigmentos a evitar con C ≤ 6** ampliados más allá de red/green: teal/green, sky/blue, cream/white, cream/yellow, pink/red, brown/orange. Viven en `pigments.json`.
- **Pantalla de Ajustes incluida ya en F0** (sonido, música, vibración, idioma, símbolos). Es trivial, los datos ya existían y el usuario pidió capturas de las 5 pantallas al cerrar cada fase. i18n completo y accesibilidad se cierran en F1.
- **Analytics F0 = `ConsoleAnalytics`** con buffer en `localStorage` (máx. 500 eventos), sin PostHog todavía (F1).
- **Lienzo nuevo** también devuelve el "Frasco vacío" (vuelve al estado inicial completo). En F0 es gratis, así que no hay abuso posible; en F1 se revisa con la economía.
- **Pares con guardado parcial o corrupto:** `loadSave` rellena con valores por defecto y conserva `distinctId`; un JSON ilegible genera un guardado nuevo. No se borra nada del jugador sin su acción.

## 2026-10-24 (F1)

- **Solver: A\* con cola de cubos en lugar de BFS puro.** Misma optimalidad (heurística admisible y consistente: cada movimiento reduce el total de segmentos de color en ≤ 1, o ≤ 2 si es mezcla; el estado final tiene un segmento por frasco lleno). Con h = 0 degenera en BFS. Las podas y la clave canónica (§4.1) se mantienen.
- **Generación con mezclas (§5.3): los reactivos no son pigmentos propios del nivel** y las recetas de un nivel no se encadenan (el producto de una no es reactivo de otra). Sin esta restricción, un nivel con `red` y `white` como pigmentos propios y la receta `red+white` tenía > 1 M de estados (22 s por candidato) y la mayoría de intentos quedaban "no verificables". Con ella, un intento cuesta ~0,4 s.
- **Secado (§6):** se marcan como abiertos los frascos que más tarde se resuelven en la solución óptima (índice del movimiento en que quedan uniformes-llenos o vacíos por primera vez) y `F = ese índice + 3` con mínimo 6 (`difficulty.json`). El rango 6–12 del GDD se respeta en los niveles de enseñanza (51 tiene mecha 12); en niveles largos la mecha es mayor porque debe permitir la solución óptima. Una vez apagada (frasco resuelto), la mecha no vuelve a encenderse.
- **Rangos de par de las filas 151–300 y 301+ ajustados** a [26, 45] y [28, 55] (antes [30, 55] y [40, 70]). Con ≤ 12 pigmentos y 1–2 vacíos el par de un tablero aleatorio ronda 25–35; los valores originales obligaban a 50+ intentos por nivel y al escalón inferior. Es un número de diseño: vive en `difficulty.json`.
- **Nivel 21 a mano:** `[R R R B] [G G R Y] [] []`, par 4; la mezcla ocurre en el 2.º movimiento y el nivel es irresoluble sin mezclar (test). **Nivel 51:** tablero generado para su fila con mecha 12 en el frasco que se resuelve en el movimiento 9 de la solución óptima (test de resolubilidad con la mecha).
- **Ayudas en F1:** Trapo 3 gratis por nivel; al agotarse, overlay de pago (anuncio = +3, o 100 monedas). Frasco vacío: anuncio o 150 monedas (1 por nivel). Diluir: anuncio o 200 monedas. Lienzo nuevo gratis y devuelve el frasco extra.
- **Intersticiales:** la política pura (`core/adPolicy.ts`) recibe el contexto desde `StubAdsService` (nivel actual, victorias desde el último intersticial, segundos desde el último anuncio, rewarded en este nivel). El overlay "ANUNCIO (stub)" se muestra 2 s en los 5 placements y en el intersticial.
- **Analytics:** `PostHogAnalytics` envía lotes por HTTP a `/batch/` sin SDK (bundle mínimo) si existe `VITE_POSTHOG_KEY`; si no, `ConsoleAnalytics`. Sin PII; `distinct_id` anónimo. No hay clave de PostHog en este repo: el despliegue público usa el buffer local hasta que se configure el secreto.
- **Cuadros (§7.3, §17.4): paisajes geométricos** (cielo en bandas, astro, montañas, colinas, suelo, árboles/casas) con la paleta de la decena; revelado por 10 pinceladas diagonales; firma animada al completar el Encargo. Títulos en una lista fija de 10 nombres.
- **Regalo diario:** racha 1→7; día saltado vuelve a 1; el día 7 se mantiene mientras no se rompa la racha.
- **Derrota por secado:** el frasco seco no bloquea el tablero; "Diluir" repone la mecha original y se sigue jugando; "Lienzo nuevo" reinicia.
