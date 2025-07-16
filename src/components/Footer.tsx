import { Github } from "lucide-react";

export const Footer = () => {
	return (
		<footer className="mt-12 py-6 border-t border-border bg-muted/30">
			<div>
				<div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
					<div className="flex items-center gap-2">
						<a
							href="https://github.com/v3rm0n/beatmatch-mastery"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
						>
							<Github className="w-4 h-4" />
						</a>
					</div>
				</div>
			</div>
		</footer>
	);
};
