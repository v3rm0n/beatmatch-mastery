import { AlertTriangle, Gamepad2, Zap, ZapOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useMidiController } from "@/hooks/use-midi-controller";
import type { DeckId } from "@/types/deck";

interface MidiControllerProps {
	onPlay: (deckId: DeckId) => void;
	onStop: (deckId: DeckId) => void;
	onCue: (deckId: DeckId) => void;
	onRateChange: (deckId: DeckId, rate: number) => void;
	onVolumeChange: (deckId: DeckId, volume: number) => void;
	onJogWheel: (deckId: DeckId, offset: number) => void;
	onCrossfaderChange: (position: number) => void;
	isPlaying(deckId: DeckId): boolean;
	gameStarted: boolean;
}

export const MidiController = (props: MidiControllerProps) => {
	const {
		midiDevices,
		midiMapping,
		midiMappings,
		selectedDevice,
		isConnected,
		handleDeviceSelection,
		loadMapping,
	} = useMidiController(props);

	return (
		<Card className="p-4">
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Gamepad2 className="w-5 h-5" />
					<h3 className="font-semibold">MIDI Controller</h3>
					{isConnected ? (
						<Badge variant="default" className="bg-success">
							<Zap className="w-3 h-3 mr-1" />
							Connected
						</Badge>
					) : (
						<Badge variant="destructive">
							<ZapOff className="w-3 h-3 mr-1" />
							Disconnected
						</Badge>
					)}
				</div>

				{midiDevices.length > 0 && (
					<div className="space-y-2">
						<label className="text-sm font-medium">Select Device</label>
						<Select onValueChange={handleDeviceSelection}>
							<SelectTrigger>
								<SelectValue placeholder="Choose a MIDI device" />
							</SelectTrigger>
							<SelectContent>
								{midiDevices.map((device) => (
									<SelectItem key={device.id} value={device.id}>
										{device.name} ({device.state})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{selectedDevice && (
					<div className="space-y-2">
						<div className="text-sm">
							<strong>Active Device:</strong> {selectedDevice.name}
						</div>
					</div>
				)}

				{selectedDevice && midiMappings.length > 0 && (
					<div className="space-y-2">
						<label className="text-sm font-medium">Select Mapping</label>
						<Select
							onValueChange={loadMapping}
							value={midiMapping?.info?.name || null}
						>
							<SelectTrigger>
								<SelectValue placeholder="Choose the device type" />
							</SelectTrigger>
							<SelectContent>
								{midiMappings.map((mapping) => (
									<SelectItem
										key={mapping.name + mapping.id}
										value={mapping.name}
									>
										{mapping.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{midiMapping && (
					<div className="text-xs text-muted-foreground">
						{midiMapping.info.description && (
							<div className="mt-1">{midiMapping.info.description}</div>
						)}
					</div>
				)}

				{isConnected && !props.gameStarted && (
					<Alert>
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>Setup Required:</strong> Before starting, please set your
							controller to the initial position:
							<ul className="mt-1 ml-4 list-disc text-xs">
								<li>Move both volume faders to maximum position</li>
								<li>Center both tempo/pitch faders (0% position)</li>
								<li>Set crossfader to center position</li>
							</ul>
						</AlertDescription>
					</Alert>
				)}
			</div>
		</Card>
	);
};
