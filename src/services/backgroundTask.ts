import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const QUEUE_TASK = 'idea-bucket-queue';

// Runs every ~15+ minutes when Android allows it, so queued captures get processed
// even if the app is not opened again after the network returns.
TaskManager.defineTask(QUEUE_TASK, async () => {
  try {
    const { kick } = await import('./pipeline');
    const { rescheduleDigest } = await import('./digest');
    const { runAudioRetention } = await import('./maintenance');
    await kick();
    await runAudioRetention().catch(() => 0);
    await rescheduleDigest();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundQueue(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(QUEUE_TASK)) return;
    await BackgroundTask.registerTaskAsync(QUEUE_TASK, { minimumInterval: 15 });
  } catch (e) {
    console.warn('background task registration failed', e);
  }
}
