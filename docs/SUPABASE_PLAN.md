# ARCANA GRID — Supabase 導入計画（設計・準備）

最終更新: 2026-06-14

この文書は、ARCANA GRID をオンライン対戦へ進めるための **Supabase 導入の設計と準備** をまとめます。
今回のスコープは「安全に進むための土台作り」であり、本格的なオンライン対戦実装・本番接続・Auth・Realtime の実装は **まだ行いません**。

ゲームルール、reducer、movement / combat / victory / flag / reserve の確定ロジックは変更しません。

関連ファイル:

- 設計スキーマ（未適用）: `supabase/migrations/0001_initial_schema.sql`
- 環境変数サンプル: `.env.example`
- 最小クライアント雛形: `src/lib/supabase/config.ts` / `client.ts` / `server.ts`

---

## 1. 現状調査メモ（既存コードの確定事実）

ルールエンジンは UI / Next.js / Supabase から分離されており、Supabase 化はこの境界をそのまま使えます。

### MatchState（`src/game/core/state.ts`）

正規の対戦状態。`id` / `gameMode` / `rulesVersion` / `boardSize` / `phase`（`waiting` `setup` `active` `finished` `aborted`）/ `players` / `units` / `unitVisibilities` / `currentTurnPlayerId` / `turnNumber` / `stateVersion` / `winnerPlayerId` / `winReason` を持つ。
**`units` と `unitVisibilities` は相手の伏せカード情報を含む**ため、クライアントへそのまま渡してはいけない。

### PlayerMatchView（`src/game/modes/tactical-duel/player-view.ts`）

`buildPlayerMatchView({ state, viewerId, cardBackKey })` が viewer 視点の安全なビューを返す。
未公開ユニットは `HiddenUnitView`（`cardBackKey` のみ、カード詳細なし）、公開ユニットは `RevealedUnitView`。
クライアントへ渡すのは常に **この PlayerMatchView**（さらに `/debug/local-match` では `sanitizePlayerMatchView` で reserve 内容なども削っている）。

### GameAction（`src/game/core/actions.ts`）

`MOVE_UNIT` / `ATTACK_FLAG` / `DEPLOY_RESERVE` / `SUBMIT_INITIAL_PLACEMENT` / `CONCEDE_MATCH`。
いずれも `actionId` / `matchId` / `actorId` / `expectedStateVersion` を持つ操作意図。座標・unitId・stance のみで、秘密のカード数値は含まない。

### GameEvent / GameEventPayload（`src/game/core/events.ts`）

`UNIT_MOVED` `UNIT_REVEALED` `FLAG_ATTACKED` `COMBAT_RESOLVED` `UNIT_DEFEATED` `DEFENSE_CHANGED` `FLAG_DAMAGED` `RESERVE_DEPLOYED` `INITIAL_PLACEMENT_SUBMITTED` `TURN_CHANGED` `MATCH_CONCEDED` `MATCH_FINISHED` `MATCH_STARTED`。
**カード名や baseAttack 等の未公開数値は含まない**（`COMBAT_RESOLVED` の数値は、戦闘で公開された範囲のみ）。`/debug/local-match` のアクション再生はこのイベント列だけで成立している＝オンラインの Realtime 再生にもそのまま使える。

### reducer / 開始処理

- `applyTacticalDuelAction({ state, config, action })` → `Result<{ state, events }, RuleError>`。入力 state を破壊せず、新 state と GameEvent 列を返す。
- `startTacticalDuelMatch({ state, firstPlayerId, expectedStateVersion, config })` → 両者提出後に active へ遷移し `MATCH_STARTED` を返す。
- いずれも純粋関数。サーバー権威の実行口（service role）からそのまま呼べる。

### stateVersion / expectedStateVersion

成功した行動は `stateVersion` を +1 する。`expectedStateVersion !== stateVersion` の行動は `STALE_STATE_VERSION` で拒否される（`reducer.ts` の `validateCommonAction`）。
→ オンラインの楽観ロック（同時操作防止）にそのまま使える。

### viewer と currentTurnPlayerId

- `currentTurnPlayerId`: ゲーム上の現在手番（正規 state の値）。
- viewer: その端末で見ているプレイヤー。`/debug/local-match` では両者を **分離済み**（前タスク）で、行動後も viewer を自動切替せず、handoff で明示的に切り替える。
- オンラインでは「viewer = 認証ユーザー / ゲスト席」に固定され、相手の手番でも自分視点の PlayerMatchView を見続ける。ローカルの handoff はオンラインでは不要になる（同じ端末を渡さないため）。

