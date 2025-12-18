import { createConfiguration, DefaultApi, Notification } from '@onesignal/node-onesignal';

const appId = process.env.ONESIGNAL_APP_ID;
const restApiKey = process.env.ONESIGNAL_REST_API_KEY;

if (!appId) {
  throw new Error('ONESIGNAL_APP_ID is required');
}

if (!restApiKey) {
  throw new Error('ONESIGNAL_REST_API_KEY is required');
}

const configuration = createConfiguration({ appKey: restApiKey });
const oneSignalClient = new DefaultApi(configuration);

export async function sendPushNotification({
  userId,
  message,
  tokens,
}: {
  userId: string;
  message: string;
  tokens?: string[];
}) {
  const notification = new Notification();
  notification.app_id = appId;
  notification.contents = { en: message };

  if (tokens && tokens.length > 0) {
    notification.include_player_ids = tokens;
  } else {
    notification.include_external_user_ids = [userId];
  }

  await oneSignalClient.createNotification(notification);
}
