import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**/*']
  },
  {
    files: ['firestore.rules'],
    plugins: {
      '@firebase/security-rules': firebaseRulesPlugin,
    },
    rules: {
      ...firebaseRulesPlugin.configs.recommended.rules,
    },
  },
];
