# nextjs-supabase-rls-server-actions-demo

Next.js (App Router) のサーバーアクションと Supabase の Row Level Security を組み合わせて、多層防御パターンを実装するための最小サンプルです。

## なぜ書いたか

株式会社deilightでの実務で、Webアプリの認可ロジックを設計する中で気づいた以下のパターンを、最小再現するために作成しました。

- RLSポリシー単体では、サーバーアクションが「他人の所有リソースのIDを受け取って処理する」ケースで、意図しない挙動になり得る
- 実装初期に、AIに提案させたRLSが論理的には正しく見えたが、Supabaseの `auth.uid()` の挙動を取り違えたパターンに遭遇した
- 「AIの出力をそのまま採用しない」レビュー観点として、認証・認可は必ず一次情報（Supabase公式ドキュメント）に当たる運用を業務で徹底している

## アーキテクチャ

- フロント：Next.js 15 (App Router) / TypeScript
- 認証：Supabase Auth（`auth.uid()` ベース）
- DB：Supabase Postgres + Row Level Security
- 防御層
  1. RLS が `auth.uid() = owner_id` で SELECT / UPDATE / DELETE を制限
  2. サーバーアクション側でも「リクエスト元 = 所有者」をアプリケーション層で再検証
  3. AI生成コードでも、認可ロジックは必ず人がレビューする運用ルール

## ファイル構成（予定）

- `app/actions/notes.ts` — サーバーアクション本体（多層防御の実装ポイント）
- `supabase/migrations/0001_rls.sql` — RLSポリシーの定義
- `docs/threat-model.md` — 想定する攻撃モデルと、それに対する防御の対応表

## 観点

- Prompt Injection の可能性がある入力経路（外部APIレスポンス、ユーザー生成コンテンツ）と、RLS がそれをどこまで防げるかの境界
- サーバーアクション経由でのデータ参照と、クライアントコンポーネントからの直接アクセスのセキュリティモデルの違い

## ステータス

WIP（学習・検証目的）。実装が進み次第、コードと解説を追加します。

## Author

羽曾部 健介 (Kensuke Hasobe)

- 東洋大学 情報連携学部 情報連携学科（INIAD）2年
- 株式会社deilight ソフトウェアエンジニア
- GitHub: [@Kensuke-sam](https://github.com/Kensuke-sam)
