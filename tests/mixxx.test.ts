import { afterEach, describe, expect, it, vi } from "vitest";
import { type Midi, MixxxControllerMapping } from "@/djcontroller/mixxx";

const midi: Midi = {
	sendShortMsg: vi.fn(),
	send: vi.fn(),
	sendSysexMsg: vi.fn(),
	makeInputHandler: vi.fn(),
};
const control = (
	key: string,
	number = 1,
	group = "[Channel1]",
	options = "",
	status = "0xB0",
) =>
	`<control><group>${group}</group><key>${key}</key><status>${status}</status><midino>${number}</midino><options>${options}</options></control>`;
const xml = (controls: string, scripts = "") =>
	`<MixxxControllerPreset><info><name>Test</name></info><controller><scriptfiles>${scripts}</scriptfiles><controls>${controls}</controls></controller></MixxxControllerPreset>`;
const parse = (controls: string) =>
	MixxxControllerMapping.parse(xml(controls), midi, async () => "");

afterEach(() => vi.useRealTimers());
describe("Mixxx MIDI translation", () => {
	it.each([0, 127])(
		"maps pitch endpoint %s to a signed offset",
		async (raw) => {
			const mapping = await parse(control("rate"));
			expect(
				mapping.handleIncoming({ status: 0xb0, data: [1, raw] })[0],
			).toMatchObject({ value: raw === 0 ? -1 : 1 });
		},
	);
	it("keeps an ordinary controller numbered 32 at seven bit resolution", async () => {
		const mapping = await parse(control("volume", 32));
		expect(
			mapping.handleIncoming({ status: 0xb0, data: [32, 127] })[0],
		).toMatchObject({ value: 1 });
	});
	it("pairs high resolution values by controller and channel despite intervening messages", async () => {
		const mapping = await parse(
			control("volume", 1, "[Channel1]", "<fourteen-bit-msb/>") +
				control("volume", 33, "[Channel1]", "<fourteen-bit-lsb/>"),
		);
		mapping.handleIncoming({ status: 0xb0, data: [1, 64] });
		mapping.handleIncoming({ status: 0xb1, data: [1, 127] });
		mapping.handleIncoming({ status: 0x90, data: [55, 127] });
		expect(
			mapping.handleIncoming({ status: 0xb0, data: [33, 0] })[0],
		).toMatchObject({ value: 8192 / 16383 });
	});
	it("applies inverted faders", async () => {
		const mapping = await parse(
			control("volume", 1, "[Channel1]", "<invert/>"),
		);
		expect(
			mapping.handleIncoming({ status: 0xb0, data: [1, 0] })[0],
		).toMatchObject({ value: 1 });
	});
	it("recognizes note-off releases and ignores incomplete messages", async () => {
		const mapping = await parse(control("play", 1, "[Channel1]", "", "0x90"));
		expect(
			mapping.handleIncoming({ status: 0x80, data: [1, 64] })[0],
		).toMatchObject({ down: false });
		expect(mapping.handleIncoming({ status: 0xf8, data: [] })).toEqual([]);
	});
	it("shares library scope, passes numeric control/channel arguments, and translates scripted presses", async () => {
		const mapping = await MixxxControllerMapping.parse(
			xml(
				control("Device.press", 7, "[Channel2]", "<script-binding/>", "0x93"),
				'<file filename="lib.js"/><file filename="device.js" functionprefix="Device"/>',
			),
			midi,
			async (file) =>
				file === "lib.js"
					? "var library = { key: 'play' };"
					: "var Device = { press: function(channel, control, value) { if(channel === 3 && control === 7) engine.setValue('[Channel2]', library.key, value); } };",
		);
		expect(mapping.handleIncoming({ status: 0x93, data: [7, 127] })).toEqual([
			{ type: "playback", playing: true, deck: 2 },
		]);
	});
	it("cleans up script timers on disposal", async () => {
		vi.useFakeTimers();
		const mapping = await MixxxControllerMapping.parse(
			xml("", '<file filename="device.js" functionprefix="Device"/>'),
			midi,
			async () =>
				"var Device = { init: function() { engine.beginTimer(100, function() {}); } };",
		);
		mapping.init();
		expect(vi.getTimerCount()).toBe(1);
		mapping.dispose();
		expect(vi.getTimerCount()).toBe(0);
	});
	it("rejects documents that are not controller mappings", async () => {
		await expect(
			MixxxControllerMapping.parse("<html/>", midi, async () => ""),
		).rejects.toThrow("Invalid Mixxx");
	});
});

