import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Upload, Loader2 } from "lucide-react";
import { TagManager } from "@/components/TagManager";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function Settings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success('プロフィールを更新しました');
      utils.auth.me.invalidate();
    },
    onError: (error) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success('パスワードを変更しました');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const handleUpdateProfile = () => {
    updateProfile.mutate({ 
      name, 
      email,
      profileImage: profileImage || undefined 
    });
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error('新しいパスワードが一致しません');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('パスワードは8文字以上である必要があります');
      return;
    }
    changePassword.mutate({
      currentPassword: currentPassword || undefined,
      newPassword,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">設定</h1>
        <p className="text-muted-foreground mt-2">システムの設定を管理します</p>
      </div>

      {/* プロフィール編集セクション */}
      <Card>
        <CardHeader>
          <CardTitle>プロフィール設定</CardTitle>
          <CardDescription>
            表示名、メールアドレス、プロフィール画像を変更できます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* プロフィール画像 */}
          <div className="space-y-2">
            <Label>プロフィール画像</Label>
            <div className="flex items-center gap-4">
              <Avatar className="w-20 h-20">
                <AvatarImage src={profileImage || user?.profileImage || ""} />
                <AvatarFallback className="text-2xl">{user?.name?.charAt(0) || "U"}</AvatarFallback>
              </Avatar>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error("画像サイズは5MB以下にしてください");
                      return;
                    }
                    
                    setUploadingImage(true);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setProfileImage(reader.result as string);
                      setUploadingImage(false);
                      toast.success("画像をアップロードしました");
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      アップロード中...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      画像を選択
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG, GIF (5MB以下)
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">表示名</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="表示名を入力"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>
          <Button
            onClick={handleUpdateProfile}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? '更新中...' : 'プロフィールを更新'}
          </Button>
        </CardContent>
      </Card>

      {/* パスワード変更セクション */}
      <Card>
        <CardHeader>
          <CardTitle>パスワード変更</CardTitle>
          <CardDescription>
            パスワードを設定・変更できます(8文字以上)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.password && (
            <div className="space-y-2">
              <Label htmlFor="currentPassword">現在のパスワード</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="現在のパスワード"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="newPassword">新しいパスワード</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新しいパスワード(8文字以上)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">新しいパスワード(確認)</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="新しいパスワード(確認)"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={changePassword.isPending}
          >
            {changePassword.isPending ? '変更中...' : 'パスワードを変更'}
          </Button>
        </CardContent>
      </Card>

      {/* タグ管理セクション */}
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