### secret 情報保護の現方針

- 正規 MatchState を UI へ渡さない。常に PlayerMatchView 経由。
- 相手の `hidden` ユニットは `cardBackKey` のみ。
- CSS や React で隠すだけの実装は禁止（`AGENTS.md`）。
- `/debug/local-match` のテストは、JSON 文字列に未公開カード名・数値が出ないことを検証している。

### localStorage debug harness の保存形式（`src/app/debug/local-match/browser-state.ts`）

`localStorage` キー `arcana-grid.local-match.v1` に `{ version, state: MatchState, events: GameEventPayload[], flow: { viewerSide, handoffAcknowledged } }` を保存。
ブラウザ内で reducer・開始処理・PlayerMatchView 生成を呼ぶ「サーバーの代役」になっている。
→ オンライン版は、この harness の責務（state 保持・action 適用・view 生成）を **Supabase + サーバー実行口** へ置き換える形になる。

---

## 2. Supabase を使う目的

- 2 人が別端末・別ブラウザから同じ対戦を進められるようにする。
- 対戦結果を **サーバー権威** で決定し、相手の伏せカード情報を相手クライアントへ送らない。
- 対戦状態・行動・イベントを永続化し、再接続・観戦・履歴の土台にする。
- 将来の Auth / カード所持 / デッキ / ランキングの基盤にする。

---

## 3. 最初に作るオンライン対戦 MVP

- ルールセットは `tactical_duel.v1` のみ。
- 1 対戦 = 2 席（north / south）。
- **ゲスト対戦を想定**（`match_players.user_id` は nullable、`guest_name` で識別）。
- フロー: 部屋作成 → 相手参加 → 両者初期配置提出 → active → 交互行動 → 終了。
- クライアントは **操作意図（GameAction）だけ** を送る。サーバーが reducer を適用し、PlayerMatchView と GameEvent を配信する。
- 表示はローカル対戦 UI を流用（PlayerMatchView ベース、アクション再生は GameEvent ベース）。

---

## 4. 今はやらないこと

- 本番 Supabase プロジェクトへの接続 / 実キーの追加。
- Auth 実装、Realtime 実装、オンライン対戦画面実装。
- RLS の実環境適用（本文書はポリシー方針のみ）。
- reducer / ゲームルールの変更。
- `localStorage` debug harness の削除、`/debug/local-match` の破壊的変更。
- カード画像追加、カードマスタ、デッキ、ランキング。
- `@supabase/supabase-js` のインストール（雛形は未導入でも build が壊れない設計）。

---

## 5. DB テーブル案

詳細は `supabase/migrations/0001_initial_schema.sql`（**設計のみ・未適用**）。要点:

| テーブル | 役割 | 重要点 |
| --- | --- | --- |
| `profiles` | 認証ユーザー 1 行 | `id = auth.users.id`。ゲストは行を持たない。 |
| `matches` | 正規対戦レコード | `match_state_json`(正規 MatchState=秘密含む) は **サーバー専用**。`state_version` で楽観ロック。 |
| `match_players` | 1 対戦 2 行(north/south) | `user_id` nullable(ゲスト可)、`guest_name` nullable。 |
| `match_actions` | 行動意図の追記ログ | `accepted` / `rejection_code` は **サーバーのみ** が設定。 |
| `match_events` | 解決済み GameEvent ログ | 公開安全情報のみ。Realtime 再生のソース。 |

`matches`: `id` / `mode` / `status` / `rules_version` / `current_turn_player_id` / `state_version` / `match_state_json` / `created_at` / `updated_at` / `finished_at`。
`match_players`: `id` / `match_id` / `player_slot` / `user_id?` / `guest_name?` / `joined_at`。
`match_actions`: `id` / `match_id` / `player_id` / `action_type` / `expected_state_version` / `payload_json` / `created_at` / `accepted` / `rejection_code?`。
`match_events`: `id` / `match_id` / `state_version` / `event_type` / `payload_json` / `created_at`。

---

## 6. RLS 方針

全テーブルで RLS を有効化。**service role key（サーバー専用）だけが RLS をバイパス** し、`match_state_json` / `match_events` / `state_version` / `accepted` / `rejection_code` を書く。

