# ♾️ Infinitoken

**Fais plus de travail avec le même quota d'IA.**

Infinitoken est un kit que tu branches sur n'importe quel projet. Il apprend à ton assistant de code (Claude Code, Codex, Cursor, Gemini CLI, Copilot…) à **ne gaspiller aucun token** : pas d'exploration au hasard, pas de fichiers relus, pas de logs géants, pas de blabla.

> Infinitoken ne réduit **jamais** la réflexion de l'IA sur les problèmes difficiles. Il supprime tout le reste.

## Ce que ça fait (version actuelle)

| Fichier | Rôle | Compatible |
|---|---|---|
| `AGENTS.md` | Règles anti-gaspillage pour l'IA | Codex, Cursor, Gemini CLI, Copilot, Claude… |
| `CLAUDE.md` | Importe `AGENTS.md` + règles propres à Claude Code | Claude Code |
| `.infinitoken/memory.md` | Décisions durables du projet (stack, conventions, interdits) | Toutes |
| `.infinitoken/session.md` | Résumé court de la dernière session | Toutes |
| `/save` | Sauvegarde la session dans `session.md` | Claude Code |
| `/resume` | Reprend le travail sans tout redécouvrir | Claude Code |

## Installation

```bash
git clone https://github.com/oumabarr6-eng/infinitoken
./infinitoken/install.sh /chemin/vers/ton/projet
```

L'installateur n'écrase rien : si ton projet a déjà un `AGENTS.md` ou un `CLAUDE.md`, les règles sont ajoutées à la fin (une seule fois).

Ensuite, remplis `.infinitoken/memory.md` avec ta stack et tes conventions.

## Utilisation avec Claude Code

1. Début de session : `/resume`
2. Tu travailles normalement.
3. Contexte trop long ? `/save`, puis `/clear`, puis `/resume`.
4. Fin de session : `/save`

Des sessions courtes avec un bon résumé coûtent beaucoup moins cher qu'une session géante.

## Pourquoi les règles sont en anglais ?

Les fichiers lus par l'IA sont relus à **chaque** session. En anglais, le même texte prend moins de tokens qu'en français. Tu peux bien sûr continuer à parler français à l'IA.

## Feuille de route

- [x] **1. Règles + mémoire**
- [ ] 2. Carte du code (`CODEMAP.md` générée automatiquement)
- [ ] 3. Hooks qui filtrent les sorties (tests, installs, logs)
- [ ] 4. Sous-agents sur des modèles moins chers + commandes `/fix`, `/feature`, `/review`
- [ ] 5. Benchmark avec et sans Infinitoken
- [ ] 6. Installateur `npx infinitoken init`

## Ce qu'Infinitoken ne fait pas

- Il ne change pas les limites officielles de ton abonnement : elles sont fixées par le fournisseur de l'IA.
- Il ne force pas l'IA à moins réfléchir : ça dégraderait la qualité et coûterait plus en corrections.
- Le gain dépend du projet. Les chiffres réels viendront avec le benchmark (étape 5).

## Licence

MIT
