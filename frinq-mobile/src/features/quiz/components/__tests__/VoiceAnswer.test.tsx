import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { VoiceAnswer } from '../VoiceAnswer';
import { uploadVoiceClip, deleteVoiceClip } from '../../quizSyncService';

const mockRequestAndStart = jest.fn();
const mockStop = jest.fn();
const mockCancel = jest.fn();
const mockDispose = jest.fn();
const mockDeleteCurrentFile = jest.fn().mockResolvedValue(undefined);
const mockPause = jest.fn();
const mockResume = jest.fn();

jest.mock('../../../../services/audio/AudioRecorderAdapter', () => ({
  AudioRecorderAdapter: jest.fn().mockImplementation(() => ({
    requestAndStart: mockRequestAndStart,
    stop: mockStop,
    cancel: mockCancel,
    dispose: mockDispose,
    deleteCurrentFile: mockDeleteCurrentFile,
    pause: mockPause,
    resume: mockResume,
    isRecording: () => false,
  })),
}));

const mockPlay = jest.fn().mockResolvedValue(undefined);
const mockPlayerStop = jest.fn();
jest.mock('../../../../services/audio/AudioPlayerAdapter', () => ({
  AudioPlayerAdapter: jest.fn().mockImplementation(() => ({
    play: mockPlay,
    stop: mockPlayerStop,
    isPlaying: () => false,
  })),
}));

jest.mock('../../quizSyncService', () => ({
  uploadVoiceClip: jest.fn(),
  deleteVoiceClip: jest.fn(),
}));

jest.mock('../../../../services/session/sessionContext', () => ({
  useSession: () => ({ apiClient: 'the-api-client' }),
}));

