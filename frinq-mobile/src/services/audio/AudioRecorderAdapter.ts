import { AudioRecorder, AudioManager, FileFormat, FileDirectory } from 'react-native-audio-api';
import { unlink } from '@dr.pogodin/react-native-fs';
import { onAppPhase } from '../lifecycle/appLifecycle';

export type PermissionStatus = 'Undetermined' | 'Denied' | 'Granted';

export interface RecorderPort {
  enableFileOutput(options: { format: FileFormat; directory: FileDirectory }): { status: string; message?: string };
  start(): { status: string; message?: string };
  stop(): { status: 'success'; paths: string[]; size: number; duration: number } | { status: 'error'; message: string };
  pause(): void;
  resume(): void;
  onError(callback: (error: { message: string }) => void): void;
  clearOnError(): void;
}
export interface PermissionPort {
  requestRecordingPermissions(): Promise<PermissionStatus>;
}
export interface FilePort {
  unlink(path: string): Promise<void>;
}

export interface RecordingResult {
  fileUri: string;
  durationSec: number;
}

/** Matches the backend's hard cap (`_MAX_DURATION_SEC` in voice.py) — auto-stop
 *  here means an upload never gets rejected for length. */
const MAX_DURATION_MS = 120_000;

/**
 * Foreground-only voice recording. Mic permission is requested only from
 * `requestAndStart` (never proactively at screen mount). Recording always
 * writes an M4A cache file; the file is deleted after a successful upload,
 * on cancel, on re-record, and when the app backgrounds mid-recording — the
 * cache directory is a fallback, not the cleanup mechanism.
 */
export class AudioRecorderAdapter {
  private recording = false;
  private paused = false;
  private currentPath: string | null = null;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private unbindLifecycle: (() => void) | null = null;

  constructor(
    private readonly recorder: RecorderPort = new AudioRecorder() as unknown as RecorderPort,
    private readonly permissions: PermissionPort = AudioManager,
    private readonly files: FilePort = { unlink },
  ) {}

  isRecording(): boolean {
    return this.recording;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Pauses without tearing anything down — the native recorder stays
   *  primed, so resume() picks the same take back up. No-op if not
   *  currently recording. */
  pause(): void {
    if (!this.recording || this.paused) return;
    this.recorder.pause();
    this.paused = true;
  }

  resume(): void {
    if (!this.recording || !this.paused) return;
    this.recorder.resume();
    this.paused = false;
  }

  /** Requests permission, then starts recording if granted. `onAutoStop` fires
   *  if the 120s cap is hit before the caller stops manually; `onError` fires
   *  if the native recorder fails mid-recording (hardware/interruption) —
   *  without this, that failure would leave the UI stuck showing "recording"
   *  with no way out. */
  async requestAndStart(
    onAutoStop: (result: RecordingResult | null) => void,
    onError?: (message: string) => void,
    onInterrupted?: () => void,
  ): Promise<PermissionStatus> {
    const status = await this.permissions.requestRecordingPermissions();
    if (status !== 'Granted') return status;

    // A previous take that was never uploaded or explicitly cancelled must
    // not linger once a new recording starts.
    await this.deleteCurrentFile();

    const enabled = this.recorder.enableFileOutput({ format: FileFormat.M4A, directory: FileDirectory.Cache });
    if (enabled.status === 'error') throw new Error(enabled.message ?? 'enable_file_output_failed');
    const started = this.recorder.start();
    if (started.status === 'error') throw new Error(started.message ?? 'start_failed');

    this.recording = true;
    this.paused = false;
    this.bindBackgroundStop(onInterrupted);
    this.recorder.onError((e) => {
      this.recording = false;
      this.paused = false;
      this.clearAutoStop();
      this.unbindBackgroundStop();
      onError?.(e.message);
    });
    this.autoStopTimer = setTimeout(() => {
      this.stop().then(onAutoStop);
    }, MAX_DURATION_MS);
    return status;
  }

  /** Stops and returns the recorded file, or null if nothing was recording. */
  async stop(): Promise<RecordingResult | null> {
    if (!this.recording) return null;
    this.clearAutoStop();
    this.unbindBackgroundStop();
    this.recorder.clearOnError();
    const result = this.recorder.stop();
    this.recording = false;
    this.paused = false;
    if (result.status !== 'success' || !result.paths[0]) return null;
    this.currentPath = result.paths[0];
    return { fileUri: result.paths[0], durationSec: result.duration };
  }

  /** Abandons an in-progress recording (screen leave, explicit cancel) —
   *  stops if needed and always deletes the cache file. */
  async cancel(): Promise<void> {
    if (this.recording) await this.stop();
    await this.deleteCurrentFile();
  }

  /** Deletes the last recorded file. Call after a successful upload too, so
   *  the cache file never outlives its purpose. */
  async deleteCurrentFile(): Promise<void> {
    const path = this.currentPath;
    this.currentPath = null;
    if (!path) return;
    // ponytail: best-effort delete, OS cache eviction is the ceiling if this fails.
    await this.files.unlink(path).catch(() => {});
  }

  /** Guaranteed cleanup on unmount. */
  dispose(): void {
    this.clearAutoStop();
    this.unbindBackgroundStop();
    this.recorder.clearOnError();
    if (this.recording) {
      this.recorder.stop();
      this.recording = false;
      this.paused = false;
    }
    void this.deleteCurrentFile();
  }

  private bindBackgroundStop(onInterrupted?: () => void): void {
    this.unbindLifecycle = onAppPhase((phase) => {
      if (phase === 'background' && this.recording) {
        // Foreground-only recording: backgrounding discards the in-progress
        // take. Notify the caller so its UI resets instead of sitting stuck
        // on "recording…" with a running timer until the user taps stop.
        void this.cancel().finally(() => onInterrupted?.());
      }
    });
  }

  private unbindBackgroundStop(): void {
    this.unbindLifecycle?.();
    this.unbindLifecycle = null;
  }

  private clearAutoStop(): void {
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
    this.autoStopTimer = null;
  }
}
