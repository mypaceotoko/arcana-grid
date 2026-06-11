# ARCANA GRID

ARCANA GRIDは、オンライン対戦型の戦略カードゲームとして開発予定のWebアプリです。

現在はプロジェクト基盤の構築段階です。ゲームルール、カード、盤面、Supabase連携、オンライン対戦機能はまだ実装していません。

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

## 今後の大まかな開発順序

1. ルールエンジン
2. ローカル対戦UI
3. Supabase
4. オンライン2人対戦
5. カード管理

## CI

GitHub Actionsで `typecheck`、`lint`、`test`、`build` を実行します。`package-lock.json` がある場合は `npm ci`、ない場合は `npm install` で依存関係をインストールします。依存関係はlockfile未生成時のCI再現性を高めるため、主要パッケージを具体的なバージョンで固定しています。
