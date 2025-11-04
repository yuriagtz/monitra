import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Monitor, Bell, BarChart3, Clock, Shield } from "lucide-react";
import { useLocation } from "wouter";
import { APP_LOGO, APP_TITLE } from "@/const";

export default function Landing() {
  const [, setLocation] = useLocation();

  const features = [
    {
      icon: Monitor,
      title: "スクリーンショット比較",
      description: "ページ全体のビジュアル変更を自動検出。画像比較技術で微細な変更も見逃しません。"
    },
    {
      icon: Bell,
      title: "リアルタイム通知",
      description: "変更検出時に即座に通知。メール、Slack、Discord、Chatworkに対応。"
    },
    {
      icon: BarChart3,
      title: "詳細な分析レポート",
      description: "変更履歴、トレンド、統計をグラフで可視化。PDFレポート出力も可能。"
    },
    {
      icon: Clock,
      title: "自動スケジュール監視",
      description: "指定した間隔で自動チェック。24時間365日、あなたのLPを監視します。"
    },
    {
      icon: Shield,
      title: "リンク切れチェック",
      description: "ページ内のリンクを自動チェック。404エラーを事前に検知します。"
    },
    {
      icon: Monitor,
      title: "領域別差分検出",
      description: "ファーストビュー、中部、下部を個別に分析。重要な変更を優先的に通知。"
    }
  ];

  const plans = [
    {
      name: "無料プラン",
      price: "¥0",
      period: "/月",
      description: "個人利用や小規模プロジェクトに最適",
      features: [
        "LP登録数: 3ページまで",
        "監視頻度: 1日1回",
        "通知チャネル: 1つまで",
        "履歴保存: 30日間",
        "基本的な差分検出"
      ],
      buttonText: "無料で始める",
      highlighted: false
    },
    {
      name: "プロプラン",
      price: "¥2,980",
      period: "/月",
      description: "ビジネス利用に最適なプラン",
      features: [
        "LP登録数: 無制限",
        "監視頻度: 1時間ごと",
        "通知チャネル: 無制限",
        "履歴保存: 無制限",
        "領域別差分検出",
        "OCR・色変更検出",
        "PDFレポート出力",
        "優先サポート"
      ],
      buttonText: "プロプランを始める",
      highlighted: true
    },
    {
      name: "エンタープライズ",
      price: "お問い合わせ",
      period: "",
      description: "大規模組織向けカスタムプラン",
      features: [
        "すべてのプロ機能",
        "専用サーバー",
        "カスタム統合",
        "SLA保証",
        "専任サポート",
        "オンプレミス対応"
      ],
      buttonText: "お問い合わせ",
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {APP_LOGO && <img src={APP_LOGO} alt="Logo" className="h-8 w-8" />}
            <span className="text-xl font-bold text-blue-600">{APP_TITLE}</span>
          </div>
          <div className="flex items-center gap-3">
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
        <Badge className="mb-4" variant="secondary">
          ランディングページの変更を見逃さない
        </Badge>
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          LP監視を自動化し、<br />
          ビジネスを加速させる
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          スクリーンショット比較、リアルタイム通知、詳細な分析レポート。
          あなたのランディングページを24時間365日監視します。
        </p>
        <div className="flex gap-4 justify-center">
          <Button size="lg" onClick={() => setLocation("/register")}>
            無料で始める
          </Button>
          <Button size="lg" variant="outline" onClick={() => {
            document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
          }}>
            機能を見る
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          クレジットカード不要 • 3ページまで無料
        </p>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">充実の機能</h2>
          <p className="text-muted-foreground">
            LP監視に必要なすべての機能を提供します
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="border-2 hover:border-blue-500 transition-colors">
              <CardHeader>
                <feature.icon className="w-12 h-12 text-blue-600 mb-2" />
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container mx-auto px-4 py-20 bg-gradient-to-b from-white to-blue-50">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">シンプルな料金プラン</h2>
          <p className="text-muted-foreground">
            あなたのニーズに合わせたプランをお選びください
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`relative ${plan.highlighted ? 'border-blue-500 border-2 shadow-lg scale-105' : ''}`}
            >
              {plan.highlighted && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600">
                  人気
                </Badge>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full" 
                  variant={plan.highlighted ? "default" : "outline"}
                  onClick={() => setLocation("/register")}
                >
                  {plan.buttonText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0 max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-3xl text-white">今すぐ始めましょう</CardTitle>
            <CardDescription className="text-blue-100 text-lg">
              無料プランで今すぐLP監視を開始できます
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              size="lg" 
              variant="secondary"
              onClick={() => setLocation("/register")}
            >
              無料アカウントを作成
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 {APP_TITLE}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
