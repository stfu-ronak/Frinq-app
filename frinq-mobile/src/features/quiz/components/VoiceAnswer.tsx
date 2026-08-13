import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AudioRecorderAdapter, RecordingResult } from '../../../services/audio/AudioRecorderAdapter';
import { AudioPlayerAdapter } from '../../../services/audio/AudioPlayerAdapter';
import { uploadVoiceClip, deleteVoiceClip } from '../quizSyncService';
import { useSession } from '../../../services/session/sessionContext';
import { PressableScale } from '../../../design/motion/PressableScale';
import { useReducedMotion } from '../../../design/motion/useReducedMotion';
import { BodyText } from '../../../design/components/Text';
import { spacing, radius, touchTarget } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';

type Phase = 'idle' | 'requesting' | 'recording' | 'uploading' | 'success' | 'error' | 'permissionDenied';

// A transient network blip during upload used to permanently lose the take
// (the only recovery was recording an entirely new one) — most upload
// failures are exactly that kind of blip, not a bad file, so retrying the
// SAME already-recorded bytes a couple of times first fixes the common case
// before ever falling back to "record again".
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_RETRY_DELAY_MS = 1000;

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

const WAVEFORM_BAR_COUNT = 5;

/** A short vertical bar that breathes up and down on a staggered loop while
 *  `active`, and eases flat when it isn't — the in-circle "recording in
 *  progress" indicator replacing the static mic glyph. Reduce-motion drops
 *  the loop entirely (flat bars still read as "recording" via the caption
 *  text next to them, so no information is lost). */
function WaveformBar({ index, active }: { index: number; active: boolean }) {
  const height = useSharedValue(6);

  useEffect(() => {
    if (!active) {
      height.value = withTiming(6, { duration: 150 });
      return;
    }
    const duration = 260 + index * 45;
    height.value = withRepeat(withTiming(24, { duration }), -1, true);
  }, [active, index, height]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));
  return <Animated.View style={[styles.waveformBar, animatedStyle]} />;
}

function RecordingWaveform({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  return (
    <View style={styles.waveformRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) => (
        <WaveformBar key={i} index={i} active={active && !reduced} />
      ))}
    </View>
  );
}

function PauseGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={6} y={4} width={4} height={16} rx={1.5} fill={color.brand.maroon} />
      <Rect x={14} y={4} width={4} height={16} rx={1.5} fill={color.brand.maroon} />
    </Svg>
  );
}

function ResumeGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M6 4l14 8-14 8V4z" fill={color.brand.maroon} />
    </Svg>
  );
}

function StopGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={5} y={5} width={14} height={14} rx={2} fill={color.brand.maroon} />
    </Svg>
  );
}

function PlayGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M6 4l14 8-14 8V4z" fill={color.brand.maroon} />
    </Svg>
  );
}

function DeleteGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"
        stroke={color.brand.maroon}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function MicGlyph() {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={9} y={2} width={6} height={12} rx={3} fill={color.brand.maroon} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke={color.brand.maroon} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Shown INSIDE the circle when a save fails — the failure reads in the same
 *  spot the mic occupies, rather than collapsing the circle into a text-only
 *  layout and shifting everything below it. */
function ErrorGlyph() {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={12} cy={12} r={10} stroke={color.state.error} strokeWidth={1.8} fill="none" />
      <Path d="M12 7v6M12 16v1.5" stroke={color.state.error} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Optional voice recording alongside a quiz text answer. Independent of the
 *  typed answer for VALIDATION purposes — a saved recording is reported via
 *  onStatusChange so the parent can treat it as an alternative to typed text,
 *  but this component itself never reads or writes the typed answer.
 *
 *  A finished take stays in the recorder's cache (not deleted right after
 *  upload) so "play" can preview the exact clip that was submitted — it's
 *  only deleted when a new recording starts or this component unmounts. */
export function VoiceAnswer({ submissionId, questionKey, onStatusChange }: Props) {
  const { apiClient } = useSession();
  const adapterRef = useRef<AudioRecorderAdapter | undefined>(undefined);
  if (!adapterRef.current) adapterRef.current = new AudioRecorderAdapter();
  const adapter = adapterRef.current;
  const playerRef = useRef<AudioPlayerAdapter | undefined>(undefined);
  if (!playerRef.current) playerRef.current = new AudioPlayerAdapter();
  const player = playerRef.current;

  const [phase, setPhase] = useState<Phase>('idle');
  const [paused, setPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const pendingRef = useRef<RecordingResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  const unmountedRef = useRef(false);

  useEffect(() => {
    onStatusChange?.(phase === 'success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      clearInterval(timerRef.current);
      player.stop();
      // Skip disposal mid-upload — dispose() deletes the cache file, which
      // would race the in-flight upload still reading it. The upload's own
      // completion (success or error) is what cleans up in that case; it
      // isn't tied to this component's lifecycle.
      if (phaseRef.current !== 'uploading') adapter.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function armTicker() {
    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
  }
  function startTimer() {
    setElapsedSec(0);
    armTicker();
  }
  function stopTimer() {
    clearInterval(timerRef.current);
  }

  async function upload(result: RecordingResult) {
    pendingRef.current = result;
    setPhase('uploading');
    for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
      try {
        await uploadVoiceClip(apiClient, submissionId, questionKey, result.fileUri, result.durationSec);
        if (!unmountedRef.current) setPhase('success');
        return;
      } catch {
        if (attempt === UPLOAD_MAX_ATTEMPTS) {
          if (!unmountedRef.current) setPhase('error');
          return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS * attempt));
        if (unmountedRef.current) return;
      }
    }
  }

  async function handleRecordPress() {
    player.stop();
    setIsPlaying(false);
    pendingRef.current = null;
    setPhase('requesting');
    try {
      const status = await adapter.requestAndStart(
        (autoStopped) => {
          stopTimer();
          setPaused(false);
          if (autoStopped) void upload(autoStopped);
          else setPhase('error');
        },
        () => {
          stopTimer();
          setPaused(false);
          setPhase('error');
        },
        () => {
          // Backgrounded mid-recording: the take is discarded (foreground
          // only). Reset to idle so the user can simply record again, rather
          // than returning to a frozen "recording…" screen.
          stopTimer();
          setPaused(false);
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

  function handlePausePress() {
    adapter.pause();
    setPaused(true);
    stopTimer();
  }

  function handleResumePress() {
    adapter.resume();
    setPaused(false);
    armTicker();
  }

  async function handleStopPress() {
    stopTimer();
    setPaused(false);
    const result = await adapter.stop();
    if (result) void upload(result);
    else setPhase('error');
  }

  async function handleCancelPress() {
    stopTimer();
    setPaused(false);
    await adapter.cancel();
    setPhase('idle');
  }

  /** Removes a saved take entirely — server-side (so it's never transcribed
   *  into the summary), the local cache file, and this component's own
   *  state. Best-effort on the network call: a delete failing offline still
   *  clears the local state, since the person's clear intent is "get rid of
   *  this" — re-recording afterwards overwrites whatever's left server-side
   *  anyway (upsert), so a stray un-deleted row self-heals on the next take. */
  async function handleDeletePress() {
    try {
      await deleteVoiceClip(apiClient, submissionId, questionKey);
    } catch {
      // fall through — still clear local state below
    }
    await adapter.deleteCurrentFile();
    pendingRef.current = null;
    setPhase('idle');
  }

  async function handlePlayPress() {
    if (isPlaying) {
      player.stop();
      setIsPlaying(false);
      return;
    }
    if (!pendingRef.current) return;
    setIsPlaying(true);
    try {
      await player.play(pendingRef.current.fileUri, () => setIsPlaying(false));
    } catch {
      setIsPlaying(false);
    }
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

  // ONE layout for every remaining phase — the circle never disappears and
  // the side-button slots are always reserved, so the typed-answer field
  // below never shifts up/down as the phase changes (it previously jumped
  // between three structurally different layouts).
  const busy = phase === 'requesting' || phase === 'uploading';
  const canPlay = (phase === 'success' || phase === 'error') && !!pendingRef.current;

  const leftSlot =
    phase === 'recording' ? (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={paused ? 'resume recording' : 'pause recording'}
        onPress={paused ? handleResumePress : handlePausePress}
        style={styles.sideButton}
      >
        {paused ? <ResumeGlyph /> : <PauseGlyph />}
      </PressableScale>
    ) : phase === 'error' ? (
      // A failed take offers exactly one action — record again — so both side
      // slots stay EMPTY (but still rendered, so nothing shifts) and the
      // circle itself carries the red mark.
      null
    ) : canPlay ? (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'stop playback' : 'play your recording'}
        onPress={handlePlayPress}
        style={styles.sideButton}
      >
        {isPlaying ? <StopGlyph /> : <PlayGlyph />}
      </PressableScale>
    ) : null;

  const rightSlot =
    phase === 'recording' ? (
      <PressableScale accessibilityRole="button" accessibilityLabel="stop recording" onPress={handleStopPress} style={styles.sideButton}>
        <StopGlyph />
      </PressableScale>
    ) : phase === 'success' ? (
      // Delete, not re-record: the mic circle itself already re-records on
      // press (accessibilityLabel "record a voice answer" stays the same in
      // this phase), so this slot's own job is the one thing the mic can't
      // do — get rid of the saved take.
      <PressableScale accessibilityRole="button" accessibilityLabel="delete recording" onPress={handleDeletePress} style={styles.sideButton}>
        <DeleteGlyph />
      </PressableScale>
    ) : null;

  const caption =
    phase === 'recording' ? `${paused ? 'paused' : 'recording…'} ${elapsedSec}s`
      : phase === 'uploading' ? 'saving…'
      : phase === 'requesting' ? '…'
      : phase === 'success' ? 'voice answer saved'
      : phase === 'error' ? 'retry'
      : 'tap to speak';

  return (
    <View style={[styles.wrap, styles.idleWrap]} accessibilityLiveRegion="polite">
      <View style={styles.recordingRow}>
        <View style={styles.sideSlot}>{leftSlot}</View>
        <View style={styles.circleStack}>
          {/* Soft peach glow behind the circle — a plain shadowColor doesn't
              render as a color on Android (elevation shadows there are always
              neutral), so this is an actual radial-gradient layer instead. */}
          <Svg width={160} height={160} style={styles.glow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Defs>
              <RadialGradient id="micGlow" cx="55%" cy="60%" r="55%">
                <Stop offset="0%" stopColor={color.brand.peach} stopOpacity={0.9} />
                <Stop offset="100%" stopColor={color.brand.peach} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={80} cy={80} r={80} fill="url(#micGlow)" />
          </Svg>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={phase === 'error' ? 'retry — record again' : 'record a voice answer'}
            accessibilityState={{ busy }}
            // After a failure the circle records AGAIN rather than re-uploading
            // the dead take: a retry the user can hear the result of beats a
            // silent retry of the same bytes.
            onPress={handleRecordPress}
            disabled={busy || phase === 'recording'}
            style={[styles.micCircle, phase === 'error' && styles.micCircleError]}
          >
            {phase === 'recording' ? (
              <RecordingWaveform active={!paused} />
            ) : phase === 'error' ? (
              <ErrorGlyph />
            ) : busy ? (
              <BodyText variant="bodyStrong" tone="brand">…</BodyText>
            ) : (
              <MicGlyph />
            )}
          </PressableScale>
        </View>
        <View style={styles.sideSlot}>{rightSlot}</View>
      </View>
      {/* Both rows are ALWAYS rendered at a fixed height — the caption and the
          cancel link change between phases, and if their rows collapsed the
          divider and the answer box under them would jump. */}
      <View style={styles.captionRow}>
        {phase === 'error' ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="retry recording" onPress={handleRecordPress} style={styles.linkButton}>
            <BodyText variant="bodyStrong" tone="error">{caption}</BodyText>
          </PressableScale>
        ) : (
          <BodyText variant="caption" tone="secondary">{caption}</BodyText>
        )}
      </View>
      <View style={styles.actionRow}>
        {phase === 'recording' && (
          <PressableScale accessibilityRole="button" accessibilityLabel="cancel recording" onPress={handleCancelPress} style={styles.linkButton}>
            <BodyText variant="bodyStrong" tone="secondary">cancel</BodyText>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg, gap: spacing.sm },
  idleWrap: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  recordingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  // Always rendered, even when empty — reserving both side slots is what
  // keeps the circle centered and the content below it from shifting as
  // buttons appear/disappear between phases.
  sideSlot: { width: touchTarget.min, height: touchTarget.min, alignItems: 'center', justifyContent: 'center' },
  circleStack: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  micCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: color.bg.box,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCircleError: { borderWidth: 1, borderColor: color.state.error },
  sideButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    backgroundColor: color.bg.box,
    borderWidth: 1,
    borderColor: color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionRow: { height: 22, justifyContent: 'center', alignItems: 'center' },
  actionRow: { height: touchTarget.min, justifyContent: 'center', alignItems: 'center' },
  waveformRow: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24 },
  waveformBar: { width: 4, borderRadius: 2, backgroundColor: color.brand.maroon },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.preferred,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: color.control.primaryBg,
    alignSelf: 'flex-start',
  },
  linkButton: { minHeight: touchTarget.min, justifyContent: 'center' },
});
