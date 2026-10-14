import { type ReactNode, useEffect, useState } from "react";
import type { ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;

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
	toasts = nextToasts;
	listeners.forEach((listener) => listener(toasts));
}

function dismiss(toastId: string) {
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
					if (!open) dismiss(id);
				},
			},
			...toasts,
		].slice(0, TOAST_LIMIT),
	);
}

function useToast() {
	const [state, setState] = useState(toasts);

	useEffect(() => {
		listeners.push(setState);
		return () => {
			const index = listeners.indexOf(setState);
			if (index > -1) listeners.splice(index, 1);
		};
	}, []);

	return { toasts: state, toast };
}

export { useToast, toast };
