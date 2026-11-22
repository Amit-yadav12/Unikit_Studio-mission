# Unikit Studio — visual system

Dark navy surfaces, white typography and restrained violet/indigo actions. `src/app/globals.css` contains shared semantic tokens; `landing.css` styles the public introduction. The interactive comparison displays two real files with matching dimensions. The circuit-U SVG is the source for the brand assets.

## Measured text contrast

WCAG relative luminance, calculated from the current declared token values; this is not a full WCAG certification.

| Pair | Light | Dark |
| --- | --- | --- |
| `ink` / `surface` | 16.56:1 | 16.60:1 |
| `ink-soft` / `canvas` | 9.16:1 | 12.45:1 |
| `muted` / `surface` | 6.03:1 | 7.76:1 |
| `muted` / `surface-sunken` | 5.28:1 | 7.60:1 |
| `accent` / `surface` | 6.03:1 | 7.63:1 |
| `accent-hover` / `accent-soft` | 6.28:1 | 8.26:1 |
| `ok` / `ok-soft` | 6.21:1 | 7.63:1 |
| `warn` / `warn-soft` | 5.56:1 | 7.29:1 |
| `danger` / `danger-soft` | 6.15:1 | 7.11:1 |

## Appearance and motion

Dark is the first-visit default. Explicit light/dark choices persist; the System choice tracks live OS changes. An inline head bootstrap applies the palette before hydration. No analytics are used. Both OS reduced motion and the workspace motion preference suppress nonessential animation. Focus rings remain visible. The image comparison responds to arrow keys as well as mouse/touch.
