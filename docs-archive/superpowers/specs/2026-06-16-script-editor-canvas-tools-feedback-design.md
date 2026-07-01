# Script Editor Canvas Tools Feedback Design

## Context

Phase 1 already moved the React/Rete script editor toward a canvas-first layout. The next adjustment addresses hands-on feedback from the running editor: the canvas still feels constrained by component/config surfaces, serial nodes expose an unrealistic free-text port field, node controls look like form cards rather than flow blocks, and basic canvas operations such as mode switching and Delete removal need to feel predictable.

## Goals

- Keep the B layout: slim left rail, large canvas, temporary right drawer.
- Let serial input/output nodes bind to the current serial/TCP panel or another existing panel without typing a COM name.
- Replace the component drawer with a tree-style draggable component library.
- Keep configurable conversion kinds as dropdowns, and avoid presenting node identity as an editable type field.
- Add a compact top-left mouse tool strip for pointer/select/pan modes.
- Improve default node placement so new nodes land in visible, spaced positions instead of piling up near the upper-left.
- Preserve right-click behavior and support `Delete` for the selected node.
- Restyle Rete nodes so they read as clean flow nodes, with calmer controls, better port spacing, and shadcn-like micro-radius.

## Design

### Serial Binding

Legacy renderer state remains the source of truth for serial/TCP panels during Phase 1. It exposes a read-only `window.getSerialPanelSummaries()` function and dispatches `saecom:serial-panels-changed` when panels are created, selected, opened, closed, hidden, or removed. React consumes this as local state in `ScriptEditorDialog`.

Serial nodes use a `panelId` select control instead of a free-text `port` control:

- `__current__` means "use the currently selected panel when the script runs".
- Existing panel ids are shown as options, with label and open/closed state.
- If there is no active panel, the select still shows `__current__`, but the inspector helper says to select a serial panel first.

The generated runtime code already runs with a context id and `send()`/`waitOnePacket()` use that context, so this UI binding is Phase 1 metadata. Later phases can route explicit `panelId` values through the script runtime if cross-panel execution is required.

### Component Tree

`NodePalette` becomes a tree list built with shadcn/Radix `Collapsible` sections inside `ScrollArea`. Categories are expandable; each node row is draggable and clickable. The active category from quick-add expands by default, but the full tree remains available in the drawer. The drawer still opens temporarily on the right and does not reserve permanent canvas width.

### Canvas Tools

The canvas gets a compact floating toolbar at the top-left using shadcn `ToggleGroup` and `Tooltip`:

- Pointer: normal node selection/connection editing.
- Select: selection-focused mode for picking nodes without opening drawers.
- Pan: changes the cursor and keeps the canvas interaction visually in pan mode.

The first implementation stores mode in UI state and uses CSS/cursor affordances. It avoids deep Rete behavior overrides that would risk connection editing in Phase 1.

### Node Placement And Coordinates

Click-add uses `getNextCanvasNodePosition(graph)`:

- First node lands at `{ x: 64, y: 72 }`, leaving room for the top-left tools.
- Later nodes are placed to the right of the current rightmost node until wrapping is needed.
- Positions snap to a simple 260 x 150 grid and avoid exact overlap.

Drag-drop still uses the pointer position. The config drawer displays read-only `X/Y` coordinates for the selected node, matching the user's request to index coordinates when opening a component.

### Selection, Delete, And Context Menu

Rete `nodepicked` continues to drive selected node state. `GraphCanvas` handles keyboard events while focused; pressing `Delete` removes the selected node through graph state and closes the config drawer if needed. Right-click is not intercepted by the new toolbar or Delete handler, so existing Rete/browser context handling remains available.

### Visual Treatment

The editor uses shadcn components where they improve interaction without adding layout weight: `Select`, `ToggleGroup`, `Tooltip`, `Collapsible`, `ScrollArea`, and `Separator`. It keeps semantic shadcn tokens and supports both light and dark through existing `:root` and `.dark` variables. Script editor CSS also treats `.theme-dark` as dark for legacy compatibility.

Buttons stay micro-rounded. Rete nodes get:

- Smaller radius and softer shadow.
- A stronger selected outline.
- Header-like title spacing.
- Compact inputs/selects that do not dominate the node.
- Better socket size and offset so nodes feel less awkward.

## Testing

Add Vitest coverage for:

- UI state default tool mode and mode switching.
- Delete selection behavior after a node is removed.
- Serial panel option building and selected panel fallback.
- Component palette grouping remaining complete for a tree drawer.
- Default add-node placement avoiding overlap and staying away from the toolbar.

Manual verification:

- Open the Electron/Vite app, click "编辑脚本".
- Switch light/dark mode and reopen the editor.
- Drag from the component tree to the canvas.
- Click-add several nodes and confirm they do not stack in the top-left.
- Double-click a node and confirm config opens with coordinates.
- Select a node, press `Delete`, and confirm it disappears.
- Right-click a node/canvas and confirm the action is not blocked.
