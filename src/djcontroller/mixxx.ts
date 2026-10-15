import { parseXml, type XmlDocument, type XmlElement } from "@rgrove/parse-xml";
import type {
	Action,
	PressAction,
	PressControl,
	ValueAction,
	ValueControl,
} from "./action";
import { relativeMidiValue } from "./midi-value";
import { SoftTakeover } from "./soft-takeover";
import {
	evalScript,
	getByKeyPath,
	isXmlElement,
	xmlChildrenToObject,
} from "./utils";

export type MidiInputCallback = (
	channel: number,
	control: number,
	value: number,
	status: number,
) => void;
export interface Midi {
	sendShortMsg(status: number, byte1: number, byte2: number): void;
	send(dataList: number[], length?: number): void;
	sendSysexMsg(dataList: number[], length?: number): void;
	makeInputHandler?(
		status: number,
		midino: number,
		callback: MidiInputCallback,
	): { disconnect(): boolean };
}

/** A MIDI controller message. */
export interface MidiMessage {
	/** The status byte. */
	status: number;
	/** Additionally data bytes, usually one or two. */
	data: number[];
}

export interface MappingInfo {
	name?: string;
	author?: string;
	description?: string;
}

/**
 * Represents a DJ controller mapping.
 * Usually a long-lived object since many controller scripts
 * maintain internal state.
 */
export interface ControllerMapping {
	/** Metadata about the mapping. */
	info: MappingInfo;

	/**
	 * Determines the actions to take based on the
	 * given MIDI message. Note that this method is
	 * _not_ pure and may update internal state.
	 *
	 * @param msg The received MIDI message
	 */
	handleIncoming(msg: MidiMessage): Action[];

	init(): void;
	refreshOutputs(): void;
	dispose(): void;
	subscribe(
		listener: (actions: Action[]) => void,
		onError?: (error: unknown) => void,
	): () => void;
	syncControl(group: string, key: string, value: number): void;
}

interface BaseMapping {
	group: string;
	key: string;
	status: number;
	midino: number;
}

interface ControlMapping extends BaseMapping {
	options: string[];
}

interface OutputMapping extends BaseMapping {
	minimum?: number;
	maximum?: number;
	on?: number;
	off?: number;
}

interface ScriptFile {
	fileName: string;
	functionPrefix?: string;
}

interface MidiMapping {
	id: string;
	info: MappingInfo;
	scriptFiles: ScriptFile[];
	controls: ControlMapping[];
	outputs: OutputMapping[];
}

function parseMappingInfo(xml: XmlElement): MappingInfo {
	const childs = xmlChildrenToObject(xml);
	return {
		name: childs.name?.text,
		author: childs.author?.text,
		description: childs.description?.text,
	};
}

function parseBaseMapping(xml: XmlElement): BaseMapping {
	const childs = xmlChildrenToObject(xml);
	return {
		group: childs.group.text,
		key: childs.key.text,
		status: parseInt(childs.status.text),
		midino: parseInt(childs.midino?.text ?? "0"),
	};
}

function parseControlMapping(xml: XmlElement): ControlMapping {
	const childs = xmlChildrenToObject(xml);
	return {
		...parseBaseMapping(xml),
		options:
			childs.options?.children.flatMap((c) =>
				isXmlElement(c) ? [c.name.toLowerCase()] : [],
			) ?? [],
	};
}

function parseOutputMapping(xml: XmlElement): OutputMapping {
	const children = xmlChildrenToObject(xml);
	return {
		...parseBaseMapping(xml),
		minimum: Number(children.minimum?.text ?? 0.5),
		maximum: Number(children.maximum?.text ?? 1),
		on: Number(children.on?.text ?? 127),
		off: Number(children.off?.text ?? 0),
	};
}

function parseScriptFile(xml: XmlElement): ScriptFile {
	const attrs = xml.attributes;
	return {
		fileName: attrs.filename,
		functionPrefix: attrs.functionprefix,
	};
}

function parseMidiMapping(xml: XmlDocument): MidiMapping {
	const preset = xml.root;
	const childs = isXmlElement(preset) ? xmlChildrenToObject(preset) : null;
	if (!childs || preset.name !== "MixxxControllerPreset") {
		throw new Error("Invalid Mixxx controller mapping");
	}
	const controller = childs.controller
		? xmlChildrenToObject(childs.controller.children)
		: {};
	return {
		id: childs.controller?.attributes.id ?? "",
		info: childs.info ? parseMappingInfo(childs.info) : {},
		scriptFiles:
			controller?.scriptfiles?.children.flatMap((c) =>
				isXmlElement(c) ? [parseScriptFile(c)] : [],
			) ?? [],
		controls:
			controller?.controls?.children.flatMap((c) =>
				isXmlElement(c) ? [parseControlMapping(c)] : [],
			) ?? [],
		outputs:
			controller?.outputs?.children.flatMap((c) =>
				isXmlElement(c) ? [parseOutputMapping(c)] : [],
			) ?? [],
	};
}

