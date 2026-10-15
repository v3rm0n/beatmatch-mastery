export const generateRandomTempo = (
	baseTempo: number,
	maxBpmVariation: number,
) => {
	const min = Math.max(60, baseTempo - maxBpmVariation);
	const max = Math.min(200, baseTempo + maxBpmVariation);
	return Math.round((Math.random() * (max - min) + min) * 10) / 10;
};
