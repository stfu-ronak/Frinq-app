import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
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
  /** Fires whenever a saved recording becomes available (`true`, phase =
   *  'success') or stops being available (`false` — re-recording, cancelled,
   *  or errored). The parent template needs this to let a voice-only answer
   *  (no typed text) satisfy Continue — this was previously untracked, which
   *  left voice-only answers with no way to proceed. */
  onStatusChange?: (hasSavedRecording: boolean) => void;
};

/** Optional voice recording alongside a quiz text answer. Independent of the
 *  typed answer for VALIDATION purposes — a saved recording is reported via
 *  onStatusChange so the parent can treat it as an alternative to typed text,
 *  but this component itself never reads or writes the typed answer. */
export function VoiceAnswer({ submissionId, questionKey, onStatusChange }: Props) {
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
    onStatusChange?.(phase === 'success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
    <View style={[styles.wrap, styles.idleWrap]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="record a voice answer"
        accessibilityState={{ busy: phase === 'requesting' || phase === 'uploading' }}
        onPress={handleRecordPress}
        disabled={phase === 'requesting' || phase === 'uploading'}
        style={styles.micCircle}
      >
        {phase === 'requesting' || phase === 'uploading' ? (
          <BodyText variant="bodyStrong" tone="brand">
            {phase === 'uploading' ? '…' : '…'}
          </BodyText>
        ) : (
          <Svg width={32} height={32} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
            <Rect x={9} y={2} width={6} height={12} rx={3} fill={color.brand.maroon} />
            <Path
              d="M5 11a7 7 0 0 0 14 0M12 18v3"
              stroke={color.brand.maroon}
              strokeWidth={1.8}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        )}
      </PressableScale>
      <BodyText variant="caption" tone="secondary">
        {phase === 'uploading' ? 'saving…' : 'tap to speak'}
      </BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg, gap: spacing.sm },
  idleWrap: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  micCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: color.brand.cream,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
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