function deckFromGroup(group: string): number | null {
	const match = /\[Channel(\d+)\]/.exec(group);
	return match ? parseInt(match[1]) : null;
}

/** Creates a `PressAction` from the given mapping and `down` state. */
function makePressAction(
	group: string,
	key: string,
	down: boolean,
): PressAction | null {
	const deck = deckFromGroup(group);
	let control: PressControl | undefined;

	switch (key) {
		case "play":
			control = { type: "play" };
			break;
		case "cue_default":
			control = { type: "cue" };
			break;
		case "start_stop":
			control = { type: "stopAtStart" };
			break;
		case "loop_halve":
			control = { type: "loopResize", factor: 0.5 };
			break;
		case "loop_double":
			control = { type: "loopResize", factor: 2 };
			break;
		case "beatloop_activate":
			control = { type: "loopToggle" };
			break;
		case "sync_enabled":
			control = { type: "sync" };
			break;
		default:
			break;
	}

	// Handle parameterized keys
	// TODO: Deal with fractions?
	const beatloopToggle = /beatloop_(\d+)_toggle/.exec(key);
	if (beatloopToggle) {
		control = { type: "loopToggle", beats: parseInt(beatloopToggle[1]) };
	}

	return control ? { type: "press", control, deck, down } : null;
}

/** Creates a `ValueAction` from the given mapping and `value`. */
function makeValueAction(
	group: string,
	key: string,
	value: number,
): ValueAction | null {
	const deck = deckFromGroup(group);
	let control: ValueControl;

	switch (key) {
		case "volume":
			control = { type: "volume" };
			break;
		case "pregain":
			control = { type: "gain" };
			break;
		case "crossfader":
			control = { type: "crossfader" };
			break;
		case "rate":
			control = { type: "rate" };
			break;
		case "jog":
			control = { type: "jog" };
			break;
		default:
			break;
	}

	// Handle EQ
	if (group.includes("EqualizerRack")) {
		switch (key) {
			case "parameter1":
				control = { type: "lows" };
				break;
			case "parameter2":
				control = { type: "mids" };
				break;
			case "parameter3":
				control = { type: "highs" };
				break;
			default:
				break;
		}
	}

	return control ? { type: "value", control, value, deck } : null;
}

/**
 * Provides the same API as the `engine` object in the script.
 * It, however, doesn't actually change any values directly,
 * instead it writes actions to the passed array (which is
 * shared with the MixxxControllerMapping instance).
 */
type ControlListener =
	| ((value: number, group: string, key: string) => void)
	| string;

class InScriptEngineProxy {
	private timers = new Set<number>();
	private values = new Map<string, number>();
	private connections = new Map<string, Set<ControlListener>>();
	private listeners = new Set<(actions: Action[]) => void>();
	private errorListeners = new Set<(error: unknown) => void>();
	private batching = false;
	private disposed = false;
	context: object = {};

	constructor(private readonly sharedActions: Action[]) {}

	subscribe(
		listener: (actions: Action[]) => void,
		onError?: (error: unknown) => void,
	) {
		this.listeners.add(listener);
		if (onError) this.errorListeners.add(onError);
		return () => {
			this.listeners.delete(listener);
			if (onError) this.errorListeners.delete(onError);
		};
	}

	beginBatch() {
		this.sharedActions.length = 0;
		this.batching = true;
	}
	endBatch() {
		this.batching = false;
		return this.sharedActions.splice(0);
	}

	private emit(action: Action) {
		if (this.disposed) return;
		if (this.batching) this.sharedActions.push(action);
		else for (const listener of this.listeners) listener([action]);
	}

	dispose() {
		this.disposed = true;
		for (const timer of this.timers) window.clearInterval(timer);
		this.timers.clear();
		this.connections.clear();
		this.listeners.clear();
		this.errorListeners.clear();
	}

	getValue(group: string, key: string): number {
		return this.values.get(`${group}:${key}`) ?? (key === "volume" ? 1 : 0);
	}

	getParameter(group: string, key: string): number {
		const value = this.getValue(group, key);
		return key === "rate" || key === "crossfader" ? (value + 1) / 2 : value;
	}

