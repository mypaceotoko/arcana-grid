# ARCANA GRID

ARCANA GRIDは、オンライン対戦型の戦略カードゲームとして開発予定のWebアプリです。

現在はプロジェクト基盤の構築段階です。ゲームルール、カード、盤面、Supabase連携、オンライン対戦機能はまだ実装していません。

## 使用技術

- Next.js
- React
- TypeScript
- Tailwind CSS
- ESLint
- npm

## ローカル起動方法

依存関係をインストールしてから、開発サーバーを起動します。

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

## 今後の大まかな開発順序

1. ルールエンジン
2. ローカル対戦UI
3. Supabase
4. オンライン2人対戦
5. カード管理
