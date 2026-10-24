import "server-only";
import webpush from "web-push";
import { listPushSubscriptions, removePushSubscriptionById } from "./reminders";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not set");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** Sends a push notification to every registered subscription, dropping ones the browser rejected. */
export async function broadcastPush(payload: PushPayload): Promise<{ sent: number; removed: number }> {
  ensureConfigured();
  const subs = await listPushSubscriptions();
  let sent = 0;
  let removed = 0;
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await removePushSubscriptionById(sub.id);
          removed++;
        } else {
          console.error("[push] send failed", status, e);
        }
      }
    }),
  );
  return { sent, removed };
}
