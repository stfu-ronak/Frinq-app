import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { AudioRecorderAdapter, RecordingResult } from '../../../services/audio/AudioRecorderAdapter';
import { uploadVoiceClip } from '../quizSyncService';
import { useSession } from '../../../services/session/sessionContext';
import { PressableScale } from '../../../design/motion/PressableScale';
import { BodyText } from '../../../design/components/Text';
import { spacing, radius, touchTarget } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';

type Phase = 'idle' | 'requesting' | 'recording' | 'uploading' | 'success' | 'error' | 'permissionDenied';

type Props = {
  submissionId: string;
  questionKey: string;
};

/** Optional voice recording alongside a quiz text answer. Independent of the
 *  typed answer — uploading (or not) never affects Continue's validity. */
export function VoiceAnswer({ submissionId, questionKey }: Props) {
  const { apiClient } = useSession();
  const adapterRef = useRef<AudioRecorderAdapter | undefined>(undefined);
  if (!adapterRef.current) adapterRef.current = new AudioRecorderAdapter();
  const adapter = adapterRef.current;

  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const pendingRef = useRef<RecordingResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      // Skip disposal mid-upload — dispose() deletes the cache file, which
      // would race the in-flight upload still reading it. The upload's own
      // completion (success or error) is what cleans up in that case; it
      // isn't tied to this component's lifecycle.
      if (phaseRef.current !== 'uploading') adapter.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTimer() {
    setElapsedSec(0);
    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
  }
  function stopTimer() {
    clearInterval(timerRef.current);
  }

  async function upload(result: RecordingResult) {
    pendingRef.current = result;
    setPhase('uploading');
    try {
      await uploadVoiceClip(apiClient, submissionId, questionKey, result.fileUri, result.durationSec);
      pendingRef.current = null;
      await adapter.deleteCurrentFile();
      setPhase('success');
    } catch {
      setPhase('error');
    }
  }

  async function handleRecordPress() {
    setPhase('requesting');
    try {
      const status = await adapter.requestAndStart(
        (autoStopped) => {
          stopTimer();
          if (autoStopped) void upload(autoStopped);
          else setPhase('error');
        },
        () => {
          stopTimer();
          setPhase('error');
        },
        () => {
          // Backgrounded mid-recording: the take is discarded (foreground
          // only). Reset to idle so the user can simply record again, rather
          // than returning to a frozen "recording…" screen.
          stopTimer();
          setPhase('idle');
        },
      );
      if (status === 'Granted') {
        setPhase('recording');
        startTimer();
      } else {
        setPhase('permissionDenied');
      }
    } catch {
      // Native enableFileOutput()/start() failure (e.g. hardware busy) —
      // without this, the button was stuck disabled in 'requesting' forever.
      setPhase('error');
    }
  }

  async function handleStopPress() {
    stopTimer();
    const result = await adapter.stop();
    if (result) void upload(result);
    else setPhase('error');
  }

  async function handleCancelPress() {
    stopTimer();
    await adapter.cancel();
    setPhase('idle');
  }

  async function handleRetryUpload() {
    if (pendingRef.current) void upload(pendingRef.current);
  }

  if (phase === 'permissionDenied') {
    return (
      <View style={styles.wrap}>
        <BodyText variant="body" tone="secondary">
          Frinq needs microphone access to record a voice answer.
        </BodyText>
        <View style={styles.row}>
          <PressableScale accessibilityRole="button" onPress={handleRecordPress} style={styles.linkButton}>
            <BodyText variant="bodyStrong" tone="primary">try again</BodyText>
          </PressableScale>
          <PressableScale accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.linkButton}>
            <BodyText variant="bodyStrong" tone="primary">open settings</BodyText>
          </PressableScale>
        </View>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.wrap}>
        <BodyText variant="body" tone="error">
          Couldn't save your voice answer.
        </BodyText>
        <View style={styles.row}>
          <PressableScale accessibilityRole="button" onPress={handleRetryUpload} style={styles.linkButton}>
            <BodyText variant="bodyStrong" tone="primary">retry upload</BodyText>
          </PressableScale>
          <PressableScale accessibilityRole="button" onPress={handleRecordPress} style={styles.linkButton}>
            <BodyText variant="bodyStrong" tone="primary">re-record</BodyText>
          </PressableScale>
        </View>
      </View>
    );
  }

  if (phase === 'success') {
    return (
      <View style={styles.wrap}>
        <BodyText variant="body" style={{ color: color.state.success }}>
          voice answer saved
        </BodyText>
        <PressableScale accessibilityRole="button" onPress={handleRecordPress} style={styles.linkButton}>
          <BodyText variant="bodyStrong" tone="primary">re-record</BodyText>
        </PressableScale>
      </View>
    );
  }

  if (phase === 'recording') {
    return (
      <View style={styles.wrap} accessibilityLiveRegion="polite">
        <View style={styles.row}>
          <View style={styles.recDot} />
          <BodyText variant="body" tone="secondary">recording… {elapsedSec}s</BodyText>
        </View>
        <View style={styles.row}>
          <PressableScale accessibilityRole="button" accessibilityLabel="stop recording" onPress={handleStopPress} style={styles.circleButton}>
            <BodyText variant="bodyStrong" style={{ color: color.control.primaryText }}>stop</BodyText>
          </PressableScale>
          <PressableScale accessibilityRole="button" accessibilityLabel="cancel recording" onPress={handleCancelPress} style={styles.linkButton}>
            <BodyText variant="bodyStrong" tone="secondary">cancel</BodyText>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="record a voice answer"
        accessibilityState={{ busy: phase === 'requesting' || phase === 'uploading' }}
        onPress={handleRecordPress}
        disabled={phase === 'requesting' || phase === 'uploading'}
        style={styles.circleButton}
      >
        <BodyText variant="bodyStrong" style={{ color: color.control.primaryText }}>
          {phase === 'requesting' ? '…' : phase === 'uploading' ? 'saving…' : 'record'}
        </BodyText>
      </PressableScale>
      <BodyText variant="body" tone="secondary">or just type your answer below (optional)</BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  circleButton: {
    minHeight: touchTarget.preferred,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: color.control.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  linkButton: { minHeight: touchTarget.min, justifyContent: 'center' },
  recDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: color.state.error },
});
