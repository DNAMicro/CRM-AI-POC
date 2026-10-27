---
name: admin-portal-architect
description: >
  Architectural pattern guide for building admin portal features in Next.js with Tailwind CSS and shadcn/ui. Ensures every admin feature — data tables, CRUD forms, dashboards, navigation, settings — follows a complete specification covering component structure (file layout, naming, exports), UI patterns (spacing, states, responsive breakpoints), and accessibility (ARIA, keyboard nav, focus management). Use this skill whenever the user asks to build, plan, or add any admin portal feature, dashboard, back-office UI, internal tool, or management panel. Trigger on phrases like "add a users page", "build the settings section", "sidebar with nested menus", "dashboard with KPIs", "add CRUD for products", or any admin UI layout and navigation planning. Builds on top of the nextjs-ui-design skill as its component foundation.
---

# Admin Portal Architect

You are an architectural guide for building admin portal features. Your job is to ensure that every feature request results in a **complete, consistent specification** before any code is written. Think of this skill like a building code handbook: it defines the standards every room in the building must meet, so the finished product feels cohesive and professional regardless of which feature was built first.

This skill builds on top of the `nextjs-ui-design` skill. That skill provides the component-level implementation (DataTable files, glass design system, page patterns). This skill provides the **portal-level architecture** — how to structure features, organize files, define states, handle responsiveness, and ensure accessibility across the entire admin experience.

## When to use this skill

Use this skill as the FIRST step whenever the user asks to build any admin portal feature. Before writing a single line of code:

1. Identify which **feature pattern** applies (see Feature Catalog below)
2. Walk through the **Feature Specification Checklist** for that pattern
3. Present the specification to the user for confirmation
4. THEN invoke `nextjs-ui-design` for the component-level implementation

---

## UX Reference Points

The following open-source admin templates represent the quality bar this skill targets. They are not dependencies — they are reference points for layout density, navigation patterns, and information architecture decisions.

- **AdminLTE** — Sidebar navigation hierarchy, widget density, nested menu patterns. Study how it organizes sections (MAIN NAVIGATION, with collapsible sub-menus), how it handles sidebar badges (counts, labels), and how its content area uses box widgets with headers, toolbars, and footers.
- **TailAdmin Next.js** — Modern Tailwind + Next.js implementation. Study its spacing rhythm (consistent gap-6 between sections), its card layouts with subtle shadows, and how data-heavy pages maintain readability through whitespace.
- **Materio Next.js Admin** — Card-based dashboard layouts, stats-with-sparklines patterns, and multi-column form layouts. Study how it groups related KPIs into horizontal card rows and uses color to differentiate metric categories.

---

## Core Architecture Principles

### 1. Every feature is a "Feature Module"

A feature module is a self-contained directory under `src/app/(admin)/` that owns everything related to one domain entity or functional area. This is the fundamental organizational unit.

```
src/app/(admin)/
├── (dashboard)/              # Dashboard / home
│   └── page.tsx
├── users/                    # Feature module: Users
│   ├── page.tsx              # List page (DataTable)
│   ├── [id]/
│   │   ├── page.tsx          # Detail page
│   │   └── edit/
│   │       └── page.tsx      # Edit form
│   ├── new/
│   │   └── page.tsx          # Create form
│   └── _components/          # Feature-private components
│       ├── columns.tsx        # TanStack column definitions
│       ├── user-form.tsx      # Shared create/edit form
│       └── user-stats.tsx     # Feature-specific widgets
├── settings/                  # Feature module: Settings
│   ├── page.tsx              # General settings
│   ├── layout.tsx            # Settings sub-navigation
│   ├── profile/
│   │   └── page.tsx
│   ├── team/
│   │   └── page.tsx
│   └── billing/
│       └── page.tsx
└── layout.tsx                # Admin shell (sidebar + topbar + main)
```

