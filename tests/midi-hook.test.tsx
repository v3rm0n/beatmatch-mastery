import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMidiController } from "@/hooks/use-midi-controller";

const state = vi.hoisted(() => ({
	device: null as unknown,
	devices: [] as unknown[],
}));
vi.mock("@/components/WebMidiProvider", () => ({
	useWebMidi: () => ({
		midiDevices: state.devices,
		selectedDevice: state.device,
		selectDevice: vi.fn(),
		isConnected: true,
		isSupported: true,
	}),
}));
const input = () => ({
	onmidimessage: null as ((event: { data: Uint8Array }) => void) | null,
});
const mappingXml =
	"<MixxxControllerPreset><info><name>Test</name></info><controller><controls><control><group>[Channel1]</group><key>play</key><status>0x90</status><midino>1</midino></control><control><group>[Master]</group><key>crossfader</key><status>0xB0</status><midino>2</midino></control></controls></controller></MixxxControllerPreset>";
const callbacks = () => ({
	onPlay: vi.fn(),
	onStop: vi.fn(),
	onCue: vi.fn(),
	onRateChange: vi.fn(),
	onVolumeChange: vi.fn(),
	onJogWheel: vi.fn(),
	onCrossfaderChange: vi.fn(),
	isPlaying: () => false,
});
beforeEach(() => {
	state.device = { id: "1", name: "Device", input: input() };
	state.devices = [state.device];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => ({
			ok: true,
			json: async () => [{ filename: "mapping.xml", name: "Test", id: "test" }],
			text: async () => (url.endsWith("bad.xml") ? "invalid" : mappingXml),
		})),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("ignores input before a mapping loads, handles input after loading, and detaches on unmount", async () => {
	const callback = callbacks();
	const { result, unmount } = renderHook(() => useMidiController(callback));
	const port = (state.device as { input: ReturnType<typeof input> }).input;
	expect(port.onmidimessage).toBeNull();
	await waitFor(() => expect(result.current.midiMappings).toHaveLength(1));
	await act(() => result.current.loadMapping("mapping.xml"));
	act(() => port.onmidimessage({ data: new Uint8Array([0x90, 1, 127]) }));
	expect(callback.onPlay).toHaveBeenCalledWith("A");
	act(() => port.onmidimessage({ data: new Uint8Array([0xb0, 2, 0]) }));
	expect(callback.onCrossfaderChange).toHaveBeenLastCalledWith(0);
	act(() => port.onmidimessage({ data: new Uint8Array([0xb0, 2, 127]) }));
	expect(callback.onCrossfaderChange).toHaveBeenLastCalledWith(1);
	unmount();
	expect(port.onmidimessage).toBeNull();
});

it("clears the old mapping and handler when switching devices", async () => {
	const { result, rerender } = renderHook(() => useMidiController(callbacks()));
	await waitFor(() => expect(result.current.midiMappings).toHaveLength(1));
	await act(() => result.current.loadMapping("mapping.xml"));
	const oldInput = (state.device as { input: ReturnType<typeof input> }).input;
	state.device = { id: "2", name: "Other", input: input() };
	rerender();
	expect(oldInput.onmidimessage).toBeNull();
	expect(result.current.midiMapping).toBeNull();
});

it("shows failed fetches instead of attempting to parse an HTTP error page", async () => {
	const { result } = renderHook(() => useMidiController(callbacks()));
	await waitFor(() => expect(result.current.midiMappings).toHaveLength(1));
	vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
	await act(() => result.current.loadMapping("mapping.xml"));
	expect(result.current.mappingError).toContain("Could not load");
	expect(result.current.midiMapping).toBeNull();
});

it("discards a mapping that finishes loading after its device was changed", async () => {
	const { result, rerender } = renderHook(() => useMidiController(callbacks()));
	await waitFor(() => expect(result.current.midiMappings).toHaveLength(1));
	let resolve: (response: Response) => void;
	vi.mocked(fetch).mockReturnValueOnce(
		new Promise<Response>((done) => {
			resolve = done;
		}),
	);
	let loading: Promise<void>;
	act(() => {
		loading = result.current.loadMapping("mapping.xml");
	});
	state.device = { id: "2", name: "Other", input: input() };
	rerender();
	await act(async () => {
		resolve({ ok: true, text: async () => mappingXml } as Response);
		await loading;
	});
	expect(result.current.midiMapping).toBeNull();
	expect(
		(state.device as { input: ReturnType<typeof input> }).input.onmidimessage,
	).toBeNull();
});

it("applies explicit script playback states without restarting an already playing deck", async () => {
	let playing = false;
	const callback = { ...callbacks(), isPlaying: () => playing };
	callback.onPlay.mockImplementation(() => {
		playing = true;
	});
	callback.onStop.mockImplementation(() => {
		playing = false;
	});
	const scriptXml =
		'<MixxxControllerPreset><controller><scriptfiles><file filename="device.js" functionprefix="Device"/></scriptfiles><controls><control><group>[Channel1]</group><key>Device.input</key><status>0x90</status><midino>1</midino><options><script-binding/></options></control></controls></controller></MixxxControllerPreset>';
	vi.mocked(fetch).mockImplementation(
		async (url: string) =>
			({
				ok: true,
				json: async () => [
					{ filename: "mapping.xml", name: "Test", id: "test" },
				],
				text: async () =>
					url.endsWith("device.js")
						? "var Device = { input: function(channel, control, value) { engine.setValue('[Channel1]', 'play', value > 0); } };"
						: scriptXml,
			}) as Response,
	);
	const { result } = renderHook(() => useMidiController(callback));
	await waitFor(() => expect(result.current.midiMappings).toHaveLength(1));
	await act(() => result.current.loadMapping("mapping.xml"));
	const port = (state.device as { input: ReturnType<typeof input> }).input;
	act(() => port.onmidimessage({ data: new Uint8Array([0x90, 1, 127]) }));
	act(() => port.onmidimessage({ data: new Uint8Array([0x90, 1, 127]) }));
	expect(callback.onPlay).toHaveBeenCalledTimes(1);
	act(() => port.onmidimessage({ data: new Uint8Array([0x90, 1, 0]) }));
	expect(callback.onStop).toHaveBeenCalledTimes(1);
	expect(playing).toBe(false);
});

it.each([{}, [{ name: "Missing filename", id: "broken" }]])(
	"reports malformed manifests without crashing the controller UI",
	async (manifest) => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => manifest,
		} as Response);
		const { result } = renderHook(() => useMidiController(callbacks()));
		await waitFor(() =>
			expect(result.current.mappingError).toContain(
				"Invalid controller mapping manifest",
			),
		);
		expect(result.current.midiMappings).toEqual([]);
	},
);

