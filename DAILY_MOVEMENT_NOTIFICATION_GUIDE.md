# Daily Updates Notifications

Daily portfolio notifications use the backend scheduler as the source of truth.
After prices and portfolio snapshots are updated, the backend sends one Expo
push notification to every registered device that has `dailyPriceUpdates`
enabled. Expo delivers that push through FCM on Android and APNs on iOS.

## Why This Is The Production Path

Mobile background execution is not an exact-time scheduler. Android Doze mode
and iOS background execution rules can delay or skip a fetch task. The backend
already runs at the configured Kuwait time and sends the notification after the
snapshot is saved, so no client-side background task is needed and duplicate
notifications are avoided.

## Delivery Flow

1. The app requests notification permission on a physical Android or iOS device.
2. The app obtains an Expo push token using the EAS project ID.
3. The token is registered at `/api/v1/notifications/register-token`.
4. The app syncs `dailyPriceUpdates` to the backend preferences endpoint.
5. The backend updates prices, saves the snapshot, and sends the push through
   the Expo Push API using the `daily-updates` Android channel.
6. The app displays the notification in the foreground or background.
7. Tapping it routes to the portfolio tab using `type: "daily_update"`.

## Notification Format

Example:

```text
Title: 📈 Daily Updates
Body:  Portfolio up 2.45% (+150.000 KD)
       KD 6,280.000
```

For a negative movement, the title uses `📉` and the body says `down` with a
negative amount. The payload includes `changePct`, `dailyMovement`, `value`,
and `snapshotDate` for the app's deep-link and refresh behavior.

## Android Requirements

- Use an EAS development or production build. Expo Go cannot receive these
  remote pushes.
- Test on a physical device with notifications enabled for the app.
- The app creates the `daily-updates` channel during token registration.
- Android 13+ requires the runtime `POST_NOTIFICATIONS` permission, which the
  app requests before token registration.
- Android notification credentials must be configured for the EAS project.

## iOS Requirements

- Use an Apple-signed development or production build on a physical device.
- The app requests alert, sound, and badge permission before token registration.
- APNs credentials must be configured for the EAS project and bundle ID
  `com.portfoliotracker.app`.
- iOS Simulator is not a reliable target for remote push delivery.

## Testing Checklist

1. Install a development build on a physical Android device and an iPhone.
2. Sign in and confirm logs contain `[Push] Token registered with backend`.
3. Check `/api/v1/notifications/status` and confirm at least one token.
4. Confirm the backend scheduler logs the portfolio alert dispatch after the
   daily price and snapshot jobs.
5. Test with the app foregrounded, backgrounded, and terminated.
6. Tap the notification and verify that the portfolio tab opens.
7. Disable `Daily Portfolio Summary` in settings and verify the backend skips
   the push.
8. Reinstall the app and verify a new token is registered.

## Operational Checks

- Expo push tickets must be monitored for `DeviceNotRegistered` and invalid
  credentials; invalid tokens should be removed from `push_tokens`.
- Confirm both Android FCM and iOS APNs credentials are valid before release.
- Keep the backend scheduler enabled and verify its timezone is `Asia/Kuwait`.
- Do not reintroduce a client-side periodic background task for the daily push;
  it cannot provide the same timing or reliability.