**Key rules:**
- The `(admin)` route group wraps all admin pages in a shared layout (sidebar, topbar, breadcrumbs)
- Each feature module owns its own `_components/` directory for feature-private components. The underscore prefix tells Next.js this is not a route segment — it is a convention that means "this folder holds helper components only used by pages in this module"
- Shared components live in `src/components/` (the DataTable files, glass system, etc.)
- Each feature module maps 1:1 to a sidebar navigation item

### 2. Consistent file naming

| File | Purpose | Naming convention |
|------|---------|-------------------|
| `page.tsx` | Route page (Next.js convention) | Always `page.tsx` |
| `layout.tsx` | Layout wrapper | Always `layout.tsx` |
| `columns.tsx` | TanStack column definitions | Always `columns.tsx` in `_components/` |
| `{entity}-form.tsx` | Create/edit form | Kebab-case entity name + `-form` |
| `{entity}-stats.tsx` | Feature-specific widgets | Kebab-case entity name + `-stats` |
| `{entity}-filters.tsx` | Custom filter components | Kebab-case entity name + `-filters` |

### 3. Component export convention

Every component file exports exactly one named component (no default exports). The component name matches the file name in PascalCase:

```tsx
// user-form.tsx
export function UserForm({ ... }) { ... }

// columns.tsx — exception: exports an array, not a component
export const columns: ColumnDef<User>[] = [ ... ]
```

This matters because: named exports make refactoring safer (your IDE can track every usage), prevent accidental renaming on import, and make the codebase searchable — `grep UserForm` finds every file that uses it.

---

## Feature Catalog

Each pattern below is a complete specification template. When the user requests a feature, identify which pattern applies, fill in the template, and present it before writing code.

### Pattern 1: Entity List Page

**When to use:** Any page that displays a collection of entities in a table (users, orders, products, logs, etc.)

**Specification template:**

```
ENTITY LIST: [Entity Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FILE STRUCTURE
   src/app/(admin)/[entities]/
   ├── page.tsx                    # List page
   ├── _components/
   │   └── columns.tsx             # Column definitions

2. PAGE HEADER
   - Title: "[Entities]" (plural)
   - Description: one-line summary of what this list shows
   - Primary action: "Add [Entity]" button → links to /[entities]/new
   - Optional: export button, bulk action dropdown

3. TABLE COLUMNS (specify each)
   | Column       | Type      | Sortable | Filterable | Notes          |
   |-------------|-----------|----------|------------|----------------|
   | name        | text      | yes      | search     | Primary column |
   | status      | badge     | yes      | faceted    | Color-coded    |
   | created_at  | DateCell  | yes      | no         | Relative       |
   | actions     | dropdown  | no       | no         | Edit, Delete   |

4. FILTER CONFIGURATION
   - Search: which column(s) the search bar filters on
   - Faceted filters: which columns get checkbox popovers
   - Default sort: column + direction

5. EMPTY STATE
   - Heading: "No [entities] yet"
   - Description: what action to take
   - CTA button: "Add your first [entity]"

6. LOADING STATE
   - Skeleton rows: 5 rows matching column layout

7. ROW ACTIONS
   - List each action: View, Edit, Copy ID, Delete
   - Destructive actions (Delete) appear last with red text

8. RESPONSIVE BEHAVIOR
   - ≥1280px: all columns visible
   - 1024-1279px: hide [least important columns]
   - <1024px: horizontal scroll with sticky first column

9. ACCESSIBILITY
   - Table uses semantic <table> (TanStack handles this)
   - aria-sort on sortable headers
   - aria-label on action buttons ("Edit user John Smith")
   - aria-live="polite" on "X of Y rows selected" count
   - Row actions reachable via keyboard (Tab → Enter on "...")
```

### Pattern 2: Entity Detail Page

**When to use:** A page showing a single entity's full information, typically reached by clicking a row in the list.

**Specification template:**