it("keeps pitch exactly centered", async () => {
	const mapping = await parse(control("rate"));
	expect(
		mapping.handleIncoming({ status: 0xb0, data: [1, 64] })[0],
	).toMatchObject({ value: 0 });
});
it("resolves literal constants in mapping DTDs", async () => {
	const source =
		'<!DOCTYPE MixxxControllerPreset [<!ENTITY CC "0xB0">]>' +
		xml(control("volume").replace("0xB0", "&CC;"));
	const mapping = await MixxxControllerMapping.parse(
		source,
		midi,
		async () => "",
	);
	expect(
		mapping.handleIncoming({ status: 0xb0, data: [1, 127] })[0],
	).toMatchObject({ value: 1 });
});

const scripted = (
	source: string,
	controls = control(
		"Device.input",
		1,
		"[Channel1]",
		"<script-binding/>",
		"0x90",
	),
) =>
	MixxxControllerMapping.parse(
		xml(controls, '<file filename="device.js" functionprefix="Device"/>'),
		midi,
		async () => source,
	);

it("delivers explicit script play and stop assignments without treating them as toggles", async () => {
	const mapping = await scripted(
		"var Device = { input: function(channel, control, value) { engine.setValue('[Channel1]', 'play', value > 0); } }; ",
	);
	expect(mapping.handleIncoming({ status: 0x90, data: [1, 127] })).toEqual([
		{ type: "playback", playing: true, deck: 1 },
	]);
	expect(mapping.handleIncoming({ status: 0x90, data: [1, 0] })).toEqual([
		{ type: "playback", playing: false, deck: 1 },
	]);
});

it("lets script toggles read the current deck state", async () => {
	const mapping = await scripted(
		"var Device = { input: function() { engine.setValue('[Channel1]', 'play', !engine.getValue('[Channel1]', 'play')); } }; ",
	);
	mapping.syncControl("[Channel1]", "play", 1);
	expect(mapping.handleIncoming({ status: 0x90, data: [1, 127] })).toEqual([
		{ type: "playback", playing: false, deck: 1 },
	]);
});

it("delivers timer actions asynchronously, unsubscribes, and stops disposed timers", async () => {
	vi.useFakeTimers();
	const mapping = await scripted(
		"var Device = { init: function() { engine.beginTimer(100, function() { engine.setValue('[Channel1]', 'volume', 0.25); }); } }; ",
	);
	const listener = vi.fn();
	const unsubscribe = mapping.subscribe(listener);
	mapping.init();
	vi.advanceTimersByTime(100);
	expect(listener).toHaveBeenCalledWith([
		{ type: "value", control: { type: "volume" }, value: 0.25, deck: 1 },
	]);
	unsubscribe();
	vi.advanceTimersByTime(100);
	expect(listener).toHaveBeenCalledTimes(1);
	mapping.dispose();
	expect(vi.getTimerCount()).toBe(0);
});

it("registers dynamic MIDI handlers and disconnects them", async () => {
	const mapping = await scripted(
		"var Device = { init: function() { this.connection = midi.makeInputHandler(0x91, 7, function(channel, control, value) { if (channel === 1 && control === 7) engine.setValue('[Channel2]', 'volume', value / 127); }); }, input: function() { this.connection.disconnect(); } }; ",
	);
	mapping.init();
	expect(mapping.handleIncoming({ status: 0x91, data: [7, 127] })).toEqual([
		{ type: "value", control: { type: "volume" }, value: 1, deck: 2 },
	]);
	mapping.handleIncoming({ status: 0x90, data: [1, 127] });
	expect(mapping.handleIncoming({ status: 0x91, data: [7, 0] })).toEqual([]);
	mapping.dispose();
});

