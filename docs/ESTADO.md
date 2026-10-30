# Estado del proyecto

**Link público (GitHub Pages):** https://daniacerpa.github.io/Juego-Pintura1/
Se despliega automáticamente con cada push a `main` (`.github/workflows/deploy.yml`).

## F0 — Core jugable · cerrada el 2026-10-24

### Qué se hizo

- Repo con Vite 5 + TypeScript 5 (strict) + Phaser 3.90 + Vitest 2 + ESLint 9 + Prettier; CI (`lint`, `test`, `build`) en cada push y deploy a GitHub Pages desde `main`.
- `src/core/` (TS puro, sin Phaser/DOM): `types.ts`, `rng.ts` (mulberry32), `rules.ts` (`tryPour`, `isSolved`, `pourOutcome` compartido con el solver), `solver.ts` (búsqueda óptima sobre estados canónicos con podas y límites; devuelve par y solución), `difficulty.ts` (tabla §4.3 + respiro/encargo), `generator.ts` (determinista, `seed = N·1000 + intento`), `pigments.ts`, `levels.ts`.
- 52 tests en Vitest: reglas (§3), solver (par conocido, irresoluble, límite de estados), propiedades del generador (50 niveles por fila: resolubles y par en rango), curva de dificultad, RNG, guardado, niveles a mano y precalculados. El solver resuelve el nivel 50 en < 1 s (test).
- `scripts/generate-levels.ts` → `src/data/levels/levels_0001_0500.json` (497 generados + 3 a mano). En F0 todos los niveles son sort puro (sin mezclas ni secado); F1 regenera.
- Niveles 1–3 a mano (`handmade.json`) con prioridad sobre el generador.
- `LevelScene`: frascos de vidrio con borde, reflejo y sombra (texturas generadas por código), capas de líquido que suben/bajan con tweens, vertido con inclinación + chorro + salpicadura de partículas (límite global 200), rebote inválido, brillo al completar frasco, HUD (nivel, movimientos/par), Trapo (ilimitado), Frasco vacío (1 por nivel), Lienzo nuevo, Pausa. Toda animación es interrumpible por input y el toque se resuelve por ranura (nunca se pierde). Debounce 80 ms con reloj de pared. Pulso de ayuda solo en el nivel 1 (§8). Tooltips de una línea la primera vez.
- `VictoryScene` (confeti saltable, Siguiente/Rejugar/Galería), `GalleryScene` provisional (pared con marcos, caballete con % del cuadro de la decena, "Pintar nivel N"), `PauseScene`, `SettingsScene` (sonido, música, vibración, idioma es/en, símbolos de accesibilidad).
- `gameState` + `save.ts` (clave `pigmento.save.v1`, esquema versionado, tolerante a guardados corruptos o parciales).
- Servicios con interfaces y stubs: `StorageService`/`WebStorage`, `AnalyticsService`/`ConsoleAnalytics` (buffer en localStorage; eventos `session_start`, `session_end`, `level_start`, `level_win`, `level_quit`, `booster_used`), `AdsService`/`StubAdsService`, `IapService`/`StubIapService`, `AudioService` (sonidos sintetizados: glug ×3, error, nota ascendente por frasco, victoria, swirl), `HapticsService` (`navigator.vibrate`).
- PWA instalable y jugable offline tras la primera carga (vite-plugin-pwa, `display: standalone`, `orientation: portrait`, iconos 192/512). Verificado con Playwright (reload sin red → galería activa).
- Lienzo lógico 1080×1920, `Scale.FIT` + `autoCenter`, bandas en 20:9; ancho máximo 480 px en escritorio; `env(safe-area-inset-*)`.
- Bundle de producción: **1,8 MB** (Phaser 1,45 MB + juego 0,25 MB + niveles).

### Verificación

