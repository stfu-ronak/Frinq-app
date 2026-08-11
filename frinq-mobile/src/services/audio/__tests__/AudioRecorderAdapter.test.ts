import { AudioRecorderAdapter, RecorderPort, PermissionPort, FilePort, PermissionStatus } from '../AudioRecorderAdapter';

let mockPhaseListener: ((phase: 'active' | 'background') => void) | undefined;
jest.mock('../../lifecycle/appLifecycle', () => ({
  onAppPhase: jest.fn((listener: (phase: 'active' | 'background') => void) => {
    mockPhaseListener = listener;
    return () => {
      mockPhaseListener = undefined;
    };
  }),
}));

function makeRecorder(overrides: Partial<RecorderPort> = {}): RecorderPort {
  return {
    enableFileOutput: jest.fn(() => ({ status: 'success' })),
    start: jest.fn(() => ({ status: 'success' })),
    stop: jest.fn(() => ({ status: 'success', paths: ['/cache/clip.m4a'], size: 0.1, duration: 3 })),
    pause: jest.fn(),
    resume: jest.fn(),
    onError: jest.fn(),
    clearOnError: jest.fn(),
    ...overrides,
  };
}
function makePermissions(status: PermissionStatus = 'Granted'): PermissionPort {
  return { requestRecordingPermissions: jest.fn().mockResolvedValue(status) };
}
function makeFiles(): FilePort & { unlink: jest.Mock } {
  return { unlink: jest.fn().mockResolvedValue(undefined) };
}

