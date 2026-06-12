# ARCANA GRID Current Status

最終更新: 2026-06-12

## 確認したリポジトリ状態

- ブランチ: `task-8a-supabase-foundation`
- 作業開始時のローカルHEAD: `db9d628`（Task 7Eのローカル対戦モバイルUI改善までを含む履歴）
- ローカルには `origin` remote と `main` ブランチが存在しなかったため、ネットワーク経由の最新main fetch/checkoutはできなかった。
- `AGENTS.md`、`README.md`、`docs/`、既存ゲームエンジン、`/debug/local-match`、既存テストを確認してからTask 8Aを実装した。

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
- iPhone縦画面を優先した `/debug/local-match` のモバイルUI・UX改善。active中の相手伏せカードは位置・裏面だけを安全に表示し、カード名や数値は渡さない。
- Task 8A: Supabase導入準備と初期データベース基盤。
  - 公式Next.js SSR構成に基づき `@supabase/supabase-js` と `@supabase/ssr` を依存関係へ追加。
  - `.env.example` に `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`ENABLE_DEBUG_PAGES` を整理。
  - ブラウザ用、Server Component / Route Handler用、service role管理用のSupabaseクライアントを分離。
  - 管理用クライアントは `server-only` とサーバー専用環境変数検証を使い、Client Componentからのimportを避ける構成。
  - Supabase未設定でも通常buildを壊さないよう、環境変数不足はクライアント作成時に明示的に失敗する構造。
  - `supabase/config.toml`、初期migration、`supabase/seed.sql` を追加。
  - `profiles`、`characters`、`card_variants`、`user_cards`、`game_rule_sets` の主キー、外部キー、UNIQUE、CHECK、index、timestamps、updated_at triggerを設計。
  - 全テーブルでRLSを有効化し、profiles本人更新、active master読み取り、本人user_cards読み取り、master/user_cardsクライアント書き込み禁止方針を追加。
  - Auth新規ユーザー作成時のprofile自動作成triggerを追加。
  - `tactical_duel.v1` のルール確認用seedを追加。大量カードseedは未実装で、最小debug character/cardのみ。
  - DB型生成先と `npm run supabase:types` を整備。実Supabase未接続のため生成型は手書きしていない。
  - `docs/SUPABASE_SETUP.md` とREADMEに接続・migration・reset/seed・型生成・Vercel env・service role注意を追記。

## テスト状況

- 既存テストは `src/lib/project.test.ts`、`tests/unit/game/**/*.test.ts`、`tests/unit/debug/**/*.test.ts`、Task 8A追加の `tests/unit/lib/**/*.test.ts` にある。
- Task 8Aでは、環境変数検証、ブラウザ/サーバー/adminクライアント分離、migration/RLS/profile trigger/seed内容の静的確認テストを追加。
- 最終確認では以下を実行する。
  - `npm install`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- Supabase CLIが利用可能なら `npm run supabase:reset` も確認する。利用できない場合は理由を記録する。

## 現在の次タスク

- 次タスク候補: Task 8B以降のAuth UI、オンライン対戦用サーバー権威型API/DB設計、ルーム作成/参加、Realtime/Presence検討。

## 未実装項目

- ログイン・新規登録UI。
- ルーム作成。
- ルーム参加。
- 対戦状態テーブル。
- Realtime。
- Presence。
- オンライン対戦。
- デバッグ状態のSupabase保存。
- カード画像のStorage移行。
- ランク・報酬・ガチャ。
- 本番Supabaseへのmigration適用。
- Vercel環境変数の実設定。
- disconnect勝利ルールの確定。型には暫定理由があるが、詳細ルールは未確定。

## 注意事項

- ゲームルールをReactコンポーネントへ直接書かない。
- ルールエンジンをUI・Next.js・Supabaseから分離する。
- 各対戦は `game_mode` と `rules_version` を持つ。
- クライアントは操作意図だけを送り、対戦結果はサーバー側で決定する。
- 相手の伏せカード情報を相手クライアントへ渡さない。
- `service role key` をクライアントへ置かない。
- Supabase schema変更はmigrationで行う。