- `profiles`: 自分の行のみ select/update（`id = auth.uid()`）。
- `matches`: **`match_state_json` をクライアントへ出さない**。クライアント select はオフにしてサーバー endpoint 経由で view を返すか、`match_state_json` を除いた列限定 VIEW のみ公開する。参加者判定は `match_players` に自分の `user_id` がある対戦のみ。
- `match_players`: 同一対戦の参加者は両席を select 可。insert は作成/参加時にサーバー（service role）が行う（ゲストの無 `user_id` 着席のため）。
- `match_actions`: 参加者は自分の意図のみ insert（`with check` で `player_id` の所有者が `auth.uid()`）。select は同一対戦の参加者。`accepted`/`rejection_code` の update・delete はクライアント拒否（サーバーのみ）。
- `match_events`: 参加者は自分の対戦の events を select 可。insert/update/delete はクライアント拒否（サーバーのみ追記）。
- **ゲスト**: `user_id = null` のため `auth.uid()` では認可できない。MVP のゲスト対戦は、推測困難な match/session トークンを使って **サーバー endpoint（service role）が仲介** する。RLS は認証ユーザーを守り、ゲストアクセスはサーバーが強制する。

---

## 7. Realtime 方針

- クライアントは `match_events`（および `matches` の列限定 view）の **自分の対戦行** を購読する。
- 新しい `match_events` 行（GameEvent）が来たら、`/debug/local-match` と同じ playback でアニメーション再生し、最後に最新 PlayerMatchView へ反映する。
- **Realtime で正規 MatchState を流さない**。流すのは公開安全な GameEvent と、必要なら列限定のメタ情報のみ。各クライアントの盤面は、サーバーが返す自分視点の PlayerMatchView から再構成する。
- 相手の手番中も viewer は固定（自分視点）。ローカルの handoff はオンラインでは不要。

---

## 8. 保存・生成方針

### MatchState 保存

- 正規 MatchState は `matches.match_state_json`（jsonb）に 1 行で保持。**サーバー専用列**。
- 更新は service role のみ。`state_version` を同時に +1。

### GameAction 保存

- クライアントは意図を `match_actions` に insert（または endpoint へ送信）。`expected_state_version` を必ず付ける。
- サーバーは reducer で検証 →成功なら `accepted = true`、失敗なら `accepted = false` + `rejection_code`（`RuleError.code`）。

### GameEvent 保存

- reducer が返した GameEvent 列を `match_events` に **順番に** 追記（`state_version` 付き）。
- これが Realtime 配信と再接続時のリプレイ元になる。

### stateVersion による同時操作防止（楽観ロック）

1. クライアントは現在の `state_version` を `expected_state_version` として行動を送る。
2. サーバーは `matches.state_version = expected_state_version` を条件に **条件付き更新**（または行ロック後に reducer 適用）。
3. 不一致なら `STALE_STATE_VERSION` で拒否（reducer の既存挙動と一致）。
4. 成功時のみ `state_version` を進め、events を追記。
→ 2 人が同時に送っても、片方だけが確定し、もう片方は安全に弾かれる。

### PlayerMatchView の生成方針

- サーバー（service role）が `match_state_json` から `buildPlayerMatchView({ state, viewerId, cardBackKey })` を呼び、要求者の席に対応する **viewer 視点ビュー** を生成して返す。
- `/debug/local-match` の `sanitizePlayerMatchView` 相当の追加サニタイズ（reserve 内容の秘匿など）も同じ方針で適用する。
- クライアントは正規 state を一切受け取らない。

### 未公開情報を漏らさない方針

- `match_state_json` はクライアント可読 RLS を付けない（サーバー専用）。
- 配信・購読は GameEvent と viewer 視点ビューのみ。
- 既存テストと同様、配信ペイロードに未公開カード名・数値が出ないことをサーバー側テストで検証する。

---

## 9. localStorage debug harness との住み分け

- `/debug/local-match`（ブラウザ内 harness）は **そのまま残す**。1 端末で両者を切り替えるローカル検証用。
- オンライン版は別ルート（例: `/play` 系）として新設し、harness の責務を Supabase + サーバー実行口へ置き換える。
- ルールエンジン（reducer / 開始処理 / PlayerMatchView 生成）は両者で **共通のまま** 使う。
- debug harness は削除しない。オンライン実装中もルール挙動の確認・再現に使う。

---

## 10. 将来拡張の方針

