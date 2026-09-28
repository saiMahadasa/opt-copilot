# Pathwise design record

Single source of truth for tokens, type, spacing, and visual rules.
Update here whenever a decision changes; keep code and doc in sync.

---

## Color palette

### Light mode
| Token | Hex | HSL channels | Use |
|---|---|---|---|
| Harbor blue | `#16324F` | `211 56% 20%` | Brand, headings, primary button bg |
| Teal | `#0F8B8D` | `181 81% 31%` | Accent, completed states, focus ring, stamp border |
| Paper | `#F3F6FA` | `214 42% 97%` | Page background |
| White | `#FFFFFF` | `0 0% 100%` | Surface (cards, inputs) |
| Line | `#D5DEE9` | `213 31% 87%` | Borders |
| Gold | `#E3A93B` | `39 75% 56%` | Logo accent only |

### Dark mode
| Token | Hex | HSL channels |
|---|---|---|
| Background | `#0E1E33` | `214 57% 13%` |
| Surface | `#152B45` | `213 53% 18%` |
| Line | `#2A4362` | `213 40% 27%` |
| Text | `#E7EEF6` | `212 45% 94%` |
| Teal | `#3FC1C3` | `181 52% 51%` |
| Primary button bg | teal | same as teal |

### Status colors (always with icon + word, never color alone)
| Status | Meaning | Text | Background |
|---|---|---|---|
| Ok | No action needed | teal `181 81% 31%` | teal-tint `181 40% 93%` |
| Watch | Under 30 days remaining | amber `36 100% 35%` | `42 100% 93%` |
| Over | Limit exceeded | red `3 71% 41%` | `4 90% 95%` |

Dark mode status backgrounds desaturate to avoid harsh contrast.

---

## Typography

Fonts loaded via `next/font/google`, exposed as CSS variables.

| Variable | Font | Use |
|---|---|---|
| `--font-heading` | Bricolage Grotesque | Headings h1-h3, wordmark, large dates, stamp text |
| `--font-body` | Public Sans | Body, buttons, labels, inputs |

### Type scale
| Name | Size | Line height | Letter spacing | Notes |
|---|---|---|---|---|
| caption | 13px | 1.4 | — | Metadata, footnotes |
| small | 14px | 1.5 | — | Labels, helper text |
| body | 16px | 1.55 | — | Default prose |
| h3 | 18px | 1.4 | — | Card headings |
| h2 | 22px | 1.3 | — | Section headings |
| h1 | 28px | 1.2 | — | Page headings |
| display | 40px | 1.05 | -0.01em | Stamp dates, hero numbers |

Body line length max 65ch. No all-caps labels. No small eyebrow text above headings.

---

## Spacing and radius

| Role | Radius |
|---|---|
| Hero sections | 20px |
| Panels and cards | 12px |
| Inputs and buttons | 10px |
| Pills and tags | 9999px (full) |
| Stamp outer | 14px |
| Stamp inner | 8px |

No gradient washes. No box-shadow on every card. Use borders for structure.
One subtle elevation allowed: bottom navigation and sticky input bar only.

---

## The visa stamp

Used in exactly three places:
1. The logo mark (outline only, no date)
2. The "Your next date" hero on the dashboard (full stamp with date)
3. Completed timeline steps (small stamp with month and year)

Spec:
- Outer shape: `border-radius 14px`, `border: 2px solid teal`
- Inner border: `border: 1px dashed teal`, inset 5px from outer (achieved with `padding: 5px`)
- Inner border radius: 8px
- Rotation: exactly -2 degrees (static)
- Text: display font (Bricolage Grotesque), teal
- Entrance animation (hero only, once per session): scale 1.06 → 0.97 → 1.0, 450ms cubic-bezier(0.34,1.56,0.64,1). Off when prefers-reduced-motion.

---

## Copy rules

- Sentence case everywhere. No ALL CAPS.
- Active voice: "File your I-765" not "The I-765 must be filed."
- No em dashes. Use a comma, a period, or a new sentence.
- No marketing. Describe what the thing does.
- Error messages say what went wrong and what to do next.

---

## App name

`APP_NAME = "Pathwise"` in `lib/constants.ts`. One-line change to rename.
