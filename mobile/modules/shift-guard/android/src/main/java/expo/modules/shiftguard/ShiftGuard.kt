package expo.modules.shiftguard

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.LocationManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat

/**
 * Следит за переключателем геолокации, пока идёт смена.
 *
 * Сервис expo-location просыпается только от новых точек, а с выключенной геолокацией их нет,
 * поэтому JS об этом не узнаёт. Системная рассылка PROVIDERS_CHANGED приходит сразу, в том числе
 * в фоне: процесс жив, пока работает foreground service смены.
 *
 * Предупреждение рабочему показываем здесь же, без JS: оно должно появиться, даже если
 * JS-движок сейчас не запущен. JS получает событие и отмечает выключение на сервере.
 */
object ShiftGuard {
  private const val TAG = "ShiftGuard"
  private const val WARNING_CHANNEL = "location-off"
  private const val WARNING_ID = 7301
  /** Подписчик из ShiftGuardModule; null, когда JS-движок не запущен. */
  @Volatile var listener: ((Boolean) -> Unit)? = null

  private var receiver: BroadcastReceiver? = null
  private var lastEnabled: Boolean? = null

  // Текст предупреждения на языке приложения: передаёт JS при старте слежения
  private var warningTitle = "Location is off"
  private var warningBody = "Turn it back on to stay on shift, or your foreman will be notified."

  fun isLocationEnabled(context: Context): Boolean {
    val manager = context.getSystemService(LocationManager::class.java) ?: return false
    return LocationManagerCompat.isLocationEnabled(manager)
  }

  @Synchronized
  fun start(context: Context, title: String, body: String) {
    warningTitle = title
    warningBody = body
    if (receiver != null) return
    lastEnabled = isLocationEnabled(context)
    val r = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) = onChanged(c.applicationContext)
    }
    val filter = IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION).apply {
      addAction(LocationManager.MODE_CHANGED_ACTION)
    }
    // Системные рассылки доходят и до неэкспортированного приёмника
    ContextCompat.registerReceiver(context, r, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    receiver = r
  }

  @Synchronized
  fun stop(context: Context) {
    receiver?.let { runCatching { context.unregisterReceiver(it) } }
    receiver = null
    lastEnabled = null
    hideWarning(context)
  }

  @Synchronized
  private fun onChanged(context: Context) {
    val enabled = isLocationEnabled(context)
    if (enabled == lastEnabled) return // одна смена переключателя шлёт несколько рассылок
    lastEnabled = enabled
    if (enabled) hideWarning(context) else showWarning(context, warningTitle, warningBody)
    listener?.invoke(enabled)
  }

  fun showWarning(context: Context, title: String, body: String) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    ensureWarningChannel(context)
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val open = launch?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notification = NotificationCompat.Builder(context, WARNING_CHANNEL)
      .setSmallIcon(notificationIcon(context))
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setContentIntent(open)
      .setAutoCancel(true)
      .build()
    try {
      manager.notify(WARNING_ID, notification)
    } catch (e: SecurityException) {
      Log.w(TAG, "No permission to post notifications", e)
    }
  }

  fun hideWarning(context: Context) {
    NotificationManagerCompat.from(context).cancel(WARNING_ID)
  }

  /**
   * Канал постоянного уведомления «You're on shift» без значка-счётчика на иконке.
   * expo-location создаёт канал `<package>:<taskName>`, только если его ещё нет, — создаём заранее.
   * Настройки канала после создания не меняются, поэтому старый (со счётчиком) удаляем.
   * Вызывать до запуска службы: канал с активным уведомлением удалить нельзя.
   */
  fun prepareServiceChannel(context: Context, taskName: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val id = "${context.packageName}:$taskName"
    val existing = manager.getNotificationChannel(id)
    if (existing != null && !existing.canShowBadge()) return
    if (existing != null) runCatching { manager.deleteNotificationChannel(id) }
    val appName = context.applicationInfo.loadLabel(context.packageManager).toString()
    val channel = NotificationChannel(id, appName, NotificationManager.IMPORTANCE_LOW).apply {
      description = "Shown while you're on shift"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun ensureWarningChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(WARNING_CHANNEL) != null) return
    manager.createNotificationChannel(
      NotificationChannel(WARNING_CHANNEL, "Location is off", NotificationManager.IMPORTANCE_HIGH)
    )
  }

  /** Как у expo-location: белая иконка notification_icon, если есть, иначе иконка приложения. */
  private fun notificationIcon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }
}
