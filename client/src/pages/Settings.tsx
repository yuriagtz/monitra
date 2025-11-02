import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TagManager } from "@/components/TagManager";

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">設定</h1>
        <p className="text-muted-foreground mt-2">システムの設定を管理します</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>タグ管理</CardTitle>
          <CardDescription>
            LPを分類するためのタグを作成・管理します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TagManager />
        </CardContent>
      </Card>
    </div>
  );
}
