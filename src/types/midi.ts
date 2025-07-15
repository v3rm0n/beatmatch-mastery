export interface MidiDevice {
	id: string;
	name: string;
	state: string;
	input?: MIDIInput;
	output?: MIDIOutput;
}
