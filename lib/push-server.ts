// Server-only push config — only ever imported by route handlers (app/api/**),
// never by a "use client" component, so this never reaches the browser bundle.
//
// These are hardcoded rather than set as Vercel env vars because we don't have
// dashboard access to add them there. Since this repo is public on GitHub,
// treat them as "lightly obscured" rather than truly secret: worst case if
// someone got hold of either, they could send fake push notifications to
// subscribed devices for this app. No money or personal data is exposed by
// that — Alpaca/Supabase credentials are separate and stay as real secrets
// (GitHub Actions secrets, never committed).
export const VAPID_PRIVATE_KEY = "4Wsnh6eXTuesZEZZ7LItUWeO7uc1vBvhglix_7HrxIE";
export const VAPID_PUBLIC_KEY = "BG8jAKUkVgj3wjjLHulPx_zfYVt4HXDscODCK0x6gOGy6HLFxHAgMOH5Ip5Qa0Jq5bbDQ0Tg_XvVX6LG0Zcj8K0";
export const VAPID_SUBJECT = "mailto:argus@trading-agent-dashboard.vercel.app";

// Shared secret the trading agent (Paper-trading-agent repo) sends as a
// header when posting to /api/notify, so the endpoint isn't wide open to
// anyone who finds the URL. Same caveat as above: public repo, so this is a
// speed bump against casual abuse, not real authentication.
export const NOTIFY_SECRET = "ypiU8EP1KrcoDoQtJ11YHNzAYfahZgjt";

export async function sendToAllSubscriptions(title: string, body: string, url = "/") {
  const webpush = (await import("web-push")).default;
  const { getAllSubscriptions, deleteSubscription } = await import("./supabase");

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ title, body, url });

  const subs = await getAllSubscriptions();
  let sent = 0;
  let pruned = 0;
  const errors: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (e: unknown) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deleteSubscription(sub.endpoint).catch(() => {});
          pruned++;
        } else {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    })
  );

  return { subscriberCount: subs.length, sent, pruned, errors };
}