- `npm run lint && npm test && npm run build` en verde.
- E2E con Playwright (renderer Canvas, ver `docs/DECISIONES.md`): niveles 1–50 jugados de corrido con la solución del solver, sin errores de consola, guardado avanzando en cada victoria. (Las capturas de `docs/capturas/` corresponden al estado final de F1.)
- 60 fps: no hay `update()` por frasco; frascos y botones son sprites de texturas generadas una vez; partículas con tope global. No se pudo medir en un Android físico desde este entorno (pendiente de confirmar en dispositivo).

### Qué quedó pendiente / notas

- Paleta de mezclas, estrellas, monedas y cuadros procedurales son de F1.
- Sonidos CC0: se usan sonidos sintetizados (decisión registrada); se pueden sustituir sin tocar escenas.
- Encargos (10, 20, …) son procedurales, no hechos a mano.
- Medir fps en un Android medio real y probar en iPhone (Safari) con el link público.

### Decisiones

Ver `docs/DECISIONES.md` (sección 2026-10-24 F0).

## F1 — Profundidad · cerrada el 2026-10-24

### Qué se hizo

- **Mezclas (§5)** en `rules.ts` (`pourOutcome` con tabla simétrica de recetas), solver y generador. Nivel 21 a mano (par 4, mezcla en el 2.º movimiento) con test de que es irresoluble sin mezclar. Feedback: remolino de partículas de los dos colores, flash del producto, sonido swirl, shake y toast "¡Nueva mezcla!" (+100 monedas) la primera vez.
- **Secado (§6)**: mecha por frasco en el modelo (`drying`), `tickDrying` tras cada movimiento, anillo que se consume con número sobre el frasco, `DefeatScene` con "Diluir (ver anuncio)", "Diluir (200 monedas)" y "Lienzo nuevo". Nivel 51 a mano con mecha 12. El generador marca el frasco que más tarde se resuelve en la solución óptima y fija `F = índice + 3` (mín. 6).
- **Solver**: A\* con cola de cubos y heurística admisible de segmentos (equivale a BFS con h = 0); las podas y la clave canónica se mantienen. Generador con recetas no encadenadas y reactivos solo por pares reemplazados (ver `DECISIONES.md`): un intento cuesta ~0,4 s en la fila 301+.
- **Niveles 1–500 regenerados** con la tabla completa (mezclas desde el 22, secado desde el 52). 2 warnings de escalón inferior en 500 niveles. Rangos de par de las filas 151+ ajustados en `difficulty.json`.
- **Estrellas, monedas y economía (§7)**: `core/stars.ts`, `core/economy.ts` (recompensas, diferencia al rejugar, encargo, regalo diario con racha 1→7), costos de ayudas (Trapo 3 gratis → anuncio o 100; Frasco vacío anuncio o 150; Diluir anuncio o 200) con `OfferScene`.
- **Cuadros procedurales (§7.3)**: `core/painting.ts` genera paisajes geométricos a partir de la decena y la paleta de sus niveles; `PaintingCanvas` rasteriza boceto y cuadro a textura una vez, revela por 10 pinceladas diagonales (máscara) y firma al completar el Encargo. `VictoryScene` con estrellas animadas, monedas, la pincelada (+10 %), "Duplicar (ver anuncio)" solo con ★★+, Siguiente/Rejugar/Galería. Todo saltable con un toque.
- **GalleryScene real**: pared con los últimos cuadros colgados, caballete con el cuadro de la decena, monedas, Paleta, Ajustes y Regalo diario. **PaletteScene**: rueda con las 8 recetas (descubiertas con animación, fecha y usos; las demás en gris con "?" y nivel de desbloqueo). **SettingsScene** con i18n es/en (todas las cadenas en `src/data/i18n/*.json`) y símbolos de accesibilidad (activados por defecto si `prefers-contrast`/`forced-colors`).
- **Ads**: `StubAdsService` muestra el overlay "ANUNCIO (stub) — 2 s" en los 5 placements (`rw_extra_jar`, `rw_undo_pack`, `rw_dilute`, `rw_daily_coins`*, `rw_double_reward`) y el intersticial tras ganar según `core/adPolicy.ts` (tests: nunca antes del 8, 1 cada 3 victorias, 90 s, no tras rewarded, sin ads si `adsRemoved`). *El rewarded de monedas diarias se reserva para F2 (la galería ya tiene el regalo diario gratuito).
- **Analytics**: `PostHogAnalytics` (HTTP a `/batch/`, sin SDK, buffer local y reintento) con todos los eventos de §12.2; activo solo si existe `VITE_POSTHOG_KEY`, si no `ConsoleAnalytics`.
- 90 tests en Vitest (reglas, mezclas, secado, solver, generador por filas con mezclas/secado, dificultad, estrellas, economía, adPolicy, cuadros, guardado, niveles a mano/precalculados).

