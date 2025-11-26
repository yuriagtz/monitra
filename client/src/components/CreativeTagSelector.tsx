import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CreativeTagSelectorProps {
  creativeId: number;
}

export function CreativeTagSelector({ creativeId }: CreativeTagSelectorProps) {
  const [tagToRemove, setTagToRemove] = useState<{ id: number; name: string } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: allTags } = trpc.tags.list.useQuery(undefined, {
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: creativeTags, refetch } =
    trpc.tags.getForCreative.useQuery(
      { creativeId },
      {
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      }
    );

  const addTag = trpc.tags.addToCreative.useMutation({
    onSuccess: () => {
      toast.success("タグを追加しました");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "タグの追加に失敗しました");
    },
  });

  const removeTag = trpc.tags.removeFromCreative.useMutation({
    onSuccess: () => {
      toast.success("タグを削除しました");
      refetch();
      setIsDeleteDialogOpen(false);
      setTagToRemove(null);
    },
    onError: (error) => {
      toast.error(error.message || "タグの削除に失敗しました");
      setIsDeleteDialogOpen(false);
      setTagToRemove(null);
    },
  });

  const handleToggleTag = (tagId: number) => {
    const isAssigned = creativeTags?.some((t) => t.id === tagId);
    if (isAssigned) {
      // 削除確認ダイアログを表示
      const tag = creativeTags.find((t) => t.id === tagId);
      if (tag) {
        setTagToRemove({ id: tagId, name: tag.name });
        setIsDeleteDialogOpen(true);
      }
    } else {
      addTag.mutate({ creativeId, tagId });
    }
  };

  const handleConfirmDelete = () => {
    if (tagToRemove) {
      removeTag.mutate({ creativeId, tagId: tagToRemove.id });
    }
  };

  const creativeTagsMaster = (allTags ?? []).filter((tag: any) => {
    const type = (tag as any).targetType ?? "lp";
    return type === "creative";
  });

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {creativeTags?.map((tag) => (
          <Badge
            key={tag.id}
            style={{ backgroundColor: tag.color }}
            className="text-white cursor-pointer hover:opacity-80"
            onClick={() => handleToggleTag(tag.id)}
          >
            {tag.name}
          </Badge>
        ))}
        <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 px-2">
            <Plus className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">タグを追加</h4>
            {creativeTagsMaster && creativeTagsMaster.length > 0 ? (
              <div className="space-y-1 max-h-64 overflow-auto">
                {creativeTagsMaster.map((tag) => {
                  const isAssigned = creativeTags?.some(
                    (t) => t.id === tag.id
                  );
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className="w-full flex items-center justify-between p-2 rounded hover:bg-accent text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm">{tag.name}</span>
                      </div>
                      {isAssigned && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                タグがありません
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>

    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>タグを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            「{tagToRemove?.name}」タグを削除します。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDelete}>
            削除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}


