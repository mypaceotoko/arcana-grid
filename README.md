# ARCANA GRID

ARCANA GRIDは、オンライン対戦型の戦略カードゲームとして開発予定のWebアプリです。

現在はプロジェクト基盤とローカル対戦検証の構築段階です。ゲームルールエンジン、デバッグ用ローカル対戦UI、Supabase接続準備と初期DB基盤は追加済みですが、ログインUI、オンライン対戦、Realtime連携、カード管理の本実装はまだ行っていません。

## 使用技術

- Next.js
- React
- TypeScript
- Tailwind CSS
- ESLint
- Vitest
- npm

## ローカル起動方法

依存関係をインストールしてから、開発サーバーを起動します。依存関係を固定する `package-lock.json` がある場合は `npm ci` も使用できます。

```bash
npm install
npm run dev
```

起動後、ブラウザで `http://localhost:3000` を開きます。

## npm scripts

- `npm run dev`: 開発サーバーを起動します。
- `npm run build`: 本番ビルドを作成します。
- `npm run start`: 本番ビルドを起動します。
- `npm run lint`: ESLintを実行します。
- `npm run typecheck`: TypeScriptの型チェックを実行します。
- `npm run test`: VitestのNode環境テストを1回実行します。
- `npm run test:watch`: Vitestをウォッチモードで起動します。


## Supabase基盤

Task 8Aで、将来のオンライン2人対戦へ移行するためのSupabase接続基盤を追加しました。今回はSupabaseプロジェクトへの実接続、Auth UI、ルーム作成/参加、Realtime、オンライン対戦UIは未実装です。

詳細な手順は `docs/SUPABASE_SETUP.md` を参照してください。

### 環境変数

`.env.example` を `.env.local` にコピーし、Supabaseプロジェクト作成後に値を設定します。実際の秘密情報はコミットしません。

```bash
cp .env.example .env.local
```

最低限必要な値:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（サーバー専用。`NEXT_PUBLIC_` を付けない）
- `ENABLE_DEBUG_PAGES`

Supabase未設定でも既存トップページとデバッグページのbuildを壊さないよう、環境変数検証はSupabaseクライアント作成時に明示的に失敗する構造です。

### Supabase CLI

グローバルインストールは前提にせず、npm scriptsから `npx supabase@latest` を利用します。

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:stop
npm run supabase:types
```

- `supabase:start`: local Supabaseを起動します。
- `supabase:reset`: migrationを適用し、`supabase/seed.sql` を投入します。
- `supabase:types`: 接続済みschemaから `src/lib/supabase/database.generated.ts` を生成します。

### Migration / RLS

初期migrationは `profiles`、`characters`、`card_variants`、`user_cards`、`game_rule_sets` を作成し、全テーブルでRLSを有効化します。Dashboardでの手作業SQLを前提にせず、schema変更は `supabase/migrations/` の履歴として管理します。

## 今後の大まかな開発順序

1. ルールエンジン
2. ローカル対戦UI
3. Supabase
4. オンライン2人対戦
5. カード管理

## CI

GitHub Actionsで `typecheck`、`lint`、`test`、`build` を実行します。`package-lock.json` がある場合は `npm ci`、ない場合は `npm install` で依存関係をインストールします。依存関係はlockfile未生成時のCI再現性を高めるため、主要パッケージを具体的なバージョンで固定しています。CIはNode.js 20 LTSで実行し、Test前にVitest関連の解決バージョンを出力します。