### Verificación

- `npm run lint && npm test && npm run build` en verde. Bundle 1,8 MB.
- E2E con Playwright (renderer Canvas): niveles **1–150** jugados de corrido con la solución del solver (mezclas, secado, intersticial cada 3 victorias desde el 8), sin errores de página. Capturas de galería, nivel, victoria, paleta y ajustes a 1080×1920 y 1080×2400 en `docs/capturas/`, revisadas contra el GDD §9–§10 (frascos de vidrio con borde y reflejo, HUD con Nunito, bandas de color de fondo en 20:9).

### Qué quedó pendiente

- **Testers y embudo (§15 F1.9, §13):** no se puede reclutar ni medir desde esta sesión. Al publicar el link: configurar `VITE_POSTHOG_KEY` como secreto del workflow de Pages, compartirlo con 10–20 testers y medir 7 días; con el embudo por nivel se decide 0 → 1.
- "Un tester nuevo entiende la mezcla sin explicación": el nivel 21 fuerza la mezcla y tras 8 s sin mover brillan los dos frascos; pendiente de validar con personas.
- Encargos procedurales (no a mano); música lo-fi opcional no incluida (ajuste presente, sin pista).
- Push a GitHub: en esta sesión el push devolvió 403 (la app de Claude no tiene acceso al repositorio). Los commits quedan en la rama local `claude/affectionate-gauss-hfrymy`; al reconectar GitHub basta con `git push -u origin claude/affectionate-gauss-hfrymy` y `git push origin HEAD:main` para publicar en Pages.

### Decisiones

Ver `docs/DECISIONES.md` (sección 2026-10-24 F1).

## F1.5 — Ronda para testers · cerrada el 2026-10-28

Objetivo: dejar el Alcance 0 listo para testers (medible, con la mecánica única temprano y aspecto de producto terminado). Sin nada de F2.

### Qué cambió

**Bloque A — Negocio**

- **A1 Analytics remotos:** `PostHogAnalytics` con `posthog-js` (host US), cargado bajo demanda solo si hay `VITE_POSTHOG_KEY`; sin clave cae a `ConsoleAnalytics`. Buffer offline en `localStorage`, reenvío al volver la red con el timestamp original. Sin PII; `distinct_id` = id anónimo del guardado. Sin autocapture, pageviews, grabación, encuestas ni configuración remota. El workflow de Pages lee `secrets.VITE_POSTHOG_KEY` (y la variable opcional `VITE_POSTHOG_HOST`).
- **A2 Curva:** niveles 1–3 a mano; 4–5 con 3 pigmentos; **6 a mano enseña azul+amarillo=verde** (irresoluble sin mezclar; pista de brillo tras 6 s); 7–9 una receta; **10 Encargo**; rojo+amarillo en 14, rojo+azul en 18, el resto en 30/45/60/75/90; **secado enseñado en el 25** (a mano, mecha generosa). 500 niveles regenerados. GDD §4.3, §5.2, §6, §8, §11.1 y §15 actualizados.
- **A3 Secado:** `F = movimientos del frasco en la solución óptima + margen` (`dryingMargin` en `difficulty.json`: +2 hasta el 80, +1 desde el 81; mínimo 4). El solver verifica cada nivel con la mecha puesta. `level_fail{reason: 'dried'}` mide el objetivo del 15–25 %.
- **A4 Primera sesión:** `ads.json.minLevelForRewardedOffers = 5`: antes del 5, sin "Duplicar" ni ofertas de rewarded; ayudas gratis.
- **A5 Compartir:** al completar un cuadro (botón en el marco de la victoria) y tocando un cuadro colgado en la galería. PNG 1080×1350 con wordmark, cuadro enmarcado, título, "Pintado en Pigmento" y la URL; `navigator.share` con archivo o descarga. Evento `share_painting{painting_id, method}`.
- **A6 Idioma:** primer arranque según el dispositivo (es* → español, resto → inglés); luego manda Ajustes. Títulos de cuadros por i18n. Test que falla si una clave existe en un idioma y no en el otro (y si los parámetros `{x}` no coinciden).

