import type React from "react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import type { MidiDevice } from "@/types/midi";

interface WebMidiContextType {
	midiDevices: MidiDevice[];
	selectedDevice: MidiDevice | null;
	selectDevice: (device: MidiDevice) => void;
	midiAccess: MIDIAccess | null;
	isConnected: boolean;
}

const WebMidiContext = createContext<WebMidiContextType | null>(null);

interface WebMidiProviderProps {
	children: ReactNode;
}

export const WebMidiProvider: React.FC<WebMidiProviderProps> = ({
	children,
}) => {
	const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
	const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
	const [selectedDevice, setSelectedDevice] = useState<MidiDevice | null>(null);
	const [isConnected, setIsConnected] = useState(false);

	useEffect(() => {
		const updateDevices = (access: MIDIAccess) => {
			const devices: MidiDevice[] = [];

			access.inputs.forEach((input) => {
				devices.push({
					id: input.id,
					name: input.name || "Unknown Device",
					state: input.state,
					input,
				});
			});

			access.outputs.forEach((output) => {
				const existingDevice = devices.find((d) => d.name === output.name);
				if (existingDevice) {
					existingDevice.output = output;
				} else {
					devices.push({
						id: output.id,
						name: output.name || "Unknown Device",
						state: output.state,
						output,
					});
				}
			});

			setMidiDevices(devices);
			setIsConnected(devices.some((d) => d.state === "connected"));
		};
		const initMidi = async () => {
			try {
				if (navigator.requestMIDIAccess) {
					const access = await navigator.requestMIDIAccess({ sysex: true });
					setMidiAccess(access);
					updateDevices(access);

					access.onstatechange = () => {
						updateDevices(access);
					};
				}
			} catch (error) {
				console.error("Failed to access MIDI devices:", error);
			}
		};

		initMidi();
	}, []);

	const selectDevice = (device: MidiDevice) => {
		setSelectedDevice(device);
	};

	return (
		<WebMidiContext.Provider
			value={{
				midiDevices,
				selectedDevice,
				selectDevice,
				midiAccess,
				isConnected,
			}}
		>
			{children}
		</WebMidiContext.Provider>
	);
};

export const useWebMidi = () => {
	const context = useContext(WebMidiContext);
	if (!context) {
		throw new Error("useWebMidi must be used within a WebMidiProvider");
	}
	return context;
};
