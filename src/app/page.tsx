import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  Code2,
  FileImage,
  Layers3,
  LockKeyhole,
  Monitor,
  PanelsTopLeft,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Wordmark, ProductMark } from "@/components/brand/ProductMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ToolkitMenu } from "@/components/landing/ToolkitMenu";
import { Preview } from "@/components/landing/Preview";
import { ToolArt } from "@/components/landing/ToolArt";
import "./landing.css";

export const metadata = {
  title: { absolute: "Unikit Studio — The web performance toolkit" },
};
const tools = [
  {
    id: "images",
    number: "01",
    category: "MEDIA",
    name: "Image Optimizer",
    description:
      "Compress, resize, and convert images with a precise before-and-after view.",
    tags: ["WebP", "AVIF", "PNG"],
  },
  {
    id: "fonts",
    number: "02",
    category: "TYPOGRAPHY",
    name: "Font Optimizer",
    description:
      "Inspect font-face rules and fine-tune how your web fonts load.",
    tags: ["CSS", "font-display"],
  },
  {
    id: "assets",
    number: "03",
    category: "INSPECTION",
    name: "Asset Analyzer",
    description:
      "Inspect file weight, dimensions, and opportunities to trim your assets.",
    tags: ["Images", "Stylesheets"],
  },
  {
    id: "audit",
    number: "04",
    category: "DIAGNOSTICS",
    name: "Website Audit",
    description:
      "Audit a public page and discover what contributes to its weight.",
    tags: ["URL", "Resources"],
  },
] as const;