**Bloque B — Visual**

- **B1** Frascos hasta 270 px de ancho (antes 200), tablero centrado en el espacio útil entre HUD y barra.
- **B2** Mesa de madera con vetas bajo la última fila y estantes bajo las superiores; sombras suaves hacia abajo-derecha; luz cálida desde arriba a la izquierda + viñeta. Todo generado por código.
- **B3** Pintura por bloques (sin líneas entre capas iguales), gradiente, brillo especular, menisco; ondulación de 200 ms al verter; corcho que cae + destello al completar.
- **B4** Paleta de pintor con test ΔE2000 ≥ 20 entre todos los pares y ≥ 12 con deuteranopia; símbolos por defecto con ≥ 7 pigmentos.
- **B5** Secado: anillo de progreso en la boca, costra que se forma y agrieta; número rojo con pulso solo con ≤ 3.
- **B6** Cuadros en 10 regiones (cielo, sol, nubes, montañas lejanas, montañas, agua, colinas, pradera, árboles, casas); cada victoria revela una con un pincel (600 ms). En el Encargo: firma y el cuadro vuela del caballete a su marco en la galería.
- **B7** Barra de íconos dibujados por código con insignias (trapos restantes, frasco extra), inactivos al 40 %; galería con "Pintar nivel N" primario y Paleta/Regalo secundarios (punto rojo si hay regalo).
- **B8** Wordmark multicolor con gota en la "i" (splash, galería, imagen de compartir); marcos pendientes con "?" y el nivel que los completa; en la paleta, los "?" muestran los colores padres si el jugador ya los vio.

**Correcciones encontradas al verificar:** la mezcla se registraba en el callback de la animación y se perdía si el jugador tocaba antes (ahora se registra con el movimiento); la generación dependía del reloj (ahora es determinista por número de estados); la pista del nivel 6 no aparecía porque al inicio no hay espacio para mezclar (ahora brillan los frascos con los colores de la receta).

### Cómo configurar `VITE_POSTHOG_KEY`

1. Crear una cuenta gratuita en https://us.posthog.com y un proyecto ("Pigmento"). Región **US**.
2. En el proyecto: _Settings → Project → Project API key_ (empieza por `phc_`). Es una clave pública de ingesta, no un secreto de administración.
3. En GitHub: _Settings → Secrets and variables → Actions → New repository secret_, nombre `VITE_POSTHOG_KEY`, valor la clave del paso 2.
4. (Opcional) _Variables → New repository variable_ `VITE_POSTHOG_HOST` si se usa otra región (por defecto `https://us.i.posthog.com`).
5. Relanzar el workflow **Deploy a GitHub Pages** (o hacer push a `main`). Sin la clave, el juego usa `ConsoleAnalytics` con buffer local y no se rompe nada.
6. Desarrollo local: `VITE_POSTHOG_KEY=phc_... npm run dev`.

