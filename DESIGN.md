---
version: alpha
name: Server Monitoring
description: A calm, elegant observability console — deep navy canvas, cyan signal, built for glance-and-go on mobile and desk.
colors:
  primary: "#0B1220"
  secondary: "#94A3B8"
  tertiary: "#22D3EE"
  neutral: "#0F172A"
  surface: "#111C30"
  surfaceRaised: "#16233B"
  border: "#1E2D45"
  text: "#E8EEF6"
  textMuted: "#8DA0BC"
  accent: "#3B82F6"
  success: "#34D399"
  warning: "#FBBF24"
  danger: "#F87171"
typography:
  h1:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  h2:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body-md:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.04em"
  mono:
    fontFamily: "JetBrains Mono"
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 8px
  md: 14px
  lg: 20px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 20px
  metric-value:
    textColor: "{colors.text}"
    typography: "{typography.h1}"
  pill-accent:
    backgroundColor: "{colors.tertiary}"
    textColor: "#06141B"
    rounded: "{rounded.full}"
    padding: 6px
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "#06141B"
    rounded: "{rounded.sm}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: 12px
  input-field:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 12px
---

## Overview

Server Monitoring is an observability console for a single self-hosted VPS. The
mood is quiet confidence: a deep navy canvas, generous breathing room, one
cyan signal color for anything live or interactive. It must read perfectly on
a phone held one-handed and on a wide desktop monitor — the same components,
fluidly reflowed. Nothing decorative competes with the data.

## Colors

- **Primary (#0B1220):** The deepest navy — app background, behind everything.
- **Neutral (#0F172A) / Surface (#111C30):** Card and panel fills, layered just
  above the canvas for soft depth without harsh borders.
- **Surface Raised (#16233B):** Hover and active states, modal sheets.
- **Tertiary / Cyan (#22D3EE):** The single signal color — live indicators,
  primary actions, active nav, sparkline strokes. Used sparingly so it always
  means "this is alive or actionable."
- **Accent (#3B82F6):** Secondary interaction (links, hover on primary buttons).
- **Success / Warning / Danger:** Reserved strictly for metric thresholds
  (CPU/RAM/disk gauges) — green calm, amber watch, red critical.
- **Text (#E8EEF6) / Text Muted (#8DA0BC):** High-contrast body text and
  secondary labels. Muted never drops below WCAG AA on surface fills.

## Typography

System UI for all UI text; native monospace for numeric metrics, IDs, timestamps, and
chat payloads where alignment matters. No remote fonts, so page load stays light. Headings are tight (-0.02em) and never
shout. Labels are small, uppercase-ish, letter-spaced for quiet section
headers.

## Layout

Mobile-first. A single fluid column on phones with a fixed bottom tab bar
(Overview · Chats · System). At >=768px the bottom bar becomes a slim left
rail and cards flow into a responsive grid (auto-fit, min 280px). Max content
width 1200px, centered. Safe-area padding respected on mobile so nothing hides
under the home indicator. Generous 16-24px gutters.

## Elevation & Depth

Depth comes from layered navy fills + a single soft shadow
(0 1px 2px rgba(0,0,0,0.4)), never from heavy glass blur. Cards sit on the
canvas like cut paper. The live pulse dot uses a subtle cyan glow ring, the
only "emissive" element.

## Shapes

Soft, modern radii: 8px on controls, 14px on cards, 20px on sheets, full pills
for status badges. No sharp corners anywhere.

## Components

- **card:** The atomic container for every metric and list. Quiet fill, soft
  shadow, 20px padding.
- **metric-value:** Big tight number, mono-tabular so digits don't jitter on
  live update.
- **pill-accent:** Live/status badge — cyan fill, dark text, full radius.
- **button-primary:** Cyan fill, dark ink; hover shifts to blue with white ink.
- **input-field:** Sunken neutral fill for the login form.

## Do's and Don'ts

- Do keep cyan rare — if everything glows, nothing signals.
- Do use mono for every number and timestamp so columns align.
- Do respect mobile safe areas and 44px minimum touch targets.
- Don't use heavy glassmorphism or purple — this brand is solid navy + cyan.
- Don't let muted text fall below AA contrast on any surface.
- Don't block the first paint on data; show skeleton cards, then fill.
