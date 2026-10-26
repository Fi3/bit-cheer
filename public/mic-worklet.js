/* Capture contiguous microphone PCM for local tempo analysis. Never monitor it. */
class BitCheerMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.factor = Math.max(1, Math.floor(sampleRate / 8000));
    this.outputRate = sampleRate / this.factor;
    this.length = Math.round(this.outputRate * 6);
    this.pcm = new Float32Array(this.length);
    this.index = 0;
    this.sum = 0;
    this.count = 0;
    this.active = true;
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'stop') {
        this.active = false;
        this.pcm = null;
      }
    };
  }

  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (!this.active) return false;
    const channels = inputs[0] || [];
    const frames = channels[0]?.length || outputs[0]?.[0]?.length || 128;
    for (let i = 0; i < frames; i++) {
      let mono = 0;
      for (let channel = 0; channel < channels.length; channel++) mono += channels[channel][i] || 0;
      this.sum += channels.length ? mono / channels.length : 0;
      if (++this.count === this.factor) {
        this.pcm[this.index++] = this.sum / this.factor;
        this.sum = 0;
        this.count = 0;
        if (this.index === this.length) {
          const pcm = this.pcm;
          this.pcm = new Float32Array(this.length);
          this.index = 0;
          this.port.postMessage({ type: 'samples', pcm, sampleRate: this.outputRate }, [pcm.buffer]);
        }
      }
    }
    return true;
  }
}
registerProcessor('bit-cheer-mic', BitCheerMicProcessor);