it("updates hardware LEDs immediately when on-screen playback state changes", async () => {
	const send = vi.fn();
	state.device = { id: "1", name: "Device", input: input(), output: { send } };
	const xmlWithOutput = mappingXml.replace(
		"</controller>",
		"<outputs><output><group>[Channel1]</group><key>play_indicator</key><status>0x90</status><midino>5</midino><minimum>0.5</minimum></output></outputs></controller>",
	);
	vi.mocked(fetch).mockImplementation(
		async () =>
			({
				ok: true,
				json: async () => [
					{ filename: "mapping.xml", name: "Test", id: "test" },
				],
				text: async () => xmlWithOutput,
			}) as Response,
	);
	const { result, rerender } = renderHook(
		({ playing }) =>
			useMidiController({ ...callbacks(), isPlaying: () => playing }),
		{ initialProps: { playing: false } },
	);
	await waitFor(() => expect(result.current.midiMappings).toHaveLength(1));
	await act(() => result.current.loadMapping("mapping.xml"));
	expect(send).toHaveBeenLastCalledWith([0x90, 5, 0]);
	rerender({ playing: true });
	expect(send).toHaveBeenLastCalledWith([0x90, 5, 127]);
	rerender({ playing: false });
	expect(send).toHaveBeenLastCalledWith([0x90, 5, 0]);
});

it("keeps the mapping and restores LEDs when only the MIDI output port reconnects", async () => {
	const send = vi.fn();
	const port = input();
	state.device = { id: "1", name: "Device", input: port, output: { send } };
	const xmlWithOutput = mappingXml.replace(
		"</controller>",
		"<outputs><output><group>[Channel1]</group><key>play_indicator</key><status>0x90</status><midino>5</midino></output></outputs></controller>",
	);
	vi.mocked(fetch).mockImplementation(
		async () =>
			({
				ok: true,
				json: async () => [
					{ filename: "mapping.xml", name: "Test", id: "test" },
				],
				text: async () => xmlWithOutput,
			}) as Response,
	);
	const { result, rerender } = renderHook(() => useMidiController(callbacks()));
	await waitFor(() => expect(result.current.midiMappings).toHaveLength(1));
	await act(() => result.current.loadMapping("mapping.xml"));
	const mapping = result.current.midiMapping;
	state.device = { id: "1", name: "Device", input: port };
	rerender();
	expect(result.current.midiMapping).toBe(mapping);
	const reconnected = vi.fn();
	state.device = {
		id: "1",
		name: "Device",
		input: port,
		output: { send: reconnected },
	};
	rerender();
	expect(result.current.midiMapping).toBe(mapping);
	expect(reconnected).toHaveBeenLastCalledWith([0x90, 5, 0]);
	expect(result.current.selectedMapping).toBe("mapping.xml");
});
