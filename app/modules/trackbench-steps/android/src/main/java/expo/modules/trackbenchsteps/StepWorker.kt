package expo.modules.trackbenchsteps

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

// Every 15 minutes (the shortest Android allows) the counter is read and saved, with the app closed.
class StepWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    StepReader.snapshot(applicationContext)
    return Result.success()
  }
}
