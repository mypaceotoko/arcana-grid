# ARCANA GRID Current Status

最終更新: 2026-06-11

## 確認したリポジトリ状態

- ブランチ: `docs-persist-development-plan`
- 作業開始時のローカルHEAD: `822352460b606cf3d5be0642038c932c935aeb7b`
- ローカルには `origin` remote と `main` ブランチが存在しなかったため、ネットワーク経由の最新main確認はできなかった。
- この更新はドキュメント整備のみ。ゲームロジック、UI、依存関係は変更しない。

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

## テスト状況

- 最新確認時点のVitest結果: 18 test files / 325 tests passed。
- 既存テストは `src/lib/project.test.ts` と `tests/unit/game/**/*.test.ts` にある。
- 今回の最終確認では以下を実行する。
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`

## 現在の次タスク

- 次タスク: Task 7A。
- 目的: ローカル対戦UIの最小設計を行い、画面構成・操作フロー・ルールエンジン呼び出し境界を文書化する。
- 完了条件: UI実装前に、iPhone縦画面優先の画面構成と、UIが送る操作意図・受け取る公開ビューの境界が明確になっている。

## 未実装項目

- ローカル対戦UI。
- Next.js画面からのルールエンジン連携。
- Supabase基盤、migration、RLS、サーバー側ルール実行。
- オンライン2人対戦、リアルタイム同期、再接続。
- カードマスタと画像管理。
- Vercel公開設定と本番確認。
- disconnect時の勝敗詳細ルール。

## 既知のwarning・注意事項

- npm scripts実行時に `npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.` が表示される。各チェック自体は成功する。
- `npm run build` 実行時にNext.jsが `tsconfig.json` / `next-env.d.ts` の候補更新を行う場合がある。今回のドキュメント整備ではコード・設定変更を含めないため、生成差分は確認後に戻した。
- READMEには「ゲームルールはまだ実装していません」という古い説明が残っている。今回の対象は指定された開発ドキュメント整備のみのため、README本文は変更していない。
- remoteが未設定のため、この環境だけでは最新mainのfetch / pullは実行できない。
