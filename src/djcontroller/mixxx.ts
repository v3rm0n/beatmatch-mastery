/// <reference path="../../public/controllers/midi-controller-api.d.ts"/>
/// <reference path="../../public/controllers/engine-api.d.ts"/>
import { parseXml, type XmlDocument, type XmlElement } from "@rgrove/parse-xml";
import type {
	Action,
	PressAction,
	PressControl,
	ValueAction,
	ValueControl,
} from "./action";
import {
	evalScript,
	getByKeyPath,
	isXmlElement,
	xmlChildrenToObject,
} from "./utils";

export type Midi = typeof midi;
export type MidiInputCallback = midi.InputCallback;

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

	/**
	 * Converts the given output action to MIDI
	 * messages. Note that this method is
	 * _not_ pure and may update internal state.
	 *
	 * @param output The output action to be sent
	 */
	prepareOutgoing(output: never): MidiMessage[];

	init(): void;
}

interface BaseMapping {
	group: string;
	key: string;
	status: number;
	midino: number;
}

interface ControlMapping extends BaseMapping {
	options: string[];
	resolution?: "low" | "high";
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
		midino: parseInt(childs.midino.text),
	};
}

function parseControlMapping(xml: XmlElement): ControlMapping {
	const childs = xmlChildrenToObject(xml);
	const midino = parseInt(childs.midino.text);
	return {
		...parseBaseMapping(xml),
		options:
			childs.options?.children.flatMap((c) =>
				isXmlElement(c) ? [c.name.toLowerCase()] : [],
			) ?? [],
		resolution: midino >= 32 && midino <= 63 ? "high" : "low",
	};
}

function parseOutputMapping(xml: XmlElement): OutputMapping {
	// TODO
	const _childs = xmlChildrenToObject(xml);
	return {
		...parseBaseMapping(xml),
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
	const controller = childs.controller
		? xmlChildrenToObject(childs.controller.children)
		: {};
	return {
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
class InScriptEngineProxy {
	constructor(private readonly sharedActions: Action[]) {}

	setValue(group: string, key: string, value: number) {
		const action = makeValueAction(group, key, value);
		if (action) {
			this.sharedActions.push(action);
		}
	}

	setParameter(group: string, key: string, value: number) {
		this.setValue(group, key, value);
	}

	beginTimer(
		interval: number,
		scriptCode: () => any,
		oneShot?: boolean,
	): number {
		if (oneShot) {
			return window.setTimeout(scriptCode, interval);
		}
		return window.setInterval(scriptCode, interval);
	}

	stopTimer(timerId: number): void {
		clearTimeout(timerId);
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
	// TODO: Investigate whether MIDI message ordering is guaranteed, e.g.
	// whether multi-messages for different channels could be interleaved
	// (and thereby introduce a race condition)

	/** The last received message. Stored to handle multi-messages. */
	private lastMsg?: MidiMessage;

	private constructor(
		private readonly midiMapping: MidiMapping,
		private readonly scriptContext: object,
		private readonly sharedActions: Action[],
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
		const xmlMapping = parseXml(xmlMappingSrc);
		const midiMapping = parseMidiMapping(xmlMapping);
		const sharedActions: Action[] = [];
		const scriptContext: object = {};

		// Load referenced scripts
		for (const scriptFile of midiMapping.scriptFiles) {
			const scriptSrc = await scriptSrcLoader(scriptFile.fileName);

			const result = evalScript(
				scriptSrc,
				{
					engine: new Proxy(
						new InScriptEngineProxy(sharedActions),
						engineProxyHandler,
					),
					script: new InScriptScriptProxy(),
					midi: midi,
					print: console.log,
				},
				scriptFile.functionPrefix,
			);

			if (scriptFile.functionPrefix) {
				scriptContext[scriptFile.functionPrefix] = result;
			}
		}

		return new MixxxControllerMapping(
			midiMapping,
			scriptContext,
			sharedActions,
		);
	}

	get info(): MappingInfo {
		return this.midiMapping.info;
	}

	init() {
		Object.keys(this.scriptContext).forEach((namespace) => {
			if (this.scriptContext[namespace].init) {
				this.scriptContext[namespace].init();
			}
		});
	}

	handleIncoming(msg: MidiMessage): Action[] {
		// Update last message
		const lastMsg = this.lastMsg;
		this.lastMsg = msg;

		// Find an associated control for the message's status/no-combo
		const control = this.midiMapping.controls.find(
			(c) => c.status === msg.status && c.midino === msg.data[0],
		);
		if (!control) {
			return [];
		}

		// Extract some commonly used info
		const down = msg.data[1] > 0;
		const rawValue = msg.data[1];
		let value: number;
		if (control.resolution === "high") {
			// For high resolution, combine current and previous message
			const currentValue = msg.data[1];
			const previousValue = lastMsg?.data[1] ?? 0;
			value = ((previousValue << 7) | currentValue) / 0x3fff;
		} else {
			// For low resolution, use single byte
			value = msg.data[1] / 0x7f;
		}
		const deck = deckFromGroup(control.group);

		if (control.options.includes("script-binding")) {
			// Handle script bindings
			const keySplit = control.key.split(".");
			const functionPrefix = keySplit[0];
			const handler = getByKeyPath(this.scriptContext, ...keySplit);
			if (handler) {
				this.sharedActions.length = 0;
				handler.call(
					this.scriptContext[functionPrefix],
					deck - 1,
					control,
					rawValue,
					msg.status,
					control.group,
				);
				return this.sharedActions;
			}
		} else {
			// Handle normal bindings
			const action =
				makePressAction(control.group, control.key, down) ??
				makeValueAction(control.group, control.key, value);
			if (action) {
				return [action];
			}
		}

		// Fall back to no actions
		return [];
	}

	prepareOutgoing(_output: never): MidiMessage[] {
		// TODO
		return [];
	}
}
