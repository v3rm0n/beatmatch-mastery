import { useCallback, useEffect, useRef, useState } from "react";
import { useWebMidi } from "@/components/WebMidiProvider";
import {
	type ControllerMapping,
	type Midi,
	type MidiMessage,
	MixxxControllerMapping,
} from "@/djcontroller/mixxx";
import type { DeckId } from "@/types/deck";
import type { MidiDevice } from "@/types/midi";

export interface MidiControllerCallbacks {
	onPlay: (deckId: DeckId) => void;
	onStop: (deckId: DeckId) => void;
	onCue: (deckId: DeckId) => void;
	onRateChange: (deckId: DeckId, rate: number) => void;
	onVolumeChange: (deckId: DeckId, volume: number) => void;
	onJogWheel: (deckId: DeckId, offset: number) => void;
	onCrossfaderChange: (position: number) => void;
	isPlaying(deckId: DeckId): boolean;
	getControlValue?(group: string, key: string): number | undefined;
}

type ManifestRecord = { name: string; filename: string; id: string };
type Manifest = ManifestRecord[];

class DeviceMidi implements Midi {
	#device: MidiDevice;
	constructor(
		device: MidiDevice,
		private readonly currentDevice: () => MidiDevice | null,
	) {
		this.#device = device;
	}

