import { useEffect, useState } from "react";
import { useWebMidi } from "@/components/WebMidiProvider";
import {
	type ControllerMapping,
	type Midi,
	type MidiInputCallback,
	type MidiMessage,
	MixxxControllerMapping,
} from "@/djcontroller/mixxx";
import type { DeckId } from "@/types/deck";
import type { MidiDevice } from "@/types/midi";

interface MidiControllerCallbacks {
	onPlay: (deckId: DeckId) => void;
	onStop: (deckId: DeckId) => void;
	onCue: (deckId: DeckId) => void;
	onRateChange: (deckId: DeckId, rate: number) => void;
	onVolumeChange: (deckId: DeckId, volume: number) => void;
	onJogWheel: (deckId: DeckId, offset: number) => void;
	onCrossfaderChange: (position: number) => void;
	isPlaying(deckId: DeckId): boolean;
}

type ManifestRecord = { name: string; filename: string; id: string };
type Manifest = ManifestRecord[];

class DeviceMidi implements Midi {
	#device: MidiDevice;
	constructor(device: MidiDevice) {
		this.#device = device;
	}

	sendShortMsg(status: number, byte1: number, byte2: number): void {
		this.#device.output.send([status, byte1, byte2]);
	}

	send(dataList: number[], length?: number): void {
		const data = length !== undefined ? dataList.slice(0, length) : dataList;
		this.#device.output.send(data);
	}

	sendSysexMsg(dataList: number[], length?: number): void {
		const data = length !== undefined ? dataList.slice(0, length) : dataList;
		this.#device.output.send(data);
	}

	makeInputHandler(
		_status: number,
		_midino: number,
		_callback: MidiInputCallback,
	): MidiInputHandlerController {
		return {
			disconnect() {
				return true;
			},
		};
	}
}

export const useMidiController = (callbacks: MidiControllerCallbacks) => {
	const {
		midiDevices,
		selectedDevice,
		selectDevice,
		isConnected,
		isSupported,
	} = useWebMidi();
	const [midiMapping, setMidiMapping] = useState<ControllerMapping>(null);
	const [midiMappings, setMidiMappings] = useState<Manifest>([]);

	useEffect(() => {
		const loadManifest = async () => {
			try {
				const response = await fetch("/controllers/manifest.json");
				const manifestContent = await response.json();
				setMidiMappings(manifestContent);
			} catch (error) {
				console.error("Failed to load MIDI mappings:", error);
			}
		};
		loadManifest();
	}, []);

	const loadMapping = async (mappingName: string) => {
		loadMappingWithDevice(mappingName, selectedDevice);
	};

	const loadMappingWithDevice = async (
		mappingName: string,
		device: MidiDevice,
	) => {
		const mapping = midiMappings.find((record) => record.name === mappingName);
		if (mapping) {
			const response = await fetch(`/controllers/${mapping.filename}`);
			const xmlContent = await response.text();
			const midiMapping = await MixxxControllerMapping.parse(
				xmlContent,
				new DeviceMidi(device),
				(fileName) => fetch(`/controllers/${fileName}`).then((r) => r.text()),
			);
			midiMapping.init();
			setMidiMapping(midiMapping);
		}
	};

	const resetMapping = () => {
		setMidiMapping(null);
	};

	const autoDetectMapping = (device: MidiDevice) => {
		const matchingMappings = midiMappings.filter(
			(m) =>
				device.name === m.id ||
				m.name.toLowerCase() === device.name.toLowerCase() ||
				m.id.toLowerCase() === device.name.toLowerCase(),
		);
		if (matchingMappings.length === 1) {
			console.log(
				`Auto-loading mapping for ${device.name} -> ${matchingMappings[0].name}`,
			);
			loadMappingWithDevice(matchingMappings[0].name, device);
		} else if (matchingMappings.length > 1) {
			console.log(
				`Multiple mappings found for ${device.name}, skipping auto-detection`,
			);
		}
	};

	const handleDeviceSelection = (deviceId: string) => {
		const device = midiDevices.find((d) => d.id === deviceId);
		if (device) {
			selectDevice(device);
			autoDetectMapping(device);
		}
	};

	useEffect(() => {
		if (selectedDevice?.input) {
			const input = selectedDevice.input;

			input.onmidimessage = (event) => {
				if (!("data" in event)) {
					console.warn("Ignoring MIDI event without data");
					return;
				}
				const [status, ...data] = event.data as Uint8Array;

				const midiMsg: MidiMessage = { status, data };
				const actions = midiMapping.handleIncoming(midiMsg);

				console.log(
					`MIDI message: Status: ${status.toString(16)}, data: ${data.map((n) => n.toString(16))} -> ${JSON.stringify(actions)}`,
				);

				actions.forEach((action) => {
					if (action.deck && action.deck > 2) {
						console.warn(`Ignoring messages of deck ${action.deck}`);
						return;
					}
					const deckId = action.deck === 1 ? "A" : "B";
					if (action.type === "value") {
						if (action.control.type === "volume") {
							callbacks.onVolumeChange(deckId, action.value);
						}
						if (action.control.type === "crossfader") {
							callbacks.onCrossfaderChange(action.value);
						}
						if (action.control.type === "rate") {
							callbacks.onRateChange(deckId, action.value);
						}
						if (action.control.type === "jog") {
							callbacks.onJogWheel(deckId, action.value);
						}
					} else if (action.type === "press" && action.down) {
						if (action.control.type === "play") {
							callbacks.isPlaying(deckId)
								? callbacks.onStop(deckId)
								: callbacks.onPlay(deckId);
						}
						if (action.control.type === "cue") {
							callbacks.onCue(deckId);
						}
					}
				});
			};
		}
	}, [selectedDevice, midiMapping, callbacks]);

	return {
		midiMappings,
		midiDevices,
		selectedDevice,
		isConnected,
		midiMapping,
		loadMapping,
		resetMapping,
		handleDeviceSelection,
		isSupported,
	};
};