it("notifies control connections and normalizes signed parameters", async () => {
	const mapping = await scripted(
		"var Device = { init: function() { this.connection = engine.makeConnection('[Channel1]', 'play', function(value) { engine.setParameter('[Master]', 'crossfader', value); }); }, input: function() { this.connection.disconnect(); } }; ",
	);
	mapping.init();
	const listener = vi.fn();
	mapping.subscribe(listener);
	mapping.syncControl("[Channel1]", "play", 1);
	expect(listener).toHaveBeenCalledWith([
		{ type: "value", control: { type: "crossfader" }, deck: null, value: 1 },
	]);
	mapping.handleIncoming({ status: 0x90, data: [1, 127] });
	mapping.syncControl("[Channel1]", "play", 0);
	expect(listener).toHaveBeenCalledTimes(1);
	mapping.dispose();
});

it("releases timers if a controller script throws during evaluation", async () => {
	vi.useFakeTimers();
	await expect(
		scripted(
			"engine.beginTimer(100, function() {}); throw new Error('broken');",
		),
	).rejects.toThrow("broken");
	expect(vi.getTimerCount()).toBe(0);
});

it("binds nested controller handlers to their owning deck object", async () => {
	const mapping = await scripted(
		"var Device = { deck: { amount: 0.4, input: function() { engine.setValue('[Channel1]', 'volume', this.amount); } } };",
		control("Device.deck.input", 1, "[Channel1]", "<script-binding/>", "0x90"),
	);
	expect(
		mapping.handleIncoming({ status: 0x90, data: [1, 127] })[0],
	).toMatchObject({ value: 0.4 });
});

it.each([
	[0, 0, -1],
	[0, 64, 0],
	[127, 127, 1],
])("decodes pitch bend bytes %s and %s", async (lsb, msb, expected) => {
	const mapping = await parse(control("rate", 0, "[Channel1]", "", "0xE0"));
	expect(
		mapping.handleIncoming({ status: 0xe0, data: [lsb, msb] })[0],
	).toMatchObject({ value: expected });
});

it("accepts pitch bend mappings that omit the controller number", async () => {
	const mapping = await parse(
		control("rate", 0, "[Channel1]", "", "0xE0").replace(
			"<midino>0</midino>",
			"",
		),
	);
	expect(
		mapping.handleIncoming({ status: 0xe0, data: [127, 127] })[0],
	).toMatchObject({ value: 1 });
});

it("keeps inverted pitch centered", async () => {
	const mapping = await parse(control("rate", 1, "[Channel1]", "<invert/>"));
	expect(
		Math.abs(
			(
				mapping.handleIncoming({ status: 0xb0, data: [1, 64] })[0] as {
					value: number;
				}
			).value,
		),
	).toBe(0);
});

it("prefers an explicit note-off mapping over note-on fallback", async () => {
	const mapping = await parse(
		control("play", 1, "[Channel1]", "", "0x90") +
			control("cue_default", 1, "[Channel1]", "", "0x80"),
	);
	expect(
		mapping.handleIncoming({ status: 0x80, data: [1, 64] })[0],
	).toMatchObject({ control: { type: "cue" }, down: false });
});

it("binds named control callbacks to their owning script object", async () => {
	const mapping = await scripted(
		"var Device = { init: function() { engine.connectControl('[Channel1]', 'play', 'Device.deck.changed'); }, deck: { volume: 0.3, changed: function() { engine.setValue('[Channel1]', 'volume', this.volume); } } }; ",
	);
	mapping.init();
	const listener = vi.fn();
	mapping.subscribe(listener);
	mapping.syncControl("[Channel1]", "play", 1);
	expect(listener).toHaveBeenCalledWith([
		{ type: "value", control: { type: "volume" }, deck: 1, value: 0.3 },
	]);
	mapping.dispose();
});

