export interface MidiMappingControlNote {
  channel: number;
  note: number;
}
export interface MidiMappingControlCC {
  channel: number;
  cc: number;
}
export type MidiMappingControl = MidiMappingControlNote | MidiMappingControlCC;

export interface MidiMapping {
  playDeckA?: MidiMappingControlNote;
  playDeckB?: MidiMappingControlNote;
  cueDeckA?: MidiMappingControlNote;
  cueDeckB?: MidiMappingControlNote;
  tempoDeckA?: MidiMappingControlCC;
  tempoDeckB?: MidiMappingControlCC;
  volumeDeckA?: MidiMappingControlCC;
  volumeDeckB?: MidiMappingControlCC;
  jogWheelDeckA?: MidiMappingControlCC;
  jogWheelDeckB?: MidiMappingControlCC;
  crossfader?: MidiMappingControlCC;
}

// Common MIDI mappings for popular DJ controllers
export const CONTROLLER_MAPPINGS: { [key: string]: MidiMapping } = {
  "DDJ-FLX4": {
    playDeckA: { channel: 1, note: 11 }, // Play button for deck A (NOTE 11, Channel 1)
    playDeckB: { channel: 2, note: 11 }, // Play button for deck B (NOTE 11, Channel 2)
    cueDeckA: { channel: 1, note: 12 }, // Cue button for deck A (NOTE 12, Channel 1)
    cueDeckB: { channel: 2, note: 12 }, // Cue button for deck B (NOTE 12, Channel 2)
    tempoDeckA: { channel: 1, cc: 0 }, // Tempo fader for deck A (CC 33, Channel 1)
    tempoDeckB: { channel: 2, cc: 0 }, // Tempo fader for deck B (CC 33, Channel 2)
    volumeDeckA: { channel: 1, cc: 19 }, // Volume fader for deck A (CC 51, Channel 1)
    volumeDeckB: { channel: 2, cc: 19 }, // Volume fader for deck B (CC 51, Channel 2)
    jogWheelDeckA: { channel: 1, cc: 33 }, // Jog wheel for deck A (CC 33, Channel 1)
    jogWheelDeckB: { channel: 2, cc: 33 }, // Jog wheel for deck B (CC 33, Channel 2)
    crossfader: { channel: 7, cc: 31 }, // Crossfader (CC 63, Channel 7)
  },
};
