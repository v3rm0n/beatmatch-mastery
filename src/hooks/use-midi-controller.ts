import { useCallback, useEffect, useState } from "react";
import { useWebMidi } from "@/components/WebMidiProvider";
import {
	CONTROLLER_MAPPINGS,
	type MidiMapping,
	type MidiMappingControl,
} from "@/constants/midiMappings";

interface MidiControllerCallbacks {
	onDeckAPlay: () => void;
	onDeckBPlay: () => void;
	onDeckAStop: () => void;
	onDeckBStop: () => void;
	onDeckACue: () => void;
	onDeckBCue: () => void;
	onDeckATempoOffsetChange: (offset: number) => void;
	onDeckBTempoOffsetChange: (offset: number) => void;
	onDeckAVolumeChange: (volume: number) => void;
	onDeckBVolumeChange: (volume: number) => void;
	onDeckAJogWheel: (offset: number) => void;
	onDeckBJogWheel: (offset: number) => void;
	deckAPlaying: boolean;
	deckBPlaying: boolean;
	maxBpmVariation: number;
}

export const useMidiController = (callbacks: MidiControllerCallbacks) => {
	const { midiDevices, selectedDevice, selectDevice, isConnected } =
		useWebMidi();
	const [midiMapping, setMidiMapping] = useState<MidiMapping>({});

	const loadMapping = (deviceName: string) => {
		const mapping = CONTROLLER_MAPPINGS[deviceName];
		if (mapping) {
			setMidiMapping(mapping);
		}
	};

	const resetMapping = () => {
		setMidiMapping({});
	};

	const sendLEDCommand = useCallback(
		(channel: number, note: number, state: boolean) => {
			if (selectedDevice?.output) {
				// LED on: Note On with velocity 127, LED off: Note On with velocity 0
				const status = 0x90 + (channel - 1); // Note On message
				const velocity = state ? 127 : 0;
				selectedDevice.output.send([status, note, velocity]);
			}
		},
		[selectedDevice],
	);

	const updatePlayLED = useCallback(
		(deck: "A" | "B", isPlaying: boolean) => {
			const mapping =
				deck === "A" ? midiMapping.playDeckA : midiMapping.playDeckB;
			if (mapping && "note" in mapping) {
				sendLEDCommand(mapping.channel, mapping.note, isPlaying);
			}
		},
		[midiMapping, sendLEDCommand],
	);

	const _updateCueLED = useCallback(
		(deck: "A" | "B", isActive: boolean) => {
			const mapping =
				deck === "A" ? midiMapping.cueDeckA : midiMapping.cueDeckB;
			if (mapping && "note" in mapping) {
				sendLEDCommand(mapping.channel, mapping.note, isActive);
			}
		},
		[midiMapping, sendLEDCommand],
	);

	useEffect(() => {
		updatePlayLED("A", callbacks.deckAPlaying);
	}, [callbacks.deckAPlaying, updatePlayLED]);

	useEffect(() => {
		updatePlayLED("B", callbacks.deckBPlaying);
	}, [callbacks.deckBPlaying, updatePlayLED]);

	const handleDeviceSelection = (deviceId: string) => {
		const device = midiDevices.find((d) => d.id === deviceId);
		if (device) {
			selectDevice(device);
			// Auto-load mapping if available
			for (const [name, mapping] of Object.entries(CONTROLLER_MAPPINGS)) {
				if (device.name.includes(name.split("-")[0])) {
					setMidiMapping(mapping);
					break;
				}
			}
		}
	};

	useEffect(() => {
		const handleJogWheelValue = (midiValue: number): number => {
			const CENTER_VALUE = 0x40; // 64 in decimal

			if (midiValue > CENTER_VALUE) {
				const amount = midiValue - CENTER_VALUE;
				// Much more aggressive scaling to match Rekordbox feel
				if (amount <= 2) {
					return amount * 1.0; // Even slow movements should be noticeable
				} else if (amount <= 5) {
					return amount * 1.5; // Medium control
				} else {
					return amount * 2.0; // Fast movements get dramatic effect
				}
			} else if (midiValue < CENTER_VALUE) {
				const amount = CENTER_VALUE - midiValue;
				if (amount <= 2) {
					return -amount * 1.0;
				} else if (amount <= 5) {
					return -amount * 1.5;
				} else {
					return -amount * 2.0;
				}
			}

			return 0;
		};

		const handleMidiControl = (
			channel: number,
			control: number,
			value: number,
			isNote: boolean,
		) => {
			const mapping = midiMapping;
			const maxBpmVariation = callbacks.maxBpmVariation;

			// Convert MIDI value (0-127) to appropriate range
			const normalizedValue = value / 127;

			// Helper function to check if control matches mapping
			const matchesControl = (mappingControl: MidiMappingControl) => {
				if (!mappingControl) return false;
				const expectedIsNote = "note" in mappingControl;
				const controlValue = expectedIsNote
					? mappingControl.note
					: mappingControl.cc;
				return (
					mappingControl.channel === channel &&
					controlValue === control &&
					expectedIsNote === isNote
				);
			};

			if (matchesControl(mapping.playDeckA)) {
				if (value > 64) {
					// Button pressed
					callbacks.deckAPlaying
						? callbacks.onDeckAStop()
						: callbacks.onDeckAPlay();
				}
			} else if (matchesControl(mapping.playDeckB)) {
				if (value > 64) {
					callbacks.deckBPlaying
						? callbacks.onDeckBStop()
						: callbacks.onDeckBPlay();
				}
			} else if (matchesControl(mapping.cueDeckA)) {
				if (value > 64) {
					// Cue button pressed
					callbacks.onDeckACue();
				}
			} else if (matchesControl(mapping.cueDeckB)) {
				if (value > 64) {
					// Cue button pressed
					callbacks.onDeckBCue();
				}
			} else if (matchesControl(mapping.tempoDeckA)) {
				const tempo =
					Math.round(normalizedValue * (2 * maxBpmVariation) * 10) / 10 -
					maxBpmVariation;
				callbacks.onDeckATempoOffsetChange(tempo);
			} else if (matchesControl(mapping.tempoDeckB)) {
				const tempo =
					Math.round(normalizedValue * (2 * maxBpmVariation) * 10) / 10 -
					maxBpmVariation;
				callbacks.onDeckBTempoOffsetChange(tempo);
			} else if (matchesControl(mapping.volumeDeckA)) {
				callbacks.onDeckAVolumeChange(normalizedValue);
			} else if (matchesControl(mapping.volumeDeckB)) {
				callbacks.onDeckBVolumeChange(normalizedValue);
			} else if (matchesControl(mapping.jogWheelDeckA)) {
				// Handle relative encoder for jog wheel
				const jogWheelOffset = handleJogWheelValue(value);
				if (jogWheelOffset !== 0) {
					callbacks.onDeckAJogWheel(jogWheelOffset);
				}
			} else if (matchesControl(mapping.jogWheelDeckB)) {
				// Handle relative encoder for jog wheel
				const jogWheelOffset = handleJogWheelValue(value);
				if (jogWheelOffset !== 0) {
					callbacks.onDeckBJogWheel(jogWheelOffset);
				}
			}
		};

		if (selectedDevice?.input) {
			const input = selectedDevice.input;

			input.onmidimessage = (event) => {
				const [status, data1, data2] = event.data;
				const channel = (status & 0x0f) + 1; // Convert to 1-based channel
				const messageType = status & 0xf0;

				// Handle both NOTE and CC messages
				if (messageType === 0x90 || messageType === 0x80) {
					// Note On (0x90) or Note Off (0x80)
					const isNoteOn = messageType === 0x90 && data2 > 0;
					const noteValue = isNoteOn ? data2 : 0;
					handleMidiControl(channel, data1, noteValue, true);
				} else if (messageType === 0xb0) {
					// Control Change (0xB0)
					handleMidiControl(channel, data1, data2, false);
				}
			};
		}
	}, [selectedDevice, midiMapping, callbacks]);

	return {
		midiDevices,
		selectedDevice,
		isConnected,
		midiMapping,
		loadMapping,
		resetMapping,
		handleDeviceSelection,
	};
};
