import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine, useAudioEngine } from "@/components/audio/AudioEngine";

const trigger = vi.hoisted(() => vi.fn());
vi.mock("@/components/audio/Kick", () => ({
	Kick: class {
		trigger = trigger;
	},
}));
const gain = () => ({
	gain: { value: 1 },
	connect: vi.fn(),
	disconnect: vi.fn(),
});
let context: {
	currentTime: number;
	state: string;
	resume: ReturnType<typeof vi.fn>;
	createGain: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
	destination: object;
};
let worker: {
	onmessage: () => void;
	postMessage: ReturnType<typeof vi.fn>;
	terminate: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
	trigger.mockClear();
	context = {
		currentTime: 0,
		state: "running",
		resume: vi.fn(async () => {}),
		createGain: vi.fn(gain),
		close: vi.fn(),
		destination: {},
	};
	vi.stubGlobal(
		"AudioContext",
		class {
			constructor() {
				Object.assign(this, context);
				context = this as typeof context;
			}
		},
	);
	vi.stubGlobal(
		"Worker",
		class {
			constructor() {
				worker = {
					onmessage: () => {},
					postMessage: vi.fn(),
					terminate: vi.fn(),
				};
				Object.assign(this, worker);
				worker = this as typeof worker;
			}
		},
	);
	vi.stubGlobal("URL", {
		createObjectURL: vi.fn(() => "blob:worker"),
		revokeObjectURL: vi.fn(),
	});
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("audio lifecycle and scheduling", () => {
	it("does not report playback without a pattern", async () => {
		const engine = new AudioEngine();
		expect(await engine.start()).toBe(false);
		expect(worker.postMessage).not.toHaveBeenCalled();
	});
	it("schedules the first note immediately and displays the audible beat", async () => {
		const engine = new AudioEngine();
		engine.setPattern(["kick", "kick", "kick", "kick"]);
		await engine.start();
		expect(trigger).toHaveBeenCalledWith(0);
		expect(engine.getCurrentBeat()).toBe(0);
		context.currentTime = 0.05;
		worker.onmessage();
		expect(trigger).toHaveBeenLastCalledWith(0.125);
		expect(engine.getCurrentBeat()).toBe(0);
		context.currentTime = 0.13;
		expect(engine.getCurrentBeat()).toBe(1);
	});
	it("cancels a start that is awaiting permission when stopped", async () => {
		let resume: () => void;
		context.state = "suspended";
		context.resume.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resume = resolve;
				}),
		);
		const engine = new AudioEngine();
		engine.setPattern(["kick"]);
		const started = engine.start();
		engine.stop();
		resume();
		expect(await started).toBe(false);
		expect(trigger).not.toHaveBeenCalled();
	});
	it("ignores worker ticks after stop and disconnects queued sound", async () => {
		const engine = new AudioEngine();
		engine.setPattern(["kick"]);
		await engine.start();
		const output = context.createGain.mock.results[0].value;
		engine.stop();
		trigger.mockClear();
		context.currentTime = 10;
		worker.onmessage();
		expect(trigger).not.toHaveBeenCalled();
		expect(output.disconnect).toHaveBeenCalled();
	});
	it("skips stale beats after a long stall and ignores invalid tempo", async () => {
		const engine = new AudioEngine();
		engine.setPattern(["kick"]);
		engine.setTempo(0);
		engine.setTempo(Number.NaN);
		await engine.start();
		trigger.mockClear();
		context.currentTime = 100;
		worker.onmessage();
		expect(trigger).toHaveBeenCalledTimes(1);
		expect(trigger).toHaveBeenCalledWith(100);
	});
	it("preserves mixer volume across stop and releases resources once", async () => {
		const engine = new AudioEngine();
		engine.setVolume(0.25);
		engine.stop();
		expect(context.createGain.mock.results.at(-1).value.gain.value).toBe(0.25);
		engine.dispose();
		engine.dispose();
		expect(context.close).toHaveBeenCalledTimes(1);
		expect(worker.terminate).toHaveBeenCalledTimes(1);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:worker");
	});
});

it("unlocks audio without starting notes", async () => {
	context.state = "suspended";
	context.resume.mockImplementation(async () => {
		context.state = "running";
	});
	const engine = new AudioEngine();
	expect(await engine.prepare()).toBe(true);
	expect(context.resume).toHaveBeenCalledOnce();
	expect(trigger).not.toHaveBeenCalled();
	expect(worker.postMessage).not.toHaveBeenCalled();
	engine.dispose();
});

it("cleans up the audio context and blob URL if worker creation fails", () => {
	vi.stubGlobal(
		"Worker",
		class {
			constructor() {
				throw new Error("Worker unavailable");
			}
		},
	);
	expect(() => new AudioEngine()).toThrow("Worker unavailable");
	expect(context.close).toHaveBeenCalledOnce();
	expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:worker");
});

it("keeps the UI usable when audio initialization is unavailable", async () => {
	vi.stubGlobal("AudioContext", undefined);
	const { result } = renderHook(() => useAudioEngine());
	expect(result.current.error).toContain("Audio is unavailable");
	await act(async () => {
		await result.current.start();
	});
	expect(result.current.isPlaying).toBe(false);
});

it("reports failed playback and clears the error after a successful retry", async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	const { result } = renderHook(() => useAudioEngine());
	act(() => result.current.setPattern(["kick"]));
	context.state = "suspended";
	context.resume.mockRejectedValueOnce(new Error("Denied"));
	await act(async () => {
		await result.current.start();
	});
	expect(result.current.error).toContain("Audio could not start");
	expect(result.current.isPlaying).toBe(false);
	context.resume.mockImplementation(async () => {
		context.state = "running";
	});
	await act(async () => {
		await result.current.start();
	});
	expect(result.current.isPlaying).toBe(true);
	expect(result.current.error).toBeNull();
});
