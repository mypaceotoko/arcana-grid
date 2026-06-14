# ARCANA GRID Current Status

最終更新: 2026-06-14

## 確認したリポジトリ状態

- ブランチ: `claude/supabase-setup-env-check-hohudd`（`origin/main` の PR #30 マージ済みコミットを起点に作業）。
- `AGENTS.md`、`docs/SUPABASE_PLAN.md`、`docs/CURRENT_STATUS.md`、`supabase/migrations/0001_initial_schema.sql`、`.env.example`、`src/lib/supabase/{config,client,server}.ts`、`package.json`、Next.js/Vercel構成を確認してから実装した。

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
- Task 7G: ローカル対戦UIにアクション再生とviewer/turn分離を追加。`applyAction` はアクション後にviewerを相手手番へ自動切替せず、行動したviewerのまま結果イベント(`lastActionEvents`)を返す。UIは行動前PlayerMatchViewを保持し、`playback.ts`/`playback-view.ts`でGameEventからplayback step・frameを生成して、通常移動の1マスずつ進行、戦闘(公開→戦闘→防御値変化→消滅→前進/帰還→ターン交代/勝敗)、リザーバー投入(選択→出現→stance)、旗攻撃(攻撃強調→中央2マス点滅→damage→勝敗)を順番に再生する。再生中は盤面操作を停止し、スキップボタンを用意。再生完了後にhandoff画面(「Xの行動が終了しました／次はYの手番／端末をYへ」)を表示し、「Yの手番を始める」ボタンでのみviewerを切替えて盤面を反転する。未公開カードの数値・名前はplayback/result/handoffへ出さない。ダークファンタジー/ネオン発光基調へUIをブラッシュアップ(背景の魔法陣グラデーション・グリッド、盤面・再生ステージ・handoffのglow)。
- Task S1: Supabase project setup & env check。`src/lib/supabase/config.ts` に `isSupabaseUrlConfigured()` / `isSupabaseAnonKeyConfigured()` / `isSupabaseServiceRoleKeyConfigured()` / `getSupabaseConfigStatus()` を追加し、各環境変数の有無をbooleanのみで安全に判定できるようにした（値そのものは返さない）。`/debug/supabase`（`src/app/debug/supabase/page.tsx` + `view.ts`）でその設定状態（public URL / anon key / service role / client config ready / server config ready）を表示し、未設定時は「Supabase環境変数が未設定です。Vercelまたは.env.localに設定してください。」を表示する。`/api/debug/supabase/health`（`src/app/api/debug/supabase/health/route.ts`）はサーバー側のみで `configured` / `serverConfigured` / `canCreateClient` / `canReachSupabase` / `errorCode` / `safeMessage` を返す。未設定時はネットワークアクセスせず安全なJSONを返す。設定済みの場合のみ既存の `createSupabaseBrowserClient` / `createSupabaseServiceRoleClient`（`src/lib/supabase/client.ts` / `server.ts`、`@supabase/supabase-js`未導入のため現状は失敗扱い＝`canCreateClient: false`）と、`${url}/auth/v1/health` への軽い `fetch` で到達確認を行う。anon key・service role keyの値やエラー詳細はレスポンスに含めない。両ページ/APIとも `isDebugApiEnabled()`（`NODE_ENV !== "production" || ENABLE_DEBUG_PAGES === "true"`）でガードし、`/debug/local-match` と同じ方針。reducer・ゲームルール・`/debug/local-match` は変更していない。

## テスト状況

- 最新確認時点のVitest結果: 25 test files / 399 tests passed（Task S1 で47テスト追加）。
- 既存テストは `src/lib/project.test.ts`、`tests/unit/game/**/*.test.ts`、`tests/unit/debug/**/*.test.ts`、`tests/unit/lib/**/*.test.ts` にある。
- 今回追加したテスト:
  - `tests/unit/lib/supabase-config.test.ts`: 新規ヘルパー（`isSupabaseUrlConfigured` 等、`getSupabaseConfigStatus`）が未設定/設定済みそれぞれで正しいbooleanを返し、service role key の値が`getSupabaseConfigStatus()`の出力に含まれないことを確認。
  - `tests/unit/debug/supabase-debug-view.test.ts`: `/debug/supabase` の表示用ビューモデルが未設定/設定済みで正しい行・メッセージを返すこと、service role key の値が出力に含まれないことを確認。
  - `tests/unit/debug/supabase-health-route.test.ts`: `/api/debug/supabase/health` が未設定時に `fetch` を呼ばず安全なJSONを返すこと、設定済みでも anon key・service role key の値やエラー詳細を含まないことを確認（`fetch`はモック）。
- 今回の最終確認で以下を実行済み（`npm install` 後）。
  - `npm run typecheck`
  - `npm run lint`（既存の `tests/unit/game/types.test.ts` にwarning 1件あり、今回の変更によるものではない）
  - `npm run test`
  - `npm run build`（`/debug/supabase`、`/api/debug/supabase/health` を含むルートが生成されることを確認）
- 開発サーバーで `/debug/supabase` と `/api/debug/supabase/health` を、環境変数未設定時・偽のSupabase環境変数設定時の両方でcurl確認済み。未設定時は両方とも安全な「未設定」表示/JSONを返し、設定時（偽URL）は `canReachSupabase: false` / `errorCode: "SUPABASE_UNREACHABLE"` を返し、レスポンスに偽キーの値が含まれないことを確認した。

## 現在の次タスク

- Task S1（Supabase project setup & env check）のコード側土台が完了。実際の本番Supabaseプロジェクト作成・キー設定・`.env.local`/Vercel環境変数設定はユーザーが手動で行う（手順は `docs/SUPABASE_PLAN.md` セクション13）。
- 次タスク: Task S2（Create online match room）。`docs/SUPABASE_PLAN.md` のTask一覧を正とする。
- 今回未実装: `@supabase/supabase-js` のインストール、Supabase本番接続の実環境確認、Auth、Realtime、オンライン対戦画面、ルーム作成/参加、`match_actions`/`match_events`への書き込み。

## 未実装項目

- `@supabase/supabase-js` のインストールと、実SDKを使った `canCreateClient`/`canReachSupabase` の確認。
- Supabase基盤の本番適用（migration実行、RLS有効化）、サーバー側ルール実行。
- オンライン2人対戦、リアルタイム同期、再接続。
- カードマスタと画像管理。
- Vercel公開設定と本番確認。
- disconnect時の勝敗詳細ルール。

## 既知のwarning・注意事項

- npm scripts実行時に `npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.` が表示される。各チェック自体は成功する。
- `npm run lint` で既存の `tests/unit/game/types.test.ts` に `@typescript-eslint/no-unused-expressions` warningが1件表示される。今回の変更によるerrorはない。
- READMEには「ゲームルールはまだ実装していません」という古い説明が残っている。
- `@supabase/supabase-js` は未インストールのため、env設定済みでも `/api/debug/supabase/health` の `canCreateClient` は現状常に `false`（`errorCode: "SUPABASE_CLIENT_UNAVAILABLE"` または `SUPABASE_UNREACHABLE`）。SDK導入後に再確認が必要。