```
ENTITY DETAIL: [Entity Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FILE STRUCTURE
   src/app/(admin)/[entities]/[id]/
   └── page.tsx

2. HEADER SECTION
   - Back link: "← Back to [entities]"
   - Entity name as h1
   - Status badge
   - Action buttons: Edit, Delete (with confirmation dialog)
   - Metadata line: "Created [date] · Updated [date]"

3. CONTENT LAYOUT
   - Tab structure: [list tabs, e.g., Overview | Activity | Related]
   - OR section stack (if no tabs): [list sections]
   - Each section: glass.panel with heading + content

4. DATA FIELDS (per section)
   | Field        | Display type | Notes                    |
   |-------------|-------------|--------------------------|
   | email       | text        | With copy button         |
   | role        | badge       | Color-coded              |
   | avatar      | image       | Fallback to initials     |

5. RELATED ENTITIES
   - If this entity has children (e.g., user has orders):
     list each related table with column subset

6. RESPONSIVE BEHAVIOR
   - ≥1024px: two-column layout (main content + sidebar)
   - <1024px: single column, sidebar content below main

7. ACCESSIBILITY
   - Heading hierarchy: h1 (entity name), h2 (section/tab names)
   - Delete confirmation: focus trapped in dialog, Escape to cancel
   - Tab panel: arrow keys switch tabs, tabpanel has role="tabpanel"
```

### Pattern 3: Create / Edit Form

**When to use:** Any page with a form for creating a new entity or editing an existing one.

**Specification template:**

```
ENTITY FORM: [Entity Name] — [Create | Edit]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FILE STRUCTURE
   src/app/(admin)/[entities]/new/page.tsx       # Create
   src/app/(admin)/[entities]/[id]/edit/page.tsx  # Edit
   src/app/(admin)/[entities]/_components/
   └── [entity]-form.tsx                          # Shared form

2. FORM SECTIONS (group related fields)
   Section: "[Section Name]"
   | Field       | Input type  | Required | Validation        |
   |------------|------------|----------|-------------------|
   | name       | text       | yes      | min 2, max 100    |
   | email      | email      | yes      | valid email       |
   | role       | select     | yes      | enum values       |
   | bio        | textarea   | no       | max 500 chars     |

3. FORM LAYOUT
   - ≥1024px: two-column grid for short fields, full-width for textareas
   - <1024px: single column stack
   - Section spacing: gap-8 between sections, gap-4 between fields

4. BUTTON BAR
   - Position: sticky bottom on mobile, inline on desktop
   - Buttons: "Cancel" (ghost) + "Save [Entity]" (primary)
   - Loading state: spinner in save button, all inputs disabled

5. VALIDATION BEHAVIOR
   - Client-side: validate on blur, show inline errors below field
   - Server-side: toast error with message, scroll to first error field
   - Error styling: red border + red helper text, field label turns red

6. EDIT MODE DIFFERENCES
   - Pre-populate all fields from existing entity
   - Show "Last saved [relative time]" in header
   - Unsaved changes: prompt on navigation away (beforeunload)

7. ACCESSIBILITY
   - Every input has a visible <label> with htmlFor
   - Required fields: aria-required="true" + visual asterisk
   - Error messages: aria-describedby linking input to error text
   - aria-invalid="true" on fields with errors
   - Form submit: Enter key in last field triggers save
   - Focus: on page load, focus first input; on error, focus first error field
```

### Pattern 4: Dashboard Page

**When to use:** The main landing page of the admin portal, showing KPIs, charts, and activity summaries.

**Specification template:**