- **Auth**: `profiles` を `auth.users` に紐付け済み。匿名→メール/OAuth へ段階導入。ゲスト席を後からユーザーへ昇格できる設計。
- **カード所持**: `user_cards`（user_id × card_id × 枚数）を追加。ルール数値は単一マスタ（`cards`）から参照（`AGENTS.md` の「数値を重複ハードコードしない」に従う）。
- **デッキ**: `decks` / `deck_cards`。対戦作成時にデッキ ID を参照し、サーバーが初期ユニットを構築。
- **ランキング**: `match_results` から集計（`matches.finished_at` / `winnerPlayerId`）。MMR は別テーブルで管理。

---

## 11. 次にやるべき Task（段階別 PR）

| Task | 目的 | 完了条件 |
| --- | --- | --- |
| S1 | Supabase project setup & env check | 実プロジェクト作成、`.env.local` 設定、`@supabase/supabase-js` 導入、`isSupabaseConfigured()` で接続前提を確認。env 未設定でも build が通ることを維持。 |
| S2 | Create online match room | サーバー endpoint で `matches` + 2 `match_players`(自席) を作成。setup fixture 相当の初期 MatchState を保存。ゲスト席対応。 |
| S3 | Join match room | 招待/トークンで相手が空席へ着席。両席揃いを検出。 |
| S4 | Persist MatchState with optimistic stateVersion | 行動 endpoint: `expected_state_version` で楽観ロック→ reducer 適用→ `match_state_json`/`state_version` 更新、`match_actions`/`match_events` 追記。`STALE_STATE_VERSION` 拒否を確認。 |
| S5 | Realtime match subscription | クライアントが `match_events`(と列限定 view) を購読し、GameEvent 再生で盤面更新。 |
| S6 | Online PlayerMatchView generation | サーバーが viewer 視点ビューを返す endpoint。秘密情報が配信に出ないことをテスト。 |
| S7 | Auth & user-owned cards | 匿名/正式 Auth、`profiles`、`user_cards`/`decks`、対戦作成へデッキ参照。 |

---

## 12. セキュリティ注意（再掲）

- `SUPABASE_SERVICE_ROLE_KEY` は **サーバー専用**。`NEXT_PUBLIC_` を付けない。クライアントコード（Client Component）へ import しない。`src/lib/supabase/server.ts` からのみ使う。
- 実キーは絶対にコミットしない（`.env*` は `.env.example` を除き gitignore 済み）。
- スキーマ変更は migration で行い、RLS を有効化してからクライアント可読列を最小化する。

---

## 13. Task S1: 本番 Supabase プロジェクトのセットアップ手順（手動）

Task S1 では、コード側に「環境変数が設定されている場合だけ安全に接続確認できる」土台を追加した。
**実際の Supabase プロジェクト作成・キーの設定はユーザーが手動で行う。** 手順は以下のとおり。

1. [Supabase](https://supabase.com/) で新規プロジェクトを作成する。
2. プロジェクトの SQL Editor で `supabase/migrations/0001_initial_schema.sql` の内容を実行する（テーブル・enum・RLS 設計のコメントを含む DDL）。
3. Project Settings > API から **Project URL** と **anon public key** を取得する。
4. Project Settings > API から **service_role key** を取得する。この値はサーバー専用であり、ブラウザに渡してはいけない。
5. ローカル開発用に、リポジトリルートの `.env.local`（gitignore 済み・コミット禁止）に以下を設定する。

   ```bash
   # .env.local （本物の値はコミットしないこと）
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=ey... (anon public key)
   SUPABASE_SERVICE_ROLE_KEY=ey... (service_role key, サーバー専用)
   ```

6. Vercel の Project Settings > Environment Variables に同じ3つの変数を設定する。
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Production / Preview / Development すべてに設定して良い（ブラウザに公開される値）。
   - `SUPABASE_SERVICE_ROLE_KEY`: サーバー専用。`NEXT_PUBLIC_` を付けず、クライアントから読まれないことを確認する。
7. `/debug/supabase` を開き、以下が `yes` になっていることを確認する。
   - Supabase public URL configured
   - Supabase anon key configured
   - Supabase server/service role configured
   - client config ready
   - server config ready

   環境変数が未設定の場合は、エラーにならず「Supabase環境変数が未設定です。Vercelまたは.env.localに設定してください。」と表示される。
8. `/api/debug/supabase/health` を開き、サーバー側から見た接続状態（`configured` / `serverConfigured` / `canCreateClient` / `canReachSupabase` / `errorCode` / `safeMessage`）を確認する。anon key・service role key の値そのものはレスポンスに含まれない。

この手順を実施しても、オンライン対戦・ルーム作成・Realtime・Auth・カード所持・DB 書き込みはまだ動かない（Task S2 以降）。
