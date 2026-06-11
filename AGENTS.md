# Project: ARCANA GRID

## 恒久ルール

- モバイルファーストで実装し、iPhone縦画面を優先する。
- TypeScriptを使用し、変更後は `npm run typecheck`・`npm run lint`・`npm run test`・`npm run build` を実行する。
- 大きな変更は事前に計画し、小さなTaskへ分割する。
- 既存仕様を勝手に変更しない。
- `main` へ直接pushしない。自動マージしない。

## アーキテクチャ

- ゲームルールをReactコンポーネントへ直接書かない。
- ルールエンジンをUI・Next.js・Supabaseから分離する。
- ルール数値を複数箇所へ重複ハードコードしない。
- 各対戦は `game_mode` と `rules_version` を持つ。

## オンライン対戦・セキュリティ

- クライアントは操作意図だけを送る。
- 対戦結果はサーバー側で決定するサーバー権威型にする。
- 相手の伏せカード情報を相手クライアントへ渡さない。
- CSSやReactで秘密情報を隠すだけの実装は禁止。
- `service role key` をクライアントへ置かない。
- Supabaseのスキーマ変更はmigrationで行う。
