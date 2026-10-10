import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";
import HomeScrollReveal from "./home-scroll-reveal";
import styles from "./home-mentor.module.css";

const benefits = [
  {
    title: "Giải thích logic code phức tạp",
    description: "Chỉ cần gửi đoạn code, AI sẽ phân tích và giải nghĩa dễ hiểu nhất.",
  },
  {
    title: "Phát hiện lỗi logic & gợi ý sửa đổi",
    description: "Cùng tìm lỗi, hiểu nguyên nhân và cải thiện cách viết code của bạn.",
  },
];

export default function HomeMentor() {
  return (
    <section
      id="home-mentor"
      aria-labelledby="home-mentor-title"
      className={cn(styles.section, "w-full scroll-mt-20 bg-background py-16 sm:py-20")}
    >
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:px-16">
        <HomeScrollReveal>
          <span className="inline-block rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold leading-none text-primary uppercase">
            AI Mentor
          </span>
          <h2 id="home-mentor-title" className="mt-3 text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">
            AI Mentor - Trợ lý học tập thông minh luôn kề vai
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Không còn phải mòn mỏi chờ câu trả lời trên các diễn đàn công nghệ.
            AI Mentor của Codi cùng bạn tìm hiểu bài học, giải thích từng bước
            và khám phá lời giải với code minh họa trực quan.
          </p>

          <ul className="mt-6 space-y-4">
            {benefits.map((benefit) => (
              <li key={benefit.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                </span>
                <div>
                  <h3 className="text-sm leading-5 font-bold text-foreground">{benefit.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{benefit.description}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/ai" className="mt-6 inline-flex items-center gap-2 rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            Trò chuyện với AI Mentor <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </HomeScrollReveal>

        <HomeScrollReveal delay={0.1}>
          <Image
            src="/images/ai-mentor-preview.svg"
            alt="Minh họa hội thoại AI Mentor hướng dẫn loại bỏ các phần tử trùng lặp trong mảng JavaScript bằng Set."
            width={592}
            height={557}
            className="h-auto w-full min-w-0 rounded-2xl"
            unoptimized
          />
        </HomeScrollReveal>
      </div>
    </section>
  );
}
