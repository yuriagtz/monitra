import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Eye, Bell, BarChart3, Clock, Shield } from "lucide-react";
import { useLocation } from "wouter";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
              Monitra
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/login")}>
              ログイン
            </Button>
            <Button onClick={() => setLocation("/register")}>
              無料で始める
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-5xl md:text-6xl font-bold leading-tight">
            変化を逃さない、
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
              LP分析の自動監視AI
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            登録したランディングページの「変化」「有効性」を自動検知。
            <br />
            もう"開いて確認する"必要はありません。
            <br />
            <strong className="text-gray-900">Monitraは、LPを24時間見守るインテリジェント・ウォッチャーです。</strong>
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button size="lg" className="text-lg px-8 py-6" onClick={() => setLocation("/register")}>
              今すぐ無料で始める
            </Button>
          </div>
          <p className="text-sm text-gray-500">クレジットカード不要 • 無料プランあり</p>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            24時間、あなたのLPを見守ります
          </h2>
          <p className="text-lg text-gray-600">
            Monitraが自動で監視・分析・通知。手動チェックから解放されます。
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <Card className="border-2 hover:border-blue-400 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Eye className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle>自動変更検知</CardTitle>
              <CardDescription>
                ファーストビュー、全体レイアウト、リンク切れを自動で監視。変更があれば即座に通知します。
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-blue-400 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle>詳細分析レポート</CardTitle>
              <CardDescription>
                変更履歴、トレンド、統計データを自動集計。週次・月次のPDFレポート生成にも対応。
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-blue-400 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Bell className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle>リアルタイム通知</CardTitle>
              <CardDescription>
                重要な変更やエラーを検知したら、メール・Slack・Webhookで即座にお知らせします。
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-blue-400 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <CardTitle>柔軟なスケジュール</CardTitle>
              <CardDescription>
                監視頻度を自由に設定。1時間ごと、毎日、週次など、ニーズに合わせてカスタマイズ可能。
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-blue-400 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-red-600" />
              </div>
              <CardTitle>セキュアな管理</CardTitle>
              <CardDescription>
                認証付きLP、Basic認証にも対応。機密情報は暗号化して安全に保管します。
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-blue-400 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
              </div>
              <CardTitle>履歴管理</CardTitle>
              <CardDescription>
                過去の変更履歴を無制限に保存。いつでも過去の状態と比較・確認できます。
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container mx-auto px-4 py-20 bg-gray-50">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">シンプルな料金プラン</h2>
          <p className="text-lg text-gray-600">まずはフリープランでお試しください</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free Plan */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-2xl">フリープラン</CardTitle>
              <div className="text-4xl font-bold mt-4">¥0</div>
              <CardDescription className="text-base mt-2">個人利用・お試しに最適</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>最大3ページまで監視</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>14日ごとの自動チェック</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>メール通知</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>30日間の履歴保存</span>
                </li>
              </ul>
              <Button className="w-full mt-6" variant="outline" onClick={() => setLocation("/register")}>
                無料で始める
              </Button>
            </CardContent>
          </Card>

          {/* Light Plan */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-2xl">ライトプラン</CardTitle>
              <div className="text-4xl font-bold mt-4">
                ¥980
                <span className="text-lg font-normal text-gray-600">/月</span>
              </div>
              <CardDescription className="text-base mt-2">小規模ビジネスに最適</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>最大10ページまで監視</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>7日ごとの自動チェック</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>メール通知</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>90日間の履歴保存</span>
                </li>
              </ul>
              <Button className="w-full mt-6" variant="outline" onClick={() => setLocation("/register")}>
                ライトプランを始める
              </Button>
            </CardContent>
          </Card>

          {/* Pro Plan */}
          <Card className="border-2 border-blue-600 shadow-lg relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
              人気
            </div>
            <CardHeader>
              <CardTitle className="text-2xl">プロプラン</CardTitle>
              <div className="text-4xl font-bold mt-4">
                ¥2,980
                <span className="text-lg font-normal text-gray-600">/月</span>
              </div>
              <CardDescription className="text-base mt-2">ビジネス利用に最適</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>最大100ページまで監視</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>3日ごとの自動チェック</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>メール・Slack・Webhook通知</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>無制限の履歴保存</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>PDFレポート生成</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>優先サポート</span>
                </li>
              </ul>
              <Button className="w-full mt-6" onClick={() => setLocation("/register")}>
                プロプランを始める
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold">
            今すぐMonitraで、LP管理を自動化しましょう
          </h2>
          <p className="text-lg text-gray-600">
            無料プランで今日から始められます。クレジットカード不要。
          </p>
          <Button size="lg" className="text-lg px-8 py-6" onClick={() => setLocation("/register")}>
            無料で始める
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>&copy; 2025 Monitra. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
