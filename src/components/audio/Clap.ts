import { Instrument } from "@/components/audio/Instrument";

export class Clap implements Instrument {
  public tone: number;
  public volume: number;
  public decay: number;
  private pulseWidth: number;
  private noise: AudioBufferSourceNode;
  private ctx: AudioContext;
  private filter: BiquadFilterNode;
  private envelope: GainNode;
  public fxAmount: number;
  private feedback: GainNode;
  private echo: DelayNode;

  constructor(ctx: AudioContext) {
    this.tone = 130;
    this.volume = 1;
    this.decay = 0.3;
    this.pulseWidth = 0.025;
    this.ctx = ctx;
    this.fxAmount = 0;
  }

  noiseBuffer() {
    var bufferSize = this.ctx.sampleRate;
    var buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    var output = buffer.getChannelData(0);

    for (var i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setup() {
    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = this.noiseBuffer();
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = this.tone * 2;
    this.envelope = this.ctx.createGain();
    this.feedback = this.ctx.createGain();
    this.echo = this.ctx.createDelay();
    this.echo.delayTime.value = 1 / 6;
    this.feedback.gain.value = 0.99 * this.fxAmount / 100;

    this.noise.connect(this.filter);
    this.filter.connect(this.envelope);

    this.envelope.connect(this.echo);
    this.echo.connect(this.feedback);
    this.feedback.connect(this.echo);
    this.feedback.connect(this.ctx.destination);
    this.envelope.connect(this.ctx.destination);
  }

  trigger = (time: number) => {
    if (this.volume == 0) { return };
    this.setup();
    this.envelope.gain.setValueAtTime(this.volume, time);
    this.envelope.gain.exponentialRampToValueAtTime(0.1, time + this.pulseWidth);

    this.envelope.gain.setValueAtTime(this.volume, time + this.pulseWidth);
    this.envelope.gain.exponentialRampToValueAtTime(0.1, time + 2 * this.pulseWidth);

    this.envelope.gain.setValueAtTime(this.volume, time + 2 * this.pulseWidth);
    this.envelope.gain.exponentialRampToValueAtTime(0.001, time + this.decay);


    this.noise.start(time)
    this.noise.stop(time + this.decay);
  }

  setTone = (tone: number) => {
    this.tone = tone;
  }

  setVolume = (volume: number) => {
    this.volume = volume;
  }

  setFXAmount = (amount: number) => {
    this.fxAmount = amount;
  }
}