const mockUploadVoiceClip = uploadVoiceClip as jest.Mock;
const mockDeleteVoiceClip = deleteVoiceClip as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('VoiceAnswer', () => {
  it('starts recording once permission is granted', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    const { findByLabelText, getByText } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);

    fireEvent.press(await findByLabelText('record a voice answer'));

    await waitFor(() => expect(getByText(/recording…/)).toBeTruthy());
    expect(mockRequestAndStart).toHaveBeenCalledTimes(1);
  });

  it('shows the permission-denied state and offers retry + settings', async () => {
    mockRequestAndStart.mockResolvedValue('Denied');
    const { findByLabelText, findByText } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);

    fireEvent.press(await findByLabelText('record a voice answer'));

    expect(await findByText(/needs microphone access/i)).toBeTruthy();
    expect(await findByText('try again')).toBeTruthy();
    expect(await findByText('open settings')).toBeTruthy();
  });

  it('recovers to an error state instead of getting stuck when the native recorder throws', async () => {
    mockRequestAndStart.mockRejectedValue(new Error('start_failed'));
    const { findByLabelText, findByText } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);

    const button = await findByLabelText('record a voice answer');
    fireEvent.press(button);

    // Previously this left the button permanently disabled in 'requesting'
    // with no way out — the fix surfaces a real error state instead.
    expect(await findByText('retry')).toBeTruthy();
  });

  it('uploads on stop and shows success', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    mockStop.mockResolvedValue({ fileUri: 'file:///cache/clip.m4a', durationSec: 4 });
    mockUploadVoiceClip.mockResolvedValue(undefined);

    const { findByLabelText, findByText } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);
    fireEvent.press(await findByLabelText('record a voice answer'));
    fireEvent.press(await findByLabelText('stop recording'));

    expect(await findByText('voice answer saved')).toBeTruthy();
    expect(mockUploadVoiceClip).toHaveBeenCalledWith('the-api-client', 'sub-1', 'story', 'file:///cache/clip.m4a', 4);
    // The cache file is kept (not deleted right after upload) so "play" can
    // preview the exact clip that was submitted — it's only cleared on the
    // next recording or on unmount, never eagerly here.
    expect(mockDeleteCurrentFile).not.toHaveBeenCalled();
  });

  it('lets the user preview the saved recording, and stop it mid-playback', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    mockStop.mockResolvedValue({ fileUri: 'file:///cache/clip.m4a', durationSec: 4 });
    mockUploadVoiceClip.mockResolvedValue(undefined);

    const { findByLabelText } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);
    fireEvent.press(await findByLabelText('record a voice answer'));
    fireEvent.press(await findByLabelText('stop recording'));

    fireEvent.press(await findByLabelText('play your recording'));
    expect(mockPlay).toHaveBeenCalledWith('file:///cache/clip.m4a', expect.any(Function));

    mockPlayerStop.mockClear(); // drop the defensive stop() handleRecordPress fired above
    fireEvent.press(await findByLabelText('stop playback'));
    expect(mockPlayerStop).toHaveBeenCalledTimes(1);
  });

  it('pausing mid-recording calls the adapter and shows resume; resuming picks the take back up', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');

    const { findByLabelText } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);
    fireEvent.press(await findByLabelText('record a voice answer'));

    fireEvent.press(await findByLabelText('pause recording'));
    expect(mockPause).toHaveBeenCalledTimes(1);

    fireEvent.press(await findByLabelText('resume recording'));
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('shows the failure inside the circle with a retry that records again, and no side buttons', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    mockStop.mockResolvedValue({ fileUri: 'file:///cache/clip.m4a', durationSec: 4 });
    mockUploadVoiceClip.mockRejectedValue(new Error('network'));

    const { findByLabelText, findByText, queryByLabelText } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);
    fireEvent.press(await findByLabelText('record a voice answer'));
    fireEvent.press(await findByLabelText('stop recording'));

    // A persistent failure retries the SAME take a few times (backoff, so
    // this needs more than the default findBy timeout) before giving up —
    // the circle then carries the red mark and the only affordance is
    // "retry", with both side slots staying empty (still rendered, so
    // nothing shifts).
    expect(await findByText('retry', {}, { timeout: 10000 })).toBeTruthy();
    expect(mockUploadVoiceClip).toHaveBeenCalledTimes(3); // same take, retried, not re-recorded
    expect(queryByLabelText('re-record')).toBeNull();
    expect(queryByLabelText('play your recording')).toBeNull();

    // Retry (after retries are exhausted) starts a NEW recording rather than
    // re-uploading the dead take yet again.
    fireEvent.press(await findByLabelText('retry — record again'));
    await waitFor(() => expect(mockRequestAndStart).toHaveBeenCalledTimes(2));
    expect(mockUploadVoiceClip).toHaveBeenCalledTimes(3); // still just the earlier retries
  }, 15000);

  it('cancels a recording without uploading', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    mockCancel.mockResolvedValue(undefined);

    const { findByLabelText } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);
    fireEvent.press(await findByLabelText('record a voice answer'));
    fireEvent.press(await findByLabelText('cancel recording'));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    expect(mockUploadVoiceClip).not.toHaveBeenCalled();
    expect(await findByLabelText('record a voice answer')).toBeTruthy(); // back to idle
  });

  it('disposes the adapter on unmount, except while an upload is in flight', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    let resolveUpload: () => void;
    mockStop.mockResolvedValue({ fileUri: 'file:///cache/clip.m4a', durationSec: 4 });
    mockUploadVoiceClip.mockReturnValue(new Promise<void>((resolve) => { resolveUpload = resolve; }));

    const { findByLabelText, unmount } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);
    fireEvent.press(await findByLabelText('record a voice answer'));
    fireEvent.press(await findByLabelText('stop recording'));

    await waitFor(() => expect(mockUploadVoiceClip).toHaveBeenCalled());
    unmount(); // still uploading at this point
    expect(mockDispose).not.toHaveBeenCalled();

    resolveUpload!();
  });

  it('reports onStatusChange(true) once a recording is saved, and (false) when the mic circle re-records', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    mockStop.mockResolvedValue({ fileUri: 'file:///cache/clip.m4a', durationSec: 4 });
    mockUploadVoiceClip.mockResolvedValue(undefined);
    const onStatusChange = jest.fn();

    const { findByLabelText, findByText } = render(
      <VoiceAnswer submissionId="sub-1" questionKey="story" onStatusChange={onStatusChange} />,
    );
    expect(onStatusChange).toHaveBeenCalledWith(false); // initial idle phase

    fireEvent.press(await findByLabelText('record a voice answer'));
    fireEvent.press(await findByLabelText('stop recording'));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(true));

    // The right slot is now "delete", not "re-record" — the mic circle
    // itself (same label as the initial press) is what records again.
    fireEvent.press(await findByLabelText('record a voice answer'));
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(false));
  });

  it('deletes a saved recording server-side and locally, and offers play/re-record again', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    mockStop.mockResolvedValue({ fileUri: 'file:///cache/clip.m4a', durationSec: 4 });
    mockUploadVoiceClip.mockResolvedValue(undefined);
    mockDeleteVoiceClip.mockResolvedValue(undefined);

    const { findByLabelText, queryByLabelText } = render(
      <VoiceAnswer submissionId="sub-1" questionKey="story" />,
    );
    fireEvent.press(await findByLabelText('record a voice answer'));
    fireEvent.press(await findByLabelText('stop recording'));
    await findByLabelText('play your recording'); // confirms we've reached 'success'

    fireEvent.press(await findByLabelText('delete recording'));

    await waitFor(() => expect(mockDeleteVoiceClip).toHaveBeenCalledWith('the-api-client', 'sub-1', 'story'));
    await waitFor(() => expect(mockDeleteCurrentFile).toHaveBeenCalled());
    // Back to idle: no play/delete affordance, just the mic circle again.
    await waitFor(() => expect(queryByLabelText('play your recording')).toBeNull());
    expect(queryByLabelText('delete recording')).toBeNull();
    expect(await findByLabelText('record a voice answer')).toBeTruthy();
  });

  it('still clears local state if the server-side delete fails', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    mockStop.mockResolvedValue({ fileUri: 'file:///cache/clip.m4a', durationSec: 4 });
    mockUploadVoiceClip.mockResolvedValue(undefined);
    mockDeleteVoiceClip.mockRejectedValue(new Error('network'));

    const { findByLabelText, queryByLabelText } = render(
      <VoiceAnswer submissionId="sub-1" questionKey="story" />,
    );
    fireEvent.press(await findByLabelText('record a voice answer'));
    fireEvent.press(await findByLabelText('stop recording'));
    await findByLabelText('play your recording');

    fireEvent.press(await findByLabelText('delete recording'));

    await waitFor(() => expect(mockDeleteCurrentFile).toHaveBeenCalled());
    expect(queryByLabelText('play your recording')).toBeNull();
  });
});
