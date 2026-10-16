import { Star } from "lucide-react";
import { Card } from "@codi-1/ui/components/card";
import type { CourseReview } from "@/lib/course-review-contract";

export default function CourseReviewList({ reviews }: { reviews: CourseReview[] }) {
  return <>              {reviews?.length ? (
                <ul className="mt-5 space-y-5">
                  {reviews.map((review) => (
                    <li key={review.id}>
                      <Card className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <strong>{review.userName}</strong>
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Star
                              aria-hidden="true"
                              className="size-4 fill-current text-star"
                            />
                            {review.stars}/5 sao
                          </span>
                        </div>
                        <time
                          className="text-xs text-muted-foreground"
                          dateTime={review.createdAt}
                        >
                          {new Intl.DateTimeFormat("vi-VN").format(
                            new Date(review.createdAt),
                          )}
                        </time>
                        {review.text && (
                          <p className="whitespace-pre-wrap break-words text-sm leading-7">
                            {review.text}
                          </p>
                        )}
                        {review.reply?.text && (
                          <div className="space-y-2 rounded-lg bg-muted p-4">
                            <p className="text-sm font-semibold">
                              Phản hồi từ giảng viên
                            </p>
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {review.reply?.text}
                            </p>
                          </div>
                        )}
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Chưa có đánh giá nào.
                </p>
              )}</>;
}
