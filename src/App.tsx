import { BeatmatchApp } from "@/components/BeatmatchApp";
import { Toaster } from "@/components/ui/toaster";
import { WebMidiProvider } from "@/components/WebMidiProvider";

const App = () => (
	<>
		<Toaster />
		<WebMidiProvider>
			<BeatmatchApp />
		</WebMidiProvider>
	</>
);

export default App;