export default function LandingPage() {
  return (
    <div className="studio-home" id="overview">
      <header className="studio-nav">
        <div className="studio-width nav-inner">
          <Link href="/" className="brand-link" aria-label="Unikit Studio home">
            <Wordmark />
          </Link>
          <nav className="nav-sections" aria-label="Page sections">
            <Link href="#overview" className="nav-overview">
              <i />
              Overview
            </Link>
            <ToolkitMenu />
            <Link href="#workflow">Workflow</Link>
          </nav>
          <div className="nav-actions">
            <ThemeToggle />
            <span className="nav-divider" />
            <Link href="/app" className="nav-launch">
              Open workspace <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </div>
      </header>
      <main id="main">
        <section className="studio-hero" aria-labelledby="hero-heading">
          <div className="hero-grid-decoration" aria-hidden="true" />
          <div className="studio-width hero-inner">
            <div className="hero-copy">
              <div className="hero-badge">
                <AudioLines aria-hidden="true" size={14} />
                <span>DEVELOPER PERFORMANCE TOOLKIT</span>
              </div>
              <h1 id="hero-heading">
                Less weight.
                <br />
                <span>More impact.</span>
              </h1>
              <p className="hero-description">
                Optimize images, fine-tune fonts, and audit your site in one
                privacy-first developer workspace.
              </p>
              <div className="hero-actions">
                <Link href="/app/images" className="hero-primary">
                  Start optimizing <ArrowRight aria-hidden="true" size={17} />
                </Link>
                <Link href="#toolkit" className="hero-secondary">
                  <PanelsTopLeft aria-hidden="true" size={16} />
                  Explore tools
                </Link>
              </div>
              <div className="hero-assurances">
                <span>
                  <ShieldCheck aria-hidden="true" size={15} />
                  Privacy-first
                </span>
                <i />
                <span>
                  <Layers3 aria-hidden="true" size={15} />
                  Batch processing
                </span>
                <i />
                <span>
                  <Code2 aria-hidden="true" size={15} />
                  No sign-up
                </span>
              </div>
            </div>
            <div className="preview-stage">
              <span className="preview-corner corner-tl" aria-hidden="true">
                +
              </span>
              <span className="preview-corner corner-br" aria-hidden="true">
                +
              </span>
              <Preview />
            </div>
          </div>
        </section>
        <div className="format-strip">
          <div className="studio-width format-inner">
            <span className="format-caption">
              <FileImage aria-hidden="true" size={14} />
              SUPPORTED INPUTS
            </span>
            <div className="format-names">
              {["JPEG", "PNG", "WebP", "AVIF", "GIF", "TIFF"].map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
            <Link href="#formats">
              Format guide <ArrowUpRight aria-hidden="true" size={13} />
            </Link>
          </div>
        </div>
        <section
          id="toolkit"
          className="studio-toolkit studio-width"
          aria-labelledby="toolkit-heading"
        >
          <div className="section-kicker">
            <span /> THE TOOLKIT
          </div>
          <div className="toolkit-intro">
            <div>
              <h2 id="toolkit-heading">One studio. Four focused tools.</h2>
              <p>Purpose-built utilities for a lighter, faster web.</p>
            </div>
            <Link href="/app" className="section-link">
              View workspace <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          </div>
          <div className="tool-grid">
            {tools.map((tool) => (
              <Link
                key={tool.id}
                href={`/app/${tool.id}`}
                className={`studio-tool tool-${tool.id}`}
              >
                <div className="tool-card-top">
                  <span>
                    <b>{tool.number}</b> / {tool.category}
                  </span>
                  <ArrowUpRight aria-hidden="true" size={15} />
                </div>
                <div className="tool-visual">
                  <ToolArt kind={tool.id} />
                </div>
                <div className="tool-card-body">
                  <h3>{tool.name}</h3>
                  <p>{tool.description}</p>
                  <div className="tool-tags">
                    {tool.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section className="studio-workflow studio-width" id="workflow">
          <div className="section-kicker">
            <span />
            THE WORKFLOW
          </div>
          <h2>From source to smaller.</h2>
          <div className="workflow-grid">
            {[
              {
                icon: FileImage,
                title: "Select your files",
                copy: "Drop in an image, a batch, or a stylesheet. Each tool checks what it can safely process.",
              },
              {
                icon: SlidersHorizontal,
                title: "Tune the output",
                copy: "Choose a format, set the quality, and cap dimensions without changing the aspect ratio.",
              },
              {
                icon: Check,
                title: "Compare and download",
                copy: "Inspect the output and its measured byte size. Save individual files or a batch ZIP.",
              },
            ].map((step, i) => (
              <article key={step.title}>
                <div>
                  <step.icon aria-hidden="true" size={20} />
                  <span>STEP 0{i + 1}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="studio-guide studio-width" id="formats">
          <div>
            <div className="section-kicker">
              <span />
              FIELD NOTES
            </div>
            <h2>Know your tools.</h2>
          </div>
          <div className="guide-items">
            <details>
              <summary>
                <FileImage aria-hidden="true" size={17} />
                Which formats can I optimize?
                <ChevronDown aria-hidden="true" size={16} />
              </summary>
              <p>
                Work with JPEG, PNG, WebP and AVIF images. Extended codecs can
                also read and write GIF and TIFF. Choose animated WebP or GIF to
                keep animation frames. PDF, video, audio and binary font
                compression are not supported.
              </p>
            </details>
            <details>
              <summary>
                <LockKeyhole aria-hidden="true" size={17} />
                What happens to my files?
                <ChevronDown aria-hidden="true" size={16} />
              </summary>
              <p>
                Images, font CSS, and asset inspections run in your browser by
                default. Extended codecs use temporary server memory for TIFF
                and animation. The workspace saves measurements, not your files.
                Download results before closing the tab.
              </p>
            </details>
            <details>
              <summary>
                <Monitor aria-hidden="true" size={17} />
                What do the measurements mean?
                <ChevronDown aria-hidden="true" size={16} />
              </summary>
              <p>
                Savings are the original byte length minus the output byte
                length. A smaller file is not a guarantee of faster page
                rendering. Website Audit separates document measurements from
                browser and field data.
              </p>
            </details>
          </div>
        </section>
        <div className="home-bottom-cta studio-width">
          <ProductMark size={39} />
          <div>
            <h2>Make every byte count.</h2>
            <p>Your next optimization starts here.</p>
          </div>
          <Link href="/app" className="hero-primary">
            Open workspace <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </main>
      <footer className="studio-footer">
        <div className="studio-width">
          <Link href="/" aria-label="Unikit Studio home">
            <Wordmark compact />
          </Link>
          <span>Developer tools, considered.</span>
          <a href="#overview">
            Back to top{" "}
            <ArrowDown
              aria-hidden="true"
              size={13}
              style={{ transform: "rotate(180deg)" }}
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
