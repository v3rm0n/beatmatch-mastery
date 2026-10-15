import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BeatmatchApp } from "@/components/BeatmatchApp";
import type { MidiControllerCallbacks } from "@/hooks/use-midi-controller";
import { generateRandomTempo } from "@/lib/tempo";

const engines = vi.hoisted(() =>
	[0, 1].map(() => ({
		prepare: vi.fn(async () => true),
		error: null,
		start: vi.fn(),
		stop: vi.fn(),
		setTempo: vi.fn(),
		setPattern: vi.fn(),
		setVolume: vi.fn(),
		isPlaying: false,
		currentBeat: 0,
	})),
);
let callbacks: MidiControllerCallbacks;
vi.mock("@/components/MidiController", () => ({
	MidiController: (props: MidiControllerCallbacks) => {
		callbacks = props;
		return null;
	},
}));
vi.mock("@/components/audio/AudioEngine", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@/components/audio/AudioEngine")>();
	let index = 0;
	return { ...original, useAudioEngine: () => engines[index++ % 2] };
});
beforeEach(() =>
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	),
);
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it.each([60, 61, 79, 120, 181, 199, 200])(
	"keeps generated tempo near base %s and within the supported range",
	(base) => {
		for (const random of [0, 0.5, 0.999999]) {
			vi.spyOn(Math, "random").mockReturnValue(random);
			const tempo = generateRandomTempo(base, 6);
			expect(tempo).toBeGreaterThanOrEqual(Math.max(60, base - 6));
			expect(tempo).toBeLessThanOrEqual(Math.min(200, base + 6));
		}
	},
);

it("blocks MIDI transport outside a session and freezes scored results", () => {
	render(<BeatmatchApp />);
	callbacks.onPlay("A");
	expect(engines[0].start).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: /Start Session/ }));
	callbacks.onPlay("A");
	expect(engines[0].start).toHaveBeenCalledOnce();
	fireEvent.click(screen.getByRole("button", { name: /Finish & Score/ }));
	const before = screen.getByText(/Difference:/).textContent;
	act(() => callbacks.onRateChange("B", 1));
	expect(screen.getByText(/Difference:/).textContent).toBe(before);
	expect(
		screen
			.getAllByRole("button", { name: "Play" })
			.every((button) => (button as HTMLButtonElement).disabled),
	).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: /New Session/ }));
	expect(
		screen
			.getByRole("spinbutton", { name: "Base Tempo" })
			.getAttribute("value"),
	).toBe("120");
});

it("unlocks both audio engines when the user starts a session", () => {
	for (const engine of engines) engine.prepare.mockClear();
	render(<BeatmatchApp />);
	fireEvent.click(screen.getByRole("button", { name: /Start Session/ }));
	for (const engine of engines) expect(engine.prepare).toHaveBeenCalledOnce();
});

it("bounds extreme MIDI jog offsets so playback cannot reach a zero or negative tempo", () => {
	render(<BeatmatchApp />);
	fireEvent.click(screen.getByRole("button", { name: /Start Session/ }));
	act(() => callbacks.onJogWheel("A", -10000));
	expect(callbacks.getControlValue("[Channel1]", "jog")).toBe(-6);
	act(() => callbacks.onJogWheel("A", Number.NaN));
	expect(Number.isFinite(callbacks.getControlValue("[Channel1]", "jog"))).toBe(
		true,
	);
});