	syncControl(group: string, key: string, value: number) {
		if (!Number.isFinite(value) || this.disposed) return;
		if (this.getValue(group, key) === value) return;
		this.values.set(`${group}:${key}`, value);
		this.trigger(group, key);
		if (key === "play") this.syncControl(group, "play_indicator", value);
	}

	setValue(group: string, key: string, input: number | boolean) {
		const value = Number(input);
		if (!Number.isFinite(value) || this.disposed) return;
		this.syncControl(group, key, value);
		const action: Action =
			key === "play"
				? { type: "playback", playing: value > 0, deck: deckFromGroup(group) }
				: (makePressAction(group, key, value > 0) ??
					makeValueAction(group, key, value));
		if (action) this.emit(action);
	}

	setParameter(group: string, key: string, value: number) {
		this.setValue(
			group,
			key,
			key === "rate" || key === "crossfader" ? value * 2 - 1 : value,
		);
	}

	connectControl(
		group: string,
		key: string,
		listener: ControlListener,
		disconnect = false,
	) {
		const id = `${group}:${key}`;
		const connections = this.connections.get(id) ?? new Set<ControlListener>();
		if (disconnect) connections.delete(listener);
		else connections.add(listener);
		if (connections.size) this.connections.set(id, connections);
		else this.connections.delete(id);
	}

	private notify(listener: ControlListener, group: string, key: string) {
		const path = typeof listener === "string" ? listener.split(".") : [];
		const callback =
			typeof listener === "string"
				? getByKeyPath(this.context, ...path)
				: listener;
		const owner = path.length
			? getByKeyPath(this.context, ...path.slice(0, -1))
			: undefined;
		if (typeof callback === "function")
			callback.call(owner, this.getValue(group, key), group, key);
	}

	trigger(group: string, key: string) {
		for (const listener of [...(this.connections.get(`${group}:${key}`) ?? [])])
			this.notify(listener, group, key);
	}

	makeConnection(group: string, key: string, listener: ControlListener) {
		const engine = this;
		const registration = () => this.notify(listener, group, key);
		this.connectControl(group, key, registration);
		let connected = true;
		return {
			group,
			key,
			get isConnected() {
				return connected && !engine.disposed;
			},
			disconnect: () => {
				this.connectControl(group, key, registration, true);
				connected = false;
			},
			trigger: () => {
				if (connected && !this.disposed) this.notify(listener, group, key);
			},
		};
	}

	beginTimer(
		interval: number,
		scriptCode: () => unknown,
		oneShot?: boolean,
	): number {
		if (this.disposed) return 0;
		const tick = () => {
			if (oneShot) this.timers.delete(timer);
			if (this.disposed) return;
			try {
				scriptCode();
			} catch (error) {
				this.stopTimer(timer);
				for (const listener of this.errorListeners) listener(error);
			}
		};
		const timer = oneShot
			? window.setTimeout(tick, interval)
			: window.setInterval(tick, interval);
		this.timers.add(timer);
		return timer;
	}

	stopTimer(timerId: number): void {
		window.clearInterval(timerId);
		this.timers.delete(timerId);
	}
}

const engineProxyHandler = {
	get(target, prop, receiver) {
		// If the property exists on the target, return it
		if (prop in target) {
			return Reflect.get(target, prop, receiver);
		}

		return () => {
			// Return a no-op function for missing methods
			//console.log(`Called unimplemented engine.${String(prop)}`);
		};
	},
};

/**
 * Provides the same API as the `script` object in the script.
 */
class InScriptScriptProxy {
	deckFromGroup(group: string): number {
		return deckFromGroup(group);
	}
}

/**
 * Represents a DJ controller mapping using Mixxx's
 * mapping format.
 */
export class MixxxControllerMapping implements ControllerMapping {
	/** Paired faders are keyed by control and channel, not message arrival order. */
	private pendingValues = new Map<string, { msb?: number; lsb?: number }>();
	private disposed = false;
	private initialized = false;
	private takeovers = new Map<string, SoftTakeover>();
	private outputValues = new Map<OutputMapping, number>();

	private constructor(
		private readonly midiMapping: MidiMapping,
		private readonly scriptContext: object,
		private readonly sharedActions: Action[],
		private readonly engine: InScriptEngineProxy,
		private readonly inputHandlers: Map<number, Set<MidiInputCallback>>,
		private readonly midi: Midi,
	) {}

