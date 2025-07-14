// Web MIDI API type definitions
export interface MIDIInput extends EventTarget {
	readonly id: string;
	readonly manufacturer?: string;
	readonly name?: string;
	readonly type: "input";
	readonly version?: string;
	readonly state: "disconnected" | "connected";
	readonly connection: "open" | "closed" | "pending";

	onmidimessage: ((event: MIDIMessageEvent) => void) | null;
	onstatechange: ((event: MIDIConnectionEvent) => void) | null;

	open(): Promise<MIDIInput>;
	close(): Promise<MIDIInput>;
}

export interface MIDIOutput extends EventTarget {
	readonly id: string;
	readonly manufacturer?: string;
	readonly name?: string;
	readonly type: "output";
	readonly version?: string;
	readonly state: "disconnected" | "connected";
	readonly connection: "open" | "closed" | "pending";

	onstatechange: ((event: MIDIConnectionEvent) => void) | null;

	open(): Promise<MIDIOutput>;
	close(): Promise<MIDIOutput>;
	send(data: number[] | Uint8Array, timestamp?: number): void;
	clear(): void;
}

export interface MIDIAccess extends EventTarget {
	readonly inputs: Map<string, MIDIInput>;
	readonly outputs: Map<string, MIDIOutput>;
	readonly sysexEnabled: boolean;

	onstatechange: ((event: MIDIConnectionEvent) => void) | null;
}

export interface MIDIMessageEvent extends Event {
	readonly data: Uint8Array;
	readonly timeStamp: number;
}

export interface MIDIConnectionEvent extends Event {
	readonly port: MIDIInput | MIDIOutput;
}

export interface Navigator {
	requestMIDIAccess(options?: MIDIOptions): Promise<MIDIAccess>;
}

export interface MIDIOptions {
	sysex?: boolean;
	software?: boolean;
}

declare global {
	interface Navigator {
		requestMIDIAccess(options?: MIDIOptions): Promise<MIDIAccess>;
	}
}

export interface MidiDevice {
	id: string;
	name: string;
	state: string;
	input?: MIDIInput;
	output?: MIDIOutput;
}
