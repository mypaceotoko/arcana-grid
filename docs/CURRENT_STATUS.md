# ARCANA GRID Current Status

最終更新: 2026-06-11

## 確認したリポジトリ状態

- ブランチ: `task-7b-local-move-interaction`
- 作業開始時のローカルHEAD: `1a3131f`（Task 7Aのローカル対戦デバッグ盤面UI実装を含む履歴）
- ローカルには `origin` remote と `main` ブランチが存在しなかったため、ネットワーク経由の最新main確認はできなかった。
- `AGENTS.md`、`README.md`、`docs/`、Task 7Aの `/debug/local-match`、既存ゲームエンジンとテストを確認してから実装した。

## 実装済み機能

- Next.js / React / TypeScript / Tailwind CSS / ESLint / Vitestの基本構成。
- npm scripts: `dev`、`build`、`start`、`lint`、`typecheck`、`test`、`test:watch`。
- tactical_duel v1のルール設定。
- 8×8盤面、座標、盤面占有判定。
- Match / Player / Unit / Card / Visibility / Flagなどのルールエンジン型。
- 初期配置エリア、旗エリア、旗ダメージ。
- 初期配置提出、両者提出後の明示先手による対戦開始。
- 4種類のmovementTypeと、line / offset movementRuleによる合法移動計算。
- MOVE_UNIT、ATTACK_FLAG、DEPLOY_RESERVE、SUBMIT_INITIAL_PLACEMENT、CONCEDE_MATCHのAction型とreducer処理。
- 攻撃表示・防御表示に応じた戦闘解決。
- currentDefenseの減少、撃破、イベント生成。
- 初回移動・被攻撃による公開処理。
- プレイヤー別ビューでのhidden / revealed / owner_full切り替え。
- 全滅、旗破壊、投了による終了処理。
- stateVersionとexpectedStateVersionによる古い行動の拒否。
- 秘密情報が相手ビューや主要イベントへ漏れないことを確認するテスト。
- `/debug/local-match` の安全なPlayerMatchViewベース盤面表示。
- `/debug/local-match` のデバッグ専用インメモリローカル対戦ハーネス。
- 現在viewerの自分の盤面ユニット選択、サーバー側合法移動候補取得、通常移動/戦闘候補の区別表示、attack/defense選択、MOVE_UNIT実行、イベントログ、fixtureリセット。

## テスト状況

- 最新確認時点のVitest結果: 20 test files / 338 tests passed。
- 既存テストは `src/lib/project.test.ts`、`tests/unit/game/**/*.test.ts`、`tests/unit/debug/**/*.test.ts` にある。
- 今回の最終確認で以下を実行済み。
  - `npm run typecheck`
  - `npm run lint`（既存の `tests/unit/game/types.test.ts` にwarning 1件あり）
  - `npm run test`
  - `npm run build`
- 開発サーバーで `/debug/local-match?viewer=south`、状態取得、移動候補取得、MOVE_UNIT、リセット、HTML/JSONの未公開カード詳細混入なしをcurlで確認済み。

## 現在の次タスク

- 次タスク: Task 7C以降のローカル対戦UI拡張。
- 今回未実装: DEPLOY_RESERVE操作、ATTACK_FLAG操作、CONCEDE_MATCH操作、初期配置操作、対戦開始操作、戦闘アニメーション、カード画像の本格導入、Supabase/Auth/Database/Realtime/オンライン対戦。

## 未実装項目

- ローカル対戦UIの初期配置、リザーブ配備、旗攻撃、投了操作。
- Supabase基盤、migration、RLS、サーバー側ルール実行。
- オンライン2人対戦、リアルタイム同期、再接続。
- カードマスタと画像管理。
- Vercel公開設定と本番確認。
- disconnect時の勝敗詳細ルール。

## 既知のwarning・注意事項

- npm scripts実行時に `npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.` が表示される。各チェック自体は成功する。
- `npm run lint` で既存の `tests/unit/game/types.test.ts` に `@typescript-eslint/no-unused-expressions` warningが1件表示される。今回の変更によるerrorはない。
- READMEには「ゲームルールはまだ実装していません」という古い説明が残っている。
- remoteが未設定のため、この環境だけでは最新mainのfetch / pullは実行できない。
