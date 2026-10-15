import type { Instrument } from "@/components/audio/Instrument";

export class Kick implements Instrument {
	private ctx: AudioContext;
	public tone: number;
	public decay: number;
	private osc: OscillatorNode;
	private gain: GainNode;
	public volume: number;
	private distortion: WaveShaperNode;
	private distortionCurve: Float32Array;
	private distortionAmount: number;
	public fxAmount: number;

	constructor(
		ctx: AudioContext,
		private readonly destination: AudioNode = ctx.destination,
	) {
		this.ctx = ctx;
		this.tone = 167.1;
		this.decay = 0.5;
		this.volume = 1;
		this.fxAmount = 0;
	}

	makeDistortionCurve(amount: number) {
		var k = amount / 4,
			n_samples = 44100,
			curve = new Float32Array(n_samples),
			deg = Math.PI / 180,
			i = 0,
			x: number;
		for (; i < n_samples; ++i) {
			x = (i * 2) / n_samples - 1;
			curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
		}
		return curve;
	}

	setup() {
		this.osc = this.ctx.createOscillator();
		this.osc.type = "sine";
		this.gain = this.ctx.createGain();
		this.distortion = this.ctx.createWaveShaper();
		if (!this.distortionCurve || this.distortionAmount !== this.fxAmount) {
			this.distortionCurve = this.makeDistortionCurve(this.fxAmount);
			this.distortionAmount = this.fxAmount;
		}
		this.distortion.curve = this.distortionCurve;

		this.osc.connect(this.gain);
		this.gain.connect(this.distortion);
		this.distortion.connect(this.destination);
	}

	trigger(time: number) {
		if (this.volume === 0) {
			return;
		}
		this.setup();

		this.osc.frequency.setValueAtTime(this.tone, time);
		this.gain.gain.setValueAtTime(0, time);
		this.gain.gain.linearRampToValueAtTime(this.volume, time + 0.1);

		this.osc.frequency.exponentialRampToValueAtTime(1, time + this.decay);
		this.gain.gain.exponentialRampToValueAtTime(
			0.01 * this.volume,
			time + this.decay,
		);
		this.gain.gain.linearRampToValueAtTime(0, time + this.decay + 0.1);

		const nodes = [this.osc, this.gain, this.distortion];
		this.osc.onended = () => {
			for (const node of nodes) node.disconnect();
		};
		this.osc.start(time);

		this.osc.stop(time + this.decay + 0.1);
	}

	setVolume = (vol: number) => {
		this.volume = vol;
	};
}
