export interface Instrument {
	trigger: (time: number) => void;
	setVolume: (vol: number) => void;
}

export function createNoiseBuffer(ctx: AudioContext) {
	const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
	const output = buffer.getChannelData(0);
	for (let i = 0; i < output.length; i++) {
		output[i] = Math.random() * 2 - 1;
	}
	return buffer;
}