	/**
	 * Parses a Mixxx controller mapping and loads referenced scripts.
	 *
	 * @param xmlMappingSrc The XML source of the mapping
	 * @param scriptSrcLoader Loads the script source for a given file name
	 * @returns The controller mapping
	 */
	static async parse(
		xmlMappingSrc: string,
		midi: Midi,
		scriptSrcLoader: (fileName: string) => Promise<string>,
	): Promise<MixxxControllerMapping> {
		// Mixxx presets can declare literal MIDI constants in an internal DTD.
		const entities = new Map(
			[
				...xmlMappingSrc.matchAll(
					/<!ENTITY\s+([\w.-]+)\s+["']([^"'<>]*)["']\s*>/g,
				),
			].map((match) => [match[1], match[2]]),
		);
		const xmlMapping = parseXml(xmlMappingSrc, {
			resolveUndefinedEntity: (name) => entities.get(name.slice(1, -1)),
		});
		const midiMapping = parseMidiMapping(xmlMapping);
		const sharedActions: Action[] = [];
		const engine = new InScriptEngineProxy(sharedActions);
		const sources = await Promise.all(
			midiMapping.scriptFiles.map((file) => scriptSrcLoader(file.fileName)),
		);
		const prefixes = [
			...new Set(
				midiMapping.scriptFiles.flatMap((file) =>
					file.functionPrefix ? [file.functionPrefix] : [],
				),
			),
		];
		const inputHandlers = new Map<number, Set<MidiInputCallback>>();
		const scriptMidi: Midi = {
			send: (data, length) => midi.send(data, length),
			sendSysexMsg: (data, length) => midi.sendSysexMsg(data, length),
			sendShortMsg: (status, first, second) =>
				midi.sendShortMsg(status, first, second),
			makeInputHandler: (status, midino, callback) => {
				const id = status * 128 + midino;
				const handlers = inputHandlers.get(id) ?? new Set<MidiInputCallback>();
				handlers.add(callback);
				inputHandlers.set(id, handlers);
				return { disconnect: () => handlers.delete(callback) };
			},
		};
		// Shared libraries and controller namespaces must live in the same scope.
		let scriptContext: object;
		try {
			scriptContext = evalScript(
				sources.join("\n;\n"),
				{
					engine: new Proxy(engine, engineProxyHandler),
					script: new InScriptScriptProxy(),
					midi: scriptMidi,
					print: console.log,
				},
				`{${prefixes.map((prefix) => `${JSON.stringify(prefix)}: ${prefix}`).join(",")}}`,
				prefixes.map((prefix) => prefix.split(".")[0]),
			);
		} catch (error) {
			engine.dispose();
			inputHandlers.clear();
			throw error;
		}
		engine.context = scriptContext;
		return new MixxxControllerMapping(
			midiMapping,
			scriptContext,
			sharedActions,
			engine,
			inputHandlers,
			midi,
		);
	}

	subscribe(
		listener: (actions: Action[]) => void,
		onError?: (error: unknown) => void,
	) {
		return this.engine.subscribe(listener, onError);
	}

	syncControl(group: string, key: string, value: number) {
		this.engine.syncControl(group, key, value);
	}

	get info(): MappingInfo {
		return this.midiMapping.info;
	}

	private sendOutput(output: OutputMapping, value: number) {
		if (value === 0xff || this.outputValues.get(output) === value) return;
		this.midi.sendShortMsg(output.status, output.midino, value);
		this.outputValues.set(output, value);
	}

	refreshOutputs() {
		if (this.disposed || !this.initialized) return;
		this.outputValues.clear();
		for (const output of this.midiMapping.outputs) {
			const value = this.engine.getValue(output.group, output.key);
			this.sendOutput(
				output,
				value >= output.minimum && value <= output.maximum
					? output.on
					: output.off,
			);
		}
	}

	init() {
		if (this.disposed || this.initialized) return;
		this.initialized = true;
		for (const namespace of Object.values(this.scriptContext))
			namespace?.init?.(this.midiMapping.id, false);
		for (const output of this.midiMapping.outputs) {
			const connection = this.engine.makeConnection(
				output.group,
				output.key,
				(value) => {
					const active = value >= output.minimum && value <= output.maximum;
					this.sendOutput(output, active ? output.on : output.off);
				},
			);
			connection.trigger();
		}
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		try {
			for (const namespace of Object.values(this.scriptContext)) {
				try {
					namespace?.shutdown?.();
				} catch (error) {
					console.warn("Controller shutdown failed:", error);
				}
			}
		} finally {
			for (const output of this.outputValues.keys()) {
				try {
					this.sendOutput(output, output.off);
				} catch (error) {
					console.warn("Controller LED reset failed:", error);
				}
			}
			this.engine.dispose();
			this.inputHandlers.clear();
			this.pendingValues.clear();
			this.outputValues.clear();
			this.takeovers.clear();
		}
	}

