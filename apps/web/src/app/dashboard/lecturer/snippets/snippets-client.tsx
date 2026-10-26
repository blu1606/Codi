"use client";

import { useState } from "react";
import { Edit2, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent } from "@codi-1/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@codi-1/ui/components/empty";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { Textarea } from "@codi-1/ui/components/textarea";
import {
  createFeedbackSnippet,
  deleteFeedbackSnippet,
  restoreFeedbackSnippet,
  updateFeedbackSnippet,
  type FeedbackSnippetItem,
} from "./actions";

interface SnippetsClientProps {
  initialSnippets: FeedbackSnippetItem[];
}

export function SnippetsClient({ initialSnippets }: SnippetsClientProps) {
  const [snippets, setSnippets] = useState<FeedbackSnippetItem[]>(initialSnippets);

  // Dialog create/edit state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<FeedbackSnippetItem | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [bodyInput, setBodyInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Dialog delete state

  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenCreate = () => {
    setEditingSnippet(null);
    setTitleInput("");
    setBodyInput("");
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (snippet: FeedbackSnippetItem) => {
    setEditingSnippet(snippet);
    setTitleInput(snippet.title);
    setBodyInput(snippet.body);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleSaveSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const title = titleInput.trim();
    const body = bodyInput.trim();

    if (!title || title.length < 2) {
      setFormError("Tiêu đề phải có ít nhất 2 ký tự.");
      return;
    }
    if (!body || body.length < 5) {
      setFormError("Nội dung nhận xét phải có ít nhất 5 ký tự.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingSnippet) {
        const res = await updateFeedbackSnippet(editingSnippet.id, {
          title,
          body,
        });
        if (!res.success) {
          setFormError(
            res.errors?.title ||
              res.errors?.body ||
              res.error ||
              "Không thể cập nhật mẫu nhận xét."
          );
          return;
        }
        setSnippets((prev) =>
          prev.map((item) =>
            item.id === editingSnippet.id ? { ...item, title, body } : item
          )
        );
        toast.success("Đã cập nhật mẫu nhận xét.");
      } else {
        const res = await createFeedbackSnippet({ title, body });
        if (!res.success || !res.snippet) {
          setFormError(
            res.errors?.title ||
              res.errors?.body ||
              res.error ||
              "Không thể tạo mẫu nhận xét."
          );
          return;
        }
        setSnippets((prev) => [res.snippet!, ...prev]);
        toast.success("Đã tạo mẫu nhận xét.");
      }
      setIsDialogOpen(false);
    } catch {
      setFormError("Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (snippetToDelete: FeedbackSnippetItem) => {
    setIsDeleting(true);
    try {
      const deleted = await deleteFeedbackSnippet(snippetToDelete.id);
      if (!deleted.success || !deleted.deletedSnippet) throw new Error("Không thể xoá mẫu nhận xét.");
      setSnippets((prev) => prev.filter((item) => item.id !== snippetToDelete.id));
      const targetSnippet = deleted.deletedSnippet;
      toast(`Đã xoá mẫu "${targetSnippet.title}".`, {
        action: {
          label: "Hoàn tác",
          onClick: async () => {
            try {
              const res = await restoreFeedbackSnippet({
                title: targetSnippet.title,
                body: targetSnippet.body,
              });
              if (res.success && res.snippet) {
                setSnippets((prev) => [res.snippet!, ...prev]);
                toast.success("Đã khôi phục mẫu nhận xét.");
              }
            } catch {
              toast.error("Không thể khôi phục mẫu nhận xét.");
            }
          },
        },
      });

    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Có lỗi xảy ra khi xoá mẫu nhận xét."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Mẫu nhận xét</h1>
          <p className="text-sm text-muted-foreground">
            Tạo và quản lý mẫu nhận xét để tái sử dụng khi chấm bài.
          </p>
        </div>
        <div>
          <Button onClick={handleOpenCreate} className="gap-2 shadow-xs">
            <Plus className="size-4" />
            Tạo mẫu
          </Button>
        </div>
      </div>

      {/* Snippet List or Empty State */}
      {snippets.length === 0 ? (
        <Card className="border border-border/80">
          <CardContent className="p-12">
            <Empty>
              <EmptyMedia>
                <div className="p-3 rounded-full bg-muted text-muted-foreground">
                  <FileText className="size-8" />
                </div>
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Chưa có mẫu nào</EmptyTitle>
                <EmptyDescription>
                  Tạo mẫu nhận xét để tiết kiệm thời gian chấm bài.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-border/80 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                <tr>
                  <th scope="col" className="px-6 py-3.5 w-1/4">
                    Tiêu đề
                  </th>
                  <th scope="col" className="px-6 py-3.5 w-1/2">
                    Nội dung
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right w-1/4">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {snippets.map((snippet) => (
                  <tr
                    key={snippet.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-6 py-4 font-semibold text-foreground align-top">
                      {snippet.title}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground align-top">
                      <p className="whitespace-pre-line leading-relaxed">
                        {snippet.body.length > 80 ? `${snippet.body.slice(0, 80)}...` : snippet.body}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right align-top">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(snippet)}
                          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="size-3.5" />
                          Sửa
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isDeleting}
                          onClick={() => handleDelete(snippet)}
                          className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                          Xoá
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dialog Create/Edit */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSaveSnippet} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {editingSnippet ? "Sửa mẫu nhận xét" : "Tạo mẫu nhận xét"}
              </DialogTitle>
              <DialogDescription>
                Bạn có thể dùng biến <code className="text-primary font-mono text-xs">{"{{ten_hoc_vien}}"}</code> và <code className="text-primary font-mono text-xs">{"{{diem}}"}</code> để tự động điền khi chấm.
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <p className="text-sm font-medium text-destructive">{formError}</p>
            )}

            <div className="space-y-2">
              <Label htmlFor="snippet-title" className="text-sm font-medium">
                Tiêu đề mẫu <span className="text-destructive">*</span>
              </Label>
              <Input
                id="snippet-title"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Ví dụ: Lời khen bài tập xuất sắc"
                required
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="snippet-body" className="text-sm font-medium">
                Nội dung nhận xét <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="snippet-body"
                value={bodyInput}
                onChange={(e) => setBodyInput(e.target.value)}
                placeholder="Ví dụ: Chào {{ten_hoc_vien}}, bài làm của em rất tốt, đạt {{diem}} điểm. Cố gắng phát huy nhé!"
                rows={6}
                required
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground">
                Gợi ý: Dùng <span className="font-semibold text-foreground">{"{{ten_hoc_vien}}"}</span> cho tên học viên và <span className="font-semibold text-foreground">{"{{diem}}"}</span> cho điểm số bài nộp.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Đang lưu..." : editingSnippet ? "Lưu thay đổi" : "Lưu mẫu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


    </div>
  );
}
