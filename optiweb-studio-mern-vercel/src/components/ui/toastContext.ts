import { createContext } from "react";
import type { Tone } from "@/lib/status";

type Toast = { id: string; tone: Tone; title: string; description?: string };
export type ToastContextValue = { push: (toast: Omit<Toast, "id">) => void };
export const ToastContext = createContext<ToastContextValue | null>(null);
