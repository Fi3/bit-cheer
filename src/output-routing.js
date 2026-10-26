// Hardware channel numbers are zero-based internally and shown as 1-based in the UI.
export function availableChannelCount(destination) {
  const maximum = Number(destination?.maxChannelCount);
  const current = Number(destination?.channelCount);
  return Math.min(32, Math.max(1, Math.floor(Number.isFinite(maximum) && maximum > 0 ? maximum : Number.isFinite(current) && current > 0 ? current : 1)));
}

export function validateRouting(config = {}, maximum) {
  const maxChannels = Math.min(32, Math.max(1, Math.floor(Number(maximum) || 1)));
  const mode = config.mode || 'mix';
  if (!['mix', 'mono', 'stereo'].includes(mode)) throw new Error('Choose stereo mix, separate mono channels, or separate stereo pairs.');
  if (mode === 'mix') return { mode, a: 0, b: 1 };
  const width = mode === 'stereo' ? 2 : 1;
  if (maxChannels < width * 2) throw new Error(`This audio output exposes ${maxChannels} channel${maxChannels === 1 ? '' : 's'}; ${mode === 'stereo' ? 'separate stereo decks require at least 4' : 'separate mono decks require at least 2'}.`);
  const a = config.a === undefined ? 0 : Number(config.a);
  const b = config.b === undefined ? width : Number(config.b);
  for (const channel of [a, b]) {
    if (!Number.isInteger(channel) || channel < 0 || channel + width > maxChannels) throw new Error(`Choose ${mode === 'stereo' ? 'adjacent channel pairs' : 'channels'} within this device's ${maxChannels} available outputs.`);
  }
  if (Math.abs(a - b) < width) throw new Error('Deck A and deck B must use different, non-overlapping output channels.');
  return { mode, a, b };
}

function disconnect(node, target) {
  try { if (target) node.disconnect(target); else node.disconnect(); } catch { /* Already disconnected. */ }
}

/**
 * Prepare (but do not attach) separate hardware outputs. Inputs must be stereo,
 * post-EQ and post-deck-volume. Set destination.channelCount to channelCount and
 * channelInterpretation='discrete', then attach(). The caller owns rollback of
 * destination settings and any existing mix graph.
 */
export function buildHardwareGraph(context, deckInputs, config, masterVolume = 1) {
  const routing = validateRouting(config, availableChannelCount(context.destination));
  if (routing.mode === 'mix') throw new Error('The hardware graph requires separate mono or stereo outputs.');
  if (!Array.isArray(deckInputs) || deckInputs.length !== 2) throw new Error('Two stereo deck inputs are required.');
  const width = routing.mode === 'stereo' ? 2 : 1;
  const channelCount = Math.max(routing.a, routing.b) + width;
  const nodes = [], entries = [];
  let attached = false;
  let master, merger;
  try {
    merger = context.createChannelMerger(channelCount); nodes.push(merger);
    merger.channelInterpretation = 'discrete';
    master = context.createGain(); nodes.push(master);
    master.channelCount = channelCount;
    master.channelCountMode = 'explicit';
    master.channelInterpretation = 'discrete';
    master.gain.value = Math.max(0, Math.min(1, masterVolume));
    merger.connect(master);
    for (let deck = 0; deck < 2; deck++) {
      // A compressor cannot accept an arbitrary multichannel stream: limit each
      // stereo deck before splitting and merging its channels into device slots.
      const compressor = context.createDynamicsCompressor(); nodes.push(compressor); entries.push(compressor);
      compressor.channelCount = 2; compressor.channelCountMode = 'clamped-max'; compressor.channelInterpretation = 'discrete';
      compressor.threshold.value = -3; compressor.knee.value = 0; compressor.ratio.value = 20; compressor.attack.value = .003; compressor.release.value = .1;
      const splitter = context.createChannelSplitter(2); nodes.push(splitter);
      splitter.channelInterpretation = 'discrete';
      compressor.connect(splitter);
      const start = deck ? routing.b : routing.a;
      if (routing.mode === 'stereo') {
        splitter.connect(merger, 0, start);
        splitter.connect(merger, 1, start + 1);
      } else {
        // Explicit 0.5L + 0.5R avoids any speaker-layout dependent downmix.
        for (let channel = 0; channel < 2; channel++) {
          const half = context.createGain(); nodes.push(half);
          half.channelCount = 1; half.channelCountMode = 'explicit'; half.channelInterpretation = 'discrete'; half.gain.value = .5;
          splitter.connect(half, channel); half.connect(merger, 0, start);
        }
      }
    }
  } catch (error) {
    for (const node of nodes) disconnect(node);
    throw error;
  }
  return {
    nodes, merger, master, channelCount, routing,
    attach() {
      if (attached) return;
      try {
        deckInputs.forEach((input, deck) => input.connect(entries[deck]));
        master.connect(context.destination);
        attached = true;
      } catch (error) {
        deckInputs.forEach((input, deck) => disconnect(input, entries[deck]));
        disconnect(master, context.destination);
        throw error;
      }
    },
    disconnect() {
      deckInputs.forEach((input, deck) => disconnect(input, entries[deck]));
      for (const node of nodes) disconnect(node);
      attached = false;
    },
    setMasterVolume(value) { master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), context.currentTime, .012); }
  };
}
