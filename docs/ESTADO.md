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
- E2E con Playwright (renderer Canvas, ver `docs/DECISIONES.md`): niveles 1–50 jugados de corrido con la solución del solver, sin errores de consola, guardado avanzando en cada victoria; capturas en `docs/capturas/` a 1080×1920 y 1080×2400 (galería, nivel, victoria, ajustes).
- 60 fps: no hay `update()` por frasco; frascos y botones son sprites de texturas generadas una vez; partículas con tope global. No se pudo medir en un Android físico desde este entorno (pendiente de confirmar en dispositivo).

### Qué quedó pendiente / notas

- Paleta de mezclas, estrellas, monedas y cuadros procedurales son de F1.
- Sonidos CC0: se usan sonidos sintetizados (decisión registrada); se pueden sustituir sin tocar escenas.
- Encargos (10, 20, …) son procedurales, no hechos a mano.
- Medir fps en un Android medio real y probar en iPhone (Safari) con el link público.

### Decisiones

Ver `docs/DECISIONES.md` (sección 2026-10-24 F0).
