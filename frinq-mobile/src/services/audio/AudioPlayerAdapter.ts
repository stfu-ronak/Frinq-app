import { AudioContext } from 'react-native-audio-api';

export interface PlayerSourceNode {
  buffer: unknown;
  onEnded: (() => void) | null;
  connect(destination: unknown): unknown;
  start(): void;
  stop(): void;
}
export interface PlayerContext {
  decodeAudioData(uri: string): Promise<unknown>;
  createBufferSource(): PlayerSourceNode;
  readonly destination: unknown;
  close(): Promise<void>;
}
export interface PlayerPort {
  createContext(): PlayerContext;
}

/** Default real playback backend, built on react-native-audio-api's Web
 *  Audio-style graph — the same package AudioRecorderAdapter records with,
 *  so no extra native dependency for playback. */
const realPlayer: PlayerPort = {
  createContext: () => new AudioContext() as unknown as PlayerContext,
};

/**
 * Plays back the local recording file a VoiceAnswer just captured, so the
 * user can hear it before it's treated as final. One AudioContext per play,
 * torn down on stop/finish rather than kept alive — a voice-answer preview
 * is a single one-shot clip, not a reusable audio session. Foreground-only,
 * same as recording — there's no background-playback requirement here.
 */
export class AudioPlayerAdapter {
  private context: PlayerContext | null = null;
  private source: PlayerSourceNode | null = null;

  constructor(private readonly player: PlayerPort = realPlayer) {}

  isPlaying(): boolean {
    return this.source !== null;
  }

  /** Decodes and plays `uri` from the start. `onEnded` fires once playback
   *  finishes naturally — NOT when stop() cuts it short, so callers can
   *  reset a "playing" UI state without double-firing on an explicit stop. */
  async play(uri: string, onEnded: () => void): Promise<void> {
    this.teardown();
    const context = this.player.createContext();
    const buffer = await context.decodeAudioData(uri);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onEnded = () => {
      this.teardown();
      onEnded();
    };
    this.context = context;
    this.source = source;
    source.start();
  }

  /** Cuts playback short. Safe to call when nothing is playing. */
  stop(): void {
    this.teardown();
  }

  private teardown(): void {
    if (this.source) {
      this.source.onEnded = null;
      try {
        this.source.stop();
      } catch {
        // ponytail: already-ended sources throw on a redundant stop() on
        // some platforms — harmless, the node's being torn down regardless.
      }
    }
    this.source = null;
    void this.context?.close();
    this.context = null;
  }
}
