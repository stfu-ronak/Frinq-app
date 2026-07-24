import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { VoiceAnswer } from '../VoiceAnswer';
import { uploadVoiceClip } from '../../quizSyncService';

const mockRequestAndStart = jest.fn();
const mockStop = jest.fn();
const mockCancel = jest.fn();
const mockDispose = jest.fn();
const mockDeleteCurrentFile = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../../services/audio/AudioRecorderAdapter', () => ({
  AudioRecorderAdapter: jest.fn().mockImplementation(() => ({
    requestAndStart: mockRequestAndStart,
    stop: mockStop,
    cancel: mockCancel,
    dispose: mockDispose,
    deleteCurrentFile: mockDeleteCurrentFile,
    isRecording: () => false,
  })),
}));

jest.mock('../../quizSyncService', () => ({
  uploadVoiceClip: jest.fn(),
}));

jest.mock('../../../../services/session/sessionContext', () => ({
  useSession: () => ({ apiClient: 'the-api-client' }),
}));

const mockUploadVoiceClip = uploadVoiceClip as jest.Mock;

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
    expect(await findByText(/couldn't save your voice answer/i)).toBeTruthy();
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
    expect(mockDeleteCurrentFile).toHaveBeenCalledTimes(1);
  });

  it('shows an error with retry when upload fails, and retries with the same file', async () => {
    mockRequestAndStart.mockResolvedValue('Granted');
    mockStop.mockResolvedValue({ fileUri: 'file:///cache/clip.m4a', durationSec: 4 });
    mockUploadVoiceClip.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);

    const { findByLabelText, findByText } = render(<VoiceAnswer submissionId="sub-1" questionKey="story" />);
    fireEvent.press(await findByLabelText('record a voice answer'));
    fireEvent.press(await findByLabelText('stop recording'));

    expect(await findByText(/couldn't save/i)).toBeTruthy();

    fireEvent.press(await findByText('retry upload'));
    expect(await findByText('voice answer saved')).toBeTruthy();
    expect(mockUploadVoiceClip).toHaveBeenCalledTimes(2);
  });

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
});
