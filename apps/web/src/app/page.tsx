"use client";

import { useRouter } from "next/navigation";
import Hero from "@/components/hero";
import HomeFeatures from "@/components/home-features";
import HomeCourses from "@/components/home-courses";
import HomeMentor from "@/components/home-mentor";
import HomeFooter from "@/components/home-footer";

export default function Home() {
  const router = useRouter();

  const heroData = {
    eyebrow: "Thế hệ học lập trình mới với trợ lý AI",
    title: (
      <>
        A new way to learn <br />
        &amp; get knowledge
      </>
    ),
    subtitle:
      "Học lập trình thông minh hơn với trợ lý AI, đa dạng các khóa học từ cơ bản đến nâng cao, thực hành code trực tiếp và lộ trình học cá nhân hóa hoàn hảo.",
    actions: [
      {
        text: "Bắt đầu học ngay",
        onClick: () => router.push("/dashboard"),
        variant: "default" as const,
      },
      {
        text: "Khám phá khóa học",
        onClick: () => router.push("/courses"),
        variant: "outline" as const,
      },
    ],
    stats: [
      {
        value: "Lộ trình",
        label: "Theo mục tiêu học tập",
      },
      {
        value: "Khóa học",
        label: "Khám phá chủ đề lập trình",
      },
      {
        value: "Trợ lý AI",
        label: "Hỗ trợ học tập",
      },
    ],
    images: [
      "https://cdn.21st.dev/assets/mirror/80/807b564e6a3dfa435b6ffb617953d522554723e27b78eaa0ae311392cb957016.jpg",
      "https://cdn.21st.dev/assets/mirror/03/03bacbb04f5b3f7d2526f9d8125bf7013c8342ed54c47bd440c203e9ac54fd2d.jpg",
      "https://cdn.21st.dev/assets/mirror/dd/dd8be3dc3a1f8735a6a562e3f6f23c7ee250438666efee22c78e37af73cc597b.jpg",
    ],
  };

  return (
    <>
      <main className="w-full bg-background flex flex-col justify-center">
        <Hero
          eyebrow={heroData.eyebrow}
          title={heroData.title}
          subtitle={heroData.subtitle}
          actions={heroData.actions}
          stats={heroData.stats}
          images={heroData.images}
        />
        <HomeFeatures />
        <HomeCourses />
        <HomeMentor />
      </main>
      <HomeFooter />
    </>
  );
}
