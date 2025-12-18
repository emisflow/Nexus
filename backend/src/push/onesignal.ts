import { createConfiguration, DefaultApi, Notification } from '@onesignal/node-onesignal';

let cached:
  | { appId: string; client: DefaultApi }
  | null
  | undefined = undefined;

function getOneSignal() {
  // cache result so we don’t recreate the client every call
  if (cached !== undefined) return cached;

  const appId = process.env.ONESIGNAL_APP_ID;
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || !restApiKey) {
    console.warn(
      '[OneSignal] Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY. Push notifications disabled.'
    );
    cached = null;
    return cached;
  }

  const configuration = createConfiguration({
    restApiKey: restApiKey,
  });
  cached = { appId, client: new DefaultApi(configuration) };
  return cached;
}

export async function sendPushNotification({
  userId,
  message,
  tokens,
}: {
  userId: string;
  message: string;
  tokens?: string[];
}) {
  const one = getOneSignal();
  if (!one) return; // don’t crash dev server

  const notification = new Notification();
  notification.app_id = one.appId;
  notification.contents = { en: message };

  if (tokens && tokens.length > 0) {
    (notification as any).include_external_user_ids = tokens;
  } else {
    (notification as any).include_external_user_ids = [userId];
  }

  await one.client.createNotification(notification);
}
