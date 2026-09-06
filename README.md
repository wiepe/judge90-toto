# JUDGE 90
Jリーグ/toto向け勝敗予想ダッシュボードのプロトタイプ。

## 最終構成
1. fixtures collector: toto対象試合取得
2. stats collector: 順位・直近成績・ホーム/アウェイ・対戦成績
3. context collector: 天候・欠場・出場停止・予想スタメン
4. prediction engine: 1/0/2確率 + 信頼度
5. portfolio optimizer: 予算別のシングル/ダブル/トリプル提案
6. weekly automation: GitHub Actions / cronで更新

## データモデル
`data/predictions.json` に試合ごとの確率、根拠、信頼度を保存し、UIはそのJSONを読む方式にする。

## 重要
自動データ取得先は利用規約・robots.txt・公式APIの有無を確認してから実装すること。
