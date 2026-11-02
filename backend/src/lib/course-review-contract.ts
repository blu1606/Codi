export interface CourseReview {
  id: string;
  userName: string;
  userAvatar: string | null;
  stars: number;
  createdAt: string;
  text: string | null;
  reply: { text: string; createdAt?: string } | null;
}
