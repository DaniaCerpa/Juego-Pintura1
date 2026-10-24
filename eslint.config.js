import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      // core es TS puro: sin Phaser, DOM ni Capacitor
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'phaser',
                '@capacitor/*',
                '../scenes/*',
                '../services/*',
                '../state/*',
                '../objects/*',
                '../ui/*',
              ],
              message: 'src/core/ no importa nada fuera de core/ y data/.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Usar core/rng.ts (PRNG sembrado).' },
      ],
    },
  },
);
