import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

interface OffsetSliderProps
	extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
	value?: number[];
	defaultValue?: number[];
	min?: number;
	max?: number;
}

const OffsetSlider = React.forwardRef<
	React.ElementRef<typeof SliderPrimitive.Root>,
	OffsetSliderProps
>(
	(
		{ className, value, defaultValue, min = -100, max = 100, ...props },
		ref,
	) => {
		// Calculate the center value and percentage
		const centerValue = (min + max) / 2;
		const range = max - min;
		const centerPercentage = ((centerValue - min) / range) * 100;

		// Get current value (handle both controlled and uncontrolled)
		const currentValue = value?.[0] ?? defaultValue?.[0] ?? centerValue;
		const currentPercentage = ((currentValue - min) / range) * 100;

		// Calculate range position and width
		const rangeLeft = Math.min(centerPercentage, currentPercentage);
		const rangeWidth = Math.abs(currentPercentage - centerPercentage);

		return (
			<SliderPrimitive.Root
				ref={ref}
				className={cn(
					"relative flex w-full touch-none select-none items-center",
					className,
				)}
				value={value}
				defaultValue={defaultValue}
				min={min}
				max={max}
				{...props}
			>
				<SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
					{/* Hide the default range */}
					<SliderPrimitive.Range className="absolute h-full bg-transparent" />

					{/* Custom center-out range */}
					<div
						className="absolute h-full bg-primary"
						style={{
							left: `${rangeLeft}%`,
							width: `${rangeWidth}%`,
						}}
					/>
				</SliderPrimitive.Track>

				<SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
			</SliderPrimitive.Root>
		);
	},
);

OffsetSlider.displayName = SliderPrimitive.Root.displayName;

export { OffsetSlider };
