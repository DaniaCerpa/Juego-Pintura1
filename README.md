# Pigmento

Puzzle móvil de ordenar pinturas en frascos, mezclando colores según teoría del color. TypeScript + Phaser 3 + Vite, PWA. Especificación en [`docs/GDD.md`](docs/GDD.md); estado del proyecto en [`docs/ESTADO.md`](docs/ESTADO.md).

## Comandos

```bash
npm install
npm run dev       # desarrollo
npm test          # tests de core (Vitest)
npm run lint      # eslint + prettier
npm run build     # build de producción en dist/
npm run levels    # regenera src/data/levels/levels_0001_0500.json
```

`?renderer=canvas` en la URL fuerza el renderer Canvas (respaldo sin WebGL).