describe('AudioRecorderAdapter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPhaseListener = undefined;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not start recording when permission is denied', async () => {
    const recorder = makeRecorder();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions('Denied'), makeFiles());

    const status = await adapter.requestAndStart(jest.fn());

    expect(status).toBe('Denied');
    expect(recorder.start).not.toHaveBeenCalled();
    expect(adapter.isRecording()).toBe(false);
  });

  it('starts recording as M4A in the cache directory once granted', async () => {
    const recorder = makeRecorder();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions('Granted'), makeFiles());

    const status = await adapter.requestAndStart(jest.fn());

    expect(status).toBe('Granted');
    expect(recorder.enableFileOutput).toHaveBeenCalledWith(expect.objectContaining({ format: expect.anything(), directory: expect.anything() }));
    expect(recorder.start).toHaveBeenCalled();
    expect(adapter.isRecording()).toBe(true);
  });

  it('pause() calls the native recorder and flips isPaused(); resume() reverses it', async () => {
    const recorder = makeRecorder();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), makeFiles());
    await adapter.requestAndStart(jest.fn());

    adapter.pause();
    expect(recorder.pause).toHaveBeenCalledTimes(1);
    expect(adapter.isPaused()).toBe(true);
    expect(adapter.isRecording()).toBe(true); // paused, not stopped

    adapter.resume();
    expect(recorder.resume).toHaveBeenCalledTimes(1);
    expect(adapter.isPaused()).toBe(false);
  });

  it('pause()/resume() are no-ops when nothing is recording', () => {
    const recorder = makeRecorder();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), makeFiles());

    adapter.pause();
    adapter.resume();

    expect(recorder.pause).not.toHaveBeenCalled();
    expect(recorder.resume).not.toHaveBeenCalled();
  });

  it('stop() while paused clears isPaused() along with isRecording()', async () => {
    const recorder = makeRecorder();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), makeFiles());
    await adapter.requestAndStart(jest.fn());
    adapter.pause();

    await adapter.stop();

    expect(adapter.isPaused()).toBe(false);
    expect(adapter.isRecording()).toBe(false);
  });

  it('stop() returns the file and duration, and clears recording state', async () => {
    const recorder = makeRecorder();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), makeFiles());
    await adapter.requestAndStart(jest.fn());

    const result = await adapter.stop();

    expect(result).toEqual({ fileUri: '/cache/clip.m4a', durationSec: 3 });
    expect(adapter.isRecording()).toBe(false);
  });

  it('stop() is a no-op when nothing is recording', async () => {
    const adapter = new AudioRecorderAdapter(makeRecorder(), makePermissions(), makeFiles());
    expect(await adapter.stop()).toBeNull();
  });

  it('auto-stops at 120s and reports the result via the callback', async () => {
    const recorder = makeRecorder();
    const files = makeFiles();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), files);
    const onAutoStop = jest.fn();

    await adapter.requestAndStart(onAutoStop);
    expect(adapter.isRecording()).toBe(true);

    await jest.advanceTimersByTimeAsync(120_000);

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(onAutoStop).toHaveBeenCalledWith({ fileUri: '/cache/clip.m4a', durationSec: 3 });
    expect(adapter.isRecording()).toBe(false);
  });

  it('cancel() stops an in-progress recording and deletes the cache file', async () => {
    const recorder = makeRecorder();
    const files = makeFiles();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), files);
    await adapter.requestAndStart(jest.fn());

    await adapter.cancel();

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(files.unlink).toHaveBeenCalledWith('/cache/clip.m4a');
    expect(adapter.isRecording()).toBe(false);
  });

  it('deleteCurrentFile() is a no-op when nothing was recorded', async () => {
    const files = makeFiles();
    const adapter = new AudioRecorderAdapter(makeRecorder(), makePermissions(), files);
    await adapter.deleteCurrentFile();
    expect(files.unlink).not.toHaveBeenCalled();
  });

  it('starting a new recording deletes an unresolved previous take first', async () => {
    const recorder = makeRecorder();
    const files = makeFiles();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), files);
    await adapter.requestAndStart(jest.fn());
    await adapter.stop(); // leaves currentPath set, never uploaded/deleted

    await adapter.requestAndStart(jest.fn());

    expect(files.unlink).toHaveBeenCalledWith('/cache/clip.m4a');
  });

  it('backgrounding the app while recording cancels, deletes the file, and notifies onInterrupted', async () => {
    const recorder = makeRecorder();
    const files = makeFiles();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), files);
    const onInterrupted = jest.fn();
    await adapter.requestAndStart(jest.fn(), undefined, onInterrupted);

    expect(mockPhaseListener).toBeDefined();
    mockPhaseListener!('background');
    // Drain the cancel() -> stop() -> deleteCurrentFile() -> .finally chain.
    await jest.advanceTimersByTimeAsync(0);

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(files.unlink).toHaveBeenCalledWith('/cache/clip.m4a');
    expect(adapter.isRecording()).toBe(false);
    // Without this the component's UI stays stuck on "recording…".
    expect(onInterrupted).toHaveBeenCalledTimes(1);
  });

  it('dispose() stops a recording synchronously without throwing', async () => {
    const recorder = makeRecorder();
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), makeFiles());
    await adapter.requestAndStart(jest.fn());

    expect(() => adapter.dispose()).not.toThrow();
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(adapter.isRecording()).toBe(false);
  });

  it('a failed native start() surfaces as a thrown error', async () => {
    const recorder = makeRecorder({ start: jest.fn(() => ({ status: 'error', message: 'boom' })) });
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), makeFiles());

    await expect(adapter.requestAndStart(jest.fn())).rejects.toThrow('boom');
  });

  it('a native mid-recording error clears recording state and notifies onError', async () => {
    let errorHandler: ((e: { message: string }) => void) | undefined;
    const recorder = makeRecorder({ onError: jest.fn((cb) => { errorHandler = cb; }) });
    const adapter = new AudioRecorderAdapter(recorder, makePermissions(), makeFiles());
    const onError = jest.fn();

    await adapter.requestAndStart(jest.fn(), onError);
    expect(adapter.isRecording()).toBe(true);
    expect(errorHandler).toBeDefined();

    errorHandler!({ message: 'mic interrupted' });

    expect(adapter.isRecording()).toBe(false);
    expect(onError).toHaveBeenCalledWith('mic interrupted');
  });
});
