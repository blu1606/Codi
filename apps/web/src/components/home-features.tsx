import { BookOpen, MessageSquare, Route, Terminal } from "lucide-react";
import { Card } from "@codi-1/ui/components/card";
import { cn } from "@codi-1/ui/lib/utils";
import HomeScrollReveal from "./home-scroll-reveal";
import styles from "./home-features.module.css";

const features = [
  {
    title: "Lộ trình cá nhân hóa",
    description:
      "Trực quan hóa kế hoạch học tập độc bản cho riêng trình độ và quỹ thời gian của bạn.",
    icon: Route,
    highlighted: true,
  },
  {
    title: "Khóa học chuyên sâu",
    description:
      "Học qua các dự án thực tế được xây dựng bởi đội ngũ chuyên gia công nghệ hàng đầu.",
    icon: BookOpen,
    highlighted: false,
  },
  {
    title: "AI Mentor 24/7",
    description:
      "Hỏi đáp lập trình tức thì mọi lúc mọi nơi, giải thích bug chi tiết từng dòng code.",
    icon: MessageSquare,
    highlighted: false,
  },
  {
    title: "Thực hành trực tiếp",
    description:
      "Trình biên dịch tích hợp trên trình duyệt giúp bạn viết code và kiểm thử ngay lập tức.",
    icon: Terminal,
    highlighted: false,
  },
];

export default function HomeFeatures() {
  return (
    <section
      aria-labelledby="home-features-title"
      className={cn(styles.section, "w-full bg-background py-16 sm:py-20")}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-16">
        <HomeScrollReveal className="mb-9 flex flex-col items-center text-center">
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold leading-none text-primary uppercase">
            Tính năng ưu việt
          </span>
          <h2
            id="home-features-title"
            className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Phương pháp học thông minh &amp; hiệu quả hơn
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Bỏ qua các giáo án lý thuyết dài dòng. AI Learning hướng bạn vào con
            đường thực hành thực chiến với sự đồng hành của siêu trợ lý AI thông
            minh.
          </p>
        </HomeScrollReveal>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ title, description, icon: Icon, highlighted }, index) => (
            <HomeScrollReveal key={title} delay={index * 0.08} className="h-full">
              <Card
                className={cn(
                  "h-full gap-0 rounded-xl border border-border p-[18px] ring-0",
                  highlighted && "border-primary/70 bg-primary/10",
                )}
              >
                <div
                  className={cn(
                    "mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary",
                    highlighted && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                </div>
                <h3 className="text-base font-bold leading-6 text-foreground">
                  {title}
                </h3>
                <p className="mt-1 text-xs leading-[1.6] text-muted-foreground">
                  {description}
                </p>
              </Card>
            </HomeScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
