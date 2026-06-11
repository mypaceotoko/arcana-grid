# Project: ARCANA GRID

## 基本方針

- モバイルファーストで実装する。
- iPhone縦画面を優先する。
- TypeScriptを使用する。
- 大きな変更前に計画する。
- 既存仕様を勝手に変更しない。
- 変更後に `npm run typecheck`・`npm run lint`・`npm test`・`npm run build` を実行する。
  - 現時点では `test` script は未導入。導入前は、未導入であることを報告する。

## アーキテクチャ方針

- ゲームルールをReactコンポーネントへ直接書かない。
- ルールエンジンをUI・Next.js・Supabaseから分離する。
- ルール数値を複数箇所へハードコードしない。
- 各対戦は `game_mode` と `rules_version` を持つ。

## 将来の実装方針: オンライン対戦・セキュリティ

- クライアントは操作意図だけを送る。
- 対戦結果はサーバー側で決定する。
- 相手の伏せカード情報を相手クライアントへ送らない。
- CSSやReactで秘密情報を隠すだけの実装は禁止。

## 将来の実装方針: Supabase

- `service role key` をクライアントへ置かない。
- Supabaseのスキーマ変更はmigrationで行う。
