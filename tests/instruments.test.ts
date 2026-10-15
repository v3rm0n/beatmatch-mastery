import { describe, expect, it, vi } from "vitest";
import { Clap } from "@/components/audio/Clap";
import { Hat } from "@/components/audio/Hat";
import { Kick } from "@/components/audio/Kick";
import { Snare } from "@/components/audio/Snare";

const param = () => ({
	value: 0,
	setValueAtTime: vi.fn(),
	linearRampToValueAtTime: vi.fn(),
	exponentialRampToValueAtTime: vi.fn(),
});
function context() {
	const nodes: ReturnType<typeof node>[] = [];
	const node = () => ({
		connect: vi.fn(),
		disconnect: vi.fn(),
		start: vi.fn(),
		stop: vi.fn(),
		onended: null as (() => void) | null,
		gain: param(),
		frequency: param(),
		Q: param(),
		pan: param(),
		delayTime: param(),
	});
	const create = () => {
		const result = node();
		nodes.push(result);
		return result;
	};
	const ctx = {
		destination: {},
		currentTime: 0,
		sampleRate: 100,
		createGain: vi.fn(create),
		createOscillator: vi.fn(create),
		createWaveShaper: vi.fn(create),
		createBufferSource: vi.fn(create),
		createBiquadFilter: vi.fn(create),
		createStereoPanner: vi.fn(create),
		createDelay: vi.fn(create),
		createBuffer: vi.fn(() => ({
			getChannelData: () => new Float32Array(100),
		})),
	};
	return { ctx: ctx as unknown as AudioContext, nodes, mock: ctx };
}

describe("instrument voice ownership and envelopes", () => {
	it("disconnects each overlapping hat oscillator and its own graph", () => {
		const { ctx, nodes, mock } = context();
		const hat = new Hat(ctx);
		hat.trigger(0);
		hat.trigger(0.1);
		for (const source of mock.createOscillator.mock.results)
			source.value.onended();
		expect(nodes.every((node) => node.disconnect.mock.calls.length === 1)).toBe(
			true,
		);
	});
	it("anchors kick envelopes to their scheduled note and reuses distortion curves", () => {
		const { ctx, mock } = context();
		const kick = new Kick(ctx);
		const curve = vi.spyOn(kick, "makeDistortionCurve");
		kick.trigger(10);
		expect(
			mock.createGain.mock.results[0].value.gain.setValueAtTime,
		).toHaveBeenCalledWith(0, 10);
		kick.trigger(11);
		expect(curve).toHaveBeenCalledTimes(1);
		kick.fxAmount = 50;
		kick.trigger(12);
		expect(curve).toHaveBeenCalledTimes(2);
	});
	it.each([Snare, Clap])(
		"reuses noise and scales every envelope point with volume for %s",
		(Instrument) => {
			const { ctx, mock } = context();
			const instrument = new Instrument(ctx);
			instrument.setVolume(0.001);
			instrument.trigger(0);
			instrument.trigger(1);
			expect(mock.createBuffer).toHaveBeenCalledTimes(1);
			const envelope = mock.createGain.mock.results[0].value.gain;
			for (const [value] of envelope.exponentialRampToValueAtTime.mock.calls)
				expect(value).toBeLessThanOrEqual(0.001);
		},
	);
	it("disconnects the snare filter along with the rest of its voice", () => {
		const { ctx, nodes, mock } = context();
		new Snare(ctx).trigger(0);
		mock.createBufferSource.mock.results[0].value.onended();
		mock.createOscillator.mock.results[0].value.onended();
		expect(nodes.every((node) => node.disconnect.mock.calls.length === 1)).toBe(
			true,
		);
	});
});