### Verificación

- `npm run lint && npm test && npm run build` en verde: 100 tests. Bundle 1,8 MB (Phaser 1,48 MB + juego 0,30 MB; `posthog-js` va en un chunk aparte que solo se descarga con clave).
- **Jugado del 1 al 12 desde un guardado vacío** (E2E con Playwright): la mezcla azul+amarillo se descubre en el nivel 6 y el primer cuadro llega al 100 % en el nivel 10; "Colgar en la galería" lleva a la galería y el cuadro vuela a su marco.
- **Eventos verificados en la red** (interceptando `https://us.i.posthog.com/e/` con una clave de prueba, cuerpo gzip): `session_start`, `level_start`, `level_win` con propiedades (`level`, `moves`, `par`, `stars`, `undo_used`, …) y el `distinct_id` anónimo del guardado. El resto de eventos de §12.2 (`session_end`, `level_fail`, `level_quit`, `mix_discovered`, `booster_used`, `ad_shown`, `ad_rewarded`, `daily_gift_claimed`, `painting_completed`, `share_painting`) pasa por el mismo `log()` → buffer → `capture`.
- Capturas a 1080×1920 y 1080×2400 en `docs/capturas/`: galería sin progreso y con un cuadro, nivel 1, nivel 6 (enseñanza de mezcla, con la pista), nivel con secado a 2 movimientos, nivel con 10 frascos, victoria (normal y Encargo), paleta, ajustes, y `compartir_1080x1350.png`. **Antes (F1):** `docs/capturas/antes_f1/`.

### Pendiente

- Configurar el secret `VITE_POSTHOG_KEY` (pasos arriba) y relanzar el deploy.
- Habilitar Pages (Settings → Pages → Source: GitHub Actions) si aún no está: el primer deploy falló por permisos al crear el sitio.
- Reclutar 10–20 testers y medir 7 días: embudo por nivel, % de derrotas en niveles con secado (meta 15–25 %), comprensión de la mezcla en el nivel 6.
- Medir 60 fps en un Android medio real (en este entorno solo hay renderizado por software).

## Ronda 2026-10-30 — jugabilidad, fondo claro y cuadros reales

### Qué se hizo

- **Bug:** deshacer después de pedir el frasco vacío dejaba la pantalla con un frasco que el modelo ya no tenía; lo que se completaba ahí no contaba y el nivel no se ganaba. Corregido (el frasco extra no se puede deshacer).
- **Sin salida:** aviso cuando no quedan movimientos o los colores ya no alcanzan para llenar frascos de 4 (típico tras una mezcla accidental), con deshacer gratis, frasco vacío o empezar de nuevo.
- **Español por defecto** y migración de guardado v1 → v2.
- **Pared clara** en vez del café oscuro.
- **Cuadros reales en la partida:** 15 obras de dominio público. El cuadro de la decena aparece sobre el tablero; cada frasco completado pinta las manchas de su color con un barrido de pincel. Victoria, caballete, marcos y la imagen para compartir usan la obra (con título y autor).

### Verificación

- `npm run lint && npm test && npm run build` en verde (tests nuevos: `deadEnd.test.ts`, `masterpiece.test.ts`, migración en `save.test.ts`).
- Playwright (renderer Canvas): regresión del frasco extra + deshacer + victoria; aviso de sin salida; niveles 2, 6 (mezcla) y 10 (Encargo) jugados con la solución del solver viendo el cuadro pintarse; galería con el cuadro colgado; imagen de compartir.

### Pendiente

- Probar en teléfono real el costo del análisis del cuadro (≈ 0,5 s en escritorio al abrir el primer nivel de cada decena; queda en caché durante la sesión).
- Con 50 decenas y 15 obras, las obras se repiten a partir del nivel 151; agregar más obras a `masterpieces.json` (el workflow las descarga solo).