it("keeps implicit legacy namespaces local to each mapping", async () => {
	vi.stubGlobal("Device", { sentinel: true });
	try {
		const first = await scripted(
			"Device = { volume: 0.2, input: function() { engine.setValue('[Channel1]', 'volume', Device.volume); } };",
		);
		const second = await scripted(
			"Device = { volume: 0.8, input: function() { engine.setValue('[Channel1]', 'volume', Device.volume); } };",
		);
		expect(
			first.handleIncoming({ status: 0x90, data: [1, 127] })[0],
		).toMatchObject({ value: 0.2 });
		expect(
			second.handleIncoming({ status: 0x90, data: [1, 127] })[0],
		).toMatchObject({ value: 0.8 });
		expect((globalThis as unknown as { Device: object }).Device).toEqual({
			sentinel: true,
		});
		first.dispose();
		second.dispose();
	} finally {
		vi.unstubAllGlobals();
	}
});

it.each(["let", "const", "var"])(
	"also loads scripts that declare namespaces with %s",
	async (declaration) => {
		const mapping = await scripted(
			`${declaration} Device = { input: function() { engine.setValue('[Channel1]', 'volume', 0.4); } };`,
		);
		expect(
			mapping.handleIncoming({ status: 0x90, data: [1, 127] })[0],
		).toMatchObject({ value: 0.4 });
		mapping.dispose();
	},
);

it("decodes relative jog wheels in both directions", async () => {
	const mapping = await parse(control("jog", 1, "[Channel1]", "<spread64/>"));
	expect(
		mapping.handleIncoming({ status: 0xb0, data: [1, 65] })[0],
	).toMatchObject({ value: 1 });
	expect(
		mapping.handleIncoming({ status: 0xb0, data: [1, 63] })[0],
	).toMatchObject({ value: -1 });
});

it("accumulates relative volume changes from the current software value", async () => {
	const mapping = await parse(control("volume", 1, "[Channel1]", "<diff/>"));
	mapping.syncControl("[Channel1]", "volume", 64 / 127);
	expect(
		mapping.handleIncoming({ status: 0xb0, data: [1, 127] })[0],
	).toMatchObject({ value: 63 / 127 });
	expect(
		mapping.handleIncoming({ status: 0xb0, data: [1, 1] })[0],
	).toMatchObject({ value: 64 / 127 });
});

it("pairs 14-bit messages when the least significant byte arrives first", async () => {
	const mapping = await parse(
		control("volume", 1, "[Channel1]", "<fourteen-bit-msb/>") +
			control("volume", 33, "[Channel1]", "<fourteen-bit-lsb/>"),
	);
	expect(mapping.handleIncoming({ status: 0xb0, data: [33, 127] })).toEqual([]);
	expect(
		mapping.handleIncoming({ status: 0xb0, data: [1, 127] })[0],
	).toMatchObject({ value: 1 });
	expect(mapping.handleIncoming({ status: 0xb0, data: [33, 0] })).toEqual([]);
	expect(
		mapping.handleIncoming({ status: 0xb0, data: [1, 0] })[0],
	).toMatchObject({ value: 0 });
});

it("handles zero-valued switch messages as presses", async () => {
	const mapping = await parse(
		control("play", 1, "[Channel1]", "<switch/>", "0x90"),
	);
	expect(
		mapping.handleIncoming({ status: 0x90, data: [1, 0] })[0],
	).toMatchObject({ down: true });
});

it("reports failed controller timers once and cancels them", async () => {
	vi.useFakeTimers();
	const mapping = await scripted(
		"var Device = { init: function() { engine.beginTimer(100, function() { throw new Error('Timer failed'); }); } }; ",
	);
	const onError = vi.fn();
	mapping.subscribe(vi.fn(), onError);
	mapping.init();
	vi.advanceTimersByTime(500);
	expect(onError).toHaveBeenCalledTimes(1);
	expect(onError.mock.calls[0][0].message).toBe("Timer failed");
	expect(vi.getTimerCount()).toBe(0);
	mapping.dispose();
});

it("executes every mapping for a shared MIDI message", async () => {
	const mapping = await parse(
		control("volume", 1, "[Channel1]") + control("volume", 1, "[Channel2]"),
	);
	expect(mapping.handleIncoming({ status: 0xb0, data: [1, 127] })).toEqual([
		{ type: "value", control: { type: "volume" }, deck: 1, value: 1 },
		{ type: "value", control: { type: "volume" }, deck: 2, value: 1 },
	]);
});

