import { timingSafeEqual } from "node:crypto";
import { getSepayConfig } from "@/lib/sepay-config";
import { NextResponse } from "next/server";
import { db } from "@/services";
import { orders, orderEvents, orderItems, vouchers, payments } from "@codi-1/db";
import { studentTransactions, studentEnrollments } from "@codi-1/db/schema/student-profile";
import { createNotificationService } from "@/lib/notification-service";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

function verifyApiKey(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const expected = `Apikey ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

export async function POST(req: Request) {
  try {
    // Authenticate the webhook request
    const config = getSepayConfig();
    if (!config) {
      return NextResponse.json({ success: false, message: "Payments unavailable" }, { status: 503 });
    }
    const apiKey = config.webhookSecret;
    const authHeader = req.headers.get("authorization");
    if (!verifyApiKey(authHeader, apiKey)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();

    // Verify it's an incoming transfer
    if (data.transferType !== "in") {
      return NextResponse.json({ success: true, message: "Ignored outbound transfer" });
    }

    // Verify it's for the correct account
    const expectedAccount = config.receiver.accountNumber;
    if (data.accountNumber !== expectedAccount) {
      return NextResponse.json({ success: true, message: "Ignored transfer to different account" });
    }

    // SePay sends the transfer content in data.content or data.description
    const content = data.content || data.description || "";

    // Find our specific transaction ID format (e.g., CODI12345)
    const match = content.match(/CODI\d{5}/i);

    if (!match) {
      console.log("No valid CODI transaction ID found in content:", content);
      return NextResponse.json({ success: true, message: "No matching ID, ignored" });
    }

    const txId = match[0].toUpperCase();
    const providerTxCode = data.id != null ? String(data.id) : (data.referenceCode != null ? String(data.referenceCode) : null);

    // Find the transaction in DB
    const [tx] = await db.select().from(studentTransactions).where(eq(studentTransactions.id, txId)).limit(1);

    if (!tx) {
      console.log("Transaction not found for ID:", txId);
      return NextResponse.json({ success: true, message: "Transaction not found" });
    }

    const amountReceived = data.transferAmount || data.amountIn || 0;

    // Process payment atomically within transaction
    const processResult = await db.transaction(async (txDB) => {
      // Serialize concurrent transfers for this transaction/order code
      await txDB.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${txId}))`);

      // Idempotency check on provider transactionCode if available
      if (providerTxCode) {
        const [existingPayment] = await txDB
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.transactionCode, providerTxCode))
          .limit(1);

        if (existingPayment) {
          return { alreadyProcessed: true };
        }
      }

      // 1. Check if there is an associated order in the `orders` table
      const [existingOrder] = await txDB
        .select({
          id: orders.id,
          code: orders.code,
          userId: orders.userId,
          status: orders.status,
          failReason: orders.failReason,
          totalAmount: orders.totalAmount,
          receivedAmount: orders.receivedAmount,
          voucherId: orders.voucherId,
        })
        .from(orders)
        .where(eq(orders.code, txId))
        .limit(1);

      let isLateHonoured = false;

      // Handle non-pending order
      if (existingOrder && existingOrder.status !== "pending") {
        // D2 late payment after expiry: if failed with failReason='expired'
        if (existingOrder.status === "failed" && existingOrder.failReason === "expired") {
          // Check if learner already owns every course in the order
          const items = await txDB
            .select({ courseId: orderItems.courseId })
            .from(orderItems)
            .where(eq(orderItems.orderId, existingOrder.id));

          const itemCourseIds = items.map((it) => it.courseId);
          let allAlreadyOwned = false;

          if (itemCourseIds.length > 0) {
            const owned = await txDB
              .select({ courseId: studentEnrollments.courseId })
              .from(studentEnrollments)
              .where(
                and(
                  eq(studentEnrollments.userId, tx.userId),
                  inArray(studentEnrollments.courseId, itemCourseIds),
                ),
              );

            if (owned.length === itemCourseIds.length) {
              allAlreadyOwned = true;
            }
          }

          if (allAlreadyOwned) {
            // Already owned via newer order -> keep failed, needs reconciliation for refund
            await txDB
              .update(orders)
              .set({ needsReconciliation: true })
              .where(eq(orders.id, existingOrder.id));

            await txDB.insert(orderEvents).values({
              orderId: existingOrder.id,
              label: "Thanh toán muộn cho các khoá đã sở hữu (Cần đối soát hoàn tiền)",
              actorId: tx.userId,
            });

            if (providerTxCode) {
              await txDB.insert(payments).values({
                orderId: existingOrder.id,
                transactionCode: providerTxCode,
                method: "bank_transfer",
                amount: amountReceived,
                transferContent: content,
                status: "failed",
                failureReason: "Khoá học đã được sở hữu, cần đối soát",
                providerResponse: JSON.stringify(data),
              });
            }

            return { orderNotPending: true, orderStatus: "failed_already_owned" };
          }

          // Auto-honour candidate: failed (expired) order
          isLateHonoured = true;
        } else {
          // Keep terminal status and fulfillment unchanged, but account for a
          // distinct receipt after cancellation or settlement. Provider replay
          // has already been rejected under the transaction-code lock above.
          if (existingOrder.status === "cancelled" || existingOrder.status === "paid") {
            await txDB
              .update(orders)
              .set({
                receivedAmount: existingOrder.receivedAmount + amountReceived,
                needsReconciliation: true,
                updatedAt: new Date(),
              })
              .where(eq(orders.id, existingOrder.id));

            await txDB.insert(orderEvents).values({
              orderId: existingOrder.id,
              label: existingOrder.status === "paid"
                ? "Nhận thêm thanh toán sau khi đơn đã thanh toán (cần đối soát hoàn tiền)"
                : "Nhận thanh toán sau khi đơn đã huỷ (cần đối soát hoàn tiền)",
              actorId: tx.userId,
            });
          }

          await txDB
            .update(studentTransactions)
            .set({ status: "failed" })
            .where(and(eq(studentTransactions.id, txId), eq(studentTransactions.status, "pending")));

          if (providerTxCode) {
            await txDB.insert(payments).values({
              orderId: existingOrder.id,
              transactionCode: providerTxCode,
              method: "bank_transfer",
              amount: amountReceived,
              transferContent: content,
              status: "failed",
              failureReason: `Order is not pending (status: ${existingOrder.status})`,
              providerResponse: JSON.stringify(data),
            });
          }

          return { orderNotPending: true, orderStatus: existingOrder.status };
        }
      }

      // Calculate accumulated amount
      const priorReceived = existingOrder ? existingOrder.receivedAmount : 0;
      const newAccumulated = priorReceived + amountReceived;
      const targetTotal = existingOrder ? existingOrder.totalAmount : tx.amount;
      const isUnderpaid = newAccumulated < targetTotal;

      // Record this transfer in payments table
      if (providerTxCode && existingOrder) {
        await txDB.insert(payments).values({
          orderId: existingOrder.id,
          transactionCode: providerTxCode,
          method: "bank_transfer",
          amount: amountReceived,
          transferContent: content,
          status: isUnderpaid ? "pending" : "success",
          paidAt: new Date(),
          providerResponse: JSON.stringify(data),
        });
      }

      if (isUnderpaid) {
        // Accumulate receivedAmount
        if (existingOrder) {
          const isExpiredOrder = existingOrder.status === "failed";
          await txDB
            .update(orders)
            .set({
              receivedAmount: newAccumulated,
              // If partial transfer arrived after expiry, order remains failed and needs manual reconciliation
              needsReconciliation: isExpiredOrder ? true : undefined,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, existingOrder.id));

          await txDB.insert(orderEvents).values({
            orderId: existingOrder.id,
            label: isExpiredOrder
              ? `Thanh toán thiếu sau khi hết hạn: nhận thêm ${amountReceived.toLocaleString("vi-VN")} ₫ (Tổng nhận: ${newAccumulated.toLocaleString("vi-VN")} ₫ / Cần: ${targetTotal.toLocaleString("vi-VN")} ₫, cần đối soát)`
              : `Đã nhận một phần: ${amountReceived.toLocaleString("vi-VN")} ₫ (Tổng nhận: ${newAccumulated.toLocaleString("vi-VN")} ₫ / Cần: ${targetTotal.toLocaleString("vi-VN")} ₫)`,
            actorId: tx.userId,
          });
        }

        return { underpaid: true, receivedAmount: newAccumulated, targetTotal };
      }

      // Full or excess amount reached: settle order
      // 2. Atomically update transaction status if pending or late-honoured
      const updatedTx = await txDB
        .update(studentTransactions)
        .set({ status: "paid" })
        .where(
          and(
            eq(studentTransactions.id, txId),
            or(
              eq(studentTransactions.status, "pending"),
              sql`${isLateHonoured} AND ${studentTransactions.status} = 'failed'`,
            ),
          ),
        )
        .returning({ id: studentTransactions.id });

      // If studentTransactions was already transitioned by a concurrent process (e.g. cancelled)
      if (updatedTx.length === 0 && !isLateHonoured) {
        // Fetch fresh order state to determine whether order was cancelled or already settled
        const [freshOrder] = existingOrder
          ? await txDB
              .select({
                id: orders.id,
                status: orders.status,
                receivedAmount: orders.receivedAmount,
              })
              .from(orders)
              .where(eq(orders.id, existingOrder.id))
              .limit(1)
          : [null];

        // If order exists and is not paid (e.g. cancelled or failed), mark for reconciliation and fail payment receipt
        if (freshOrder && freshOrder.status !== "paid") {
          await txDB
            .update(orders)
            .set({
              receivedAmount: newAccumulated,
              needsReconciliation: true,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, freshOrder.id));

          await txDB.insert(orderEvents).values({
            orderId: freshOrder.id,
            label: `Nhận thanh toán sau khi giao dịch đã ở trạng thái ${freshOrder.status} (cần đối soát hoàn tiền)`,
            actorId: tx.userId,
          });

          await txDB
            .update(studentTransactions)
            .set({ status: "failed" })
            .where(eq(studentTransactions.id, txId));

          if (providerTxCode) {
            await txDB
              .update(payments)
              .set({
                status: "failed",
                failureReason: `Giao dịch đã kết thúc hoặc bị huỷ (status: ${freshOrder.status})`,
              })
              .where(eq(payments.transactionCode, providerTxCode));
          }

          return { orderNotPending: true, orderStatus: freshOrder.status };
        }

        // If order was already paid or no order exists (legacy duplicate webhook delivery)
        return { alreadyProcessed: true };
      }

      let courseIdsToEnroll: string[] = [tx.courseId];

      // 3. Atomically settle orders table
      if (existingOrder && (existingOrder.status === "pending" || isLateHonoured)) {
        const isOverpaid = newAccumulated > existingOrder.totalAmount;
        const targetStatus = isLateHonoured ? "failed" : "pending";

        const updatedOrders = await txDB
          .update(orders)
          .set({
            status: "paid",
            receivedAmount: newAccumulated,
            needsReconciliation: isOverpaid ? true : existingOrder.status === "failed" ? false : undefined,
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(orders.code, txId), eq(orders.status, targetStatus)))
          .returning({ id: orders.id, totalAmount: orders.totalAmount, voucherId: orders.voucherId });

        const matchedOrder = updatedOrders[0];
        if (matchedOrder) {
          await txDB.insert(orderEvents).values({
            orderId: matchedOrder.id,
            label: isLateHonoured ? "Thanh toán muộn được chấp nhận" : "Đã nhận tiền",
            actorId: tx.userId,
          });

          if (isOverpaid) {
            await txDB.insert(orderEvents).values({
              orderId: matchedOrder.id,
              label: `Chuyển thừa ${newAccumulated - existingOrder.totalAmount} ₫ (Cần đối soát)`,
              actorId: tx.userId,
            });
          }

          // Fetch all courses in order_items with their order item ID
          const itemsResult = await txDB
            .select({ id: orderItems.id, courseId: orderItems.courseId })
            .from(orderItems)
            .where(eq(orderItems.orderId, matchedOrder.id));

          const items = Array.isArray(itemsResult) ? itemsResult : [];

          if (items.length > 0) {
            courseIdsToEnroll = items.map((it) => it.courseId);
          }

          // Atomically increment voucher used_count if a voucher was applied
          if (matchedOrder.voucherId) {
            const voucherRes = await txDB
              .update(vouchers)
              .set({
                usedCount: sql`${vouchers.usedCount} + 1`,
              })
              .where(
                and(
                  eq(vouchers.id, matchedOrder.voucherId),
                  or(
                    isNull(vouchers.usageLimit),
                    sql`${vouchers.usedCount} < ${vouchers.usageLimit}`,
                  ),
                ),
              )
              .returning({ id: vouchers.id });

            if (voucherRes.length === 0) {
              await txDB
                .update(orders)
                .set({ needsReconciliation: true })
                .where(eq(orders.id, matchedOrder.id));

              await txDB.insert(orderEvents).values({
                orderId: matchedOrder.id,
                label: "Mã giảm giá vượt hạn mức sử dụng khi thanh toán (Cần đối soát)",
                actorId: tx.userId,
              });
            }
          }

          // Send in-app notification
          try {
            await createNotificationService(txDB).notify(
              tx.userId,
              "Thanh toán thành công",
              `Đơn ${txId} đã được xác nhận. Khoá học đã sẵn sàng.`,
              `/checkout/success?order=${matchedOrder.id}`,
            );
          } catch (notifErr) {
            console.error("Failed to send payment notification:", notifErr);
          }

          // Enroll with order_item_id
          const itemMap = new Map<string, number>();
          for (const item of items) {
            itemMap.set(item.courseId, item.id);
          }

          for (const cId of courseIdsToEnroll) {
            await txDB
              .insert(studentEnrollments)
              .values({
                userId: tx.userId,
                courseId: cId,
                orderItemId: itemMap.get(cId),
              })
              .onConflictDoNothing();
          }
        } else {
          // Concurrent status transition occurred between initial check and update.
          // Fetch fresh order record under transaction lock.
          const [freshOrder] = await txDB
            .select({
              id: orders.id,
              status: orders.status,
              failReason: orders.failReason,
              totalAmount: orders.totalAmount,
              voucherId: orders.voucherId,
            })
            .from(orders)
            .where(eq(orders.code, txId))
            .limit(1);

          if (freshOrder && freshOrder.status === "failed" && freshOrder.failReason === "expired") {
            // Concurrent expiry occurred: apply late payment rules (D2)
            const freshItems = await txDB
              .select({ id: orderItems.id, courseId: orderItems.courseId })
              .from(orderItems)
              .where(eq(orderItems.orderId, freshOrder.id));
            const freshCourseIds = freshItems.map((it) => it.courseId);

            let allFreshOwned = false;
            if (freshCourseIds.length > 0) {
              const owned = await txDB
                .select({ courseId: studentEnrollments.courseId })
                .from(studentEnrollments)
                .where(
                  and(
                    eq(studentEnrollments.userId, tx.userId),
                    inArray(studentEnrollments.courseId, freshCourseIds),
                  ),
                );
              if (owned.length === freshCourseIds.length) {
                allFreshOwned = true;
              }
            }

            if (!allFreshOwned) {
              // Auto-honour: transition from failed to paid
              const isOverpaid = newAccumulated > freshOrder.totalAmount;
              await txDB
                .update(orders)
                .set({
                  status: "paid",
                  receivedAmount: newAccumulated,
                  needsReconciliation: isOverpaid ? true : false,
                  paidAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(and(eq(orders.id, freshOrder.id), eq(orders.status, "failed")));

              await txDB.insert(orderEvents).values({
                orderId: freshOrder.id,
                label: "Thanh toán muộn được chấp nhận",
                actorId: tx.userId,
              });

              if (isOverpaid) {
                await txDB.insert(orderEvents).values({
                  orderId: freshOrder.id,
                  label: `Chuyển thừa ${newAccumulated - freshOrder.totalAmount} ₫ (Cần đối soát)`,
                  actorId: tx.userId,
                });
              }

              if (freshCourseIds.length > 0) {
                courseIdsToEnroll = freshCourseIds;
              }

              if (freshOrder.voucherId) {
                const voucherRes = await txDB
                  .update(vouchers)
                  .set({
                    usedCount: sql`${vouchers.usedCount} + 1`,
                  })
                  .where(
                    and(
                      eq(vouchers.id, freshOrder.voucherId),
                      or(
                        isNull(vouchers.usageLimit),
                        sql`${vouchers.usedCount} < ${vouchers.usageLimit}`,
                      ),
                    ),
                  )
                  .returning({ id: vouchers.id });

                if (voucherRes.length === 0) {
                  await txDB
                    .update(orders)
                    .set({ needsReconciliation: true })
                    .where(eq(orders.id, freshOrder.id));

                  await txDB.insert(orderEvents).values({
                    orderId: freshOrder.id,
                    label: "Mã giảm giá vượt hạn mức sử dụng khi thanh toán (Cần đối soát)",
                    actorId: tx.userId,
                  });
                }
              }

              try {
                await createNotificationService(txDB).notify(
                  tx.userId,
                  "Thanh toán thành công",
                  `Đơn ${txId} đã được xác nhận. Khoá học đã sẵn sàng.`,
                  `/checkout/success?order=${freshOrder.id}`,
                );
              } catch (notifErr) {
                console.error("Failed to send payment notification:", notifErr);
              }

              const itemMap = new Map<string, number>();
              for (const item of freshItems) {
                itemMap.set(item.courseId, item.id);
              }

              for (const cId of courseIdsToEnroll) {
                await txDB
                  .insert(studentEnrollments)
                  .values({
                    userId: tx.userId,
                    courseId: cId,
                    orderItemId: itemMap.get(cId),
                  })
                  .onConflictDoNothing();
              }
            } else {
              // Already owned: flag for reconciliation and revert transaction status
              await txDB
                .update(orders)
                .set({
                  receivedAmount: newAccumulated,
                  needsReconciliation: true,
                  updatedAt: new Date(),
                })
                .where(eq(orders.id, freshOrder.id));

              await txDB.insert(orderEvents).values({
                orderId: freshOrder.id,
                label: "Thanh toán muộn cho các khoá đã sở hữu (Cần đối soát hoàn tiền)",
                actorId: tx.userId,
              });

              await txDB
                .update(studentTransactions)
                .set({ status: "failed" })
                .where(eq(studentTransactions.id, txId));

              if (providerTxCode) {
                await txDB
                  .update(payments)
                  .set({
                    status: "failed",
                    failureReason: "Khoá học đã được sở hữu, cần đối soát",
                  })
                  .where(eq(payments.transactionCode, providerTxCode));
              }

              return { orderNotPending: true, orderStatus: "failed_already_owned" };
            }
          } else {
            // Order is cancelled or another non-pending state: mark for reconciliation
            if (freshOrder) {
              await txDB
                .update(orders)
                .set({
                  receivedAmount: newAccumulated,
                  needsReconciliation: true,
                  updatedAt: new Date(),
                })
                .where(eq(orders.id, freshOrder.id));

              await txDB.insert(orderEvents).values({
                orderId: freshOrder.id,
                label: `Nhận thanh toán khi đơn không ở trạng thái chờ (status: ${freshOrder.status}, cần đối soát)`,
                actorId: tx.userId,
              });
            }

            await txDB
              .update(studentTransactions)
              .set({ status: "failed" })
              .where(eq(studentTransactions.id, txId));

            if (providerTxCode) {
              await txDB
                .update(payments)
                .set({
                  status: "failed",
                  failureReason: `Order is not pending (status: ${freshOrder?.status ?? "unknown"})`,
                })
                .where(eq(payments.transactionCode, providerTxCode));
            }

            return { orderNotPending: true, orderStatus: freshOrder?.status ?? "non-pending" };
          }
        }
      } else {
        // Fallback for legacy transactions without orders table entry
        for (const cId of courseIdsToEnroll) {
          await txDB
            .insert(studentEnrollments)
            .values({
              userId: tx.userId,
              courseId: cId,
            })
            .onConflictDoNothing();
        }
      }

      return { success: true };
    });

    if (processResult.alreadyProcessed) {
      return NextResponse.json({ success: true, message: "Already processed" });
    }

    if (processResult.underpaid) {
      return NextResponse.json({
        success: true,
        underpaid: true,
        receivedAmount: processResult.receivedAmount,
        targetTotal: processResult.targetTotal,
      });
    }

    if (processResult.orderNotPending) {
      console.warn(`Order ${txId} is not in pending state (was ${processResult.orderStatus ?? "non-pending"}). Ignored enrollment, marked for reconciliation.`);
      return NextResponse.json({ success: true, message: "Order not pending, marked for reconciliation" });
    }

    console.log(`Successfully processed transaction ${txId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

