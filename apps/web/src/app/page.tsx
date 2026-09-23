"use client";

import { Briefcase, Sparkles, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import Hero from "@/components/hero";

export default function Home() {
  const router = useRouter();

  const heroData = {
    title: (
      <>
        A new way to learn <br />
        <span className="text-primary">&amp; get knowledge</span>
      </>
    ),
    subtitle:
      "Codi đồng hành cùng bạn với các khoá học lập trình thực chiến & trợ lý AI cá nhân hoá lộ trình đào tạo 24/7.",
    actions: [
      {
        text: "Khám phá khoá học",
        onClick: () => router.push("/courses"),
        variant: "default" as const,
      },
      {
        text: "Tư vấn lộ trình với AI",
        onClick: () => router.push("/ai"),
        variant: "outline" as const,
      },
    ],
    stats: [
      {
        value: "15,2K",
        label: "Học viên năng động",
        icon: <Users className="h-5 w-5 text-muted-foreground" />,
      },
      {
        value: "4,5K",
        label: "Bài học & Dự án",
        icon: <Briefcase className="h-5 w-5 text-muted-foreground" />,
      },
      {
        value: "24/7",
        label: "AI Mentor đồng hành",
        icon: <Sparkles className="h-5 w-5 text-muted-foreground" />,
      },
    ],
    images: [
      "https://cdn.21st.dev/assets/mirror/80/807b564e6a3dfa435b6ffb617953d522554723e27b78eaa0ae311392cb957016.jpg",
      "https://cdn.21st.dev/assets/mirror/03/03bacbb04f5b3f7d2526f9d8125bf7013c8342ed54c47bd440c203e9ac54fd2d.jpg",
      "https://cdn.21st.dev/assets/mirror/dd/dd8be3dc3a1f8735a6a562e3f6f23c7ee250438666efee22c78e37af73cc597b.jpg",
    ],
  };

  return (
    <main className="w-full bg-background flex flex-col justify-center">
      <Hero
        title={heroData.title}
        subtitle={heroData.subtitle}
        actions={heroData.actions}
        stats={heroData.stats}
        images={heroData.images}
      />
    </main>
  );
}