```
DASHBOARD: [Dashboard Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FILE STRUCTURE
   src/app/(admin)/(dashboard)/
   ├── page.tsx
   └── _components/
       ├── stats-cards.tsx          # KPI row
       ├── [chart-name]-chart.tsx   # Each chart
       └── recent-[entity].tsx      # Recent activity table

2. KPI ROW (top of page)
   | Metric              | Format    | Comparison         |
   |--------------------|-----------|-------------------|
   | Total Users        | number    | +12% from last month |
   | Revenue            | currency  | +5.2% from last month |
   | Active Sessions    | number    | live updating       |
   | Open Tickets       | number    | -3 from yesterday   |

   Layout: 4 cards in a row (≥1280px), 2×2 grid (768-1279px), stack (<768px)
   Each card: glass.card, icon + label + value + comparison badge

3. CHART SECTION
   - Chart type and data description for each chart
   - Charts use a consistent color palette derived from CSS variables
   - All charts include a legend and tooltip on hover

4. RECENT ACTIVITY
   - Abbreviated table (5 rows, no pagination)
   - "View all →" link to full list page
   - Columns: subset of the full list page columns

5. RESPONSIVE BEHAVIOR
   - ≥1280px: charts side-by-side (2 columns)
   - 768-1279px: charts stacked
   - <768px: KPI cards stack, charts full-width

6. ACCESSIBILITY
   - KPI cards: each is a self-contained region with aria-label
   - Charts: provide sr-only data table alternative
   - Auto-refresh indicators: aria-live="polite" on live metrics
```

### Pattern 5: Navigation (Sidebar + Breadcrumbs)

**When to use:** Structuring the overall portal navigation, including sidebar, topbar, and breadcrumb trail.

**Specification template:**

```
NAVIGATION STRUCTURE
━━━━━━━━━━━━━━━━━━━━

1. FILE STRUCTURE
   src/components/admin-shell/
   ├── admin-layout.tsx         # Shell: sidebar + topbar + main
   ├── sidebar.tsx              # Sidebar with nav groups
   ├── sidebar-nav-item.tsx     # Individual nav item (supports nesting)
   ├── topbar.tsx               # Top bar with breadcrumbs + user menu
   └── breadcrumbs.tsx          # Auto-generated from route segments

2. SIDEBAR SECTIONS
   Section: "[SECTION LABEL]"
   | Item         | Icon        | Path            | Badge     |
   |-------------|-------------|-----------------|-----------|
   | Dashboard   | LayoutGrid  | /               | —         |
   | Users       | Users       | /users          | count     |
   | Settings    | Settings    | /settings       | —         |

3. NESTED MENUS
   - Parent items with children show a chevron (rotates on expand)
   - Children are indented 12px with a connecting line on the left
   - Expand/collapse is animated (max-height transition)
   - Active child keeps parent expanded
   - Collapsed sidebar: hover shows tooltip with item name

4. SIDEBAR BEHAVIOR
   - Expanded: 256px wide, shows icon + label + badge
   - Collapsed: 64px wide, shows icon only, hover tooltip
   - Toggle: button at bottom of sidebar, persisted to localStorage
   - Mobile (<1024px): sidebar hidden, hamburger in topbar opens Sheet

5. BREADCRUMBS
   - Auto-generated from URL segments
   - Dynamic segments (e.g., [id]) resolve to entity name, not raw ID
   - Example: Dashboard > Users > John Smith > Edit
   - Last segment is not a link (current page)
   - Separator: "/" or chevron icon

6. TOPBAR CONTENTS
   - Left: hamburger (mobile) + breadcrumbs
   - Right: command palette trigger (Cmd+K) + notifications bell + user avatar dropdown
   - User dropdown: profile link, theme toggle, sign out

7. ACCESSIBILITY
   - Sidebar: <nav aria-label="Main navigation">
   - Active item: aria-current="page"
   - Expanded/collapsed groups: aria-expanded on parent
   - Breadcrumbs: <nav aria-label="Breadcrumb"> with <ol>
   - Skip nav: first focusable element on page
   - Mobile sheet: focus trap when open, Escape to close
```

### Pattern 6: Settings Page

**When to use:** Multi-section settings or configuration pages with sub-navigation.

**Specification template:**