it("preserves action order when native and script bindings share a message", async () => {
	const mapping = await scripted(
		"var Device = { input: function() { engine.setValue('[Channel2]', 'volume', 0.2); } };",
		control("volume", 1, "[Channel1]", "", "0x90") +
			control("Device.input", 1, "[Channel2]", "<script-binding/>", "0x90"),
	);
	expect(mapping.handleIncoming({ status: 0x90, data: [1, 127] })).toEqual([
		{ type: "value", control: { type: "volume" }, deck: 1, value: 1 },
		{ type: "value", control: { type: "volume" }, deck: 2, value: 0.2 },
	]);
});

it("keeps separate control connections independent even when their callback is shared", async () => {
	const transport = { ...midi, sendShortMsg: vi.fn() };
	const mapping = await MixxxControllerMapping.parse(
		xml(
			control("Device.input", 1, "[Channel1]", "<script-binding/>", "0x90"),
			'<file filename="device.js" functionprefix="Device"/>',
		),
		transport,
		async () =>
			"var Device = { init: function() { var callback = function(value) { midi.sendShortMsg(0x90, 1, value * 127); }; this.first = engine.makeConnection('[Channel1]', 'play', callback); this.second = engine.makeConnection('[Channel1]', 'play', callback); }, input: function() { this.first.disconnect(); engine.setValue('[Channel1]', 'play', 1); } }; ",
	);
	mapping.init();
	mapping.handleIncoming({ status: 0x90, data: [1, 127] });
	expect(transport.sendShortMsg).toHaveBeenCalledExactlyOnceWith(0x90, 1, 127);
	mapping.dispose();
});

const output = (key: string, extra = "") =>
	`<output><group>[Channel1]</group><key>${key}</key><status>0x90</status><midino>3</midino>${extra}</output>`;
const outputMapping = (outputs: string, transport: Midi) =>
	MixxxControllerMapping.parse(
		xml("").replace(
			"</controller>",
			`<outputs>${outputs}</outputs></controller>`,
		),
		transport,
		async () => "",
	);

it("updates mapped LEDs for playback changes and resets them on disposal", async () => {
	const transport = { ...midi, sendShortMsg: vi.fn() };
	const mapping = await outputMapping(
		output("play_indicator", "<minimum>0.5</minimum>"),
		transport,
	);
	mapping.init();
	expect(transport.sendShortMsg).toHaveBeenLastCalledWith(0x90, 3, 0);
	mapping.syncControl("[Channel1]", "play", 1);
	expect(transport.sendShortMsg).toHaveBeenLastCalledWith(0x90, 3, 127);
	mapping.syncControl("[Channel1]", "play", 1);
	expect(transport.sendShortMsg).toHaveBeenCalledTimes(2);
	mapping.dispose();
	expect(transport.sendShortMsg).toHaveBeenLastCalledWith(0x90, 3, 0);
});

it("honors LED ranges, custom bytes, and the no-output sentinel", async () => {
	const transport = { ...midi, sendShortMsg: vi.fn() };
	const mapping = await outputMapping(
		output(
			"volume",
			"<minimum>0.2</minimum><maximum>0.8</maximum><on>0x45</on><off>0xff</off>",
		),
		transport,
	);
	mapping.init();
	expect(transport.sendShortMsg).not.toHaveBeenCalled();
	mapping.syncControl("[Channel1]", "volume", 0.5);
	expect(transport.sendShortMsg).toHaveBeenCalledExactlyOnceWith(0x90, 3, 0x45);
	mapping.syncControl("[Channel1]", "volume", 1);
	mapping.dispose();
	expect(transport.sendShortMsg).toHaveBeenCalledTimes(1);
});

it("honors soft takeover on XML faders", async () => {
	const mapping = await parse(
		control("volume", 1, "[Channel1]", "<soft-takeover/>"),
	);
	mapping.syncControl("[Channel1]", "volume", 0.5);
	expect(mapping.handleIncoming({ status: 0xb0, data: [1, 0] })).toEqual([]);
	expect(mapping.handleIncoming({ status: 0xb0, data: [1, 10] })).toEqual([]);
	expect(
		mapping.handleIncoming({ status: 0xb0, data: [1, 64] })[0],
	).toMatchObject({ value: 64 / 127 });
});