	handleIncoming(msg: MidiMessage): Action[] {
		if (this.disposed || msg.data.length < 2) return [];
		this.engine.beginBatch();
		let actions: Action[];
		try {
			for (const handler of [
				...(this.inputHandlers.get(msg.status * 128 + msg.data[0]) ?? []),
			]) {
				handler(msg.status & 0x0f, msg.data[0], msg.data[1], msg.status);
			}
			const messageType = msg.status & 0xf0;
			const matchesNumber = (control: ControlMapping) =>
				messageType === 0xe0 || control.midino === msg.data[0];
			let controls = this.midiMapping.controls.filter(
				(control) => control.status === msg.status && matchesNumber(control),
			);
			if (!controls.length && messageType === 0x80)
				controls = this.midiMapping.controls.filter(
					(control) =>
						control.status === msg.status + 0x10 && matchesNumber(control),
				);
			for (const control of controls)
				this.sharedActions.push(...this.handleControl(msg, control));
		} finally {
			actions = this.engine.endBatch();
		}
		return actions;
	}

	private handleControl(msg: MidiMessage, control: ControlMapping): Action[] {
		const messageType = msg.status & 0xf0;

		// Extract some commonly used info
		const down =
			control.options.includes("switch") ||
			((messageType !== 0x80 || control.options.includes("button")) &&
				msg.data[1] > 0);
		const rawValue = messageType === 0x80 ? 0 : msg.data[1];
		let value = rawValue / 0x7f;
		let center = 64 / 127;
		if (messageType === 0xe0) {
			value = ((msg.data[1] << 7) | msg.data[0]) / 0x3fff;
			center = 8192 / 16383;
		}
		const pairKey = `${msg.status}:${control.group}:${control.key}`;
		if (
			!control.options.includes("script-binding") &&
			(control.options.includes("fourteen-bit-msb") ||
				control.options.includes("fourteen-bit-lsb"))
		) {
			const pending = this.pendingValues.get(pairKey) ?? {};
			if (control.options.includes("fourteen-bit-msb")) pending.msb = rawValue;
			else pending.lsb = rawValue;
			this.pendingValues.set(pairKey, pending);
			if (pending.msb === undefined || pending.lsb === undefined) return [];
			value = ((pending.msb << 7) | pending.lsb) / 0x3fff;
			center = 8192 / 16383;
			this.pendingValues.delete(pairKey);
		}

		if (control.options.includes("script-binding")) {
			// Handle script bindings
			const keySplit = control.key.split(".");
			const handler = getByKeyPath(this.scriptContext, ...keySplit);
			if (typeof handler === "function") {
				const owner = getByKeyPath(
					this.scriptContext,
					...keySplit.slice(0, -1),
				);
				handler.call(
					owner,
					msg.status & 0x0f,
					msg.data[0],
					rawValue,
					msg.status,
					control.group,
				);
				return [];
			}
		} else {
			const signedControl =
				control.key === "rate" || control.key === "crossfader";
			const previous = this.engine.getValue(control.group, control.key);
			const previousMidi = signedControl
				? 64 + previous * (previous < 0 ? 64 : 63)
				: control.key === "jog"
					? previous
					: previous * 127;
			const relative = relativeMidiValue(
				rawValue,
				previousMidi,
				control.options,
			);
			if (relative !== undefined && control.key === "jog") value = relative;
			else {
				if (relative !== undefined) {
					value = Math.max(0, Math.min(127, relative)) / 127;
					center = 64 / 127;
				}
				if (signedControl)
					value = (value - center) / (value < center ? center : 1 - center);
			}
			if (control.options.includes("invert"))
				value = signedControl || control.key === "jog" ? -value : 1 - value;
			const action =
				makePressAction(control.group, control.key, down) ??
				makeValueAction(control.group, control.key, value);
			if (action) {
				if (action.type === "value") {
					if (
						control.options.includes("soft-takeover") &&
						control.key !== "jog"
					) {
						const takeover = this.takeovers.get(pairKey) ?? new SoftTakeover();
						this.takeovers.set(pairKey, takeover);
						const normalized = signedControl
							? (action.value + 1) / 2
							: action.value;
						if (
							takeover.ignore(
								normalized,
								this.engine.getParameter(control.group, control.key),
							)
						)
							return [];
					}
					this.engine.syncControl(control.group, control.key, action.value);
				}
				return [action];
			}
		}

		// Fall back to no actions
		return [];
	}
}
