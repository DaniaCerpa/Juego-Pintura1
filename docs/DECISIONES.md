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
