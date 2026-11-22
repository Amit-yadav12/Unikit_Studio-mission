"use client";
import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/storage-keys";
export type ThemeChoice = "dark" | "light" | "system";
const order: ThemeChoice[] = ["dark", "light", "system"];
let ephemeral: ThemeChoice | undefined;
function choice(): ThemeChoice {
  try {const c=window.localStorage.getItem(THEME_STORAGE_KEY)??ephemeral;return c==="light"||c==="system"?c:"dark";} catch {return ephemeral??"dark";}
}
function apply() {
  const c=choice(); const resolved=c==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):c;
  document.documentElement.dataset.theme=resolved;
  const meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])'); if(meta)meta.content=resolved==="dark"?"#090a10":"#f8f7fc";
}
function subscribe(listener:()=>void) {
  const media=window.matchMedia("(prefers-color-scheme: dark)"); const changed=()=>{apply();listener()};
  media.addEventListener("change",changed);window.addEventListener("storage",changed);window.addEventListener("unikit-themechange",changed);
  return ()=>{media.removeEventListener("change",changed);window.removeEventListener("storage",changed);window.removeEventListener("unikit-themechange",changed);};
}
export function ThemeToggle({className=""}:{className?:string}) {
  const current=useSyncExternalStore(subscribe,choice,()=>"dark" as ThemeChoice);
  const next=order[(order.indexOf(current)+1)%order.length];
  const label=`Theme: ${current}. Switch to ${next}.`; const Icon=current==="system"?Monitor:current==="light"?Sun:Moon;
  return <button type="button" className={`inline-grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface text-ink-soft hover:text-accent ${className}`} aria-label={label} title={label} onClick={()=>{ephemeral=next;try{window.localStorage.setItem(THEME_STORAGE_KEY,next)}catch{/* Browser storage disabled. */}apply();window.dispatchEvent(new Event("unikit-themechange"));}}><Icon size={16} aria-hidden/></button>;
}
