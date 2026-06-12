# ARCANA GRID Current Status

最終更新: 2026-06-12

## 確認したリポジトリ状態

- ブランチ: `task-7e-mobile-ui-ux`
- 作業開始時のローカルHEAD: `b6ad431`（Task 7A〜7Dのローカル対戦UI・ハーネス実装を含む履歴）
- ローカルには `origin` remote と `main` ブランチが存在しなかったため、ネットワーク経由の最新main確認はできなかった。
- `AGENTS.md`、`docs/`、Task 7A〜7Dの `/debug/local-match` ローカル対戦UI・ハーネス、既存ゲームエンジンとテストを確認してから実装した。

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
- setup fixtureからの初期配置UI、6体配置、2体リザーバー指定、attack/defense選択、SUBMIT_INITIAL_PLACEMENT送信。
- 両者提出後のデバッグハーネス内first player決定、`startTacticalDuelMatch`実行、MATCH_STARTEDイベント表示、activeフェーズ接続。
- 現在viewerの自分の盤面ユニット選択、サーバー側合法移動候補取得、通常移動/戦闘候補の区別表示、attack/defense選択、MOVE_UNIT実行、DEPLOY_RESERVE、ATTACK_FLAG、CONCEDE_MATCH、イベントログ、setup/active fixtureリセット。
- Task 7E: iPhone縦画面を優先した `/debug/local-match` のモバイルUI・UX改善。上部のコンパクトな対戦ステータス、横スクロールしない8×8盤面、座標表示、候補種別バッジ、旗ダメージメーター、押しやすいattack/defense選択、折りたたみイベントログ/リセット詳細、finished結果パネルを追加。active中の相手伏せカードは位置・裏面だけを安全に表示し、カード名や数値は渡さない。
- Task 7F: 公開URL用ブラウザ内デバッグ対戦状態を追加。`/debug/local-match` は `localStorage` キー `arcana-grid.local-match.v1` に正規デバッグ用MatchState、イベント履歴、viewer/handoffフローを保存し、ブラウザ内ハーネスで既存reducer・開始処理・PlayerMatchView生成を呼ぶ。公開URLではページ表示と操作をサーバーインメモリに依存させず、壊れた保存データやrulesVersion不一致はsetup fixtureへ安全に戻す。

## テスト状況

- 最新確認時点のVitest結果: 20 test files / 352 tests passed。
- 既存テストは `src/lib/project.test.ts`、`tests/unit/game/**/*.test.ts`、`tests/unit/debug/**/*.test.ts` にある。
- 今回の最終確認で以下を実行済み。
  - `npm run typecheck`
  - `npm run lint`（既存の `tests/unit/game/types.test.ts` にwarning 1件あり）
  - `npm run test`
  - `npm run build`
- 開発サーバーで `/debug/local-match?viewer=south` のHTML応答とブラウザ内保存表示をcurlで確認済み。ブラウザ内ハーネスのsetup提出、active復元、移動、戦闘、リザーバー投入、旗攻撃、投了、壊れたJSON、rulesVersion不一致、stale stateVersion、秘密情報ビューはVitestで確認済み。

## 現在の次タスク

- 次タスク: Task 7Fの公開URL用ブラウザ内デバッグ対戦状態の追加後確認、またはオンライン対戦基盤。
- 今回未実装: 戦闘アニメーション、カード画像の本格導入、Supabase/Auth/Database/Realtime/オンライン対戦。

## 未実装項目

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