	private get output() {
		const device = this.currentDevice();
		if (device?.input === this.#device.input) this.#device = device;
		return this.#device.output;
	}

	sendShortMsg(status: number, byte1: number, byte2: number): void {
		this.output?.send([status, byte1, byte2]);
	}

	send(dataList: number[], length?: number): void {
		const data = length !== undefined ? dataList.slice(0, length) : dataList;
		this.output?.send(data);
	}

	sendSysexMsg(dataList: number[], length?: number): void {
		this.send(dataList, length);
	}
}

export const useMidiController = (callbacks: MidiControllerCallbacks) => {
	const {
		midiDevices,
		selectedDevice,
		selectDevice,
		isConnected,
		isSupported,
		error,
	} = useWebMidi();
	const selectedInput = selectedDevice?.input;
	const selectedOutput = selectedDevice?.output;
	const selectedName = selectedDevice?.name;
	const selectedDeviceRef = useRef(selectedDevice);
	selectedDeviceRef.current = selectedDevice;
	const mappingRef = useRef<ControllerMapping | null>(null);
	const loadVersion = useRef(0);
	const [mappingError, setMappingError] = useState<string | null>(null);
	const [selectedMapping, setSelectedMapping] = useState("");
	const [midiMapping, setMidiMapping] = useState<ControllerMapping>(null);
	const [midiMappings, setMidiMappings] = useState<Manifest>([]);

	useEffect(() => {
		const controller = new AbortController();
		const loadManifest = async () => {
			try {
				const response = await fetch(
					`${import.meta.env.BASE_URL}controllers/manifest.json`,
					{ signal: controller.signal },
				);
				if (!response.ok) throw new Error("Could not load controller mappings");
				const manifestContent: unknown = await response.json();
				if (
					!Array.isArray(manifestContent) ||
					!manifestContent.every(
						(record) =>
							record &&
							typeof record.name === "string" &&
							typeof record.id === "string" &&
							typeof record.filename === "string" &&
							record.filename.length > 0,
					)
				)
					throw new Error("Invalid controller mapping manifest");
				if (!controller.signal.aborted) setMidiMappings(manifestContent);
			} catch (error) {
				if (!controller.signal.aborted) setMappingError(String(error));
			}
		};
		void loadManifest();
		return () => controller.abort();
	}, []);

	const loadMapping = useCallback(
		async (filename: string) => {
			const device = selectedDeviceRef.current;
			const record = midiMappings.find(
				(record) => record.filename === filename,
			);
			const version = ++loadVersion.current;
			mappingRef.current?.dispose();
			mappingRef.current = null;
			setMidiMapping(null);
			setSelectedMapping("");
			setMappingError(null);
			if (!record || !device?.input) return;
			let mapping: ControllerMapping | null = null;
			try {
				const loadText = async (file: string) => {
					const response = await fetch(
						`${import.meta.env.BASE_URL}controllers/${encodeURIComponent(file)}`,
					);
					if (version !== loadVersion.current)
						throw new Error("Mapping load cancelled");
					if (!response.ok) throw new Error(`Could not load ${file}`);
					const content = await response.text();
					if (version !== loadVersion.current)
						throw new Error("Mapping load cancelled");
					return content;
				};
				mapping = await MixxxControllerMapping.parse(
					await loadText(record.filename),
					new DeviceMidi(device, () => selectedDeviceRef.current),
					loadText,
				);
				if (version !== loadVersion.current) {
					mapping.dispose();
					return;
				}
				mapping.init();
				mappingRef.current = mapping;
				setMidiMapping(mapping);
				setSelectedMapping(filename);
			} catch (error) {
				mapping?.dispose();
				if (version === loadVersion.current)
					setMappingError(`Failed to load mapping: ${String(error)}`);
			}
		},
		[midiMappings],
	);

	useEffect(() => {
		setMidiMapping(null);
		setSelectedMapping("");
		if (selectedInput && selectedName) {
			const matches = midiMappings.filter((record) =>
				[record.name, record.id].some(
					(name) => name.toLowerCase() === selectedName.toLowerCase(),
				),
			);
			if (matches.length === 1) void loadMapping(matches[0].filename);
		}
		return () => {
			++loadVersion.current;
			mappingRef.current?.dispose();
			mappingRef.current = null;
		};
	}, [selectedInput, selectedName, midiMappings, loadMapping]);

	const handleDeviceSelection = (deviceId: string) => {
		const device = midiDevices.find(
			(device) => device.id === deviceId && device.input,
		);
		if (device) selectDevice(device);
	};

	useEffect(() => {
		if (selectedInput && midiMapping) {
			const input = selectedInput;

			const handleActions = (
				actions: ReturnType<ControllerMapping["handleIncoming"]>,
			) => {
				actions.forEach((action) => {
					if (action.type === "value" && !Number.isFinite(action.value)) return;
					if (action.type === "value" && action.control.type === "crossfader") {
						callbacks.onCrossfaderChange(
							Math.max(0, Math.min(1, (action.value + 1) / 2)),
						);
						return;
					}
					if (action.deck !== 1 && action.deck !== 2) {
						console.warn(`Ignoring messages of deck ${action.deck}`);
						return;
					}
					const deckId = action.deck === 1 ? "A" : "B";
					if (action.type === "value") {
						if (action.control.type === "volume") {
							callbacks.onVolumeChange(
								deckId,
								Math.max(0, Math.min(1, action.value)),
							);
						}
						if (action.control.type === "rate") {
							callbacks.onRateChange(
								deckId,
								Math.max(-1, Math.min(1, action.value)),
							);
						}
						if (action.control.type === "jog") {
							callbacks.onJogWheel(deckId, action.value);
						}
					} else if (action.type === "playback") {
						if (action.playing !== callbacks.isPlaying(deckId)) {
							if (action.playing) callbacks.onPlay(deckId);
							else callbacks.onStop(deckId);
						}
					} else if (action.type === "press" && action.down) {
						if (action.control.type === "play") {
							callbacks.isPlaying(deckId)
								? callbacks.onStop(deckId)
								: callbacks.onPlay(deckId);
						}
						if (action.control.type === "stopAtStart") callbacks.onStop(deckId);
						if (action.control.type === "cue") {
							callbacks.onCue(deckId);
						}
					}
				});
			};
			const unsubscribe = midiMapping.subscribe(handleActions, (error) =>
				setMappingError(`Controller error: ${String(error)}`),
			);

			const syncController = () => {
				midiMapping.syncControl(
					"[Channel1]",
					"play",
					Number(callbacks.isPlaying("A")),
				);
				midiMapping.syncControl(
					"[Channel2]",
					"play",
					Number(callbacks.isPlaying("B")),
				);
				if (callbacks.getControlValue) {
					for (const group of [
						"[Channel1]",
						"[Channel2]",
						"[Master]",
						"[Main]",
					]) {
						for (const key of [
							"volume",
							"rate",
							"jog",
							"bpm",
							"rateRange",
							"crossfader",
						]) {
							const value = callbacks.getControlValue(group, key);
							if (value !== undefined)
								midiMapping.syncControl(group, key, value);
						}
					}
				}
			};
			try {
				syncController();
			} catch (error) {
				setMappingError(`Controller error: ${String(error)}`);
			}

			input.onmidimessage = (event) => {
				if (!event.data?.length) {
					console.warn("Ignoring MIDI event without data");
					return;
				}
				const [status, ...data] = event.data as Uint8Array;

				const midiMsg: MidiMessage = { status, data };
				let actions: ReturnType<ControllerMapping["handleIncoming"]>;
				try {
					syncController();
					actions = midiMapping.handleIncoming(midiMsg);
				} catch (error) {
					setMappingError(`Controller error: ${String(error)}`);
					return;
				}

				handleActions(actions);
			};
			return () => {
				unsubscribe();
				input.onmidimessage = null;
			};
		}
	}, [selectedInput, midiMapping, callbacks]);

	useEffect(() => {
		if (!midiMapping || !selectedOutput) return;
		try {
			midiMapping.refreshOutputs();
		} catch (error) {
			setMappingError(`Controller error: ${String(error)}`);
		}
	}, [midiMapping, selectedOutput]);

	return {
		mappingError: error || mappingError,
		selectedMapping,
		midiMappings,
		midiDevices,
		selectedDevice,
		isConnected,
		midiMapping,
		loadMapping,
		handleDeviceSelection,
		isSupported,
	};
};
