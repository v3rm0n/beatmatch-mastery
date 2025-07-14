import { Disc3, Pause, Play, Volume2 } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OffsetSlider } from "@/components/ui/offset-slider";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Beat } from "@/components/audio/AudioEngine";

interface DeckProps {
  deckId: "A" | "B";
  maxBpmVariation: number;
  isPlaying: boolean;
  tempo: number;
  tempoOffset: number;
  volume: number;
  currentBeat: number;
  pattern: Beat[];
  patternName: string;
  isHidden?: boolean;
  onPlay: () => void;
  onStop: () => void;
  onTempoOffsetChange: (offset: number) => void;
  onVolumeChange: (volume: number) => void;
}

export const Deck: React.FC<DeckProps> = ({
  deckId,
  maxBpmVariation,
  isPlaying,
  tempo,
  tempoOffset,
  volume,
  currentBeat,
  pattern,
  patternName,
  isHidden = false,
  onPlay,
  onStop,
  onTempoOffsetChange,
  onVolumeChange,
}) => {
  return (
    <Card className="bg-gradient-deck border-border/50 shadow-deck p-6">
      <div className="space-y-6">
        {/* Deck Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold",
                deckId === "A"
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-accent-foreground",
              )}
            >
              {deckId}
            </div>
            <div>
              <h3 className="text-lg font-semibold">Deck {deckId}</h3>
              <Badge variant="secondary">{patternName}</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Disc3
              className={cn(
                "w-8 h-8 transition-transform",
                isPlaying && "animate-spin",
              )}
            />
            <div
              className={cn(
                "w-3 h-3 rounded-full",
                isPlaying ? "bg-success animate-pulse" : "bg-muted",
              )}
            />
          </div>
        </div>

        {/* Beat Pattern Visualization */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Beat Pattern
          </label>
          <div className="grid grid-cols-16 gap-1">
            {pattern.map((beat, index) => (
              <div
                // biome-ignore lint: Beat is a boolean
                key={index}
                className={cn(
                  "h-8 rounded border transition-all duration-100",
                  beat
                    ? "bg-beat-active border-beat-active"
                    : "bg-beat-inactive border-beat-inactive",
                  currentBeat === index && "ring-2 ring-primary-glow scale-110",
                )}
              />
            ))}
          </div>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button
            onClick={isPlaying ? onStop : onPlay}
            variant={isPlaying ? "destructive" : "default"}
            size="lg"
            className="px-8"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 mr-2" />
            ) : (
              <Play className="w-5 h-5 mr-2" />
            )}
            {isPlaying ? "Stop" : "Play"}
          </Button>
        </div>

        {/* Tempo Control */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {isHidden ? "Tempo offset(BPM)" : "Tempo (BPM)"}
            </label>
            <div className="text-xl font-mono font-bold">
              {isHidden
                ? tempoOffset.toFixed(1)
                : (tempo + tempoOffset).toFixed(1)}
            </div>
          </div>
          <OffsetSlider
            value={[tempoOffset]}
            onValueChange={(value) => onTempoOffsetChange(value[0])}
            min={-maxBpmVariation}
            max={maxBpmVariation}
            step={0.1}
            className="w-full"
          />
        </div>

        {/* Volume Control */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            <label className="text-sm font-medium">Volume</label>
          </div>
          <Slider
            value={[volume * 100]}
            onValueChange={(value) => onVolumeChange(value[0] / 100)}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
        </div>
      </div>
    </Card>
  );
};
