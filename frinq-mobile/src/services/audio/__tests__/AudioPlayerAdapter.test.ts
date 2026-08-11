import { AudioPlayerAdapter, PlayerContext, PlayerPort, PlayerSourceNode } from '../AudioPlayerAdapter';

function makeSource(overrides: Partial<PlayerSourceNode> = {}): PlayerSourceNode {
  return {
    buffer: null,
    onEnded: null,
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    ...overrides,
  };
}

function makePlayer(source: PlayerSourceNode = makeSource()): { player: PlayerPort; context: PlayerContext } {
  const context: PlayerContext = {
    decodeAudioData: jest.fn().mockResolvedValue('decoded-buffer'),
    createBufferSource: jest.fn(() => source),
    destination: 'destination',
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { player: { createContext: jest.fn(() => context) }, context };
}

describe('AudioPlayerAdapter', () => {
  it('decodes, connects to the destination, and starts playback', async () => {
    const source = makeSource();
    const { player, context } = makePlayer(source);
    const adapter = new AudioPlayerAdapter(player);

    await adapter.play('file:///cache/clip.m4a', jest.fn());

    expect(context.decodeAudioData).toHaveBeenCalledWith('file:///cache/clip.m4a');
    expect(source.buffer).toBe('decoded-buffer');
    expect(source.connect).toHaveBeenCalledWith('destination');
    expect(source.start).toHaveBeenCalledTimes(1);
    expect(adapter.isPlaying()).toBe(true);
  });

  it('fires onEnded and clears isPlaying() when playback finishes naturally', async () => {
    const source = makeSource();
    const { player } = makePlayer(source);
    const adapter = new AudioPlayerAdapter(player);
    const onEnded = jest.fn();

    await adapter.play('file:///cache/clip.m4a', onEnded);
    source.onEnded!(); // simulate the native "finished" event

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(adapter.isPlaying()).toBe(false);
  });

  it('stop() cuts playback short WITHOUT firing onEnded', async () => {
    const source = makeSource();
    const { player, context } = makePlayer(source);
    const adapter = new AudioPlayerAdapter(player);
    const onEnded = jest.fn();

    await adapter.play('file:///cache/clip.m4a', onEnded);
    adapter.stop();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(onEnded).not.toHaveBeenCalled();
    expect(adapter.isPlaying()).toBe(false);
  });

  it('stop() is a no-op when nothing is playing', () => {
    const { player } = makePlayer();
    const adapter = new AudioPlayerAdapter(player);
    expect(() => adapter.stop()).not.toThrow();
  });

  it('starting a new play() tears down any in-flight playback first', async () => {
    const firstSource = makeSource();
    const secondSource = makeSource();
    const context: PlayerContext = {
      decodeAudioData: jest.fn().mockResolvedValue('buf'),
      createBufferSource: jest.fn().mockReturnValueOnce(firstSource).mockReturnValueOnce(secondSource),
      destination: 'destination',
      close: jest.fn().mockResolvedValue(undefined),
    };
    const player: PlayerPort = { createContext: jest.fn(() => context) };
    const adapter = new AudioPlayerAdapter(player);

    await adapter.play('a.m4a', jest.fn());
    await adapter.play('b.m4a', jest.fn());

    expect(firstSource.stop).toHaveBeenCalledTimes(1);
    expect(secondSource.start).toHaveBeenCalledTimes(1);
    expect(adapter.isPlaying()).toBe(true);
  });

  it('swallows a redundant stop() throwing on an already-ended source', async () => {
    const source = makeSource({ stop: jest.fn(() => { throw new Error('already stopped'); }) });
    const { player } = makePlayer(source);
    const adapter = new AudioPlayerAdapter(player);

    await adapter.play('file:///cache/clip.m4a', jest.fn());

    expect(() => adapter.stop()).not.toThrow();
  });
});
