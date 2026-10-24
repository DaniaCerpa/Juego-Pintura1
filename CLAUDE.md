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
