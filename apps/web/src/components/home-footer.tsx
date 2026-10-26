import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import BrandLogo from "./brand-logo";
import HomeScrollReveal from "./home-scroll-reveal";
import styles from "./home-footer.module.css";

const groups: { title: string; links: { label: string; href: Route }[] }[] = [
  {
    title: "Nền tảng",
    links: [
      { label: "Lộ trình học tập", href: "/ai" },
      { label: "Danh sách khóa học", href: "/courses" },
      { label: "Bàn làm việc", href: "/dashboard" },
      { label: "AI Mentor", href: "/#home-mentor" },
    ],
  },
  {
    title: "Tài nguyên",
    links: [
      { label: "Khám phá công nghệ", href: "/courses" },
      { label: "Tư vấn chọn khóa học", href: "/ai" },
      { label: "Tính năng Codi", href: "/#home-features-title" },
      { label: "Hồ sơ học tập", href: "/profile" },
    ],
  },
  {
    title: "Hỗ trợ",
    links: [
      { label: "Hỏi đáp cùng AI", href: "/ai" },
      { label: "Quản lý tài khoản", href: "/profile" },
      { label: "Đăng nhập", href: "/login" },
      { label: "Khôi phục mật khẩu", href: "/forgot-password" },
    ],
  },
];

const linkClassName = "rounded-sm text-xs leading-5 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

export default function HomeFooter() {
  return (
    <footer className={styles.footer} aria-label="Thông tin và liên kết Codi">
      <HomeScrollReveal distance={0} className="mx-auto grid max-w-7xl gap-9 px-6 py-12 sm:grid-cols-2 sm:py-14 lg:grid-cols-5 lg:gap-8 lg:px-16">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" aria-label="Codi - Trang chủ" className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary [&>span]:text-base [&>span>span:first-child]:size-7 [&_svg]:size-4">
            <BrandLogo />
          </Link>
          <p className="mt-3 max-w-xs text-xs leading-5 text-muted-foreground">
            Học lập trình cùng trợ lý AI và lộ trình thiết kế riêng cho mỗi cá nhân.
            Codi đồng hành từ những dòng code đầu tiên.
          </p>
        </div>

        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="mb-3 text-sm font-bold text-foreground">{group.title}</h2>
            <ul className="space-y-2">
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className={linkClassName}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h2 className="mb-3 text-sm font-bold text-foreground">Liên hệ</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Bạn cần hỗ trợ học tập? Trao đổi cùng AI Mentor để tìm hướng đi phù hợp.
          </p>
          <Link href="/ai" className={`${linkClassName} mt-3 inline-flex items-center gap-1.5`}>
            Trò chuyện với Codi <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      </HomeScrollReveal>
    </footer>
  );
}
