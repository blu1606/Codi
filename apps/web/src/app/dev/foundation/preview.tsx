"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";
import { ConfirmDialog } from "@codi-1/ui/components/confirm-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@codi-1/ui/components/empty";
import { MasteryChip } from "@codi-1/ui/components/mastery-chip";
import { ProgressRing } from "@codi-1/ui/components/progress-ring";
import { Sheet } from "@codi-1/ui/components/sheet";
import { StatusBadge } from "@codi-1/ui/components/status-badge";
import { Stepper } from "@codi-1/ui/components/stepper";
import { undoToast } from "@codi-1/ui/components/undo-toast";
import { MASTERY_LEVELS } from "@codi-1/ui/lib/mastery";

// Development-only component review surface; never used as application data.
export default function FoundationPreview() {
  const [dialog, setDialog] = useState<"simple" | "reason" | "typed" | null>(null);
  const [sheet, setSheet] = useState(false);
  const [docked, setDocked] = useState(false);
  const [removed, setRemoved] = useState(false);
  return <main className="mx-auto w-full max-w-[1200px] space-y-6 p-4 pb-12 sm:p-6">
    <div className="space-y-2"><p className="text-sm font-medium text-primary">Codi · Foundation · #95</p><h1 className="text-2xl font-semibold">Thư viện giao diện</h1><p className="text-muted-foreground">Kiểm tra component dùng chung ở giao diện sáng, tối và màn hình nhỏ.</p></div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Mức độ thành thạo</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3">{MASTERY_LEVELS.map((level) => <MasteryChip key={level} level={level} />)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Tiến độ học tập</CardTitle></CardHeader><CardContent className="space-y-5"><div className="flex flex-wrap gap-6">{[0, 45, 100].map((value) => <ProgressRing key={value} value={value} />)}</div><Stepper steps={["Mục tiêu", "Kiểm tra đầu vào", "Lộ trình"]} current={1} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Trạng thái khoá học</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{(["draft", "pending", "rejected", "published", "hidden"] as const).map((status) => <StatusBadge key={status} kind="course" status={status} />)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Đơn hàng và bài nộp</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2">{(["pending", "paid", "failed", "cancelled", "refunded"] as const).map((status) => <StatusBadge key={status} kind="order" status={status} />)}</div><div className="flex flex-wrap gap-2">{(["draft", "pending", "graded"] as const).map((status) => <StatusBadge key={status} kind="submission" status={status} />)}</div></CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader><CardTitle>Thông điệp và lỗi</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{(["info", "success", "warning", "destructive"] as const).map((variant) => <Alert key={variant} variant={variant}><AlertTitle>{({ info: "Thông tin học tập", success: "Lộ trình đã được cập nhật", warning: "Cần hoàn thành bài tiên quyết", destructive: "Không thể tải dữ liệu" })[variant]}</AlertTitle><AlertDescription>{variant === "destructive" ? "Vui lòng thử lại." : "Mỗi trạng thái đều có biểu tượng và nhãn chữ."}</AlertDescription></Alert>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Xác nhận và hoàn tác</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setDialog("simple")}>Xác nhận thông thường</Button><Button variant="outline" onClick={() => setDialog("reason")}>Xác nhận kèm lý do</Button><Button variant="destructive" onClick={() => setDialog("typed")}>Nhập để xác nhận</Button><Button variant="secondary" disabled={removed} onClick={() => { setRemoved(true); undoToast("Đã xoá mục xem thử", () => setRemoved(false)); }}>{removed ? "Đã xoá mục xem thử" : "Xoá mục xem thử"}</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>Bảng nội dung</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3"><Button onClick={() => setSheet(true)}>Mở bảng bên</Button><Button variant="outline" onClick={() => setDocked((value) => !value)}>Bật/tắt bảng docked</Button></CardContent></Card>
      <Card className="lg:col-span-2"><CardContent><Empty><EmptyHeader><EmptyMedia variant="icon"><Inbox aria-hidden="true" /></EmptyMedia><EmptyTitle>Chưa có thông báo.</EmptyTitle><EmptyDescription>Thông báo về học tập sẽ xuất hiện tại đây.</EmptyDescription></EmptyHeader></Empty></CardContent></Card>
    </div>
    <ConfirmDialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }} title={dialog === "typed" ? "Xoá nội dung xem thử" : "Xác nhận hành động xem thử"} consequence="Đây là bản xem thử, không thay đổi dữ liệu người dùng." reversible="Bạn có thể đóng hộp thoại để quay lại." requireReason={dialog === "reason"} typeToConfirm={dialog === "typed" ? "XOÁ" : undefined} danger={dialog === "typed"} onConfirm={() => {}} />
    <Sheet open={sheet} onOpenChange={setSheet} title="Nội dung bổ sung" description="Bảng bên chuyển thành toàn màn hình trên điện thoại."><Alert>Vùng nội dung độc lập, có thể cuộn và đóng bằng bàn phím.</Alert></Sheet>
    {docked && <div className="flex justify-end"><Sheet docked open={docked} onOpenChange={setDocked} title="Bảng docked"><p className="text-sm text-muted-foreground">Nội dung nằm cạnh trang, không khoá tương tác với trang chính.</p></Sheet></div>}
  </main>;
}
