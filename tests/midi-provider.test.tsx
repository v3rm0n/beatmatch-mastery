import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWebMidi, WebMidiProvider } from "@/components/WebMidiProvider";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("clears disconnected selections, preserves them on unrelated events, and removes the listener", async () => {
	const input = { id: "input", name: "Controller", state: "connected" };
	const access = {
		inputs: new Map([[input.id, input]]),
		outputs: new Map(),
		onstatechange: null as (() => void) | null,
	};
	vi.stubGlobal("navigator", { requestMIDIAccess: vi.fn(async () => access) });
	const { result, unmount } = renderHook(() => useWebMidi(), {
		wrapper: WebMidiProvider,
	});
	await waitFor(() => expect(result.current.midiDevices).toHaveLength(1));
	act(() => result.current.selectDevice(result.current.midiDevices[0]));
	const selected = result.current.selectedDevice;
	act(() => access.onstatechange());
	expect(result.current.selectedDevice).toBe(selected);
	input.state = "disconnected";
	act(() => access.onstatechange());
	expect(result.current.selectedDevice).toBeNull();
	expect(result.current.isConnected).toBe(false);
	unmount();
	expect(access.onstatechange).toBeNull();
});

it("reports denied access while retaining API support status", async () => {
	vi.stubGlobal("navigator", {
		requestMIDIAccess: vi.fn(async () => {
			throw new Error("Denied");
		}),
	});
	const { result } = renderHook(() => useWebMidi(), {
		wrapper: WebMidiProvider,
	});
	await waitFor(() => expect(result.current.error).toContain("Denied"));
	expect(result.current.isSupported).toBe(true);
});

it("pairs unnamed ports and ignores disconnected outputs when choosing the live output", async () => {
	const input = {
		id: "input",
		name: null,
		manufacturer: "Fixture",
		state: "connected",
	};
	const stale = {
		id: "stale",
		name: null,
		manufacturer: "Fixture",
		state: "disconnected",
	};
	const live = {
		id: "live",
		name: null,
		manufacturer: "Fixture",
		state: "connected",
	};
	const access = {
		inputs: new Map([[input.id, input]]),
		outputs: new Map([
			[stale.id, stale],
			[live.id, live],
		]),
		onstatechange: null,
	};
	vi.stubGlobal("navigator", { requestMIDIAccess: vi.fn(async () => access) });
	const { result } = renderHook(() => useWebMidi(), {
		wrapper: WebMidiProvider,
	});
	await waitFor(() => expect(result.current.midiDevices).toHaveLength(1));
	expect(result.current.midiDevices[0].output).toBe(live);
	expect(result.current.midiDevices[0].name).toBe("Unknown Device");
});
