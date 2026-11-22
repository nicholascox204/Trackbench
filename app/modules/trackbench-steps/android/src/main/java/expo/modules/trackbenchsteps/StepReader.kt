package expo.modules.trackbenchsteps

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

// The phone's own step counter: a running total of steps since the phone last started, kept by the hardware whether or not any app is open.
object StepReader {
  private const val PREFS = "trackbench_steps"
  private const val LOG = "log"
  private const val MAX_LINES = 1500
  private const val MIN_GAP_MS = 60_000L

  fun available(context: Context): Boolean {
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    return sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
  }

  // One reading, or null if there is no counter or no permission to use it. Blocks briefly; call off the main thread.
  fun read(context: Context, timeoutMs: Long = 4000): Double? {
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return null
    val latch = CountDownLatch(1)
    var value: Double? = null
    val thread = HandlerThread("trackbench-steps").also { it.start() }
    val listener = object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        value = event.values[0].toDouble()
        latch.countDown()
      }
      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }
    try {
      sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, Handler(thread.looper))
      latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    } catch (e: SecurityException) {
      value = null
    } finally {
      sm.unregisterListener(listener)
      thread.quitSafely()
    }
    return value
  }

  // A reading saved with the time, for working out the day's steps later. Not saved if the last one is under a minute old.
  @Synchronized
  fun snapshot(context: Context): Double? {
    val v = read(context) ?: return null
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val lines = (prefs.getString(LOG, "") ?: "").split("\n").filter { it.isNotBlank() }.toMutableList()
    val lastAt = lines.lastOrNull()?.substringBefore(",")?.toLongOrNull() ?: 0L
    if (now - lastAt >= MIN_GAP_MS) {
      lines.add("$now,${v.toLong()}")
      val kept = if (lines.size > MAX_LINES) lines.takeLast(MAX_LINES) else lines
      prefs.edit().putString(LOG, kept.joinToString("\n")).apply()
    }
    return v
  }

  fun log(context: Context): String = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(LOG, "") ?: ""
}
