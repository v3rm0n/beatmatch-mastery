import {
	createNoiseBuffer,
	type Instrument,
} from "@/components/audio/Instrument";

export class Snare implements Instrument {
	private ctx: AudioContext;
	public tone: number;
	public decay: number;
	private noise: AudioBufferSourceNode;
	private noiseEnvelope: GainNode;
	private noiseFilter: BiquadFilterNode;
	private noiseBuffer: AudioBuffer;
	private osc: OscillatorNode;
	private oscEnvelope: GainNode;
	public volume: number;
	constructor(
		ctx: AudioContext,
		private readonly destination: AudioNode = ctx.destination,
	) {
		this.ctx = ctx;
		this.tone = 100;
		this.decay = 0.05;
		this.volume = 1;
	}

	setup() {
		this.noise = this.ctx.createBufferSource();
		this.noise.buffer = this.noiseBuffer ??= createNoiseBuffer(this.ctx);

		const noiseFilter = this.ctx.createBiquadFilter();
		this.noiseFilter = noiseFilter;
		noiseFilter.type = "highpass";
		noiseFilter.frequency.value = 1000;
		this.noise.connect(noiseFilter);

		this.noiseEnvelope = this.ctx.createGain();
		noiseFilter.connect(this.noiseEnvelope);

		this.noiseEnvelope.connect(this.destination);

		this.osc = this.ctx.createOscillator();
		this.osc.type = "triangle";

		this.oscEnvelope = this.ctx.createGain();
		this.osc.connect(this.oscEnvelope);
		this.oscEnvelope.connect(this.destination);
	}

	trigger(time: number) {
		if (this.volume === 0) {
			return;
		}
		this.setup();
		this.noiseEnvelope.gain.setValueAtTime(this.volume, time);
		this.noiseEnvelope.gain.exponentialRampToValueAtTime(
			0.01 * this.volume,
			time + this.decay,
		);
		const noise = this.noise;
		const noiseEnvelope = this.noiseEnvelope;
		const noiseFilter = this.noiseFilter;
		noise.onended = () => {
			noise.disconnect();
			noiseFilter.disconnect();
			noiseEnvelope.disconnect();
		};
		this.noise.start(time);

		this.osc.frequency.setValueAtTime(this.tone, time);
		this.oscEnvelope.gain.setValueAtTime(0.7 * this.volume, time);
		this.oscEnvelope.gain.exponentialRampToValueAtTime(
			0.01 * this.volume,
			time + this.decay / 2,
		);
		const osc = this.osc;
		const envelope = this.oscEnvelope;
		osc.onended = () => {
			osc.disconnect();
			envelope.disconnect();
		};
		this.osc.start(time);

		this.osc.stop(time + this.decay);
		this.noise.stop(time + this.decay);
	}

	setVolume = (vol: number) => {
		this.volume = vol;
	};
}
