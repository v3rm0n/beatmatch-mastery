import { type ReactNode, useSyncExternalStore } from "react";
import type { ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000;

type ToasterToast = ToastProps & {
	id: string;
	title?: ReactNode;
	description?: ReactNode;
};

type Toast = Omit<ToasterToast, "id">;

let count = 0;
let toasts: ToasterToast[] = [];
const listeners: Array<(toasts: ToasterToast[]) => void> = [];
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function publish(nextToasts: ToasterToast[]) {
	const nextIds = new Set(nextToasts.map((toast) => toast.id));
	for (const [id, timeout] of toastTimeouts) {
		if (!nextIds.has(id)) {
			clearTimeout(timeout);
			toastTimeouts.delete(id);
		}
	}
	toasts = nextToasts;
	listeners.forEach((listener) => listener(toasts));
}

function dismiss(toastId: string) {
	if (!toasts.some((toast) => toast.id === toastId)) return;
	if (!toastTimeouts.has(toastId)) {
		toastTimeouts.set(
			toastId,
			setTimeout(() => {
				toastTimeouts.delete(toastId);
				publish(toasts.filter((toast) => toast.id !== toastId));
			}, TOAST_REMOVE_DELAY),
		);
	}
	publish(
		toasts.map((toast) =>
			toast.id === toastId ? { ...toast, open: false } : toast,
		),
	);
}

function toast(props: Toast) {
	count = (count + 1) % Number.MAX_SAFE_INTEGER;
	const id = count.toString();
	publish(
		[
			{
				...props,
				id,
				open: true,
				onOpenChange: (open: boolean) => {
					props.onOpenChange?.(open);
					if (!open) dismiss(id);
				},
			},
			...toasts,
		].slice(0, TOAST_LIMIT),
	);
}

function subscribe(listener: () => void) {
	const onChange = () => listener();
	listeners.push(onChange);
	return () => {
		const index = listeners.indexOf(onChange);
		if (index >= 0) listeners.splice(index, 1);
	};
}

function useToast() {
	const state = useSyncExternalStore(
		subscribe,
		() => toasts,
		() => toasts,
	);
	return { toasts: state, toast };
}

export { useToast, toast };