```
SETTINGS: [Settings Area]
━━━━━━━━━━━━━━━━━━━━━━━━━

1. FILE STRUCTURE
   src/app/(admin)/settings/
   ├── layout.tsx              # Settings shell with side-nav
   ├── page.tsx                # Redirects to first section
   ├── profile/page.tsx
   ├── team/page.tsx
   ├── billing/page.tsx
   └── notifications/page.tsx

2. SUB-NAVIGATION
   - Vertical nav on left (≥768px), horizontal tabs (<768px)
   - Items: list each section with icon
   - Active indicator: highlighted background + accent left border

3. SECTIONS (per settings page)
   Section: "[Section Name]"
   | Setting      | Control type | Description                    |
   |-------------|-------------|-------------------------------|
   | Display name | text input  | How your name appears          |
   | Theme       | toggle group| Light / Dark / System          |
   | Emails      | switch      | Receive email notifications    |

4. SAVE BEHAVIOR
   - Per-section save (not one global save button)
   - Toast confirmation on save: "Settings saved"
   - Unsaved changes indicator: dot on section nav item

5. RESPONSIVE BEHAVIOR
   - ≥768px: side-nav (200px) + content
   - <768px: horizontal tab bar above content, scrollable

6. ACCESSIBILITY
   - Settings nav: <nav aria-label="Settings">
   - Toggle switches: role="switch" with aria-checked
   - Form fields: same rules as Pattern 3 (Create / Edit Form)
   - Save toast: role="status" for screen reader announcement
```

---

## Feature Specification Checklist

Before writing code for ANY feature, walk through this checklist and produce a filled-in specification:

1. **Feature pattern identified** — which pattern from the catalog applies?
2. **File structure defined** — all files listed with their paths
3. **Component inventory** — every component this feature needs, whether new or reused
4. **All visual states documented:**
   - Default / populated
   - Empty (no data)
   - Loading (skeleton)
   - Error (failed fetch, validation)
   - Disabled (permissions, pending action)
5. **Responsive breakpoints specified:**
   - ≥1280px (large desktop)
   - 1024-1279px (desktop)
   - 768-1023px (tablet)
   - <768px (mobile)
6. **Accessibility audit:**
   - Landmark elements: `<nav>`, `<main>`, `<aside>`, `<header>`
   - Heading hierarchy: h1 → h2 → h3 (no skipped levels)
   - All interactive elements keyboard-reachable
   - ARIA attributes listed for dynamic content
   - Focus management plan (where does focus go after modal close? After delete?)
7. **Navigation integration:**
   - Where does this feature appear in the sidebar?
   - What breadcrumb trail does each page show?
   - What links connect this feature to other features?

---

## Spacing and Layout Constants

These values ensure visual consistency across every feature module. Think of them like a ruler — everyone uses the same one, so everything lines up.

| Context | Value | Tailwind class | Where used |
|---------|-------|---------------|------------|
| Page padding | 24px | `p-6` | Main content area wrapper |
| Section gap | 24px | `gap-6` or `space-y-6` | Between cards, between page sections |
| Card internal padding | 24px | `p-6` | Inside glass.panel / glass.card |
| Field gap (in forms) | 16px | `gap-4` or `space-y-4` | Between form fields |
| Section gap (in forms) | 32px | `gap-8` or `space-y-8` | Between form sections |
| Inline element gap | 8px | `gap-2` | Between icon + text, between buttons |
| Table row height | 48px min | `h-12` | DataTable rows |
| Sidebar width (expanded) | 256px | `w-64` | Sidebar |
| Sidebar width (collapsed) | 64px | `w-16` | Collapsed sidebar |
| Topbar height | 64px | `h-16` | Top bar |
| Mobile breakpoint | 1024px | `lg:` | Sidebar collapses to Sheet |
| Tablet breakpoint | 768px | `md:` | Layout switches to stacked |

---

## Integration with nextjs-ui-design skill

This skill defines WHAT to build and HOW it should be structured. The `nextjs-ui-design` skill defines HOW to implement it at the component level. The workflow is:

1. **This skill** produces the feature specification
2. **nextjs-ui-design** provides:
   - DataTable component files (all 7 files, copied not written)
   - Glass design system (CSS variables, glass constants)
   - DateCell for date columns
   - Page pattern code (detail, form, settings, empty state)

Never write DataTable components, glass styles, or page pattern code from scratch. Always pull them from `nextjs-ui-design`.
