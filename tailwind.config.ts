import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
	darkMode: "class",
	content: ["./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: [
					"ui-sans-serif",
					"system-ui",
					"sans-serif",
					'"Apple Color Emoji"',
					'"Segoe UI Emoji"',
					'"Segoe UI Symbol"',
					'"Noto Color Emoji"',
				],
			},
			gridTemplateColumns: {
				"16": "repeat(16, minmax(0, 1fr))",
			},
			colors: {
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				primary: {
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-foreground))",
					glow: "hsl(var(--primary-glow))",
				},
				secondary: {
					DEFAULT: "hsl(var(--secondary))",
					foreground: "hsl(var(--secondary-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))",
				},
				success: {
					DEFAULT: "hsl(var(--success))",
					foreground: "hsl(var(--success-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))",
				},
				accent: {
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				beat: {
					active: "hsl(var(--beat-active))",
					inactive: "hsl(var(--beat-inactive))",
				},
			},
			backgroundImage: {
				"gradient-primary": "var(--gradient-primary)",
				"gradient-deck": "var(--gradient-deck)",
			},
			boxShadow: {
				deck: "var(--shadow-deck)",
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			keyframes: {
				wiggle: {
					"0%": {},
					"50%": {
						transform: "rotate(-10deg)",
					},
					"100%": {
						transform: "rotate(10deg)",
					},
				},
			},
			animation: {
				wiggle: "wiggle 0.2s ease-in-out infinite",
			},
		},
	},
	plugins: [animate],
} satisfies Config;
