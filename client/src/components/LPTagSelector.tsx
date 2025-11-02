import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

interface LPTagSelectorProps {
  landingPageId: number;
}

export function LPTagSelector({ landingPageId }: LPTagSelectorProps) {
  const { data: allTags } = trpc.tags.list.useQuery();
  const { data: lpTags, refetch } = trpc.tags.getForLandingPage.useQuery({
    landingPageId,
  });

  const addTag = trpc.tags.addToLandingPage.useMutation({
    onSuccess: () => {
      toast.success("タグを追加しました");
      refetch();
    },
    onError: (error) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const removeTag = trpc.tags.removeFromLandingPage.useMutation({
    onSuccess: () => {
      toast.success("タグを削除しました");
      refetch();
    },
    onError: (error) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const handleToggleTag = (tagId: number) => {
    const isAssigned = lpTags?.some((t) => t.id === tagId);
    if (isAssigned) {
      removeTag.mutate({ landingPageId, tagId });
    } else {
      addTag.mutate({ landingPageId, tagId });
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {lpTags?.map((tag) => (
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
            {allTags && allTags.length > 0 ? (
              <div className="space-y-1">
                {allTags.map((tag) => {
                  const isAssigned = lpTags?.some((t) => t.id === tag.id);
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
  );
}
