package expo.modules.trackbenchsteps

import android.Manifest
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

class TrackbenchStepsModule : Module() {
  private val context get() = appContext.reactContext ?: throw IllegalStateException("No context")

  override fun definition() = ModuleDefinition {
    Name("TrackbenchSteps")

    // Does this phone have a step counter at all?
    Function("isAvailable") { StepReader.available(context) }

    // The counter right now (no saving).
    AsyncFunction("readCounter") { StepReader.read(context) }

    // The counter right now, saved to the log with the time.
    AsyncFunction("snapshot") { StepReader.snapshot(context) }

    // Everything saved so far: one "time,counter" per line.
    Function("readLog") { StepReader.log(context) }

    // For testing a first run: take back the permissions this app was given (Android 13 and newer), then close the app so it takes effect.
    Function("resetPermissions") {
      if (Build.VERSION.SDK_INT < 33) return@Function false
      val ctx = context
      for (p in listOf(Manifest.permission.ACTIVITY_RECOGNITION, Manifest.permission.POST_NOTIFICATIONS, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) {
        try { ctx.revokeSelfPermissionOnKill(p) } catch (e: Exception) { }
      }
      Handler(Looper.getMainLooper()).postDelayed({ Process.killProcess(Process.myPid()) }, 500)
      true
    }

    // Keep saving a reading every 15 minutes with the app closed. Safe to call every time the app opens.
    Function("startBackground") {
      val request = PeriodicWorkRequestBuilder<StepWorker>(15, TimeUnit.MINUTES).build()
      WorkManager.getInstance(context).enqueueUniquePeriodicWork("trackbench-steps", ExistingPeriodicWorkPolicy.KEEP, request)
    }
  }
}
