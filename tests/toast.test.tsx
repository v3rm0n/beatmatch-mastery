import { act, cleanup, renderHook } from "@testing-library/react";
import { type ReactNode, useLayoutEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { toast, useToast } from "@/hooks/use-toast";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

it("picks up notifications published between render and subscription", () => {
	function Wrapper({ children }: { children: ReactNode }) {
		useLayoutEffect(() => {
			toast({ title: "During layout" });
		}, []);
		return children;
	}
	const { result } = renderHook(() => useToast(), { wrapper: Wrapper });
	expect(result.current.toasts[0].title).toBe("During layout");
});

it("removes dismissed notifications promptly and preserves the supplied callback", () => {
	vi.useFakeTimers();
	const onOpenChange = vi.fn();
	const { result } = renderHook(() => useToast());
	act(() => toast({ title: "Close me", onOpenChange }));
	act(() => result.current.toasts[0].onOpenChange(false));
	expect(onOpenChange).toHaveBeenCalledWith(false);
	expect(result.current.toasts[0].open).toBe(false);
	act(() => vi.advanceTimersByTime(1000));
	expect(result.current.toasts).toEqual([]);
});

it("clears a removed notification's timer when a newer one replaces it", () => {
	vi.useFakeTimers();
	const { result } = renderHook(() => useToast());
	act(() => toast({ title: "Old" }));
	const oldToast = result.current.toasts[0];
	act(() => oldToast.onOpenChange(false));
	expect(vi.getTimerCount()).toBe(1);
	act(() => toast({ title: "New" }));
	expect(vi.getTimerCount()).toBe(0);
	act(() => oldToast.onOpenChange(false));
	expect(vi.getTimerCount()).toBe(0);
	expect(result.current.toasts[0].title).toBe("New");
});
