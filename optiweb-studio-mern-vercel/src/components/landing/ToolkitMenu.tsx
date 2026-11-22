"use client";
import {Link} from "react-router-dom";
import { useEffect, useRef } from "react";
import { ChevronDown, FileImage, FileStack, Type, Layers3, Globe } from "lucide-react";
const links = [
  { name: "Image Optimizer", href: "/app/images", Icon: FileImage },
  { name: "PDF & PowerPoint Studio", href: "/app/documents", Icon: FileStack },
  { name: "Font Optimizer", href: "/app/fonts", Icon: Type },
  { name: "Asset Analyzer", href: "/app/assets", Icon: Layers3 },
  { name: "Website Audit", href: "/app/audit", Icon: Globe },
];
export function ToolkitMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (
        ref.current?.open &&
        e.target instanceof Node &&
        !ref.current.contains(e.target)
      )
        ref.current.open = false;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <details ref={ref} className="tool-menu">
      <summary>
        Toolkit <ChevronDown aria-hidden size={12} />
      </summary>
      <div>
        {links.map(({ name, href, Icon }) => (
          <Link
            key={href}
            to={href}
            onClick={() => {
              if (ref.current) ref.current.open = false;
            }}
          >
            <Icon size={15} aria-hidden />
            {name}
          </Link>
        ))}
        <a
          href="#toolkit"
          onClick={() => {
            if (ref.current) ref.current.open = false;
          }}
        >
          Explore all tools
        </a>
      </div>
    </details>
  );
}
