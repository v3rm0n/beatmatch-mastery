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
	isConnected: boolean;
	isSupported: boolean;
	error: string | null;
}

const WebMidiContext = createContext<WebMidiContextType | null>(null);

interface WebMidiProviderProps {
	children: ReactNode;
}

export const WebMidiProvider: React.FC<WebMidiProviderProps> = ({
	children,
}) => {
	const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
	const [selectedDevice, setSelectedDevice] = useState<MidiDevice | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isSupported, setIsSupported] = useState(true);

	useEffect(() => {
		let cancelled = false;
		let midiAccess: MIDIAccess | null = null;
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
				if (output.state !== "connected") return;
				const existingDevice = devices.find(
					(d) =>
						d.input &&
						!d.output &&
						d.name === (output.name || "Unknown Device") &&
						d.input.manufacturer === output.manufacturer,
				);
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

			if (cancelled) return;
			setSelectedDevice((previous) => {
				if (!previous) return null;
				const current = devices.find(
					(device) =>
						device.id === previous.id && device.input?.state === "connected",
				);
				if (!current) return null;
				return current.input === previous.input &&
					current.output === previous.output &&
					current.state === previous.state
					? previous
					: current;
			});
			setMidiDevices(devices);
			setIsConnected(devices.some((d) => d.input?.state === "connected"));
		};
		const initMidi = async () => {
			try {
				if (navigator.requestMIDIAccess) {
					const access = await navigator.requestMIDIAccess({ sysex: true });
					if (cancelled) return;
					midiAccess = access;
					updateDevices(access);

					access.onstatechange = () => {
						updateDevices(access);
					};
					setIsSupported(true);
				} else {
					setIsSupported(false);
				}
			} catch (error) {
				if (!cancelled) setError(`MIDI access failed: ${String(error)}`);
			}
		};

		void initMidi();
		return () => {
			cancelled = true;
			if (midiAccess) midiAccess.onstatechange = null;
		};
	}, []);

	return (
		<WebMidiContext.Provider
			value={{
				midiDevices,
				selectedDevice,
				selectDevice: setSelectedDevice,
				isConnected,
				isSupported,
				error,
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
